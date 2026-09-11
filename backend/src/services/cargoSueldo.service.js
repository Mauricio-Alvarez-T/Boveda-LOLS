/**
 * Parámetros de sueldo por cargo (plan Gestiones B3, mig 111).
 *
 * Reglas (docs/reglas/rrhh-trabajadores.md § Sueldo por cargo):
 *  - Tabla propia `cargo_sueldos` 1:1 con `cargos`: los montos NUNCA salen por /api/cargos
 *    (lo consume terreno). El único camino es /api/cargo-sueldos con `cargos.sueldo.*`.
 *  - `upsert` es transaccional (FOR UPDATE sobre el cargo y su fila de sueldo) y escribe en
 *    `cargo_sueldos_historial` SOLO si cambió algún monto (append-only, quién/cuándo).
 *  - Los montos se devuelven como Number (INT UNSIGNED; el pool no usa decimalNumbers).
 *  - El log de actividad NO lleva cifras: el logger global excluye /api/cargo-sueldos y el
 *    log manual registra solo `evento`, cargo y si cambiaron montos.
 *  - Degradación: si la migración 111 aún no corrió (errno 1146), `listar` devuelve los
 *    cargos con `sueldo: null` y `getPorCargo` devuelve null (regla D-I).
 */
const db = require('../config/db');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');

const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });
const TABLA_NO_EXISTE = 1146;

const toInt = (v, fallback = 0) => {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};
const strOrNull = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

/** Normaliza una fila de cargo_sueldos (+ joins) a la forma pública. */
function fila(r) {
    if (!r || r.id == null) return null;
    return {
        id: r.id,
        cargo_id: r.cargo_id,
        cargo_nombre: r.cargo_nombre ?? undefined,
        sueldo_base: toInt(r.sueldo_base),
        bono_colacion: toInt(r.bono_colacion),
        bono_movilizacion: toInt(r.bono_movilizacion),
        observaciones: r.observaciones ?? null,
        actualizado_por: r.actualizado_por ?? null,
        actualizado_por_nombre: r.actualizado_por_nombre ?? null,
        updated_at: r.updated_at ?? null,
    };
}

const SELECT_SUELDO = `
    SELECT s.id, s.cargo_id, c.nombre AS cargo_nombre, s.sueldo_base, s.bono_colacion, s.bono_movilizacion,
           s.observaciones, s.actualizado_por, u.nombre AS actualizado_por_nombre, s.updated_at
    FROM cargo_sueldos s
    JOIN cargos c ON c.id = s.cargo_id
    LEFT JOIN usuarios u ON u.id = s.actualizado_por`;

const cargoSueldoService = {
    /**
     * Todos los cargos activos con su sueldo (o `sueldo: null` si no está configurado).
     * @returns {Promise<Array<{cargo_id:number, cargo_nombre:string, sueldo: object|null}>>}
     */
    async listar() {
        try {
            const [rows] = await db.query(`
                SELECT c.id AS cargo_id, c.nombre AS cargo_nombre,
                       s.id, s.sueldo_base, s.bono_colacion, s.bono_movilizacion, s.observaciones,
                       s.actualizado_por, u.nombre AS actualizado_por_nombre, s.updated_at
                FROM cargos c
                LEFT JOIN cargo_sueldos s ON s.cargo_id = c.id
                LEFT JOIN usuarios u ON u.id = s.actualizado_por
                WHERE c.activo = 1
                ORDER BY c.nombre ASC`);
            return rows.map(r => ({
                cargo_id: r.cargo_id,
                cargo_nombre: r.cargo_nombre,
                sueldo: fila({ ...r, cargo_id: r.cargo_id }),
            }));
        } catch (err) {
            if (err.errno !== TABLA_NO_EXISTE) throw err;
            logger.warn('cargo_sueldos no existe aún (mig 111 pendiente): listado sin sueldos');
            const [cargos] = await db.query('SELECT id AS cargo_id, nombre AS cargo_nombre FROM cargos WHERE activo = 1 ORDER BY nombre ASC');
            return cargos.map(c => ({ ...c, sueldo: null }));
        }
    },

    /**
     * Sueldo vigente de UN cargo. `conn` opcional para leer dentro de una transacción
     * (B5: el contrato congela estos montos al emitirse).
     * @returns {Promise<object|null>} null si no está configurado o la tabla no existe.
     */
    async getPorCargo(cargoId, conn = db) {
        try {
            const [rows] = await conn.query(`${SELECT_SUELDO} WHERE s.cargo_id = ?`, [cargoId]);
            return fila(rows[0]);
        } catch (err) {
            if (err.errno !== TABLA_NO_EXISTE) throw err;
            return null;
        }
    },

    /** Últimos 50 cambios de montos del cargo (más reciente primero). */
    async historial(cargoId) {
        try {
            const [rows] = await db.query(`
                SELECT h.id, h.cargo_id, h.sueldo_base, h.bono_colacion, h.bono_movilizacion, h.observaciones,
                       h.cambiado_por, u.nombre AS cambiado_por_nombre, h.cambiado_en
                FROM cargo_sueldos_historial h
                LEFT JOIN usuarios u ON u.id = h.cambiado_por
                WHERE h.cargo_id = ?
                ORDER BY h.cambiado_en DESC, h.id DESC
                LIMIT 50`, [cargoId]);
            return rows.map(r => ({
                ...r,
                sueldo_base: toInt(r.sueldo_base),
                bono_colacion: toInt(r.bono_colacion),
                bono_movilizacion: toInt(r.bono_movilizacion),
            }));
        } catch (err) {
            if (err.errno !== TABLA_NO_EXISTE) throw err;
            return [];
        }
    },

    /**
     * Crea o actualiza los parámetros del cargo. Transacción: lock del cargo (404 si no
     * existe) y de su fila de sueldo; INSERT … ON DUPLICATE KEY UPDATE; historial solo si
     * cambió algún monto. Log manual post-commit SIN cifras.
     */
    async upsert(cargoId, body = {}, userId, req = null) {
        const id = Number(cargoId);
        if (!Number.isInteger(id) || id <= 0) throw httpError('Cargo inválido', 400);

        const conn = await db.getConnection();
        let cargoNombre, cambioMontos, esNuevo;
        try {
            await conn.beginTransaction();

            const [cargos] = await conn.query('SELECT id, nombre, activo FROM cargos WHERE id = ? FOR UPDATE', [id]);
            if (!cargos.length) throw httpError('Cargo no encontrado', 404);
            cargoNombre = cargos[0].nombre;

            const [prevRows] = await conn.query('SELECT * FROM cargo_sueldos WHERE cargo_id = ? FOR UPDATE', [id]);
            const prev = prevRows[0] || null;
            esNuevo = !prev;

            const valores = {
                sueldo_base: toInt(body.sueldo_base, prev ? toInt(prev.sueldo_base) : 0),
                bono_colacion: toInt(body.bono_colacion, prev ? toInt(prev.bono_colacion) : 0),
                bono_movilizacion: toInt(body.bono_movilizacion, prev ? toInt(prev.bono_movilizacion) : 0),
                observaciones: body.observaciones === undefined ? (prev ? prev.observaciones : null) : strOrNull(body.observaciones),
            };
            if (valores.sueldo_base < 0 || valores.bono_colacion < 0 || valores.bono_movilizacion < 0) {
                throw httpError('Los montos no pueden ser negativos', 400);
            }

            cambioMontos = !prev
                || toInt(prev.sueldo_base) !== valores.sueldo_base
                || toInt(prev.bono_colacion) !== valores.bono_colacion
                || toInt(prev.bono_movilizacion) !== valores.bono_movilizacion;

            await conn.query(
                `INSERT INTO cargo_sueldos (cargo_id, sueldo_base, bono_colacion, bono_movilizacion, observaciones, actualizado_por)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   sueldo_base = VALUES(sueldo_base), bono_colacion = VALUES(bono_colacion),
                   bono_movilizacion = VALUES(bono_movilizacion), observaciones = VALUES(observaciones),
                   actualizado_por = VALUES(actualizado_por)`,
                [id, valores.sueldo_base, valores.bono_colacion, valores.bono_movilizacion, valores.observaciones, userId ?? null]
            );

            if (cambioMontos) {
                await conn.query(
                    `INSERT INTO cargo_sueldos_historial (cargo_id, sueldo_base, bono_colacion, bono_movilizacion, observaciones, cambiado_por)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, valores.sueldo_base, valores.bono_colacion, valores.bono_movilizacion, valores.observaciones, userId ?? null]
                );
            }

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        // Post-commit, sin montos (logs_actividad lo ve cualquier usuario con sistema.logs.ver).
        try {
            await logManualActivity(
                userId, 'cargo-sueldos', esNuevo ? 'CREATE' : 'UPDATE', id,
                JSON.stringify({ evento: 'sueldo_cargo_actualizado', cargo: cargoNombre, cambio_montos: cambioMontos }),
                req, { entidad_tipo: 'cargo', entidad_label: cargoNombre }
            );
        } catch (e) {
            logger.warn('No se pudo registrar el log de sueldo por cargo', { err: e.message });
        }

        return this.getPorCargo(id);
    },
};

module.exports = cargoSueldoService;

const db = require('../config/db');

/**
 * Service: Sábados Extra (Trabajo Extraordinario)
 *
 * Maneja citaciones y asistencia de trabajos extraordinarios en sábado.
 * Aislado del flujo de asistencia regular: usa tablas propias
 * (sabados_extra, sabados_extra_trabajadores) creadas en migración 038.
 *
 * Flujo:
 *   1. POST   /sabados-extra              → crearCitacion
 *   2. PUT    /sabados-extra/:id/citacion  → editarCitacion (antes del día)
 *   3. PUT    /sabados-extra/:id/asistencia → registrarAsistencia (el día)
 *   4. DELETE /sabados-extra/:id           → cancelar (soft delete)
 *
 * Auditoría (migración 040): todas las transiciones de estado usan
 * SELECT ... FOR UPDATE para prevenir race conditions, y la columna
 * `estado` en sabados_extra_trabajadores se mantiene sincronizada con
 * `asistio` para soportar soft delete sin perder histórico.
 */

const SATURDAY = 6; // Date.getDay(): dom=0, lun=1, ..., sab=6
const ONE_YEAR_DAYS = 365;
const MAX_TRABAJADORES_POR_CITACION = 500;

const VALID_HORAS = (h) => h !== null && h !== undefined && Number(h) >= 0 && Number(h) <= 24;

/**
 * Acepta números o strings con coma o punto decimal (`'5,5'` → 5.5).
 * Retorna NaN si no se puede parsear — el caller debe validar con VALID_HORAS.
 */
function parseHoras(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return raw;
    if (typeof raw !== 'string') return NaN;
    return parseFloat(raw.replace(',', '.'));
}

function err400(message) { const e = new Error(message); e.statusCode = 400; return e; }
function err404(message) { const e = new Error(message); e.statusCode = 404; return e; }
function err409(message) { const e = new Error(message); e.statusCode = 409; return e; }

/**
 * Valida que la fecha sea sábado, no esté en el pasado, ni más allá de 1 año.
 * Lanza 400 con mensaje específico.
 */
function validarFechaSabado(fecha) {
    const dateObj = new Date(fecha + 'T12:00:00');
    if (Number.isNaN(dateObj.getTime())) throw err400('Fecha inválida');
    if (dateObj.getDay() !== SATURDAY) throw err400('La fecha debe ser sábado');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dateOnly = new Date(fecha + 'T00:00:00');
    if (dateOnly < today) throw err400('No se permite fecha pasada');

    const max = new Date(today); max.setDate(max.getDate() + ONE_YEAR_DAYS);
    if (dateOnly > max) throw err400('Fecha demasiado lejana (máx 1 año)');
}

/**
 * Verifica si la fecha coincide con un feriado activo. Si coincide y el
 * usuario no marcó `acepta_feriado`, lanza 409 — la UI debe pedir confirmación.
 */
async function validarFeriado(conn, fecha, aceptaFeriado) {
    const [rows] = await conn.query(
        'SELECT id, nombre FROM feriados WHERE fecha = ? AND activo = 1 LIMIT 1',
        [fecha]
    );
    if (rows.length > 0 && !aceptaFeriado) {
        throw err409(`El sábado ${fecha} coincide con feriado: ${rows[0].nombre}. Confirme con el flag acepta_feriado.`);
    }
}

/**
 * Valida que la obra esté activa y todos los trabajadores también.
 * Lanza 400 con detalle de los IDs problemáticos.
 */
async function validarObraYTrabajadores(conn, obra_id, trabajadores) {
    const [obraRows] = await conn.query(
        'SELECT id, activa FROM obras WHERE id = ? LIMIT 1',
        [obra_id]
    );
    if (obraRows.length === 0) throw err400('Obra no encontrada');
    if (!obraRows[0].activa) throw err400('No se permite citar para una obra inactiva');

    const ids = (trabajadores || []).map(t => t.trabajador_id).filter(Boolean);
    if (ids.length === 0) return;

    const [trbs] = await conn.query(
        'SELECT id, fecha_desvinculacion, activo FROM trabajadores WHERE id IN (?)',
        [ids]
    );
    const found = new Set(trbs.map(t => t.id));
    const missing = ids.filter(id => !found.has(id));
    if (missing.length > 0) {
        throw err400(`Trabajadores no encontrados: ${missing.join(',')}`);
    }
    const inactivos = trbs.filter(t => !t.activo || t.fecha_desvinculacion);
    if (inactivos.length > 0) {
        throw err400(`Trabajadores inactivos o finiquitados: ${inactivos.map(t => t.id).join(',')}`);
    }
}

const sabadosExtraService = {

    /**
     * Listado mensual de citaciones (filtro por obra opcional).
     * Retorna info resumen + conteos para badges.
     *
     * Sprint 2 fix N+1: usa LEFT JOIN + GROUP BY en lugar de subqueries
     * correlacionadas. Filtra por rango de fecha plano (BETWEEN) en vez de
     * MONTH/YEAR para que el índice idx_fecha sea utilizable.
     */
    async listar({ obra_id, mes, anio }) {
        const conds = [];
        const params = [];
        if (obra_id) { conds.push('s.obra_id = ?'); params.push(obra_id); }
        if (mes && anio) {
            const m = Number(mes), y = Number(anio);
            const desde = `${y}-${String(m).padStart(2, '0')}-01`;
            const hastaDate = new Date(y, m, 0); // último día del mes (m es 1-12)
            const hasta = `${y}-${String(m).padStart(2, '0')}-${String(hastaDate.getDate()).padStart(2, '0')}`;
            conds.push('s.fecha BETWEEN ? AND ?');
            params.push(desde, hasta);
        }
        const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const [rows] = await db.query(`
            SELECT
                s.id, s.obra_id, s.fecha, s.estado, s.horas_default,
                s.observaciones_globales, s.creado_por, s.created_at,
                o.nombre AS obra_nombre,
                u.nombre AS creado_por_nombre,
                COUNT(DISTINCT CASE WHEN t.estado != 'cancelado' THEN t.id END)              AS total_citados,
                COUNT(DISTINCT CASE WHEN t.estado = 'asistio'   THEN t.id END)               AS total_asistio,
                COUNT(DISTINCT CASE WHEN t.estado = 'no_asistio' THEN t.id END)              AS total_no_asistio
            FROM sabados_extra s
            JOIN obras o ON o.id = s.obra_id
            LEFT JOIN usuarios u ON u.id = s.creado_por
            LEFT JOIN sabados_extra_trabajadores t ON t.sabado_id = s.id
            ${whereSql}
            GROUP BY s.id
            ORDER BY s.fecha DESC, s.id DESC
        `, params);

        return rows;
    },

    /**
     * Detalle: cabecera + array de trabajadores con datos enriquecidos.
     */
    async getDetalle(id) {
        const [headers] = await db.query(`
            SELECT
                s.*,
                o.nombre AS obra_nombre,
                u.nombre AS creado_por_nombre
            FROM sabados_extra s
            JOIN obras o ON o.id = s.obra_id
            LEFT JOIN usuarios u ON u.id = s.creado_por
            WHERE s.id = ?
        `, [id]);

        if (headers.length === 0) throw err404('Citación no encontrada');

        const cabecera = headers[0];

        // Parse JSON observaciones_por_cargo si viene como string (algunos drivers)
        if (typeof cabecera.observaciones_por_cargo === 'string') {
            try { cabecera.observaciones_por_cargo = JSON.parse(cabecera.observaciones_por_cargo); }
            catch { cabecera.observaciones_por_cargo = null; }
        }

        const [trabajadores] = await db.query(`
            SELECT
                t.id, t.sabado_id, t.trabajador_id, t.obra_origen_id,
                t.citado, t.asistio, t.estado, t.horas_trabajadas, t.observacion,
                w.rut, w.nombres, w.apellido_paterno, w.apellido_materno,
                w.cargo_id, c.nombre AS cargo_nombre,
                oo.nombre AS obra_origen_nombre
            FROM sabados_extra_trabajadores t
            JOIN trabajadores w ON w.id = t.trabajador_id
            LEFT JOIN cargos c ON c.id = w.cargo_id
            LEFT JOIN obras oo ON oo.id = t.obra_origen_id
            WHERE t.sabado_id = ?
            ORDER BY c.nombre, w.apellido_paterno, w.nombres
        `, [id]);

        cabecera.trabajadores = trabajadores;
        return cabecera;
    },

    /**
     * Crea una nueva citación con su lista inicial de trabajadores.
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre la combinación (obra,fecha)
     * dentro de la transacción evita que dos super-admins creen la misma
     * citación simultáneamente. UNIQUE constraint sigue como red de seguridad
     * (mapea ER_DUP_ENTRY a 409).
     *
     * Validaciones: fecha (sábado, no pasada, ≤ 1 año), feriado opt-in,
     * obra activa, trabajadores activos, mínimo 1 trabajador, máximo 500.
     */
    async crearCitacion(payload, userId) {
        const { obra_id, fecha, observaciones_globales, observaciones_por_cargo, horas_default, trabajadores, acepta_feriado } = payload;

        if (!obra_id || !fecha) throw err400('obra_id y fecha son requeridos');
        validarFechaSabado(fecha);

        if (!Array.isArray(trabajadores) || trabajadores.length === 0) {
            throw err400('La citación debe tener al menos 1 trabajador');
        }
        if (trabajadores.length > MAX_TRABAJADORES_POR_CITACION) {
            throw err400(`Demasiados trabajadores (máx ${MAX_TRABAJADORES_POR_CITACION})`);
        }

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            throw err400('horas_default debe estar entre 0 y 24');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Lock pesimista contra (obra,fecha) para prevenir creaciones simultáneas
            await conn.query(
                'SELECT id FROM sabados_extra WHERE obra_id = ? AND fecha = ? FOR UPDATE',
                [obra_id, fecha]
            );

            await validarFeriado(conn, fecha, acepta_feriado);
            await validarObraYTrabajadores(conn, obra_id, trabajadores);

            const obsJson = observaciones_por_cargo ? JSON.stringify(observaciones_por_cargo) : null;
            let insertResult;
            try {
                [insertResult] = await conn.query(
                    `INSERT INTO sabados_extra
                        (obra_id, fecha, observaciones_globales, observaciones_por_cargo, horas_default, estado, creado_por, actualizado_por)
                     VALUES (?, ?, ?, ?, ?, 'citada', ?, ?)`,
                    [obra_id, fecha, observaciones_globales || null, obsJson, horas_default || null, userId, userId]
                );
            } catch (errIns) {
                if (errIns && errIns.code === 'ER_DUP_ENTRY') {
                    throw err409('Ya existe una citación para esta obra y fecha');
                }
                throw errIns;
            }

            const sabadoId = insertResult.insertId;

            const values = trabajadores.map(t => [
                sabadoId,
                t.trabajador_id,
                t.obra_origen_id || null,
                1,
                'citado',
                userId,
            ]);
            await conn.query(
                `INSERT INTO sabados_extra_trabajadores
                    (sabado_id, trabajador_id, obra_origen_id, citado, estado, actualizado_por)
                 VALUES ?`,
                [values]
            );

            await conn.commit();
            return { id: sabadoId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Edita citación: reemplaza la lista de trabajadores y observaciones.
     * Solo permitido en estado 'citada'.
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre la fila evita que dos
     * editores entren simultáneamente (uno editando mientras otro registra
     * asistencia, por ejemplo).
     */
    async editarCitacion(id, payload, userId) {
        const { observaciones_globales, observaciones_por_cargo, horas_default, trabajadores, acepta_feriado } = payload;

        if (!Array.isArray(trabajadores) || trabajadores.length === 0) {
            throw err400('La citación debe tener al menos 1 trabajador');
        }
        if (trabajadores.length > MAX_TRABAJADORES_POR_CITACION) {
            throw err400(`Demasiados trabajadores (máx ${MAX_TRABAJADORES_POR_CITACION})`);
        }

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            throw err400('horas_default debe estar entre 0 y 24');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado, obra_id, fecha FROM sabados_extra WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Citación no encontrada');
            if (headers[0].estado !== 'citada') {
                throw err409('Solo se pueden editar citaciones en estado "citada"');
            }

            // Re-valida feriado (opt-in) si la fecha sigue siendo feriado
            await validarFeriado(conn, headers[0].fecha, acepta_feriado);
            await validarObraYTrabajadores(conn, headers[0].obra_id, trabajadores);

            const obsJson = observaciones_por_cargo ? JSON.stringify(observaciones_por_cargo) : null;
            await conn.query(
                `UPDATE sabados_extra
                 SET observaciones_globales = ?, observaciones_por_cargo = ?, horas_default = ?, actualizado_por = ?
                 WHERE id = ?`,
                [observaciones_globales || null, obsJson, horas_default || null, userId, id]
            );

            // Estrategia: eliminar todos los citados y reinsertar.
            // Como estado=='citada' garantizado, no hay datos de asistencia que perder.
            await conn.query('DELETE FROM sabados_extra_trabajadores WHERE sabado_id = ?', [id]);

            const values = trabajadores.map(t => [id, t.trabajador_id, t.obra_origen_id || null, 1, 'citado', userId]);
            await conn.query(
                `INSERT INTO sabados_extra_trabajadores
                    (sabado_id, trabajador_id, obra_origen_id, citado, estado, actualizado_por)
                 VALUES ?`,
                [values]
            );

            await conn.commit();
            return { id };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Registra asistencia el día sábado: marca asistio + horas + observacion
     * por trabajador. Acepta nuevos no-citados (citado=0).
     * Cambia estado de 'citada' a 'realizada'.
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre la cabecera evita que dos
     * registros simultáneos sobrescriban valores el uno del otro.
     */
    async registrarAsistencia(id, payload, userId) {
        const { horas_default, observaciones_globales, trabajadores } = payload;

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            throw err400('horas_default debe estar entre 0 y 24');
        }

        // Validar y normalizar horas individuales (acepta coma decimal)
        const normalizados = (trabajadores || []).map(t => {
            const horas = parseHoras(t.horas_trabajadas);
            if (t.horas_trabajadas !== null && t.horas_trabajadas !== undefined && !VALID_HORAS(horas)) {
                throw err400(`Horas trabajadas inválidas para trabajador ${t.trabajador_id} (debe estar entre 0 y 24)`);
            }
            return { ...t, horas_trabajadas: horas };
        });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado FROM sabados_extra WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Citación no encontrada');
            if (headers[0].estado === 'cancelada') {
                throw err409('No se puede registrar asistencia en una citación cancelada');
            }

            // Update cabecera
            await conn.query(
                `UPDATE sabados_extra
                 SET horas_default = ?, observaciones_globales = ?,
                     estado = 'realizada', actualizado_por = ?
                 WHERE id = ?`,
                [horas_default || null, observaciones_globales || null, userId, id]
            );

            // Cargar trabajadores actuales para saber cuáles existen ya
            const [existing] = await conn.query(
                'SELECT trabajador_id FROM sabados_extra_trabajadores WHERE sabado_id = ?',
                [id]
            );
            const existingSet = new Set(existing.map(r => r.trabajador_id));

            for (const t of normalizados) {
                const asistio = t.asistio === undefined ? null : (t.asistio ? 1 : 0);
                const estadoTrb =
                    asistio === 1 ? 'asistio' :
                    asistio === 0 ? 'no_asistio' :
                                    'citado';

                if (existingSet.has(t.trabajador_id)) {
                    await conn.query(
                        `UPDATE sabados_extra_trabajadores
                         SET asistio = ?, horas_trabajadas = ?, observacion = ?, estado = ?, actualizado_por = ?
                         WHERE sabado_id = ? AND trabajador_id = ?`,
                        [
                            asistio,
                            t.horas_trabajadas ?? null,
                            t.observacion || null,
                            estadoTrb,
                            userId,
                            id,
                            t.trabajador_id,
                        ]
                    );
                } else {
                    await conn.query(
                        `INSERT INTO sabados_extra_trabajadores
                            (sabado_id, trabajador_id, obra_origen_id, citado, asistio, horas_trabajadas, observacion, estado, actualizado_por)
                         VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?)`,
                        [
                            id,
                            t.trabajador_id,
                            t.obra_origen_id || null,
                            asistio,
                            t.horas_trabajadas ?? null,
                            t.observacion || null,
                            estadoTrb,
                            userId,
                        ]
                    );
                }
            }

            await conn.commit();
            return { id };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Soft delete: marca cabecera como 'cancelada' y trabajadores como
     * 'cancelado'. Preserva auditoría completa (no DELETE).
     *
     * Concurrencia: SELECT ... FOR UPDATE evita doble cancelación o que
     * alguien edite/registre asistencia justo cuando otro cancela.
     */
    async cancelar(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado FROM sabados_extra WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Citación no encontrada');
            if (headers[0].estado === 'cancelada') {
                await conn.commit();
                return { id }; // idempotente
            }

            await conn.query(
                `UPDATE sabados_extra SET estado = 'cancelada', actualizado_por = ? WHERE id = ?`,
                [userId, id]
            );
            await conn.query(
                `UPDATE sabados_extra_trabajadores
                 SET estado = 'cancelado', actualizado_por = ?
                 WHERE sabado_id = ? AND estado != 'cancelado'`,
                [userId, id]
            );

            await conn.commit();
            return { id };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },
};

module.exports = sabadosExtraService;
module.exports._internal = { parseHoras, validarFechaSabado, validarFeriado, validarObraYTrabajadores };

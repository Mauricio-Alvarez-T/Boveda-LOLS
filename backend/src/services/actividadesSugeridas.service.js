const db = require('../config/db');

/**
 * Service: Lista de trabajadores en actividades sugeridas
 *
 * Una LISTA agrupa, por obra y por SEMANA (lunes a viernes), a los trabajadores
 * asignados a actividades sugeridas y después registra quién asistió. Se envía
 * por WhatsApp desde el frontend. Aislado del flujo de asistencia regular: usa
 * tablas propias (actividades_sugeridas, actividades_sugeridas_trabajadores —
 * migraciones 038/040, renombradas en la 116).
 *
 * Decisión de jefatura (2026-09-21): la lista NO fija un día. La semana se
 * identifica por su LUNES en la columna `semana` (DATE). Una lista por obra y
 * semana.
 *
 * Flujo:
 *   1. POST   /actividades-sugeridas                 → crearLista
 *   2. PUT    /actividades-sugeridas/:id/lista       → editarLista (estado 'citada')
 *   3. PUT    /actividades-sugeridas/:id/asistencia  → registrarAsistencia
 *   4. DELETE /actividades-sugeridas/:id             → cancelar (soft delete)
 *
 * Auditoría (migración 040): todas las transiciones de estado usan
 * SELECT ... FOR UPDATE para prevenir race conditions, y la columna `estado`
 * del detalle se mantiene sincronizada con `asistio` para soportar soft delete
 * sin perder histórico. Los valores del ENUM (citada/realizada/cancelada,
 * citado/asistio/no_asistio/cancelado) se conservan; en la UI se rotulan
 * Creada / Realizada / Cancelada.
 */

const MONDAY = 1; // Date.getDay(): dom=0, lun=1, ..., sab=6
const ONE_YEAR_DAYS = 365;
const MAX_TRABAJADORES_POR_LISTA = 500;

// Sin horas (jefatura 2026-08-17): solo se registra asistió / no asistió.
// Las columnas horas_default/horas_trabajadas quedan muertas en BD.

function err400(message) { const e = new Error(message); e.statusCode = 400; return e; }
function err404(message) { const e = new Error(message); e.statusCode = 404; return e; }
function err409(message) { const e = new Error(message); e.statusCode = 409; return e; }

/** Lunes (00:00 local) de la semana que contiene `d`. */
function lunesDeSemana(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
}

/**
 * Valida la semana de una lista: llega como su LUNES (YYYY-MM-DD),
 * no puede ser anterior a la semana en curso (el viernes aún se puede crear la
 * lista de esa misma semana) ni más allá de 1 año. Lanza 400 con mensaje específico.
 */
function validarSemana(semana) {
    const dateObj = new Date(semana + 'T12:00:00');
    if (Number.isNaN(dateObj.getTime())) throw err400('Semana inválida');
    if (dateObj.getDay() !== MONDAY) throw err400('La semana debe indicarse por su lunes');

    const lunesActual = lunesDeSemana(new Date());
    const semanaOnly = new Date(semana + 'T00:00:00');
    if (semanaOnly < lunesActual) throw err400('No se permite una semana pasada');

    const max = new Date(lunesActual); max.setDate(max.getDate() + ONE_YEAR_DAYS);
    if (semanaOnly > max) throw err400('Semana demasiado lejana (máx 1 año)');
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
    if (!obraRows[0].activa) throw err400('No se permite armar una lista para una obra inactiva');

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

function validarTrabajadoresLista(trabajadores) {
    if (!Array.isArray(trabajadores) || trabajadores.length === 0) {
        throw err400('La lista debe tener al menos 1 trabajador');
    }
    if (trabajadores.length > MAX_TRABAJADORES_POR_LISTA) {
        throw err400(`Demasiados trabajadores (máx ${MAX_TRABAJADORES_POR_LISTA})`);
    }
}

const actividadesSugeridasService = {

    /**
     * Listado mensual (por el lunes de cada semana; filtro por obra opcional).
     * Retorna resumen + conteos para badges.
     *
     * Usa LEFT JOIN + GROUP BY (sin subqueries correlacionadas N+1) y filtra
     * por rango plano (BETWEEN) para que idx_semana sea utilizable.
     */
    async listar({ obra_id, mes, anio }) {
        const conds = ['o.es_prueba = 0', 'o.finalizada = 0']; // excluir obras de prueba y finalizadas
        const params = [];
        if (obra_id) { conds.push('s.obra_id = ?'); params.push(obra_id); }
        if (mes && anio) {
            const m = Number(mes), y = Number(anio);
            const desde = `${y}-${String(m).padStart(2, '0')}-01`;
            const hastaDate = new Date(y, m, 0); // último día del mes (m es 1-12)
            const hasta = `${y}-${String(m).padStart(2, '0')}-${String(hastaDate.getDate()).padStart(2, '0')}`;
            conds.push('s.semana BETWEEN ? AND ?');
            params.push(desde, hasta);
        }
        const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const [rows] = await db.query(`
            SELECT
                s.id, s.obra_id, s.semana, s.estado,
                s.observaciones_globales, s.creado_por, s.created_at,
                o.nombre AS obra_nombre,
                u.nombre AS creado_por_nombre,
                COUNT(DISTINCT CASE WHEN t.estado != 'cancelado' THEN t.id END)              AS total_citados,
                COUNT(DISTINCT CASE WHEN t.estado = 'asistio'   THEN t.id END)               AS total_asistio,
                COUNT(DISTINCT CASE WHEN t.estado = 'no_asistio' THEN t.id END)              AS total_no_asistio
            FROM actividades_sugeridas s
            JOIN obras o ON o.id = s.obra_id
            LEFT JOIN usuarios u ON u.id = s.creado_por
            LEFT JOIN actividades_sugeridas_trabajadores t ON t.actividad_id = s.id
            ${whereSql}
            GROUP BY s.id
            ORDER BY s.semana DESC, s.id DESC
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
            FROM actividades_sugeridas s
            JOIN obras o ON o.id = s.obra_id
            LEFT JOIN usuarios u ON u.id = s.creado_por
            WHERE s.id = ?
        `, [id]);

        if (headers.length === 0) throw err404('Lista no encontrada');

        const cabecera = headers[0];

        // Parse JSON observaciones_por_cargo si viene como string (algunos drivers)
        if (typeof cabecera.observaciones_por_cargo === 'string') {
            try { cabecera.observaciones_por_cargo = JSON.parse(cabecera.observaciones_por_cargo); }
            catch { cabecera.observaciones_por_cargo = null; }
        }

        const [trabajadores] = await db.query(`
            SELECT
                t.id, t.actividad_id, t.trabajador_id, t.obra_origen_id,
                t.citado, t.asistio, t.estado, t.observacion,
                w.rut, w.nombres, w.apellido_paterno, w.apellido_materno,
                w.cargo_id, c.nombre AS cargo_nombre,
                oo.nombre AS obra_origen_nombre
            FROM actividades_sugeridas_trabajadores t
            JOIN trabajadores w ON w.id = t.trabajador_id
            LEFT JOIN cargos c ON c.id = w.cargo_id
            LEFT JOIN obras oo ON oo.id = t.obra_origen_id
            WHERE t.actividad_id = ?
            ORDER BY c.nombre, w.apellido_paterno, w.nombres
        `, [id]);

        cabecera.trabajadores = trabajadores;
        return cabecera;
    },

    /**
     * Crea una lista nueva (obra + semana) con sus trabajadores.
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre (obra, semana) dentro de la
     * transacción evita que dos usuarios creen la misma lista a la vez. La
     * UNIQUE uniq_obra_semana sigue como red de seguridad (ER_DUP_ENTRY → 409).
     *
     * Validaciones: semana (lunes, no pasada, ≤ 1 año), obra activa,
     * trabajadores activos, mínimo 1, máximo 500.
     */
    async crearLista(payload, userId) {
        const { obra_id, semana, observaciones_globales, observaciones_por_cargo, trabajadores } = payload;

        if (!obra_id || !semana) throw err400('obra_id y semana son requeridos');
        validarSemana(semana);
        validarTrabajadoresLista(trabajadores);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Lock pesimista contra (obra, semana) para prevenir creaciones simultáneas
            await conn.query(
                'SELECT id FROM actividades_sugeridas WHERE obra_id = ? AND semana = ? FOR UPDATE',
                [obra_id, semana]
            );

            await validarObraYTrabajadores(conn, obra_id, trabajadores);

            const obsJson = observaciones_por_cargo ? JSON.stringify(observaciones_por_cargo) : null;
            let insertResult;
            try {
                [insertResult] = await conn.query(
                    `INSERT INTO actividades_sugeridas
                        (obra_id, semana, observaciones_globales, observaciones_por_cargo, estado, creado_por, actualizado_por)
                     VALUES (?, ?, ?, ?, 'citada', ?, ?)`,
                    [obra_id, semana, observaciones_globales || null, obsJson, userId, userId]
                );
            } catch (errIns) {
                if (errIns && errIns.code === 'ER_DUP_ENTRY') {
                    throw err409('Ya existe una lista para esta obra en esa semana');
                }
                throw errIns;
            }

            const actividadId = insertResult.insertId;

            const values = trabajadores.map(t => [
                actividadId,
                t.trabajador_id,
                t.obra_origen_id || null,
                1,
                'citado',
                userId,
            ]);
            await conn.query(
                `INSERT INTO actividades_sugeridas_trabajadores
                    (actividad_id, trabajador_id, obra_origen_id, citado, estado, actualizado_por)
                 VALUES ?`,
                [values]
            );

            await conn.commit();
            return { id: actividadId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Edita la lista: reemplaza trabajadores y observaciones.
     * Solo permitido en estado 'citada' (la semana no se edita).
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre la fila evita que dos editores
     * entren simultáneamente (uno editando mientras otro registra asistencia).
     */
    async editarLista(id, payload, userId) {
        const { observaciones_globales, observaciones_por_cargo, trabajadores } = payload;

        validarTrabajadoresLista(trabajadores);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado, obra_id, semana FROM actividades_sugeridas WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Lista no encontrada');
            if (headers[0].estado !== 'citada') {
                throw err409('Solo se pueden editar listas en estado "citada"');
            }

            await validarObraYTrabajadores(conn, headers[0].obra_id, trabajadores);

            const obsJson = observaciones_por_cargo ? JSON.stringify(observaciones_por_cargo) : null;
            await conn.query(
                `UPDATE actividades_sugeridas
                 SET observaciones_globales = ?, observaciones_por_cargo = ?, actualizado_por = ?
                 WHERE id = ?`,
                [observaciones_globales || null, obsJson, userId, id]
            );

            // Estrategia: eliminar todos los citados y reinsertar.
            // Como estado=='citada' garantizado, no hay datos de asistencia que perder.
            await conn.query('DELETE FROM actividades_sugeridas_trabajadores WHERE actividad_id = ?', [id]);

            const values = trabajadores.map(t => [id, t.trabajador_id, t.obra_origen_id || null, 1, 'citado', userId]);
            await conn.query(
                `INSERT INTO actividades_sugeridas_trabajadores
                    (actividad_id, trabajador_id, obra_origen_id, citado, estado, actualizado_por)
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
     * Registra asistencia: marca asistio + observacion por trabajador.
     * Acepta trabajadores que no estaban en la lista (citado=0).
     * Cambia estado de 'citada' a 'realizada'.
     *
     * Concurrencia: SELECT ... FOR UPDATE sobre la cabecera evita que dos
     * registros simultáneos sobrescriban valores el uno del otro.
     */
    async registrarAsistencia(id, payload, userId) {
        const { observaciones_globales, trabajadores } = payload;

        const normalizados = trabajadores || [];

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado FROM actividades_sugeridas WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Lista no encontrada');
            if (headers[0].estado === 'cancelada') {
                throw err409('No se puede registrar asistencia en una lista cancelada');
            }

            // Update cabecera
            await conn.query(
                `UPDATE actividades_sugeridas
                 SET observaciones_globales = ?,
                     estado = 'realizada', actualizado_por = ?
                 WHERE id = ?`,
                [observaciones_globales || null, userId, id]
            );

            // Cargar trabajadores actuales para saber cuáles existen ya
            const [existing] = await conn.query(
                'SELECT trabajador_id FROM actividades_sugeridas_trabajadores WHERE actividad_id = ?',
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
                        `UPDATE actividades_sugeridas_trabajadores
                         SET asistio = ?, observacion = ?, estado = ?, actualizado_por = ?
                         WHERE actividad_id = ? AND trabajador_id = ?`,
                        [
                            asistio,
                            t.observacion || null,
                            estadoTrb,
                            userId,
                            id,
                            t.trabajador_id,
                        ]
                    );
                } else {
                    await conn.query(
                        `INSERT INTO actividades_sugeridas_trabajadores
                            (actividad_id, trabajador_id, obra_origen_id, citado, asistio, observacion, estado, actualizado_por)
                         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
                        [
                            id,
                            t.trabajador_id,
                            t.obra_origen_id || null,
                            asistio,
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
     * Soft delete: cabecera 'cancelada' y trabajadores 'cancelado'.
     * Preserva auditoría completa (no DELETE).
     *
     * Concurrencia: SELECT ... FOR UPDATE evita doble cancelación o que
     * alguien edite/registre asistencia justo cuando otro cancela.
     */
    async cancelar(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [headers] = await conn.query(
                'SELECT estado FROM actividades_sugeridas WHERE id = ? FOR UPDATE',
                [id]
            );
            if (headers.length === 0) throw err404('Lista no encontrada');
            if (headers[0].estado === 'cancelada') {
                await conn.commit();
                return { id }; // idempotente
            }

            await conn.query(
                `UPDATE actividades_sugeridas SET estado = 'cancelada', actualizado_por = ? WHERE id = ?`,
                [userId, id]
            );
            await conn.query(
                `UPDATE actividades_sugeridas_trabajadores
                 SET estado = 'cancelado', actualizado_por = ?
                 WHERE actividad_id = ? AND estado != 'cancelado'`,
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

module.exports = actividadesSugeridasService;
module.exports._internal = { validarSemana, lunesDeSemana, validarObraYTrabajadores };

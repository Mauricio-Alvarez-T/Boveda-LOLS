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
 */

const VALID_HORAS = (h) => h !== null && h !== undefined && Number(h) >= 0 && Number(h) <= 24;

function validarFechaSabado(fecha) {
    const dateObj = new Date(fecha + 'T12:00:00');
    if (Number.isNaN(dateObj.getTime())) {
        const e = new Error('Fecha inválida');
        e.statusCode = 400;
        throw e;
    }
    if (dateObj.getDay() !== 6) {
        const e = new Error('La fecha debe ser sábado');
        e.statusCode = 400;
        throw e;
    }
}

const sabadosExtraService = {

    /**
     * Listado mensual de citaciones (filtro por obra opcional).
     * Retorna info resumen + conteos para badges.
     */
    async listar({ obra_id, mes, anio }) {
        const conds = [];
        const params = [];
        if (obra_id) { conds.push('s.obra_id = ?'); params.push(obra_id); }
        if (mes && anio) {
            conds.push('MONTH(s.fecha) = ? AND YEAR(s.fecha) = ?');
            params.push(Number(mes), Number(anio));
        }
        const whereSql = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        const [rows] = await db.query(`
            SELECT
                s.id, s.obra_id, s.fecha, s.estado, s.horas_default,
                s.observaciones_globales, s.creado_por, s.created_at,
                o.nombre AS obra_nombre,
                u.nombre AS creado_por_nombre,
                (SELECT COUNT(*) FROM sabados_extra_trabajadores t WHERE t.sabado_id = s.id AND t.citado = 1) AS total_citados,
                (SELECT COUNT(*) FROM sabados_extra_trabajadores t WHERE t.sabado_id = s.id AND t.asistio = 1) AS total_asistio
            FROM sabados_extra s
            JOIN obras o ON o.id = s.obra_id
            LEFT JOIN usuarios u ON u.id = s.creado_por
            ${whereSql}
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

        if (headers.length === 0) {
            const e = new Error('Citación no encontrada');
            e.statusCode = 404;
            throw e;
        }

        const cabecera = headers[0];

        // Parse JSON observaciones_por_cargo si viene como string (algunos drivers)
        if (typeof cabecera.observaciones_por_cargo === 'string') {
            try { cabecera.observaciones_por_cargo = JSON.parse(cabecera.observaciones_por_cargo); }
            catch { cabecera.observaciones_por_cargo = null; }
        }

        const [trabajadores] = await db.query(`
            SELECT
                t.id, t.sabado_id, t.trabajador_id, t.obra_origen_id,
                t.citado, t.asistio, t.horas_trabajadas, t.observacion,
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
     * Maneja UNIQUE conflict (1062) con 409.
     */
    async crearCitacion(payload, userId) {
        const { obra_id, fecha, observaciones_globales, observaciones_por_cargo, horas_default, trabajadores } = payload;

        if (!obra_id || !fecha) {
            const e = new Error('obra_id y fecha son requeridos');
            e.statusCode = 400;
            throw e;
        }
        validarFechaSabado(fecha);

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            const e = new Error('horas_default debe estar entre 0 y 24');
            e.statusCode = 400;
            throw e;
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const obsJson = observaciones_por_cargo ? JSON.stringify(observaciones_por_cargo) : null;
            let insertResult;
            try {
                [insertResult] = await conn.query(
                    `INSERT INTO sabados_extra
                        (obra_id, fecha, observaciones_globales, observaciones_por_cargo, horas_default, estado, creado_por)
                     VALUES (?, ?, ?, ?, ?, 'citada', ?)`,
                    [obra_id, fecha, observaciones_globales || null, obsJson, horas_default || null, userId]
                );
            } catch (err) {
                if (err && err.code === 'ER_DUP_ENTRY') {
                    const e = new Error('Ya existe una citación para esta obra y fecha');
                    e.statusCode = 409;
                    throw e;
                }
                throw err;
            }

            const sabadoId = insertResult.insertId;

            if (Array.isArray(trabajadores) && trabajadores.length > 0) {
                const values = trabajadores.map(t => [
                    sabadoId,
                    t.trabajador_id,
                    t.obra_origen_id || null,
                    1,
                ]);
                await conn.query(
                    `INSERT INTO sabados_extra_trabajadores (sabado_id, trabajador_id, obra_origen_id, citado) VALUES ?`,
                    [values]
                );
            }

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
     */
    async editarCitacion(id, payload, userId) {
        const { observaciones_globales, observaciones_por_cargo, horas_default, trabajadores } = payload;

        const [headers] = await db.query('SELECT estado FROM sabados_extra WHERE id = ?', [id]);
        if (headers.length === 0) {
            const e = new Error('Citación no encontrada');
            e.statusCode = 404;
            throw e;
        }
        if (headers[0].estado !== 'citada') {
            const e = new Error('Solo se pueden editar citaciones en estado "citada"');
            e.statusCode = 409;
            throw e;
        }

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            const e = new Error('horas_default debe estar entre 0 y 24');
            e.statusCode = 400;
            throw e;
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

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

            if (Array.isArray(trabajadores) && trabajadores.length > 0) {
                const values = trabajadores.map(t => [id, t.trabajador_id, t.obra_origen_id || null, 1]);
                await conn.query(
                    `INSERT INTO sabados_extra_trabajadores (sabado_id, trabajador_id, obra_origen_id, citado) VALUES ?`,
                    [values]
                );
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
     * Registra asistencia el día sábado: marca asistio + horas + observacion
     * por trabajador. Acepta nuevos no-citados (citado=0).
     * Cambia estado de 'citada' a 'realizada'.
     */
    async registrarAsistencia(id, payload, userId) {
        const { horas_default, observaciones_globales, trabajadores } = payload;

        const [headers] = await db.query('SELECT estado FROM sabados_extra WHERE id = ?', [id]);
        if (headers.length === 0) {
            const e = new Error('Citación no encontrada');
            e.statusCode = 404;
            throw e;
        }
        if (headers[0].estado === 'cancelada') {
            const e = new Error('No se puede registrar asistencia en una citación cancelada');
            e.statusCode = 409;
            throw e;
        }

        if (horas_default !== null && horas_default !== undefined && !VALID_HORAS(horas_default)) {
            const e = new Error('horas_default debe estar entre 0 y 24');
            e.statusCode = 400;
            throw e;
        }

        // Validar horas individuales
        for (const t of (trabajadores || [])) {
            if (t.horas_trabajadas !== null && t.horas_trabajadas !== undefined && !VALID_HORAS(t.horas_trabajadas)) {
                const e = new Error(`Horas trabajadas inválidas para trabajador ${t.trabajador_id} (debe estar entre 0 y 24)`);
                e.statusCode = 400;
                throw e;
            }
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

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

            for (const t of (trabajadores || [])) {
                if (existingSet.has(t.trabajador_id)) {
                    // Update existente
                    await conn.query(
                        `UPDATE sabados_extra_trabajadores
                         SET asistio = ?, horas_trabajadas = ?, observacion = ?
                         WHERE sabado_id = ? AND trabajador_id = ?`,
                        [
                            t.asistio === undefined ? null : (t.asistio ? 1 : 0),
                            t.horas_trabajadas ?? null,
                            t.observacion || null,
                            id,
                            t.trabajador_id
                        ]
                    );
                } else {
                    // Insert nuevo (no estaba en la citación)
                    await conn.query(
                        `INSERT INTO sabados_extra_trabajadores
                            (sabado_id, trabajador_id, obra_origen_id, citado, asistio, horas_trabajadas, observacion)
                         VALUES (?, ?, ?, 0, ?, ?, ?)`,
                        [
                            id,
                            t.trabajador_id,
                            t.obra_origen_id || null,
                            t.asistio === undefined ? null : (t.asistio ? 1 : 0),
                            t.horas_trabajadas ?? null,
                            t.observacion || null
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
     * Soft delete: marca como cancelada. Preserva auditoría.
     */
    async cancelar(id, userId) {
        const [headers] = await db.query('SELECT estado FROM sabados_extra WHERE id = ?', [id]);
        if (headers.length === 0) {
            const e = new Error('Citación no encontrada');
            e.statusCode = 404;
            throw e;
        }
        if (headers[0].estado === 'cancelada') {
            return { id }; // idempotente
        }
        await db.query(
            `UPDATE sabados_extra SET estado = 'cancelada', actualizado_por = ? WHERE id = ?`,
            [userId, id]
        );
        return { id };
    }
};

module.exports = sabadosExtraService;

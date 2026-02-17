const db = require('../config/db');

const asistenciaService = {
    /**
     * Registro masivo de asistencia (array de trabajadores)
     */
    async bulkCreate(obraId, registros, registradoPor) {
        const results = [];
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            for (const reg of registros) {
                const [existing] = await conn.query(
                    'SELECT id FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?',
                    [reg.trabajador_id, obraId, reg.fecha]
                );

                if (existing.length > 0) {
                    // Update existing
                    await conn.query(
                        'UPDATE asistencias SET estado = ?, tipo_ausencia_id = ?, observacion = ? WHERE id = ?',
                        [reg.estado, reg.tipo_ausencia_id || null, reg.observacion || null, existing[0].id]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'updated', id: existing[0].id });
                } else {
                    // Create new
                    const [result] = await conn.query(
                        `INSERT INTO asistencias (trabajador_id, obra_id, fecha, estado, tipo_ausencia_id, observacion, registrado_por)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [reg.trabajador_id, obraId, reg.fecha, reg.estado, reg.tipo_ausencia_id || null, reg.observacion || null, registradoPor]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'created', id: result.insertId });
                }
            }

            await conn.commit();
            return results;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Obtener asistencia de una obra en una fecha
     */
    async getByObraAndFecha(obraId, fecha) {
        const [rows] = await db.query(
            `SELECT a.*, t.rut, t.nombres, t.apellido_paterno, ta.nombre as tipo_ausencia_nombre,
              u.nombre as registrado_por_nombre
       FROM asistencias a
       JOIN trabajadores t ON a.trabajador_id = t.id
       LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
       LEFT JOIN usuarios u ON a.registrado_por = u.id
       WHERE a.obra_id = ? AND a.fecha = ?
       ORDER BY t.apellido_paterno`,
            [obraId, fecha]
        );
        return rows;
    },

    /**
     * Modificar asistencia con log de auditoría
     */
    async update(asistenciaId, data, modificadoPor) {
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // Get current values
            const [current] = await conn.query('SELECT * FROM asistencias WHERE id = ?', [asistenciaId]);
            if (current.length === 0) {
                throw Object.assign(new Error('Asistencia no encontrada'), { statusCode: 404 });
            }

            const old = current[0];

            // Log each changed field
            for (const [campo, valorNuevo] of Object.entries(data)) {
                if (old[campo] !== undefined && String(old[campo]) !== String(valorNuevo)) {
                    await conn.query(
                        `INSERT INTO log_asistencia (asistencia_id, campo_modificado, valor_anterior, valor_nuevo, modificado_por)
             VALUES (?, ?, ?, ?, ?)`,
                        [asistenciaId, campo, String(old[campo]), String(valorNuevo), modificadoPor]
                    );
                }
            }

            // Update record
            const fields = Object.keys(data).map(f => `${f} = ?`).join(', ');
            await conn.query(`UPDATE asistencias SET ${fields} WHERE id = ?`, [...Object.values(data), asistenciaId]);

            await conn.commit();
            return { id: asistenciaId, ...data };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Reporte de asistencia por rango de fechas
     */
    async getReporte(query = {}) {
        const { obra_id, fecha_inicio, fecha_fin, trabajador_id } = query;
        let where = [];
        let params = [];

        if (obra_id) { where.push('a.obra_id = ?'); params.push(obra_id); }
        if (fecha_inicio) { where.push('a.fecha >= ?'); params.push(fecha_inicio); }
        if (fecha_fin) { where.push('a.fecha <= ?'); params.push(fecha_fin); }
        if (trabajador_id) { where.push('a.trabajador_id = ?'); params.push(trabajador_id); }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT a.*, t.rut, t.nombres, t.apellido_paterno, ta.nombre as tipo_ausencia_nombre
       FROM asistencias a
       JOIN trabajadores t ON a.trabajador_id = t.id
       LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
       ${whereClause}
       ORDER BY a.fecha DESC, t.apellido_paterno`,
            params
        );
        return rows;
    }
};

module.exports = asistenciaService;

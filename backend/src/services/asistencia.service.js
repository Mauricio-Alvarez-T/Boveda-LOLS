const db = require('../config/db');
const ExcelJS = require('exceljs');

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
                const fechaNormalizada = typeof reg.fecha === 'string' ? reg.fecha.split('T')[0] : reg.fecha;

                const [existing] = await conn.query(
                    'SELECT id FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?',
                    [reg.trabajador_id, obraId, fechaNormalizada]
                );

                if (existing.length > 0) {
                    await conn.query(
                        `UPDATE asistencias SET estado_id = ?, tipo_ausencia_id = ?, observacion = ?,
                         hora_entrada = ?, hora_salida = ?, hora_colacion_inicio = ?, hora_colacion_fin = ?,
                         horas_extra = ?, es_sabado = ?
                         WHERE id = ?`,
                        [
                            reg.estado_id,
                            reg.tipo_ausencia_id || null,
                            reg.observacion || null,
                            reg.hora_entrada || null,
                            reg.hora_salida || null,
                            reg.hora_colacion_inicio || null,
                            reg.hora_colacion_fin || null,
                            reg.horas_extra || 0,
                            reg.es_sabado || false,
                            existing[0].id
                        ]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'updated', id: existing[0].id });
                } else {
                    const [result] = await conn.query(
                        `INSERT INTO asistencias
                         (trabajador_id, obra_id, fecha, estado_id, tipo_ausencia_id, observacion,
                          hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin,
                          horas_extra, es_sabado, registrado_por)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            reg.trabajador_id, obraId, fechaNormalizada,
                            reg.estado_id,
                            reg.tipo_ausencia_id || null,
                            reg.observacion || null,
                            reg.hora_entrada || null,
                            reg.hora_salida || null,
                            reg.hora_colacion_inicio || null,
                            reg.hora_colacion_fin || null,
                            reg.horas_extra || 0,
                            reg.es_sabado || false,
                            registradoPor
                        ]
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
            `SELECT a.*, ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color,
                    ea.es_presente,
                    t.rut, t.nombres, t.apellido_paterno, t.cargo_id,
                    c.nombre as cargo_nombre,
                    ta.nombre as tipo_ausencia_nombre,
                    u.nombre as registrado_por_nombre
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             JOIN trabajadores t ON a.trabajador_id = t.id
             LEFT JOIN cargos c ON t.cargo_id = c.id
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
            `SELECT a.*, ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color,
                    t.rut, t.nombres, t.apellido_paterno,
                    ta.nombre as tipo_ausencia_nombre
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             JOIN trabajadores t ON a.trabajador_id = t.id
             LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
             ${whereClause}
             ORDER BY a.fecha DESC, t.apellido_paterno`,
            params
        );
        return rows;
    },

    /**
     * Resumen diario para una obra (KPIs)
     */
    async getResumenDiario(obraId, fecha) {
        const [rows] = await db.query(
            `SELECT ea.nombre, ea.codigo, ea.color, ea.es_presente, COUNT(*) as cantidad
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             WHERE a.obra_id = ? AND a.fecha = ?
             GROUP BY ea.id, ea.nombre, ea.codigo, ea.color, ea.es_presente`,
            [obraId, fecha]
        );

        const total = rows.reduce((sum, r) => sum + r.cantidad, 0);
        const presentes = rows.filter(r => r.es_presente).reduce((sum, r) => sum + r.cantidad, 0);

        // Total horas extra
        const [horasResult] = await db.query(
            `SELECT COALESCE(SUM(horas_extra), 0) as total_horas_extra
             FROM asistencias
             WHERE obra_id = ? AND fecha = ?`,
            [obraId, fecha]
        );

        return {
            fecha,
            total_trabajadores: total,
            presentes,
            porcentaje_asistencia: total > 0 ? Math.round((presentes / total) * 100) : 0,
            desglose: rows,
            total_horas_extra: parseFloat(horasResult[0].total_horas_extra)
        };
    },

    /**
     * Obtener estados de asistencia activos
     */
    async getEstados() {
        const [rows] = await db.query(
            'SELECT * FROM estados_asistencia WHERE activo = TRUE ORDER BY id'
        );
        return rows;
    },

    /**
     * Obtener configuración de horarios de una obra
     */
    async getHorarios(obraId) {
        const [rows] = await db.query(
            'SELECT * FROM configuracion_horarios WHERE obra_id = ? AND activo = TRUE ORDER BY FIELD(dia_semana, "lun","mar","mie","jue","vie","sab")',
            [obraId]
        );
        return rows;
    },

    /**
     * Guardar configuración de horarios (upsert)
     */
    async saveHorarios(obraId, horarios) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            for (const h of horarios) {
                await conn.query(
                    `INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, colacion_minutos)
                     VALUES (?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE hora_entrada = VALUES(hora_entrada), hora_salida = VALUES(hora_salida), colacion_minutos = VALUES(colacion_minutos)`,
                    [obraId, h.dia_semana, h.hora_entrada, h.hora_salida, h.colacion_minutos || 60]
                );
            }
            await conn.commit();
            return { obra_id: obraId, saved: horarios.length };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Obtener log de auditoría de una asistencia
     */
    async getLog(asistenciaId) {
        const [rows] = await db.query(
            `SELECT la.*, u.nombre as modificado_por_nombre
             FROM log_asistencia la
             LEFT JOIN usuarios u ON la.modificado_por = u.id
             WHERE la.asistencia_id = ?
             ORDER BY la.fecha_modificacion DESC`,
            [asistenciaId]
        );
        return rows;
    },

    /**
     * Generar archivo Excel con reporte de asistencia
     */
    async generarExcel(query = {}) {
        const rows = await this.getReporte(query);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Asistencia');

        // Styles
        const headerStyle = {
            font: { bold: true, color: { argb: 'FFFFFFFF' } },
            fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0071E3' } },
            alignment: { vertical: 'middle', horizontal: 'center' },
            border: {
                top: { style: 'thin' }, left: { style: 'thin' },
                bottom: { style: 'thin' }, right: { style: 'thin' }
            }
        };

        // Columns
        worksheet.columns = [
            { header: 'Fecha', key: 'fecha', width: 15 },
            { header: 'RUT', key: 'rut', width: 15 },
            { header: 'Apellidos', key: 'apellido_paterno', width: 20 },
            { header: 'Nombres', key: 'nombres', width: 25 },
            { header: 'Estado', key: 'estado_nombre', width: 15 },
            { header: 'Código', key: 'estado_codigo', width: 10 },
            { header: 'Causa (Ausencia)', key: 'tipo_ausencia_nombre', width: 25 },
            { header: 'Entrada', key: 'hora_entrada', width: 12 },
            { header: 'Salida', key: 'hora_salida', width: 12 },
            { header: 'Horas Extra', key: 'horas_extra', width: 15 },
            { header: 'Sábado', key: 'es_sabado', width: 10 },
            { header: 'Observación', key: 'observacion', width: 30 }
        ];

        // Format Headers
        worksheet.getRow(1).eachCell((cell) => {
            cell.style = headerStyle;
        });

        // Add Data
        rows.forEach(r => {
            const row = worksheet.addRow({
                fecha: typeof r.fecha === 'string' ? r.fecha.split('T')[0] : r.fecha, // Basic string format if it comes as object
                rut: r.rut,
                apellido_paterno: r.apellido_paterno,
                nombres: r.nombres,
                estado_nombre: r.estado_nombre,
                estado_codigo: r.estado_codigo,
                tipo_ausencia_nombre: r.tipo_ausencia_nombre || '',
                hora_entrada: r.hora_entrada ? r.hora_entrada.slice(0, 5) : '',
                hora_salida: r.hora_salida ? r.hora_salida.slice(0, 5) : '',
                horas_extra: parseFloat(r.horas_extra) || 0,
                es_sabado: r.es_sabado ? 'Sí' : 'No',
                observacion: r.observacion || ''
            });

            // Date format explicitly
            if (r.fecha instanceof Date) {
                row.getCell('fecha').value = r.fecha.toISOString().split('T')[0];
            }

            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' },
                    bottom: { style: 'thin' }, right: { style: 'thin' }
                };
            });

            // Alignments
            row.getCell('fecha').alignment = { horizontal: 'center' };
            row.getCell('estado_codigo').alignment = { horizontal: 'center' };
            row.getCell('hora_entrada').alignment = { horizontal: 'center' };
            row.getCell('hora_salida').alignment = { horizontal: 'center' };
            row.getCell('horas_extra').alignment = { horizontal: 'center' };
            row.getCell('es_sabado').alignment = { horizontal: 'center' };
        });

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }
};

module.exports = asistenciaService;

const db = require('../config/db');
const ExcelJS = require('exceljs');
const { logManualActivity } = require('../middleware/logger');

const asistenciaService = {
    /**
     * Registro masivo de asistencia (array de trabajadores)
     * Registra logs individuales solo para registros que realmente cambiaron.
     */
    async bulkCreate(obraId, registros, registradoPor, req) {
        const results = [];
        const logEntries = []; // Acumular logs para insertar después del commit
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            for (const reg of registros) {
                const fechaNormalizada = typeof reg.fecha === 'string' ? reg.fecha.split('T')[0] : reg.fecha;

                const [existing] = await conn.query(
                    'SELECT * FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?',
                    [reg.trabajador_id, obraId, fechaNormalizada]
                );

                if (existing.length > 0) {
                    const old = existing[0];
                    // Detectar si realmente cambió algo (con normalización de tipos)
                    const cambios = {};
                    const booleanFields = new Set(['es_sabado']);
                    const numericFields = new Set(['estado_id', 'tipo_ausencia_id', 'horas_extra']);
                    const fieldsToCheck = ['estado_id', 'tipo_ausencia_id', 'observacion', 'hora_entrada', 'hora_salida', 'hora_colacion_inicio', 'hora_colacion_fin', 'horas_extra', 'es_sabado'];

                    for (const f of fieldsToCheck) {
                        let oldVal = old[f];
                        let newVal = reg[f];

                        // Normalizar vacíos
                        if (oldVal === undefined || oldVal === '') oldVal = null;
                        if (newVal === undefined || newVal === '') newVal = null;

                        // Normalizar booleanos (DB: 0/1, Frontend: true/false)
                        if (booleanFields.has(f)) {
                            oldVal = oldVal === null ? false : Boolean(Number(oldVal));
                            newVal = newVal === null ? false : Boolean(Number(newVal));
                        }

                        // Normalizar numéricos (DB: "0.00", Frontend: 0)
                        if (numericFields.has(f)) {
                            oldVal = oldVal === null ? null : Number(oldVal);
                            newVal = newVal === null ? null : Number(newVal);
                        }

                        if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                            cambios[f] = { de: oldVal, a: newVal };
                        }
                    }

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
                            old.id
                        ]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'updated', id: old.id });

                    // Solo loguear si hubo cambios reales
                    if (Object.keys(cambios).length > 0) {
                        logEntries.push({
                            trabajador_id: reg.trabajador_id,
                            asistencia_id: old.id,
                            accion: 'UPDATE',
                            cambios,
                            fecha: fechaNormalizada
                        });
                    }
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

                    logEntries.push({
                        trabajador_id: reg.trabajador_id,
                        asistencia_id: result.insertId,
                        accion: 'CREATE',
                        cambios: null,
                        fecha: fechaNormalizada
                    });
                }
            }

            await conn.commit();

            // Después del commit, registrar logs individuales (no bloquea la respuesta)
            if (logEntries.length > 0) {
                this._logBulkChanges(logEntries, obraId, registradoPor, req).catch(err => {
                    console.error('Error al registrar logs de asistencia:', err);
                });
            }

            return results;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Registra logs individuales para cambios de asistencia.
     * Se ejecuta después del commit para no impactar la transacción principal.
     */
    async _logBulkChanges(entries, obraId, userId, req) {
        // Obtener nombres de trabajadores y estados en batch (1 query cada uno)
        const workerIds = [...new Set(entries.map(e => e.trabajador_id))];
        const [workers] = await db.query(
            'SELECT id, nombres, apellido_paterno FROM trabajadores WHERE id IN (?)',
            [workerIds]
        );
        const workerMap = Object.fromEntries(workers.map(w => [w.id, `${w.nombres} ${w.apellido_paterno}`]));

        const [estados] = await db.query('SELECT id, nombre FROM estados_asistencia');
        const estadoMap = Object.fromEntries(estados.map(e => [e.id, e.nombre]));

        let tipoAusenciaMap = {};
        try {
            const [tiposAusencia] = await db.query('SELECT id, nombre FROM tipos_ausencia');
            tipoAusenciaMap = Object.fromEntries(tiposAusencia.map(t => [t.id, t.nombre]));
        } catch (e) { /* tabla puede no existir */ }

        const fieldLabels = {
            estado_id: 'Estado',
            tipo_ausencia_id: 'Tipo Ausencia',
            observacion: 'Observación',
            hora_entrada: 'Hora Entrada',
            hora_salida: 'Hora Salida',
            hora_colacion_inicio: 'Inicio Colación',
            hora_colacion_fin: 'Fin Colación',
            horas_extra: 'Horas Extra',
            es_sabado: 'Sábado'
        };

        for (const entry of entries) {
            const nombreTrabajador = workerMap[entry.trabajador_id] || `ID ${entry.trabajador_id}`;

            let detalle;
            if (entry.accion === 'CREATE') {
                detalle = JSON.stringify({
                    resumen: `Asistencia registrada: ${nombreTrabajador} (${entry.fecha})`
                });
            } else {
                // Traducir IDs a nombres legibles
                const cambiosLegibles = { ...entry.cambios };
                if (cambiosLegibles.estado_id) {
                    cambiosLegibles.estado_id = {
                        de: estadoMap[cambiosLegibles.estado_id.de] || cambiosLegibles.estado_id.de,
                        a: estadoMap[cambiosLegibles.estado_id.a] || cambiosLegibles.estado_id.a
                    };
                }
                if (cambiosLegibles.tipo_ausencia_id) {
                    cambiosLegibles.tipo_ausencia_id = {
                        de: tipoAusenciaMap[cambiosLegibles.tipo_ausencia_id.de] || cambiosLegibles.tipo_ausencia_id.de,
                        a: tipoAusenciaMap[cambiosLegibles.tipo_ausencia_id.a] || cambiosLegibles.tipo_ausencia_id.a
                    };
                }

                const resumenParts = [];
                for (const [key, val] of Object.entries(cambiosLegibles)) {
                    const label = fieldLabels[key] || key;
                    const formatV = (v) => v === null || v === undefined ? '—' : (v === true ? 'Sí' : (v === false ? 'No' : String(v)));
                    resumenParts.push(`${label}: ${formatV(val.de)} → ${formatV(val.a)}`);
                }

                detalle = JSON.stringify({
                    trabajador: nombreTrabajador,
                    fecha: entry.fecha,
                    cambios: cambiosLegibles,
                    resumen: `${nombreTrabajador}: ${resumenParts.join(' | ')}`
                });
            }

            await logManualActivity(userId, 'asistencias', entry.accion, entry.asistencia_id, detalle, req);
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
        workbook.creator = 'Bóveda LOLS';

        const worksheet = workbook.addWorksheet('Reporte de Asistencia', {
            views: [{ state: 'frozen', ySplit: 7, xSplit: 0 }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        // 1. EXECUTIVE HEADER (Rows 1-6)
        worksheet.mergeCells('A1:L2');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = 'REPORTE EJECUTIVO DE ASISTENCIA';
        titleCell.font = { name: 'Segoe UI', size: 18, bold: true, color: { argb: 'FF1E293B' } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.mergeCells('A3:L3');
        const subTitle = worksheet.getCell('A3');
        subTitle.value = 'Registro Histórico de Presencia y Horas Extra';
        subTitle.font = { name: 'Segoe UI', size: 11, italic: true, color: { argb: 'FF64748B' } };
        subTitle.alignment = { horizontal: 'center' };

        // Metadata Labels
        worksheet.getCell('A5').value = 'FECHA REPORTE:';
        worksheet.getCell('B5').value = new Date().toLocaleDateString('es-CL');
        worksheet.getCell('D5').value = 'TOTAL REGISTROS:';
        worksheet.getCell('E5').value = rows.length;
        worksheet.getCell('G5').value = 'FILTRO OBRA:';
        worksheet.getCell('H5').value = query.obra_id || 'TODAS';

        [worksheet.getCell('A5'), worksheet.getCell('D5'), worksheet.getCell('G5')].forEach(c => {
            c.font = { bold: true, size: 9, color: { argb: 'FF475569' } };
        });

        // 2. TABLE HEADERS (Row 7)
        const headerRow = 7;
        const columnsConfig = [
            { header: 'FECHA', key: 'fecha', width: 14 },
            { header: 'RUT', key: 'rut', width: 14 },
            { header: 'APELLIDOS', key: 'apellido_paterno', width: 35 },
            { header: 'NOMBRES', key: 'nombres', width: 35 },
            { header: 'ESTADO', key: 'estado_nombre', width: 22 },
            { header: 'COD', key: 'estado_codigo', width: 10 },
            { header: 'CAUSA/AUSENCIA', key: 'tipo_ausencia_nombre', width: 35 },
            { header: 'ENTRADA', key: 'hora_entrada', width: 12 },
            { header: 'SALIDA', key: 'hora_salida', width: 12 },
            { header: 'H. EXTRA', key: 'horas_extra', width: 12 },
            { header: 'SAB', key: 'es_sabado', width: 10 },
            { header: 'OBSERVACIÓN', key: 'observacion', width: 50 }
        ];

        columnsConfig.forEach((col, i) => {
            const cell = worksheet.getCell(headerRow, i + 1);
            cell.value = col.header;
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
            cell.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };

            // Apply column width
            worksheet.getColumn(i + 1).width = col.width;
        });
        worksheet.getRow(headerRow).height = 25;

        // 3. DATA ROWS (Row 8+)
        rows.forEach((r, index) => {
            const rowArr = [
                typeof r.fecha === 'string' ? r.fecha.split('T')[0] : r.fecha,
                r.rut,
                r.apellido_paterno,
                r.nombres,
                r.estado_nombre,
                r.estado_codigo,
                r.tipo_ausencia_nombre || '-',
                r.hora_entrada ? r.hora_entrada.slice(0, 5) : '-',
                r.hora_salida ? r.hora_salida.slice(0, 5) : '-',
                parseFloat(r.horas_extra) || 0,
                r.es_sabado ? 'SÍ' : 'NO',
                r.observacion || '-'
            ];

            const row = worksheet.addRow(rowArr);
            row.height = 28; // Increased height for better wrap handling

            if (index % 2 === 1) {
                row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            }

            row.eachCell({ includeEmpty: true }, (cell, colNum) => {
                cell.font = { name: 'Segoe UI', size: 10 };
                cell.alignment = { vertical: 'middle', wrapText: true };
                cell.border = {
                    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                    right: { style: 'thin', color: { argb: 'FFF1F5F9' } }
                };

                // Alignment for numeric/codes
                if ([1, 2, 6, 8, 9, 10, 11].includes(colNum)) {
                    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                }
            });
        });

        // 4. AUTO-FILTER
        worksheet.autoFilter = {
            from: { row: headerRow, column: 1 },
            to: { row: headerRow + rows.length, column: 12 }
        };

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    }
};

module.exports = asistenciaService;

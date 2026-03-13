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

                // --- VALIDACIÓN DE SEGURIDAD: Bloqueo de Feriados y Domingos ---
                const dateObj = new Date(fechaNormalizada + 'T12:00:00');
                const isSunday = dateObj.getDay() === 0;
                const [feriadoCheck] = await conn.query('SELECT id FROM feriados WHERE fecha = ? AND activo = 1', [fechaNormalizada]);
                
                if (isSunday || feriadoCheck.length > 0) {
                    throw new Error(`No se puede registrar asistencia en feriados o domingos (${fechaNormalizada})`);
                }

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
        // Consultar si es feriado
        const [feriados] = await db.query('SELECT * FROM feriados WHERE fecha = ? AND activo = 1', [fecha]);
        const feriado = feriados.length > 0 ? feriados[0] : null;

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
             WHERE a.obra_id = ? AND a.fecha = ? AND t.activo = 1
             ORDER BY t.apellido_paterno`,
            [obraId, fecha]
        );
        return {
            registros: rows,
            feriado
        };
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
        
        // Excluir inactivos (soft-deleted) del reporte y del excel
        where.push('t.activo = 1');

        const whereClause = `WHERE ${where.join(' AND ')}`;

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
            [...params]
        );

        // También traer feriados para el reporte de Excel/Nómina si se solicita por rango
        const [feriados] = await db.query(
            'SELECT * FROM feriados WHERE fecha BETWEEN ? AND ? AND activo = 1',
            [fecha_inicio || '1900-01-01', fecha_fin || '2100-12-31']
        );

        return {
            registros: rows,
            feriados
        };
    },

    /**
     * Resumen diario para una obra (KPIs)
     */
    async getResumenDiario(obraId, fecha) {
        // Consultar si es feriado
        const [feriados] = await db.query('SELECT * FROM feriados WHERE fecha = ? AND activo = 1', [fecha]);
        const feriado = feriados.length > 0 ? feriados[0] : null;

        const [rows] = await db.query(
            `SELECT ea.nombre, ea.codigo, ea.color, ea.es_presente, COUNT(*) as cantidad
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             JOIN trabajadores t ON a.trabajador_id = t.id
             WHERE a.obra_id = ? AND a.fecha = ? AND t.activo = 1
             GROUP BY ea.id, ea.nombre, ea.codigo, ea.color, ea.es_presente`,
            [obraId, fecha]
        );

        const total = rows.reduce((sum, r) => sum + r.cantidad, 0);
        const presentes = rows.filter(r => r.es_presente).reduce((sum, r) => sum + r.cantidad, 0);

        // Total horas extra
        const [horasResult] = await db.query(
            `SELECT COALESCE(SUM(horas_extra), 0) as total_horas_extra
             FROM asistencias a
             JOIN trabajadores t ON a.trabajador_id = t.id
             WHERE a.obra_id = ? AND a.fecha = ? AND t.activo = 1`,
            [obraId, fecha]
        );

        return {
            fecha,
            total_trabajadores: total,
            presentes,
            porcentaje_asistencia: total > 0 ? Math.round((presentes / total) * 100) : 0,
            desglose: rows,
            total_horas_extra: parseFloat(horasResult[0].total_horas_extra),
            feriado
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
        const { obra_id, fecha_inicio, fecha_fin } = query;
        console.log(`[DEBUG] generarExcel - ObraId: ${obra_id}, Inicio: ${fecha_inicio}, Fin: ${fecha_fin}`);

        if (!obra_id || !fecha_inicio || !fecha_fin) {
            throw new Error('obra_id, fecha_inicio y fecha_fin son requeridos para exportar');
        }

        const start = new Date(fecha_inicio + 'T00:00:00');
        const end = new Date(fecha_fin + 'T23:59:59');
        let curr = new Date(start);

        // 1. Obtener Datos
        const [obraRows] = await db.query('SELECT nombre FROM obras WHERE id = ?', [obra_id]);
        const obraNombre = obraRows[0]?.nombre || 'Sin Obra';
        console.log('[DEBUG] Obra cargada:', obraNombre);

        // Obtener trabajadores activos asignados a esta obra
        const [workers] = await db.query(
            `SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.fecha_ingreso, 
                    c.nombre as cargo_nombre, t.activo
             FROM trabajadores t
             LEFT JOIN cargos c ON t.cargo_id = c.id
             WHERE t.obra_id = ? AND t.activo = 1
             ORDER BY t.apellido_paterno, t.nombres`,
            [obra_id]
        );

        const { registros, feriados } = await this.getReporte(query);
        const [estados] = await db.query('SELECT * FROM estados_asistencia');
        const estadoMap = Object.fromEntries(estados.map(e => [e.id, e]));

        // Helper para fechas seguras
        const formatDate = (date) => {
            if (!date) return '';
            if (typeof date === 'string') return date.split('T')[0];
            if (date instanceof Date) {
                if (isNaN(date.getTime())) return '';
                return date.toISOString().split('T')[0];
            }
            return '';
        };

        // Mapear asistencia por trabajador y fecha
        const attendanceMap = {};
        registros.forEach(r => {
            const f = formatDate(r.fecha);
            if (!f) return;
            if (!attendanceMap[r.trabajador_id]) attendanceMap[r.trabajador_id] = {};
            attendanceMap[r.trabajador_id][f] = r;
        });

        const feriadoMap = Object.fromEntries(feriados.map(f => {
            const fStr = formatDate(f.fecha);
            return [fStr, f];
        }));

        // 2. Definir Rango de Días
        const start = new Date(fecha_inicio + 'T12:00:00');
        const end = new Date(fecha_fin + 'T12:00:00');
        const days = [];
        let curr = new Date(start);
        while (curr <= end) {
            days.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        const workbook = new ExcelJS.Workbook();
        
        // Mapa manual de meses para evitar fallos por locales de ICU en el servidor
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const monthName = meses[start.getMonth()];
        const year = start.getFullYear();
        const worksheet = workbook.addWorksheet(`Asistencia ${monthName}`, {
            views: [{ state: 'frozen', ySplit: 8, xSplit: 8 }],
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
        });

        // 3. Diseño de Cabecera (Filas 1-8)
        // Leyenda (Mockup superior izquierdo similar a captura)
        const legendEntries = [
            { label: 'LICENCIA', color: 'FFD9EAD3' }, // Verde/Azul suave
            { label: 'FINIQUITADOS', color: 'FFFFE599' }, // Amarillo
            { label: 'SUSPENSION POR LEY', color: 'FFF4CCCC' }, // Rojo suave
            { label: 'VACACIONES', color: 'FFFFF2CC' }, // Amarillo crema
            { label: 'INGRESOS NUEVOS', color: 'FFD9D9D9' }  // Gris
        ];
        legendEntries.forEach((leg, i) => {
            const cell = worksheet.getCell(`B${i + 1}`);
            cell.value = leg.label;
            cell.font = { size: 8 };
            const box = worksheet.getCell(`C${i + 1}`);
            box.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: leg.color } };
            box.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Título Central
        worksheet.mergeCells('F2:H4');
        const titleCell = worksheet.getCell('F2');
        titleCell.value = `PERSONAL LOLS ${monthName} ${year}`;
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

        // Cabeceras de Tabla
        const headers1 = ['N°', 'APELLIDOS', 'NOMBRES', 'RUT', 'INGRESO', 'CARGO', 'OBRA', 'ESTADO'];
        headers1.forEach((h, i) => {
            const cell = worksheet.getCell(7, i + 1);
            cell.value = h;
            worksheet.mergeCells(7, i + 1, 8, i + 1);
            cell.font = { bold: true, size: 9 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        const dayColStart = 9;
        const dowMap = ['D', 'L', 'M', 'MI', 'J', 'V', 'S'];

        days.forEach((day, i) => {
            const colIdx = dayColStart + (i < 15 ? i : i + 1); // Salto en quincena
            const dayNum = day.getDate();
            const cellNum = worksheet.getCell(7, colIdx);
            cellNum.value = dayNum;
            cellNum.font = { bold: true, size: 9 };
            cellNum.alignment = { horizontal: 'center' };
            cellNum.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const cellDow = worksheet.getCell(8, colIdx);
            cellDow.value = dowMap[day.getDay()];
            cellDow.font = { size: 8 };
            cellDow.alignment = { horizontal: 'center' };
            cellDow.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            
            // Highlight weekends
            if (day.getDay() === 0 || day.getDay() === 6) {
                cellNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                cellDow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
            }
        });

        // Columnas de Resumen
        const q1Col = dayColStart + 15;
        const q1Header = worksheet.getCell(7, q1Col);
        q1Header.value = 'PRIMERA';
        worksheet.mergeCells(7, q1Col, 7, q1Col);
        worksheet.getCell(8, q1Col).value = 'QUINCENA';
        [q1Header, worksheet.getCell(8, q1Col)].forEach(c => {
            c.font = { bold: true, size: 8 };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        const q2Col = dayColStart + days.length + 1;
        const q2Header = worksheet.getCell(7, q2Col);
        q2Header.value = 'SEGUNDA';
        worksheet.getCell(8, q2Col).value = 'QUINCENA';
        [q2Header, worksheet.getCell(8, q2Col)].forEach(c => {
            c.font = { bold: true, size: 8 };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        const totalCol = q2Col + 1;
        const totalHeader = worksheet.getCell(7, totalCol);
        totalHeader.value = 'TOTAL';
        worksheet.getCell(8, totalCol).value = 'DIAS T';
        [totalHeader, worksheet.getCell(8, totalCol)].forEach(c => {
            c.font = { bold: true, size: 8 };
            c.alignment = { horizontal: 'center', vertical: 'middle' };
            c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        const obsCol = totalCol + 1;
        const obsHeader = worksheet.getCell(7, obsCol);
        obsHeader.value = 'OBSERVACIONES';
        worksheet.mergeCells(7, obsCol, 8, obsCol);
        obsHeader.font = { bold: true, size: 9 };
        obsHeader.alignment = { horizontal: 'center', vertical: 'middle' };
        obsHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

        // 4. Datos de Trabajadores (Filas 9+)
        workers.forEach((worker, wIdx) => {
            const rowIdx = 9 + wIdx;
            worksheet.getCell(rowIdx, 1).value = wIdx + 1;
            worksheet.getCell(rowIdx, 2).value = worker.apellido_paterno;
            worksheet.getCell(rowIdx, 3).value = worker.nombres;
            worksheet.getCell(rowIdx, 4).value = worker.rut;
            worksheet.getCell(rowIdx, 5).value = formatDate(worker.fecha_ingreso);
            worksheet.getCell(rowIdx, 6).value = worker.cargo_nombre;
            worksheet.getCell(rowIdx, 7).value = obraNombre;
            worksheet.getCell(rowIdx, 8).value = worker.activo ? 'ACTIVO' : 'FINIQUITADO';

            let q1Total = 0;
            let q2Total = 0;

            days.forEach((day, dIdx) => {
                const fStr = formatDate(day);
                const colIdx = dayColStart + (dIdx < 15 ? dIdx : dIdx + 1);
                const cell = worksheet.getCell(rowIdx, colIdx);
                const reg = attendanceMap[worker.id]?.[fStr];
                
                if (reg) {
                    const est = estadoMap[reg.estado_id];
                    cell.value = est ? est.codigo : '-';
                    
                    if (est) {
                        if (est.codigo === 'A') {
                            cell.font = { size: 8 };
                        } else if (est.color) {
                            // Validar que el color existe y tiene formato hex
                            const safeColor = est.color.startsWith('#') ? est.color.replace('#', 'FF') : 'FF' + est.color;
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: safeColor } };
                            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 8 };
                        }
                        
                        // Sumar totales si es presente
                        if (est.es_presente) {
                            if (dIdx < 15) q1Total++;
                            else q2Total++;
                        }
                    }
                } else {
                    cell.value = '';
                }

                // Pintar feriados o domingos si no hay registro
                if (feriadoMap[fStr] || day.getDay() === 0) {
                    if (!cell.fill) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    }
                }
                
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Totales por fila
            worksheet.getCell(rowIdx, q1Col).value = q1Total;
            worksheet.getCell(rowIdx, q2Col).value = q2Total;
            worksheet.getCell(rowIdx, totalCol).value = q1Total + q2Total;
            
            [worksheet.getCell(rowIdx, q1Col), worksheet.getCell(rowIdx, q2Col), worksheet.getCell(rowIdx, totalCol)].forEach(c => {
                c.font = { bold: true, size: 9 };
                c.alignment = { horizontal: 'center' };
                c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            // Estilos de fila comunes
            for (let c = 1; c <= 8; c++) {
                const cell = worksheet.getCell(rowIdx, c);
                cell.font = { size: 8 };
                cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            }
        });

        // 5. Ajustes Finales
        worksheet.getColumn(1).width = 4;
        worksheet.getColumn(2).width = 20;
        worksheet.getColumn(3).width = 20;
        worksheet.getColumn(4).width = 12;
        worksheet.getColumn(5).width = 10;
        worksheet.getColumn(6).width = 18;
        worksheet.getColumn(7).width = 15;
        worksheet.getColumn(8).width = 10;
        
        for (let i = 0; i < days.length + 4; i++) {
            worksheet.getColumn(dayColStart + i).width = 4;
        }
        worksheet.getColumn(obsCol).width = 20;

        const buffer = await workbook.xlsx.writeBuffer();
        return buffer;
    },

    // ══════════════════════════════════════════════════
    // ═══  SISTEMA DE PERÍODOS DE AUSENCIA  ═══════════
    // ══════════════════════════════════════════════════

    /**
     * Crea un período de ausencia y genera/actualiza registros de asistencia
     * para cada día del rango. El último período siempre gana.
     */
    async crearPeriodo(data, userId, req) {
        const { trabajador_id, obra_id, estado_id, tipo_ausencia_id, fecha_inicio, fecha_fin, observacion } = data;

        if (!trabajador_id || !obra_id || !estado_id || !fecha_inicio || !fecha_fin) {
            throw new Error('trabajador_id, obra_id, estado_id, fecha_inicio y fecha_fin son requeridos');
        }

        const inicio = new Date(fecha_inicio + 'T12:00:00');
        const fin = new Date(fecha_fin + 'T12:00:00');

        if (fin < inicio) {
            throw new Error('La fecha de fin no puede ser anterior a la fecha de inicio');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // 1. Desactivar períodos superpuestos del mismo trabajador en la misma obra
            // REGLA DE SUPERPOSICIÓN: El último periodo gana, PERO la Licencia Médica (LM) 
            // siempre tiene prioridad sobre otros estados (ej: sobre vacaciones o faltas).
            // NOTA: Si el nuevo periodo es LM, desactiva todo. Si no lo es, respeta LM existente.
            
            const [newEstado] = await conn.query('SELECT codigo FROM estados_asistencia WHERE id = ?', [estado_id]);
            const nextIsLM = newEstado[0]?.codigo === 'LM';

            if (nextIsLM) {
                // Si el nuevo es LM, desactivamos cualquier periodo previo que se cruce
                await conn.query(
                    `UPDATE periodos_ausencia 
                     SET activo = FALSE, updated_at = NOW()
                     WHERE trabajador_id = ? AND obra_id = ? AND activo = TRUE
                     AND fecha_inicio <= ? AND fecha_fin >= ?`,
                    [trabajador_id, obra_id, fecha_fin, fecha_inicio]
                );
            } else {
                // Si el nuevo NO es LM, solo desactivamos periodos que NO sean LM
                await conn.query(
                    `UPDATE periodos_ausencia p
                     JOIN estados_asistencia ea ON p.estado_id = ea.id
                     SET p.activo = FALSE, p.updated_at = NOW()
                     WHERE p.trabajador_id = ? AND p.obra_id = ? AND p.activo = TRUE
                     AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
                     AND ea.codigo <> 'LM'`,
                    [trabajador_id, obra_id, fecha_fin, fecha_inicio]
                );
            }

            // 2. Insertar el nuevo período
            const [periodoResult] = await conn.query(
                `INSERT INTO periodos_ausencia 
                 (trabajador_id, obra_id, estado_id, tipo_ausencia_id, fecha_inicio, fecha_fin, observacion, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [trabajador_id, obra_id, estado_id, tipo_ausencia_id || null, fecha_inicio, fecha_fin, observacion || null, userId]
            );

            // 3. Generar/actualizar registros de asistencia para cada día del rango
            let diasAfectados = 0;
            const current = new Date(inicio);

            while (current <= fin) {
                const fechaStr = current.toISOString().split('T')[0];
                const dayOfWeek = current.getDay(); // 0=dom, 6=sab
                const esSabado = dayOfWeek === 6;

                await conn.query(
                    `INSERT INTO asistencias 
                     (trabajador_id, obra_id, fecha, estado_id, tipo_ausencia_id, observacion, 
                      hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin,
                      horas_extra, es_sabado, registrado_por)
                     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?, ?)
                     ON DUPLICATE KEY UPDATE 
                        estado_id = VALUES(estado_id),
                        tipo_ausencia_id = VALUES(tipo_ausencia_id),
                        observacion = VALUES(observacion),
                        hora_entrada = NULL,
                        hora_salida = NULL,
                        hora_colacion_inicio = NULL,
                        hora_colacion_fin = NULL,
                        horas_extra = 0`,
                    [trabajador_id, obra_id, fechaStr, estado_id, tipo_ausencia_id || null, observacion || null, esSabado, userId]
                );

                diasAfectados++;
                current.setDate(current.getDate() + 1);
            }

            await conn.commit();

            // Log de actividad
            try {
                const [trabajadorRows] = await db.query('SELECT nombres, apellido_paterno FROM trabajadores WHERE id = ?', [trabajador_id]);
                const [estadoRows] = await db.query('SELECT nombre FROM estados_asistencia WHERE id = ?', [estado_id]);
                const nombreTrab = trabajadorRows[0] ? `${trabajadorRows[0].nombres} ${trabajadorRows[0].apellido_paterno}` : `ID ${trabajador_id}`;
                const nombreEstado = estadoRows[0] ? estadoRows[0].nombre : `ID ${estado_id}`;

                logManualActivity(req, userId, 'CREATE', 'periodos_ausencia', periodoResult.insertId,
                    JSON.stringify({
                        resumen: `Período asignado: ${nombreEstado} para ${nombreTrab} del ${fecha_inicio} al ${fecha_fin} (${diasAfectados} días)`
                    })
                );
            } catch (logErr) {
                console.error('Error registrando log de período:', logErr);
            }

            return {
                id: periodoResult.insertId,
                trabajador_id,
                obra_id,
                estado_id,
                fecha_inicio,
                fecha_fin,
                dias_afectados: diasAfectados
            };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Obtiene períodos de ausencia con filtros opcionales
     */
    async getPeriodos(query = {}) {
        const { trabajador_id, obra_id, fecha_inicio, fecha_fin, activo } = query;
        let where = [];
        let params = [];

        if (trabajador_id) { where.push('p.trabajador_id = ?'); params.push(trabajador_id); }
        if (obra_id) { where.push('p.obra_id = ?'); params.push(obra_id); }
        if (fecha_inicio) { where.push('p.fecha_fin >= ?'); params.push(fecha_inicio); }
        if (fecha_fin) { where.push('p.fecha_inicio <= ?'); params.push(fecha_fin); }
        if (activo !== undefined) {
            where.push('p.activo = ?');
            params.push(activo === 'true' || activo === true ? 1 : 0);
        } else {
            where.push('p.activo = 1');
        }

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT p.*, 
                    ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color,
                    t.nombres, t.apellido_paterno, t.rut,
                    ta.nombre as tipo_ausencia_nombre
             FROM periodos_ausencia p
             JOIN estados_asistencia ea ON p.estado_id = ea.id
             JOIN trabajadores t ON p.trabajador_id = t.id
             LEFT JOIN tipos_ausencia ta ON p.tipo_ausencia_id = ta.id
             ${whereClause}
             ORDER BY p.fecha_inicio DESC`,
            params
        );
        return rows;
    },

    /**
     * Cancela un período (soft delete). No revierte los registros de asistencia.
     */
    async cancelarPeriodo(periodoId, userId, req) {
        const [existing] = await db.query('SELECT * FROM periodos_ausencia WHERE id = ?', [periodoId]);
        if (existing.length === 0) throw new Error('Período no encontrado');

        await db.query(
            'UPDATE periodos_ausencia SET activo = FALSE, updated_at = NOW() WHERE id = ?',
            [periodoId]
        );

        try {
            logManualActivity(req, userId, 'DELETE', 'periodos_ausencia', periodoId,
                JSON.stringify({ resumen: `Período #${periodoId} cancelado (${existing[0].fecha_inicio} al ${existing[0].fecha_fin})` })
            );
        } catch (logErr) {
            console.error('Error registrando log:', logErr);
        }

        return { id: periodoId, cancelado: true };
    }
};

module.exports = asistenciaService;

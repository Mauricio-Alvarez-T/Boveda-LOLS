const db = require('../config/db');
const ExcelJS = require('exceljs');
const { logManualActivity } = require('../middleware/logger');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_12345';

const asistenciaService = {
    /**
     * Genera un token firmado para descarga pública
     */
    generatePublicReportToken(params) {
        return jwt.sign(params, JWT_SECRET, { expiresIn: '24h' });
    },

    /**
     * Valida un token firmado y retorna los parámetros
     */
    validatePublicReportToken(token) {
        try {
            return jwt.verify(token, JWT_SECRET);
        } catch (err) {
            throw new Error('Token de descarga inválido o expirado');
        }
    },
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

                // --- VALIDACIÓN DE SEGURIDAD: Bloqueo de Feriados y Fines de Semana ---
                const dateObj = new Date(fechaNormalizada + 'T12:00:00');
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6; // 0=Domingo, 6=Sábado
                const [feriadoCheck] = await conn.query('SELECT id FROM feriados WHERE fecha = ? AND activo = 1', [fechaNormalizada]);
                
                if (isWeekend || feriadoCheck.length > 0) {
                    throw new Error(`No se puede registrar asistencia en feriados o fines de semana (${fechaNormalizada})`);
                }

                // --- VALIDACIÓN DE RANGO LABORAL: No permitir asistencia fuera del período de contratación ---
                const [workerCheck] = await conn.query(
                    'SELECT fecha_ingreso, fecha_desvinculacion FROM trabajadores WHERE id = ?',
                    [reg.trabajador_id]
                );
                if (workerCheck.length > 0) {
                    const w = workerCheck[0];
                    const fechaIngresoStr = w.fecha_ingreso ? (typeof w.fecha_ingreso === 'string' ? w.fecha_ingreso.split('T')[0] : w.fecha_ingreso.toISOString().split('T')[0]) : null;
                    const fechaFinStr = w.fecha_desvinculacion ? (typeof w.fecha_desvinculacion === 'string' ? w.fecha_desvinculacion.split('T')[0] : w.fecha_desvinculacion.toISOString().split('T')[0]) : null;

                    if (fechaIngresoStr && fechaNormalizada < fechaIngresoStr) {
                        throw new Error(`No se puede registrar asistencia antes de la fecha de contratación (${fechaIngresoStr}) del trabajador ID ${reg.trabajador_id}`);
                    }
                    if (fechaFinStr && fechaNormalizada > fechaFinStr) {
                        throw new Error(`No se puede registrar asistencia después de la fecha de finiquito (${fechaFinStr}) del trabajador ID ${reg.trabajador_id}`);
                    }
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
             ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC`,
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
        const { obra_id, fecha_inicio, fecha_fin, trabajador_id, empresa_id, cargo_id, categoria_reporte, activo, trabajador_ids } = query;
        let where = [];
        let params = [];

        if (obra_id && obra_id !== 'null' && obra_id !== 'undefined' && obra_id !== '') { 
            where.push('a.obra_id = ?'); 
            params.push(obra_id); 
        }
        if (fecha_inicio) { where.push('a.fecha >= ?'); params.push(fecha_inicio); }
        if (fecha_fin) { where.push('a.fecha <= ?'); params.push(fecha_fin); }
        if (trabajador_id) { where.push('a.trabajador_id = ?'); params.push(trabajador_id); }
        if (trabajador_ids) {
            const ids = Array.isArray(trabajador_ids) ? trabajador_ids : trabajador_ids.split(',').filter(Boolean);
            if (ids.length > 0) {
                where.push(`a.trabajador_id IN (${ids.map(() => '?').join(',')})`);
                params.push(...ids);
            }
        }
        
        // Filtros adicionales desde Consultas
        if (empresa_id) { where.push('t.empresa_id = ?'); params.push(empresa_id); }
        if (cargo_id) { where.push('t.cargo_id = ?'); params.push(cargo_id); }
        if (categoria_reporte) { where.push('t.categoria_reporte = ?'); params.push(categoria_reporte); }
        if (activo !== undefined && activo !== '' && activo !== 'todos') { 
            where.push('t.activo = ?'); 
            params.push(activo === 'true' || activo === '1' ? 1 : 0); 
        }

        // NOTA: No filtramos por t.activo globalmente aquí para que los finiquitados
        // con registros en el rango aparezcan en el Excel/reporte.
        // El filtrado por 'activo' pasado en la query sí se respeta.

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
              ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC, a.fecha DESC`,
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
        const { obra_id, fecha_inicio, fecha_fin, empresa_id, cargo_id, categoria_reporte, activo, trabajador_ids } = query;

        if (!fecha_inicio || !fecha_fin) {
            throw new Error('fecha_inicio y fecha_fin son requeridos para exportar');
        }

        const start = new Date(fecha_inicio + 'T00:00:00');
        const end = new Date(fecha_fin + 'T23:59:59');

        // 1. Obtener Datos
        const workerQueryParams = [];
        let workerQuery = `
            SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.fecha_ingreso, t.fecha_desvinculacion,
                   c.nombre as cargo_nombre, t.activo, o.nombre as obra_actual_nombre,
                   e.id as empresa_id, e.razon_social as empresa_nombre, t.categoria_reporte
            FROM trabajadores t
            LEFT JOIN cargos c ON t.cargo_id = c.id
            LEFT JOIN obras o ON t.obra_id = o.id
            LEFT JOIN empresas e ON t.empresa_id = e.id
            WHERE 1=1
        `;

        if (obra_id && obra_id !== 'null' && obra_id !== 'undefined' && obra_id !== '') {
            workerQuery += ' AND t.obra_id = ?';
            workerQueryParams.push(obra_id);
        }

        if (empresa_id) {
            workerQuery += ' AND t.empresa_id = ?';
            workerQueryParams.push(empresa_id);
        }

        if (cargo_id) {
            workerQuery += ' AND t.cargo_id = ?';
            workerQueryParams.push(cargo_id);
        }

        if (categoria_reporte) {
            workerQuery += ' AND t.categoria_reporte = ?';
            workerQueryParams.push(categoria_reporte);
        }

        if (activo !== undefined && activo !== '' && activo !== 'todos') {
            workerQuery += ' AND t.activo = ?';
            workerQueryParams.push(activo === 'true' || activo === '1' ? 1 : 0);
        }

        if (trabajador_ids) {
            const ids = Array.isArray(trabajador_ids) ? trabajador_ids : trabajador_ids.split(',').filter(Boolean);
            if (ids.length > 0) {
                workerQuery += ` AND t.id IN (${ids.map(() => '?').join(',')})`;
                workerQueryParams.push(...ids);
            }
        }
        
        workerQuery += ' ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC';
        
        const [workers] = await db.query(workerQuery, workerQueryParams);

        const { registros, feriados } = await this.getReporte(query);
        const [estados] = await db.query('SELECT * FROM estados_asistencia WHERE activo = TRUE ORDER BY id');
        const estadoMap = Object.fromEntries(estados.map(e => [e.id, e]));

        // Filtrar trabajadores: incluir activos, y los inactivos solo si tienen asistencia este mes
        // Lo verificamos directamente de 'registros'
        const activeWorkersThisMonth = new Set(registros.map(r => r.trabajador_id));
        const workersToInlude = workers.filter(w => w.activo === 1 || activeWorkersThisMonth.has(w.id));

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

        // 2. Generar Rango de Días (FIJO A 31 DÍAS como pidió RRHH)
        const days = [];
        const startYear = start.getFullYear();
        const startMonth = start.getMonth();
        for (let d = 1; d <= 31; d++) {
            days.push(new Date(startYear, startMonth, d));
        }

        const workbook = new ExcelJS.Workbook();
        
        const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
        const monthName = meses[start.getMonth()];
        const year = start.getFullYear();

        // ── Mapeo de abreviaciones de empresa ──
        const empresaAbrevMap = {
            'LOLS EMPRESAS DE INGENIERIA': 'LOLS',
            'LOLS EMPRESAS DE INGENIERIA LTDA': 'LOLS',
            'MIGUEL ANGEL URRUTIA AGUILERA': 'MAUA',
            'TRANSPORTES DEDALIUS LIMITADA': 'DEDALIUS',
            'TRANSPORTES DEDALIUS': 'DEDALIUS',
            'PROVISORIO': 'PROVISORIOS',
            'PROVISORIOS': 'PROVISORIOS'
        };

        const getEmpresaAbrev = (nombre) => {
            if (!nombre) return 'PROVISORIOS';
            const upper = nombre.toUpperCase().trim();
            // Buscar coincidencia parcial
            for (const [key, val] of Object.entries(empresaAbrevMap)) {
                if (upper.includes(key) || key.includes(upper)) return val;
            }
            // Si no hay coincidencia, usar las primeras letras como fallback
            return upper.substring(0, 10);
        };

        // ── Códigos que suman como día trabajado según RRHH ──
        // A=Asistencia, V=Vacaciones, JI=Jornada Incompleta, PL=Permisos Legales
        // NOTA: LM (Licencia Médica) NO suma — requerimiento RRHH 2026-03-18
        // NOTA: AL (Accidente Laboral) ELIMINADO del sistema
        // FDS=Fin De Semana/Feriado (marcador interno, no es un estado de la BD)
        const codigosSumanDia = ['A', 'V', 'JI', 'PL'];
        const MARKER_FDS = 'FDS'; // Marcador para fines de semana y feriados sin registro

        // ── Agrupar trabajadores por empresa ──
        const empresaGroups = {};
        workersToInlude.forEach(w => {
            const abrev = getEmpresaAbrev(w.empresa_nombre);
            if (!empresaGroups[abrev]) empresaGroups[abrev] = [];
            empresaGroups[abrev].push(w);
        });

        // Si no hay agrupaciones (ej: todos sin empresa), crear una hoja por defecto
        if (Object.keys(empresaGroups).length === 0) {
            empresaGroups['GENERAL'] = workers;
        }

        // ── Orden preferido de pestañas ──
        const tabOrder = ['LOLS', 'MAUA', 'DEDALIUS', 'PROVISORIOS'];
        const sortedKeys = [
            ...tabOrder.filter(k => empresaGroups[k]),
            ...Object.keys(empresaGroups).filter(k => !tabOrder.includes(k))
        ];

        // ══════════════════════════════════════════════════
        // ═══  GENERAR UNA HOJA POR EMPRESA  ═══════════════
        // ══════════════════════════════════════════════════

        for (const empresaAbrev of sortedKeys) {
            const sheetWorkers = empresaGroups[empresaAbrev];
            const sheetName = `${empresaAbrev.toLowerCase()} ${monthName.toLowerCase()} ${year}`;
            // ExcelJS limita nombres de hoja a 31 caracteres
            const safeName = sheetName.substring(0, 31);

            const ws = workbook.addWorksheet(safeName, {
                views: [{ state: 'frozen', ySplit: 8, xSplit: 8 }],
                pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 }
            });

            // ── 3a. Leyenda Dinámica en DOS COLUMNAS (filas 1-4, columnas A-D) ──
            // Distribuir los estados en dos columnas para evitar solapamiento
            // También agregar el marcador FDS como entrada de leyenda
            const legendItems = [
                ...estados.map(est => {
                    let codigo = est.codigo;
                    let nombre = est.nombre || est.codigo;
                    // Consolidación para la leyenda si son códigos obsoletos
                    if (['NAC', 'DEF', 'MAT'].includes(codigo)) {
                        codigo = 'PL';
                        nombre = 'Permisos Legales';
                    }
                    if (codigo === 'AT') {
                        codigo = 'JI';
                        nombre = 'Jornada Incompleta';
                    }
                    return { codigo, nombre, color: est.color, suma: codigosSumanDia.includes(codigo) };
                }).filter((v, i, a) => a.findIndex(t => t.codigo === v.codigo) === i), // Unique by consolidated code
                { codigo: MARKER_FDS, nombre: 'Fin de Semana / Feriado', color: null, suma: true }
            ];
            const halfLegend = Math.ceil(legendItems.length / 2);
            
            legendItems.forEach((item, i) => {
                // Columna izquierda (A-B): items 0..halfLegend-1
                // Columna derecha (C-D): items halfLegend..end
                const isRight = i >= halfLegend;
                const row = (isRight ? i - halfLegend : i) + 1;
                const codeCol = isRight ? 3 : 1;
                const nameCol = isRight ? 4 : 2;
                
                const codeCell = ws.getCell(row, codeCol);
                codeCell.value = item.codigo;
                codeCell.font = { bold: true, size: 7 };
                codeCell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (item.color) {
                    const safeColor = item.color.startsWith('#') ? item.color.replace('#', 'FF') : 'FF' + item.color;
                    codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: safeColor } };
                    const hex = item.color.replace('#', '');
                    const r = parseInt(hex.substring(0, 2), 16) || 0;
                    const g = parseInt(hex.substring(2, 4), 16) || 0;
                    const b = parseInt(hex.substring(4, 6), 16) || 0;
                    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                    if (luma < 140) {
                        codeCell.font = { bold: true, size: 7, color: { argb: 'FFFFFFFF' } };
                    }
                } else if (item.codigo === MARKER_FDS) {
                    codeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                }
                codeCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const nameCell = ws.getCell(row, nameCol);
                const sumaIcon = item.suma ? '✓' : '✗';
                nameCell.value = `${item.nombre} ${sumaIcon}`;
                nameCell.font = { size: 7, color: { argb: item.suma ? 'FF34C759' : 'FFFF3B30' } };
                nameCell.alignment = { vertical: 'middle' };
            });

            // ── Título Central ──
            ws.mergeCells('F2:H4');
            const titleCell = ws.getCell('F2');
            titleCell.value = `PERSONAL ${empresaAbrev} ${monthName} ${year}`;
            titleCell.font = { bold: true, size: 14 };
            titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

            // ── Cabeceras de Tabla (Filas 7-8) ──
            const headers1 = ['N°', 'APELLIDOS', 'NOMBRES', 'RUT', 'INGRESO', 'CARGO', 'OBRA', 'ESTADO'];
            headers1.forEach((h, i) => {
                const cell = ws.getCell(7, i + 1);
                cell.value = h;
                ws.mergeCells(7, i + 1, 8, i + 1);
                cell.font = { bold: true, size: 9 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            const dayColStart = 9;
            const dowMap = ['D', 'L', 'M', 'MI', 'J', 'V', 'S'];

            // Pintar cabeceras 1-31
            for (let i = 0; i < 31; i++) {
                const colIdx = dayColStart + (i < 15 ? i : i + 1);
                const dayNum = i + 1;
                const tempDay = new Date(startYear, startMonth, dayNum);
                
                const cellNum = ws.getCell(7, colIdx);
                cellNum.value = dayNum;
                cellNum.font = { bold: true, size: 9 };
                cellNum.alignment = { horizontal: 'center' };
                cellNum.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const cellDow = ws.getCell(8, colIdx);
                cellDow.value = dowMap[tempDay.getDay()];
                cellDow.font = { size: 8 };
                cellDow.alignment = { horizontal: 'center' };
                cellDow.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                
                if (tempDay.getDay() === 0 || tempDay.getDay() === 6) {
                    cellNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    cellDow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                }
            }

            // ── Columnas de Resumen ──
            const q1Col = dayColStart + 15;
            ws.mergeCells(7, q1Col, 8, q1Col);
            const q1Header = ws.getCell(7, q1Col);
            q1Header.value = 'PRIMERA QUINCENA';
            q1Header.font = { bold: true, size: 8 };
            q1Header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            q1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            q1Header.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const q2Col = dayColStart + 31 + 1;
            ws.mergeCells(7, q2Col, 8, q2Col);
            const q2Header = ws.getCell(7, q2Col);
            q2Header.value = 'SEGUNDA QUINCENA';
            q2Header.font = { bold: true, size: 8 };
            q2Header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            q2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            q2Header.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const totalCol = q2Col + 1;
            ws.mergeCells(7, totalCol, 8, totalCol);
            const totalHeader = ws.getCell(7, totalCol);
            totalHeader.value = 'TOTAL DIAS TRABAJADOS';
            totalHeader.font = { bold: true, size: 8 };
            totalHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            totalHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            totalHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const obsCol = totalCol + 1;
            const obsHeader = ws.getCell(7, obsCol);
            obsHeader.value = 'OBSERVACIONES';
            ws.mergeCells(7, obsCol, 8, obsCol);
            obsHeader.font = { bold: true, size: 9 };
            obsHeader.alignment = { horizontal: 'center', vertical: 'middle' };
            obsHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            // ── 4. Datos de Trabajadores (Filas 9+) ──
            sheetWorkers.forEach((worker, wIdx) => {
                const rowIdx = 9 + wIdx;
                ws.getCell(rowIdx, 1).value = wIdx + 1;
                ws.getCell(rowIdx, 2).value = worker.apellido_paterno + (worker.apellido_materno ? ' ' + worker.apellido_materno : '');
                ws.getCell(rowIdx, 3).value = worker.nombres;
                ws.getCell(rowIdx, 4).value = worker.rut;
                ws.getCell(rowIdx, 5).value = formatDate(worker.fecha_ingreso);
                ws.getCell(rowIdx, 6).value = worker.cargo_nombre;
                ws.getCell(rowIdx, 7).value = worker.obra_actual_nombre || 'Sin Obra';
                ws.getCell(rowIdx, 8).value = worker.activo ? 'ACTIVO' : 'FINIQUITADO';

                days.forEach((day, dIdx) => {
                    const fStr = formatDate(day);
                    const colIdx = dayColStart + (dIdx < 15 ? dIdx : dIdx + 1);
                    const cell = ws.getCell(rowIdx, colIdx);
                    const reg = attendanceMap[worker.id]?.[fStr];
                    const isFeriado = !!feriadoMap[fStr];
                    const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                    // ── VALIDACIÓN DE RANGO LABORAL ──
                    // No marcar ni sumar días FUERA del período de contratación
                    const workerIngreso = worker.fecha_ingreso ? formatDate(worker.fecha_ingreso) : null;
                    const workerFin = worker.fecha_desvinculacion ? formatDate(worker.fecha_desvinculacion) : null;
                    const isBeforeContract = workerIngreso && fStr < workerIngreso;
                    const isAfterTermination = workerFin && fStr > workerFin;
                    const isOutOfRange = isBeforeContract || isAfterTermination;

                    if (isOutOfRange) {
                        // Fuera de rango laboral → celda vacía, no suma nada
                        cell.value = '';
                        cell.font = { size: 7, color: { argb: 'FFCCCCCC' } };
                    } else if (reg) {
                        const est = estadoMap[reg.estado_id];
                        let codigo = est ? est.codigo : '-';
                        
                        // Consolidación dinámica para el Excel
                        if (['NAC', 'DEF', 'MAT'].includes(codigo)) codigo = 'PL';
                        if (codigo === 'AT') codigo = 'JI';

                        cell.value = codigo;
                        
                        if (est) {
                            if (codigo === 'A') {
                                cell.font = { size: 8 };
                            } else if (est.color) {
                                const safeColor = est.color.startsWith('#') ? est.color.replace('#', 'FF') : 'FF' + est.color;
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: safeColor } };
                                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 8 };
                            }
                        }

                        // ── Observación como comentario en la celda ──
                        if (reg.observacion && reg.observacion.trim()) {
                            cell.note = {
                                texts: [{ text: reg.observacion.trim() }],
                                margins: { insetmode: 'auto' }
                            };
                        }
                    } else if (isFeriado || isWeekend) {
                        // Fin de semana o feriado SIN registro → marcar con FDS para que sume
                        cell.value = MARKER_FDS;
                        cell.font = { size: 7, color: { argb: 'FFAAAAAA' } };
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    } else {
                        // Día laboral sin registro (no suma)
                        cell.value = '';
                    }

                    // Pintar feriados o domingos si tienen un estado registrado pero no fill propio
                    if ((isFeriado || isWeekend) && !cell.fill) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    }
                    
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });

                // ── FÓRMULAS DE SUMATORIA CORREGIDAS ──
                // Contar estados que suman + marcador FDS (fines de semana y feriados)
                const q1Range = `${ws.getCell(rowIdx, dayColStart).address}:${ws.getCell(rowIdx, dayColStart + 14).address}`;
                
                // Construir COUNTIF para cada código que suma + FDS
                const allCodigos = [...codigosSumanDia, MARKER_FDS];
                const countifParts = allCodigos.map(cod => `COUNTIF(${q1Range},"${cod}")`);
                const q1Formula = countifParts.join('+');
                ws.getCell(rowIdx, q1Col).value = { formula: q1Formula };

                const q2Range = `${ws.getCell(rowIdx, dayColStart + 16).address}:${ws.getCell(rowIdx, dayColStart + 31).address}`;
                const countifParts2 = allCodigos.map(cod => `COUNTIF(${q2Range},"${cod}")`);
                const q2Formula = countifParts2.join('+');
                ws.getCell(rowIdx, q2Col).value = { formula: q2Formula };

                // Total: Q1 + Q2
                ws.getCell(rowIdx, totalCol).value = { formula: `${ws.getCell(rowIdx, q1Col).address}+${ws.getCell(rowIdx, q2Col).address}` };
                
                [ws.getCell(rowIdx, q1Col), ws.getCell(rowIdx, q2Col), ws.getCell(rowIdx, totalCol)].forEach(c => {
                    c.font = { bold: true, size: 9 };
                    c.alignment = { horizontal: 'center' };
                    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });

                // Estilos de fila comunes
                for (let c = 1; c <= 8; c++) {
                    const cell = ws.getCell(rowIdx, c);
                    cell.font = { size: 8 };
                    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                }
            });

            // ── 5. Ajustes Finales por Hoja ──
            ws.getColumn(1).width = 4;
            ws.getColumn(2).width = 20;
            ws.getColumn(3).width = 20;
            ws.getColumn(4).width = 12;
            ws.getColumn(5).width = 10;
            ws.getColumn(6).width = 18;
            ws.getColumn(7).width = 15;
            ws.getColumn(8).width = 10;
            
            for (let i = 0; i < days.length + 4; i++) {
                ws.getColumn(dayColStart + i).width = 4;
            }
            // Ensanchar columnas de resumen
            ws.getColumn(q1Col).width = 10;
            ws.getColumn(q2Col).width = 10;
            ws.getColumn(totalCol).width = 10;
            ws.getColumn(obsCol).width = 20;
        }

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
            // --- VALIDACIÓN DE RANGO LABORAL ---
            const [workerCheck] = await conn.query(
                'SELECT fecha_ingreso, fecha_desvinculacion FROM trabajadores WHERE id = ?',
                [trabajador_id]
            );
            
            if (workerCheck.length > 0) {
                const w = workerCheck[0];
                const fechaIngresoStr = w.fecha_ingreso ? (typeof w.fecha_ingreso === 'string' ? w.fecha_ingreso.split('T')[0] : w.fecha_ingreso.toISOString().split('T')[0]) : null;
                const fechaFinStr = w.fecha_desvinculacion ? (typeof w.fecha_desvinculacion === 'string' ? w.fecha_desvinculacion.split('T')[0] : w.fecha_desvinculacion.toISOString().split('T')[0]) : null;

                if (fechaIngresoStr && fecha_inicio < fechaIngresoStr) {
                    throw new Error(`El período no puede iniciar antes de la fecha de contratación (${fechaIngresoStr})`);
                }
                if (fechaFinStr && fecha_fin > fechaFinStr) {
                    throw new Error(`El período no puede extenderse después de la fecha de finiquito (${fechaFinStr})`);
                }
            }
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

                logManualActivity(userId, 'periodos_ausencia', 'CREATE', periodoResult.insertId,
                    JSON.stringify({
                        resumen: `Período asignado: ${nombreEstado} para ${nombreTrab} del ${fecha_inicio} al ${fecha_fin} (${diasAfectados} días)`
                    }),
                    req
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

        // Limpiar registros diarios que pertenecen a este periodo y aun tienen el mismo estado
        const period = existing[0];
        await db.query(
            `DELETE FROM asistencias 
             WHERE trabajador_id = ? 
             AND obra_id = ? 
             AND fecha BETWEEN ? AND ? 
             AND estado_id = ?`,
            [period.trabajador_id, period.obra_id, period.fecha_inicio, period.fecha_fin, period.estado_id]
        );

        try {
            logManualActivity(userId, 'periodos_ausencia', 'DELETE', periodoId,
                JSON.stringify({ resumen: `Período #${periodoId} cancelado (${existing[0].fecha_inicio} al ${existing[0].fecha_fin})` }),
                req
            );
        } catch (logErr) {
            console.error('Error registrando log:', logErr);
        }

        return { id: periodoId, cancelado: true };
    },

    /**
     * Realiza el traslado de un trabajador a una nueva obra.
     * 1. Crea/Actualiza el registro de asistencia en la obra origen como TO (Traslado de Obra).
     * 2. Crea/Actualiza el registro de asistencia en la obra destino como A (Asiste).
     * 3. Actualiza la obra_id del trabajador a la obra destino.
     * 4. Registra la actividad en el log.
     */
    trasladoObra: async (data, usuario_id, req) => {
        const { trabajador_id, obra_actual_id, obra_destino_id, fecha, comentario } = data;
        const connection = await db.getConnection();

        try {
            await connection.beginTransaction();

            // 1. Obtener nombres para el log y la observación
            const [[trabajador]] = await connection.query('SELECT nombres, apellido_paterno FROM trabajadores WHERE id = ?', [trabajador_id]);
            const [[obraOrigen]] = await connection.query('SELECT nombre FROM obras WHERE id = ?', [obra_actual_id]);
            const [[obraDestino]] = await connection.query('SELECT nombre FROM obras WHERE id = ?', [obra_destino_id]);
            const [[estadoTO]] = await connection.query("SELECT id FROM estados_asistencia WHERE codigo = 'TO'");
            const [[estadoA]] = await connection.query("SELECT id FROM estados_asistencia WHERE codigo = 'A'");

            if (!trabajador || !obraOrigen || !obraDestino || !estadoTO || !estadoA) {
                throw new Error('Información incompleta para el traslado (trabajador, obra o estado no encontrado)');
            }

            const nombreCompleto = `${trabajador.nombres} ${trabajador.apellido_paterno}`;
            const observacionOrigen = `Traslado a: ${obraDestino.nombre}${comentario ? ' | Nota: ' + comentario : ''}`;
            const observacionDestino = `Traslado desde: ${obraOrigen.nombre}${comentario ? ' | Nota: ' + comentario : ''}`;

            // ── 2. UPSERT Asistencia TO en obra ORIGEN ──
            const [existingOrigen] = await connection.query(
                'SELECT id FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?',
                [trabajador_id, obra_actual_id, fecha]
            );

            if (existingOrigen.length > 0) {
                await connection.query(
                    'UPDATE asistencias SET estado_id = ?, observacion = ?, registrado_por = ? WHERE id = ?',
                    [estadoTO.id, observacionOrigen, usuario_id, existingOrigen[0].id]
                );
            } else {
                await connection.query(
                    'INSERT INTO asistencias (trabajador_id, obra_id, fecha, estado_id, observacion, registrado_por) VALUES (?, ?, ?, ?, ?, ?)',
                    [trabajador_id, obra_actual_id, fecha, estadoTO.id, observacionOrigen, usuario_id]
                );
            }

            // ── 3. UPSERT Asistencia A en obra DESTINO ──
            // Obtener horario de la obra destino para auto-llenar horas
            const dias = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
            const dayIndex = new Date(fecha + 'T12:00:00').getDay();
            const diaSemana = dias[dayIndex];

            const [horarios] = await connection.query(
                'SELECT hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin FROM configuracion_horarios WHERE obra_id = ? AND dia_semana = ?',
                [obra_destino_id, diaSemana]
            );
            const horario = horarios.length > 0 ? horarios[0] : null;

            const [existingDestino] = await connection.query(
                'SELECT id FROM asistencias WHERE trabajador_id = ? AND obra_id = ? AND fecha = ?',
                [trabajador_id, obra_destino_id, fecha]
            );

            if (existingDestino.length > 0) {
                await connection.query(
                    `UPDATE asistencias SET estado_id = ?, observacion = ?, registrado_por = ?,
                     hora_entrada = COALESCE(hora_entrada, ?), hora_salida = COALESCE(hora_salida, ?),
                     hora_colacion_inicio = COALESCE(hora_colacion_inicio, ?), hora_colacion_fin = COALESCE(hora_colacion_fin, ?)
                     WHERE id = ?`,
                    [
                        estadoA.id, observacionDestino, usuario_id,
                        horario?.hora_entrada || null, horario?.hora_salida || null,
                        horario?.hora_colacion_inicio || null, horario?.hora_colacion_fin || null,
                        existingDestino[0].id
                    ]
                );
            } else {
                await connection.query(
                    `INSERT INTO asistencias (trabajador_id, obra_id, fecha, estado_id, observacion, registrado_por,
                     hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        trabajador_id, obra_destino_id, fecha, estadoA.id, observacionDestino, usuario_id,
                        horario?.hora_entrada || null, horario?.hora_salida || null,
                        horario?.hora_colacion_inicio || null, horario?.hora_colacion_fin || null
                    ]
                );
            }

            // ── 4. Actualizar obra actual del trabajador ──
            await connection.query(
                'UPDATE trabajadores SET obra_id = ? WHERE id = ?',
                [obra_destino_id, trabajador_id]
            );

            // ── 5. Registrar en log de actividad ──
            const resumen = `Traslado: ${nombreCompleto} de ${obraOrigen.nombre} a ${obraDestino.nombre}`;
            const detalle = JSON.stringify({
                trabajador: nombreCompleto,
                obra_origen: obraOrigen.nombre,
                obra_destino: obraDestino.nombre,
                fecha,
                comentario: comentario || 'Sin comentarios',
                resumen
            });

            const { logManualActivity } = require('../middleware/logger');
            await logManualActivity(usuario_id, 'traslado_obra', 'CREATE', trabajador_id, detalle, req);

            await connection.commit();
            return {
                success: true,
                mensaje: resumen,
                obra_destino_nombre: obraDestino.nombre
            };
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    }
};

module.exports = asistenciaService;

const db = require('../config/db');
const ExcelJS = require('exceljs');
const { logManualActivity } = require('../middleware/logger');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('⛔ FATAL: JWT_SECRET no está configurado en las variables de entorno.');
    process.exit(1);
}

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
     *
     * OPTIMIZADO: Pre-carga feriados, trabajadores y asistencias existentes en batch
     * antes del loop, reduciendo ~4N queries a ~3 queries + N writes.
     */
    async bulkCreate(obraId, registros, registradoPor, req) {
        if (!registros || registros.length === 0) return [];

        const results = [];
        const logEntries = [];
        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            // ── PRE-FETCH: Cargar todo en batch (3 queries en vez de ~3N) ──

            // 1) Fechas únicas + validación feriados/fines de semana
            const fechasSet = new Set();
            for (const reg of registros) {
                fechasSet.add(typeof reg.fecha === 'string' ? reg.fecha.split('T')[0] : reg.fecha);
            }
            const fechasUnicas = [...fechasSet];

            // Validar fines de semana (client-side, 0 queries)
            for (const fecha of fechasUnicas) {
                const dateObj = new Date(fecha + 'T12:00:00');
                if (dateObj.getDay() === 0 || dateObj.getDay() === 6) {
                    throw new Error(`No se puede registrar asistencia en fines de semana (${fecha})`);
                }
            }

            // Batch feriados: 1 query para todas las fechas
            const [feriadosRows] = await conn.query(
                'SELECT fecha FROM feriados WHERE fecha IN (?) AND activo = 1',
                [fechasUnicas]
            );
            const feriadoSet = new Set(feriadosRows.map(f => {
                const d = f.fecha;
                return typeof d === 'string' ? d.split('T')[0] : d.toISOString().split('T')[0];
            }));
            for (const fecha of fechasUnicas) {
                if (feriadoSet.has(fecha)) {
                    throw new Error(`No se puede registrar asistencia en feriados (${fecha})`);
                }
            }

            // 2) Batch trabajadores: 1 query para todos los IDs
            const workerIds = [...new Set(registros.map(r => r.trabajador_id))];
            const [workersRows] = await conn.query(
                'SELECT id, fecha_ingreso, fecha_desvinculacion FROM trabajadores WHERE id IN (?)',
                [workerIds]
            );
            const workerMap = new Map();
            for (const w of workersRows) {
                const ingreso = w.fecha_ingreso
                    ? (typeof w.fecha_ingreso === 'string' ? w.fecha_ingreso.split('T')[0] : w.fecha_ingreso.toISOString().split('T')[0])
                    : null;
                const fin = w.fecha_desvinculacion
                    ? (typeof w.fecha_desvinculacion === 'string' ? w.fecha_desvinculacion.split('T')[0] : w.fecha_desvinculacion.toISOString().split('T')[0])
                    : null;
                workerMap.set(w.id, { ingreso, fin });
            }

            // 3) Batch asistencias existentes: 1 query con todas las combinaciones
            //    Construimos WHERE (trabajador_id, obra_id, fecha) IN (...)
            const lookupTuples = registros.map(reg => {
                const fecha = typeof reg.fecha === 'string' ? reg.fecha.split('T')[0] : reg.fecha;
                const gObraId = obraId === 'ALL' ? reg.obra_id : obraId;
                return [reg.trabajador_id, gObraId, fecha];
            });

            // MySQL WHERE (a,b,c) IN ((1,2,'x'),(3,4,'y')) syntax
            const placeholders = lookupTuples.map(() => '(?,?,?)').join(',');
            const flatParams = lookupTuples.flat();
            const [existingRows] = await conn.query(
                `SELECT * FROM asistencias WHERE (trabajador_id, obra_id, fecha) IN (${placeholders})`,
                flatParams
            );
            // Map: "workerId_obraId_fecha" -> row
            const existingMap = new Map();
            for (const row of existingRows) {
                const f = typeof row.fecha === 'string' ? row.fecha.split('T')[0] : row.fecha.toISOString().split('T')[0];
                existingMap.set(`${row.trabajador_id}_${row.obra_id}_${f}`, row);
            }

            // ── LOOP: Solo writes (INSERT/UPDATE), sin queries de lectura ──
            const booleanFields = new Set(['es_sabado']);
            const numericFields = new Set(['estado_id', 'tipo_ausencia_id', 'horas_extra']);
            const fieldsToCheck = ['estado_id', 'tipo_ausencia_id', 'observacion', 'hora_entrada', 'hora_salida', 'hora_colacion_inicio', 'hora_colacion_fin', 'horas_extra', 'es_sabado'];

            for (const reg of registros) {
                const fechaNormalizada = typeof reg.fecha === 'string' ? reg.fecha.split('T')[0] : reg.fecha;
                const globalObraId = obraId === 'ALL' ? reg.obra_id : obraId;

                // Validación rango laboral (desde cache, 0 queries)
                const worker = workerMap.get(reg.trabajador_id);
                if (worker) {
                    if (worker.ingreso && fechaNormalizada < worker.ingreso) {
                        throw new Error(`No se puede registrar asistencia antes de la fecha de contratación (${worker.ingreso}) del trabajador ID ${reg.trabajador_id}`);
                    }
                    if (worker.fin && fechaNormalizada > worker.fin) {
                        throw new Error(`No se puede registrar asistencia después de la fecha de finiquito (${worker.fin}) del trabajador ID ${reg.trabajador_id}`);
                    }
                }

                const key = `${reg.trabajador_id}_${globalObraId}_${fechaNormalizada}`;
                const old = existingMap.get(key);

                if (old) {
                    // Detectar cambios reales
                    const cambios = {};
                    for (const f of fieldsToCheck) {
                        let oldVal = old[f];
                        let newVal = reg[f];
                        if (oldVal === undefined || oldVal === '') oldVal = null;
                        if (newVal === undefined || newVal === '') newVal = null;
                        if (booleanFields.has(f)) {
                            oldVal = oldVal === null ? false : Boolean(Number(oldVal));
                            newVal = newVal === null ? false : Boolean(Number(newVal));
                        }
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
                            reg.trabajador_id, globalObraId, fechaNormalizada,
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

            // Después del commit, registrar logs (no bloquea la respuesta)
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
     * Batch save — upsert transaccional multi-obra / multi-fecha en un único request.
     *
     * Wrapper sobre bulkCreate('ALL', ...) que valida que cada registro traiga
     * trabajador_id, obra_id y fecha. Devuelve el mismo shape que bulkCreate.
     *
     * Pensado para flujos tipo "Repetir día anterior" y futuras cargas bulk de
     * múltiples días / obras en un único POST.
     */
    async batchSave(registros, registradoPor, req) {
        if (!Array.isArray(registros) || registros.length === 0) return [];

        for (const [i, reg] of registros.entries()) {
            if (!reg || typeof reg !== 'object') {
                throw new Error(`Registro #${i} inválido`);
            }
            if (!reg.trabajador_id || !reg.obra_id || !reg.fecha) {
                throw new Error(`Registro #${i}: trabajador_id, obra_id y fecha son requeridos`);
            }
            if (!reg.estado_id) {
                throw new Error(`Registro #${i}: estado_id es requerido`);
            }
        }

        return this.bulkCreate('ALL', registros, registradoPor, req);
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

        let queryParams = [fecha];
        let queryStr = `SELECT a.*, ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color,
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
             WHERE a.fecha = ? AND t.activo = 1`;
             
        if (obraId !== 'ALL') {
            queryStr += ` AND a.obra_id = ?`;
            queryParams.push(obraId);
        }
        
        queryStr += ` ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC`;

        const [rows] = await db.query(queryStr, queryParams);
        return {
            registros: rows,
            feriado
        };
    },

    /**
     * Modificar asistencia con log de auditoría
     */
    async update(asistenciaId, data, modificadoPor) {
        // ── SEGURIDAD: Solo permitir campos válidos de la tabla ──
        const ALLOWED_FIELDS = new Set([
            'estado_id', 'tipo_ausencia_id', 'observacion',
            'hora_entrada', 'hora_salida', 'hora_colacion_inicio', 'hora_colacion_fin',
            'horas_extra', 'es_sabado'
        ]);
        const safeData = {};
        for (const key of Object.keys(data)) {
            if (ALLOWED_FIELDS.has(key)) safeData[key] = data[key];
        }
        if (Object.keys(safeData).length === 0) {
            throw Object.assign(new Error('No se proporcionaron campos válidos para actualizar'), { statusCode: 400 });
        }

        const conn = await db.getConnection();

        try {
            await conn.beginTransaction();

            const [current] = await conn.query('SELECT * FROM asistencias WHERE id = ?', [asistenciaId]);
            if (current.length === 0) {
                throw Object.assign(new Error('Asistencia no encontrada'), { statusCode: 404 });
            }

            const old = current[0];

            // Log each changed field
            for (const [campo, valorNuevo] of Object.entries(safeData)) {
                if (old[campo] !== undefined && String(old[campo]) !== String(valorNuevo)) {
                    await conn.query(
                        `INSERT INTO log_asistencia (asistencia_id, campo_modificado, valor_anterior, valor_nuevo, modificado_por)
                         VALUES (?, ?, ?, ?, ?)`,
                        [asistenciaId, campo, String(old[campo]), String(valorNuevo), modificadoPor]
                    );
                }
            }

            const fields = Object.keys(safeData).map(f => `${f} = ?`).join(', ');
            await conn.query(`UPDATE asistencias SET ${fields} WHERE id = ?`, [...Object.values(safeData), asistenciaId]);

            await conn.commit();
            return { id: asistenciaId, ...safeData };
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
        if (empresa_id && empresa_id !== 'null' && empresa_id !== 'undefined' && empresa_id !== '') { where.push('t.empresa_id = ?'); params.push(empresa_id); }
        if (cargo_id && cargo_id !== 'null' && cargo_id !== 'undefined' && cargo_id !== '') { where.push('t.cargo_id = ?'); params.push(cargo_id); }
        if (categoria_reporte && categoria_reporte !== 'null' && categoria_reporte !== 'undefined' && categoria_reporte !== '') { where.push('t.categoria_reporte = ?'); params.push(categoria_reporte); }
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
                    `INSERT INTO configuracion_horarios (obra_id, dia_semana, hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        hora_entrada = VALUES(hora_entrada),
                        hora_salida = VALUES(hora_salida),
                        hora_colacion_inicio = VALUES(hora_colacion_inicio),
                        hora_colacion_fin = VALUES(hora_colacion_fin)`,
                    [
                        obraId,
                        h.dia_semana,
                        h.hora_entrada,
                        h.hora_salida,
                        h.hora_colacion_inicio || '13:00:00',
                        h.hora_colacion_fin || '14:00:00'
                    ]
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

        // Tope de seguridad: evita exports de años completos que tumban el server.
        // 366 días permite reporte anual pero bloquea rangos absurdos.
        const MAX_DAYS = 366;
        const rangeDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        if (isNaN(rangeDays) || rangeDays < 0) {
            throw new Error('Rango de fechas inválido');
        }
        if (rangeDays > MAX_DAYS) {
            throw new Error(`Rango demasiado amplio (${rangeDays} días). Máximo permitido: ${MAX_DAYS} días.`);
        }

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
            // Tope de seguridad: evita IN (...) con miles de entradas que revienta
            // el query parser y abre puerta a DoS.
            const MAX_IDS = 2000;
            if (ids.length > MAX_IDS) {
                throw new Error(`Demasiados trabajador_ids (${ids.length}). Máximo: ${MAX_IDS}.`);
            }
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

        // ── Incluir trabajadores trasladados que ya no pertenecen a esta obra ──
        // Después de un TO, el worker.obra_id cambia al destino, pero sus registros
        // de asistencia en la obra origen siguen existiendo. Los detectamos aquí.
        const workerIdsInList = new Set(workers.map(w => w.id));
        const missingWorkerIds = [...new Set(registros.map(r => r.trabajador_id))]
            .filter(id => !workerIdsInList.has(id));

        if (missingWorkerIds.length > 0) {
            const [extraWorkers] = await db.query(`
                SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
                       t.fecha_ingreso, t.fecha_desvinculacion,
                       c.nombre as cargo_nombre, t.activo, o.nombre as obra_actual_nombre,
                       e.id as empresa_id, e.razon_social as empresa_nombre, t.categoria_reporte
                FROM trabajadores t
                LEFT JOIN cargos c ON t.cargo_id = c.id
                LEFT JOIN obras o ON t.obra_id = o.id
                LEFT JOIN empresas e ON t.empresa_id = e.id
                WHERE t.id IN (${missingWorkerIds.map(() => '?').join(',')})
                ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC
            `, missingWorkerIds);
            workers.push(...extraWorkers);
        }

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

        // Helper para calcular la resta de horas en un formato "HH:MM"
        const getDiffHours = (start, end) => {
            if (!start || !end) return 0;
            try {
                const [sH, sM] = start.split(':').map(Number);
                const [eH, eM] = end.split(':').map(Number);
                const s = sH + sM / 60;
                const e = eH + eM / 60;
                if (e < s) return (24 - s) + e; // por si hay cruce nocturno
                return e - s;
            } catch(err) { return 0; }
        };

        // ── Obtener Configuración de Horas Base (Deficit Engine) ──
        const [horariosDb] = await db.query('SELECT * FROM configuracion_horarios WHERE activo = TRUE');
        const horariosMap = {};
        horariosDb.forEach(h => {
            if (!horariosMap[h.obra_id]) horariosMap[h.obra_id] = {};
            // Calcular cuantas horas exige la empresa ese día (jornada menos colación)
            const colacionHoras = (h.hora_colacion_inicio && h.hora_colacion_fin)
                ? getDiffHours(h.hora_colacion_inicio, h.hora_colacion_fin)
                : 0;
            const val = getDiffHours(h.hora_entrada, h.hora_salida) - colacionHoras;
            horariosMap[h.obra_id][h.dia_semana] = Math.max(0, val);
        });
        const defaultHorario = { lun:9, mar:9, mie:9, jue:9, vie:9, sab:0, dom:0 };
        const jsDaysMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

        let maxStrDateInRecords = '';
        registros.forEach(r => {
            const dStr = formatDate(r.fecha);
            if (dStr > maxStrDateInRecords) maxStrDateInRecords = dStr;
        });
        if (!maxStrDateInRecords) maxStrDateInRecords = formatDate(new Date());

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

        // ── Códigos que suman como día trabajado (DINÁMICO desde BD) ──
        // Se lee el campo es_presente de estados_asistencia para que cualquier
        // cambio en la configuración se refleje automáticamente en el Excel.
        // Se aplican las mismas consolidaciones de código (NAC/DEF/MAT→PL, AT→JI).
        const codigosSumanDia = [...new Set(
            estados
                .filter(e => e.es_presente)
                .map(e => {
                    let cod = e.codigo;
                    if (['NAC', 'DEF', 'MAT'].includes(cod)) cod = 'PL';
                    if (cod === 'AT') cod = 'JI';
                    return cod;
                })
        )];
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

            const horasOrdCol = totalCol + 1;
            ws.mergeCells(7, horasOrdCol, 8, horasOrdCol);
            const horasOrdHeader = ws.getCell(7, horasOrdCol);
            horasOrdHeader.value = 'BALANCE HRS ORDINARIO';
            horasOrdHeader.font = { bold: true, size: 8 };
            horasOrdHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            horasOrdHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFF0' } };
            horasOrdHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const horasExtCol = horasOrdCol + 1;
            ws.mergeCells(7, horasExtCol, 8, horasExtCol);
            const horasExtHeader = ws.getCell(7, horasExtCol);
            horasExtHeader.value = 'TOTAL HRS EXTRA';
            horasExtHeader.font = { bold: true, size: 8 };
            horasExtHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            horasExtHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFF0' } };
            horasExtHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const obsCol = horasExtCol + 1;
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

                let sumHorasExtra = 0;
                let sumHorasOrd = 0;
                let sumMetaOrd = 0; // Para el cálculo de deficit
                const obrHorario = horariosMap[worker.obra_id] || defaultHorario;

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

                    // Si es día hábil laborable y exigible, sumar a Meta de horas "Deber"
                    if (!isOutOfRange && fStr <= maxStrDateInRecords && !isFeriado) {
                        const dayKey = jsDaysMap[day.getDay()];
                        const expected = obrHorario[dayKey] || 0;
                        sumMetaOrd += expected;
                    }

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

                        // Cálculo Exacto de Horas (Sumatoria)
                        const hsExtra = parseFloat(reg.horas_extra) || 0;
                        sumHorasExtra += hsExtra;
                        
                        let calc = 0;
                        let customSchedule = false;

                        if (est && est.es_presente && !isWeekend && !isFeriado) {
                            if (reg.hora_entrada && reg.hora_salida) {
                                calc = getDiffHours(reg.hora_entrada, reg.hora_salida);
                                if (reg.hora_colacion_inicio && reg.hora_colacion_fin) {
                                    const col = getDiffHours(reg.hora_colacion_inicio, reg.hora_colacion_fin);
                                    calc = Math.max(0, calc - col);
                                } else {
                                    // Restar 1 hora por defecto de colación
                                    calc = Math.max(0, calc - 1);
                                }
                                customSchedule = true;
                            } else if (codigo === 'JI') {
                                calc = 4.5; // Jornada Incompleta
                            } else {
                                calc = 9; // Jornada Completa por defecto
                            }
                            sumHorasOrd += calc;
                        }

                        // ── Observación como comentario en la celda ──
                        const noteTexts = [];
                        if (reg.observacion && reg.observacion.trim()) {
                            noteTexts.push(reg.observacion.trim());
                        }

                        // Agregar "auto nota" de desglose si se modificó o hay extras
                        if (customSchedule || hsExtra > 0) {
                            let dText = `Detalle Horas:\n• Ordinarias: ${calc.toFixed(2)}`;
                            if (hsExtra > 0) dText += `\n• Extras: ${hsExtra.toFixed(2)}`;
                            
                            if (customSchedule) {
                                dText += `\n\nMarcas de Reloj:\n📥 Ent: ${reg.hora_entrada} | 📤 Sal: ${reg.hora_salida}`;
                                if (reg.hora_colacion_inicio && reg.hora_colacion_fin) {
                                    dText += `\n🍱 Colación: ${reg.hora_colacion_inicio} - ${reg.hora_colacion_fin}`;
                                }
                            }
                            noteTexts.push(dText);
                        }

                        if (noteTexts.length > 0) {
                            cell.note = {
                                texts: [{ text: noteTexts.join('\n\n---\n\n') }],
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
                
                // Balance de Déficit Resultante
                const deficitBalance = sumHorasOrd - sumMetaOrd;
                const cOrd = ws.getCell(rowIdx, horasOrdCol);
                cOrd.value = deficitBalance;
                cOrd.numFmt = '0.00';
                
                const cExt = ws.getCell(rowIdx, horasExtCol);
                cExt.value = sumHorasExtra;
                cExt.numFmt = '0.00';
                
                [ws.getCell(rowIdx, q1Col), ws.getCell(rowIdx, q2Col), ws.getCell(rowIdx, totalCol), cExt].forEach(c => {
                    c.font = { bold: true, size: 9 };
                    c.alignment = { horizontal: 'center', vertical: 'middle' };
                    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });
                
                // Colorización dinámica de BALANCE (Rojo si hay déficit)
                cOrd.font = { bold: true, size: 9, color: deficitBalance < 0 ? { argb: 'FFDD0000' } : undefined };
                cOrd.alignment = { horizontal: 'center', vertical: 'middle' };
                cOrd.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                // Estilos de fila comunes
                for (let c = 1; c <= 8; c++) {
                    const cell = ws.getCell(rowIdx, c);
                    cell.font = { size: 8 };
                    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                }

                // ── Columna OBSERVACIONES: recopilar observaciones del mes ──
                const obsTexts = [];
                days.forEach((day) => {
                    const fStr = formatDate(day);
                    const reg = attendanceMap[worker.id]?.[fStr];
                    if (reg && reg.observacion && reg.observacion.trim()) {
                        obsTexts.push(reg.observacion.trim());
                    }
                });
                
                // Deduplicar y escribir en la columna final
                const uniqueObs = [...new Set(obsTexts)];
                if (uniqueObs.length > 0) {
                    const obsCell = ws.getCell(rowIdx, obsCol);
                    obsCell.value = uniqueObs.join('\n');
                    obsCell.font = { size: 7 };
                    obsCell.alignment = { vertical: 'top', wrapText: true };
                    obsCell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
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
            ws.getColumn(horasOrdCol).width = 13;
            ws.getColumn(horasExtCol).width = 13;
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
        // Transacción + SELECT ... FOR UPDATE para evitar race condition
        // cuando dos usuarios cancelan el mismo período simultáneamente
        // (doble DELETE de asistencias, doble log). El lock de fila serializa.
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [existing] = await connection.query(
                'SELECT * FROM periodos_ausencia WHERE id = ? FOR UPDATE',
                [periodoId]
            );
            if (existing.length === 0) {
                await connection.rollback();
                throw new Error('Período no encontrado');
            }
            const period = existing[0];

            // Si ya está cancelado, salir idempotente sin re-borrar asistencias.
            if (period.activo === 0 || period.activo === false) {
                await connection.commit();
                return { id: periodoId, cancelado: true, yaCancelado: true };
            }

            await connection.query(
                'UPDATE periodos_ausencia SET activo = FALSE, updated_at = NOW() WHERE id = ?',
                [periodoId]
            );

            await connection.query(
                `DELETE FROM asistencias
                 WHERE trabajador_id = ?
                 AND obra_id = ?
                 AND fecha BETWEEN ? AND ?
                 AND estado_id = ?`,
                [period.trabajador_id, period.obra_id, period.fecha_inicio, period.fecha_fin, period.estado_id]
            );

            await connection.commit();

            try {
                logManualActivity(userId, 'periodos_ausencia', 'DELETE', periodoId,
                    JSON.stringify({ resumen: `Período #${periodoId} cancelado (${period.fecha_inicio} al ${period.fecha_fin})` }),
                    req
                );
            } catch (logErr) {
                console.error('Error registrando log:', logErr);
            }

            return { id: periodoId, cancelado: true };
        } catch (err) {
            try { await connection.rollback(); } catch { /* ya commiteado */ }
            throw err;
        } finally {
            connection.release();
        }
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
            // Formatear fecha para trazabilidad (dd/mm/yyyy)
            const fechaParts = fecha.split('-');
            const fechaFormateada = `${fechaParts[2]}/${fechaParts[1]}/${fechaParts[0]}`;
            const observacionOrigen = `Traslado a: ${obraDestino.nombre} (${fechaFormateada})${comentario ? ' | Nota: ' + comentario : ''}`;
            const observacionDestino = `Traslado desde: ${obraOrigen.nombre} (${fechaFormateada})${comentario ? ' | Nota: ' + comentario : ''}`;

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
    },

    /**
     * Calcula alertas de faltas para trabajadores de una obra (o todas) en un mes calendario.
     * Reglas:
     *   - 2 días seguidos de falta (F) dentro del mismo mes
     *   - 2 lunes con falta (F) en el mes
     *   - 3 o más días de falta (F) totales en el mes
     * Solo se considera el estado con código 'F'.
     */
    async getAlertasFaltas(obraId, mes, anio) {
        // 1. Obtener el ID del estado 'F'
        const [estadoF] = await db.query("SELECT id FROM estados_asistencia WHERE codigo = 'F' AND activo = 1");
        if (!estadoF || estadoF.length === 0) return [];
        const faltaId = estadoF[0].id;

        // 2. Rango del mes calendario
        const startDate = `${anio}-${String(mes).padStart(2, '0')}-01`;
        const lastDay = new Date(anio, mes, 0).getDate();
        const endDate = `${anio}-${String(mes).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // 3. Obtener todas las faltas del mes
        let faltasQuery = `
            SELECT a.trabajador_id, a.fecha, a.obra_id,
                   t.nombres, t.apellido_paterno, t.rut
            FROM asistencias a
            JOIN trabajadores t ON a.trabajador_id = t.id
            WHERE a.estado_id = ? AND a.fecha BETWEEN ? AND ? AND t.activo = 1
        `;
        const params = [faltaId, startDate, endDate];

        if (obraId !== 'ALL') {
            faltasQuery += ' AND t.obra_id = ?';
            params.push(obraId);
        }

        // Tope de seguridad: ~50k filas = muy por encima del peor mes real
        // (todos los trabajadores faltando todos los días). Si se alcanza, lo
        // logueamos para saber que hay que reajustar la regla.
        const MAX_FALTAS = 50000;
        faltasQuery += ' ORDER BY a.trabajador_id, a.fecha ASC LIMIT ?';
        params.push(MAX_FALTAS);
        const [faltas] = await db.query(faltasQuery, params);
        if (faltas.length >= MAX_FALTAS) {
            console.warn(`⚠️  getAlertasFaltas alcanzó el tope de ${MAX_FALTAS} filas (obra=${obraId}, ${mes}/${anio}). Resultado posiblemente truncado.`);
        }

        // 4. Agrupar por trabajador
        //    Usamos Set para deduplicar fechas — un trabajador puede tener 2 filas
        //    de asistencia en el mismo día si hubo traslado de obra u otra
        //    situación que produzca registros en obras distintas. Para la regla
        //    de "faltas" nos importa el día, no la cantidad de filas.
        const porTrabajador = {};
        faltas.forEach(f => {
            if (!porTrabajador[f.trabajador_id]) {
                porTrabajador[f.trabajador_id] = {
                    trabajador_id: f.trabajador_id,
                    nombres: f.nombres,
                    apellido_paterno: f.apellido_paterno,
                    rut: f.rut,
                    fechasSet: new Set()
                };
            }
            const fechaStr = typeof f.fecha === 'string' ? f.fecha.split('T')[0] : f.fecha.toISOString().split('T')[0];
            porTrabajador[f.trabajador_id].fechasSet.add(fechaStr);
        });

        // 5. Evaluar reglas por trabajador
        const alertas = [];

        for (const [tid, data] of Object.entries(porTrabajador)) {
            const fechas = [...data.fechasSet].sort(); // orden ascendente para regla de consecutivas
            const trabajadorAlerts = [];

            // Regla 1: 2 días seguidos de falta
            for (let i = 0; i < fechas.length - 1; i++) {
                const d1 = new Date(fechas[i] + 'T12:00:00');
                const d2 = new Date(fechas[i + 1] + 'T12:00:00');
                const diffMs = d2.getTime() - d1.getTime();
                const diffDays = diffMs / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    trabajadorAlerts.push({
                        tipo: 'consecutivas',
                        mensaje: `Falta 2 días seguidos (${fechas[i].split('-').reverse().join('/')} y ${fechas[i + 1].split('-').reverse().join('/')})`
                    });
                    break; // Solo una alerta de este tipo por trabajador
                }
            }

            // Regla 2: 2 lunes con falta
            const lunesFalta = fechas.filter(f => {
                const d = new Date(f + 'T12:00:00');
                return d.getDay() === 1; // 1 = lunes
            });
            if (lunesFalta.length >= 2) {
                trabajadorAlerts.push({
                    tipo: 'lunes',
                    mensaje: `Falta ${lunesFalta.length} lunes en el mes (${lunesFalta.map(l => l.split('-')[2]).join(', ')})`
                });
            }

            // Regla 3: 3 o más días de falta total
            if (fechas.length >= 3) {
                trabajadorAlerts.push({
                    tipo: 'acumuladas',
                    mensaje: `${fechas.length} faltas acumuladas en el mes`
                });
            }

            if (trabajadorAlerts.length > 0) {
                alertas.push({
                    trabajador_id: parseInt(tid),
                    nombres: data.nombres,
                    apellido_paterno: data.apellido_paterno,
                    rut: data.rut,
                    total_faltas: fechas.length,
                    alertas: trabajadorAlerts
                });
            }
        }

        return alertas;
    }
};

module.exports = asistenciaService;

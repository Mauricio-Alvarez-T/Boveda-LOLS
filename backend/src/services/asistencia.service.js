const db = require('../config/db');
const ExcelJS = require('exceljs');
const { logManualActivity } = require('../middleware/logger');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger-structured');

// ── Monkey patch: tamaño dinámico del cuadro de comentarios (.xlsx) ──
// ExcelJS 4.4.0 hardcodea el shape VML de las notas en 97.8pt × 59.1pt
// (~131 × 79 px) sin exponer API para cambiarlo. Microsoft Excel respeta
// exactamente ese tamaño al hover, recortando textos largos. El usuario
// vio "Detalle Horas: Ordinari..." cortado a la mitad. Google Sheets
// renderiza el comentario en un overlay propio sin respetar el shape, por
// eso allá sí se ve completo.
//
// Solución: override de V_SHAPE_ATTRIBUTES para que lea dimensiones desde
// `model.note.size = { width, height }` (extensión propia que asignamos
// en `cell.note = { texts: [...], size: {...} }`). Si la nota no trae
// size, cae al default de ExcelJS. Helper computeNoteSize() abajo calcula
// dimensiones a partir del texto: ancho según línea más larga, alto según
// número de líneas.
try {
    // eslint-disable-next-line global-require
    const VmlShapeXform = require('exceljs/lib/xlsx/xform/comment/vml-shape-xform');
    // eslint-disable-next-line global-require
    const VmlClientDataXform = require('exceljs/lib/xlsx/xform/comment/vml-client-data-xform');

    if (VmlShapeXform && VmlShapeXform.V_SHAPE_ATTRIBUTES && !VmlShapeXform.__patchedSize) {
        VmlShapeXform.V_SHAPE_ATTRIBUTES = (model, index) => {
            const size = (model.note && model.note.size) || {};
            const w = Number.isFinite(size.width) ? size.width : 97.8;
            const h = Number.isFinite(size.height) ? size.height : 59.1;
            return {
                id: `_x0000_s${1025 + index}`,
                type: '#_x0000_t202',
                style: `position:absolute; margin-left:80pt; margin-top:10pt; width:${w}pt; height:${h}pt; z-index:1; visibility:hidden`,
                fillcolor: 'infoBackground [80]',
                strokecolor: 'none [81]',
                'o:insetmode': model.note.margins && model.note.margins.insetmode,
            };
        };
        VmlShapeXform.__patchedSize = true;
    }

    // Microsoft Excel desktop respeta el `<x:Anchor>` ANTES que el style del
    // shape para dimensionar el cuadro de comentario en celdas. ExcelJS por
    // default genera anchor de ~2 cols × 4 rows (chico). Inyectamos un
    // anchor calculado a partir de `model.note.size` para que Excel también
    // crezca la caja. Si la nota no trae size, anchor default permanece.
    if (VmlClientDataXform && VmlClientDataXform.prototype && !VmlClientDataXform.prototype.__patchedAnchor) {
        const VmlAnchorXform = require('exceljs/lib/xlsx/xform/comment/vml-anchor-xform');
        const origAnchorRender = VmlAnchorXform.prototype.render;
        VmlAnchorXform.prototype.render = function patchedAnchorRender(xmlStream, model) {
            const size = (model.note && model.note.size) || {};
            const w = Number.isFinite(size.width) ? size.width : 0;
            const h = Number.isFinite(size.height) ? size.height : 0;
            // Si tenemos size, derivamos cols/rows. Aprox: col ≈ 48pt ancho,
            // row ≈ 15pt alto en defaults de Excel. Margen extra +1 col/+1 row
            // para que el texto no quede pegado a la pared.
            if ((w > 0 || h > 0) && model.refAddress && !model.anchor) {
                const cols = w > 0 ? Math.max(2, Math.ceil(w / 48) + 1) : 2;
                const rows = h > 0 ? Math.max(4, Math.ceil(h / 15) + 1) : 4;
                const l = model.refAddress.col;
                const lf = 6;
                const t = Math.max(model.refAddress.row - 2, 0);
                const tf = 14;
                const r = l + cols;
                const rf = 2;
                const b = t + rows;
                const bf = 16;
                xmlStream.leafNode('x:Anchor', null, [l, lf, t, tf, r, rf, b, bf].join(', '));
                return;
            }
            return origAnchorRender.call(this, xmlStream, model);
        };
        VmlClientDataXform.prototype.__patchedAnchor = true;
    }
} catch (e) {
    logger.warn('[asistencia] no se pudo aplicar monkey patch a ExcelJS comment shape/anchor', { err: e.message });
}

/**
 * Calcula dimensiones del cuadro de comentario en función del texto.
 * Heurística empírica para Calibri 8pt (font default de comments en Excel):
 *   - char ≈ 4pt de ancho promedio
 *   - línea ≈ 12pt de alto + 4pt interlineado
 * Mín/máx cap para que la caja no quede absurdamente chica ni desbordando.
 *
 * @param {string} text - texto crudo de la nota (puede tener \n)
 * @returns {{width:number, height:number}} dimensiones en pt
 */
function computeNoteSize(text) {
    if (!text) return { width: 100, height: 60 };
    const lines = String(text).split('\n');
    const maxChars = lines.reduce((m, l) => Math.max(m, l.length), 0);
    // Ancho: ~4.5pt por char + 16pt padding lateral. Cap [120, 360].
    const width = Math.max(120, Math.min(360, Math.round(maxChars * 4.5 + 16)));
    // Alto: ~14pt por línea + 16pt padding vertical. Cap [50, 320].
    const height = Math.max(50, Math.min(320, Math.round(lines.length * 14 + 16)));
    return { width, height };
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    logger.fatal('JWT_SECRET no está configurado en las variables de entorno.');
    process.exit(1);
}

const asistenciaService = {
    /**
     * Genera un token firmado para descarga pública.
     *
     * SEGURIDAD (token confusion): el token de descarga se firma con el MISMO
     * `JWT_SECRET` que los tokens de sesión. Para que un token de descarga NO
     * pueda usarse como `Authorization: Bearer` y escalar privilegios:
     *   (1) sólo se firman los campos de reporte (whitelist) — nunca `p`,
     *       `rol_id`, `rv`, `id`, etc. que el caller pudiera inyectar por query;
     *   (2) se marca con `typ: 'public-report'`, que el middleware de sesión
     *       (`middleware/auth.js`) rechaza explícitamente.
     */
    generatePublicReportToken(params = {}) {
        const REPORT_FIELDS = ['obra_id', 'fecha_inicio', 'fecha_fin', 'empresa_id', 'cargo_id', 'categoria_reporte', 'activo', 'trabajador_ids'];
        const payload = { typ: 'public-report' };
        for (const k of REPORT_FIELDS) {
            if (params[k] !== undefined) payload[k] = params[k];
        }
        return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    },

    /**
     * Valida un token de descarga y retorna sus parámetros de reporte.
     * Exige `typ === 'public-report'` para que un token de sesión no pueda
     * usarse aquí (ni viceversa).
     */
    validatePublicReportToken(token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            if (decoded.typ !== 'public-report') {
                throw new Error('tipo de token no válido para descarga');
            }
            return decoded;
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

        // Cap defensivo contra DoS. Frontend nunca envía más que trabajadores visibles
        // (<1000 realistas), así que este límite protege sin bloquear uso legítimo.
        const MAX_REGISTROS = 1000;
        if (registros.length > MAX_REGISTROS) {
            throw Object.assign(
                new Error(`Demasiados registros en un solo batch (${registros.length}). Máximo permitido: ${MAX_REGISTROS}.`),
                { statusCode: 413 }
            );
        }

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

            // Tope futuro: máximo 30 días desde hoy (regla operativa jefatura).
            // Pasado no se limita — se puede registrar histórico sin restricción.
            // Hoy se calcula en zona horaria local del servidor (cPanel = Chile).
            const MAX_DIAS_FUTURO = 30;
            const limiteFuturo = new Date();
            limiteFuturo.setDate(limiteFuturo.getDate() + MAX_DIAS_FUTURO);
            const limiteFuturoStr = limiteFuturo.toISOString().split('T')[0];
            for (const fecha of fechasUnicas) {
                if (fecha > limiteFuturoStr) {
                    throw Object.assign(
                        new Error(`No se puede registrar asistencia más de ${MAX_DIAS_FUTURO} días en el futuro (${fecha} excede ${limiteFuturoStr})`),
                        { statusCode: 400 }
                    );
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
            const booleanFields = new Set();
            const numericFields = new Set(['estado_id', 'tipo_ausencia_id', 'horas_extra']);
            const fieldsToCheck = ['estado_id', 'tipo_ausencia_id', 'observacion', 'hora_entrada', 'hora_salida', 'hora_colacion_inicio', 'hora_colacion_fin', 'horas_extra'];
            // Filas escritas en esta transacción — para la limpieza de duplicados
            // cross-obra (regla "fila vigente", docs/reglas/asistencia.md).
            const escritos = [];

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
                         horas_extra = ?
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
                            old.id
                        ]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'updated', id: old.id });
                    escritos.push({ trabajador_id: reg.trabajador_id, fecha: fechaNormalizada, obra_id: globalObraId, id: old.id });

                    if (Object.keys(cambios).length > 0) {
                        logEntries.push({
                            trabajador_id: reg.trabajador_id,
                            asistencia_id: old.id,
                            obra_id: globalObraId,
                            estado_id: reg.estado_id,
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
                          horas_extra, registrado_por)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                            registradoPor
                        ]
                    );
                    results.push({ trabajador_id: reg.trabajador_id, action: 'created', id: result.insertId });
                    escritos.push({ trabajador_id: reg.trabajador_id, fecha: fechaNormalizada, obra_id: globalObraId, id: result.insertId });

                    logEntries.push({
                        trabajador_id: reg.trabajador_id,
                        asistencia_id: result.insertId,
                        obra_id: globalObraId,
                        estado_id: reg.estado_id,
                        accion: 'CREATE',
                        cambios: null,
                        fecha: fechaNormalizada
                    });
                }
            }

            // Regla "fila vigente": borrar duplicados MÁS ANTIGUOS del mismo día
            // en otras obras (protege TO y filas más nuevas — ver helper).
            await this._limpiarDuplicadosCrossObra(conn, escritos);

            await conn.commit();

            // Después del commit, registrar logs (no bloquea la respuesta)
            if (logEntries.length > 0) {
                this._logBulkChanges(logEntries, obraId, registradoPor, req).catch(err => {
                    logger.error('Error al registrar logs de asistencia', { err: err.message });
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
    /**
     * Lista COMPLETA de lo borrable en una fecha (alimenta el modal de la goma).
     * La grilla del Registro Diario NO sirve como fuente: deja invisibles
     * (caso real TOESCA 2026-08-27) a
     *   1. miembros actuales de la obra cuya fila del día vive en OTRA obra
     *      (marcados antes de un traslado — la grilla los rehidrata como
     *      "sin guardar"),
     *   2. trabajadores FINIQUITADOS con filas (la vista filtra t.activo=1
     *      pero el Excel sí los pinta),
     *   3. filas en obras finalizadas.
     * Este método los incluye todos; solo `es_prueba = 1` queda fuera
     * (aislamiento de datos de prueba). Devuelve un item por trabajador con el
     * detalle de SUS filas (obra + estado) para que el modal muestre dónde vive
     * cada registro antes de borrar.
     */
    async getBorrables(fecha, obraId) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
            throw Object.assign(new Error('Fecha inválida (se espera YYYY-MM-DD)'), { statusCode: 400 });
        }
        let where = 'a.fecha = ? AND t.es_prueba = 0';
        const params = [fecha];
        if (obraId) {
            // Filas EN la obra (de cualquiera, incl. ex-miembros e inactivos) +
            // filas de MIEMBROS ACTUALES de la obra guardadas en otras obras.
            where += ' AND (a.obra_id = ? OR t.obra_id = ?)';
            params.push(Number(obraId), Number(obraId));
        }
        const [rows] = await db.query(
            `SELECT a.trabajador_id, a.obra_id, ea.codigo AS estado_codigo,
                    t.nombres, t.apellido_paterno, t.rut, t.activo,
                    t.obra_id AS obra_actual_id,
                    o.nombre AS obra_nombre, oa.nombre AS obra_actual_nombre
             FROM asistencias a
             JOIN trabajadores t ON t.id = a.trabajador_id
             JOIN estados_asistencia ea ON ea.id = a.estado_id
             LEFT JOIN obras o ON o.id = a.obra_id
             LEFT JOIN obras oa ON oa.id = t.obra_id
             WHERE ${where}
             ORDER BY t.apellido_paterno ASC, t.nombres ASC, a.id ASC`,
            params
        );
        const porTrabajador = new Map();
        for (const r of rows) {
            if (!porTrabajador.has(r.trabajador_id)) {
                porTrabajador.set(r.trabajador_id, {
                    trabajador_id: r.trabajador_id,
                    nombre: `${r.apellido_paterno || ''} ${r.nombres || ''}`.trim(),
                    rut: r.rut,
                    activo: !!r.activo,
                    obra_actual_id: r.obra_actual_id,
                    obra_actual_nombre: r.obra_actual_nombre || 'Sin Obra',
                    filas: [],
                });
            }
            porTrabajador.get(r.trabajador_id).filas.push({
                obra_id: r.obra_id,
                obra_nombre: r.obra_nombre || `Obra ${r.obra_id}`,
                estado_codigo: r.estado_codigo,
                es_to: r.estado_codigo === 'TO',
            });
        }
        return [...porTrabajador.values()];
    },

    /**
     * Borrado correctivo (goma de borrar): elimina la asistencia GUARDADA de uno
     * o varios trabajadores en una fecha. Nace del caso real 2026-08-26: marcaron
     * asistencia a los 194 trabajadores en el día equivocado y no había deshacer.
     *
     * Alcance ("borrar el DÍA del trabajador", 2026-08-26 v2):
     *   · con obra_id → las filas de ESA obra (cualquier estado) MÁS las filas del
     *     mismo día en OTRAS obras cuyo estado no sea TO. Bajo la regla "fila
     *     vigente" esas filas ajenas son duplicados/errores por definición — caso
     *     real TOESCA: se marcó el día antes de un traslado, la fila vieja quedaba
     *     invisible para la vista de la obra nueva y el Excel global la seguía
     *     pintando. El TO de origen (par TO+A legítimo) se PRESERVA y se avisa en
     *     traslados_restantes.
     *   · sin obra_id (Reporte Global) → TODAS las filas del día del trabajador,
     *     incluidas duplicadas cross-obra y pares de traslado TO+A: "borrar el día"
     *     significa dejarlo limpio, no dejar vivo un duplicado oculto (regla
     *     "fila vigente", docs/reglas/asistencia.md).
     *
     * El DELETE es físico: log_asistencia cae por FK ON DELETE CASCADE, y el
     * borrado queda auditado en logs_actividad (quién, fecha, cuántos, quiénes).
     * Se seleccionan ids exactos ANTES de borrar — no se borra nada que se haya
     * creado entre medio.
     */
    async borrarDia({ fecha, trabajador_ids, obra_id }, userId, req) {
        const MAX_TRABAJADORES = 500;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fecha || ''))) {
            throw Object.assign(new Error('Fecha inválida (se espera YYYY-MM-DD)'), { statusCode: 400 });
        }
        const ids = [...new Set((trabajador_ids || []).map(Number))];
        if (ids.length === 0 || ids.some(n => !Number.isInteger(n) || n < 1)) {
            throw Object.assign(new Error('trabajador_ids debe ser una lista de ids válidos'), { statusCode: 400 });
        }
        if (ids.length > MAX_TRABAJADORES) {
            throw Object.assign(new Error(`Demasiados trabajadores en un solo borrado (${ids.length}). Máximo: ${MAX_TRABAJADORES}.`), { statusCode: 400 });
        }

        let where = 'fecha = ? AND trabajador_id IN (?)';
        const params = [fecha, ids];
        if (obra_id) {
            // Filas de ESTA obra + filas del día en otras obras que NO sean TO
            // (duplicados/errores bajo la regla fila-vigente). El TO ajeno vive.
            where += ` AND (obra_id = ? OR estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO'))`;
            params.push(Number(obra_id));
        }

        // Snapshot completo ANTES de borrar: estado/horas/observación por fila.
        // Va entero al log de auditoría — sin esto, un borrado sobre el día
        // equivocado sería irreconstruible (log_asistencia cae por FK CASCADE).
        const [filas] = await db.query(
            `SELECT id, trabajador_id, obra_id, estado_id, horas_extra, observacion
             FROM asistencias WHERE ${where}`,
            params
        );
        if (filas.length === 0) return { borrados: 0, trabajadores: 0, con_periodo: 0, traslados_restantes: 0 };

        await db.query('DELETE FROM asistencias WHERE id IN (?)', [[...filas.map(f => f.id)]]);

        const afectados = [...new Set(filas.map(f => f.trabajador_id))];

        // Avisos post-borrado (nunca revierten nada; ante error informan 0):
        // 1) Días cubiertos por un PERÍODO activo (V/LM…): el período los va a
        //    re-sintetizar en la vista — la goma no cancela períodos.
        let conPeriodo = 0;
        try {
            const [pers] = await db.query(
                `SELECT COUNT(DISTINCT p.trabajador_id) AS n
                 FROM periodos_ausencia p
                 WHERE p.activo = TRUE AND p.trabajador_id IN (?)
                   AND ? BETWEEN p.fecha_inicio AND p.fecha_fin`,
                [afectados, fecha]
            );
            conPeriodo = Number(pers[0]?.n) || 0;
        } catch (e) { /* informativo */ }

        // 2) Con scope por obra se puede partir un par de traslado TO+A: si se
        //    borró la llegada (A destino), el TO del origen queda vivo y sigue
        //    contando día trabajado. Se detecta y se avisa.
        let trasladosRestantes = 0;
        if (obra_id) {
            try {
                const [tos] = await db.query(
                    `SELECT COUNT(*) AS n
                     FROM asistencias a
                     JOIN estados_asistencia ea ON ea.id = a.estado_id
                     WHERE a.fecha = ? AND a.trabajador_id IN (?) AND a.obra_id <> ?
                       AND ea.codigo = 'TO'`,
                    [fecha, afectados, Number(obra_id)]
                );
                trasladosRestantes = Number(tos[0]?.n) || 0;
            } catch (e) { /* informativo */ }
        }

        // Auditoría: un solo log con snapshot por fila (permite restauración
        // manual). El lookup de nombres es OPCIONAL: si falla, se loguea igual
        // con los ids — un borrado masivo jamás queda sin rastro.
        try {
            let lista = afectados;
            try {
                const [nombres] = await db.query(
                    'SELECT id, nombres, apellido_paterno FROM trabajadores WHERE id IN (?)',
                    [afectados]
                );
                lista = nombres
                    .map(w => `${w.nombres} ${w.apellido_paterno}`.trim())
                    .sort((a, b) => a.localeCompare(b, 'es'));
            } catch (e) { /* nombres opcionales: los ids bastan para el rastro */ }
            const detalle = JSON.stringify({
                resumen: `Borrado correctivo: ${filas.length} registro(s) de asistencia del ${fecha} (${afectados.length} trabajador(es))${obra_id ? ` en obra ${obra_id}` : ' en todas las obras'}`,
                fecha,
                obra_id: obra_id || null,
                registros_borrados: filas.length,
                trabajadores: lista,
                // Snapshot restaurable: qué tenía cada fila al momento de borrar.
                filas: filas.map(f => ({
                    trabajador_id: f.trabajador_id, obra_id: f.obra_id, estado_id: f.estado_id,
                    ...(f.horas_extra != null && Number(f.horas_extra) !== 0 ? { horas_extra: f.horas_extra } : {}),
                    ...(f.observacion ? { observacion: f.observacion } : {}),
                })),
            });
            await logManualActivity(userId, 'asistencias', 'DELETE', null, detalle, req);
        } catch (e) { /* la auditoría nunca revierte un borrado ya hecho */ }

        return {
            borrados: filas.length,
            trabajadores: afectados.length,
            con_periodo: conPeriodo,
            traslados_restantes: trasladosRestantes,
        };
    },

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
     * Registra logs de cambios de asistencia.
     *
     * Regla de agrupación:
     *   - Agrupa por obra_id.
     *   - Si un grupo tiene ≥2 entries → 1 fila en logs_actividad con type=bulk_asistencia
     *     (lista completa de trabajadores en el JSON detalle).
     *   - Si un grupo tiene 1 entry → 1 fila formato compact (comportamiento previo).
     *
     * Se ejecuta después del commit para no impactar la transacción principal.
     */
    async _logBulkChanges(entries, obraId, userId, req) {
        if (!entries || entries.length === 0) return;

        // ── Batch lookups ──
        const workerIds = [...new Set(entries.map(e => e.trabajador_id))];
        const [workers] = await db.query(
            'SELECT id, nombres, apellido_paterno FROM trabajadores WHERE id IN (?)',
            [workerIds]
        );
        const workerMap = new Map(workers.map(w => [w.id, {
            nombre: `${w.nombres} ${w.apellido_paterno}`,
            apellido: w.apellido_paterno || ''
        }]));

        const [estados] = await db.query('SELECT id, nombre FROM estados_asistencia');
        const estadoMap = Object.fromEntries(estados.map(e => [e.id, e.nombre]));

        let tipoAusenciaMap = {};
        try {
            const [tiposAusencia] = await db.query('SELECT id, nombre FROM tipos_ausencia');
            tipoAusenciaMap = Object.fromEntries(tiposAusencia.map(t => [t.id, t.nombre]));
        } catch (e) { /* tabla puede no existir */ }

        // Nombres de obras involucradas
        const obraIds = [...new Set(entries.map(e => e.obra_id).filter(x => x != null))];
        const obraMap = {};
        if (obraIds.length > 0) {
            const [obras] = await db.query(
                'SELECT id, nombre FROM obras WHERE id IN (?)',
                [obraIds]
            );
            for (const o of obras) obraMap[o.id] = o.nombre;
        }

        const fieldLabels = {
            estado_id: 'Estado',
            tipo_ausencia_id: 'Tipo Ausencia',
            observacion: 'Observación',
            hora_entrada: 'Hora Entrada',
            hora_salida: 'Hora Salida',
            hora_colacion_inicio: 'Inicio Colación',
            hora_colacion_fin: 'Fin Colación',
            horas_extra: 'Horas Extra'
        };

        const formatV = (v) => v === null || v === undefined ? '—' : (v === true ? 'Sí' : (v === false ? 'No' : String(v)));

        // Traduce cambios.estado_id / tipo_ausencia_id → nombres legibles
        const traducirCambios = (cambios) => {
            const out = { ...cambios };
            if (out.estado_id) {
                out.estado_id = {
                    de: estadoMap[out.estado_id.de] || out.estado_id.de,
                    a: estadoMap[out.estado_id.a] || out.estado_id.a
                };
            }
            if (out.tipo_ausencia_id) {
                out.tipo_ausencia_id = {
                    de: tipoAusenciaMap[out.tipo_ausencia_id.de] || out.tipo_ausencia_id.de,
                    a: tipoAusenciaMap[out.tipo_ausencia_id.a] || out.tipo_ausencia_id.a
                };
            }
            return out;
        };

        // Construir detalle compact para entries individuales (formato legacy)
        const buildCompactDetail = (entry) => {
            const nombreTrabajador = (workerMap.get(entry.trabajador_id) || {}).nombre || `ID ${entry.trabajador_id}`;
            if (entry.accion === 'CREATE') {
                return JSON.stringify({
                    resumen: `Asistencia registrada: ${nombreTrabajador} (${entry.fecha})`
                });
            }
            const cambiosLegibles = traducirCambios(entry.cambios || {});
            const resumenParts = [];
            for (const [key, val] of Object.entries(cambiosLegibles)) {
                const label = fieldLabels[key] || key;
                resumenParts.push(`${label}: ${formatV(val.de)} → ${formatV(val.a)}`);
            }
            return JSON.stringify({
                trabajador: nombreTrabajador,
                fecha: entry.fecha,
                cambios: cambiosLegibles,
                resumen: `${nombreTrabajador}: ${resumenParts.join(' | ')}`
            });
        };

        // ── Agrupar por obra_id ──
        const porObra = new Map();
        for (const entry of entries) {
            const key = entry.obra_id ?? 'null';
            if (!porObra.has(key)) porObra.set(key, []);
            porObra.get(key).push(entry);
        }

        for (const [obraKey, grupo] of porObra.entries()) {
            if (grupo.length === 1) {
                // 1 solo cambio → log individual compact (comportamiento previo)
                const entry = grupo[0];
                const detalle = buildCompactDetail(entry);
                await logManualActivity(userId, 'asistencias', entry.accion, entry.asistencia_id, detalle, req);
                continue;
            }

            // ≥2 cambios en la misma obra → log agrupado bulk_asistencia
            const obraIdNum = obraKey === 'null' ? null : Number(obraKey);
            const obraNombre = (obraIdNum != null && obraMap[obraIdNum]) ? obraMap[obraIdNum] : (obraIdNum != null ? `Obra ${obraIdNum}` : 'Sin obra');
            const fechaAsistencia = grupo[0].fecha;

            // Ordenar alfabético por apellido paterno
            const ordenados = [...grupo].sort((a, b) => {
                const apA = (workerMap.get(a.trabajador_id) || {}).apellido || '';
                const apB = (workerMap.get(b.trabajador_id) || {}).apellido || '';
                return apA.localeCompare(apB, 'es');
            });

            const creados = ordenados.filter(e => e.accion === 'CREATE').length;
            const actualizados = ordenados.filter(e => e.accion === 'UPDATE').length;

            const trabajadoresPayload = ordenados.map(e => {
                const nombre = (workerMap.get(e.trabajador_id) || {}).nombre || `ID ${e.trabajador_id}`;
                const estadoNombre = e.estado_id != null ? (estadoMap[e.estado_id] || null) : null;
                const base = {
                    nombre,
                    accion: e.accion,
                    estado: estadoNombre
                };
                if (e.accion === 'UPDATE' && e.cambios && Object.keys(e.cambios).length > 0) {
                    const cambiosLeg = traducirCambios(e.cambios);
                    // Renombrar keys a labels humanos (Estado, Tipo Ausencia, etc.)
                    const cambiosHumanos = {};
                    for (const [k, v] of Object.entries(cambiosLeg)) {
                        cambiosHumanos[fieldLabels[k] || k] = v;
                    }
                    base.cambios = cambiosHumanos;
                }
                return base;
            });

            // Fecha formato DD/MM/YYYY para resumen
            const fechaFmt = (() => {
                const parts = String(fechaAsistencia).split('-');
                return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fechaAsistencia;
            })();

            const payload = {
                type: 'bulk_asistencia',
                obra_id: obraIdNum,
                obra_nombre: obraNombre,
                fecha_asistencia: fechaAsistencia,
                total: ordenados.length,
                creados,
                actualizados,
                trabajadores: trabajadoresPayload,
                resumen: `${obraNombre} — ${creados} registrados, ${actualizados} modificados (${fechaFmt})`
            };

            const itemId = obraIdNum != null ? `obra_${obraIdNum}` : 'obra_null';
            // Acción siempre UPDATE para bulk (mezcla CREATE+UPDATE → UPDATE; solo CREATE → UPDATE también por consistencia visual)
            const accionLog = creados > 0 && actualizados === 0 ? 'CREATE' : 'UPDATE';

            await logManualActivity(userId, 'asistencias', accionLog, itemId, JSON.stringify(payload), req);
        }
    },

    /**
     * Helper interno: completa rows con filas sintéticas para días cubiertos
     * por periodos_ausencia activos pero SIN fila en `asistencias`.
     *
     * Caso típico: LM en weekend/feriado. `crearPeriodo` saltea esos días al
     * propagar (skip-no-laborable, decisión RH abril 2026), pero el período
     * sigue activo y daily/WhatsApp/Excel deben mostrarlo como LM continuo.
     * También cubre cualquier período legacy creado antes de propagación.
     *
     * @param {Set<string>} existingKeys - "trabajador_id:YYYY-MM-DD" ya cubiertas.
     * @param {string} fechaInicio - YYYY-MM-DD (inclusive).
     * @param {string} fechaFin - YYYY-MM-DD (inclusive).
     * @param {Object} filters - {obraId, trabajadorId, trabajadorIds[], empresaId,
     *                            cargoId, categoriaReporte, activo, requireActivo}.
     */
    async _filasDePeriodos(existingKeys, fechaInicio, fechaFin, filters = {}) {
        try {
        const params = [fechaFin, fechaInicio];
        let sql = `
            SELECT p.id AS periodo_id, p.trabajador_id, p.obra_id, p.estado_id,
                   p.tipo_ausencia_id, p.fecha_inicio AS periodo_inicio,
                   p.fecha_fin AS periodo_fin, p.observacion,
                   ea.nombre AS estado_nombre, ea.codigo AS estado_codigo,
                   ea.color AS estado_color, ea.es_presente,
                   t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
                   t.cargo_id, t.categoria_reporte,
                   c.nombre AS cargo_nombre,
                   ta.nombre AS tipo_ausencia_nombre
            FROM periodos_ausencia p
            JOIN estados_asistencia ea ON ea.id = p.estado_id
            JOIN trabajadores t ON t.id = p.trabajador_id
            LEFT JOIN cargos c ON t.cargo_id = c.id
            LEFT JOIN tipos_ausencia ta ON ta.id = p.tipo_ausencia_id
            WHERE p.activo = TRUE
              AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
        `;

        if (filters.obraId && filters.obraId !== 'ALL' && filters.obraId !== 'null'
            && filters.obraId !== 'undefined' && filters.obraId !== '') {
            sql += ' AND p.obra_id = ?';
            params.push(filters.obraId);
        }
        if (filters.trabajadorId) {
            sql += ' AND p.trabajador_id = ?';
            params.push(filters.trabajadorId);
        }
        if (filters.trabajadorIds && filters.trabajadorIds.length > 0) {
            sql += ` AND p.trabajador_id IN (${filters.trabajadorIds.map(() => '?').join(',')})`;
            params.push(...filters.trabajadorIds);
        }
        if (filters.empresaId && filters.empresaId !== 'null' && filters.empresaId !== 'undefined' && filters.empresaId !== '') {
            sql += ' AND t.empresa_id = ?';
            params.push(filters.empresaId);
        }
        if (filters.cargoId && filters.cargoId !== 'null' && filters.cargoId !== 'undefined' && filters.cargoId !== '') {
            sql += ' AND t.cargo_id = ?';
            params.push(filters.cargoId);
        }
        if (filters.categoriaReporte && filters.categoriaReporte !== 'null' && filters.categoriaReporte !== 'undefined' && filters.categoriaReporte !== '') {
            sql += ' AND t.categoria_reporte = ?';
            params.push(filters.categoriaReporte);
        }
        if (filters.activo !== undefined && filters.activo !== '' && filters.activo !== 'todos') {
            sql += ' AND t.activo = ?';
            params.push(filters.activo === 'true' || filters.activo === '1' ? 1 : 0);
        } else if (filters.requireActivo) {
            sql += ' AND t.activo = 1';
        }

        let periodos;
        try {
            [periodos] = await db.query(sql, params);
        } catch (e) {
            logger.warn('[_filasDePeriodos] query falló', { err: e.message });
            return [];
        }
        if (!Array.isArray(periodos) || periodos.length === 0) return [];

        const fmt = (d) => d.toISOString().split('T')[0];
        const toStr = (val) => {
            if (val == null) return null;
            if (typeof val === 'string') return val.split('T')[0];
            if (val instanceof Date) {
                if (isNaN(val.getTime())) return null;
                return val.toISOString().split('T')[0];
            }
            return null;
        };

        const filas = [];
        for (const p of periodos) {
            // Skip rows incompletos (mocks de tests viejos, datos corruptos).
            // estado_id es requerido para que la fila sintética sea utilizable.
            if (!p.estado_id) continue;
            // Aceptar tanto alias (periodo_inicio) como nombre directo (fecha_inicio)
            // para que mocks de tests existentes sigan funcionando.
            const piStr = toStr(p.periodo_inicio || p.fecha_inicio);
            const pfStr = toStr(p.periodo_fin || p.fecha_fin);
            if (!piStr || !pfStr) continue;
            const dStart = piStr > fechaInicio ? piStr : fechaInicio;
            const dEnd = pfStr < fechaFin ? pfStr : fechaFin;
            if (dStart > dEnd) continue;

            const cur = new Date(`${dStart}T00:00:00`);
            const last = new Date(`${dEnd}T00:00:00`);
            while (cur <= last) {
                const fStr = fmt(cur);
                const key = `${p.trabajador_id}:${fStr}`;
                if (!existingKeys.has(key)) {
                    filas.push({
                        id: null,
                        trabajador_id: p.trabajador_id,
                        obra_id: p.obra_id,
                        fecha: fStr,
                        estado_id: p.estado_id,
                        tipo_ausencia_id: p.tipo_ausencia_id,
                        observacion: p.observacion || null,
                        hora_entrada: null,
                        hora_salida: null,
                        hora_colacion_inicio: null,
                        hora_colacion_fin: null,
                        horas_extra: 0,
                        registrado_por: null,
                        estado_nombre: p.estado_nombre,
                        estado_codigo: p.estado_codigo,
                        estado_color: p.estado_color,
                        es_presente: p.es_presente,
                        rut: p.rut,
                        nombres: p.nombres,
                        apellido_paterno: p.apellido_paterno,
                        apellido_materno: p.apellido_materno,
                        cargo_id: p.cargo_id,
                        cargo_nombre: p.cargo_nombre,
                        tipo_ausencia_nombre: p.tipo_ausencia_nombre,
                        registrado_por_nombre: null,
                        _from_periodo: true,
                        _periodo_id: p.periodo_id,
                    });
                    existingKeys.add(key);
                }
                cur.setDate(cur.getDate() + 1);
            }
        }

        return filas;
        } catch (e) {
            logger.warn('[_filasDePeriodos] error inesperado', { err: e.message });
            return [];
        }
    },

    /**
     * Prevención de duplicados cross-obra (regla "fila vigente"): al escribir
     * asistencia de un (trabajador, fecha) en una obra, eliminar las filas del
     * MISMO día en OTRAS obras, con dos protecciones:
     *  - nunca borrar un TO (el par TO origen + A destino del traslado es legítimo);
     *  - si la entrada trae `id`, solo borrar filas MÁS ANTIGUAS (a.id < id) —
     *    re-guardar la obra origen tras un traslado no puede matar la fila real
     *    del destino.
     * Corre DENTRO de la transacción del caller. Devuelve filas borradas.
     */
    async _limpiarDuplicadosCrossObra(conn, escritos) {
        if (!Array.isArray(escritos) || escritos.length === 0) return 0;
        const CHUNK = 200;
        let borradas = 0;
        for (let i = 0; i < escritos.length; i += CHUNK) {
            const chunk = escritos.slice(i, i + CHUNK);
            const conds = [];
            const params = [];
            for (const e of chunk) {
                if (e.id) {
                    conds.push('(a.trabajador_id = ? AND a.fecha = ? AND a.obra_id <> ? AND a.id < ?)');
                    params.push(e.trabajador_id, e.fecha, e.obra_id, e.id);
                } else {
                    conds.push('(a.trabajador_id = ? AND a.fecha = ? AND a.obra_id <> ?)');
                    params.push(e.trabajador_id, e.fecha, e.obra_id);
                }
            }
            const [res] = await conn.query(
                `DELETE a FROM asistencias a
                 WHERE a.estado_id <> (SELECT id FROM estados_asistencia WHERE codigo = 'TO')
                   AND (${conds.join(' OR ')})`,
                params
            );
            borradas += res.affectedRows || 0;
        }
        if (borradas > 0) {
            logger.info('[asistencia] duplicados cross-obra eliminados (fila vigente)', { borradas });
        }
        return borradas;
    },

    /**
     * REGLA "FILA VIGENTE" (docs/reglas/asistencia.md): un trabajador tiene UN
     * estado por día. Si existen varias filas para el mismo (trabajador, fecha)
     * en obras distintas (traslado TO+A, o duplicados históricos por cambio de
     * obra), en los scopes SIN filtro de obra gana la fila de `id` MÁS ALTO
     * (la última registrada). Las filas sintéticas de período (`id: null`)
     * pierden ante cualquier fila real.
     */
    _filaVigente(registros) {
        const porClave = new Map(); // "trabajador:fecha" → fila de mayor id
        for (const r of registros) {
            const f = typeof r.fecha === 'string'
                ? r.fecha.split('T')[0]
                : (r.fecha instanceof Date && !isNaN(r.fecha.getTime())
                    ? r.fecha.toISOString().split('T')[0]
                    : null);
            if (!f) continue;
            const key = `${r.trabajador_id}:${f}`;
            const prev = porClave.get(key);
            if (!prev || (r.id || 0) > (prev.id || 0)) porClave.set(key, r);
        }
        const vigentes = new Set(porClave.values());
        return registros.filter(r => vigentes.has(r));
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
                    t.rut, t.nombres, t.apellido_paterno, t.apellido_materno, t.cargo_id,
                    c.nombre as cargo_nombre,
                    ta.nombre as tipo_ausencia_nombre,
                    u.nombre as registrado_por_nombre
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             JOIN trabajadores t ON a.trabajador_id = t.id
             LEFT JOIN cargos c ON t.cargo_id = c.id
             LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
             LEFT JOIN usuarios u ON a.registrado_por = u.id
             WHERE a.fecha = ? AND t.activo = 1 AND t.es_prueba = 0
                   AND a.obra_id NOT IN (SELECT id FROM obras WHERE finalizada = 1)`;

        if (obraId !== 'ALL') {
            queryStr += ` AND a.obra_id = ?`;
            queryParams.push(obraId);
        }

        queryStr += ` ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC, a.id ASC`;

        let [rows] = await db.query(queryStr, queryParams);

        // Regla "fila vigente": en el consolidado global un trabajador puede traer
        // 2 filas del mismo día (obras distintas: traslado o duplicado histórico).
        // Gana la más reciente. En la vista POR OBRA no se dedupea: cada obra debe
        // seguir viendo su propia fila (p.ej. el TO de la obra origen).
        if (obraId === 'ALL') {
            rows = this._filaVigente(rows);
        }

        // Completar con períodos activos no propagados (LM weekend, legacy data).
        // Garantiza que daily/WhatsApp ven mismo estado que Excel/Calendar modal.
        const existingKeys = new Set(
            rows.map(r => {
                if (!r.fecha) return null;
                const f = typeof r.fecha === 'string'
                    ? r.fecha.split('T')[0]
                    : (r.fecha instanceof Date && !isNaN(r.fecha.getTime())
                        ? r.fecha.toISOString().split('T')[0]
                        : null);
                if (!f) return null;
                return `${r.trabajador_id}:${f}`;
            }).filter(Boolean)
        );
        const filasPeriodo = await this._filasDePeriodos(existingKeys, fecha, fecha, {
            obraId, requireActivo: true,
        });

        // Re-ordenar por apellidos + nombres tras merge.
        const cmp = (a, b, field) => {
            const av = (a[field] || '').toString().toLocaleLowerCase();
            const bv = (b[field] || '').toString().toLocaleLowerCase();
            if (av < bv) return -1;
            if (av > bv) return 1;
            return 0;
        };
        const registros = [...rows, ...filasPeriodo].sort((a, b) => {
            return cmp(a, b, 'apellido_paterno')
                || cmp(a, b, 'apellido_materno')
                || cmp(a, b, 'nombres');
        });

        return { registros, feriado };
    },

    /**
     * Modificar asistencia con log de auditoría
     */
    async update(asistenciaId, data, modificadoPor) {
        // ── SEGURIDAD: Solo permitir campos válidos de la tabla ──
        const ALLOWED_FIELDS = new Set([
            'estado_id', 'tipo_ausencia_id', 'observacion',
            'hora_entrada', 'hora_salida', 'hora_colacion_inicio', 'hora_colacion_fin',
            'horas_extra'
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

        const filtraPorObra = Boolean(obra_id && obra_id !== 'null' && obra_id !== 'undefined' && obra_id !== '');
        if (filtraPorObra) {
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

        // Aislamiento de prueba: en modo reporte/agregado (sin un trabajador
        // puntual) excluir trabajadores de prueba. Si se consulta un trabajador
        // específico (ej. calendario en administración) NO filtramos.
        if (!trabajador_id && !trabajador_ids) {
            where.push('t.es_prueba = 0');
        }

        // NOTA: No filtramos por t.activo globalmente aquí para que los finiquitados
        // con registros en el rango aparezcan en el Excel/reporte.
        // El filtrado por 'activo' pasado en la query sí se respeta.

        const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

        const [rows] = await db.query(
            `SELECT a.*, ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color,
                    ea.es_presente,
                    t.rut, t.nombres, t.apellido_paterno, t.apellido_materno,
                    ta.nombre as tipo_ausencia_nombre
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             JOIN trabajadores t ON a.trabajador_id = t.id
             LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
              ${whereClause}
              ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC, a.fecha DESC, a.id ASC`,
            [...params]
        );

        // Regla "fila vigente": sin filtro de obra (calendario del trabajador,
        // Excel global, WhatsApp) un mismo (trabajador, fecha) puede traer filas
        // de varias obras — gana la más reciente. Con obra la UK garantiza 1 fila.
        const rowsVigentes = filtraPorObra ? rows : this._filaVigente(rows);

        // Completar con períodos activos no propagados (LM weekend/feriado, etc.).
        // Solo si hay rango definido — sin fechas, no podemos acotar periodos.
        let registros = rowsVigentes;
        if (fecha_inicio && fecha_fin) {
            const existingKeys = new Set(
                rowsVigentes.map(r => {
                    if (!r.fecha) return null;
                    const f = typeof r.fecha === 'string'
                        ? r.fecha.split('T')[0]
                        : (r.fecha instanceof Date && !isNaN(r.fecha.getTime())
                            ? r.fecha.toISOString().split('T')[0]
                            : null);
                    if (!f) return null;
                    return `${r.trabajador_id}:${f}`;
                }).filter(Boolean)
            );
            const trabajadorIdsArr = trabajador_ids
                ? (Array.isArray(trabajador_ids) ? trabajador_ids : trabajador_ids.split(',').filter(Boolean))
                : null;
            const filasPeriodo = await this._filasDePeriodos(existingKeys, fecha_inicio, fecha_fin, {
                obraId: obra_id,
                trabajadorId: trabajador_id,
                trabajadorIds: trabajadorIdsArr,
                empresaId: empresa_id,
                cargoId: cargo_id,
                categoriaReporte: categoria_reporte,
                activo: activo,
            });
            if (filasPeriodo.length > 0) {
                registros = [...rowsVigentes, ...filasPeriodo].sort((a, b) => {
                    const ap = (a.apellido_paterno || '').toLocaleLowerCase();
                    const bp = (b.apellido_paterno || '').toLocaleLowerCase();
                    if (ap !== bp) return ap < bp ? -1 : 1;
                    const am = (a.apellido_materno || '').toLocaleLowerCase();
                    const bm = (b.apellido_materno || '').toLocaleLowerCase();
                    if (am !== bm) return am < bm ? -1 : 1;
                    const an = (a.nombres || '').toLocaleLowerCase();
                    const bn = (b.nombres || '').toLocaleLowerCase();
                    if (an !== bn) return an < bn ? -1 : 1;
                    const af = typeof a.fecha === 'string' ? a.fecha.split('T')[0] : a.fecha.toISOString().split('T')[0];
                    const bf = typeof b.fecha === 'string' ? b.fecha.split('T')[0] : b.fecha.toISOString().split('T')[0];
                    return af < bf ? 1 : af > bf ? -1 : 0;
                });
            }
        }

        // También traer feriados para el reporte de Excel/Nómina si se solicita por rango
        const [feriados] = await db.query(
            'SELECT * FROM feriados WHERE fecha BETWEEN ? AND ? AND activo = 1',
            [fecha_inicio || '1900-01-01', fecha_fin || '2100-12-31']
        );

        return {
            registros,
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
             WHERE a.obra_id = ? AND a.fecha = ? AND t.activo = 1 AND t.es_prueba = 0
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
             WHERE a.obra_id = ? AND a.fecha = ? AND t.activo = 1 AND t.es_prueba = 0`,
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
    async generarExcel(query = {}, options = {}) {
        const { obra_id, fecha_inicio, fecha_fin, empresa_id, cargo_id, categoria_reporte, activo, trabajador_ids } = query;
        // Gate financiero (FAIL-SAFE): las celdas de HE se pueblan SÓLO si el
        // caller pasa `incluirHorasExtra: true` EXPLÍCITO. La estructura de
        // columnas queda intacta (celda en blanco) cuando no. Default = ocultar,
        // para que cualquier ruta nueva que olvide el flag NO filtre datos de
        // pago. Rutas autenticadas derivan el flag de `asistencia.horas_extra.ver`.
        const incluirHorasExtra = options.incluirHorasExtra === true;

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
            WHERE 1=1 AND t.es_prueba = 0 AND (o.finalizada = 0 OR o.id IS NULL)
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

        // Color LM para celdas weekend/feriado dentro de período LM — se pintan
        // visualmente idénticas a las celdas LM para que el rango luzca como
        // un bloque continuo en el reporte. Fallback al hex de migration 006.
        const toArgb = (hex) => hex
            ? (hex.startsWith('#') ? 'FF' + hex.slice(1).toUpperCase() : 'FF' + hex.toUpperCase())
            : 'FF5856D6';
        const lmEstado = estados.find(e => e.codigo === 'LM');
        const lmColor = toArgb(lmEstado?.color);

        // Helpers de borde: color del borde matchea el fill para que celdas
        // consecutivas del mismo estado se vean como un solo bloque (sin
        // líneas internas). Celdas sin fill usan gris claro.
        const DEFAULT_BORDER_COLOR = 'FFD0D0D0';
        const makeBorder = (argb) => ({
            top: { style: 'thin', color: { argb } },
            left: { style: 'thin', color: { argb } },
            bottom: { style: 'thin', color: { argb } },
            right: { style: 'thin', color: { argb } },
        });

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
                WHERE t.es_prueba = 0 AND t.id IN (${missingWorkerIds.map(() => '?').join(',')})
                ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC
            `, missingWorkerIds);
            workers.push(...extraWorkers);
        }

        // Filtrar trabajadores: incluir activos, y los inactivos solo si tienen asistencia este mes
        // Lo verificamos directamente de 'registros'
        const activeWorkersThisMonth = new Set(registros.map(r => r.trabajador_id));
        // Boolean(w.activo): tolera 1/0 (mocks/legacy) y true/false (typeCast Fase 1).
        const workersToInlude = workers.filter(w => Boolean(w.activo) || activeWorkersThisMonth.has(w.id));

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

        // ── Períodos de ausencia activos en el rango (LM, V, F, PSG, TO, NAC/DF/MT) ──
        // Generaliza la lógica histórica de `lmDaysSet`: para CUALQUIER estado-período
        // que cubra un día (incluso weekend/feriado), pintamos la celda con el código
        // y color del estado para que el bloque luzca continuo en el reporte.
        //
        // Doble red de seguridad junto con `_filasDePeriodos` (que sintetiza filas en
        // `getReporte`): si por algún motivo la fila no llegó al attendanceMap, este
        // map permite pintar weekend/feriado correctamente como fallback.
        const periodDaysMap = new Map(); // "workerId:YYYY-MM-DD" → { codigo, color }
        const lmDaysSet = new Set();     // compat: usado por COUNTIF check legacy
        try {
            const [periodsRows] = await db.query(`
                SELECT p.trabajador_id, p.fecha_inicio, p.fecha_fin, e.codigo, e.color
                FROM periodos_ausencia p
                JOIN estados_asistencia e ON e.id = p.estado_id
                WHERE p.activo = TRUE
                  AND p.fecha_inicio <= ? AND p.fecha_fin >= ?
            `, [fecha_fin, fecha_inicio]);
            for (const p of periodsRows) {
                const startStr = formatDate(p.fecha_inicio);
                const endStr = formatDate(p.fecha_fin);
                if (!startStr || !endStr) continue;
                const cur = new Date(startStr + 'T00:00:00');
                const last = new Date(endStr + 'T00:00:00');
                while (cur <= last) {
                    const key = `${p.trabajador_id}:${cur.toISOString().split('T')[0]}`;
                    periodDaysMap.set(key, { codigo: p.codigo, color: p.color });
                    if (p.codigo === 'LM') lmDaysSet.add(key);
                    cur.setDate(cur.getDate() + 1);
                }
            }
        } catch (e) {
            logger.warn('[asistencia.generarExcel] no se pudieron leer períodos', { err: e.message });
        }

        let maxStrDateInRecords = '';
        registros.forEach(r => {
            const dStr = formatDate(r.fecha);
            if (dStr > maxStrDateInRecords) maxStrDateInRecords = dStr;
        });
        if (!maxStrDateInRecords) maxStrDateInRecords = formatDate(new Date());

        // 2. Generar Rango de Días — GRILLA DE 31 COLUMNAS, PAGO BASE 30 (mes comercial).
        //    RRHH: cada quincena paga máximo 15 días (Q1: 1-15, Q2: 16-30).
        //    El día 31 se muestra pero SOLO DESCUENTA (nunca suma sobre 30).
        //    Los días inexistentes del mes (29/30 en febrero, 31 en meses de 30) son
        //    "fantasma": relleno estructural de la base 30, jamás fechas del mes
        //    siguiente (new Date(y, 1, 29) desbordaba al 1 de marzo y podía sumar FDS).
        const startYear = start.getFullYear();
        const startMonth = start.getMonth();
        const daysInMonth = new Date(startYear, startMonth + 1, 0).getDate();
        const pad2 = (n) => String(n).padStart(2, '0');
        const ultimoDiaRealStr = `${startYear}-${pad2(startMonth + 1)}-${pad2(daysInMonth)}`;
        const dias = [];
        for (let num = 1; num <= 31; num++) {
            const esFantasma = num > daysInMonth;
            dias.push({
                num,
                fStr: esFantasma ? null : `${startYear}-${pad2(startMonth + 1)}-${pad2(num)}`,
                // Mediodía local: getDay() inmune a TZ/DST (sin round-trip toISOString)
                dow: esFantasma ? null : new Date(startYear, startMonth, num, 12).getDay(),
                esFantasma,
                esDia31: num === 31,
            });
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
        // Se lee el campo cuenta_dia_trabajado (migración 049) para separar la
        // semántica "estuvo físicamente presente" (es_presente, usada por
        // dashboard/fiscalización) de "se paga este día" (cuenta_dia_trabajado,
        // usada acá para el Excel de nómina). Vacaciones (V) y permisos legales
        // (NAC/DF/MT) tienen es_presente=FALSE pero cuenta_dia_trabajado=TRUE.
        // Mig 065 canonizó NAC/DF/MT como estados separados (sin consolidar a
        // PL). AT (legacy) sí se consolida a JI porque está inactivo en BD.
        const codigosSumanDia = [...new Set(
            estados
                .filter(e => e.cuenta_dia_trabajado)
                .map(e => {
                    let cod = e.codigo;
                    if (cod === 'AT') cod = 'JI';
                    return cod;
                })
        )];
        const MARKER_FDS = 'FDS'; // Marcador para fines de semana y feriados sin registro
        const GHOST_FILL = 'FFE7E7E7'; // Fill de días fantasma (≠ FDS FFEFEFEF: relleno estructural)

        // ── Códigos que NO pagan (penalización del día 31 y relleno de meses cortos) ──
        // Complemento de codigosSumanDia + '-' (estado desconocido/desactivado post-
        // registro, L1614): hoy '-' no paga en los días 1-30, así que en el 31 debe
        // descontar — no ser neutro.
        const codigosNoPagan = new Set([
            ...estados
                .filter(e => !e.cuenta_dia_trabajado)
                .map(e => (e.codigo === 'AT' ? 'JI' : e.codigo))
                .filter(c => c !== 'JI'),
            '-',
        ]);

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
                    // NAC/DF/MT son estados canónicos separados desde mig 065:
                    // RH pidió desglose individual (no consolidar a PL legacy).
                    // Solo AT (inactivo) sigue consolidándose a JI por compat.
                    if (codigo === 'AT') {
                        codigo = 'JI';
                        nombre = 'Jornada Incompleta';
                    }
                    return { codigo, nombre, color: est.color, suma: codigosSumanDia.includes(codigo) };
                }).filter((v, i, a) => a.findIndex(t => t.codigo === v.codigo) === i), // Unique by consolidated code
                { codigo: MARKER_FDS, nombre: 'Fin de Semana / Feriado', color: null, suma: true },
                { codigo: '31', nombre: 'Dia 31: solo descuenta (pago base 30)', suma: false }
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
            // Col del día N: tras el día 15 se intercalan Q1 + DESCUENTOS Q1 (2 columnas)
            const dayCol = (num) => dayColStart + (num - 1) + (num > 15 ? 2 : 0);

            // Pintar cabeceras 1-31. Fantasmas: número visible, SIN día de semana
            // (jamás el DOW del mes siguiente), fill gris estructural.
            for (const dia of dias) {
                const colIdx = dayCol(dia.num);

                const cellNum = ws.getCell(7, colIdx);
                cellNum.value = dia.num;
                cellNum.font = { bold: true, size: 9 };
                cellNum.alignment = { horizontal: 'center' };
                cellNum.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const cellDow = ws.getCell(8, colIdx);
                cellDow.value = dia.esFantasma ? '' : dowMap[dia.dow];
                cellDow.font = { size: 8 };
                cellDow.alignment = { horizontal: 'center' };
                cellDow.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                if (dia.esFantasma) {
                    cellNum.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GHOST_FILL } };
                    cellDow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GHOST_FILL } };
                } else if (dia.dow === 0 || dia.dow === 6) {
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

            // Detalle visible de días descontados de la 1ra quincena (pedido jefatura:
            // "¿por qué tiene 27 días?" → faltas con día de semana, sin abrir notas).
            const descQ1Col = q1Col + 1;
            ws.mergeCells(7, descQ1Col, 8, descQ1Col);
            const descQ1Header = ws.getCell(7, descQ1Col);
            descQ1Header.value = 'DESCUENTOS Q1';
            descQ1Header.font = { bold: true, size: 8 };
            descQ1Header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            descQ1Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            descQ1Header.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const dia31Col = dayCol(31);
            const q2Col = dia31Col + 1;
            ws.mergeCells(7, q2Col, 8, q2Col);
            const q2Header = ws.getCell(7, q2Col);
            q2Header.value = 'SEGUNDA QUINCENA';
            q2Header.font = { bold: true, size: 8 };
            q2Header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            q2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            q2Header.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const descQ2Col = q2Col + 1;
            ws.mergeCells(7, descQ2Col, 8, descQ2Col);
            const descQ2Header = ws.getCell(7, descQ2Col);
            descQ2Header.value = 'DESCUENTOS Q2';
            descQ2Header.font = { bold: true, size: 8 };
            descQ2Header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            descQ2Header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            descQ2Header.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const totalCol = descQ2Col + 1;
            ws.mergeCells(7, totalCol, 8, totalCol);
            const totalHeader = ws.getCell(7, totalCol);
            totalHeader.value = 'TOTAL DIAS TRABAJADOS';
            totalHeader.font = { bold: true, size: 8 };
            totalHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            totalHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            totalHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            // Columna "HRS DESCONTADAS (JI)" — suma horas no trabajadas por
            // Jornada Incompleta del mes. RH pidió desglose explícito para
            // distinguir descuentos por JI vs faltas/atrasos generales.
            // (La columna BALANCE HRS ORDINARIO se eliminó a pedido de jefatura
            // 2026-08-17: sin utilidad en el flujo de remuneraciones.)
            const horasDescCol = totalCol + 1;
            ws.mergeCells(7, horasDescCol, 8, horasDescCol);
            const horasDescHeader = ws.getCell(7, horasDescCol);
            horasDescHeader.value = 'HRS DESCONTADAS (JI)';
            horasDescHeader.font = { bold: true, size: 8 };
            horasDescHeader.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            horasDescHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
            horasDescHeader.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

            const horasExtCol = horasDescCol + 1;
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
                let sumHorasDescontadas = 0; // Descuento por JI del mes
                const horasDescPorDia = {}; // num de día → descuento del día (para nota)
                const obrHorario = horariosMap[worker.obra_id] || defaultHorario;
                const workerIngreso = worker.fecha_ingreso ? formatDate(worker.fecha_ingreso) : null;
                const workerFin = worker.fecha_desvinculacion ? formatDate(worker.fecha_desvinculacion) : null;
                // num de día → valor final escrito en la celda. Fuente de verdad de las
                // columnas DESCUENTOS (espejo exacto de lo que ven las fórmulas COUNTIF).
                const renderedByNum = {};

                dias.forEach((dia) => {
                    const fStr = dia.fStr;
                    const colIdx = dayCol(dia.num);
                    const cell = ws.getCell(rowIdx, colIdx);

                    // ── DÍAS FANTASMA (relleno estructural base 30) ──
                    if (dia.esFantasma) {
                        // Día 31 fantasma (meses de 28/29/30): vacío y NEUTRAL — fuera
                        // del rango aditivo de Q2 y sin penalización.
                        // Días 29/30 fantasma (febrero): pagan (FDS) solo si el contrato
                        // cubre el fin de mes real Y el último día real no quedó en
                        // código no-pago (decisión jefatura 2026-08-17: una ausencia que
                        // llega a fin de mes extiende su descuento al relleno virtual).
                        const contratoCubreFinDeMes =
                            (!workerIngreso || workerIngreso <= ultimoDiaRealStr) &&
                            (!workerFin || workerFin >= ultimoDiaRealStr);
                        const finDeMesNoPago = codigosNoPagan.has(renderedByNum[daysInMonth]);
                        if (!dia.esDia31 && contratoCubreFinDeMes && !finDeMesNoPago) {
                            cell.value = MARKER_FDS;
                            cell.font = { size: 7, color: { argb: 'FFAAAAAA' } };
                        } else {
                            cell.value = '';
                            cell.font = { size: 7, color: { argb: 'FFCCCCCC' } };
                        }
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GHOST_FILL } };
                        cell.alignment = { horizontal: 'center', vertical: 'middle' };
                        cell.border = makeBorder(GHOST_FILL);
                        renderedByNum[dia.num] = cell.value;
                        return; // fantasmas jamás pasan por horas/meta/notas/obs
                    }

                    const reg = attendanceMap[worker.id]?.[fStr];
                    const isFeriado = !!feriadoMap[fStr];
                    const isWeekend = dia.dow === 0 || dia.dow === 6;

                    // ── VALIDACIÓN DE RANGO LABORAL ──
                    // No marcar ni sumar días FUERA del período de contratación
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

                        // Mig 065: NAC/DF/MT son códigos canónicos separados
                        // (no consolidar a PL). Solo AT legacy → JI.
                        if (codigo === 'AT') codigo = 'JI';

                        // ── Ausencias propagadas a fin de semana / feriado ──
                        // Cuando se asigna un período de ausencia, si la fecha cae en
                        // weekend/feriado y el trabajador tiene período activo cubriendo
                        // ese día (cualquier estado: LM, V, F, PSG, TO, NAC, DF, MT),
                        // se pinta con el código y color del estado para que el bloque
                        // luzca continuo. Si no hay período → FDS gris.
                        if (est && !est.es_presente && (isWeekend || isFeriado)) {
                            const periodMatch = periodDaysMap.get(`${worker.id}:${fStr}`);
                            if (periodMatch) {
                                const periodArgb = toArgb(periodMatch.color);
                                cell.value = periodMatch.codigo;
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: periodArgb } };
                                cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 8 };
                            } else {
                                cell.value = MARKER_FDS;
                                cell.font = { size: 7, color: { argb: 'FFAAAAAA' } };
                                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                            }
                            cell.alignment = { horizontal: 'center', vertical: 'middle' };
                            cell.border = makeBorder(cell.fill.fgColor.argb);
                            renderedByNum[dia.num] = cell.value;
                            return; // siguiente día — saltamos render normal
                        }

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
                                // JI sin marcas de reloj: media jornada exigida del día.
                                // Si la obra tiene horario configurado, usar jornada/2.
                                // Fallback 4.5 (= 9/2) si día sin config — retrocompat.
                                const dayKeyJI = jsDaysMap[dia.dow];
                                const jornadaDiaJI = obrHorario[dayKeyJI];
                                calc = (jornadaDiaJI && jornadaDiaJI > 0) ? jornadaDiaJI / 2 : 4.5;
                            } else {
                                calc = 9; // Jornada Completa por defecto
                            }
                            // Acumular descuento del día por JI: diferencia entre
                            // jornada esperada y horas reales/calculadas. Solo
                            // para JI (no para A, V, TO, etc. que ya pagaron full).
                            if (codigo === 'JI') {
                                const dayKeyDesc = jsDaysMap[dia.dow];
                                const expectedDia = obrHorario[dayKeyDesc] || 9;
                                const descuentoDia = Math.max(0, expectedDia - calc);
                                sumHorasDescontadas += descuentoDia;
                                horasDescPorDia[dia.num] = descuentoDia;
                            }
                        }

                        // ── Observación como comentario en la celda ──
                        const noteTexts = [];
                        if (reg.observacion && reg.observacion.trim()) {
                            noteTexts.push(reg.observacion.trim());
                        }

                        // Agregar "auto nota" de desglose si se modificó o hay extras.
                        // Texto compacto sin emojis: Microsoft Excel desktop a veces
                        // renderiza glyphs SMP como cuadrados, y la caja del comentario
                        // (incluso con monkey patch) es limitada — preferimos texto
                        // ASCII para garantizar legibilidad en Excel y Google Sheets.
                        if (customSchedule || hsExtra > 0 || codigo === 'JI') {
                            // Normaliza horas "08:00:00" → "08:00" para compactar
                            const fmtHora = (h) => (h ? String(h).slice(0, 5) : '');
                            let dText = `Detalle Horas:\n  Ordinarias: ${calc.toFixed(2)}`;
                            if (hsExtra > 0) dText += `\n  Extras: ${hsExtra.toFixed(2)}`;
                            // JI: mostrar explícitamente las horas descontadas del día
                            if (codigo === 'JI' && horasDescPorDia[dia.num] !== undefined) {
                                dText += `\n  Descontadas (JI): ${horasDescPorDia[dia.num].toFixed(2)}`;
                            }

                            if (customSchedule) {
                                dText += `\n\nMarcas de Reloj:\n  Ent: ${fmtHora(reg.hora_entrada)}   Sal: ${fmtHora(reg.hora_salida)}`;
                                if (reg.hora_colacion_inicio && reg.hora_colacion_fin) {
                                    dText += `\n  Colacion: ${fmtHora(reg.hora_colacion_inicio)} - ${fmtHora(reg.hora_colacion_fin)}`;
                                }
                            }
                            noteTexts.push(dText);
                        }

                        if (noteTexts.length > 0) {
                            const noteText = noteTexts.join('\n---\n');
                            cell.note = {
                                texts: [{ text: noteText }],
                                margins: { insetmode: 'auto' },
                                // size es leído por el monkey patch a V_SHAPE_ATTRIBUTES
                                // arriba — caja se ajusta a contenido en MS Excel desktop.
                                size: computeNoteSize(noteText),
                            };
                        }
                    } else if (isFeriado || isWeekend) {
                        // Weekend/feriado SIN registro. Si cae dentro de período activo
                        // del trabajador → render con código/color del estado (bloque
                        // continuo). Si no → FDS gris.
                        const periodMatch = periodDaysMap.get(`${worker.id}:${fStr}`);
                        if (periodMatch) {
                            const periodArgb = toArgb(periodMatch.color);
                            cell.value = periodMatch.codigo;
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: periodArgb } };
                            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 8 };
                        } else {
                            cell.value = MARKER_FDS;
                            cell.font = { size: 7, color: { argb: 'FFAAAAAA' } };
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                        }
                    } else {
                        // Día laboral sin registro (no suma). Red extra SOLO para el
                        // día 31: si un período activo lo cubre y la fila sintética de
                        // _filasDePeriodos no llegó, pintar el código del período — en
                        // el 31 es seguro (código pagador = neutral en fórmula, código
                        // no-pago = descuenta). En días 1-30 NO se hace: pintar un
                        // código pagador donde hoy hay vacío cambiaría totales.
                        const periodMatch31 = dia.esDia31 ? periodDaysMap.get(`${worker.id}:${fStr}`) : null;
                        if (periodMatch31) {
                            const periodArgb = toArgb(periodMatch31.color);
                            cell.value = periodMatch31.codigo;
                            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: periodArgb } };
                            cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 8 };
                        } else {
                            cell.value = '';
                        }
                    }

                    // Pintar feriados o domingos si tienen un estado registrado pero no fill propio
                    if ((isFeriado || isWeekend) && !cell.fill) {
                        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
                    }

                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    // Borde color-matched al fill → runs del mismo estado (LM,
                    // V, F, PSG, etc.) se ven como un bloque continuo. Celdas
                    // sin fill usan gris suave para reducir ruido visual.
                    const fillArgb = cell.fill?.fgColor?.argb;
                    cell.border = makeBorder(fillArgb || DEFAULT_BORDER_COLOR);
                    renderedByNum[dia.num] = cell.value;
                });

                // ── FÓRMULAS DE SUMATORIA CORREGIDAS ──
                // Contar estados que suman + marcador FDS (fines de semana y feriados).
                // Las celdas "LM" (incluidas las weekend/feriado dentro de período LM)
                // NO suman porque LM tiene es_presente=FALSE → excluido de codigosSumanDia.
                const q1Range = `${ws.getCell(rowIdx, dayColStart).address}:${ws.getCell(rowIdx, dayColStart + 14).address}`;

                // Construir COUNTIF para cada código que suma + FDS
                const allCodigos = [...codigosSumanDia, MARKER_FDS];
                const countifParts = allCodigos.map(cod => `COUNTIF(${q1Range},"${cod}")`);
                const q1Formula = countifParts.join('+');
                ws.getCell(rowIdx, q1Col).value = { formula: q1Formula };

                // Q2: aditiva sobre los días reales 16-30 MENOS la penalización del
                // día 31 (base 30: el 31 nunca suma — A/FDS/V en el 31 no están en
                // ningún rango aditivo — pero un código no-pago registrado el 31 sí
                // descuenta). El 31 vacío es neutro (protege exports históricos).
                // MAX(0,…): un ingreso el 31 con F el 31 no puede dejar Q2 negativa.
                const q2Range = `${ws.getCell(rowIdx, dayCol(16)).address}:${ws.getCell(rowIdx, dayCol(30)).address}`;
                const countifParts2 = allCodigos.map(cod => `COUNTIF(${q2Range},"${cod}")`);
                const d31Addr = ws.getCell(rowIdx, dia31Col).address;
                const penal31 = [...codigosNoPagan].map(cod => `COUNTIF(${d31Addr},"${cod}")`).join('+');
                const q2Formula = `MAX(0,${countifParts2.join('+')}-(${penal31}))`;
                ws.getCell(rowIdx, q2Col).value = { formula: q2Formula };

                // Total: Q1 + Q2
                ws.getCell(rowIdx, totalCol).value = { formula: `${ws.getCell(rowIdx, q1Col).address}+${ws.getCell(rowIdx, q2Col).address}` };

                // ── Columnas DESCUENTOS Q1/Q2: detalle visible de días descontados ──
                // Pedido jefatura 2026-08-17: "¿por qué tiene 27 días?" → respuesta en
                // la misma fila, con día de semana. Calculado desde renderedByNum (lo
                // mismo que ven las fórmulas COUNTIF). Texto ASCII sin emojis (misma
                // razón que las notas de celda: compat Excel desktop / Google Sheets).
                const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
                const comprimirNums = (nums) => {
                    const runs = [];
                    let ini = null, prev = null;
                    for (const n of nums) {
                        if (ini === null) { ini = n; prev = n; continue; }
                        if (n === prev + 1) { prev = n; continue; }
                        runs.push(ini === prev ? pad2(ini) : `${pad2(ini)}-${pad2(prev)}`);
                        ini = n; prev = n;
                    }
                    if (ini !== null) runs.push(ini === prev ? pad2(ini) : `${pad2(ini)}-${pad2(prev)}`);
                    return runs.join(', ');
                };
                const buildDescuentos = (desde, hasta) => {
                    const porCodigo = {};
                    const sinRegistro = [];
                    const fueraContrato = [];
                    for (const dia of dias) {
                        if (dia.num < desde || dia.num > hasta) continue;
                        if (dia.esFantasma || dia.esDia31) continue; // 31 y fantasmas: líneas propias
                        const val = renderedByNum[dia.num];
                        const outOfRange = (workerIngreso && dia.fStr < workerIngreso) ||
                                           (workerFin && dia.fStr > workerFin);
                        if (codigosNoPagan.has(val)) {
                            (porCodigo[val] = porCodigo[val] || []).push(`${DIAS_SEMANA[dia.dow]} ${pad2(dia.num)}`);
                        } else if (val === '' && outOfRange) {
                            fueraContrato.push(dia.num);
                        } else if (val === '' && dia.dow !== 0 && dia.dow !== 6 && !feriadoMap[dia.fStr]
                                   && dia.fStr <= maxStrDateInRecords
                                   && dia.fStr >= fecha_inicio && dia.fStr <= fecha_fin) {
                            // Hábil real, dentro de contrato y del rango pedido, sin
                            // registro cargado: no paga → explicitarlo.
                            sinRegistro.push(`${DIAS_SEMANA[dia.dow]} ${pad2(dia.num)}`);
                        }
                    }
                    const lineas = [];
                    for (const [cod, etiquetas] of Object.entries(porCodigo)) {
                        lineas.push(`${cod}: ${etiquetas.join(', ')}`);
                    }
                    if (sinRegistro.length) lineas.push(`Sin registro: ${sinRegistro.join(', ')}`);
                    if (fueraContrato.length) lineas.push(`Fuera contrato: ${comprimirNums(fueraContrato)}`);
                    return lineas;
                };

                const lineasQ1 = buildDescuentos(1, 15);
                const lineasQ2 = buildDescuentos(16, 31);
                if (codigosNoPagan.has(renderedByNum[31])) {
                    lineasQ2.push(`Dia 31 (${renderedByNum[31]}): descuenta 1`);
                }
                if (daysInMonth < 30 && renderedByNum[daysInMonth + 1] === '') {
                    lineasQ2.push(`Dias ${daysInMonth + 1}-30: sin relleno base 30 (contrato/ausencia fin de mes)`);
                }

                const escribirDesc = (col, lineas) => {
                    const c = ws.getCell(rowIdx, col);
                    if (lineas.length > 0) {
                        c.value = lineas.join('\n');
                        c.font = { size: 7 };
                    }
                    c.alignment = { vertical: 'top', wrapText: true };
                    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                };
                escribirDesc(descQ1Col, lineasQ1);
                escribirDesc(descQ2Col, lineasQ2);
                
                // Horas descontadas SOLO por JI del mes (RH: desglose explícito)
                const cDesc = ws.getCell(rowIdx, horasDescCol);
                cDesc.value = sumHorasDescontadas;
                cDesc.numFmt = '0.00';
                cDesc.font = { bold: true, size: 9, color: sumHorasDescontadas > 0 ? { argb: 'FFCC6600' } : undefined };
                cDesc.alignment = { horizontal: 'center', vertical: 'middle' };
                cDesc.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };

                const cExt = ws.getCell(rowIdx, horasExtCol);
                cExt.value = incluirHorasExtra ? sumHorasExtra : '';
                cExt.numFmt = '0.00';

                [ws.getCell(rowIdx, q1Col), ws.getCell(rowIdx, q2Col), ws.getCell(rowIdx, totalCol), cExt].forEach(c => {
                    c.font = { bold: true, size: 9 };
                    c.alignment = { horizontal: 'center', vertical: 'middle' };
                    c.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                });

                // Estilos de fila comunes
                for (let c = 1; c <= 8; c++) {
                    const cell = ws.getCell(rowIdx, c);
                    cell.font = { size: 8 };
                    cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' };
                    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
                }

                // ── Columna OBSERVACIONES: recopilar observaciones del mes ──
                // Solo días reales (incluye el 31; fantasmas no tienen registros).
                const obsTexts = [];
                dias.forEach((dia) => {
                    if (dia.esFantasma) return;
                    const reg = attendanceMap[worker.id]?.[dia.fStr];
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
            
            for (let c = dayColStart; c <= dia31Col; c++) {
                ws.getColumn(c).width = 4;
            }
            // Ensanchar columnas de resumen
            ws.getColumn(q1Col).width = 10;
            ws.getColumn(descQ1Col).width = 18;
            ws.getColumn(q2Col).width = 10;
            ws.getColumn(descQ2Col).width = 18;
            ws.getColumn(totalCol).width = 10;
            ws.getColumn(horasDescCol).width = 13;
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

            // 3. Generar/actualizar registros de asistencia para cada día del rango.
            //
            // Para Licencia Médica (LM) saltamos días NO laborables — sábados,
            // domingos y feriados según el horario de la obra. Bug reportado por
            // RRHH (abril 2026): el sistema sumaba esos días al total de licencia,
            // pero la práctica de la empresa es contar sólo días hábiles. Para
            // los demás tipos de período (vacaciones, permisos, etc.) se mantiene
            // el comportamiento histórico de marcar todos los días del rango.
            const skipNonLaborable = nextIsLM;

            // Cargar horario de la obra + feriados del rango sólo si vamos a saltar.
            let horarioObra = null;
            let feriadosSet = new Set();
            if (skipNonLaborable) {
                const [horarioRows] = await conn.query(
                    `SELECT dia_semana, hora_entrada, hora_salida
                     FROM configuracion_horarios
                     WHERE obra_id = ? AND activo = TRUE`,
                    [obra_id]
                );
                horarioObra = {};
                for (const h of horarioRows) {
                    // Día se considera laboral si tiene hora_entrada y hora_salida no nulas.
                    horarioObra[h.dia_semana] = !!(h.hora_entrada && h.hora_salida);
                }
                const [feriadoRows] = await conn.query(
                    `SELECT fecha FROM feriados
                     WHERE activo = 1 AND fecha BETWEEN ? AND ?`,
                    [fecha_inicio, fecha_fin]
                );
                for (const f of feriadoRows) {
                    const fStr = typeof f.fecha === 'string'
                        ? f.fecha.split('T')[0]
                        : f.fecha.toISOString().split('T')[0];
                    feriadosSet.add(fStr);
                }
            }

            const dowMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];

            let diasAfectados = 0;
            let diasSaltados = 0;
            const fechasEscritas = [];
            const current = new Date(inicio);

            while (current <= fin) {
                const fechaStr = current.toISOString().split('T')[0];

                if (skipNonLaborable) {
                    const dow = dowMap[current.getDay()];
                    // Sin entry en horarioObra para ese día → asume no laboral.
                    // Default ANTES de cargar horario: sat/sun no laboral, lun-vie laboral
                    // (cubre obras sin horario explícito configurado).
                    const tieneHorario = horarioObra && (dow in horarioObra)
                        ? horarioObra[dow]
                        : (current.getDay() !== 0 && current.getDay() !== 6);
                    const esFeriado = feriadosSet.has(fechaStr);

                    if (!tieneHorario || esFeriado) {
                        diasSaltados++;
                        current.setDate(current.getDate() + 1);
                        continue;
                    }
                }

                await conn.query(
                    `INSERT INTO asistencias
                     (trabajador_id, obra_id, fecha, estado_id, tipo_ausencia_id, observacion,
                      hora_entrada, hora_salida, hora_colacion_inicio, hora_colacion_fin,
                      horas_extra, registrado_por)
                     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, ?)
                     ON DUPLICATE KEY UPDATE
                        estado_id = VALUES(estado_id),
                        tipo_ausencia_id = VALUES(tipo_ausencia_id),
                        observacion = VALUES(observacion),
                        hora_entrada = NULL,
                        hora_salida = NULL,
                        hora_colacion_inicio = NULL,
                        hora_colacion_fin = NULL,
                        horas_extra = 0`,
                    [trabajador_id, obra_id, fechaStr, estado_id, tipo_ausencia_id || null, observacion || null, userId]
                );

                diasAfectados++;
                fechasEscritas.push(fechaStr);
                current.setDate(current.getDate() + 1);
            }

            // Regla "fila vigente": las filas del período recién escritas son las
            // más nuevas — borrar duplicados del mismo día en OTRAS obras (≠ TO).
            await this._limpiarDuplicadosCrossObra(
                conn,
                fechasEscritas.map(f => ({ trabajador_id, fecha: f, obra_id }))
            );

            await conn.commit();

            // Log de actividad
            try {
                const [trabajadorRows] = await db.query('SELECT nombres, apellido_paterno FROM trabajadores WHERE id = ?', [trabajador_id]);
                const [estadoRows] = await db.query('SELECT nombre FROM estados_asistencia WHERE id = ?', [estado_id]);
                const nombreTrab = trabajadorRows[0] ? `${trabajadorRows[0].nombres} ${trabajadorRows[0].apellido_paterno}` : `ID ${trabajador_id}`;
                const nombreEstado = estadoRows[0] ? estadoRows[0].nombre : `ID ${estado_id}`;

                const detalleDias = nextIsLM
                    ? `(${diasAfectados} días hábiles${diasSaltados > 0 ? `, ${diasSaltados} no laborales saltados` : ''})`
                    : `(${diasAfectados} días)`;
                logManualActivity(userId, 'periodos_ausencia', 'CREATE', periodoResult.insertId,
                    JSON.stringify({
                        resumen: `Período asignado: ${nombreEstado} para ${nombreTrab} del ${fecha_inicio} al ${fecha_fin} ${detalleDias}`
                    }),
                    req
                );
            } catch (logErr) {
                logger.error('Error registrando log de período', { err: logErr.message });
            }

            return {
                id: periodoResult.insertId,
                trabajador_id,
                obra_id,
                estado_id,
                fecha_inicio,
                fecha_fin,
                dias_afectados: diasAfectados,
                dias_saltados: diasSaltados,
                tipo: nextIsLM ? 'LM' : 'OTRO',
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
                logger.error('Error registrando log', { err: logErr.message });
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

        // 3. Obtener todas las faltas del mes.
        //    Regla "fila vigente": una F solo cuenta si no existe una fila MÁS
        //    NUEVA del mismo día en otra obra (duplicado histórico corregido).
        let faltasQuery = `
            SELECT a.trabajador_id, a.fecha, a.obra_id,
                   t.nombres, t.apellido_paterno, t.rut
            FROM asistencias a
            JOIN trabajadores t ON a.trabajador_id = t.id
            WHERE a.estado_id = ? AND a.fecha BETWEEN ? AND ? AND t.activo = 1 AND t.es_prueba = 0
              AND NOT EXISTS (
                  SELECT 1 FROM asistencias a2
                  WHERE a2.trabajador_id = a.trabajador_id AND a2.fecha = a.fecha
                    AND a2.obra_id <> a.obra_id AND a2.id > a.id
              )
        `;
        const params = [faltaId, startDate, endDate];

        if (obraId !== 'ALL') {
            // Atribuir la falta a la obra DONDE OCURRIÓ (a.obra_id), no a la obra
            // actual del trabajador (t.obra_id) — tras un traslado, las faltas
            // históricas no deben migrar de obra.
            faltasQuery += ' AND a.obra_id = ?';
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
            logger.warn(`getAlertasFaltas alcanzó el tope de ${MAX_FALTAS} filas — resultado posiblemente truncado`, { obraId, mes, anio });
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
                    fechas, // lista 'YYYY-MM-DD' de las faltas del mes (para el aviso WhatsApp)
                    alertas: trabajadorAlerts
                });
            }
        }

        return alertas;
    }
};

module.exports = asistenciaService;

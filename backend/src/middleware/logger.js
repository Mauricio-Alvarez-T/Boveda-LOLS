const db = require('../config/db');
const {
    EXCLUDED_KEYS,
    LABEL_MAP,
    ENTIDAD_RESOLVERS,
} = require('../config/log-config');

/**
 * Normaliza un valor para comparación justa (null ≈ undefined ≈ "")
 */
const normalize = (v) => {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) return v.toISOString().split('T')[0];
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}(T|\s|$)/.test(v)) {
        return v.substring(0, 10);
    }
    if (typeof v === 'boolean') return v;
    return v;
};

/**
 * Resuelve IDs de tablas maestras a nombres legibles.
 */
const resolveNames = async (obj) => {
    const tableMap = {
        empresa_id: { table: 'empresas', field: 'razon_social' },
        obra_id: { table: 'obras', field: 'nombre' },
        cargo_id: { table: 'cargos', field: 'nombre' },
        estado_id: { table: 'estados_asistencia', field: 'nombre' },
        tipo_ausencia_id: { table: 'tipos_ausencia', field: 'nombre' },
        rol_id: { table: 'roles', field: 'nombre' },
        tipo_documento_id: { table: 'tipos_documento', field: 'nombre' },
        trabajador_id: { table: 'trabajadores', field: "CONCAT(nombres, ' ', apellido_paterno)" }
    };

    const result = { ...obj };

    for (const [key, config] of Object.entries(tableMap)) {
        if (result[key] !== undefined && result[key] !== null) {
            const val = result[key];

            // Caso 1: Formato { de: X, a: Y } (UPDATE)
            if (typeof val === 'object' && ('de' in val || 'a' in val)) {
                const ids = [val.de, val.a].filter(id => id !== null && !isNaN(id));
                if (ids.length > 0) {
                    try {
                        const [rows] = await db.query(`SELECT id, ${config.field} as label FROM ${config.table} WHERE id IN (?)`, [ids]);
                        const nameMap = Object.fromEntries(rows.map(r => [String(r.id), r.label]));
                        if (val.de !== null) result[key].de = nameMap[String(val.de)] || val.de;
                        if (val.a !== null) result[key].a = nameMap[String(val.a)] || val.a;
                    } catch (err) { console.error(`Error resolving ${key} (multi):`, err); }
                }
            }
            // Caso 2: Valor plano (CREATE)
            else if (!isNaN(val)) {
                try {
                    const [rows] = await db.query(`SELECT ${config.field} as label FROM ${config.table} WHERE id = ?`, [val]);
                    if (rows.length > 0) result[key] = rows[0].label;
                } catch (err) { console.error(`Error resolving ${key} (single):`, err); }
            }
        }
    }
    return result;
};

/**
 * Calcula un diff compacto entre dos objetos.
 */
const computeDiff = (antes, nuevo) => {
    const cambios = {};
    const keysToCheck = Object.keys(nuevo);

    for (const key of keysToCheck) {
        if (EXCLUDED_KEYS.has(key)) continue;

        const v1 = normalize(antes[key]);
        const v2 = normalize(nuevo[key]);

        if (JSON.stringify(v1) !== JSON.stringify(v2)) {
            cambios[key] = { de: v1, a: v2 };
        }
    }

    return cambios;
};

/**
 * Genera un resumen legible de los campos cambiados.
 */
const buildResumen = (cambios) => {
    const parts = [];
    for (const [key, { de, a }] of Object.entries(cambios)) {
        const label = LABEL_MAP[key] || key;
        const formatVal = (v) => {
            if (v === null || v === undefined) return '—';
            if (v === true) return 'Sí';
            if (v === false) return 'No';
            return String(v);
        };
        parts.push(`${label}: ${formatVal(de)} → ${formatVal(a)}`);
    }
    return parts.join(' | ');
};

/**
 * Genera un resumen legible para una creación (top 4 campos más informativos).
 */
const buildCreateResumen = (body) => {
    const priorityKeys = ['rut', 'nombres', 'apellido_paterno', 'trabajador_id', 'tipo_documento_id', 'razon_social', 'nombre', 'email', 'asunto'];
    const parts = [];
    for (const key of priorityKeys) {
        if (body[key] && parts.length < 4) {
            const label = LABEL_MAP[key] || key;
            parts.push(`${label}: ${body[key]}`);
        }
    }
    return parts.join(' | ') || 'Nuevo registro';
};

/**
 * Resuelve `entidad_tipo` y `entidad_label` para un log.
 *
 * Estrategia:
 *   1. El módulo viene del path (`/api/<modulo>/...`).
 *   2. Si el módulo está en `ENTIDAD_RESOLVERS`:
 *      a. Si hay item_id → SELECT label FROM tabla WHERE id = item_id.
 *      b. Si no hay (CREATE) → derivar label desde campos del body según
 *         `bodyKeys` (en orden, primer match gana).
 *   3. Si no se puede resolver, devuelve `{ tipo, label: null }` para
 *      que la columna `entidad_tipo` quede igual y la UI muestre item_id
 *      como fallback.
 *
 * Cualquier excepción de DB se atrapa silenciosamente; el log no debe
 * fallar el request.
 */
async function resolveEntidad(modulo, item_id, body) {
    const cfg = ENTIDAD_RESOLVERS[modulo];
    if (!cfg) return { tipo: null, label: null };

    // Caso 1: tenemos item_id → buscar en tabla
    if (item_id !== null && item_id !== undefined && item_id !== '') {
        try {
            const [rows] = await db.query(
                `SELECT ${cfg.labelExpr} AS label FROM ${cfg.tabla} WHERE id = ?`,
                [item_id]
            );
            if (rows.length > 0 && rows[0].label) {
                return { tipo: cfg.tipo, label: String(rows[0].label).slice(0, 160) };
            }
        } catch (err) {
            // Tabla no existe en este entorno o columna alias falló — silencio.
            // El log se guarda con label NULL y la UI muestra item_id.
        }
    }

    // Caso 2: derivar desde body (típicamente CREATE)
    if (body && typeof body === 'object') {
        for (const k of cfg.bodyKeys || []) {
            let candidate;
            if (typeof k === 'function') {
                try { candidate = k(body); } catch (e) { candidate = null; }
            } else if (typeof body[k] === 'string' && body[k].trim()) {
                candidate = body[k].trim();
            }
            if (candidate) {
                return { tipo: cfg.tipo, label: String(candidate).slice(0, 160) };
            }
        }
    }

    return { tipo: cfg.tipo, label: null };
}

/**
 * Middleware para registrar actividad en la tabla logs_actividad.
 * Solo registra acciones que modifican datos (POST, PUT, DELETE).
 */
const activityLogger = async (req, res, next) => {
    const methods = {
        'POST': 'CREATE',
        'PUT': 'UPDATE',
        'DELETE': 'DELETE'
    };

    const accion = methods[req.method];
    let originalData = null;
    let extractedId = req.params.id;

    // Si params.id no está disponible (middleware global), extraer de URL
    if (!extractedId && (req.method === 'PUT' || req.method === 'DELETE')) {
        const parts = req.originalUrl.split('?')[0].split('/');
        if (parts.length >= 4) {
            extractedId = parts[3];
        }
    }

    // Capturar estado anterior para UPDATEs
    if (accion === 'UPDATE' && extractedId) {
        try {
            const modulo = req.originalUrl.split('/')[2];
            const validModulos = ['empresas', 'obras', 'cargos', 'trabajadores', 'usuarios', 'tipos-ausencia', 'estados-asistencia'];
            if (validModulos.includes(modulo)) {
                const table = modulo.replace(/-/g, '_');
                const [rows] = await db.query(`SELECT * FROM ${table} WHERE id = ?`, [extractedId]);
                if (rows.length > 0) {
                    originalData = { ...rows[0] };
                }
            }
        } catch (err) {
            console.error('Error al capturar estado anterior para log:', err);
        }
    }

    res.on('finish', async () => {
        // PREVENT DOUBLE LOGGING (Idempotency flag for streams/multer)
        if (res._activityLogged) return;
        res._activityLogged = true;

        if (res.statusCode >= 200 && res.statusCode < 300) {
            if (!accion) return;

            const modulo = req.originalUrl.split('/')[2] || 'sistema';
            if (['health', 'logs', 'auth'].includes(modulo)) return;

            // Excluir rutas bulk de asistencias (se loguean manualmente desde el servicio)
            if (req.originalUrl.includes('/asistencias/bulk')) return;

            // Excluir queries de solo lectura que usan POST (ej. KPIs con arreglos grandes)
            if (req.originalUrl.match(/\/(kpi|exportar|enviar|download)/i)) return;

            try {
                const usuario_id = req.user ? req.user.id : null;
                const ip = req.ip || req.connection.remoteAddress;
                const item_id = extractedId || null;

                let detalle = '';

                if (req.method === 'DELETE') {
                    detalle = JSON.stringify({ resumen: `Eliminado recurso ID: ${item_id}` });
                } else if (req.body) {
                    const bodyClone = { ...req.body };
                    // Limpiar campos sensibles
                    for (const k of EXCLUDED_KEYS) delete bodyClone[k];

                    if (accion === 'UPDATE' && originalData) {
                        let cambios = computeDiff(originalData, bodyClone);

                        if (Object.keys(cambios).length === 0) {
                            // No hubo cambios reales, no registrar
                            return;
                        }

                        // Resolver IDs a nombres para que el log sea legible
                        cambios = await resolveNames(cambios);

                        detalle = JSON.stringify({
                            cambios,
                            resumen: buildResumen(cambios)
                        });
                    } else {
                        // CREATE: resumen compacto y datos completos
                        const resolvedBody = await resolveNames(bodyClone);
                        detalle = JSON.stringify({
                            datos: resolvedBody,
                            resumen: buildCreateResumen(resolvedBody)
                        });
                    }
                }

                // Resolver entidad para que la UI muestre "Editó trabajador →
                // Juan Pérez" sin abrir el detalle JSON.
                const { tipo: entidad_tipo, label: entidad_label } =
                    await resolveEntidad(modulo, item_id, req.body);

                await db.query(
                    'INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle, ip, req.get('User-Agent')]
                );
            } catch (err) {
                console.error('Error al guardar log de actividad:', err);
            }
        }
    });

    next();
};

const logManualActivity = async (
    usuario_id, modulo, accion, item_id, detalle, req,
    extras = {}
) => {
    try {
        const ip = req ? (req.ip || req.connection.remoteAddress) : null;
        const user_agent = req ? req.get('User-Agent') : null;

        // Permite al caller pasar entidad_tipo/label explícitos o resolverlos
        // automáticamente desde el módulo + item_id (típico para LOGIN/UPLOAD/EMAIL).
        let { entidad_tipo, entidad_label } = extras;
        if (entidad_tipo === undefined && entidad_label === undefined) {
            const resolved = await resolveEntidad(modulo, item_id, null);
            entidad_tipo = resolved.tipo;
            entidad_label = resolved.label;
        }

        await db.query(
            'INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [usuario_id, modulo, accion, item_id, entidad_tipo || null, entidad_label || null, detalle, ip, user_agent]
        );
    } catch (err) {
        console.error('Error al guardar log manual:', err);
    }
};

module.exports = { activityLogger, logManualActivity, resolveEntidad };

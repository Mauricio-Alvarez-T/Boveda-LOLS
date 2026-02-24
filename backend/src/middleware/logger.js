const db = require('../config/db');

// Campos que nunca deben aparecer en los logs
const EXCLUDED_KEYS = new Set([
    'id', 'created_at', 'updated_at', 'password', 'password_hash',
    'user_agent', 'token', 'refresh_token'
]);

// Mapa de nombres técnicos a nombres legibles
const LABEL_MAP = {
    empresa_id: 'Empresa', obra_id: 'Obra', cargo_id: 'Cargo',
    nombres: 'Nombres', apellido_paterno: 'Apellido P.', apellido_materno: 'Apellido M.',
    rut: 'RUT', email: 'Correo', telefono: 'Teléfono', activo: 'Estado',
    razon_social: 'Razón Social', nombre: 'Nombre', direccion: 'Dirección',
    estado_id: 'Estado Asistencia', tipo_ausencia_id: 'Tipo Ausencia',
    observacion: 'Observación', hora_entrada: 'Hora Entrada', hora_salida: 'Hora Salida',
    horas_extra: 'Horas Extra', fecha_ingreso: 'F. Ingreso',
    categoria_reporte: 'Categoría Reporte', rol_id: 'Rol'
};

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
const resolveNames = async (cambios) => {
    const tableMap = {
        empresa_id: { table: 'empresas', field: 'razon_social' },
        obra_id: { table: 'obras', field: 'nombre' },
        cargo_id: { table: 'cargos', field: 'nombre' },
        estado_id: { table: 'estados_asistencia', field: 'nombre' },
        tipo_ausencia_id: { table: 'tipos_ausencia', field: 'nombre' },
        rol_id: { table: 'roles', field: 'nombre' }
    };

    const resolvedCambios = { ...cambios };

    for (const [key, config] of Object.entries(tableMap)) {
        if (resolvedCambios[key]) {
            const { de, a } = resolvedCambios[key];
            const ids = [de, a].filter(id => id !== null && !isNaN(id));

            if (ids.length > 0) {
                try {
                    const [rows] = await db.query(`SELECT id, ${config.field} FROM ${config.table} WHERE id IN (?)`, [ids]);
                    const nameMap = Object.fromEntries(rows.map(r => [String(r.id), r[config.field]]));

                    if (de !== null) resolvedCambios[key].de = nameMap[String(de)] || de;
                    if (a !== null) resolvedCambios[key].a = nameMap[String(a)] || a;
                } catch (err) {
                    console.error(`Error resolviendo nombres para ${key}:`, err);
                }
            }
        }
    }
    return resolvedCambios;
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
    const priorityKeys = ['rut', 'nombres', 'apellido_paterno', 'razon_social', 'nombre', 'email', 'asunto'];
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
        if (res.statusCode >= 200 && res.statusCode < 300) {
            if (!accion) return;

            const modulo = req.originalUrl.split('/')[2] || 'sistema';
            if (modulo === 'health' || modulo === 'logs') return;

            // Excluir rutas bulk de asistencias (se loguean manualmente desde el servicio)
            if (req.originalUrl.includes('/asistencias/bulk')) return;

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
                        detalle = JSON.stringify({
                            datos: bodyClone,
                            resumen: buildCreateResumen(bodyClone)
                        });
                    }
                }

                await db.query(
                    'INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, detalle, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [usuario_id, modulo, accion, item_id, detalle, ip, req.get('User-Agent')]
                );
            } catch (err) {
                console.error('Error al guardar log de actividad:', err);
            }
        }
    });

    next();
};

const logManualActivity = async (usuario_id, modulo, accion, item_id, detalle, req) => {
    try {
        const ip = req ? (req.ip || req.connection.remoteAddress) : null;
        const user_agent = req ? req.get('User-Agent') : null;

        await db.query(
            'INSERT INTO logs_actividad (usuario_id, modulo, accion, item_id, detalle, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [usuario_id, modulo, accion, item_id, detalle, ip, user_agent]
        );
    } catch (err) {
        console.error('Error al guardar log manual:', err);
    }
};

module.exports = { activityLogger, logManualActivity };

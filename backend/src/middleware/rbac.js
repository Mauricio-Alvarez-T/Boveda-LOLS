/**
 * Middleware de RBAC dinámico — versión optimizada.
 * Lee los permisos directamente del JWT (inyectados al hacer login)
 * en lugar de consultar la BD en cada petición.
 *
 * Formato compacto del JWT: { m: modulo, v: puede_ver, c: puede_crear, e: puede_editar, d: puede_eliminar }
 *
 * @param {string} modulo - Nombre del módulo (ej: 'trabajadores', 'asistencia')
 * @param {string} accion - Permiso requerido (puede_ver, puede_crear, puede_editar, puede_eliminar)
 */
const accionMap = {
    puede_ver: 'v',
    puede_crear: 'c',
    puede_editar: 'e',
    puede_eliminar: 'd'
};

const checkPermission = (modulo, accion) => {
    return (req, res, next) => {
        try {
            const permisos = req.user?.permisos;

            if (!permisos || !Array.isArray(permisos)) {
                return res.status(403).json({
                    error: 'No tienes permisos para esta acción (token sin permisos, re-inicia sesión)',
                    modulo,
                    accion
                });
            }

            const key = accionMap[accion];
            if (!key) {
                return res.status(500).json({ error: `Acción de permiso desconocida: ${accion}` });
            }

            const permiso = permisos.find(p => p.m === modulo);

            if (!permiso || !permiso[key]) {
                return res.status(403).json({
                    error: 'No tienes permisos para esta acción',
                    modulo,
                    accion
                });
            }

            next();
        } catch (err) {
            next(err);
        }
    };
};

module.exports = { checkPermission };

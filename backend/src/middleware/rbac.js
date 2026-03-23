/**
 * Middleware RBAC v2 — permisos atómicos.
 * Los permisos están en req.user.p como array de strings.
 * 
 * Uso: checkPermission('asistencia.guardar')
 * Uso múltiple: checkPermission('asistencia.guardar', 'asistencia.ver')
 *   → pasa si tiene AL MENOS UNO de los permisos listados
 */
const checkPermission = (...requiredPermisos) => {
    return (req, res, next) => {
        try {
            const userPermisos = req.user?.p;

            if (!userPermisos || !Array.isArray(userPermisos)) {
                return res.status(403).json({
                    error: 'No tienes permisos (token sin permisos, re-inicia sesión)',
                    required: requiredPermisos
                });
            }

            // Verificar que al menos uno de los permisos requeridos esté presente
            const hasPermission = requiredPermisos.some(p => userPermisos.includes(p));

            if (!hasPermission) {
                return res.status(403).json({
                    error: 'No tienes permisos para esta acción',
                    required: requiredPermisos,
                });
            }

            next();
        } catch (err) {
            next(err);
        }
    };
};

module.exports = { checkPermission };

const db = require('../config/db');

/**
 * Middleware de RBAC dinámico.
 * Verifica si el rol del usuario tiene el permiso requerido para el módulo.
 * 
 * @param {string} modulo - Nombre del módulo (ej: 'trabajadores', 'asistencia')
 * @param {string} accion - Permiso requerido (puede_ver, puede_crear, puede_editar, puede_eliminar)
 */
const checkPermission = (modulo, accion) => {
    return async (req, res, next) => {
        try {
            const rolId = req.user.rol_id;

            const [rows] = await db.query(
                `SELECT ${accion} as tiene_permiso FROM permisos_rol WHERE rol_id = ? AND modulo = ?`,
                [rolId, modulo]
            );

            if (rows.length === 0 || !rows[0].tiene_permiso) {
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

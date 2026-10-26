const db = require('../config/db');

/**
 * Solo el Super Administrador (Marcos y Mauricio): el ROL 1, no un permiso del catálogo (un permiso se puede
 * regalar a cualquiera desde Configuración; el rol 1 no se reparte). Mismo criterio que `super_admin` de
 * transferenciaService.inicioPerfil y `esSuperAdmin` del frontend (inventarioPerfil/perfil.ts).
 *
 * Tres barreras, en orden:
 *   1. Un token de «ver como» (`imp` / `ro`) nunca entra: no se encadena un «ver como» desde otro.
 *   2. El rol del token debe ser 1.
 *   3. La BD lo confirma: la persona sigue activa y sigue en el rol 1 (el token puede tener hasta 8 h).
 * Va DESPUÉS de `auth` (necesita `req.user`). Deja `req.superAdmin = { id, nombre }` para el log.
 */
const ROL_SUPER_ADMIN = 1;
const MENSAJE_SOLO_SUPER_ADMIN = 'Solo el Super Administrador puede usar Soporte · usuarios.';

const esActivo = (v) => v === 1 || v === true || v === '1';

async function soloSuperAdmin(req, res, next) {
    try {
        const u = req.user;
        if (!u) return res.status(401).json({ error: 'Token no proporcionado' });
        if ((u.imp !== undefined && u.imp !== null) || u.ro === true) {
            return res.status(403).json({
                error: 'Estás viendo como otra persona: vuelve a tu cuenta para usar Soporte.',
                code: 'VER_COMO_NO_ENCADENA',
            });
        }
        if (Number(u.rol_id) !== ROL_SUPER_ADMIN) {
            return res.status(403).json({ error: MENSAJE_SOLO_SUPER_ADMIN, code: 'SOLO_SUPER_ADMIN' });
        }
        const [rows] = await db.query('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?', [u.id]);
        const yo = rows && rows[0];
        if (!yo || !esActivo(yo.activo) || Number(yo.rol_id) !== ROL_SUPER_ADMIN) {
            return res.status(403).json({ error: MENSAJE_SOLO_SUPER_ADMIN, code: 'SOLO_SUPER_ADMIN' });
        }
        req.superAdmin = { id: Number(yo.id), nombre: yo.nombre };
        next();
    } catch (err) {
        next(err);
    }
}

module.exports = soloSuperAdmin;
module.exports.ROL_SUPER_ADMIN = ROL_SUPER_ADMIN;

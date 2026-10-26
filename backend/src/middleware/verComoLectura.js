const jwt = require('jsonwebtoken');
const db = require('../config/db');
const versionService = require('../services/version.service');
const { ROL_SUPER_ADMIN } = require('./superAdmin');

/**
 * Guarda de POST /api/soporte/ver-como/escritura (pasar de «ver como» en solo lectura a modo cambios, Marcos
 * 2026-10-26). NO es `soloSuperAdmin`: esa rechaza todo token con `imp`, y aquí SOLO sirve uno de «ver como».
 * Reglas y límites del modo cambios: docs/reglas/seguridad-rbac.md § Ver como usuario (soporte).
 *
 * Barreras, en orden (va DESPUÉS de `auth`, que ya verificó firma, vencimiento, `typ` y la versión del rol):
 *   1. El token es de «ver como» en SOLO LECTURA: `typ: 'session'`, `imp` entero positivo distinto de la persona,
 *      `ro === true` y sin `rw`. Un token normal (ni siquiera el del Super Administrador) no entra: 403
 *      `VER_COMO_REQUERIDO`. Uno que ya es de modo cambios: 409 `VER_COMO_YA_EN_CAMBIOS` (no se encadena).
 *   2. ADEMÁS, el token PROPIO del Super Administrador (su sesión normal, la que el frontend guarda en localStorage
 *      mientras dura el «ver como») en el encabezado `X-Sesion-Propia: Bearer <token>` (nunca en la URL ni en el
 *      body). Así, el token de solo lectura solo no basta para pasar a escribir. Se verifica con jwt.verify:
 *      `typ: 'session'`, SIN `imp` / `ro` / `rw`, rol 1, el MISMO id que el `imp` del token de «ver como» y su `rv`
 *      vigente (versionService, como auth.js). Si no: 403 `SESION_PROPIA_REQUERIDA`.
 *   3. La BD confirma que quien mira (`imp`) sigue activo y en el rol 1 (pudo cambiar en los 30 min): si no, 403
 *      `SOLO_SUPER_ADMIN`.
 * Lo de la persona mirada (activa, no rol 1) lo verifica soporte.service.activarCambios contra la BD.
 * Deja `req.superAdmin = { id, nombre }` (para el token nuevo y el historial).
 */
const esActivo = (v) => v === 1 || v === true || v === '1';
const MENSAJE_REQUERIDO = 'Esto solo se usa mientras ves como otra persona (Soporte · usuarios).';
const MENSAJE_SOLO_SUPER_ADMIN = 'Solo el Super Administrador puede usar Soporte · usuarios.';
const MENSAJE_SESION_PROPIA = 'Para activar cambios vuelve a entrar a tu cuenta.';
/** Encabezado con la sesión propia del Super Administrador (Express lo entrega en minúsculas). */
const ENCABEZADO_SESION_PROPIA = 'x-sesion-propia';

/** ¿El encabezado trae la sesión propia vigente del Super Administrador `imp`? (sin tocar la BD) */
function sesionPropiaValida(req, imp) {
    const h = req.headers ? req.headers[ENCABEZADO_SESION_PROPIA] : undefined;
    if (typeof h !== 'string' || !h.startsWith('Bearer ')) return false;
    const token = h.slice(7).trim();
    if (!token) return false;
    let d;
    try { d = jwt.verify(token, process.env.JWT_SECRET); } catch { return false; }
    if (!d || typeof d !== 'object' || d.typ !== 'session') return false;
    // Una sesión normal: ni de «ver como» ni de modo cambios (aunque viniera con el campo en false o null).
    if ('imp' in d || 'ro' in d || 'rw' in d) return false;
    if (Number(d.rol_id) !== ROL_SUPER_ADMIN || Number(d.id) !== imp) return false;
    // Misma regla que auth.js: si subió la versión del rol, esa sesión ya no vale.
    return !!d.rv && d.rv === versionService.get(d.rol_id);
}

async function soloVerComoLectura(req, res, next) {
    try {
        const u = req.user;
        if (!u) return res.status(401).json({ error: 'Token no proporcionado' });
        const tieneImp = u.imp !== undefined && u.imp !== null;
        if (tieneImp && u.rw === true) {
            return res.status(409).json({ error: 'Ya estás en modo cambios.', code: 'VER_COMO_YA_EN_CAMBIOS' });
        }
        const imp = Number(u.imp);
        if (!tieneImp || u.ro !== true || u.typ !== 'session' || !Number.isInteger(imp) || imp <= 0
            || imp === Number(u.id) || !Number.isInteger(Number(u.exp))) {
            return res.status(403).json({ error: MENSAJE_REQUERIDO, code: 'VER_COMO_REQUERIDO' });
        }
        if (!sesionPropiaValida(req, imp)) {
            return res.status(403).json({ error: MENSAJE_SESION_PROPIA, code: 'SESION_PROPIA_REQUERIDA' });
        }
        const [rows] = await db.query('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?', [imp]);
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

/**
 * ¿Sigue valiendo un token de modo cambios? Lo llama middleware/auth antes de CADA escritura con `rw` (el token dura
 * hasta 30 min y en ese rato pueden cambiar las cosas): quien mira (`imp`) sigue activo y en el rol 1, y la persona
 * mirada sigue activa y NO es rol 1. Devuelve null si vale, o el mensaje para el 403. Si la BD falla, lanza (auth
 * responde 503: nunca deja pasar sin verificar).
 */
async function motivoModoCambiosInvalido(imp, personaId) {
    const [sa] = await db.query('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?', [Number(imp)]);
    const yo = sa && sa[0];
    if (!yo || !esActivo(yo.activo) || Number(yo.rol_id) !== ROL_SUPER_ADMIN) {
        return 'El modo cambios terminó: tu cuenta ya no es Super Administrador activo.';
    }
    const [pr] = await db.query('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?', [Number(personaId)]);
    const p = pr && pr[0];
    if (!p || !esActivo(p.activo) || Number(p.rol_id) === ROL_SUPER_ADMIN) {
        return 'El modo cambios terminó: esa persona ya no está activa o cambió de rol. Vuelve a tu cuenta.';
    }
    return null;
}

module.exports = soloVerComoLectura;
module.exports.motivoModoCambiosInvalido = motivoModoCambiosInvalido;
module.exports.ENCABEZADO_SESION_PROPIA = ENCABEZADO_SESION_PROPIA;

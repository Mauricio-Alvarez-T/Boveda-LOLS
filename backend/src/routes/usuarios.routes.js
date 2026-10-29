const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const permisosService = require('../services/permisos.service');
const versionService = require('../services/version.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');
const validateBody = require('../middleware/validateBody');
const { crearUsuario, editarUsuario } = require('../schemas/usuarios.schema');
const { logManualActivity } = require('../middleware/logger');
const logger = require('../utils/logger-structured');

/**
 * Cierra la sesión de UNA persona (mig 146: sus tokens emitidos hasta este segundo dejan de valer) en vez de la de
 * todo su rol. RESPALDO si eso falla (p. ej. la columna `permisos_cambiados_en` aún no existe, ventana
 * deploy→migrate): subir la versión del rol que trae su token, como se hacía antes — saca a todo ese rol, pero nadie
 * se queda con permisos viejos. `rolIdRespaldo` = ese rol, SIEMPRE leído de la BD por quien llama (PUT lo lee antes
 * del UPDATE); nunca el que manda el cliente (puede venir de una pestaña vieja). Si no viene, se lee de la BD ahora.
 */
async function cerrarSesionPersona(usuarioId, rolIdRespaldo) {
    try {
        await versionService.cerrarSesionDe(usuarioId);
    } catch (err) {
        let rolId = rolIdRespaldo;
        if (rolId === undefined || rolId === null || rolId === '') {
            const [rows] = await db.query('SELECT rol_id FROM usuarios WHERE id = ?', [usuarioId]);
            rolId = rows.length ? rows[0].rol_id : null;
        }
        logger.warn('[usuarios] No se pudo cerrar la sesión solo de la persona; se sube la versión de su rol (respaldo)', {
            usuario_id: Number(usuarioId), rol_id: rolId, err: err.message, errno: err.errno,
        });
        if (rolId !== undefined && rolId !== null && rolId !== '') {
            await versionService.increment(rolId);
        }
    }
}

const TIPOS_OVERRIDE = new Set(['grant', 'deny']);
// permisos_usuario_override.permiso_clave es VARCHAR(100) (scripts/migrations/migrate_granular_permissions.js).
const MAX_LARGO_CLAVE = 100;

/**
 * Valida y normaliza la FORMA del payload de POST /user-overrides/:id (sin tocar la BD). Devuelve { overrides } o
 * { error } (mensaje del 400). `overrides` = lista (vacía = quitarle todos sus permisos propios) de
 * { permiso_clave: texto no vacío de hasta 100 caracteres, tipo: 'grant'|'deny' }. Una clave repetida se queda con la
 * ÚLTIMA; «repetida» SIN distinguir mayúsculas (la PK de la tabla es utf8mb4_general_ci: 'asistencia.ver' y
 * 'ASISTENCIA.VER' son la misma fila) → no revienta por clave duplicada en la BD.
 */
function normalizarOverrides(overrides) {
    if (!Array.isArray(overrides)) {
        return { error: 'Faltan los permisos de la persona: «overrides» debe ser una lista (vacía para quitarle todos sus permisos propios).' };
    }
    const porClave = new Map(); // clave en minúsculas -> { permiso_clave, tipo }
    for (let i = 0; i < overrides.length; i++) {
        const o = overrides[i];
        if (!o || typeof o !== 'object' || Array.isArray(o)) {
            return { error: `El permiso n.º ${i + 1} no es válido: cada uno debe traer «permiso_clave» y «tipo».` };
        }
        const clave = typeof o.permiso_clave === 'string' ? o.permiso_clave.trim() : '';
        if (!clave) {
            return { error: `El permiso n.º ${i + 1} no trae su clave («permiso_clave» vacío).` };
        }
        if (clave.length > MAX_LARGO_CLAVE) {
            return { error: `El permiso n.º ${i + 1} trae una clave demasiado larga (máximo ${MAX_LARGO_CLAVE} caracteres).` };
        }
        if (!TIPOS_OVERRIDE.has(o.tipo)) {
            return { error: `El permiso «${clave}» trae un tipo no válido: debe ser «grant» (dárselo) o «deny» (quitárselo).` };
        }
        porClave.set(clave.toLowerCase(), { permiso_clave: clave, tipo: o.tipo });
    }
    return { overrides: [...porClave.values()] };
}

/**
 * Revisa que cada clave exista en `permisos_catalogo` (la FK de permisos_usuario_override; sin esto una clave basura
 * llegaba al INSERT → errno 1452 → 500). Solo LEE. Devuelve { overrides } con la clave escrita como en el catálogo, o
 * { error } (mensaje del 400) con las claves que no existen.
 */
async function validarEnCatalogo(overrides) {
    if (!overrides.length) return { overrides };
    const [rows] = await db.query(
        'SELECT clave FROM permisos_catalogo WHERE clave IN (?)',
        [overrides.map(o => o.permiso_clave)]
    );
    const canonica = new Map((rows || []).map(r => [String(r.clave).toLowerCase(), String(r.clave)]));
    const faltan = overrides.filter(o => !canonica.has(o.permiso_clave.toLowerCase())).map(o => o.permiso_clave);
    if (faltan.length) {
        const muestra = faltan.slice(0, 5).map(c => `«${c}»`).join(', ');
        const resto = faltan.length > 5 ? ` y ${faltan.length - 5} más` : '';
        return {
            error: `${faltan.length === 1 ? 'Este permiso no existe' : 'Estos permisos no existen'} en el catálogo: ${muestra}${resto}. `
                + 'Recarga la página y vuelve a intentarlo.',
        };
    }
    return {
        overrides: overrides.map(o => ({ permiso_clave: canonica.get(o.permiso_clave.toLowerCase()), tipo: o.tipo })),
    };
}

// Instantiate missing user service dynamically since the file doesnt exist
const usuariosService = createCrudService('usuarios', { 
    searchFields: ['nombre', 'email'], 
    joins: 'LEFT JOIN roles r ON usuarios.rol_id = r.id LEFT JOIN obras o ON usuarios.obra_id = o.id',
    selectFields: 'usuarios.*, r.nombre as rol_nombre, o.nombre as obra_nombre'
});

// basic CRUD for roles
// selectFields override: incluye `permisos_count` para que el frontend pueda
// mostrar badge ⚠️ "Sin permisos" en la tabla de roles + preview en
// UsuarioForm. Subquery en lugar de JOIN porque cada rol puede tener N
// permisos y GROUP BY rompería los demás campos del rol.
// `usuarios_count` (activos) = el «N personas» de cada columna en la matriz de roles.
const rolesService = createCrudService('roles', {
    searchFields: ['nombre'],
    selectFields: 'roles.*, (SELECT COUNT(*) FROM permisos_rol_v2 WHERE rol_id = roles.id) AS permisos_count, '
        + '(SELECT COUNT(*) FROM usuarios WHERE rol_id = roles.id AND activo = 1) AS usuarios_count',
    orderBy: 'nombre ASC',
    // El borrado de rol es soft-delete (activo=0). Sin esto el listado mostraría
    // también los roles dados de baja y "no se eliminarían" a ojos del usuario.
    useSoftDelete: true
});
const rolesController = createCrudController(rolesService);

// Alias /roles/list para consumo específico en ciertos dropdowns del frontend
router.get('/roles/list', auth, checkPermission('usuarios.roles.ver'), async (req, res, next) => {
    try {
        const result = await rolesService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// Guard de borrado: no permitir eliminar un rol con usuarios ACTIVOS asignados
// (quedarían apuntando a un rol inactivo). Va ANTES del mount CRUD para
// interceptar el DELETE /roles/:id; si pasa la validación, hace el mismo
// soft-delete que haría el CRUD genérico. El mensaje 400 lo muestra el toast
// del frontend (showDeleteToast surfacea response.data.message).
router.delete('/roles/:id', auth, checkPermission('usuarios.roles.eliminar'), async (req, res, next) => {
    try {
        const rolId = req.params.id;
        const [rows] = await db.query(
            'SELECT COUNT(*) AS total FROM usuarios WHERE rol_id = ? AND activo = 1',
            [rolId]
        );
        const enUso = rows[0].total;
        if (enUso > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: el rol tiene ${enUso} usuario(s) activo(s) asignado(s). Reasígnalos a otro rol antes de eliminarlo.`
            });
        }
        const result = await rolesService.softDelete(rolId);
        res.json(result);
    } catch (err) { next(err); }
});

router.use('/roles', createCrudRoutes(rolesController, {
    ver: 'usuarios.roles.ver',
    crear: 'usuarios.roles.crear',
    editar: 'usuarios.roles.editar',
    eliminar: 'usuarios.roles.eliminar'
}));

// --- PERMISSIONS MANAGEMENT (NEW) ---

/** GET /usuarios/permisos/catalogo */
router.get('/permisos/catalogo', auth, checkPermission('usuarios.permisos.gestionar'), async (req, res, next) => {
    try {
        const catalogo = await permisosService.getCatalogo();
        res.json(catalogo);
    } catch (err) { next(err); }
});

/** GET /usuarios/roles/:id/permisos */
router.get('/roles/:id/permisos', auth, checkPermission('usuarios.roles.ver'), async (req, res, next) => {
    try {
        const permisos = await permisosService.getPermisosRol(req.params.id);
        res.json(permisos);
    } catch (err) { next(err); }
});

/** POST /usuarios/roles/:id/permisos */
router.post('/roles/:id/permisos', auth, checkPermission('usuarios.permisos.gestionar'), async (req, res, next) => {
    try {
        const { permisos } = req.body; // Array of keys
        await permisosService.setPermisosRol(req.params.id, permisos);

        // BUMP VERSION to invalidate sessions
        await versionService.increment(req.params.id);

        // Log explícito (modulo='roles') para que el resumen diario de novedades
        // detecte el cambio de permisos como evento sensible.
        try {
            const [[rol]] = await db.query('SELECT nombre FROM roles WHERE id = ?', [req.params.id]);
            await logManualActivity(req.user?.id || null, 'roles', 'UPDATE', String(req.params.id),
                JSON.stringify({ evento: 'permisos_rol', permisos: Array.isArray(permisos) ? permisos.length : 0 }),
                req, { entidad_tipo: 'rol', entidad_label: `Permisos del rol ${rol?.nombre || req.params.id}` });
        } catch { /* el log no debe romper la acción */ }

        res.json({ message: 'Permisos de rol actualizados exitosamente' });
    } catch (err) { next(err); }
});

/** GET /usuarios/user-overrides/:id */
router.get('/user-overrides/:id', auth, checkPermission('usuarios.permisos.gestionar'), async (req, res, next) => {
    try {
        const overrides = await permisosService.getOverrides(req.params.id);
        res.json(overrides);
    } catch (err) { next(err); }
});

/** POST /usuarios/user-overrides/:id */
router.post('/user-overrides/:id', auth, checkPermission('usuarios.permisos.gestionar'), async (req, res, next) => {
    try {
        // overrides: [{ permiso_clave, tipo }]. El rol_id del body ya no se usa (se acepta por compatibilidad y se
        // IGNORA: puede venir de una pestaña vieja; el respaldo lee el rol actual de la BD).
        const body = req.body || {};
        const forma = normalizarOverrides(body.overrides);
        if (forma.error) return res.status(400).json({ error: forma.error });
        const { overrides, error } = await validarEnCatalogo(forma.overrides);
        if (error) return res.status(400).json({ error });

        await permisosService.setOverrides(req.params.id, overrides);

        // Cerrar la sesión SOLO de esta persona (mig 146): vuelve a entrar con sus permisos nuevos. Antes se subía la
        // versión de su rol y salían todas las personas del rol (p. ej. las tres de RR.HH).
        await cerrarSesionPersona(req.params.id);

        // Log explícito (modulo='roles') para el resumen diario de novedades.
        try {
            const [[usr]] = await db.query('SELECT nombre FROM usuarios WHERE id = ?', [req.params.id]);
            await logManualActivity(req.user?.id || null, 'roles', 'UPDATE', String(req.params.id),
                JSON.stringify({ evento: 'overrides_usuario', overrides: Array.isArray(overrides) ? overrides.length : 0 }),
                req, { entidad_tipo: 'usuario', entidad_label: `Permisos de usuario ${usr?.nombre || req.params.id}` });
        } catch { /* el log no debe romper la acción */ }

        res.json({ message: 'Permisos del usuario actualizados exitosamente' });
    } catch (err) { next(err); }
});

// --- USUARIOS CRUD ---

router.get('/', auth, checkPermission('usuarios.ver'), async (req, res, next) => {
    try {
        const users = await usuariosService.getAll();
        res.json(users);
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('usuarios.crear'), validateBody(crearUsuario, { strip: true }), async (req, res, next) => {
    try {
        const { nombre, email, password, rol_id, obra_id, bodega_id, email_corporativo } = req.body;
        const hash = await bcrypt.hash(password, 10);
        // bodega_id se incluye solo si viene (mig 097): crear usuarios SIN bodega
        // sigue funcionando aunque la migración no haya corrido todavía.
        const cols = ['nombre', 'email', 'password_hash', 'rol_id', 'obra_id', 'email_corporativo'];
        const vals = [nombre, email, hash, rol_id, obra_id || null, email_corporativo || null];
        if (bodega_id != null) { cols.push('bodega_id'); vals.push(bodega_id); }
        const [result] = await db.query(
            `INSERT INTO usuarios (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
            vals
        );
        res.status(201).json({ id: result.insertId, nombre, email, rol_id });
    } catch (err) { next(err); }
});

router.put('/:id', auth, checkPermission('usuarios.editar'), validateBody(editarUsuario, { strip: true }), async (req, res, next) => {
    try {
        const data = { ...req.body };
        if (data.password) {
            data.password_hash = await bcrypt.hash(data.password, 10);
            delete data.password;
        }

        // Detectar cambio de rol_id o bodega_id ANTES del update para saber si
        // invalidar la sesión activa del usuario. Si no detectamos el cambio, el
        // usuario mantiene su JWT viejo (rol/permisos/bodega viejos) hasta logout
        // manual — bug reportado por jefatura mayo 2026.
        let oldRolId = null;
        let oldBodegaId;
        if (data.rol_id !== undefined || data.bodega_id !== undefined) {
            const [rows] = await db.query('SELECT rol_id FROM usuarios WHERE id = ?', [req.params.id]);
            if (rows.length) oldRolId = rows[0].rol_id;
        }
        if (data.bodega_id !== undefined) {
            // Query aparte y tolerante: si la mig 097 no corrió aún (errno 1054),
            // no rompe el resto del update.
            try {
                const [rows] = await db.query('SELECT bodega_id FROM usuarios WHERE id = ?', [req.params.id]);
                if (rows.length) oldBodegaId = rows[0].bodega_id;
            } catch (e) { if (e.errno !== 1054) throw e; }
        }

        // Ventana deploy→migrate: el front SIEMPRE manda bodega_id (null si "Sin
        // bodega"). Si la columna aún no existe (mig 097 sin correr) → errno 1054.
        // Reintentar sin bodega_id preserva la edición de usuarios (nombre/rol/etc.)
        // hasta que se corra la migración. Post-migrate, setear/limpiar bodega funciona.
        let user;
        try {
            user = await usuariosService.update(req.params.id, data);
        } catch (e) {
            if (e && e.errno === 1054 && 'bodega_id' in data) {
                const { bodega_id, ...rest } = data;
                user = await usuariosService.update(req.params.id, rest);
            } else { throw e; }
        }

        // Si cambió el rol o la bodega, cerrar la sesión SOLO de esta persona (mig 146): sus tokens emitidos hasta
        // ahora → 401 expired_by_version → re-login → JWT nuevo con rol, permisos y bodega nuevos (rol_id y bodega_id
        // viven en el JWT; bodega = scope bodeguero, mig 097). Una sola vez aunque cambien ambas cosas.
        // Hasta la mig 146 se subía la versión del rol (el viejo al cambiar de rol, el actual al cambiar de bodega) y
        // con eso salían TODAS las personas de ese rol; ahora las demás siguen dentro.
        // Respaldo (si la mig 146 aún no corrió): subir la versión del rol VIEJO, el que trae su token.
        const cambioRol = oldRolId != null && data.rol_id != null && Number(oldRolId) !== Number(data.rol_id);
        const cambioBodega = data.bodega_id !== undefined && oldRolId != null
            && (oldBodegaId ?? null) !== (data.bodega_id ?? null);
        if (cambioRol || cambioBodega) {
            await cerrarSesionPersona(req.params.id, oldRolId);
        }

        res.json(user);
    } catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission('usuarios.ver'), async (req, res, next) => {
    try {
        const user = await usuariosService.getById(req.params.id);
        res.json(user);
    } catch (err) { next(err); }
});

router.delete('/:id', auth, checkPermission('usuarios.eliminar'), async (req, res, next) => {
    try {
        await usuariosService.softDelete(req.params.id);
        res.json({ message: 'Usuario eliminado' });
    } catch (err) { next(err); }
});

module.exports = router;

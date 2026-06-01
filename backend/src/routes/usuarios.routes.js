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
const rolesService = createCrudService('roles', {
    searchFields: ['nombre'],
    selectFields: 'roles.*, (SELECT COUNT(*) FROM permisos_rol_v2 WHERE rol_id = roles.id) AS permisos_count',
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
        const { overrides, rol_id } = req.body; // overrides: [{ permiso_clave, tipo }], rol_id (optional for bump)
        await permisosService.setOverrides(req.params.id, overrides);
        
        // BUMP VERSION for this user's role to force logout/re-login (simplest way to invalidate one user for now)
        if (rol_id) {
            await versionService.increment(rol_id);
        }
        
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

router.post('/', auth, checkPermission('usuarios.crear'), async (req, res, next) => {
    try {
        const { nombre, email, password, rol_id, obra_id, email_corporativo } = req.body;
        if (!nombre || !email || !password || !rol_id) {
            return res.status(400).json({ error: 'nombre, email, password y rol_id son requeridos' });
        }
        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.query(
            'INSERT INTO usuarios (nombre, email, password_hash, rol_id, obra_id, email_corporativo) VALUES (?, ?, ?, ?, ?, ?)',
            [nombre, email, hash, rol_id, obra_id || null, email_corporativo || null]
        );
        res.status(201).json({ id: result.insertId, nombre, email, rol_id });
    } catch (err) { next(err); }
});

router.put('/:id', auth, checkPermission('usuarios.editar'), async (req, res, next) => {
    try {
        const data = { ...req.body };
        if (data.password) {
            data.password_hash = await bcrypt.hash(data.password, 10);
            delete data.password;
        }

        // Detectar cambio de rol_id ANTES del update para saber si invalidar
        // la sesión activa del usuario. Si no detectamos el cambio, el usuario
        // mantiene su JWT viejo (con rol_id viejo + permisos viejos) hasta
        // logout manual — bug reportado por jefatura mayo 2026.
        let oldRolId = null;
        if (data.rol_id !== undefined) {
            const [rows] = await db.query('SELECT rol_id FROM usuarios WHERE id = ?', [req.params.id]);
            if (rows.length) oldRolId = rows[0].rol_id;
        }

        const user = await usuariosService.update(req.params.id, data);

        // Si el rol_id cambió, bumpear la versión del rol VIEJO. Esto causa
        // mismatch en auth middleware (rv del JWT ≠ versionService.get(oldRol))
        // → 401 expired_by_version → forced logout → re-login → JWT nuevo con
        // rol_id nuevo + permisos nuevos.
        //
        // Side effect aceptado: otros usuarios actualmente en el rol viejo
        // también se desloguean. Trade-off OK para escala Bóveda LOLS (~50 users).
        if (oldRolId != null && data.rol_id != null && Number(oldRolId) !== Number(data.rol_id)) {
            await versionService.increment(oldRolId);
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

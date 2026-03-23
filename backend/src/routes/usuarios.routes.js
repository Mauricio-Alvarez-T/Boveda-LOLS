const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const usuariosService = require('../services/usuarios.service');
const permisosService = require('../services/permisos.service');
const versionService = require('../services/version.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');

// basic CRUD for roles
const rolesService = createCrudService('roles', { searchFields: ['nombre'], orderBy: 'nombre ASC' });
const rolesController = createCrudController(rolesService);

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
        const user = await usuariosService.update(req.params.id, data);
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
        await usuariosService.delete(req.params.id);
        res.json({ message: 'Usuario eliminado' });
    } catch (err) { next(err); }
});

module.exports = router;

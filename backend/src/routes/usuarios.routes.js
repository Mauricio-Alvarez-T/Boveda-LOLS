const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const bcrypt = require('bcryptjs');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');

// Base CRUD for usuarios (without password in responses)
const service = createCrudService('usuarios', {
    searchFields: ['nombre', 'email'],
    joins: 'LEFT JOIN roles r ON usuarios.rol_id = r.id LEFT JOIN obras o ON usuarios.obra_id = o.id',
    selectFields: 'usuarios.id, usuarios.nombre, usuarios.email, usuarios.email_corporativo, usuarios.rol_id, usuarios.obra_id, usuarios.activo, usuarios.created_at, r.nombre as rol_nombre, o.nombre as obra_nombre'
});
const controller = createCrudController(service);

router.get('/', auth, checkPermission('usuarios', 'puede_ver'), controller.getAll);
router.get('/:id', auth, checkPermission('usuarios', 'puede_ver'), controller.getById);

// Create user (with password hashing)
router.post('/', auth, checkPermission('usuarios', 'puede_crear'), async (req, res, next) => {
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

// Update user
router.put('/:id', auth, checkPermission('usuarios', 'puede_editar'), async (req, res, next) => {
    try {
        const data = { ...req.body };
        if (data.password) {
            data.password_hash = await bcrypt.hash(data.password, 10);
            delete data.password;
        }
        const item = await service.update(req.params.id, data);
        res.json(item);
    } catch (err) { next(err); }
});

router.delete('/:id', auth, checkPermission('usuarios', 'puede_eliminar'), controller.remove);

// Roles CRUD
const rolService = createCrudService('roles', { searchFields: ['nombre'] });
const rolController = createCrudController(rolService);

router.get('/roles/list', auth, checkPermission('usuarios', 'puede_ver'), rolController.getAll);
router.post('/roles', auth, checkPermission('usuarios', 'puede_crear'), rolController.create);
router.put('/roles/:id', auth, checkPermission('usuarios', 'puede_editar'), rolController.update);

// Permisos de rol
router.get('/roles/:rolId/permisos', auth, checkPermission('usuarios', 'puede_ver'), async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT * FROM permisos_rol WHERE rol_id = ?', [req.params.rolId]);
        res.json(rows);
    } catch (err) { next(err); }
});

router.post('/roles/:rolId/permisos', auth, checkPermission('usuarios', 'puede_crear'), async (req, res, next) => {
    try {
        const { modulo, puede_ver, puede_crear, puede_editar, puede_eliminar } = req.body;
        const [result] = await db.query(
            `INSERT INTO permisos_rol (rol_id, modulo, puede_ver, puede_crear, puede_editar, puede_eliminar) 
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE puede_ver=VALUES(puede_ver), puede_crear=VALUES(puede_crear), puede_editar=VALUES(puede_editar), puede_eliminar=VALUES(puede_eliminar)`,
            [req.params.rolId, modulo, puede_ver || false, puede_crear || false, puede_editar || false, puede_eliminar || false]
        );
        res.status(201).json({ id: result.insertId, modulo });
    } catch (err) { next(err); }
});

module.exports = router;

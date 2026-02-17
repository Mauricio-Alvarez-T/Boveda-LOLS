const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');

/**
 * Genera rutas CRUD completas para una entidad.
 * @param {string} moduleName - Nombre del módulo (para RBAC)
 * @param {string} tableName - Nombre de la tabla en BD
 * @param {object} options - Opciones para el servicio CRUD
 */
const createCrudRoutes = (moduleName, tableName, options = {}) => {
    const service = createCrudService(tableName, options);
    const controller = createCrudController(service);
    const r = router;

    r.get('/', auth, checkPermission(moduleName, 'puede_ver'), controller.getAll);
    r.get('/:id', auth, checkPermission(moduleName, 'puede_ver'), controller.getById);
    r.post('/', auth, checkPermission(moduleName, 'puede_crear'), controller.create);
    r.put('/:id', auth, checkPermission(moduleName, 'puede_editar'), controller.update);
    r.delete('/:id', auth, checkPermission(moduleName, 'puede_eliminar'), controller.remove);

    return r;
};

module.exports = createCrudRoutes;

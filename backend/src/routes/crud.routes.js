const express = require('express');
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
    const router = express.Router();
    const service = createCrudService(tableName, options);
    const controller = createCrudController(service);

    router.get('/', auth, checkPermission(moduleName, 'puede_ver'), controller.getAll);
    router.get('/export', auth, checkPermission(moduleName, 'puede_ver'), controller.exportExcel);
    router.get('/:id', auth, checkPermission(moduleName, 'puede_ver'), controller.getById);
    router.post('/', auth, checkPermission(moduleName, 'puede_crear'), controller.create);
    router.put('/:id', auth, checkPermission(moduleName, 'puede_editar'), controller.update);

    // Default to hard-delete for all generic catalogs unless explicitly requested to use soft-delete
    if (options.useSoftDelete) {
        router.delete('/:id', auth, checkPermission(moduleName, 'puede_eliminar'), controller.remove);
    } else {
        router.delete('/:id', auth, checkPermission(moduleName, 'puede_eliminar'), controller.hardRemove);
    }

    return router;
};

module.exports = createCrudRoutes;

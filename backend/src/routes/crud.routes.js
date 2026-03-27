const express = require('express');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');

/**
 * Genera rutas CRUD completas para una entidad.
 * @param {object|string} controllerOrModulo - Controlador instanciado O string del módulo (ej. 'empresas')
 * @param {object|string} permisosOrTable - Mapa de permisos O nombre de tabla
 * @param {object} optionsOrEmpty - Opciones genéricas para crud.service si se usa formato string
 */
const createCrudRoutes = (controllerOrModulo, permisosOrTable = {}, optionsOrEmpty = {}) => {
    const router = express.Router();

    let controller, permisos;

    if (typeof controllerOrModulo === 'string') {
        // Legacy/String format: (modulo, tableName, options)
        const service = createCrudService(permisosOrTable, optionsOrEmpty);
        controller = createCrudController(service);
        permisos = controllerOrModulo;
    } else {
        // Object format: (controller, permisosMap)
        controller = controllerOrModulo;
        permisos = permisosOrTable;
    }

    const getP = (action) => {
        if (typeof permisos === 'string') return `${permisos}.${action}`;
        return permisos[action];
    };

    if (getP('ver')) {
        router.get('/', auth, checkPermission(getP('ver')), controller.getAll);
        router.get('/:id', auth, checkPermission(getP('ver')), controller.getById);
    }
    
    if (getP('crear')) {
        router.post('/', auth, checkPermission(getP('crear')), controller.create);
    }
    
    if (getP('editar')) {
        router.put('/:id', auth, checkPermission(getP('editar')), controller.update);
    }
    
    if (getP('eliminar')) {
        router.delete('/:id', auth, checkPermission(getP('eliminar')), controller.remove);
    }

    return router;
};

module.exports = createCrudRoutes;

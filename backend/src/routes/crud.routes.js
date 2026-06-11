const express = require('express');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const validateBody = require('../middleware/validateBody');

/**
 * Genera rutas CRUD completas para una entidad.
 * @param {object|string} controllerOrModulo - Controlador instanciado O string del módulo (ej. 'empresas')
 * @param {object|string} permisosOrTable - Mapa de permisos O nombre de tabla
 * @param {object} optionsOrEmpty - Opciones genéricas para crud.service si se usa formato string
 * @param {object} routeOptions - Opt-in (F1.3): { createSchema, updateSchema } para validar+strip
 *   el body en POST / y PUT /:id con el mini-DSL de validateBody. Sin esto, nada cambia.
 */
const createCrudRoutes = (controllerOrModulo, permisosOrTable = {}, optionsOrEmpty = {}, routeOptions = {}) => {
    const router = express.Router();
    const { createSchema, updateSchema } = routeOptions;
    const createMw = createSchema ? [validateBody(createSchema, { strip: true })] : [];
    const updateMw = updateSchema ? [validateBody(updateSchema, { strip: true })] : [];

    let controller, permisos;

    if (typeof controllerOrModulo === 'string' || (typeof controllerOrModulo === 'object' && !controllerOrModulo.getAll)) {
        // Auto-generate service & controller
        const service = createCrudService(permisosOrTable, optionsOrEmpty);
        controller = createCrudController(service);
        permisos = controllerOrModulo; // string or object like { ver: 'perm.ver', crear: 'perm.crear' }
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
        router.post('/', auth, checkPermission(getP('crear')), ...createMw, controller.create);
    }

    if (getP('editar')) {
        router.put('/:id', auth, checkPermission(getP('editar')), ...updateMw, controller.update);
    }
    
    if (getP('eliminar')) {
        router.delete('/:id', auth, checkPermission(getP('eliminar')), controller.remove);
    }

    return router;
};

module.exports = createCrudRoutes;

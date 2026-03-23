const express = require('express');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

/**
 * Genera rutas CRUD completas para una entidad.
 * @param {object} controller - El controlador CRUD ya instanciado.
 * @param {object|string} permisos - Un mapa de permisos (ej. { ver: 'modulo.ver', crear: 'modulo.crear' })
 */
const createCrudRoutes = (controller, permisos = {}) => {
    const router = express.Router();

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
        router.delete('/:id', auth, checkPermission(getP('eliminar')), controller.hardRemove);
    }

    return router;
};

module.exports = createCrudRoutes;

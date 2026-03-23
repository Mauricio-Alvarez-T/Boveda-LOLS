const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const feriadosService = require('../services/feriados.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');

const service = createCrudService('feriados', { searchFields: ['nombre'], orderBy: 'fecha ASC' });
const controller = createCrudController(service);

router.use('/', createCrudRoutes(controller, {
    ver: 'asistencia.ver',
    crear: 'asistencia.feriado.gestionar',
    editar: 'asistencia.feriado.gestionar',
    eliminar: 'asistencia.feriado.gestionar'
}));

module.exports = router;

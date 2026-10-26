const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const feriadosService = require('../services/feriados.service');
const validateBody = require('../middleware/validateBody');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');

const service = createCrudService('feriados', { searchFields: ['nombre'], orderBy: 'fecha ASC' });
const controller = createCrudController(service);

// POST /sync — trae los feriados nacionales del año (se había perdido en el refactor de permisos 184db631:
// el botón «Sincronizar» de Configuración llamaba a una ruta inexistente). Va ANTES del CRUD genérico.
const ANIO_MIN = 2020;
router.post('/sync', auth, checkPermission('asistencia.feriado.gestionar'),
    validateBody({ year: { required: true, type: 'integer', min: ANIO_MIN, max: new Date().getFullYear() + 2 } }),
    async (req, res, next) => {
        try {
            res.json(await feriadosService.syncNacionalHolidays(Number(req.body.year)));
        } catch (err) { next(err); }
    });

router.use('/', createCrudRoutes(controller, {
    ver: 'asistencia.ver',
    crear: 'asistencia.feriado.gestionar',
    editar: 'asistencia.feriado.gestionar',
    eliminar: 'asistencia.feriado.gestionar'
}));

module.exports = router;

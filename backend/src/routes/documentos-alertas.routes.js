/**
 * /api/documentos-alertas — alertas de documentos sin firmar (plan Gestiones B7, mig 115).
 *
 *  GET  /pendientes      [documentos.entrega.registrar]      lo que supera su umbral (Bandeja + Documentos físicos)
 *  GET  /config          [sistema.alertas_documentos.gestionar] categorías con sus días
 *  PUT  /config/:id      [sistema.alertas_documentos.gestionar] etiqueta / activo / dias_aviso / dias_critico
 * Las categorías son fijas (seed de la mig 115): no se crean ni se borran desde la UI. El CRUD genérico
 * aplica la regla cruzada dias_critico >= dias_aviso en `beforeUpdate` (validateBody es por campo).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const cacheControl = require('../middleware/cacheControl');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');
const service = require('../services/documentosAlertas.service');

const PERM_CONFIG = 'sistema.alertas_documentos.gestionar';
const PERM_PENDIENTES = 'documentos.entrega.registrar';

// cacheControl(60): 3 queries con DATEDIFF → ETag de 60s; el resultado cambia por día, no por segundo.
router.get('/pendientes', auth, checkPermission(PERM_PENDIENTES), cacheControl(60), async (req, res, next) => {
    try { res.json({ data: await service.pendientes() }); } catch (err) { next(err); }
});

const configService = createCrudService('documentos_alertas_config', {
    searchFields: ['categoria', 'etiqueta'],
    orderBy: 'orden ASC, id ASC',
    allowedFields: ['etiqueta', 'activo', 'dias_aviso', 'dias_critico'],
    beforeUpdate: (id, safeData, db) => service.validarConfig(id, safeData, db),
});
router.use('/config', createCrudRoutes(createCrudController(configService), {
    ver: PERM_CONFIG,
    editar: PERM_CONFIG,
}));

module.exports = router;

/**
 * /api/solicitudes-ingreso — Ficha de ingreso digital (solicitud de nuevo
 * trabajador con aprobación). Montado en index.js vía safeRoute.
 *
 * Gates (checkPermission con varios args = OR):
 *   trabajadores.solicitud.crear   → terreno: check-rut, crear, ver las propias
 *   trabajadores.solicitud.aprobar → oficina: ver todas, contador, aprobar, rechazar
 * El scoping "propias vs todas" de GET / y GET /:id lo resuelve el service con
 * req.user (403 si es ajena y no tiene aprobar).
 *
 * Orden: las rutas de 2 segmentos fijos (/check-rut/:rut, /pendientes/count)
 * van ANTES de /:id para que Express no las tome como un id.
 */
const router = require('express').Router();
const desvinculacionService = require('../services/desvinculacion.service');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const service = require('../services/solicitudIngreso.service');
const { crear, aprobar, rechazar } = require('../schemas/solicitudesIngreso.schema');

const CREAR = 'trabajadores.solicitud.crear';
const APROBAR = 'trabajadores.solicitud.aprobar';

// GET /api/solicitudes-ingreso/check-rut/:rut — validación en vivo del RUT
// (primer campo del formulario). Gate propio: terreno NO tiene
// `trabajadores.crear`, que es el gate del check-rut del módulo Trabajadores.
router.get('/check-rut/:rut', auth, checkPermission(CREAR), async (req, res, next) => {
    try {
        // Oficina (trabajadores.ver) ve el nombre de la causal; terreno solo fecha/artículo/marca.
        const result = await service.checkRut(req.params.rut, { modo: desvinculacionService.modoSegunPermisos(req.user?.p) });
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/solicitudes-ingreso/pendientes/count — badge del sidebar.
router.get('/pendientes/count', auth, checkPermission(APROBAR), async (req, res, next) => {
    try {
        const result = await service.contarPendientes(req.query);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/solicitudes-ingreso?estado=pendiente|aprobada|rechazada|todas
router.get('/', auth, checkPermission(CREAR, APROBAR), async (req, res, next) => {
    try {
        const result = await service.listar(req.query, req.user);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/solicitudes-ingreso — terreno crea la solicitud.
router.post('/', auth, checkPermission(CREAR), validateBody(crear, { strip: true }), async (req, res, next) => {
    try {
        const result = await service.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/solicitudes-ingreso/:id
router.get('/:id', auth, checkPermission(CREAR, APROBAR), async (req, res, next) => {
    try {
        const result = await service.getById(req.params.id, req.user);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/solicitudes-ingreso/:id/aprobar — body = ficha COMPLETA editada por
// la oficina + empresa_id obligatoria (+ categoria_reporte opcional).
router.put('/:id/aprobar', auth, checkPermission(APROBAR), validateBody(aprobar, { strip: true }), async (req, res, next) => {
    try {
        const result = await service.aprobar(req.params.id, req.body, req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/solicitudes-ingreso/:id/rechazar { motivo } — motivo obligatorio.
router.put('/:id/rechazar', auth, checkPermission(APROBAR), validateBody(rechazar, { strip: true }), async (req, res, next) => {
    try {
        const result = await service.rechazar(req.params.id, req.body.motivo, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

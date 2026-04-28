const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const transferenciaService = require('../services/transferencia.service');

// Auditoría 4.4: schema mínimo común para crear transferencias.
// Cada flujo extiende esto si necesita campos extra (motivo obligatorio, etc.).
const crearTransferenciaSchema = {
    items: { required: true, type: 'array', minLength: 1 },
};
const aprobarTransferenciaSchema = {
    items: { required: true, type: 'array', minLength: 1 },
};

// GET /api/transferencias
router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/pendientes
router.get('/pendientes', auth, checkPermission('inventario.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getPendientes();
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/mis-solicitudes
router.get('/mis-solicitudes', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getMisSolicitudes(req.user.id, req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/discrepancias?estado=pendiente|resuelta|descartada
// (debe ir ANTES de /:id para que Express no interprete 'discrepancias' como un ID)
router.get('/discrepancias', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getDiscrepancias(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// PUT /api/transferencias/discrepancias/:id/resolver  body: { estado, resolucion }
router.put('/discrepancias/:id/resolver', auth, checkPermission('inventario.aprobar'), async (req, res, next) => {
    try {
        const { estado, resolucion } = req.body;
        const result = await transferenciaService.resolverDiscrepancia(
            req.params.id, req.user.id, estado, resolucion
        );
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/:id
router.get('/:id', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getById(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias
router.post('/', auth, checkPermission('inventario.crear'), validateBody(crearTransferenciaSchema), async (req, res, next) => {
    try {
        const result = await transferenciaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/push-directo — bodega → obra sin aprobación
router.post('/push-directo', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.pushDirecto(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-bodega — bodega → bodega, instantáneo
router.post('/intra-bodega', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraBodega(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/devolucion — obra → bodega, con aprobación
router.post('/devolucion', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await transferenciaService.devolucion(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-obra — obra → obra, con aprobación
router.post('/intra-obra', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraObra(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/orden-gerencia — orden ejecutiva PM/dueño, bypasa aprobación
router.post('/orden-gerencia', auth, checkPermission('inventario.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.ordenGerencia(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/aprobar
router.put('/:id/aprobar', auth, checkPermission('inventario.aprobar'), validateBody(aprobarTransferenciaSchema), async (req, res, next) => {
    try {
        const result = await transferenciaService.aprobar(req.params.id, req.user.id, req.body);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/despachar
router.put('/:id/despachar', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.despachar(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/recibir
router.put('/:id/recibir', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.recibir(req.params.id, req.user.id, req.body.items);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar — rechazo del aprobador (desde pendiente|aprobada)
router.put('/:id/rechazar', auth, checkPermission('inventario.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar-recepcion — rechazo físico del receptor (desde en_transito)
// Permiso distinto (inventario.editar) porque el receptor suele ser bodeguero, no aprobador.
router.put('/:id/rechazar-recepcion', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/:id/crear-faltante
// Crea una nueva solicitud de transferencia por las cantidades faltantes (solicitadas - enviadas)
// de una transferencia aprobada parcialmente.
router.post('/:id/crear-faltante', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await transferenciaService.crearFaltante(req.params.id, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/cancelar
router.put('/:id/cancelar', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.cancelar(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

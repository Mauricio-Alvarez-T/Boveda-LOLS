const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const transferenciaService = require('../services/transferencia.service');

// Auditoría 4.4: schema mínimo común para crear transferencias.
// Cada flujo extiende esto si necesita campos extra (motivo obligatorio, etc.).
// items e items_custom son ambos opcionales aquí — el service valida que
// al menos uno tenga elementos (items_custom = items personalizados fuera
// de catálogo, p.ej. cosas a comprar).
const crearTransferenciaSchema = {
    items: { type: 'array' },
    items_custom: { type: 'array' },
};
// `items` no es required: una transferencia puede contener sólo items_custom
// (ej. solicitud_materiales) — el servicio detecta ese caso y bypasea el flujo
// de splits/stock, sólo transiciona el estado.
const aprobarTransferenciaSchema = {
    items: { type: 'array' },
};

// GET /api/transferencias
// Si NO tiene `inventario.transferencias.ver_todas` → backend scopea por
// solicitante_id = user.id (sólo ve sus propias). Permiso default deny;
// admin lo concede a roles que necesiten visión global.
router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const verTodas = Array.isArray(req.user?.p) && req.user.p.includes('inventario.transferencias.ver_todas');
        const solicitanteId = verTodas ? null : req.user.id;
        const result = await transferenciaService.getAll(req.query, solicitanteId);
        res.json(result);
    } catch (err) { next(err); }
});

// GET /api/transferencias/pendientes — lista para aprobadores
router.get('/pendientes', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
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
router.get('/discrepancias', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getDiscrepancias(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// PUT /api/transferencias/discrepancias/:id/resolver  body: { estado, resolucion }
router.put('/discrepancias/:id/resolver', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const { estado, resolucion } = req.body;
        const result = await transferenciaService.resolverDiscrepancia(
            req.params.id, req.user.id, estado, resolucion
        );
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/:id
// Defensa en profundidad: si NO tiene `inventario.transferencias.ver_todas`,
// sólo puede ver el detalle de transferencias que él mismo creó. Evita
// que un usuario adivine IDs y abra solicitudes de terceros.
router.get('/:id', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getById(req.params.id);
        if (!result) return res.status(404).json({ error: 'Transferencia no encontrada' });

        const verTodas = Array.isArray(req.user?.p) && req.user.p.includes('inventario.transferencias.ver_todas');
        if (!verTodas && result.solicitante_id !== req.user.id) {
            return res.status(403).json({ error: 'No tienes permiso para ver esta transferencia' });
        }
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias — solicitud normal (flujo con aprobación)
router.post('/', auth, checkPermission('inventario.transferencias.solicitar'), validateBody(crearTransferenciaSchema), async (req, res, next) => {
    try {
        const result = await transferenciaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/solicitud-materiales — obra pide materiales de construcción.
// Misma lógica que solicitud estándar (flujo con aprobación, SoD aplica) pero con
// permiso independiente para gating granular por rol.
router.post('/solicitud-materiales', auth, checkPermission('inventario.transferencias.solicitud_materiales'), validateBody(crearTransferenciaSchema), async (req, res, next) => {
    try {
        req.body.tipo_flujo = 'solicitud_materiales';
        const result = await transferenciaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/push-directo — bodega → obra sin aprobación.
// Por diseño consolida solicitante + aprobador + transportista en 1 user; SoD no aplica.
router.post('/push-directo', auth, checkPermission('inventario.transferencias.push_directo'), async (req, res, next) => {
    try {
        const result = await transferenciaService.pushDirecto(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-bodega — bodega → bodega CON aprobación.
// Nace 'pendiente'; sigue el flujo normal (aprobar → despachar → recibir).
// El stock se mueve recién en la recepción (decisión jefatura mayo 2026).
router.post('/intra-bodega', auth, checkPermission('inventario.transferencias.intra_bodega'), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraBodega(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/devolucion — obra → bodega, con aprobación
router.post('/devolucion', auth, checkPermission('inventario.transferencias.solicitar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.devolucion(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/intra-obra — obra → obra, con aprobación
router.post('/intra-obra', auth, checkPermission('inventario.transferencias.solicitar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.intraObra(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/orden-gerencia — orden ejecutiva PM/dueño, bypasa aprobación.
// Por diseño consolida solicitante + aprobador + transportista; SoD no aplica.
router.post('/orden-gerencia', auth, checkPermission('inventario.transferencias.orden_gerencia'), async (req, res, next) => {
    try {
        const result = await transferenciaService.ordenGerencia(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/aprobar — SoD: el aprobador no puede ser el solicitante
router.put('/:id/aprobar', auth, checkPermission('inventario.transferencias.aprobar'), validateBody(aprobarTransferenciaSchema), async (req, res, next) => {
    try {
        const result = await transferenciaService.aprobar(req.params.id, req.user.id, req.body, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/despachar — SoD: el transportista no puede ser el aprobador
router.put('/:id/despachar', auth, checkPermission('inventario.transferencias.despachar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.despachar(req.params.id, req.user.id, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/recibir — SoD: el receptor no puede ser el transportista
// Body acepta `tipo: 'parcial' | 'total'` (default 'total' por back-compat).
// En modo parcial: deja la TRF en estado 'recepcion_parcial' para múltiples viajes.
// En modo total: cierra la TRF (estado 'recibida') y genera discrepancias por gaps.
router.put('/:id/recibir', auth, checkPermission('inventario.transferencias.recibir'), async (req, res, next) => {
    try {
        const tipo = req.body.tipo === 'parcial' ? 'parcial' : 'total';
        const result = await transferenciaService.recibir(req.params.id, req.user.id, req.body.items, req.user.p, tipo, req.body.observacion);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/transferencias/:id/recepciones — historial de eventos de recepción
// Cualquier usuario con permiso de ver la TRF puede ver su historial.
// Usa 'inventario.ver' (mismo que GET / y GET /:id). El antiguo
// 'inventario.transferencias.ver' NO existe en permisos.config → daba 403 a
// TODOS (incl. Super Admin) y dejaba el historial de entregas vacío.
router.get('/:id/recepciones', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await transferenciaService.getRecepciones(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar — rechazo del aprobador (desde pendiente|aprobada)
router.put('/:id/rechazar', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/rechazar-recepcion — rechazo físico del receptor (desde en_transito)
// Permiso del receptor (no del aprobador) — bodeguero/jefe obra destino.
router.put('/:id/rechazar-recepcion', auth, checkPermission('inventario.transferencias.recibir'), async (req, res, next) => {
    try {
        const result = await transferenciaService.rechazar(req.params.id, req.user.id, req.body.motivo);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/transferencias/:id/crear-faltante
// Crea una nueva solicitud de transferencia por las cantidades faltantes (solicitadas - enviadas)
// de una transferencia aprobada parcialmente.
router.post('/:id/crear-faltante', auth, checkPermission('inventario.transferencias.solicitar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.crearFaltante(req.params.id, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/cancelar
router.put('/:id/cancelar', auth, checkPermission('inventario.transferencias.cancelar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.cancelar(req.params.id, req.user.id, req.user.p);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/transferencias/:id/prorrogar — extiende 10 días una solicitud pendiente estancada.
// Requiere permiso de aprobar (quien gestiona el flujo decide extender el plazo).
router.put('/:id/prorrogar', auth, checkPermission('inventario.transferencias.aprobar'), async (req, res, next) => {
    try {
        const result = await transferenciaService.prorrogar(req.params.id, req.user.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

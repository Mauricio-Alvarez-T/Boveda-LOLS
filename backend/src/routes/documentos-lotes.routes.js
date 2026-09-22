/**
 * /api/documentos-lotes — cadena de custodia de documentos físicos (plan Gestiones B6, mig 114).
 *
 * Gates: documentos.entrega.registrar (RRHH: armar lotes, recibir firmados, anular) y
 * documentos.entrega.portar (portador: ver SUS lotes y confirmar el retiro). Las lecturas compartidas
 * usan OR y el service recorta al portador (solo sus lotes). Doble llave: confirmar-retiro exige
 * `portar` Y ser el portador del lote — RRHH no puede hacerlo por él.
 * Rutas con primer segmento literal ANTES de /:id. El activityLogger global excluye este prefijo: el
 * service deja un log manual por acción.
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const service = require('../services/documentosLotes.service');
const schema = require('../schemas/documentosLotes.schema');

const REGISTRAR = service.PERM_REGISTRAR;
const PORTAR = service.PERM_PORTAR;

// Quiénes pueden retirar (para el <select> de RRHH).
router.get('/portadores', auth, checkPermission(REGISTRAR), async (req, res, next) => {
    try { res.json({ data: await service.portadores() }); } catch (err) { next(err); }
});

// Documentos impresos sin lote (lo que RRHH puede meter en un lote).
router.get('/disponibles', auth, checkPermission(REGISTRAR), async (req, res, next) => {
    try { res.json({ data: await service.disponibles({ obra_id: req.query.obra_id, q: req.query.q }) }); } catch (err) { next(err); }
});

// Contadores para el badge y la Bandeja del Día.
router.get('/pendientes/count', auth, checkPermission(REGISTRAR, PORTAR), async (req, res, next) => {
    try { res.json({ data: await service.pendientesCount(req.user) }); } catch (err) { next(err); }
});

// Lotes visibles (RRHH: todos; portador: los suyos).
router.get('/', auth, checkPermission(REGISTRAR, PORTAR), async (req, res, next) => {
    try { res.json({ data: await service.listar({ estado: req.query.estado }, req.user) }); } catch (err) { next(err); }
});

// RRHH arma un lote.
router.post('/', auth, checkPermission(REGISTRAR), validateBody(schema.crear, { strip: true }), async (req, res, next) => {
    try { res.status(201).json({ data: await service.crear(req.body, req.user.id, req) }); } catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission(REGISTRAR, PORTAR), async (req, res, next) => {
    try { res.json({ data: await service.obtener(req.params.id, req.user) }); } catch (err) { next(err); }
});

// El portador confirma qué recibió.
router.put('/:id/confirmar-retiro', auth, checkPermission(PORTAR), validateBody(schema.confirmarRetiro, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await service.confirmarRetiro(req.params.id, req.body, req.user, req) }); } catch (err) { next(err); }
});

// RRHH recibe firmados / devueltos sin firma.
router.put('/:id/recepcion', auth, checkPermission(REGISTRAR), validateBody(schema.recepcion, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await service.recepcion(req.params.id, req.body, req.user, req) }); } catch (err) { next(err); }
});

// RRHH anula un lote aún no confirmado.
router.delete('/:id', auth, checkPermission(REGISTRAR), async (req, res, next) => {
    try { res.json({ data: await service.anular(req.params.id, req.user, req) }); } catch (err) { next(err); }
});

module.exports = router;

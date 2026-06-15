const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const svc = require('../services/vehiculos.service');
const uploadVehiculos = require('../middleware/upload-vehiculos');

// ── Alertas (antes de /:id para que no sea capturado) ──────────────────
router.get('/alertas', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try {
        const dias = Number(req.query.dias) || 30;
        const [porVencer, vencidas] = await Promise.all([
            svc.getAlertas(dias),
            svc.getVencidas(),
        ]);
        res.json({ data: { porVencer, vencidas } });
    } catch (err) { next(err); }
});

// ── Vehículos CRUD ──────────────────────────────────────────────────────
router.get('/', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getAll(req.query) }); }
    catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getById(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/', auth, checkPermission('vehiculos.crear'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.create(req.body) }); }
    catch (err) { next(err); }
});

router.put('/:id', auth, checkPermission('vehiculos.editar'), async (req, res, next) => {
    try { res.json({ data: await svc.update(req.params.id, req.body) }); }
    catch (err) { next(err); }
});

router.delete('/:id', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.remove(req.params.id) }); }
    catch (err) { next(err); }
});

// ── Seguros ────────────────────────────────────────────────────────────
router.get('/:id/seguros', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getSeguros(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/:id/seguros', auth, checkPermission('vehiculos.crear'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.createSeguro(req.params.id, req.body) }); }
    catch (err) { next(err); }
});

router.put('/:id/seguros/:segId', auth, checkPermission('vehiculos.editar'), async (req, res, next) => {
    try { res.json({ data: await svc.updateSeguro(req.params.segId, req.body) }); }
    catch (err) { next(err); }
});

router.delete('/:id/seguros/:segId', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.removeSeguro(req.params.id, req.params.segId) }); }
    catch (err) { next(err); }
});

// ── Revisiones ────────────────────────────────────────────────────────
router.get('/:id/revisiones', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getRevisiones(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/:id/revisiones', auth, checkPermission('vehiculos.crear'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.createRevision(req.params.id, req.body) }); }
    catch (err) { next(err); }
});

router.put('/:id/revisiones/:revId', auth, checkPermission('vehiculos.editar'), async (req, res, next) => {
    try { res.json({ data: await svc.updateRevision(req.params.revId, req.body) }); }
    catch (err) { next(err); }
});

router.delete('/:id/revisiones/:revId', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.removeRevision(req.params.id, req.params.revId) }); }
    catch (err) { next(err); }
});

// ── Mantenciones ──────────────────────────────────────────────────────
router.get('/:id/mantenciones', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getMantenciones(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/:id/mantenciones', auth, checkPermission('vehiculos.crear'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.createMantencion(req.params.id, req.body) }); }
    catch (err) { next(err); }
});

router.put('/:id/mantenciones/:mId', auth, checkPermission('vehiculos.editar'), async (req, res, next) => {
    try { res.json({ data: await svc.updateMantencion(req.params.mId, req.body) }); }
    catch (err) { next(err); }
});

router.delete('/:id/mantenciones/:mId', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.removeMantencion(req.params.id, req.params.mId) }); }
    catch (err) { next(err); }
});

// ── Permisos de Circulación ───────────────────────────────────────────
router.get('/:id/permisos', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getPermisos(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/:id/permisos', auth, checkPermission('vehiculos.crear'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.createPermiso(req.params.id, req.body) }); }
    catch (err) { next(err); }
});

router.put('/:id/permisos/:permId', auth, checkPermission('vehiculos.editar'), async (req, res, next) => {
    try { res.json({ data: await svc.updatePermiso(req.params.permId, req.body) }); }
    catch (err) { next(err); }
});

router.delete('/:id/permisos/:permId', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.removePermiso(req.params.id, req.params.permId) }); }
    catch (err) { next(err); }
});

// ── Documentos / Antecedentes de Circulación ──────────────────────────
router.get('/:id/documentos', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try { res.json({ data: await svc.getDocumentos(req.params.id) }); }
    catch (err) { next(err); }
});

router.post('/:id/documentos', auth, checkPermission('vehiculos.crear'), uploadVehiculos.single('archivo'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
        const doc = await svc.createDocumento(req.params.id, {
            categoria: req.body.categoria,
            file: req.file,
            userId: req.user?.id,
        });
        res.status(201).json({ data: doc });
    } catch (err) { next(err); }
});

router.get('/:id/documentos/:docId/download', auth, checkPermission('vehiculos.ver'), async (req, res, next) => {
    try {
        const { fullPath, fileName } = await svc.getDocumentoFilePath(req.params.id, req.params.docId);
        res.download(fullPath, fileName);
    } catch (err) { next(err); }
});

router.delete('/:id/documentos/:docId', auth, checkPermission('vehiculos.eliminar'), async (req, res, next) => {
    try { res.json({ data: await svc.removeDocumento(req.params.id, req.params.docId) }); }
    catch (err) { next(err); }
});

module.exports = router;

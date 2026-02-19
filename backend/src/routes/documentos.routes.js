const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const upload = require('../middleware/upload');
const documentoService = require('../services/documento.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const path = require('path');

// Basic CRUD for tipos_documento
const tipoDocService = createCrudService('tipos_documento', { searchFields: ['nombre'] });
const tipoDocController = createCrudController(tipoDocService);

// KPIs
router.get('/kpi/vencidos', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const dias = req.query.dias || 30;
        const result = await documentoService.getVencidos(Number(dias));
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/kpi/faltantes', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await documentoService.getFaltantes();
        res.json(result);
    } catch (err) { next(err); }
});

// Document completion percentage per worker
router.post('/kpi/completitud', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajador_ids } = req.body;
        if (!trabajador_ids || !Array.isArray(trabajador_ids)) {
            return res.status(400).json({ error: 'trabajador_ids es requerido (array de IDs)' });
        }
        const result = await documentoService.getCompletionByTrabajadores(trabajador_ids);
        res.json(result);
    } catch (err) { next(err); }
});

// Upload
router.post('/upload/:trabajadorId', auth, checkPermission('documentos', 'puede_crear'), upload.single('archivo'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se proporcionó ningún archivo' });
        }
        const { tipo_documento_id } = req.body;
        if (!tipo_documento_id) {
            return res.status(400).json({ error: 'tipo_documento_id es requerido' });
        }
        const result = await documentoService.upload(
            req.params.trabajadorId, req.file, tipo_documento_id, req.user.id
        );
        res.status(201).json(result);
    } catch (err) { next(err); }
});

// Get docs by worker
router.get('/trabajador/:trabajadorId', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const docs = await documentoService.getByTrabajador(req.params.trabajadorId);
        res.json({ data: docs });
    } catch (err) { next(err); }
});

// Download
router.get('/download/:id', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { fullPath, fileName } = await documentoService.getFilePath(req.params.id);
        res.download(fullPath, fileName);
    } catch (err) { next(err); }
});

router.get('/download-all/:trabajadorId', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        await documentoService.downloadAll(req.params.trabajadorId, res);
    } catch (err) { next(err); }
});

// Delete (Soft Delete)
router.delete('/:id', auth, checkPermission('documentos', 'puede_eliminar'), async (req, res, next) => {
    try {
        await documentoService.delete(req.params.id);
        res.json({ message: 'Documento eliminado' });
    } catch (err) { next(err); }
});

// Tipos documento CRUD
router.get('/tipos', auth, checkPermission('documentos', 'puede_ver'), tipoDocController.getAll);
router.post('/tipos', auth, checkPermission('documentos', 'puede_crear'), tipoDocController.create);
router.put('/tipos/:id', auth, checkPermission('documentos', 'puede_editar'), tipoDocController.update);
router.delete('/tipos/:id', auth, checkPermission('documentos', 'puede_eliminar'), tipoDocController.remove);

module.exports = router;

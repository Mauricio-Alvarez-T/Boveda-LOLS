const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const upload = require('../middleware/upload');
const documentoService = require('../services/documento.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const path = require('path');

// Basic CRUD for tipos_documento
const tipoDocService = createCrudService('tipos_documento', { searchFields: ['nombre'], orderBy: 'nombre ASC', allowedFields: ['nombre', 'dias_vigencia', 'obligatorio', 'activo'] });
const tipoDocController = createCrudController(tipoDocService);

// KPIs
router.get('/kpi/vencidos', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const data = await documentoService.getKPIVencidos();
        res.json(data);
    } catch (err) { next(err); }
});

router.get('/kpi/faltantes', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const data = await documentoService.getKPIFaltantes(req.query);
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/kpi/completitud', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const data = await documentoService.getKPICompletitud(req.body);
        res.json(data);
    } catch (err) { next(err); }
});

// Upload document
router.post('/upload/:trabajadorId', auth, checkPermission('documentos.subir'), upload.single('archivo'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        
        const data = await documentoService.upload(
            req.params.trabajadorId, 
            req.body.tipo_id, 
            req.file, 
            req.user.id
        );
        res.status(201).json(data);
    } catch (err) { next(err); }
});

// List documents for a worker
router.get('/trabajador/:trabajadorId', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const data = await documentoService.getByTrabajador(req.params.trabajadorId);
        res.json(data);
    } catch (err) { next(err); }
});

// Download individual document
router.get('/download/:id', auth, checkPermission('documentos.descargar'), async (req, res, next) => {
    try {
        const { filePath, fileName } = await documentoService.getDownloadPath(req.params.id);
        res.download(filePath, fileName);
    } catch (err) { next(err); }
});

// Download all documents for a worker as ZIP
router.get('/download-all/:trabajadorId', auth, checkPermission('documentos.descargar'), async (req, res, next) => {
    try {
        const { zipPath, fileName } = await documentoService.getZipPath(req.params.trabajadorId);
        res.download(zipPath, fileName);
    } catch (err) { next(err); }
});

// Delete document
router.delete('/:id', auth, checkPermission('documentos.eliminar'), async (req, res, next) => {
    try {
        await documentoService.delete(req.params.id, req.user.id);
        res.json({ message: 'Documento eliminado correctamente' });
    } catch (err) { next(err); }
});

// Tipos de Documento
router.get('/tipos', auth, checkPermission('documentos.ver', 'sistema.tipos_doc.gestionar'), tipoDocController.getAll);
router.post('/tipos', auth, checkPermission('sistema.tipos_doc.gestionar'), tipoDocController.create);
router.put('/tipos/:id', auth, checkPermission('sistema.tipos_doc.gestionar'), tipoDocController.update);
router.delete('/tipos/:id', auth, checkPermission('sistema.tipos_doc.gestionar'), tipoDocController.remove);

module.exports = router;

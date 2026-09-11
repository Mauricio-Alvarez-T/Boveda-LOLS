const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const upload = require('../middleware/upload');
const documentoService = require('../services/documento.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const path = require('path');
const fs = require('fs');

// Basic CRUD for tipos_documento
const tipoDocService = createCrudService('tipos_documento', { searchFields: ['nombre'], orderBy: 'nombre ASC', allowedFields: ['nombre', 'dias_vigencia', 'obligatorio', 'activo'] });
const tipoDocController = createCrudController(tipoDocService);

// KPIs
router.get('/kpi/vencidos', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        // ?dias=N (default 30): documentos vencidos o por vencer dentro de N días.
        const dias = Number(req.query.dias) || 30;
        const data = await documentoService.getVencidos(dias);
        res.json(data);
    } catch (err) { next(err); }
});

router.get('/kpi/faltantes', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const data = await documentoService.getFaltantes();
        res.json(data);
    } catch (err) { next(err); }
});

router.post('/kpi/completitud', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const ids = (req.body && (req.body.trabajador_ids || req.body.ids)) || null;
        if (!Array.isArray(ids)) return res.status(400).json({ error: 'Se requiere un arreglo trabajador_ids' });
        const data = await documentoService.getCompletionByTrabajadores(ids.map(Number).filter(Number.isInteger));
        res.json(data);
    } catch (err) { next(err); }
});

// Upload document
router.post('/upload/:trabajadorId', auth, checkPermission('documentos.subir'), upload.single('archivo'), async (req, res, next) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No se subió ningún archivo' });
        
        // El front manda `tipo_documento_id` (DocumentUploader); `tipo_id` se acepta por compatibilidad.
        const tipoId = Number(req.body?.tipo_documento_id ?? req.body?.tipo_id);
        if (!Number.isInteger(tipoId) || tipoId <= 0) {
            fs.unlink(req.file.path, () => {}); // no dejar huérfano el temporal de multer
            return res.status(400).json({ error: 'Falta el tipo de documento' });
        }
        // Firma del service: upload(trabajadorId, file, tipoDocumentoId, userId). Hasta 2026-09-11 la
        // ruta pasaba (tid, tipo_id, file, user): `file` llegaba undefined → TypeError 500 en toda subida.
        const data = await documentoService.upload(req.params.trabajadorId, req.file, tipoId, req.user.id);
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
        const { fullPath, fileName } = await documentoService.getFilePath(req.params.id);
        res.download(fullPath, fileName);
    } catch (err) { next(err); }
});

// Download all documents for a worker as ZIP (downloadAll escribe directo en res)
router.get('/download-all/:trabajadorId', auth, checkPermission('documentos.descargar'), async (req, res, next) => {
    try {
        await documentoService.downloadAll(req.params.trabajadorId, res);
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

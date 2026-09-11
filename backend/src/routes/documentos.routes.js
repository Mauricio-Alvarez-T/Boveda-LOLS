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
// codigo/restringido (mig 110) NO están en allowedFields: los fija la migración. Un tipo del
// sistema (con codigo) no se puede desactivar ni volver obligatorio desde Settings (409).
async function codigoDeTipo(id) {
    try {
        const [rows] = await require('../config/db').query('SELECT codigo FROM tipos_documento WHERE id = ?', [id]);
        return rows[0]?.codigo || null;
    } catch (err) {
        if (err.errno === 1054) return null; // sin mig 110 no hay tipos del sistema
        throw err;
    }
}
const tipoDocService = createCrudService('tipos_documento', {
    searchFields: ['nombre'], orderBy: 'nombre ASC', allowedFields: ['nombre', 'dias_vigencia', 'obligatorio', 'activo'],
    beforeUpdate: async (id, safeData) => {
        const codigo = await codigoDeTipo(id);
        if (!codigo) return;
        const desactiva = safeData.activo === false || safeData.activo === 0 || safeData.activo === '0';
        const obliga = safeData.obligatorio === true || safeData.obligatorio === 1 || safeData.obligatorio === '1';
        if (desactiva || obliga) {
            throw Object.assign(new Error(`"${codigo}" es un tipo del sistema (documentos generados por Bóveda): no se puede desactivar ni marcar obligatorio.`), { statusCode: 409, code: 'TIPO_SISTEMA' });
        }
    },
});
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
        const { fullPath, fileName, restringido } = await documentoService.getFilePath(req.params.id);
        // Tipo restringido (mig 110): contratos, finiquitos y anexos laborales solo desde oficina.
        if (restringido && !(req.user?.p || []).includes('documentos.laborales.descargar')) {
            return res.status(403).json({ error: 'Documento laboral: descarga solo desde oficina', required: ['documentos.laborales.descargar'] });
        }
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
router.delete('/tipos/:id', auth, checkPermission('sistema.tipos_doc.gestionar'), async (req, res, next) => {
    try {
        const codigo = await codigoDeTipo(req.params.id);
        if (codigo) return res.status(409).json({ error: `"${codigo}" es un tipo del sistema: no se puede eliminar.`, code: 'TIPO_SISTEMA' });
        return tipoDocController.remove(req, res, next);
    } catch (err) { next(err); }
});

module.exports = router;

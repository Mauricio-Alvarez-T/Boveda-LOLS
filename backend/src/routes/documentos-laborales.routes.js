/**
 * /api/documentos-laborales — documentos generados por Bóveda (plan Gestiones B2, mig 110).
 *
 * Gates EXCLUSIVOS (sin patrón OR): emitir = documentos.laborales.emitir; descargar/imprimir =
 * documentos.laborales.descargar (implica ver la remuneración impresa en el contrato). Listar los
 * generados de un trabajador = documentos.ver (sin metadata). El activityLogger global excluye este
 * prefijo: cada acción deja un log manual sin montos desde el service.
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const service = require('../services/documentosLaborales.service');
const schema = require('../schemas/documentosLaborales.schema');

const MIME_DOC = 'application/msword';

// Catálogo del kit / documentos emitibles (para el modal). Solo auth: no expone datos de personas.
router.get('/catalogo', auth, (req, res) => {
    res.json({ data: service.catalogo() });
});

// Documentos generados de un trabajador (sin metadata).
router.get('/trabajador/:trabajadorId', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        res.json({ data: await service.listar(req.params.trabajadorId) });
    } catch (err) { next(err); }
});

// Emitir un documento suelto (amonestación o cualquiera del kit).
router.post('/emitir/:trabajadorId', auth, checkPermission('documentos.laborales.emitir'), validateBody(schema.emitir, { strip: true }), async (req, res, next) => {
    try {
        const { codigo, ...datos } = req.body;
        res.status(201).json({ data: await service.emitir(req.params.trabajadorId, codigo, datos, req.user.id, req) });
    } catch (err) { next(err); }
});

// Kit de ingreso: varios documentos de una vez.
router.post('/kit-ingreso/:trabajadorId', auth, checkPermission('documentos.laborales.emitir'), validateBody(schema.kitIngreso, { strip: true }), async (req, res, next) => {
    try {
        res.status(201).json({ data: await service.emitirKit(req.params.trabajadorId, req.body, req.user.id, req) });
    } catch (err) { next(err); }
});

// Descargar el archivo (Word editable). Marca estado=descargado (primera vez) + log.
router.get('/:id/download', auth, checkPermission('documentos.laborales.descargar'), async (req, res, next) => {
    try {
        const info = await service.abrir(req.params.id, req.user.id, req, { modo: 'download' });
        if (/\.doc$/i.test(info.fileName)) res.type(MIME_DOC);
        res.download(info.fullPath, info.fileName);
    } catch (err) { next(err); }
});

// HTML completo (sin BOM) para imprimir desde el navegador. Mismo gate y log (evento documento_impreso).
router.get('/:id/html', auth, checkPermission('documentos.laborales.descargar'), async (req, res, next) => {
    try {
        const { html, titulo, nombre_archivo } = await service.abrir(req.params.id, req.user.id, req, { modo: 'html' });
        res.json({ data: { html, titulo, nombre_archivo } });
    } catch (err) { next(err); }
});

module.exports = router;

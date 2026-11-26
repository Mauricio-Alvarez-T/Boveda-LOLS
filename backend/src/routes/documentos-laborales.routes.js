/**
 * /api/documentos-laborales — documentos generados por Bóveda (plan Gestiones B2, mig 110).
 *
 * Gates EXCLUSIVOS (sin patrón OR): emitir = documentos.laborales.emitir; descargar/imprimir =
 * documentos.laborales.descargar (implica ver la remuneración impresa en el contrato). Listar los
 * generados de un trabajador = documentos.ver (sin metadata). Eliminar uno = documentos.laborales.eliminar. El activityLogger global excluye este
 * prefijo: cada acción deja un log manual sin montos desde el service.
 *
 * Cartas de aviso de término (CARTA_AVISO, mig 160): emitir, descargar e imprimir piden SOLO su permiso propio
 * `documentos.cartas_aviso` (Marcos 2026-11-26: «que solo Matías pueda imprimir»). Las rutas dejan pasar con
 * cualquiera de los dos y cada documento se decide por su tipo (acá al emitir; en service.abrir al abrir).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const service = require('../services/documentosLaborales.service');
const docxExport = require('../services/docxExport.service');
const schema = require('../schemas/documentosLaborales.schema');
const { PERMISO_CARTAS_AVISO } = require('../plantillas/documentos');

const tiene = (req, clave) => (req.user?.p || []).includes(clave);

const MIME_DOC = 'application/msword';

// Eliminar un documento generado (borrado lógico). Permiso propio, no `documentos.eliminar`.
router.delete('/:id', auth, checkPermission('documentos.laborales.eliminar'), async (req, res, next) => {
    try {
        res.json({ data: await service.eliminar(req.params.id, req.user.id, req) });
    } catch (err) { next(err); }
});

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

// Emitir un documento suelto (amonestación, finiquito, carta de aviso o cualquiera del kit).
router.post('/emitir/:trabajadorId', auth, checkPermission('documentos.laborales.emitir', PERMISO_CARTAS_AVISO), validateBody(schema.emitir, { strip: true }), async (req, res, next) => {
    try {
        const { codigo, ...datos } = req.body;
        const permiso = codigo === 'CARTA_AVISO' ? PERMISO_CARTAS_AVISO : 'documentos.laborales.emitir';
        if (!tiene(req, permiso)) {
            return res.status(403).json({ error: codigo === 'CARTA_AVISO'
                ? 'Las cartas de aviso solo las emite quien tiene «Cartas de aviso de término».'
                : 'No tienes permisos para esta acción' });
        }
        res.status(201).json({ data: await service.emitir(req.params.trabajadorId, codigo, datos, req.user.id, req) });
    } catch (err) { next(err); }
});

// Kit de ingreso: varios documentos de una vez.
router.post('/kit-ingreso/:trabajadorId', auth, checkPermission('documentos.laborales.emitir'), validateBody(schema.kitIngreso, { strip: true }), async (req, res, next) => {
    try {
        res.status(201).json({ data: await service.emitirKit(req.params.trabajadorId, req.body, req.user.id, req) });
    } catch (err) { next(err); }
});

// Días de falta para la carta de aviso por no concurrencia (art. 160 N° 3): los 60 días antes de la baja.
router.get('/carta-aviso/inasistencias/:trabajadorId', auth, checkPermission(PERMISO_CARTAS_AVISO), async (req, res, next) => {
    try {
        res.json({ data: await service.inasistenciasParaCarta(req.params.trabajadorId) });
    } catch (err) { next(err); }
});

// Descargar el archivo (Word editable). Marca estado=descargado (primera vez) + log. Un Word generado sale
// como .docx real (se ve en el celular); lo demás, tal cual. La carta de aviso, solo con su permiso (service.abrir).
router.get('/:id/download', auth, checkPermission('documentos.laborales.descargar', PERMISO_CARTAS_AVISO), async (req, res, next) => {
    try {
        const info = await service.abrir(req.params.id, req.user.id, req, { modo: 'download' });
        await docxExport.enviarDescarga(res, {
            fullPath: info.fullPath, fileName: info.fileName, titulo: info.tipo_nombre,
            mimeOriginal: /\.doc$/i.test(info.fileName) ? MIME_DOC : null,
        });
    } catch (err) { next(err); }
});

// HTML completo (sin BOM) para imprimir desde el navegador. Mismo gate y log (evento documento_impreso).
router.get('/:id/html', auth, checkPermission('documentos.laborales.descargar', PERMISO_CARTAS_AVISO), async (req, res, next) => {
    try {
        const { html, titulo, nombre_archivo } = await service.abrir(req.params.id, req.user.id, req, { modo: 'html' });
        res.json({ data: { html, titulo, nombre_archivo } });
    } catch (err) { next(err); }
});

module.exports = router;

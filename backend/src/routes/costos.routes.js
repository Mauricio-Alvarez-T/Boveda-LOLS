const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const uploadCostos = require('../middleware/upload-costos');
const svc = require('../services/costos.service');
const caja = require('../services/costosCaja.service');
const cierre = require('../services/costosCierre.service');

/**
 * Costos de obra (mig 122, docs/reglas/costos.md). Todo pide `costos.gestionar`
 * (don Luis, Rodrigo y el arquitecto por usuario; el Super Administrador por rol).
 * Validación en el service: los gastos llegan por multipart (strings) con la foto.
 */
const gate = [auth, checkPermission('costos.gestionar')];
const id = (v) => Number(v);

router.get('/obras', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.listarObras() }); } catch (e) { next(e); }
});

// Antes de /obras/:obraId para que "disponibles" no se lea como un id.
router.get('/obras/disponibles', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.obrasDisponibles() }); } catch (e) { next(e); }
});

router.post('/obras', ...gate, async (req, res, next) => {
    try { res.status(201).json({ data: await svc.agregarObra(id(req.body?.obra_id), req.user.id) }); } catch (e) { next(e); }
});

router.delete('/obras/:obraId', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.quitarObra(id(req.params.obraId), req.user.id) }); } catch (e) { next(e); }
});

router.get('/obras/:obraId', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.detalleObra(id(req.params.obraId)) }); } catch (e) { next(e); }
});

router.put('/obras/:obraId/presupuesto', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.guardarPresupuesto(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.post('/obras/:obraId/partidas', ...gate, async (req, res, next) => {
    try { res.status(201).json({ data: await svc.crearPartida(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.post('/obras/:obraId/partidas/importar', ...gate, async (req, res, next) => {
    try { res.status(201).json({ data: await svc.importarPartidas(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.put('/partidas/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.editarPartida(id(req.params.id), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.delete('/partidas/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.borrarPartida(id(req.params.id), req.user.id) }); } catch (e) { next(e); }
});

router.post('/obras/:obraId/gastos', ...gate, uploadCostos.single('foto'), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.crearGasto(id(req.params.obraId), req.body || {}, req.file, req.user.id) }); } catch (e) { next(e); }
});

router.put('/gastos/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.editarGasto(id(req.params.id), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.post('/gastos/:id/foto', ...gate, uploadCostos.single('foto'), async (req, res, next) => {
    try { res.json({ data: await svc.reemplazarFoto(id(req.params.id), req.file, req.user.id) }); } catch (e) { next(e); }
});

// Descarga autenticada: es un documento con montos, nunca un estático público.
router.get('/gastos/:id/foto', ...gate, async (req, res, next) => {
    try {
        const { fullPath, fileName } = await svc.getFoto(id(req.params.id));
        res.download(fullPath, fileName);
    } catch (e) { next(e); }
});

router.delete('/gastos/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.borrarGasto(id(req.params.id), req.user.id) }); } catch (e) { next(e); }
});

// ── Cobros al mandante y flujo de caja (mig 123) ──
router.post('/obras/:obraId/cobros', ...gate, async (req, res, next) => {
    try { res.status(201).json({ data: await caja.crearCobro(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.put('/cobros/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await caja.editarCobro(id(req.params.id), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.delete('/cobros/:id', ...gate, async (req, res, next) => {
    try { res.json({ data: await caja.borrarCobro(id(req.params.id), req.user.id) }); } catch (e) { next(e); }
});

router.get('/flujo', ...gate, async (req, res, next) => {
    try {
        const obraId = req.query.obra_id ? id(req.query.obra_id) : null;
        res.json({ data: await caja.flujoCaja({ semanas: req.query.semanas, obraId }) });
    } catch (e) { next(e); }
});

// ── Cierre de obra y comparación (mig 123) ──
router.post('/obras/:obraId/cerrar', ...gate, async (req, res, next) => {
    try { res.json({ data: await cierre.cerrarObra(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.post('/obras/:obraId/reabrir', ...gate, async (req, res, next) => {
    try { res.json({ data: await cierre.reabrirObra(id(req.params.obraId), req.body || {}, req.user.id) }); } catch (e) { next(e); }
});

router.get('/comparacion', ...gate, async (req, res, next) => {
    try { res.json({ data: await cierre.comparacion() }); } catch (e) { next(e); }
});

router.get('/obras/:obraId/historial', ...gate, async (req, res, next) => {
    try { res.json({ data: await svc.historialObra(id(req.params.obraId)) }); } catch (e) { next(e); }
});

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const schemas = require('../schemas/ideas.schema');
const svc = require('../services/ideas.service');

/**
 * Ideas para Bóveda (mig 120, docs/reglas/ideas.md).
 *  · Proponer, ver las propias y ver lo hecho: cualquier usuario logueado (sin permiso).
 *  · Bandeja y revisión: `ideas.revisar` (Marcos y Mauricio).
 * Las rutas fijas (/mias, /hechas, /pendientes/count) van ANTES de /:id.
 */

router.post('/', auth, validateBody(schemas.crear, { strip: true }), async (req, res, next) => {
    try { res.status(201).json({ data: await svc.crear(req.body, req.user, req) }); }
    catch (e) { next(e); }
});

router.get('/mias', auth, async (req, res, next) => {
    try { res.json({ data: await svc.misIdeas(req.user.id) }); }
    catch (e) { next(e); }
});

router.get('/mias/resumen', auth, async (req, res, next) => {
    try { res.json({ data: await svc.misIdeasResumen(req.user.id) }); }
    catch (e) { next(e); }
});

router.post('/mias/vistas', auth, async (req, res, next) => {
    try { res.json({ data: await svc.marcarVistas(req.user.id) }); }
    catch (e) { next(e); }
});

router.get('/hechas', auth, async (req, res, next) => {
    try { res.json({ data: await svc.hechasRecientes() }); }
    catch (e) { next(e); }
});

router.get('/pendientes/count', auth, checkPermission('ideas.revisar'), async (req, res, next) => {
    try { res.json({ data: await svc.pendientesCount() }); }
    catch (e) { next(e); }
});

router.get('/', auth, checkPermission('ideas.revisar'), async (req, res, next) => {
    try {
        const { estado, tipo } = req.query;
        const filtros = {
            estado: schemas.ESTADOS.includes(estado) ? estado : undefined,
            tipo: schemas.TIPOS.includes(tipo) ? tipo : undefined,
        };
        res.json({ data: await svc.bandeja(filtros) });
    } catch (e) { next(e); }
});

// Foto de la idea (mig 121): el autor o un revisor; la decisión la toma el service.
router.get('/:id/foto', auth, async (req, res, next) => {
    try {
        const { buf, mime } = await svc.getFoto(Number(req.params.id), req.user);
        res.set('Content-Type', mime);
        res.set('Cache-Control', 'private, max-age=86400');
        res.send(buf);
    } catch (e) { next(e); }
});

router.patch('/:id', auth, checkPermission('ideas.revisar'), validateBody(schemas.revisar, { strip: true }), async (req, res, next) => {
    try { res.json({ data: await svc.revisar(Number(req.params.id), req.body, req.user.id, req) }); }
    catch (e) { next(e); }
});

module.exports = router;

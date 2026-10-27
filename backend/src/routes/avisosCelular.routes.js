/**
 * /api/avisos-celular — avisos al celular (mig 143; service avisosCelular.service.js).
 * Prueba piloto (Marcos 2026-10-27): solo el Super Administrador (`soloSuperAdmin`: rol 1 en el token y en la BD,
 * nunca con un token de «ver como»). Cuando se abra a todos, basta con sacar `soloSuperAdmin` de las rutas de
 * suscribirse (cada persona maneja SUS celulares). Nada de esto entra al historial (logger.js lo excluye: el body trae
 * las claves de la suscripción).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const validateBody = require('../middleware/validateBody');
const svc = require('../services/avisosCelular.service');

router.use(auth, soloSuperAdmin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/** GET /api/avisos-celular/clave — la clave pública para que el navegador se suscriba. */
router.get('/clave', async (req, res, next) => {
    try {
        res.json({ data: { clave: await svc.clavePublica() } });
    } catch (e) { next(e); }
});

/** GET /api/avisos-celular/estado — cuántos celulares tiene activos esta persona. */
router.get('/estado', async (req, res, next) => {
    try {
        res.json({ data: await svc.estado(req.user) });
    } catch (e) { next(e); }
});

/** POST /api/avisos-celular/suscribir — { endpoint, keys: { p256dh, auth } } (PushSubscription.toJSON()). */
router.post('/suscribir', validateBody({ endpoint: { required: true, type: 'string', maxLength: 1000 } }), async (req, res, next) => {
    try {
        res.json({ data: await svc.suscribir(req.user, req.body, req) });
    } catch (e) { next(e); }
});

/** DELETE /api/avisos-celular/suscribir — { endpoint }: desactiva ese celular. */
router.delete('/suscribir', validateBody({ endpoint: { required: true, type: 'string', maxLength: 1000 } }), async (req, res, next) => {
    try {
        res.json({ data: await svc.desuscribir(req.user, req.body.endpoint) });
    } catch (e) { next(e); }
});

/** POST /api/avisos-celular/probar — «Mandarme un aviso de prueba». */
router.post('/probar', async (req, res, next) => {
    try {
        res.json({ data: await svc.probar(req.user) });
    } catch (e) { next(e); }
});

module.exports = router;

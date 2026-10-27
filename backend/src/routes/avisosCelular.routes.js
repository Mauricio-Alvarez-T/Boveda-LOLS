/**
 * /api/avisos-celular — avisos al celular (mig 143/144; services avisosCelular y avisosPendientes).
 *  · Activar, desactivar, el estado y el aviso de prueba: cualquier persona con sesión, siempre sobre SUS celulares
 *    (desde el 27-10-2026, cuando empezaron los recordatorios de pendientes). Un token de «ver como» no se suscribe:
 *    `auth` frena todo lo que no es GET.
 *  · Quién tiene los avisos activos (`/resumen`): solo el Super Administrador (`soloSuperAdmin`).
 * Nada de esto entra al historial (logger.js lo excluye: el body trae las claves de la suscripción).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const validateBody = require('../middleware/validateBody');
const db = require('../config/db');
const svc = require('../services/avisosCelular.service');
const pendientes = require('../services/avisosPendientes.service');

router.use(auth, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/** GET /api/avisos-celular/clave — la clave pública para que el navegador se suscriba. */
router.get('/clave', async (req, res, next) => {
    try {
        res.json({ data: { clave: await svc.clavePublica() } });
    } catch (e) { next(e); }
});

/**
 * GET /api/avisos-celular/estado — mis celulares activos y si me toca tenerlos activos (`debe_activar`: estoy en el
 * horario de recordatorios). Con «ver como», `debe_activar` es false (no se le pide nada a quien mira).
 */
router.get('/estado', async (req, res, next) => {
    try {
        const r = await svc.estado(req.user);
        const mirando = req.user?.imp !== undefined && req.user?.imp !== null;
        res.json({ data: { ...r, debe_activar: !mirando && pendientes.estaEnHorario(req.user?.email) } });
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

/**
 * GET /api/avisos-celular/resumen — (Super Administrador) las personas del horario de recordatorios: si tienen los
 * avisos activos en algún celular y qué se les mandó hoy.
 */
router.get('/resumen', soloSuperAdmin, async (req, res, next) => {
    try {
        const correos = pendientes.HORARIO.map(h => h.email);
        const [filas] = await db.query(
            `SELECT u.id, u.nombre, u.email,
                    (SELECT COUNT(*) FROM avisos_celular_suscripciones s WHERE s.usuario_id = u.id) AS celulares,
                    (SELECT GROUP_CONCAT(CONCAT(e.hora, ':00 ', COALESCE(e.resumen, '')) ORDER BY e.hora SEPARATOR ' | ')
                       FROM avisos_celular_envios e WHERE e.usuario_id = u.id AND e.fecha = CURDATE()) AS hoy
               FROM usuarios u WHERE u.email IN (?) AND u.activo = 1 ORDER BY u.nombre`,
            [correos]
        );
        const horas = Object.fromEntries(pendientes.HORARIO.map(h => [h.email, h.horas]));
        res.json({
            data: filas.map(f => ({
                id: Number(f.id), nombre: f.nombre, celulares: Number(f.celulares) || 0,
                horas: horas[String(f.email).toLowerCase()] || [], hoy: f.hoy || null,
            })),
        });
    } catch (e) { next(e); }
});

module.exports = router;

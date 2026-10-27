/**
 * /api/avisos-celular — avisos al celular (mig 143/144; services avisosCelular y avisosPendientes).
 *  · Activar, desactivar, el estado y el aviso de prueba: cualquier persona con sesión, siempre sobre SUS celulares
 *    (desde el 27-10-2026, cuando empezaron los recordatorios de pendientes). Un token de «ver como» no se suscribe:
 *    `auth` frena todo lo que no es GET.
 *  · Quién tiene los avisos activos (`/resumen`) y el centro de avisos (`/mensajes`, mig 145): solo el Super
 *    Administrador (`soloSuperAdmin`).
 *  · El acuse (`/acuse`): SIN sesión, lo manda el propio equipo (public/sw-avisos.js) cuando el aviso aparece, se
 *    abre o se desliza; solo vale con la clave de un solo uso que viajó dentro de ese aviso.
 * Nada de esto entra al historial (logger.js lo excluye: el body trae las claves de la suscripción).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const validateBody = require('../middleware/validateBody');
const db = require('../config/db');
const svc = require('../services/avisosCelular.service');
const pendientes = require('../services/avisosPendientes.service');

/**
 * POST /api/avisos-celular/acuse — { id, t, evento: 'mostrado' | 'abierto' | 'descartado' | 'en_pantalla' }.
 * Va ANTES de `auth`: el archivo de avisos del navegador no tiene la sesión. Responde 204 siempre (no da pistas).
 */
router.post('/acuse', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try { await svc.acuse(req.body || {}); } catch { /* el acuse nunca molesta a nadie */ }
    res.status(204).end();
});

router.use(auth, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/** GET /api/avisos-celular/clave — la clave pública para que el navegador se suscriba. */
router.get('/clave', async (req, res, next) => {
    try {
        res.json({ data: { clave: await svc.clavePublica() } });
    } catch (e) { next(e); }
});

/**
 * GET /api/avisos-celular/estado — mis equipos activos (`por_equipo`: celulares y computadores) y si me toca tenerlos
 * activos (`debe_activar`: estoy en el horario de recordatorios; `debe_activar_computador`: también en el computador).
 * Con «ver como», los dos son false (no se le pide nada a quien mira).
 */
router.get('/estado', async (req, res, next) => {
    try {
        const r = await svc.estado(req.user);
        const mirando = req.user?.imp !== undefined && req.user?.imp !== null;
        res.json({
            data: {
                ...r,
                debe_activar: !mirando && pendientes.estaEnHorario(req.user?.email),
                debe_activar_computador: !mirando && pendientes.debeActivarComputador(req.user?.email),
            },
        });
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
                    (SELECT GROUP_CONCAT(COALESCE(s.dispositivo, '') SEPARATOR ' ¦ ') FROM avisos_celular_suscripciones s WHERE s.usuario_id = u.id) AS equipos,
                    (SELECT GROUP_CONCAT(CONCAT(e.hora, ':00 ', COALESCE(e.resumen, '')) ORDER BY e.hora SEPARATOR ' | ')
                       FROM avisos_celular_envios e WHERE e.usuario_id = u.id AND e.fecha = CURDATE()) AS hoy
               FROM usuarios u WHERE u.email IN (?) AND u.activo = 1 ORDER BY u.nombre`,
            [correos]
        );
        const horario = Object.fromEntries(pendientes.HORARIO.map(h => [h.email, h]));
        res.json({
            data: filas.map(f => {
                const equipos = f.equipos == null ? [] : String(f.equipos).split(' ¦ ').map(svc.equipoDe);
                const h = horario[String(f.email).toLowerCase()] || {};
                return {
                    id: Number(f.id), nombre: f.nombre,
                    celulares: equipos.filter(e => e === 'celular').length,
                    computadores: equipos.filter(e => e === 'computador').length,
                    usa_computador: !!h.computador,
                    horas: h.horas || [], hoy: f.hoy || null,
                };
            }),
        });
    } catch (e) { next(e); }
});

/**
 * GET /api/avisos-celular/mensajes?dias=7&usuario=ID — (Super Administrador) centro de avisos: cada aviso mandado,
 * a qué equipo y qué pasó (le llegó, lo abrió, lo deslizó, no se mostró porque estaba en Bóveda, falló).
 */
router.get('/mensajes', soloSuperAdmin, async (req, res, next) => {
    try {
        res.json({ data: await svc.mensajes({ dias: req.query.dias, usuarioId: req.query.usuario }) });
    } catch (e) { next(e); }
});

module.exports = router;

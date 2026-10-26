/**
 * /api/soporte — «Soporte · usuarios» (solo Super Administrador = rol 1; ver soporte.service y
 * docs/reglas/seguridad-rbac.md § Ver como usuario). Todas las rutas pasan por `auth` + `soloSuperAdmin`
 * (rol 1 en el token y en la BD, nunca con un token de «ver como»), MENOS la de pasar a modo cambios, que es lo
 * contrario: SOLO acepta un token de «ver como» en solo lectura (`verComoLectura`). Va antes del `router.use`.
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const soloVerComoLectura = require('../middleware/verComoLectura');
const soporteService = require('../services/soporte.service');

// La ficha y el token no se guardan en ninguna caché (el token es una credencial).
const sinCache = (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };

/**
 * POST /api/soporte/ver-como/escritura — desde «ver como» en solo lectura, el token del modo cambios (misma persona,
 * `rw`, vence a la misma hora). middleware/auth lo deja pasar con el token `ro` (POST_CAMBIO_DE_MODO); la guarda
 * exige ese token y re-verifica al Super Administrador en la BD; el service re-verifica a la persona.
 * Volver a solo lectura no tiene endpoint: el frontend vuelve a usar el token de solo lectura que guardó.
 */
router.post('/ver-como/escritura', auth, soloVerComoLectura, sinCache, async (req, res, next) => {
    try {
        res.json({ data: await soporteService.activarCambios(req.superAdmin, req.user, req) });
    } catch (err) { next(err); }
});

router.use(auth, soloSuperAdmin);
router.use(sinCache);

/** GET /api/soporte/usuarios — usuarios activos (nombre, correo, rol, obra, bodega). */
router.get('/usuarios', async (req, res, next) => {
    try {
        res.json({ data: await soporteService.listarUsuarios() });
    } catch (err) { next(err); }
});

/** GET /api/soporte/usuarios/:id — ficha: permisos efectivos con su origen, obra y sesión. */
router.get('/usuarios/:id', async (req, res, next) => {
    try {
        res.json({ data: await soporteService.ficha(req.params.id) });
    } catch (err) { next(err); }
});

/** POST /api/soporte/usuarios/:id/ver-como — token de 30 min, solo lectura, PARA ese usuario. */
router.post('/usuarios/:id/ver-como', async (req, res, next) => {
    try {
        res.json({ data: await soporteService.emitirVerComo(req.superAdmin, req.params.id, req) });
    } catch (err) { next(err); }
});

module.exports = router;

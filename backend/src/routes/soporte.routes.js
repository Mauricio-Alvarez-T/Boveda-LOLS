/**
 * /api/soporte — «Soporte · usuarios» (solo Super Administrador = rol 1; ver soporte.service y
 * docs/reglas/seguridad-rbac.md § Ver como usuario). Todas las rutas pasan por `auth` + `soloSuperAdmin`
 * (rol 1 en el token y en la BD, nunca con un token de «ver como»).
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const soloSuperAdmin = require('../middleware/superAdmin');
const soporteService = require('../services/soporte.service');

router.use(auth, soloSuperAdmin);

// La ficha, el panorama y el token no se guardan en ninguna caché (el token es una credencial).
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

/** GET /api/soporte/usuarios — usuarios activos (nombre, correo, rol, obra, bodega). */
router.get('/usuarios', async (req, res, next) => {
    try {
        res.json({ data: await soporteService.listarUsuarios() });
    } catch (err) { next(err); }
});

/**
 * GET /api/soporte/panorama — los mismos usuarios activos, cada uno con sus permisos efectivos (`efectivos`), para la
 * tabla «Panorama» (qué secciones del menú ve cada uno). En lote: un número fijo de consultas.
 */
router.get('/panorama', async (req, res, next) => {
    try {
        res.json({ data: await soporteService.panorama() });
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

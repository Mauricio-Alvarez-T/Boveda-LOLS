/**
 * /api/analisis-trabajadores — Gestiones → «Análisis» (mig 163, reglas rrhh-trabajadores.md § Análisis).
 *
 * Todas exigen `trabajadores.analisis.ver`. Solo lectura. Query común: empresa_id, obra_id, cargo_id,
 * categoria, desde/hasta ('YYYY-MM').
 *   GET /dotacion     activos hoy + serie mensual + reparto
 *   GET /rotacion     ingresos, salidas, tasa, causales, permanencia
 *   GET /asistencia   ausentismo, estados, rankings; horas extra solo con asistencia.horas_extra.ver
 *   GET /perfil       conteos agregados (nunca nombres ni RUT), fichas incompletas, documentos, solicitudes
 *   GET /costos       además cargos.sueldo.ver: costo mensual ESTIMADO por sueldo del cargo
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const service = require('../services/analisisTrabajadores.service');

const VER = 'trabajadores.analisis.ver';
const tiene = (req, clave) => Array.isArray(req.user?.p) && req.user.p.includes(clave);

router.use(auth, checkPermission(VER));

const responder = (fn) => async (req, res, next) => {
    try {
        res.json({ data: await fn(req) });
    } catch (err) { next(err); }
};

router.get('/dotacion', responder(req => service.dotacion(req.query)));
router.get('/rotacion', responder(req => service.rotacion(req.query)));
router.get('/asistencia', responder(req => service.asistencia(req.query, {
    verHorasExtra: tiene(req, 'asistencia.horas_extra.ver'),
})));
router.get('/perfil', responder(req => service.perfil(req.query)));
// Montos: además el permiso de sueldos (gate exclusivo, igual que /api/cargo-sueldos).
router.get('/costos', checkPermission('cargos.sueldo.ver'), responder(req => service.costos(req.query)));

module.exports = router;

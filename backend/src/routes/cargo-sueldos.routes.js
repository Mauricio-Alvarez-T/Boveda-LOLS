/**
 * /api/cargo-sueldos — parámetros de sueldo por cargo (plan Gestiones B3, mig 111).
 *
 * Gates EXCLUSIVOS (sin patrón OR con cargos.*): los montos son dato $.
 *   GET  /                        cargos.sueldo.ver     todos los cargos activos con su sueldo (o null)
 *   GET  /:cargoId/historial      cargos.sueldo.ver     últimos cambios de montos del cargo
 *   GET  /:cargoId                cargos.sueldo.ver     sueldo vigente del cargo (null si no está configurado)
 *   PUT  /:cargoId                cargos.sueldo.editar  crea/actualiza (validateBody strip; transacción en el service)
 *
 * Las rutas de 2 segmentos van ANTES de /:cargoId. El logger global excluye este módulo
 * (montos); el service registra un log manual sin cifras. Montado con safeRoute en index.js.
 */
const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const service = require('../services/cargoSueldo.service');
const { upsert } = require('../schemas/cargoSueldos.schema');

const VER = 'cargos.sueldo.ver';
const EDITAR = 'cargos.sueldo.editar';

router.get('/', auth, checkPermission(VER), async (req, res, next) => {
    try {
        res.json({ data: await service.listar() });
    } catch (err) { next(err); }
});

router.get('/:cargoId/historial', auth, checkPermission(VER), async (req, res, next) => {
    try {
        res.json({ data: await service.historial(Number(req.params.cargoId)) });
    } catch (err) { next(err); }
});

router.get('/:cargoId', auth, checkPermission(VER), async (req, res, next) => {
    try {
        res.json({ data: await service.getPorCargo(Number(req.params.cargoId)) });
    } catch (err) { next(err); }
});

router.put('/:cargoId', auth, checkPermission(EDITAR), validateBody(upsert, { strip: true }), async (req, res, next) => {
    try {
        const data = await service.upsert(req.params.cargoId, req.body, req.user.id, req);
        res.json({ data });
    } catch (err) { next(err); }
});

module.exports = router;

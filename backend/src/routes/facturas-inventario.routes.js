const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const facturaService = require('../services/factura-inventario.service');

router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getById(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await facturaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

router.put('/:id/anular', auth, checkPermission('inventario.eliminar'), async (req, res, next) => {
    try {
        const result = await facturaService.anular(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

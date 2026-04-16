const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const discrepanciaService = require('../services/discrepancia.service');

router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await discrepanciaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await discrepanciaService.reportar(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

router.put('/:id/resolver', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await discrepanciaService.resolver(req.params.id, req.user.id, req.body);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

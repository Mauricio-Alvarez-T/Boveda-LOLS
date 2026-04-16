const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const bombaService = require('../services/bomba-hormigon.service');

router.get('/', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await bombaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/resumen/:obraId', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const { mes, anio } = req.query;
        const now = new Date();
        const result = await bombaService.getResumenPorObra(
            req.params.obraId,
            mes ? parseInt(mes) : now.getMonth() + 1,
            anio ? parseInt(anio) : now.getFullYear()
        );
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.crear'), async (req, res, next) => {
    try {
        const result = await bombaService.registrar(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

router.put('/:id', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const result = await bombaService.update(req.params.id, req.body);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.delete('/:id', auth, checkPermission('inventario.eliminar'), async (req, res, next) => {
    try {
        const result = await bombaService.remove(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

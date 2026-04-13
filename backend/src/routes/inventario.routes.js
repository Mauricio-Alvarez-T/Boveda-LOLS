const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const inventarioService = require('../services/inventario.service');

// GET /api/inventario/resumen
router.get('/resumen', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const { obra_id } = req.query;
        const result = await inventarioService.getResumen(obra_id || null);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/inventario/stock/obra/:obraId
router.get('/stock/obra/:obraId', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await inventarioService.getStockPorObra(req.params.obraId);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// GET /api/inventario/stock/bodega/:bodegaId
router.get('/stock/bodega/:bodegaId', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const result = await inventarioService.getStockPorBodega(req.params.bodegaId);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/inventario/stock — actualizar stock inline
router.put('/stock', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const { item_id, obra_id, bodega_id, cantidad, valor_arriendo_override } = req.body;
        if (!item_id) return res.status(400).json({ error: 'item_id requerido' });
        const result = await inventarioService.actualizarStock(
            item_id, obra_id || null, bodega_id || null,
            { cantidad, valorArriendoOverride: valor_arriendo_override }
        );
        res.json({ data: result });
    } catch (err) { next(err); }
});

// PUT /api/inventario/descuento/obra/:obraId
router.put('/descuento/obra/:obraId', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const { porcentaje } = req.body;
        if (porcentaje === undefined) return res.status(400).json({ error: 'porcentaje requerido' });
        const result = await inventarioService.actualizarDescuento(req.params.obraId, porcentaje);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

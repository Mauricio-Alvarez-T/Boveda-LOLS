const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const facturaService = require('../services/factura-inventario.service');

// Permisos financieros — facturas contienen montos y precios unitarios, por
// lo que requieren `inventario.facturas.ver` para listar/leer y
// `inventario.facturas.gestionar` para crear/anular. Sustituye los chequeos
// genéricos `inventario.ver / .crear / .eliminar` que se usaban antes.

router.get('/', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getById(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.facturas.gestionar'), async (req, res, next) => {
    try {
        const result = await facturaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

router.put('/:id/anular', auth, checkPermission('inventario.facturas.gestionar'), async (req, res, next) => {
    try {
        const result = await facturaService.anular(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

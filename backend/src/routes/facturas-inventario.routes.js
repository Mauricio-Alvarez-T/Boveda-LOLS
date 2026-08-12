const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const facturaService = require('../services/factura-inventario.service');

// Permisos financieros — facturas contienen montos y precios unitarios, por
// lo que requieren `inventario.facturas.ver` para listar/leer y
// `inventario.facturas.gestionar` para crear/editar/anular. Sustituye los
// chequeos genéricos `inventario.ver / .crear / .eliminar` que se usaban antes.

// Schema compartido POST (crear) / PUT (editar). strip:true evita
// mass-assignment de `activo` / `registrado_por`. La XOR obra/bodega por ítem
// la valida normalizeUbicacion en el service (400).
const FACTURA_SCHEMA = {
    numero_factura: { required: true, type: 'string', minLength: 1, maxLength: 50 },
    proveedor: { required: true, type: 'string', minLength: 1, maxLength: 255 },
    fecha_factura: { required: true, type: 'string', format: 'date' },
    monto_neto: { required: true, type: 'number', min: 0 },
    observaciones: { type: 'string', maxLength: 5000 },
    items: {
        required: true, type: 'array', minLength: 1,
        itemRules: {
            item_id: { required: true, type: 'integer', min: 1 },
            obra_id: { type: 'integer', min: 1 },
            bodega_id: { type: 'integer', min: 1 },
            cantidad: { required: true, type: 'number', min: 0.0001 },
            precio_unitario: { required: true, type: 'number', min: 0 },
        },
    },
};

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

// Historial de modificaciones de la factura (logs_actividad, accion UPDATE).
// Gate `ver`: quien puede ver la factura puede ver qué se le cambió.
router.get('/:id/historial', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getHistorial(req.params.id);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.facturas.gestionar'), validateBody(FACTURA_SCHEMA, { strip: true }), async (req, res, next) => {
    try {
        const result = await facturaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// Edición post-ingreso (cabecera + ítems, con ajuste de stock). El historial
// del cambio se registra desde el service (logManualActivity).
router.put('/:id', auth, checkPermission('inventario.facturas.gestionar'), validateBody(FACTURA_SCHEMA, { strip: true }), async (req, res, next) => {
    try {
        const result = await facturaService.editar(req.params.id, req.body, req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.put('/:id/anular', auth, checkPermission('inventario.facturas.gestionar'), async (req, res, next) => {
    try {
        const result = await facturaService.anular(req.params.id, req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

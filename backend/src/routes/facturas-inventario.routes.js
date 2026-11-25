const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const { uploadFactura, uploadLectura } = require('../middleware/upload-facturas');
const facturaService = require('../services/factura-inventario.service');
const lecturaFactura = require('../services/lecturaFactura.service');

// Permisos financieros — facturas contienen montos y precios unitarios, por
// lo que requieren `inventario.facturas.ver` para listar/leer y
// `inventario.facturas.gestionar` para crear/editar/anular. Sustituye los
// chequeos genéricos `inventario.ver / .crear / .eliminar` que se usaban antes.
//
// Desde la mig 157 una factura es el REGISTRO de lo comprado: no mueve stock ni
// costo, y puede guardarse como borrador («Continuar después»).

const ITEM_RULES = {
    item_id: { type: 'integer', min: 1 },
    cantidad: { required: true, type: 'number', min: 0.0001 },
    precio_unitario: { required: true, type: 'number', min: 0 },
    descripcion_factura: { type: 'string', maxLength: 255 },
    medidas: { type: 'string', maxLength: 60 },   // mig 158
};

// Registrada: completa (el service además exige item_id en cada línea).
// strip:true evita mass-assignment de `activo` / `registrado_por`.
const FACTURA_SCHEMA = {
    estado: { type: 'string', pattern: /^(borrador|registrada)$/ },
    numero_factura: { required: true, type: 'string', minLength: 1, maxLength: 50 },
    proveedor: { required: true, type: 'string', minLength: 1, maxLength: 255 },
    fecha_factura: { required: true, type: 'string', format: 'date' },
    monto_neto: { required: true, type: 'number', min: 0 },
    observaciones: { type: 'string', maxLength: 5000 },
    items: { required: true, type: 'array', minLength: 1, itemRules: ITEM_RULES },
};

// Borrador: todo opcional — se guarda lo que haya.
const BORRADOR_SCHEMA = {
    estado: { required: true, type: 'string', pattern: /^borrador$/ },
    numero_factura: { type: 'string', maxLength: 50 },
    proveedor: { type: 'string', maxLength: 255 },
    fecha_factura: { type: 'string', format: 'date' },
    monto_neto: { type: 'number', min: 0 },
    observaciones: { type: 'string', maxLength: 5000 },
    items: { type: 'array', itemRules: ITEM_RULES },
};

const validarFactura = (req, res, next) =>
    validateBody(req.body?.estado === 'borrador' ? BORRADOR_SCHEMA : FACTURA_SCHEMA, { strip: true })(req, res, next);

const idValido = (v) => {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1) { const e = new Error('ID inválido'); e.statusCode = 400; throw e; }
    return n;
};

router.get('/', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getAll(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// ¿Está activa la lectura con IA? (sin clave en el .env, el botón no aparece).
// Antes de '/:id' para que «config» no se tome como id.
router.get('/config', auth, checkPermission('inventario.facturas.ver'), (req, res) => {
    res.json({ data: { lectura_ia: lecturaFactura.disponible() } });
});

// ── Marcas de color y export (mig 158). Rutas de un segmento ANTES de '/:id'. ──

// Paleta con el nombre de cada color (para filtros, marcas y la leyenda del Excel).
router.get('/colores', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try { res.json({ data: await facturaService.getColores() }); } catch (err) { next(err); }
});

router.put('/colores/:color', auth, checkPermission('inventario.facturas.gestionar'),
    validateBody({ nombre: { type: 'string', maxLength: 60 } }, { strip: true }), async (req, res, next) => {
        try { res.json({ data: await facturaService.setNombreColor(req.params.color, req.body.nombre, req.user.id) }); } catch (err) { next(err); }
    });

// Una fila por línea de las facturas REGISTRADAS que pasan los filtros: el front arma el Excel «COMPRAS».
router.get('/export-lineas', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try { res.json({ data: await facturaService.exportLineas(req.query) }); } catch (err) { next(err); }
});

// «Leer factura»: la foto/PDF viaja en memoria, se lee con IA y NO se guarda.
router.post('/leer', auth, checkPermission('inventario.facturas.gestionar'), uploadLectura.single('archivo'), async (req, res, next) => {
    try {
        const result = await lecturaFactura.leer(req.file);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.get('/:id', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getById(idValido(req.params.id));
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Historial de modificaciones de la factura (logs_actividad, accion UPDATE).
// Gate `ver`: quien puede ver la factura puede ver qué se le cambió.
router.get('/:id/historial', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const result = await facturaService.getHistorial(idValido(req.params.id));
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Foto/PDF de la factura. Descarga autenticada: documento con montos, nunca estático.
// POST ?alta=1: la foto sube junto con el alta (no deja historial de «modificación»).
router.get('/:id/archivo', auth, checkPermission('inventario.facturas.ver'), async (req, res, next) => {
    try {
        const { fullPath, fileName } = await facturaService.getArchivo(idValido(req.params.id));
        res.download(fullPath, fileName);
    } catch (err) { next(err); }
});

router.post('/:id/archivo', auth, checkPermission('inventario.facturas.gestionar'), uploadFactura.single('archivo'), async (req, res, next) => {
    try {
        const result = await facturaService.setArchivo(idValido(req.params.id), req.file, req.user.id, req, { alta: req.query.alta === '1' });
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('inventario.facturas.gestionar'), validarFactura, async (req, res, next) => {
    try {
        const result = await facturaService.crear(req.body, req.user.id);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// Edición (borrador o registrada) y paso borrador → registrada. El historial
// del cambio se registra desde el service (logManualActivity).
router.put('/:id', auth, checkPermission('inventario.facturas.gestionar'), validarFactura, async (req, res, next) => {
    try {
        const result = await facturaService.editar(idValido(req.params.id), req.body, req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Marca de color compartida; `color: null` la quita. No cuenta como modificación (ver service).
router.put('/:id/marca', auth, checkPermission('inventario.facturas.gestionar'),
    validateBody({ color: { type: 'string', in: facturaService._interno.COLORES } }, { strip: true }), async (req, res, next) => {
        try {
            const color = req.body.color === undefined ? null : req.body.color;
            res.json({ data: await facturaService.marcar(idValido(req.params.id), color, req.user.id, req) });
        } catch (err) { next(err); }
    });

router.put('/:id/anular', auth, checkPermission('inventario.facturas.gestionar'), async (req, res, next) => {
    try {
        const result = await facturaService.anular(idValido(req.params.id), req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;

const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const validateBody = require('../middleware/validateBody');
const cacheControl = require('../middleware/cacheControl');
const inventarioService = require('../services/inventario.service');
const itemInventarioBulkService = require('../services/itemInventarioBulk.service');
const stockBulkService = require('../services/stockBulk.service');
const uploadInventario = require('../middleware/upload-inventario');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');
// Sanitización de campos $ — omite valor_compra/valor_arriendo/etc cuando
// el usuario no tiene los permisos financieros. Política deny-by-default
// (ver backend/src/utils/sanitizeFinancialFields.js).
const {
    sanitizeItemsCosto,
    sanitizeResumenInventario,
    sanitizeStockUbicacionData,
    guardEditCostos,
} = require('../utils/sanitizeFinancialFields');

// GET /api/inventario/dashboard-ejecutivo — Resumen ejecutivo para el dueño (1 request, KPIs + top obras + alertas)
// cacheControl(60): 10+ queries paralelas → ETag de 60s reduce carga DB en navegaciones repetidas.
router.get('/dashboard-ejecutivo', auth, checkPermission('inventario.ver'), cacheControl(60), async (req, res, next) => {
    try {
        const obraId = req.query.obra_id ? Number(req.query.obra_id) : null;
        const topRaw = req.query.top_obras_limit ? Number(req.query.top_obras_limit) : null;
        const topObrasLimit = Number.isFinite(topRaw) && topRaw > 0 ? topRaw : undefined;
        const result = await inventarioService.getDashboardEjecutivo(
            Number.isFinite(obraId) && obraId > 0 ? obraId : null,
            { topObrasLimit }
        );
        res.json({ data: sanitizeResumenInventario(result, req.user?.p) });
    } catch (err) { next(err); }
});

// GET /api/inventario/resumen
// cacheControl(30): 5 queries paralelas → ETag 30s. Mutaciones via PUT /stock invalidan implícitamente (refetch sin If-None-Match).
router.get('/resumen', auth, checkPermission('inventario.ver'), cacheControl(30), async (req, res, next) => {
    try {
        const { obra_id } = req.query;
        const result = await inventarioService.getResumen(obra_id || null);
        res.json({ data: sanitizeResumenInventario(result, req.user?.p) });
    } catch (err) { next(err); }
});

// GET /api/inventario/stock/obra/:obraId
router.get('/stock/obra/:obraId', auth, checkPermission('inventario.ver'), cacheControl(30), async (req, res, next) => {
    try {
        const result = await inventarioService.getStockPorObra(req.params.obraId);
        // Estructura anidada {obra, categorias: [{items: [...]}], totales} → usar
        // sanitizer especializado (sanitizeItemsCosto sólo soporta array plano).
        res.json({ data: sanitizeStockUbicacionData(result, req.user?.p) });
    } catch (err) { next(err); }
});

// GET /api/inventario/stock/bodega/:bodegaId
router.get('/stock/bodega/:bodegaId', auth, checkPermission('inventario.ver'), cacheControl(30), async (req, res, next) => {
    try {
        const result = await inventarioService.getStockPorBodega(req.params.bodegaId);
        res.json({ data: sanitizeStockUbicacionData(result, req.user?.p) });
    } catch (err) { next(err); }
});

// PUT /api/inventario/stock — actualizar stock inline
// Auditoría 4.4: validación declarativa antes de entrar al handler.
router.put('/stock', auth, checkPermission('inventario.editar'), validateBody({
    item_id: { required: true, type: 'integer', min: 1 },
    obra_id: { type: 'integer', min: 1 },
    bodega_id: { type: 'integer', min: 1 },
    cantidad: { type: 'number', min: 0, max: 9999999 },
    valor_arriendo_override: { type: 'number', min: 0 },
}), async (req, res, next) => {
    try {
        // Gate financiero: si el body trae valor_arriendo_override y el usuario
        // no tiene `inventario.costos.editar` → 403. Mantiene posibilidad de
        // ajustar `cantidad` sin tocar campos $.
        const guard = guardEditCostos(req.body, req.user?.p);
        if (!guard.ok) return res.status(403).json({ error: guard.error });

        // XOR check (mig 050): obra_id y bodega_id son mutuamente excluyentes.
        // El service también valida (defensa en profundidad) pero devolver 400
        // acá ahorra una capa de stack.
        if ((!!req.body.obra_id) === (!!req.body.bodega_id)) {
            return res.status(400).json({
                error: 'obra_id y bodega_id son mutuamente excluyentes (exactamente uno requerido)'
            });
        }

        const { item_id, obra_id, bodega_id, cantidad, valor_arriendo_override } = req.body;
        const result = await inventarioService.actualizarStock(
            item_id, obra_id || null, bodega_id || null,
            { cantidad, valorArriendoOverride: valor_arriendo_override }
        );
        res.json({ data: result });
    } catch (err) {
        // Auditoría 3.2: errores de validación (statusCode 400) → 400 explícito al cliente.
        if (err && err.statusCode === 400) return res.status(400).json({ error: err.message });
        next(err);
    }
});

// PUT /api/inventario/descuento/obra/:obraId — gestiona porcentaje de
// descuento por obra. Requiere `inventario.descuentos.gestionar` (no basta
// con `inventario.editar`) porque el descuento afecta el cálculo de valores.
router.put('/descuento/obra/:obraId', auth, checkPermission('inventario.descuentos.gestionar'), async (req, res, next) => {
    try {
        const { porcentaje } = req.body;
        if (porcentaje === undefined) return res.status(400).json({ error: 'porcentaje requerido' });
        const result = await inventarioService.actualizarDescuento(req.params.obraId, porcentaje);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/inventario/stock-por-items — stock availability per item across all locations
router.post('/stock-por-items', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const { item_ids } = req.body;
        if (!item_ids || !Array.isArray(item_ids) || !item_ids.length) {
            return res.status(400).json({ error: 'item_ids requerido (array de IDs)' });
        }
        const result = await inventarioService.getStockPorItems(item_ids);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// POST /api/inventario/items/:itemId/imagen — upload item image
router.post('/items/:itemId/imagen', auth, checkPermission('inventario.editar'),
    uploadInventario.single('imagen'),
    async (req, res, next) => {
        try {
            if (!req.file) return res.status(400).json({ error: 'No se recibió imagen' });
            const { itemId } = req.params;

            // Delete old image if exists
            const [rows] = await db.query('SELECT imagen_url FROM items_inventario WHERE id = ?', [itemId]);
            if (rows.length === 0) return res.status(404).json({ error: 'Ítem no encontrado' });
            if (rows[0].imagen_url) {
                const oldPath = path.join(__dirname, '../../uploads/inventario', path.basename(rows[0].imagen_url));
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const imagenUrl = `/api/uploads/inventario/${req.file.filename}`;
            await db.query('UPDATE items_inventario SET imagen_url = ? WHERE id = ?', [imagenUrl, itemId]);
            res.json({ data: { imagen_url: imagenUrl } });
        } catch (err) { next(err); }
    }
);

// DELETE /api/inventario/items/:itemId/imagen — remove item image
router.delete('/items/:itemId/imagen', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const { itemId } = req.params;
        const [rows] = await db.query('SELECT imagen_url FROM items_inventario WHERE id = ?', [itemId]);
        if (rows.length === 0) return res.status(404).json({ error: 'Ítem no encontrado' });
        if (rows[0].imagen_url) {
            const oldPath = path.join(__dirname, '../../uploads/inventario', path.basename(rows[0].imagen_url));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        await db.query('UPDATE items_inventario SET imagen_url = NULL WHERE id = ?', [itemId]);
        res.json({ data: { success: true } });
    } catch (err) { next(err); }
});

// PUT /api/inventario/items/bulk — edición masiva de ítems (Ola 3)
// Body: { items: [{ id, ...campos editables }] }
// Respuestas:
//   200 { data: { updated, diff } }
//   413 si supera MAX_ITEMS
//   400 si payload inválido (validación pre-transacción)
router.put('/items/bulk', auth, checkPermission('inventario.editar'), validateBody({
    items: { required: true, type: 'array', minLength: 1 },
}), async (req, res, next) => {
    try {
        const items = req.body?.items;
        // Gate financiero: si ALGÚN item del bulk toca campos $ y el usuario
        // no tiene `inventario.costos.editar` → 403. Detiene la operación
        // completa para evitar updates parciales.
        const touchesCostos = Array.isArray(items) && items.some(
            it => it && (
                Object.prototype.hasOwnProperty.call(it, 'valor_compra') ||
                Object.prototype.hasOwnProperty.call(it, 'valor_arriendo')
            )
        );
        if (touchesCostos && !(req.user?.p || []).includes('inventario.costos.editar')) {
            return res.status(403).json({
                error: 'No autorizado para editar campos financieros (valor_compra / valor_arriendo) en bulk.',
            });
        }
        const result = await itemInventarioBulkService.bulkUpdate(items, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.status === 413) {
            return res.status(413).json({
                error: err.message,
                maxItems: itemInventarioBulkService.MAX_ITEMS,
            });
        }
        // Errores de validación sanitize() → 400 (no es bug de servidor)
        if (/inválid|vacía|sin campos|inexistent|más de una vez/i.test(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

// PUT /api/inventario/stock/bulk — ajuste masivo de stock (Ola 3)
// Body: { adjustments: [{ item_id, obra_id?|bodega_id?, cantidad?, valor_arriendo_override? }] }
// Respuestas:
//   200 { data: { updated, created, diff } }
//   413 si supera MAX_ITEMS
//   400 si payload inválido
router.put('/stock/bulk', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const adjustments = req.body?.adjustments;
        // Gate financiero: bloquea si ALGÚN adjustment trae valor_arriendo_override
        // sin permiso `inventario.costos.editar`. Mismo patrón que /items/bulk.
        const touchesCostos = Array.isArray(adjustments) && adjustments.some(
            a => a && Object.prototype.hasOwnProperty.call(a, 'valor_arriendo_override')
        );
        if (touchesCostos && !(req.user?.p || []).includes('inventario.costos.editar')) {
            return res.status(403).json({
                error: 'No autorizado para editar valor_arriendo_override en bulk.',
            });
        }
        const result = await stockBulkService.bulkAdjust(adjustments, req.user.id);
        res.json({ data: result });
    } catch (err) {
        if (err.status === 413) {
            return res.status(413).json({
                error: err.message,
                maxItems: stockBulkService.MAX_ITEMS,
            });
        }
        if (/inválid|sin campos|duplicado|requiere obra|no puede tener/i.test(err.message)) {
            return res.status(400).json({ error: err.message });
        }
        next(err);
    }
});

module.exports = router;

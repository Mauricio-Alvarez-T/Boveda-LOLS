const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const inventarioService = require('../services/inventario.service');
const itemInventarioBulkService = require('../services/itemInventarioBulk.service');
const stockBulkService = require('../services/stockBulk.service');
const uploadInventario = require('../middleware/upload-inventario');
const db = require('../config/db');
const fs = require('fs');
const path = require('path');

// GET /api/inventario/dashboard-ejecutivo — Resumen ejecutivo para el dueño (1 request, KPIs + top obras + alertas)
router.get('/dashboard-ejecutivo', auth, checkPermission('inventario.ver'), async (req, res, next) => {
    try {
        const obraId = req.query.obra_id ? Number(req.query.obra_id) : null;
        const topRaw = req.query.top_obras_limit ? Number(req.query.top_obras_limit) : null;
        const topObrasLimit = Number.isFinite(topRaw) && topRaw > 0 ? topRaw : undefined;
        const result = await inventarioService.getDashboardEjecutivo(
            Number.isFinite(obraId) && obraId > 0 ? obraId : null,
            { topObrasLimit }
        );
        res.json({ data: result });
    } catch (err) { next(err); }
});

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
    } catch (err) {
        // Auditoría 3.2: errores de validación (statusCode 400) → 400 explícito al cliente.
        if (err && err.statusCode === 400) return res.status(400).json({ error: err.message });
        next(err);
    }
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
router.put('/items/bulk', auth, checkPermission('inventario.editar'), async (req, res, next) => {
    try {
        const items = req.body?.items;
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

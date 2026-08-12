const db = require('../config/db');
const { normalizeUbicacion } = require('../utils/ubicacionStock');
const { normalizePagination } = require('../utils/pagination');
const { logManualActivity } = require('../middleware/logger');

// ── Helpers de diff para el historial de ediciones ──────────────────────────
// El pool NO usa dateStrings ni decimalNumbers: DATE llega como Date y DECIMAL
// como string ("152000.00"). Normalizar antes de comparar o el diff miente.

/** Date|string → 'YYYY-MM-DD' con componentes LOCALES (toISOString correría el día en UTC-4). */
const normFecha = (v) => {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
        const p = (n) => String(n).padStart(2, '0');
        return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    return String(v).slice(0, 10);
};

const normNum = (v) => (v == null || v === '' ? null : Number(v));

const fmtMonto = (v) => (v == null ? '—' : `$${Number(v).toLocaleString('es-CL')}`);

const CABECERA_CAMPOS = [
    { key: 'numero_factura', label: 'N° factura', norm: (v) => (v == null ? null : String(v)) },
    { key: 'proveedor', label: 'Proveedor', norm: (v) => (v == null ? null : String(v)) },
    { key: 'fecha_factura', label: 'Fecha factura', norm: normFecha },
    { key: 'monto_neto', label: 'Monto neto', norm: normNum, fmt: fmtMonto },
    { key: 'observaciones', label: 'Observaciones', norm: (v) => (v ? String(v) : null) },
];

/**
 * Diff cabecera + ítems → { cambios, resumen, items_detalle }.
 * `cambios` mantiene el shape {campo: {de, a}} que ya renderiza el Historial de
 * actividad; el detalle por ítem va en `items_detalle` (strings legibles).
 */
const computarDiffFactura = (antes, itemsAntes, data, itemsDespues) => {
    const cambios = {};
    const partes = [];

    for (const campo of CABECERA_CAMPOS) {
        const de = campo.norm(antes[campo.key]);
        const a = campo.norm(data[campo.key]);
        if (JSON.stringify(de) !== JSON.stringify(a)) {
            cambios[campo.key] = { de, a };
            const f = campo.fmt || ((v) => (v == null ? '—' : String(v)));
            partes.push(`${campo.label}: ${f(de)} → ${f(a)}`);
        }
    }

    // Ítems keyed por item_id (el form no permite duplicados; ante legacy con
    // duplicados el diff degrada a conteos, que sigue siendo honesto).
    const items_detalle = [];
    const byId = (arr) => {
        const m = new Map();
        for (const it of arr) {
            if (m.has(Number(it.item_id))) return null; // duplicado → degradar
            m.set(Number(it.item_id), it);
        }
        return m;
    };
    const mAntes = byId(itemsAntes);
    const mDespues = byId(itemsDespues);

    if (mAntes && mDespues) {
        for (const [id, prev] of mAntes) {
            const desc = prev.descripcion || `ítem ${id}`;
            const next = mDespues.get(id);
            if (!next) { items_detalle.push(`− ${desc} x${Number(prev.cantidad)}`); continue; }
            if (Number(prev.cantidad) !== Number(next.cantidad)) {
                items_detalle.push(`${desc}: x${Number(prev.cantidad)} → x${Number(next.cantidad)}`);
            }
            if (Number(prev.precio_unitario) !== Number(next.precio_unitario)) {
                items_detalle.push(`${desc}: ${fmtMonto(prev.precio_unitario)} → ${fmtMonto(next.precio_unitario)} c/u`);
            }
            // Comparación de destino local y null-safe (normalizeUbicacion tira 400
            // si ambos son null — posible en ítems legacy con FK en SET NULL).
            const ubicKey = (it) => {
                const o = it.obra_id != null ? Number(it.obra_id) : null;
                const b = o != null ? null : (it.bodega_id != null ? Number(it.bodega_id) : null);
                return `${o}|${b}`;
            };
            if (ubicKey(prev) !== ubicKey(next)) {
                items_detalle.push(`${desc}: cambio de destino`);
            }
        }
        for (const [id, next] of mDespues) {
            if (!mAntes.has(id)) items_detalle.push(`+ ${next.descripcion || `ítem ${id}`} x${Number(next.cantidad)}`);
        }
    }

    if (items_detalle.length || itemsAntes.length !== itemsDespues.length) {
        if (itemsAntes.length !== itemsDespues.length) {
            cambios.items = { de: `${itemsAntes.length} ítems`, a: `${itemsDespues.length} ítems` };
            partes.push(`Ítems: ${itemsAntes.length} → ${itemsDespues.length}`);
        } else if (items_detalle.length) {
            cambios.items = { de: `${itemsAntes.length} ítems`, a: `${itemsDespues.length} ítems (modificados)` };
            partes.push('Ítems modificados');
        }
    }

    const MAX_DETALLE = 8;
    const detalleCap = items_detalle.length > MAX_DETALLE
        ? [...items_detalle.slice(0, MAX_DETALLE), `…y ${items_detalle.length - MAX_DETALLE} más`]
        : items_detalle;

    return { cambios, resumen: partes.join(' | '), items_detalle: detalleCap };
};

const facturaInventarioService = {
    async crear(data, userId) {
        const { numero_factura, proveedor, fecha_factura, monto_neto, observaciones, items } = data;
        if (!items || !items.length) throw new Error('La factura debe tener al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [result] = await conn.query(
                `INSERT INTO facturas_inventario (numero_factura, proveedor, fecha_factura, monto_neto, observaciones, registrado_por)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [numero_factura, proveedor, fecha_factura, monto_neto, observaciones || null, userId]
            );
            const facturaId = result.insertId;

            for (const item of items) {
                // XOR (mig 050): la factura aterriza el stock en obra XOR bodega.
                const ubic = normalizeUbicacion(item.obra_id, item.bodega_id);

                await conn.query(
                    `INSERT INTO factura_items (factura_id, item_id, obra_id, bodega_id, cantidad, precio_unitario)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [facturaId, item.item_id, ubic.obra, ubic.bodega, item.cantidad, item.precio_unitario]
                );

                // Auto-incrementar stock en destino
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                    [item.item_id, ubic.obra, ubic.bodega, item.cantidad]
                );
            }

            await conn.commit();
            return { id: facturaId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Edición post-ingreso (cabecera + ítems). Misma semántica de stock que
     * anular + crear, en UNA transacción: reversa el stock de los ítems previos
     * (GREATEST-clamp, igual que anular), reemplaza los ítems y re-aplica stock.
     * Tras el commit registra el historial con diff legible (logs_actividad,
     * accion UPDATE) vía logManualActivity — el activityLogger global excluye
     * este PUT para no duplicar con un log sin diff.
     */
    async editar(id, data, userId, req = null) {
        const { numero_factura, proveedor, fecha_factura, monto_neto, observaciones, items } = data;
        if (!items || !items.length) throw new Error('La factura debe tener al menos un ítem');

        const conn = await db.getConnection();
        let antes, itemsAntes;
        try {
            await conn.beginTransaction();

            const [factRows] = await conn.query(
                'SELECT * FROM facturas_inventario WHERE id = ? FOR UPDATE', [id]
            );
            if (!factRows.length) {
                const err = new Error('Factura no encontrada');
                err.statusCode = 404;
                throw err;
            }
            if (!factRows[0].activo) {
                const err = new Error('No se puede editar una factura anulada');
                err.statusCode = 400;
                throw err;
            }
            antes = factRows[0];

            const [prevItems] = await conn.query(`
                SELECT fi.*, i.descripcion
                FROM factura_items fi
                JOIN items_inventario i ON fi.item_id = i.id
                WHERE fi.factura_id = ?
            `, [id]);
            itemsAntes = prevItems;

            // 1) Reversar el stock de los ítems previos (idéntico a anular).
            for (const item of prevItems) {
                const ubic = normalizeUbicacion(item.obra_id, item.bodega_id);
                await conn.query(
                    `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                     WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                    [item.cantidad, item.item_id, ubic.obra, ubic.bodega]
                );
            }
            await conn.query('DELETE FROM factura_items WHERE factura_id = ?', [id]);

            // 2) Cabecera.
            await conn.query(
                `UPDATE facturas_inventario
                 SET numero_factura = ?, proveedor = ?, fecha_factura = ?, monto_neto = ?, observaciones = ?
                 WHERE id = ?`,
                [numero_factura, proveedor, fecha_factura, monto_neto, observaciones || null, id]
            );

            // 3) Ítems nuevos + stock (idéntico a crear).
            for (const item of items) {
                const ubic = normalizeUbicacion(item.obra_id, item.bodega_id);
                await conn.query(
                    `INSERT INTO factura_items (factura_id, item_id, obra_id, bodega_id, cantidad, precio_unitario)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [id, item.item_id, ubic.obra, ubic.bodega, item.cantidad, item.precio_unitario]
                );
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                    [item.item_id, ubic.obra, ubic.bodega, item.cantidad]
                );
            }

            // Descripciones de los ítems nuevos para el diff legible.
            const nuevosIds = [...new Set(items.map(i => Number(i.item_id)))];
            const [descRows] = await conn.query(
                'SELECT id, descripcion FROM items_inventario WHERE id IN (?)', [nuevosIds]
            );
            const descMap = Object.fromEntries(descRows.map(r => [Number(r.id), r.descripcion]));
            var itemsDespues = items.map(i => ({ ...i, descripcion: descMap[Number(i.item_id)] }));

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        // Historial (post-commit; si no hubo cambios reales, no ensuciar el log).
        const { cambios, resumen, items_detalle } = computarDiffFactura(antes, itemsAntes, data, itemsDespues);
        if (Object.keys(cambios).length > 0) {
            await logManualActivity(
                userId, 'facturas-inventario', 'UPDATE', String(id),
                JSON.stringify({ cambios, resumen, items_detalle }), req
            );
        }

        return { id: Number(id) };
    },

    /**
     * Historial de modificaciones de UNA factura, leído de logs_actividad.
     * Parsea `detalle` acá para no exponer el shape crudo (ni ip/user_agent).
     */
    async getHistorial(id) {
        const [rows] = await db.query(`
            SELECT l.id, l.created_at, l.detalle, u.nombre AS usuario_nombre
            FROM logs_actividad l
            LEFT JOIN usuarios u ON l.usuario_id = u.id
            WHERE l.modulo = 'facturas-inventario' AND l.item_id = ? AND l.accion = 'UPDATE'
            ORDER BY l.created_at DESC, l.id DESC
            LIMIT 50
        `, [String(id)]);

        return rows.map(r => {
            let parsed = {};
            try { parsed = JSON.parse(r.detalle) || {}; } catch { /* legacy/corrupto → solo fecha+usuario */ }
            return {
                id: r.id,
                fecha: r.created_at,
                usuario_nombre: r.usuario_nombre || null,
                resumen: parsed.resumen || null,
                cambios: parsed.cambios || null,
                items_detalle: Array.isArray(parsed.items_detalle) ? parsed.items_detalle : [],
            };
        });
    },

    async getAll(query = {}) {
        const { limit, offset } = normalizePagination(query);
        // monto_virtual: suma de los ítems con destino en bodega(s) virtuales
        // (mig 099). La UI lo resta del monto MOSTRADO según el modo del botón;
        // monto_neto almacenado nunca cambia (documento real). `fi.obra_id IS
        // NULL` espeja la precedencia de normalizeUbicacion (obra gana en
        // facturas legacy con ambos destinos seteados).
        const [rows] = await db.query(`
            SELECT f.*, u.nombre as registrado_por_nombre,
                   COALESCE(mv.monto_virtual, 0) as monto_virtual
            FROM facturas_inventario f
            LEFT JOIN usuarios u ON f.registrado_por = u.id
            LEFT JOIN (
                SELECT fi.factura_id, SUM(fi.cantidad * fi.precio_unitario) AS monto_virtual
                FROM factura_items fi
                JOIN bodegas b ON b.id = fi.bodega_id AND b.es_virtual = 1
                WHERE fi.obra_id IS NULL
                GROUP BY fi.factura_id
            ) mv ON mv.factura_id = f.id
            WHERE f.activo = 1
            ORDER BY f.fecha_factura DESC, f.id DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [countRows] = await db.query('SELECT COUNT(*) as total FROM facturas_inventario WHERE activo = 1');
        return { data: rows, total: countRows[0].total };
    },

    async getById(id) {
        const [rows] = await db.query(`
            SELECT f.*, u.nombre as registrado_por_nombre
            FROM facturas_inventario f
            LEFT JOIN usuarios u ON f.registrado_por = u.id
            WHERE f.id = ?
        `, [id]);
        if (!rows.length) throw new Error('Factura no encontrada');

        const [items] = await db.query(`
            SELECT fi.*, i.descripcion as item_descripcion, i.unidad,
                   o.nombre as obra_nombre, b.nombre as bodega_nombre,
                   CASE WHEN fi.obra_id IS NULL THEN COALESCE(b.es_virtual, 0) ELSE 0 END as bodega_es_virtual
            FROM factura_items fi
            JOIN items_inventario i ON fi.item_id = i.id
            LEFT JOIN obras o ON fi.obra_id = o.id
            LEFT JOIN bodegas b ON fi.bodega_id = b.id
            WHERE fi.factura_id = ?
        `, [id]);

        return { ...rows[0], items };
    },

    async anular(id, userId = null, req = null) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [factura] = await conn.query('SELECT activo FROM facturas_inventario WHERE id = ?', [id]);
            if (!factura.length || !factura[0].activo) throw new Error('Factura no encontrada o ya anulada');

            // Reversar stock
            const [items] = await conn.query('SELECT * FROM factura_items WHERE factura_id = ?', [id]);
            for (const item of items) {
                // Normalizar antes del WHERE: facturas legacy pueden tener obra+bodega
                // ambos seteados en factura_items, pero ubicaciones_stock ya fue
                // consolidada (mig 050) a la versión obra-only.
                const ubic = normalizeUbicacion(item.obra_id, item.bodega_id);
                await conn.query(
                    `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                     WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                    [item.cantidad, item.item_id, ubic.obra, ubic.bodega]
                );
            }

            await conn.query('UPDATE facturas_inventario SET activo = 0 WHERE id = ?', [id]);
            await conn.commit();

            // Historial legible (el activityLogger global excluye este PUT).
            await logManualActivity(
                userId, 'facturas-inventario', 'UPDATE', String(id),
                JSON.stringify({ resumen: 'Factura anulada — stock revertido' }), req
            );

            return { id, anulada: true };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }
};

module.exports = facturaInventarioService;

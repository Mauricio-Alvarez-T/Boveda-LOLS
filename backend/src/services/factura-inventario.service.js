const fs = require('fs');
const path = require('path');
const db = require('../config/db');
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

const httpError = (status, msg) => { const e = new Error(msg); e.statusCode = status; return e; };

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
function borrarArchivo(ruta) {
    if (!ruta) return;
    try { fs.unlinkSync(path.join(UPLOADS_DIR, ruta)); } catch { /* ya no estaba */ }
}

/** La ruta interna del archivo no sale del servidor: el cliente solo sabe si hay uno. */
const publica = (f) => {
    const { archivo_path, ...resto } = f;
    return { ...resto, tiene_archivo: !!archivo_path };
};

/**
 * Para pasar a 'registrada' la factura tiene que estar completa: número, proveedor,
 * fecha y al menos un ítem, todos vinculados al catálogo. Un borrador guarda lo que haya.
 */
function exigirCompleta(data) {
    const items = data.items || [];
    if (!String(data.numero_factura || '').trim()) throw httpError(400, 'Falta el número de factura');
    if (!String(data.proveedor || '').trim()) throw httpError(400, 'Falta el proveedor');
    if (!data.fecha_factura) throw httpError(400, 'Falta la fecha de la factura');
    if (!items.length) throw httpError(400, 'La factura debe tener al menos un ítem');
    if (items.some(it => !it.item_id)) throw httpError(400, 'Hay ítems sin vincular al catálogo: elige el ítem o créalo con «Nuevo»');
}

/**
 * Ítems de la factura. Desde la mig 157 NO tocan stock: sin destino (obra/bodega
 * NULL) — la factura es el registro de lo comprado. `descripcion_factura` guarda el
 * texto tal cual viene en el documento (lo llena la lectura con IA o queda vacío).
 */
async function insertarItems(conn, facturaId, items) {
    for (const item of items) {
        await conn.query(
            `INSERT INTO factura_items (factura_id, item_id, obra_id, bodega_id, cantidad, precio_unitario, descripcion_factura)
             VALUES (?, ?, NULL, NULL, ?, ?, ?)`,
            [facturaId, item.item_id || null, item.cantidad, item.precio_unitario,
                item.descripcion_factura ? String(item.descripcion_factura).slice(0, 255) : null]
        );
    }
}

const facturaInventarioService = {
    /**
     * Alta. `estado: 'borrador'` guarda a medias («Continuar después»); si no, se
     * registra y debe venir completa. Desde la mig 157 no mueve stock ni costo.
     */
    async crear(data, userId) {
        const estado = data.estado === 'borrador' ? 'borrador' : 'registrada';
        if (estado === 'registrada') exigirCompleta(data);
        const { numero_factura, proveedor, fecha_factura, monto_neto, observaciones } = data;
        const items = data.items || [];

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [result] = await conn.query(
                `INSERT INTO facturas_inventario (estado, numero_factura, proveedor, fecha_factura, monto_neto, observaciones, registrado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [estado, numero_factura || null, proveedor || null, fecha_factura || null, monto_neto || 0, observaciones || null, userId]
            );
            await insertarItems(conn, result.insertId, items);
            await conn.commit();
            return { id: result.insertId, estado };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Edición (cabecera + ítems) en UNA transacción. Un borrador puede seguir siendo
     * borrador o pasar a registrada; una registrada no vuelve a borrador. Sin stock
     * (mig 157): las facturas viejas que sí lo movieron conservan ese stock — editar
     * o anular ya no lo revierte (decisión del dueño 2026-11-25).
     * Historial: solo las ediciones de una factura YA registrada (logs_actividad
     * UPDATE vía logManualActivity; el activityLogger global excluye este PUT).
     */
    async editar(id, data, userId, req = null) {
        const conn = await db.getConnection();
        let antes, itemsAntes, itemsDespues, estado;
        try {
            await conn.beginTransaction();

            const [factRows] = await conn.query(
                'SELECT * FROM facturas_inventario WHERE id = ? FOR UPDATE', [id]
            );
            if (!factRows.length) throw httpError(404, 'Factura no encontrada');
            if (!factRows[0].activo) throw httpError(400, 'No se puede editar una factura anulada');
            antes = factRows[0];

            estado = data.estado === 'borrador' ? 'borrador' : (data.estado === 'registrada' ? 'registrada' : antes.estado);
            if (antes.estado === 'registrada' && estado === 'borrador') {
                throw httpError(400, 'Una factura registrada no vuelve a borrador');
            }
            if (estado === 'registrada') exigirCompleta(data);
            const items = data.items || [];

            const [prevItems] = await conn.query(`
                SELECT fi.*, COALESCE(i.descripcion, fi.descripcion_factura) AS descripcion
                FROM factura_items fi
                LEFT JOIN items_inventario i ON fi.item_id = i.id
                WHERE fi.factura_id = ?
            `, [id]);
            itemsAntes = prevItems;

            await conn.query('DELETE FROM factura_items WHERE factura_id = ?', [id]);
            await conn.query(
                `UPDATE facturas_inventario
                 SET estado = ?, numero_factura = ?, proveedor = ?, fecha_factura = ?, monto_neto = ?, observaciones = ?
                 WHERE id = ?`,
                [estado, data.numero_factura || null, data.proveedor || null, data.fecha_factura || null,
                    data.monto_neto || 0, data.observaciones || null, id]
            );
            await insertarItems(conn, id, items);

            // Descripciones de los ítems nuevos para el diff legible.
            const nuevosIds = [...new Set(items.map(i => Number(i.item_id)).filter(Boolean))];
            let descMap = {};
            if (nuevosIds.length) {
                const [descRows] = await conn.query(
                    'SELECT id, descripcion FROM items_inventario WHERE id IN (?)', [nuevosIds]
                );
                descMap = Object.fromEntries(descRows.map(r => [Number(r.id), r.descripcion]));
            }
            itemsDespues = items.map(i => ({ ...i, descripcion: descMap[Number(i.item_id)] || i.descripcion_factura }));

            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        // Historial (post-commit): solo cambios a una factura ya registrada.
        if (antes.estado === 'registrada') {
            const { cambios, resumen, items_detalle } = computarDiffFactura(antes, itemsAntes, data, itemsDespues);
            if (Object.keys(cambios).length > 0) {
                await logManualActivity(
                    userId, 'facturas-inventario', 'UPDATE', String(id),
                    JSON.stringify({ cambios, resumen, items_detalle }), req
                );
            }
        }

        return { id: Number(id), estado };
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

    /**
     * Lista: borradores primero (lo que quedó a medias), después por fecha de compra,
     * la más nueva arriba. monto_virtual (mig 099) solo existe en facturas viejas
     * con destino en bodega virtual; las nuevas no tienen destino → 0.
     */
    async getAll(query = {}) {
        const { limit, offset } = normalizePagination(query);
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
            ORDER BY (f.estado = 'borrador') DESC, f.fecha_factura DESC, f.id DESC
            LIMIT ? OFFSET ?
        `, [limit, offset]);

        const [countRows] = await db.query('SELECT COUNT(*) as total FROM facturas_inventario WHERE activo = 1');
        return { data: rows.map(publica), total: countRows[0].total };
    },

    async getById(id) {
        const [rows] = await db.query(`
            SELECT f.*, u.nombre as registrado_por_nombre
            FROM facturas_inventario f
            LEFT JOIN usuarios u ON f.registrado_por = u.id
            WHERE f.id = ?
        `, [id]);
        if (!rows.length) throw httpError(404, 'Factura no encontrada');

        // LEFT JOIN: una línea de borrador puede no estar vinculada al catálogo aún.
        const [items] = await db.query(`
            SELECT fi.*, i.descripcion as item_descripcion, i.unidad,
                   o.nombre as obra_nombre, b.nombre as bodega_nombre,
                   CASE WHEN fi.obra_id IS NULL THEN COALESCE(b.es_virtual, 0) ELSE 0 END as bodega_es_virtual
            FROM factura_items fi
            LEFT JOIN items_inventario i ON fi.item_id = i.id
            LEFT JOIN obras o ON fi.obra_id = o.id
            LEFT JOIN bodegas b ON fi.bodega_id = b.id
            WHERE fi.factura_id = ?
            ORDER BY fi.id
        `, [id]);

        return { ...publica(rows[0]), items };
    },

    /** Foto/PDF de la factura: guarda el nuevo y borra el anterior del disco. */
    async setArchivo(id, file, userId, req = null) {
        if (!file) throw httpError(400, 'No se recibió el archivo');
        const [[actual]] = await db.query('SELECT id, archivo_path, activo FROM facturas_inventario WHERE id = ?', [id]);
        if (!actual || !actual.activo) {
            try { fs.unlinkSync(file.path); } catch { /* */ }
            throw httpError(404, 'Factura no encontrada');
        }
        const ruta = path.relative(UPLOADS_DIR, file.path);
        await db.query(
            'UPDATE facturas_inventario SET archivo_path = ?, archivo_nombre = ?, archivo_mime = ? WHERE id = ?',
            [ruta, file.originalname, file.mimetype, id]
        );
        if (actual.archivo_path && actual.archivo_path !== ruta) borrarArchivo(actual.archivo_path);
        await logManualActivity(
            userId, 'facturas-inventario', 'UPDATE', String(id),
            JSON.stringify({ resumen: `${actual.archivo_path ? 'Cambió' : 'Adjuntó'} la foto/PDF de la factura` }), req
        );
        return { id: Number(id), tiene_archivo: true };
    },

    async getArchivo(id) {
        const [[f]] = await db.query('SELECT archivo_path, archivo_nombre, archivo_mime FROM facturas_inventario WHERE id = ?', [id]);
        if (!f) throw httpError(404, 'Factura no encontrada');
        if (!f.archivo_path) throw httpError(404, 'La factura no tiene foto ni PDF');
        return { fullPath: path.join(UPLOADS_DIR, f.archivo_path), fileName: f.archivo_nombre || `factura-${id}`, mime: f.archivo_mime };
    },

    /**
     * Anular (o descartar un borrador). Desde la mig 157 no revierte stock: lo que
     * entró por facturas viejas se queda (decisión del dueño 2026-11-25).
     */
    async anular(id, userId = null, req = null) {
        const [[factura]] = await db.query('SELECT activo, estado FROM facturas_inventario WHERE id = ?', [id]);
        if (!factura || !factura.activo) throw httpError(404, 'Factura no encontrada o ya anulada');
        await db.query('UPDATE facturas_inventario SET activo = 0 WHERE id = ?', [id]);
        await logManualActivity(
            userId, 'facturas-inventario', 'UPDATE', String(id),
            JSON.stringify({ resumen: factura.estado === 'borrador' ? 'Borrador descartado' : 'Factura anulada' }), req
        );
        return { id, anulada: true };
    },
};

module.exports = facturaInventarioService;

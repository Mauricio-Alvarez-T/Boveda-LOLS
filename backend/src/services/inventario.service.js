const db = require('../config/db');

const inventarioService = {
    /**
     * Resumen mensual: todos los ítems con cantidades por ubicación.
     * Devuelve estructura agrupada por categoría, con totales.
     */
    async getResumen(obraId = null) {
        // 1. Obtener todas las ubicaciones activas (obras + bodegas)
        const [obras] = await db.query('SELECT id, nombre FROM obras WHERE activa = 1 ORDER BY nombre');
        const [bodegas] = await db.query('SELECT id, nombre FROM bodegas WHERE activa = 1 ORDER BY nombre');

        // 2. Obtener todos los ítems con su categoría
        const [items] = await db.query(`
            SELECT i.*, c.nombre as categoria_nombre, c.orden as categoria_orden
            FROM items_inventario i
            JOIN categorias_inventario c ON i.categoria_id = c.id
            WHERE i.activo = 1
            ORDER BY c.orden ASC, i.nro_item ASC
        `);

        // 3. Obtener todo el stock
        let stockQuery = `
            SELECT us.item_id, us.obra_id, us.bodega_id, us.cantidad, us.valor_arriendo_override
            FROM ubicaciones_stock us
            JOIN items_inventario i ON us.item_id = i.id
            WHERE i.activo = 1
        `;
        const stockParams = [];
        if (obraId) {
            stockQuery += ' AND us.obra_id = ?';
            stockParams.push(obraId);
        }
        const [stock] = await db.query(stockQuery, stockParams);

        // 4. Indexar stock por item_id -> { obra_X: cantidad, bodega_X: cantidad }
        const stockMap = {};
        stock.forEach(s => {
            if (!stockMap[s.item_id]) stockMap[s.item_id] = {};
            const key = s.obra_id ? `obra_${s.obra_id}` : `bodega_${s.bodega_id}`;
            stockMap[s.item_id][key] = {
                cantidad: s.cantidad,
                valor_arriendo_override: s.valor_arriendo_override
            };
        });

        // 5. Obtener descuentos por obra
        const [descuentos] = await db.query('SELECT obra_id, porcentaje FROM descuentos_obra');
        const descuentoMap = {};
        descuentos.forEach(d => { descuentoMap[d.obra_id] = parseFloat(d.porcentaje); });

        // 6. Construir resultado agrupado por categoría
        const categorias = {};
        items.forEach(item => {
            const catKey = item.categoria_id;
            if (!categorias[catKey]) {
                categorias[catKey] = {
                    id: item.categoria_id,
                    nombre: item.categoria_nombre,
                    orden: item.categoria_orden,
                    items: []
                };
            }

            const itemStock = stockMap[item.id] || {};
            const ubicaciones = {};
            let totalArriendo = 0;
            let totalCantidad = 0;

            // Por cada obra
            obras.forEach(o => {
                const s = itemStock[`obra_${o.id}`];
                const cant = s ? s.cantidad : 0;
                const arriendo = s?.valor_arriendo_override ?? item.valor_arriendo;
                ubicaciones[`obra_${o.id}`] = { cantidad: cant, total: cant * arriendo };
                totalArriendo += cant * arriendo;
                totalCantidad += cant;
            });

            // Por cada bodega
            bodegas.forEach(b => {
                const s = itemStock[`bodega_${b.id}`];
                const cant = s ? s.cantidad : 0;
                ubicaciones[`bodega_${b.id}`] = { cantidad: cant, total: 0 }; // bodegas no facturan arriendo
                totalCantidad += cant;
            });

            categorias[catKey].items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_compra: parseFloat(item.valor_compra),
                valor_arriendo: parseFloat(item.valor_arriendo),
                unidad: item.unidad,
                imagen_url: item.imagen_url ? (item.imagen_url.startsWith('/api/') ? item.imagen_url : `/api${item.imagen_url}`) : null,
                ubicaciones,
                total_arriendo: totalArriendo,
                total_cantidad: totalCantidad
            });
        });

        return {
            obras: obras.map(o => ({ id: o.id, nombre: o.nombre })),
            bodegas: bodegas.map(b => ({ id: b.id, nombre: b.nombre })),
            categorias: Object.values(categorias).sort((a, b) => a.orden - b.orden),
            descuentos: descuentoMap
        };
    },

    /**
     * Stock detallado de una obra específica (vista tipo hoja Excel por obra).
     */
    async getStockPorObra(obraId) {
        const [obraRows] = await db.query('SELECT id, nombre FROM obras WHERE id = ?', [obraId]);
        if (!obraRows.length) throw new Error('Obra no encontrada');
        const obra = obraRows[0];

        const [items] = await db.query(`
            SELECT i.id, i.nro_item, i.descripcion, i.m2, i.valor_arriendo, i.unidad,
                   c.nombre as categoria_nombre, c.id as categoria_id, c.orden as categoria_orden,
                   COALESCE(us.cantidad, 0) as cantidad,
                   us.valor_arriendo_override,
                   us.id as ubicacion_stock_id
            FROM items_inventario i
            JOIN categorias_inventario c ON i.categoria_id = c.id
            LEFT JOIN ubicaciones_stock us ON us.item_id = i.id AND us.obra_id = ?
            WHERE i.activo = 1
            ORDER BY c.orden ASC, i.nro_item ASC
        `, [obraId]);

        // Descuento
        const [descRows] = await db.query('SELECT porcentaje FROM descuentos_obra WHERE obra_id = ?', [obraId]);
        const descuento = descRows.length ? parseFloat(descRows[0].porcentaje) : 0;

        // Agrupar por categoría
        const categorias = {};
        let totalFacturacion = 0;

        items.forEach(item => {
            const catKey = item.categoria_id;
            if (!categorias[catKey]) {
                categorias[catKey] = {
                    id: item.categoria_id,
                    nombre: item.categoria_nombre,
                    orden: item.categoria_orden,
                    items: [],
                    subtotal_cantidad: 0,
                    subtotal_arriendo: 0
                };
            }

            const arriendo = item.valor_arriendo_override != null
                ? parseFloat(item.valor_arriendo_override)
                : parseFloat(item.valor_arriendo);
            const total = item.cantidad * arriendo;

            categorias[catKey].items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_arriendo: arriendo,
                unidad: item.unidad,
                cantidad: item.cantidad,
                total,
                ubicacion_stock_id: item.ubicacion_stock_id
            });

            categorias[catKey].subtotal_cantidad += item.cantidad;
            categorias[catKey].subtotal_arriendo += total;
            totalFacturacion += total;
        });

        const montoDescuento = totalFacturacion * (descuento / 100);

        return {
            obra,
            categorias: Object.values(categorias).sort((a, b) => a.orden - b.orden),
            total_facturacion: totalFacturacion,
            descuento_porcentaje: descuento,
            descuento_monto: montoDescuento,
            total_con_descuento: totalFacturacion - montoDescuento
        };
    },

    /**
     * Stock detallado de una bodega.
     */
    async getStockPorBodega(bodegaId) {
        const [bodegaRows] = await db.query('SELECT id, nombre FROM bodegas WHERE id = ?', [bodegaId]);
        if (!bodegaRows.length) throw new Error('Bodega no encontrada');
        const bodega = bodegaRows[0];

        const [items] = await db.query(`
            SELECT i.id, i.nro_item, i.descripcion, i.m2, i.valor_arriendo, i.unidad,
                   c.nombre as categoria_nombre, c.id as categoria_id, c.orden as categoria_orden,
                   COALESCE(us.cantidad, 0) as cantidad,
                   us.id as ubicacion_stock_id
            FROM items_inventario i
            JOIN categorias_inventario c ON i.categoria_id = c.id
            LEFT JOIN ubicaciones_stock us ON us.item_id = i.id AND us.bodega_id = ?
            WHERE i.activo = 1
            ORDER BY c.orden ASC, i.nro_item ASC
        `, [bodegaId]);

        const categorias = {};
        items.forEach(item => {
            const catKey = item.categoria_id;
            if (!categorias[catKey]) {
                categorias[catKey] = {
                    id: item.categoria_id,
                    nombre: item.categoria_nombre,
                    orden: item.categoria_orden,
                    items: [],
                    subtotal_cantidad: 0
                };
            }
            categorias[catKey].items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_arriendo: parseFloat(item.valor_arriendo),
                unidad: item.unidad,
                cantidad: item.cantidad,
                ubicacion_stock_id: item.ubicacion_stock_id
            });
            categorias[catKey].subtotal_cantidad += item.cantidad;
        });

        return {
            bodega,
            categorias: Object.values(categorias).sort((a, b) => a.orden - b.orden)
        };
    },

    /**
     * Actualizar stock de una ubicación (edición inline).
     * Upsert: si no existe la fila en ubicaciones_stock, la crea.
     */
    async actualizarStock(itemId, obraId, bodegaId, { cantidad, valorArriendoOverride }) {
        const updates = {};
        if (cantidad !== undefined) updates.cantidad = cantidad;
        if (valorArriendoOverride !== undefined) updates.valor_arriendo_override = valorArriendoOverride;

        if (Object.keys(updates).length === 0) throw new Error('Nada que actualizar');

        // Upsert
        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        const [existing] = await db.query(
            'SELECT id FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?',
            [itemId, obraId || null, bodegaId || null]
        );

        if (existing.length) {
            await db.query(
                `UPDATE ubicaciones_stock SET ${setClauses} WHERE id = ?`,
                [...values, existing[0].id]
            );
            return { id: existing[0].id, ...updates };
        } else {
            const [result] = await db.query(
                `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                 VALUES (?, ?, ?, ?, ?)`,
                [itemId, obraId || null, bodegaId || null, cantidad || 0, valorArriendoOverride || null]
            );
            return { id: result.insertId, ...updates };
        }
    },

    /**
     * Actualizar descuento de una obra.
     */
    async actualizarDescuento(obraId, porcentaje) {
        await db.query(
            `INSERT INTO descuentos_obra (obra_id, porcentaje) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE porcentaje = VALUES(porcentaje)`,
            [obraId, porcentaje]
        );
        return { obra_id: obraId, porcentaje };
    }
};

module.exports = inventarioService;

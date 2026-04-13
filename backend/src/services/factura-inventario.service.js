const db = require('../config/db');

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
                await conn.query(
                    `INSERT INTO factura_items (factura_id, item_id, obra_id, bodega_id, cantidad, precio_unitario)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [facturaId, item.item_id, item.obra_id || null, item.bodega_id || null, item.cantidad, item.precio_unitario]
                );

                // Auto-incrementar stock en destino
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                    [item.item_id, item.obra_id || null, item.bodega_id || null, item.cantidad]
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

    async getAll(query = {}) {
        const { page = 1, limit = 20 } = query;
        const offset = (page - 1) * limit;
        const [rows] = await db.query(`
            SELECT f.*, u.nombre as registrado_por_nombre
            FROM facturas_inventario f
            LEFT JOIN usuarios u ON f.registrado_por = u.id
            WHERE f.activo = 1
            ORDER BY f.fecha_factura DESC
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
                   o.nombre as obra_nombre, b.nombre as bodega_nombre
            FROM factura_items fi
            JOIN items_inventario i ON fi.item_id = i.id
            LEFT JOIN obras o ON fi.obra_id = o.id
            LEFT JOIN bodegas b ON fi.bodega_id = b.id
            WHERE fi.factura_id = ?
        `, [id]);

        return { ...rows[0], items };
    },

    async anular(id) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [factura] = await conn.query('SELECT activo FROM facturas_inventario WHERE id = ?', [id]);
            if (!factura.length || !factura[0].activo) throw new Error('Factura no encontrada o ya anulada');

            // Reversar stock
            const [items] = await conn.query('SELECT * FROM factura_items WHERE factura_id = ?', [id]);
            for (const item of items) {
                await conn.query(
                    `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                     WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                    [item.cantidad, item.item_id, item.obra_id, item.bodega_id]
                );
            }

            await conn.query('UPDATE facturas_inventario SET activo = 0 WHERE id = ?', [id]);
            await conn.commit();
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

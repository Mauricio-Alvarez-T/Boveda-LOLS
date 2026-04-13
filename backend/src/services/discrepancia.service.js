const db = require('../config/db');

const discrepanciaService = {
    async reportar(data, userId) {
        const { item_id, obra_id, bodega_id, cantidad_reportada } = data;

        // Obtener cantidad en sistema
        const [stock] = await db.query(
            'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?',
            [item_id, obra_id || null, bodega_id || null]
        );
        const cantidadSistema = stock.length ? stock[0].cantidad : 0;

        if (cantidadSistema === cantidad_reportada) throw new Error('No hay discrepancia — cantidades iguales');

        const [result] = await db.query(
            `INSERT INTO discrepancias_inventario (item_id, obra_id, bodega_id, cantidad_sistema, cantidad_reportada, reportado_por)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [item_id, obra_id || null, bodega_id || null, cantidadSistema, cantidad_reportada, userId]
        );
        return { id: result.insertId, diferencia: cantidad_reportada - cantidadSistema };
    },

    async resolver(id, userId, data) {
        const { resolucion, ajustar_stock } = data;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [disc] = await conn.query('SELECT * FROM discrepancias_inventario WHERE id = ?', [id]);
            if (!disc.length || disc[0].estado !== 'pendiente') throw new Error('Discrepancia no está pendiente');
            const d = disc[0];

            // Opcionalmente ajustar stock al valor reportado
            if (ajustar_stock) {
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = VALUES(cantidad)`,
                    [d.item_id, d.obra_id, d.bodega_id, d.cantidad_reportada]
                );
            }

            await conn.query(
                `UPDATE discrepancias_inventario SET estado = 'resuelta', resolucion = ?, resuelto_por = ?, fecha_resolucion = NOW() WHERE id = ?`,
                [resolucion || null, userId, id]
            );

            await conn.commit();
            return { id, estado: 'resuelta' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getAll(query = {}) {
        const { estado, page = 1, limit = 20 } = query;
        let where = 'WHERE d.activo = 1';
        const params = [];
        if (estado) { where += ' AND d.estado = ?'; params.push(estado); }

        const offset = (page - 1) * limit;
        const [rows] = await db.query(`
            SELECT d.*, i.descripcion as item_descripcion, i.nro_item,
                   o.nombre as obra_nombre, b.nombre as bodega_nombre,
                   u.nombre as reportado_por_nombre
            FROM discrepancias_inventario d
            JOIN items_inventario i ON d.item_id = i.id
            LEFT JOIN obras o ON d.obra_id = o.id
            LEFT JOIN bodegas b ON d.bodega_id = b.id
            LEFT JOIN usuarios u ON d.reportado_por = u.id
            ${where}
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        return { data: rows };
    }
};

module.exports = discrepanciaService;

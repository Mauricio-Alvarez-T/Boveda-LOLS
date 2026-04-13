const db = require('../config/db');

const transferenciaService = {
    /**
     * Genera código único TRF-YYYYMM-XXXX
     */
    async _generarCodigo() {
        const now = new Date();
        const prefix = `TRF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
        const [rows] = await db.query(
            "SELECT codigo FROM transferencias WHERE codigo LIKE ? ORDER BY id DESC LIMIT 1",
            [`${prefix}%`]
        );
        let seq = 1;
        if (rows.length) {
            const last = rows[0].codigo.split('-').pop();
            seq = parseInt(last, 10) + 1;
        }
        return `${prefix}-${String(seq).padStart(4, '0')}`;
    },

    async crear(data, solicitanteId) {
        const { destino_obra_id, destino_bodega_id, items, observaciones, requiere_pionetas, cantidad_pionetas } = data;
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');
        if (!destino_obra_id && !destino_bodega_id) throw new Error('Debe especificar un destino');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const codigo = await this._generarCodigo();

            const [result] = await conn.query(
                `INSERT INTO transferencias (codigo, destino_obra_id, destino_bodega_id, solicitante_id, observaciones, requiere_pionetas, cantidad_pionetas)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [codigo, destino_obra_id || null, destino_bodega_id || null, solicitanteId, observaciones || null, requiere_pionetas || false, cantidad_pionetas || null]
            );
            const trfId = result.insertId;

            for (const item of items) {
                await conn.query(
                    `INSERT INTO transferencia_items (transferencia_id, item_id, cantidad_solicitada) VALUES (?, ?, ?)`,
                    [trfId, item.item_id, item.cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async aprobar(id, aprobadorId, data) {
        const { origen_obra_id, origen_bodega_id, items } = data;
        if (!origen_obra_id && !origen_bodega_id) throw new Error('Debe especificar un origen');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar estado
            const [trf] = await conn.query('SELECT estado FROM transferencias WHERE id = ?', [id]);
            if (!trf.length || trf[0].estado !== 'pendiente') throw new Error('Transferencia no está pendiente');

            // Validar stock de origen para cada ítem
            for (const item of items) {
                const [stock] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?',
                    [item.item_id, origen_obra_id || null, origen_bodega_id || null]
                );
                const disponible = stock.length ? stock[0].cantidad : 0;
                if (item.cantidad_enviada > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id}. Disponible: ${disponible}, solicitado: ${item.cantidad_enviada}`);
                }
            }

            // Actualizar transferencia
            await conn.query(
                `UPDATE transferencias SET estado = 'aprobada', aprobador_id = ?, origen_obra_id = ?, origen_bodega_id = ?, fecha_aprobacion = NOW() WHERE id = ?`,
                [aprobadorId, origen_obra_id || null, origen_bodega_id || null, id]
            );

            // Actualizar cantidades enviadas
            for (const item of items) {
                await conn.query(
                    'UPDATE transferencia_items SET cantidad_enviada = ? WHERE transferencia_id = ? AND item_id = ?',
                    [item.cantidad_enviada, id, item.item_id]
                );
            }

            await conn.commit();
            return { id, estado: 'aprobada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async despachar(id, transportistaId) {
        const [trf] = await db.query('SELECT estado FROM transferencias WHERE id = ?', [id]);
        if (!trf.length || trf[0].estado !== 'aprobada') throw new Error('Transferencia no está aprobada');

        await db.query(
            "UPDATE transferencias SET estado = 'en_transito', transportista_id = ?, fecha_despacho = NOW() WHERE id = ?",
            [transportistaId, id]
        );
        return { id, estado: 'en_transito' };
    },

    async recibir(id, receptorId, items) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query(
                'SELECT * FROM transferencias WHERE id = ?', [id]
            );
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (trf.estado !== 'en_transito' && trf.estado !== 'aprobada') throw new Error('Transferencia no puede ser recibida');

            // Actualizar cantidades recibidas
            for (const item of items) {
                await conn.query(
                    'UPDATE transferencia_items SET cantidad_recibida = ? WHERE transferencia_id = ? AND item_id = ?',
                    [item.cantidad_recibida, id, item.item_id]
                );

                // Decrementar stock en origen
                await conn.query(
                    `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                     WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                    [item.cantidad_recibida, item.item_id, trf.origen_obra_id, trf.origen_bodega_id]
                );

                // Incrementar stock en destino (upsert)
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                    [item.item_id, trf.destino_obra_id, trf.destino_bodega_id, item.cantidad_recibida]
                );
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'recibida', receptor_id = ?, fecha_recepcion = NOW() WHERE id = ?",
                [receptorId, id]
            );

            await conn.commit();
            return { id, estado: 'recibida' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async rechazar(id, aprobadorId, motivo) {
        const [trf] = await db.query('SELECT estado FROM transferencias WHERE id = ?', [id]);
        if (!trf.length || trf[0].estado !== 'pendiente') throw new Error('Transferencia no está pendiente');

        await db.query(
            "UPDATE transferencias SET estado = 'rechazada', aprobador_id = ?, observaciones_rechazo = ?, fecha_aprobacion = NOW() WHERE id = ?",
            [aprobadorId, motivo || null, id]
        );
        return { id, estado: 'rechazada' };
    },

    async cancelar(id, userId) {
        const [trf] = await db.query('SELECT estado, solicitante_id FROM transferencias WHERE id = ?', [id]);
        if (!trf.length) throw new Error('Transferencia no encontrada');
        if (trf[0].estado !== 'pendiente') throw new Error('Solo se pueden cancelar transferencias pendientes');

        await db.query("UPDATE transferencias SET estado = 'cancelada' WHERE id = ?", [id]);
        return { id, estado: 'cancelada' };
    },

    async getAll(query = {}) {
        const { estado, page = 1, limit = 20 } = query;
        let where = 'WHERE t.activo = 1';
        const params = [];

        if (estado) { where += ' AND t.estado = ?'; params.push(estado); }

        const offset = (page - 1) * limit;
        const [rows] = await db.query(`
            SELECT t.*,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   us.nombre as solicitante_nombre, ua.nombre as aprobador_nombre
            FROM transferencias t
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            ${where}
            ORDER BY t.fecha_solicitud DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const [countRows] = await db.query(`SELECT COUNT(*) as total FROM transferencias t ${where}`, params);

        return { data: rows, total: countRows[0].total, page, limit };
    },

    async getById(id) {
        const [rows] = await db.query(`
            SELECT t.*,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   us.nombre as solicitante_nombre, ua.nombre as aprobador_nombre,
                   ut.nombre as transportista_nombre, ur.nombre as receptor_nombre
            FROM transferencias t
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            LEFT JOIN usuarios ut ON t.transportista_id = ut.id
            LEFT JOIN usuarios ur ON t.receptor_id = ur.id
            WHERE t.id = ?
        `, [id]);
        if (!rows.length) throw new Error('Transferencia no encontrada');

        const [items] = await db.query(`
            SELECT ti.*, i.descripcion as item_descripcion, i.unidad
            FROM transferencia_items ti
            JOIN items_inventario i ON ti.item_id = i.id
            WHERE ti.transferencia_id = ?
        `, [id]);

        return { ...rows[0], items };
    },

    async getPendientes() {
        return this.getAll({ estado: 'pendiente', limit: 50 });
    },

    async getMisSolicitudes(userId, query = {}) {
        const { page = 1, limit = 20 } = query;
        const offset = (page - 1) * limit;
        const [rows] = await db.query(`
            SELECT t.*, do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre
            FROM transferencias t
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            WHERE t.solicitante_id = ? AND t.activo = 1
            ORDER BY t.fecha_solicitud DESC
            LIMIT ? OFFSET ?
        `, [userId, limit, offset]);
        return { data: rows };
    }
};

module.exports = transferenciaService;

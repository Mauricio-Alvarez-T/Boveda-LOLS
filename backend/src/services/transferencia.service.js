const db = require('../config/db');

/**
 * Flujo de stock (Opción A — decremento al aprobar):
 *
 *  pendiente   → no toca stock
 *  aprobada    → ORIGEN -= cantidad_enviada  (reservado). Puede ser MAYOR o MENOR
 *                que cantidad_solicitada — depende del criterio del aprobador y
 *                del stock disponible en el origen.
 *  en_transito → no toca stock (el stock ya salió al aprobar)
 *  recibida    → DESTINO += cantidad_recibida
 *                Si cantidad_recibida ≠ cantidad_enviada → se registra discrepancia.
 *                  · recibida < enviada → merma/pérdida en tránsito
 *                  · recibida > enviada → sobrante (miscount u otro error)
 *                La diferencia NO se revierte al origen — queda registrada para
 *                auditoría y resolución manual.
 *  rechazada   → si estaba aprobada → ORIGEN += cantidad_enviada (reversión)
 *  cancelada   → si estaba aprobada → ORIGEN += cantidad_enviada (reversión)
 */

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

            // Red de seguridad: validar stock GLOBAL por ítem (suma todas las ubicaciones).
            // El frontend ya lo valida, pero evitamos que solicitudes imposibles entren
            // al flujo si el cliente está stale o alguien bypasea la UI.
            for (const item of items) {
                const [stockRows] = await conn.query(
                    `SELECT COALESCE(SUM(cantidad), 0) as total,
                            (SELECT descripcion FROM items_inventario WHERE id = ?) as descripcion
                     FROM ubicaciones_stock WHERE item_id = ?`,
                    [item.item_id, item.item_id]
                );
                const disponible = Number(stockRows[0].total) || 0;
                const solicitado = Number(item.cantidad) || 0;
                if (solicitado > disponible) {
                    const desc = stockRows[0].descripcion || `ítem ${item.item_id}`;
                    throw new Error(`Stock insuficiente para ${desc}. Disponible: ${disponible}, solicitado: ${solicitado}`);
                }
            }

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

    /**
     * Aprueba la transferencia:
     * 1. Valida estado pendiente
     * 2. Valida que cantidad_enviada sea no-negativa. Se permite enviar MÁS o MENOS
     *    que lo solicitado — el aprobador decide según el stock real y necesidades.
     * 3. Valida stock disponible en origen (único límite físico)
     * 4. DECREMENTA stock del origen (reserva efectiva)
     * 5. Actualiza estado y cantidades enviadas
     */
    async aprobar(id, aprobadorId, data) {
        const { items } = data;
        if (!items || !items.length) throw new Error('Debe incluir ítems');

        // Compatibilidad: si el cliente manda origen global, aplicarlo a todos los
        // ítems que no traigan el suyo. Esto permite que clientes antiguos sigan
        // funcionando sin cambios.
        const defaultObraId = data.origen_obra_id || null;
        const defaultBodegaId = data.origen_bodega_id || null;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar estado
            const [trf] = await conn.query('SELECT estado FROM transferencias WHERE id = ?', [id]);
            if (!trf.length || trf[0].estado !== 'pendiente') throw new Error('Transferencia no está pendiente');

            // Fetch items desde BD (fuente de verdad)
            const [dbItems] = await conn.query(
                'SELECT item_id, cantidad_solicitada FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );
            const solicitadoMap = {};
            dbItems.forEach(r => { solicitadoMap[r.item_id] = r.cantidad_solicitada; });

            // Normalizar y validar cada ítem: debe pertenecer a la transferencia,
            // tener cantidad no-negativa, especificar origen cuando envía > 0, y
            // tener stock suficiente en el origen indicado.
            const normalizados = items.map(item => {
                if (!(item.item_id in solicitadoMap)) {
                    throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                }
                const enviada = parseInt(item.cantidad_enviada, 10) || 0;
                if (enviada < 0) throw new Error(`Cantidad enviada inválida para ítem ${item.item_id}`);

                const obraId = item.origen_obra_id ?? defaultObraId;
                const bodegaId = item.origen_bodega_id ?? defaultBodegaId;
                if (enviada > 0 && !obraId && !bodegaId) {
                    throw new Error(`Ítem ${item.item_id}: debe especificar origen (obra o bodega)`);
                }
                return { item_id: item.item_id, enviada, obraId: obraId || null, bodegaId: bodegaId || null };
            });

            for (const n of normalizados) {
                if (n.enviada === 0) continue;
                const [stock] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?',
                    [n.item_id, n.obraId, n.bodegaId]
                );
                const disponible = stock.length ? stock[0].cantidad : 0;
                if (n.enviada > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${n.item_id} en el origen indicado. Disponible: ${disponible}, requerido: ${n.enviada}`);
                }
            }

            // Origen "principal" (cabecera): el del primer ítem con envío > 0.
            // Mantiene la compatibilidad con listados/UI que leen t.origen_*.
            const primario = normalizados.find(n => n.enviada > 0) || normalizados[0];

            await conn.query(
                `UPDATE transferencias SET estado = 'aprobada', aprobador_id = ?, origen_obra_id = ?, origen_bodega_id = ?, fecha_aprobacion = NOW() WHERE id = ?`,
                [aprobadorId, primario.obraId, primario.bodegaId, id]
            );

            // Actualizar cantidades enviadas + origen per-ítem + DECREMENTAR stock
            for (const n of normalizados) {
                await conn.query(
                    `UPDATE transferencia_items
                     SET cantidad_enviada = ?, origen_obra_id = ?, origen_bodega_id = ?
                     WHERE transferencia_id = ? AND item_id = ?`,
                    [n.enviada, n.obraId, n.bodegaId, id, n.item_id]
                );

                if (n.enviada > 0) {
                    await conn.query(
                        `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                         WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                        [n.enviada, n.item_id, n.obraId, n.bodegaId]
                    );
                }
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

    /**
     * Cambia el estado a en_transito. No mueve stock (ya se movió al aprobar).
     */
    async despachar(id, transportistaId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trf] = await conn.query('SELECT estado FROM transferencias WHERE id = ?', [id]);
            if (!trf.length || trf[0].estado !== 'aprobada') throw new Error('Transferencia no está aprobada');

            await conn.query(
                "UPDATE transferencias SET estado = 'en_transito', transportista_id = ?, fecha_despacho = NOW() WHERE id = ?",
                [transportistaId, id]
            );

            await conn.commit();
            return { id, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Recepción: stock sube al destino. Si cantidad_recibida ≠ cantidad_enviada,
     * se registra discrepancia:
     *   · recibida < enviada → merma/pérdida en tránsito
     *   · recibida > enviada → sobrante (miscount u otro error)
     * El stock del origen NO se modifica aquí (ya se movió al aprobar).
     * La observación por ítem (si la envía el receptor) queda guardada en la
     * fila de discrepancia para contexto de resolución.
     */
    async recibir(id, receptorId, items) {
        if (!items || !items.length) throw new Error('Debe incluir ítems');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query('SELECT * FROM transferencias WHERE id = ?', [id]);
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (trf.estado !== 'en_transito' && trf.estado !== 'aprobada') {
                throw new Error('Transferencia no puede ser recibida');
            }

            // Fetch cantidades enviadas desde BD (fuente de verdad)
            const [dbItems] = await conn.query(
                'SELECT item_id, cantidad_enviada FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );
            const enviadaMap = {};
            dbItems.forEach(r => { enviadaMap[r.item_id] = r.cantidad_enviada || 0; });

            for (const item of items) {
                if (!(item.item_id in enviadaMap)) {
                    throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                }
                const enviada = enviadaMap[item.item_id];
                const recibida = parseInt(item.cantidad_recibida, 10) || 0;
                if (recibida < 0) {
                    throw new Error(`Cantidad recibida inválida para ítem ${item.item_id}`);
                }
                // Se permite recibir MÁS o MENOS que lo enviado. Cualquier
                // diferencia genera un registro de discrepancia para auditoría.

                // Actualizar cantidad recibida
                await conn.query(
                    'UPDATE transferencia_items SET cantidad_recibida = ? WHERE transferencia_id = ? AND item_id = ?',
                    [recibida, id, item.item_id]
                );

                // Incrementar stock en destino (upsert)
                if (recibida > 0) {
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [item.item_id, trf.destino_obra_id, trf.destino_bodega_id, recibida]
                    );
                }

                // Registrar discrepancia ante cualquier diferencia (merma o sobrante).
                // La columna `diferencia` es GENERATED (enviada - recibida), por lo
                // que será negativa cuando hay sobrante.
                if (recibida !== enviada) {
                    await conn.query(
                        `INSERT INTO transferencia_discrepancias
                         (transferencia_id, item_id, cantidad_enviada, cantidad_recibida, observacion)
                         VALUES (?, ?, ?, ?, ?)`,
                        [id, item.item_id, enviada, recibida, item.observacion || null]
                    );
                }
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

    /**
     * Rechazar: permitido en pendiente o aprobada.
     * Si estaba aprobada → reversar stock al origen.
     */
    async rechazar(id, aprobadorId, motivo) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query(
                'SELECT estado, origen_obra_id, origen_bodega_id FROM transferencias WHERE id = ?',
                [id]
            );
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (trf.estado !== 'pendiente' && trf.estado !== 'aprobada') {
                throw new Error('Solo se pueden rechazar transferencias pendientes o aprobadas');
            }

            // Si ya estaba aprobada, revertir stock al origen DE CADA ÍTEM.
            // Fallback al origen de cabecera si el ítem no tiene origen propio
            // (transferencias aprobadas antes de la migración 029 con backfill parcial).
            if (trf.estado === 'aprobada') {
                const [items] = await conn.query(
                    `SELECT item_id, cantidad_enviada, origen_obra_id, origen_bodega_id
                     FROM transferencia_items WHERE transferencia_id = ?`,
                    [id]
                );
                for (const item of items) {
                    const cantidad = item.cantidad_enviada || 0;
                    if (cantidad > 0) {
                        const obraId = item.origen_obra_id ?? trf.origen_obra_id;
                        const bodegaId = item.origen_bodega_id ?? trf.origen_bodega_id;
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                            [item.item_id, obraId, bodegaId, cantidad]
                        );
                    }
                }
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'rechazada', aprobador_id = ?, observaciones_rechazo = ?, fecha_aprobacion = NOW() WHERE id = ?",
                [aprobadorId, motivo || null, id]
            );

            await conn.commit();
            return { id, estado: 'rechazada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Cancelar: permitido en pendiente o aprobada.
     * Si estaba aprobada → reversar stock al origen.
     */
    async cancelar(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query(
                'SELECT estado, solicitante_id, origen_obra_id, origen_bodega_id FROM transferencias WHERE id = ?',
                [id]
            );
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (trf.estado !== 'pendiente' && trf.estado !== 'aprobada') {
                throw new Error('Solo se pueden cancelar transferencias pendientes o aprobadas');
            }

            // Si ya estaba aprobada, revertir stock al origen DE CADA ÍTEM.
            if (trf.estado === 'aprobada') {
                const [items] = await conn.query(
                    `SELECT item_id, cantidad_enviada, origen_obra_id, origen_bodega_id
                     FROM transferencia_items WHERE transferencia_id = ?`,
                    [id]
                );
                for (const item of items) {
                    const cantidad = item.cantidad_enviada || 0;
                    if (cantidad > 0) {
                        const obraId = item.origen_obra_id ?? trf.origen_obra_id;
                        const bodegaId = item.origen_bodega_id ?? trf.origen_bodega_id;
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                            [item.item_id, obraId, bodegaId, cantidad]
                        );
                    }
                }
            }

            await conn.query("UPDATE transferencias SET estado = 'cancelada' WHERE id = ?", [id]);

            await conn.commit();
            return { id, estado: 'cancelada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
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
            SELECT ti.*, i.descripcion as item_descripcion, i.unidad,
                   oi.nombre as origen_obra_nombre, bi.nombre as origen_bodega_nombre
            FROM transferencia_items ti
            JOIN items_inventario i ON ti.item_id = i.id
            LEFT JOIN obras oi ON ti.origen_obra_id = oi.id
            LEFT JOIN bodegas bi ON ti.origen_bodega_id = bi.id
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
    },

    /**
     * Listado de discrepancias con toda la información necesaria para auditar.
     * Agrupado por transferencia: cada entrada trae los datos de la transferencia
     * (solicitante, aprobador, receptor, origen, destino, fechas) y sus items con diferencia.
     */
    async getDiscrepancias(query = {}) {
        const { page = 1, limit = 50, estado } = query;
        const offset = (page - 1) * limit;

        const params = [];
        let where = 'WHERE t.activo = 1';
        if (estado) { where += ' AND d.estado = ?'; params.push(estado); }

        // 1. Traer transferencias distintas que tienen al menos una discrepancia
        const [trfRows] = await db.query(`
            SELECT DISTINCT t.id, t.codigo, t.fecha_solicitud, t.fecha_aprobacion,
                   t.fecha_despacho, t.fecha_recepcion,
                   oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                   do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                   us.nombre as solicitante_nombre, us.id as solicitante_id,
                   ua.nombre as aprobador_nombre, ua.id as aprobador_id,
                   ut.nombre as transportista_nombre, ut.id as transportista_id,
                   ur.nombre as receptor_nombre, ur.id as receptor_id
            FROM transferencias t
            INNER JOIN transferencia_discrepancias d ON d.transferencia_id = t.id
            LEFT JOIN obras oo ON t.origen_obra_id = oo.id
            LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
            LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
            LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
            LEFT JOIN usuarios us ON t.solicitante_id = us.id
            LEFT JOIN usuarios ua ON t.aprobador_id = ua.id
            LEFT JOIN usuarios ut ON t.transportista_id = ut.id
            LEFT JOIN usuarios ur ON t.receptor_id = ur.id
            ${where}
            ORDER BY t.fecha_recepcion DESC, t.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        if (!trfRows.length) return { data: [], total: 0, page, limit };

        // 2. Traer todas las discrepancias de esas transferencias
        const trfIds = trfRows.map(r => r.id);
        const [discRows] = await db.query(`
            SELECT d.*, i.descripcion as item_descripcion, i.nro_item, i.unidad,
                   ru.nombre as resuelto_por_nombre
            FROM transferencia_discrepancias d
            JOIN items_inventario i ON d.item_id = i.id
            LEFT JOIN usuarios ru ON d.resuelto_por = ru.id
            WHERE d.transferencia_id IN (?)
            ORDER BY d.transferencia_id, d.id
        `, [trfIds]);

        // 3. Agrupar discrepancias por transferencia
        const byTrf = {};
        discRows.forEach(d => {
            if (!byTrf[d.transferencia_id]) byTrf[d.transferencia_id] = [];
            byTrf[d.transferencia_id].push(d);
        });

        // 4. Total (cuenta distinct transferencias con discrepancias)
        const [countRows] = await db.query(`
            SELECT COUNT(DISTINCT t.id) as total
            FROM transferencias t
            INNER JOIN transferencia_discrepancias d ON d.transferencia_id = t.id
            ${where}
        `, params);

        const data = trfRows.map(t => {
            const discrepancias = byTrf[t.id] || [];
            const total_unidades_perdidas = discrepancias.reduce((s, d) => s + (d.diferencia || 0), 0);
            return {
                ...t,
                discrepancias,
                total_unidades_perdidas,
                total_items_afectados: discrepancias.length,
            };
        });

        return { data, total: countRows[0].total, page, limit };
    },

    /**
     * Marca una discrepancia como 'resuelta' o 'descartada' con una nota obligatoria.
     * Solo permite operar sobre discrepancias que estén en estado 'pendiente'.
     */
    async resolverDiscrepancia(id, userId, estado, resolucion) {
        if (!['resuelta', 'descartada'].includes(estado)) {
            throw new Error('Estado inválido (debe ser "resuelta" o "descartada")');
        }
        if (!resolucion || !resolucion.trim()) {
            throw new Error('Debe indicar una nota de resolución');
        }
        const [result] = await db.query(
            `UPDATE transferencia_discrepancias
             SET estado = ?, resolucion = ?, resuelto_por = ?, fecha_resolucion = NOW()
             WHERE id = ? AND estado = 'pendiente'`,
            [estado, resolucion.trim(), userId, id]
        );
        if (result.affectedRows === 0) {
            throw new Error('Discrepancia no encontrada o ya no está pendiente');
        }
        return { id: Number(id), estado, resolucion: resolucion.trim() };
    }
};

module.exports = transferenciaService;

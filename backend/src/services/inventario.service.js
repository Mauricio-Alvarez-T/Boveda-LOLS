const db = require('../config/db');

const inventarioService = {
    /**
     * Resumen mensual: todos los ítems con cantidades por ubicación.
     * Devuelve estructura agrupada por categoría, con totales.
     */
    async getResumen(obraId = null) {
        // 1. Obtener todas las ubicaciones activas (obras + bodegas)
        const [obras] = await db.query('SELECT id, nombre FROM obras WHERE activa = 1 AND participa_inventario = 1 ORDER BY nombre');
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
                total: 0, // bodegas no facturan arriendo — campo presente para consistencia con getStockPorObra
                ubicacion_stock_id: item.ubicacion_stock_id
            });
            categorias[catKey].subtotal_cantidad += item.cantidad;
        });

        // Agregar subtotal_arriendo = 0 a cada categoría para consistencia de shape
        const categoriasFinal = Object.values(categorias)
            .map(c => ({ ...c, subtotal_arriendo: 0 }))
            .sort((a, b) => a.orden - b.orden);

        return {
            bodega,
            categorias: categoriasFinal
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
    },

    /**
     * Resumen ejecutivo para el dueño.
     * Una sola request agrega KPIs y listas cortas para el tablero:
     *  - transferencias pendientes, en tránsito
     *  - discrepancias pendientes (count + unidades perdidas)
     *  - valor total de inventario en obras (arriendo mensual)
     *  - top 5 obras por valor de arriendo
     *  - top 5 alertas ordenadas por urgencia (más antiguas primero)
     *
     * Todas las queries corren en paralelo para minimizar latencia.
     */
    async getDashboardEjecutivo() {
        const [
            [pendientesRows],
            [transitoRows],
            [discrepanciasRows],
            [valorObrasRows],
            [alertasPendientesRows],
            [alertasDiscrepRows],
            [alertasTransitoRows],
            [estancadosRows],
            [rechazosRows],
        ] = await Promise.all([
            // 1. Count transferencias pendientes
            db.query("SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'pendiente'"),
            // 2. Count transferencias en tránsito
            db.query("SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'en_transito'"),
            // 3. Discrepancias pendientes: count transferencias afectadas + unidades totales
            db.query(`
                SELECT COUNT(DISTINCT d.transferencia_id) as transferencias_afectadas,
                       COALESCE(SUM(ABS(d.diferencia)), 0) as unidades_totales
                FROM transferencia_discrepancias d
                JOIN transferencias t ON t.id = d.transferencia_id
                WHERE t.activo = 1 AND d.estado = 'pendiente'
            `),
            // 4. Valor total de arriendo por obra (usando override si existe, caso contrario valor_arriendo)
            //    Aplica descuento por obra si existe.
            db.query(`
                SELECT o.id, o.nombre,
                       COALESCE(SUM(us.cantidad * COALESCE(us.valor_arriendo_override, i.valor_arriendo)), 0) as subtotal_bruto,
                       COALESCE(d.porcentaje, 0) as descuento_porcentaje
                FROM obras o
                LEFT JOIN ubicaciones_stock us ON us.obra_id = o.id
                LEFT JOIN items_inventario i ON i.id = us.item_id AND i.activo = 1
                LEFT JOIN descuentos_obra d ON d.obra_id = o.id
                WHERE o.activa = 1 AND o.participa_inventario = 1
                GROUP BY o.id, o.nombre, d.porcentaje
                ORDER BY subtotal_bruto DESC
            `),
            // 5a. Alertas: transferencias pendientes más antiguas (top 5)
            db.query(`
                SELECT t.id, t.codigo, t.fecha_solicitud,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       us.nombre as solicitante_nombre,
                       (SELECT COUNT(*) FROM transferencia_items ti WHERE ti.transferencia_id = t.id) as items_count,
                       DATEDIFF(NOW(), t.fecha_solicitud) as dias
                FROM transferencias t
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                LEFT JOIN usuarios us ON t.solicitante_id = us.id
                WHERE t.activo = 1 AND t.estado = 'pendiente'
                ORDER BY t.fecha_solicitud ASC
                LIMIT 5
            `),
            // 5b. Alertas: discrepancias pendientes (top 5 transferencias)
            db.query(`
                SELECT t.id, t.codigo, t.fecha_recepcion,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       COUNT(d.id) as items_con_discrepancia,
                       COALESCE(SUM(ABS(d.diferencia)), 0) as unidades,
                       DATEDIFF(NOW(), t.fecha_recepcion) as dias
                FROM transferencias t
                INNER JOIN transferencia_discrepancias d ON d.transferencia_id = t.id AND d.estado = 'pendiente'
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                WHERE t.activo = 1
                GROUP BY t.id, t.codigo, t.fecha_recepcion, oo.nombre, ob.nombre, do2.nombre, db2.nombre
                ORDER BY t.fecha_recepcion ASC
                LIMIT 5
            `),
            // 5c. Alertas: transferencias en tránsito estancadas (>2 días, top 5 más antiguas)
            db.query(`
                SELECT t.id, t.codigo, t.fecha_despacho,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       DATEDIFF(NOW(), t.fecha_despacho) as dias
                FROM transferencias t
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                WHERE t.activo = 1 AND t.estado = 'en_transito'
                  AND DATEDIFF(NOW(), t.fecha_despacho) >= 2
                ORDER BY t.fecha_despacho ASC
                LIMIT 5
            `),
            // 6. KPI: en tránsito estancados ≥7 días
            db.query(`
                SELECT COUNT(*) as count
                FROM transferencias
                WHERE activo = 1 AND estado = 'en_transito'
                  AND DATEDIFF(NOW(), fecha_despacho) >= 7
            `),
            // 7. Rechazos recientes (últimos 7 días, máx 8)
            db.query(`
                SELECT t.id, t.codigo, t.fecha_aprobacion,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       t.observaciones_rechazo,
                       us.nombre as rechazado_por_nombre,
                       DATEDIFF(NOW(), t.fecha_aprobacion) as dias
                FROM transferencias t
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                LEFT JOIN usuarios us ON t.aprobador_id = us.id
                WHERE t.activo = 1 AND t.estado = 'rechazada'
                  AND t.fecha_aprobacion >= NOW() - INTERVAL 7 DAY
                ORDER BY t.fecha_aprobacion DESC
                LIMIT 8
            `),
        ]);

        // Normalizar valor por obra aplicando descuento
        const obrasConValor = valorObrasRows.map(r => {
            const bruto = Number(r.subtotal_bruto) || 0;
            const desc = Number(r.descuento_porcentaje) || 0;
            const neto = bruto * (1 - desc / 100);
            return { obra_id: r.id, nombre: r.nombre, valor_mensual: neto, valor_bruto: bruto, descuento_porcentaje: desc };
        });
        const valor_total_obras = obrasConValor.reduce((s, o) => s + o.valor_mensual, 0);
        const top_obras = obrasConValor.filter(o => o.valor_mensual > 0).slice(0, 5);

        // Componer alertas, unificadas por tipo
        const formatUbic = (obra, bodega) => obra || bodega || '—';
        const alertas = [];

        alertasPendientesRows.forEach(r => {
            alertas.push({
                tipo: 'pendiente',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                titulo: `${r.codigo} espera tu aprobación`,
                detalle: `${formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre)} → ${formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre)} · ${r.items_count} ítems`,
                solicitante: r.solicitante_nombre || null,
            });
        });

        alertasDiscrepRows.forEach(r => {
            alertas.push({
                tipo: 'discrepancia',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                titulo: `${r.codigo} tiene discrepancia`,
                detalle: `${Number(r.unidades)} u. afectadas en ${r.items_con_discrepancia} ítem(s) · ${formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre)} → ${formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre)}`,
            });
        });

        alertasTransitoRows.forEach(r => {
            alertas.push({
                tipo: 'transito',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                titulo: `${r.codigo} lleva ${Number(r.dias)} día(s) en tránsito`,
                detalle: `${formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre)} → ${formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre)}`,
            });
        });

        // Orden final: prioridad discrepancia > pendiente > tránsito, dentro por días desc. Máx 8.
        const prio = { discrepancia: 0, pendiente: 1, transito: 2 };
        alertas.sort((a, b) => {
            if (prio[a.tipo] !== prio[b.tipo]) return prio[a.tipo] - prio[b.tipo];
            return (b.dias || 0) - (a.dias || 0);
        });

        // Rechazos recientes normalizados
        const rechazos_recientes = rechazosRows.map(r => ({
            transferencia_id: r.id,
            codigo: r.codigo,
            dias: Number(r.dias) || 0,
            origen: formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre),
            destino: formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre),
            observaciones_rechazo: r.observaciones_rechazo || null,
            rechazado_por: r.rechazado_por_nombre || null,
        }));

        return {
            kpis: {
                transferencias_pendientes: Number(pendientesRows[0]?.count) || 0,
                transferencias_en_transito: Number(transitoRows[0]?.count) || 0,
                discrepancias_pendientes: {
                    transferencias_afectadas: Number(discrepanciasRows[0]?.transferencias_afectadas) || 0,
                    unidades_totales: Number(discrepanciasRows[0]?.unidades_totales) || 0,
                },
                valor_total_obras: Number(valor_total_obras) || 0,
                estancados_transito: Number(estancadosRows[0]?.count) || 0,
            },
            top_obras,
            alertas: alertas.slice(0, 8),
            rechazos_recientes,
        };
    },

    /**
     * Stock por ítems: dada una lista de item_ids, retorna en qué ubicaciones hay stock > 0.
     * Usado por el aprobador de transferencias para ver dónde hay disponibilidad.
     */
    async getStockPorItems(itemIds) {
        if (!itemIds || !itemIds.length) return {};

        const [rows] = await db.query(`
            SELECT us.item_id, us.obra_id, us.bodega_id, us.cantidad,
                   o.nombre AS obra_nombre, b.nombre AS bodega_nombre
            FROM ubicaciones_stock us
            LEFT JOIN obras o ON us.obra_id = o.id
            LEFT JOIN bodegas b ON us.bodega_id = b.id
            WHERE us.item_id IN (?) AND us.cantidad > 0
            ORDER BY us.item_id, us.cantidad DESC
        `, [itemIds]);

        const result = {};
        for (const row of rows) {
            if (!result[row.item_id]) result[row.item_id] = [];
            result[row.item_id].push({
                type: row.obra_id ? 'obra' : 'bodega',
                id: row.obra_id || row.bodega_id,
                nombre: row.obra_nombre || row.bodega_nombre,
                cantidad: row.cantidad,
            });
        }
        return result;
    }
};

module.exports = inventarioService;

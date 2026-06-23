const db = require('../config/db');
const { getDescuentoMap, getDescuentoForObra } = require('../utils/descuentoMap');
const { registrarMovimiento } = require('./stockMovimiento.service');

// Excluye transferencias que toquen una obra de prueba (origen o destino).
// NULL-safe (origen/destino puede ser bodega → obra_id NULL). `pre` = prefijo
// del alias de la tabla transferencias ('' si no hay alias, 't.' si lo hay).
const _exclTransfPrueba = (pre = '') =>
    ` AND (${pre}origen_obra_id IS NULL OR ${pre}origen_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))` +
    ` AND (${pre}destino_obra_id IS NULL OR ${pre}destino_obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))`;

const inventarioService = {
    /**
     * Resumen mensual: todos los ítems con cantidades por ubicación.
     * Devuelve estructura agrupada por categoría, con totales.
     */
    async getResumen(obraId = null) {
        // 1+2+3+5: traer obras, bodegas, items, stock y descuentos en paralelo
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

        const [
            [obras],
            [bodegas],
            [items],
            [stock],
            descuentoMapInstance,
        ] = await Promise.all([
            db.query('SELECT id, nombre FROM obras WHERE activa = 1 AND es_prueba = 0 AND finalizada = 0 AND participa_inventario = 1 ORDER BY nombre'),
            db.query('SELECT id, nombre, responsable_nombre FROM bodegas WHERE activa = 1 AND participa_inventario = 1 ORDER BY nombre'),
            db.query(`
                SELECT i.*, c.nombre as categoria_nombre, c.orden as categoria_orden
                FROM items_inventario i
                JOIN categorias_inventario c ON i.categoria_id = c.id
                WHERE i.activo = 1
                ORDER BY c.orden ASC, i.descripcion ASC
            `),
            db.query(stockQuery, stockParams),
            // Helper compartido (utils/descuentoMap) — antes inline query duplicada con getStockPorObra
            getDescuentoMap(db),
        ]);

        // 4. Indexar stock por item_id en una sola pasada usando Map (lookup O(1) más eficiente que objeto plain)
        const stockMap = new Map();
        for (const s of stock) {
            let inner = stockMap.get(s.item_id);
            if (!inner) {
                inner = new Map();
                stockMap.set(s.item_id, inner);
            }
            const key = s.obra_id ? `obra_${s.obra_id}` : `bodega_${s.bodega_id}`;
            // Mig 052 cambió cantidad INT → DECIMAL(12,4). mysql2 retorna DECIMAL
            // como string ("10.0000") por defecto → al sumar con `+` concatenaba
            // en lugar de sumar (bug visible: header categoría mostraba
            // "0010.00001.00001..." en vez de la suma).
            inner.set(key, { cantidad: Number(s.cantidad) || 0, override: s.valor_arriendo_override });
        }

        // Helper retorna Map; convertimos a objeto plain para mantener compat con:
        // (a) acceso `descuentoMap[oid]` en loop de totales abajo
        // (b) serialización JSON en `descuentos: descuentoMap` (Map → {} en JSON.stringify)
        const descuentoMap = {};
        for (const [obraId, pct] of descuentoMapInstance) {
            descuentoMap[obraId] = pct;
        }

        // Pre-extraer arrays planos de IDs para evitar acceso repetido en loops calientes
        const obraIds = obras.map(o => o.id);
        const bodegaIds = bodegas.map(b => b.id);

        // 6. Construir resultado agrupado por categoría
        const categorias = new Map();

        for (const item of items) {
            let cat = categorias.get(item.categoria_id);
            if (!cat) {
                cat = {
                    id: item.categoria_id,
                    nombre: item.categoria_nombre,
                    orden: item.categoria_orden,
                    items: [],
                };
                categorias.set(item.categoria_id, cat);
            }

            const itemStock = stockMap.get(item.id);
            const valorArriendoBase = parseFloat(item.valor_arriendo);
            const ubicaciones = {};
            let totalArriendo = 0;
            let totalCantidad = 0;

            // Por cada obra (solo lookup en stockMap, sin parsear el valor_arriendo en cada vuelta)
            for (const oid of obraIds) {
                const s = itemStock ? itemStock.get(`obra_${oid}`) : undefined;
                const cant = s ? s.cantidad : 0;
                const arriendo = s && s.override != null ? parseFloat(s.override) : valorArriendoBase;
                const m2Factor = item.m2 ? parseFloat(item.m2) : 1;
                const total = cant * arriendo * m2Factor;
                ubicaciones[`obra_${oid}`] = { cantidad: cant, total };
                totalArriendo += total;
                totalCantidad += cant;
            }

            // Por cada bodega (no facturan arriendo)
            for (const bid of bodegaIds) {
                const s = itemStock ? itemStock.get(`bodega_${bid}`) : undefined;
                const cant = s ? s.cantidad : 0;
                ubicaciones[`bodega_${bid}`] = { cantidad: cant, total: 0 };
                totalCantidad += cant;
            }

            cat.items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_compra: parseFloat(item.valor_compra),
                valor_arriendo: valorArriendoBase,
                unidad: item.unidad,
                imagen_url: item.imagen_url ? (item.imagen_url.startsWith('/api/') ? item.imagen_url : `/api${item.imagen_url}`) : null,
                ubicaciones,
                total_arriendo: totalArriendo,
                total_cantidad: totalCantidad,
            });
        }

        // Auditoría 6.1: calcular totales en backend para que coincidan exactamente
        // con los KPIs del dashboard. Antes el frontend hacía
        // `totalDescuento += (obraArriendo * desc / 100)` con floats JS, y eso podía
        // diferir del cálculo NETO del dashboard en algunos pesos.
        // Calculamos por-obra primero (necesario porque descuento es por obra).
        let valorBruto = 0;
        let valorDescuento = 0;
        let totalCantidad = 0;
        for (const cat of categorias.values()) {
            for (const item of cat.items) {
                totalCantidad += item.total_cantidad;
                for (const oid of obraIds) {
                    const cellTotal = item.ubicaciones[`obra_${oid}`]?.total || 0;
                    valorBruto += cellTotal;
                    const desc = descuentoMap[oid] || 0;
                    valorDescuento += cellTotal * desc / 100;
                }
            }
        }

        return {
            obras: obras.map(o => ({ id: o.id, nombre: o.nombre })),
            // mig 060: incluir responsable_nombre para que la UI lo muestre en
            // dropdowns y headers (formatBodegaConResponsable).
            bodegas: bodegas.map(b => ({ id: b.id, nombre: b.nombre, responsable_nombre: b.responsable_nombre })),
            categorias: Array.from(categorias.values()).sort((a, b) => a.orden - b.orden),
            descuentos: descuentoMap,
            totales: {
                valor_bruto: valorBruto,
                valor_descuento: valorDescuento,
                valor_neto: valorBruto - valorDescuento,
                total_cantidad: totalCantidad,
            },
        };
    },

    /**
     * Stock detallado de una obra específica (vista tipo hoja Excel por obra).
     */
    async getStockPorObra(obraId) {
        // Auditoría 6.3.A: rechazar obras inactivas — antes seguían visibles y
        // sus descuentos persistían sin que la UI lo advirtiera.
        const [obraRows] = await db.query(
            'SELECT id, nombre FROM obras WHERE id = ? AND activa = 1',
            [obraId]
        );
        if (!obraRows.length) {
            const err = new Error('Obra no encontrada o inactiva');
            err.statusCode = 404;
            throw err;
        }
        const obra = obraRows[0];

        const [items] = await db.query(`
            SELECT i.id, i.nro_item, i.descripcion, i.m2, i.valor_arriendo, i.unidad,
                   c.nombre as categoria_nombre, c.id as categoria_id, c.orden as categoria_orden,
                   COALESCE(us.cantidad, 0) as cantidad,
                   us.valor_arriendo_override,
                   us.id as ubicacion_stock_id
            FROM items_inventario i
            JOIN categorias_inventario c ON i.categoria_id = c.id
            LEFT JOIN ubicaciones_stock us ON us.item_id = i.id AND us.obra_id = ? AND us.bodega_id IS NULL
            WHERE i.activo = 1
            ORDER BY c.orden ASC, i.descripcion ASC
        `, [obraId]);

        // Descuento (helper compartido — antes inline duplicado con getResumen)
        const descuento = await getDescuentoForObra(db, obraId);

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

            // Mig 052: cantidad ahora es DECIMAL → mysql2 retorna string.
            // Convertir a Number explícitamente para evitar concatenación en `+=`.
            const cantidad = Number(item.cantidad) || 0;
            const arriendo = item.valor_arriendo_override != null
                ? parseFloat(item.valor_arriendo_override)
                : parseFloat(item.valor_arriendo);
            const m2Factor = item.m2 ? parseFloat(item.m2) : 1;
            const total = cantidad * arriendo * m2Factor;

            categorias[catKey].items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_arriendo: arriendo,
                unidad: item.unidad,
                cantidad,
                total,
                ubicacion_stock_id: item.ubicacion_stock_id
            });

            categorias[catKey].subtotal_cantidad += cantidad;
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
            LEFT JOIN ubicaciones_stock us ON us.item_id = i.id AND us.bodega_id = ? AND us.obra_id IS NULL
            WHERE i.activo = 1
            ORDER BY c.orden ASC, i.descripcion ASC
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
            // Mig 052: cantidad DECIMAL → string; convertir antes de sumar.
            const cantidad = Number(item.cantidad) || 0;
            categorias[catKey].items.push({
                id: item.id,
                nro_item: item.nro_item,
                descripcion: item.descripcion,
                m2: item.m2 ? parseFloat(item.m2) : null,
                valor_arriendo: parseFloat(item.valor_arriendo),
                unidad: item.unidad,
                cantidad,
                total: 0, // bodegas no facturan arriendo — campo presente para consistencia con getStockPorObra
                ubicacion_stock_id: item.ubicacion_stock_id
            });
            categorias[catKey].subtotal_cantidad += cantidad;
        });

        // Agregar subtotal_arriendo = 0 a cada categoría para consistencia de shape
        const categoriasFinal = Object.values(categorias)
            .map(c => ({ ...c, subtotal_arriendo: 0 }))
            .sort((a, b) => a.orden - b.orden);

        // Auditoría 6.2: homologar shape con getStockPorObra. Bodegas no facturan
        // arriendo (no aplican descuento), pero devolver los campos en 0 evita
        // que el frontend tenga que hardcodear defaults dispersos.
        return {
            bodega,
            categorias: categoriasFinal,
            total_facturacion: 0,
            descuento_porcentaje: 0,
            descuento_monto: 0,
            total_con_descuento: 0
        };
    },

    /**
     * Actualizar stock de una ubicación (edición inline).
     * Upsert: si no existe la fila en ubicaciones_stock, la crea.
     *
     * Fase 13 (kardex): cuando cambia `cantidad`, registra un movimiento
     * `ajuste_manual` en stock_movimientos con el delta antes→después. Todo
     * dentro de una transacción para que stock + kardex sean atómicos.
     *
     * @param {number} itemId
     * @param {number|null} obraId
     * @param {number|null} bodegaId
     * @param {object} payload  { cantidad, valorArriendoOverride, usuarioId, motivo }
     */
    async actualizarStock(itemId, obraId, bodegaId, { cantidad, valorArriendoOverride, usuarioId = null, motivo = null }) {
        // ── XOR check: ubicación = obra XOR bodega (mig 050) ──
        // Schema acepta cualquier combinación pero semánticamente es exclusivo.
        // Sin esta validación los flujos podían crear rows huérfanas (ambos NULL)
        // o duplicadas (ambos seteados) que aparecían 2× en la vista Por Obra/Bodega.
        const hasObra = obraId != null && Number(obraId) > 0;
        const hasBodega = bodegaId != null && Number(bodegaId) > 0;
        if (hasObra === hasBodega) {
            const err = new Error('Debe especificar exactamente uno: obra_id o bodega_id');
            err.statusCode = 400;
            throw err;
        }

        // Auditoría 3.2 + Fase 11: validar rangos antes del UPSERT.
        // Acepta DECIMAL (mig 052 cambió cantidad a DECIMAL(12,4) para soportar
        // unidades como kg/ton/m³). Tope subido a 9999999 (7 dígitos) para casos
        // de inventario en peso/volumen donde 999999 quedaba corto.
        if (cantidad !== undefined && cantidad !== null) {
            const num = Number(cantidad);
            if (!Number.isFinite(num) || num < 0 || num > 9999999) {
                const err = new Error('cantidad debe ser un número entre 0 y 9999999');
                err.statusCode = 400;
                throw err;
            }
        }
        if (valorArriendoOverride !== undefined && valorArriendoOverride !== null) {
            const num = Number(valorArriendoOverride);
            if (!Number.isFinite(num) || num < 0) {
                const err = new Error('valor_arriendo_override debe ser >= 0');
                err.statusCode = 400;
                throw err;
            }
        }

        const updates = {};
        if (cantidad !== undefined) updates.cantidad = cantidad;
        if (valorArriendoOverride !== undefined) updates.valor_arriendo_override = valorArriendoOverride;

        if (Object.keys(updates).length === 0) throw new Error('Nada que actualizar');

        const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
        const values = Object.values(updates);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // FOR UPDATE: lockea la fila para leer cantidad previa y evitar
            // races con otros ajustes/transferencias sobre el mismo stock.
            const [existing] = await conn.query(
                'SELECT id, cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ? FOR UPDATE',
                [itemId, obraId || null, bodegaId || null]
            );

            let stockId;
            let cantidadAnterior;
            if (existing.length) {
                cantidadAnterior = Number(existing[0].cantidad) || 0;
                await conn.query(
                    `UPDATE ubicaciones_stock SET ${setClauses} WHERE id = ?`,
                    [...values, existing[0].id]
                );
                stockId = existing[0].id;
            } else {
                cantidadAnterior = 0;
                const [result] = await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                     VALUES (?, ?, ?, ?, ?)`,
                    [itemId, obraId || null, bodegaId || null, cantidad || 0, valorArriendoOverride || null]
                );
                stockId = result.insertId;
            }

            // Kardex: solo si cambió la cantidad (override no genera movimiento).
            if (cantidad !== undefined && cantidad !== null) {
                const cantidadNueva = Number(cantidad) || 0;
                await registrarMovimiento(conn, {
                    item_id: itemId,
                    obra_id: obraId || null,
                    bodega_id: bodegaId || null,
                    tipo: 'ajuste_manual',
                    cantidad_anterior: cantidadAnterior,
                    cantidad_nueva: cantidadNueva,
                    motivo,
                    usuario_id: usuarioId,
                });
            }

            await conn.commit();
            return { id: stockId, ...updates };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Actualizar descuento de una obra.
     */
    async actualizarDescuento(obraId, porcentaje) {
        // Auditoría 6.3.B: validar rango [0, 100]. Antes solo bloqueaba negativos
        // por validateBody en routes, pero >100 pasaba al backend y producía
        // monto_descuento > total_facturacion (descuento absurdo).
        const num = Number(porcentaje);
        if (!Number.isFinite(num) || num < 0 || num > 100) {
            const err = new Error('porcentaje debe estar entre 0 y 100');
            err.statusCode = 400;
            throw err;
        }
        await db.query(
            `INSERT INTO descuentos_obra (obra_id, porcentaje) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE porcentaje = VALUES(porcentaje)`,
            [obraId, num]
        );
        return { obra_id: obraId, porcentaje: num };
    },

    /**
     * Kardex: historial de movimientos de stock (Fase 13).
     * Filtros opcionales: obra_id, bodega_id, item_id, tipo, desde, hasta.
     * Paginado. Devuelve filas enriquecidas con nombres de item/ubicación/usuario.
     */
    async getMovimientos(query = {}) {
        const { obra_id, bodega_id, item_id, tipo, desde, hasta } = query;
        const page = Math.max(1, Number(query.page) || 1);
        const limit = Math.min(200, Math.max(1, Number(query.limit) || 50));
        const offset = (page - 1) * limit;

        const where = [];
        const params = [];
        if (obra_id) { where.push('m.obra_id = ?'); params.push(Number(obra_id)); }
        if (bodega_id) { where.push('m.bodega_id = ?'); params.push(Number(bodega_id)); }
        if (item_id) { where.push('m.item_id = ?'); params.push(Number(item_id)); }
        if (tipo) { where.push('m.tipo = ?'); params.push(tipo); }
        if (desde) { where.push('m.created_at >= ?'); params.push(`${desde} 00:00:00`); }
        if (hasta) { where.push('m.created_at <= ?'); params.push(`${hasta} 23:59:59`); }
        // Aislamiento: excluir movimientos de obras de prueba (NULL-safe: obra_id
        // puede ser NULL si el movimiento es de bodega). Subconsulta sobre la
        // columna base para que funcione también en el COUNT (sin join a obras).
        where.push('(m.obra_id IS NULL OR m.obra_id NOT IN (SELECT id FROM obras WHERE es_prueba = 1 OR finalizada = 1))');
        const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

        const [rows] = await db.query(`
            SELECT m.id, m.item_id, m.obra_id, m.bodega_id, m.tipo,
                   m.cantidad_anterior, m.cantidad_nueva, m.delta,
                   m.referencia_tipo, m.referencia_id, m.motivo,
                   m.usuario_id, m.created_at,
                   i.nro_item, i.descripcion AS item_descripcion, i.unidad,
                   o.nombre AS obra_nombre, b.nombre AS bodega_nombre,
                   u.nombre AS usuario_nombre
            FROM stock_movimientos m
            JOIN items_inventario i ON i.id = m.item_id
            LEFT JOIN obras o ON o.id = m.obra_id
            LEFT JOIN bodegas b ON b.id = m.bodega_id
            LEFT JOIN usuarios u ON u.id = m.usuario_id
            ${whereClause}
            ORDER BY m.created_at DESC, m.id DESC
            LIMIT ? OFFSET ?
        `, [...params, limit, offset]);

        const [countRows] = await db.query(
            `SELECT COUNT(*) AS total FROM stock_movimientos m ${whereClause}`,
            params
        );

        return {
            data: rows,
            pagination: {
                page,
                limit,
                total: countRows[0].total,
                pages: Math.ceil(countRows[0].total / limit),
            },
        };
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
    async getDashboardEjecutivo(obraId = null, options = {}) {
        // Auditoría 3.7: top obras configurable. Default 5 conserva contrato existente.
        // Clamp [1, 50] para evitar payloads gigantes accidentales.
        const rawLimit = Number(options.topObrasLimit);
        const topObrasLimit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.max(Math.trunc(rawLimit), 1), 50)
            : 5;
        // Filtro condicional para queries que tocan transferencias.
        // Una transferencia "pertenece" a la obra si la obra es origen O destino.
        const obraIdNum = obraId ? Number(obraId) : null;
        const tFilter = obraIdNum ? 'AND (t.origen_obra_id = ? OR t.destino_obra_id = ?)' : '';
        const tParams = obraIdNum ? [obraIdNum, obraIdNum] : [];
        // Para query 1/2/6 (sin alias t), usan tabla directa
        const directFilter = obraIdNum ? 'AND (origen_obra_id = ? OR destino_obra_id = ?)' : '';
        const directParams = tParams;

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
            [snapshotsRows],
            [categoriaRows],
            [bombasRows],
            [faltantesRows],
            [vehiculosPorEmpresaRows],
            [inversionVehiculosRows],
        ] = await Promise.all([
            // 1. Count transferencias pendientes
            db.query(`SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'pendiente' ${directFilter} ${_exclTransfPrueba()}`, directParams),
            // 2. Count transferencias en tránsito
            db.query(`SELECT COUNT(*) as count FROM transferencias WHERE activo = 1 AND estado = 'en_transito' ${directFilter} ${_exclTransfPrueba()}`, directParams),
            // 3. Discrepancias pendientes: count transferencias afectadas + unidades totales
            db.query(`
                SELECT COUNT(DISTINCT d.transferencia_id) as transferencias_afectadas,
                       COALESCE(SUM(ABS(d.diferencia)), 0) as unidades_totales
                FROM transferencia_discrepancias d
                JOIN transferencias t ON t.id = d.transferencia_id
                WHERE t.activo = 1 AND d.estado = 'pendiente' ${tFilter} ${_exclTransfPrueba('t.')}
            `, tParams),
            // 4. Valor total de arriendo por obra (usando override si existe, caso contrario valor_arriendo)
            //    Auditoría 6.1: el cálculo NETO se hace en SQL (igual que query 9 del donut)
            //    para que ambos caminos den el mismo total al peso. Antes calculaba BRUTO
            //    y el frontend restaba descuento en JS con precisión float distinta a SQL.
            //    GROUP BY simplificado (d.porcentaje era redundante: descuentos_obra UNIQUE(obra_id)).
            db.query(`
                SELECT o.id, o.nombre,
                       COALESCE(SUM(
                           us.cantidad
                           * COALESCE(us.valor_arriendo_override, i.valor_arriendo)
                           * (1 - COALESCE(d.porcentaje, 0) / 100)
                       ), 0) as valor_neto,
                       COALESCE(SUM(us.cantidad * COALESCE(us.valor_arriendo_override, i.valor_arriendo)), 0) as valor_bruto,
                       COALESCE(SUM(us.cantidad * i.valor_compra), 0) as valor_patrimonial,
                       COALESCE(d.porcentaje, 0) as descuento_porcentaje
                FROM obras o
                LEFT JOIN ubicaciones_stock us ON us.obra_id = o.id
                LEFT JOIN items_inventario i ON i.id = us.item_id AND i.activo = 1
                LEFT JOIN descuentos_obra d ON d.obra_id = o.id
                WHERE o.activa = 1 AND o.es_prueba = 0 AND o.finalizada = 0 AND o.participa_inventario = 1 ${obraIdNum ? 'AND o.id = ?' : ''}
                GROUP BY o.id, o.nombre
                ORDER BY valor_neto DESC
            `, obraIdNum ? [obraIdNum] : []),
            // 5a. Alertas: transferencias pendientes más antiguas (top 5).
            // Auditoría perf: items_count via COUNT(ti.id) agregado en lugar de
            // subquery correlacionada (antes ejecutaba 1 subquery por fila).
            db.query(`
                SELECT t.id, t.codigo, t.fecha_solicitud, t.prorroga_hasta,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       us.nombre as solicitante_nombre,
                       COUNT(ti.id) as items_count,
                       DATEDIFF(NOW(), t.fecha_solicitud) as dias,
                       -- Días que faltan hasta el límite (10 desde solicitud, o prórroga).
                       -- Si es negativo o 0, la solicitud está estancada.
                       DATEDIFF(COALESCE(t.prorroga_hasta, DATE_ADD(DATE(t.fecha_solicitud), INTERVAL 10 DAY)), CURDATE()) as dias_hasta_limite
                FROM transferencias t
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                LEFT JOIN usuarios us ON t.solicitante_id = us.id
                LEFT JOIN transferencia_items ti ON ti.transferencia_id = t.id
                WHERE t.activo = 1 AND t.estado = 'pendiente' ${tFilter} ${_exclTransfPrueba('t.')}
                GROUP BY t.id, t.codigo, t.fecha_solicitud, t.prorroga_hasta,
                         oo.nombre, ob.nombre, do2.nombre, db2.nombre, us.nombre
                ORDER BY t.fecha_solicitud ASC
                LIMIT 5
            `, tParams),
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
                WHERE t.activo = 1 ${tFilter} ${_exclTransfPrueba('t.')}
                GROUP BY t.id, t.codigo, t.fecha_recepcion, oo.nombre, ob.nombre, do2.nombre, db2.nombre
                ORDER BY t.fecha_recepcion ASC
                LIMIT 5
            `, tParams),
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
                  AND DATEDIFF(NOW(), t.fecha_despacho) >= 2 ${tFilter} ${_exclTransfPrueba('t.')}
                ORDER BY t.fecha_despacho ASC
                LIMIT 5
            `, tParams),
            // 6. KPI: en tránsito estancados ≥10 días (umbral definido por jefatura)
            db.query(`
                SELECT COUNT(*) as count
                FROM transferencias
                WHERE activo = 1 AND estado = 'en_transito'
                  AND DATEDIFF(NOW(), fecha_despacho) >= 10 ${directFilter} ${_exclTransfPrueba()}
            `, directParams),
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
                  AND t.fecha_aprobacion >= NOW() - INTERVAL 7 DAY ${tFilter} ${_exclTransfPrueba('t.')}
                ORDER BY t.fecha_aprobacion DESC
                LIMIT 8
            `, tParams),
            // 8. Snapshots últimos 31 días — son globales, no se filtran por obra.
            //    Cuando hay obraId, devolvemos vacío (sparklines + comparativa apagados en UI).
            obraIdNum
                ? Promise.resolve([[]])
                : db.query(`
                    SELECT fecha, kpi, valor
                    FROM dashboard_kpi_snapshots
                    WHERE fecha >= DATE_SUB(CURDATE(), INTERVAL 31 DAY)
                    ORDER BY fecha ASC
                `),
            // 9. Valor arriendo mensual agrupado por categoría de item (para donut)
            //    Solo stock en obras con participa_inventario, aplicando descuento por obra.
            db.query(`
                SELECT c.id, c.nombre, c.orden,
                       COALESCE(SUM(
                           us.cantidad
                           * COALESCE(us.valor_arriendo_override, i.valor_arriendo)
                           * (1 - COALESCE(d.porcentaje, 0) / 100)
                       ), 0) as valor_neto
                FROM categorias_inventario c
                LEFT JOIN items_inventario i ON i.categoria_id = c.id AND i.activo = 1
                LEFT JOIN ubicaciones_stock us ON us.item_id = i.id AND us.obra_id IS NOT NULL
                    ${obraIdNum ? 'AND us.obra_id = ?' : ''}
                LEFT JOIN obras o ON us.obra_id = o.id AND o.activa = 1 AND o.es_prueba = 0 AND o.finalizada = 0 AND o.participa_inventario = 1
                LEFT JOIN descuentos_obra d ON d.obra_id = o.id
                GROUP BY c.id, c.nombre, c.orden
                ORDER BY c.orden ASC
            `, obraIdNum ? [obraIdNum] : []),
            // 10. Bombas de hormigón: stats del mes actual (eventos + obras únicas + costo externo)
            db.query(`
                SELECT
                    COUNT(*) as eventos,
                    COUNT(DISTINCT obra_id) as obras_distintas,
                    COALESCE(SUM(CASE WHEN es_externa = 1 THEN costo ELSE 0 END), 0) as costo_externo
                FROM registro_bombas_hormigon
                WHERE activo = 1
                  AND YEAR(fecha) = YEAR(CURDATE())
                  AND MONTH(fecha) = MONTH(CURDATE())
                  ${obraIdNum ? 'AND obra_id = ?' : ''}
            `, obraIdNum ? [obraIdNum] : []),
            // 11. Faltantes sin decisión: transferencias aprobadas/en tránsito con
            //     cantidad enviada < solicitada (parcial) que NO generaron una
            //     solicitud de faltante (no existe hija con es_faltante_de_id).
            //     El aprobador debe decidir: crear faltante o dejar así.
            db.query(`
                SELECT t.id, t.codigo, t.fecha_aprobacion,
                       oo.nombre as origen_obra_nombre, ob.nombre as origen_bodega_nombre,
                       do2.nombre as destino_obra_nombre, db2.nombre as destino_bodega_nombre,
                       SUM(GREATEST(ti.cantidad_solicitada - COALESCE(ti.cantidad_enviada, 0), 0)) as unidades_faltantes,
                       DATEDIFF(NOW(), t.fecha_aprobacion) as dias
                FROM transferencias t
                JOIN transferencia_items ti ON ti.transferencia_id = t.id
                LEFT JOIN obras oo ON t.origen_obra_id = oo.id
                LEFT JOIN bodegas ob ON t.origen_bodega_id = ob.id
                LEFT JOIN obras do2 ON t.destino_obra_id = do2.id
                LEFT JOIN bodegas db2 ON t.destino_bodega_id = db2.id
                WHERE t.activo = 1 AND t.estado IN ('aprobada', 'en_transito')
                  AND NOT EXISTS (SELECT 1 FROM transferencias f WHERE f.es_faltante_de_id = t.id)
                  ${tFilter} ${_exclTransfPrueba('t.')}
                GROUP BY t.id, t.codigo, t.fecha_aprobacion,
                         oo.nombre, ob.nombre, do2.nombre, db2.nombre
                HAVING unidades_faltantes > 0
                ORDER BY t.fecha_aprobacion ASC
                LIMIT 5
            `, tParams),
            // 12. Patrimonio de vehículos por empresa de flota (paramétrico).
            //     Σ(vehiculos.valor) agrupado por empresa_vehiculos activa. Es global
            //     (los vehículos no se asocian a una obra), no usa el filtro de obra.
            db.query(`
                SELECT ev.id, ev.nombre, ev.color,
                       COALESCE(SUM(v.valor), 0) as valor
                FROM empresas_vehiculos ev
                LEFT JOIN vehiculos v ON v.empresa_id = ev.id AND v.activo = 1
                WHERE ev.activo = 1
                GROUP BY ev.id, ev.nombre, ev.color
                ORDER BY ev.nombre ASC
            `),
            // 13. Inversión por vehículo (treemap): cada vehículo con valor > 0,
            //     con su empresa y color. Global (no usa filtro de obra).
            db.query(`
                SELECT v.id, v.patente, v.marca, v.tipo, v.valor, ev.nombre AS empresa, ev.color
                FROM vehiculos v
                LEFT JOIN empresas_vehiculos ev ON ev.id = v.empresa_id
                WHERE v.activo = 1 AND v.valor > 0
                ORDER BY v.valor DESC
            `),
        ]);

        // Auditoría 6.1: el backend ya devuelve valor_neto y valor_bruto calculados en SQL.
        // No recalculamos en JS para que coincida exactamente con la query 9 (donut por categoría).
        const obrasConValor = valorObrasRows.map(r => {
            const neto = Number(r.valor_neto) || 0;
            const bruto = Number(r.valor_bruto) || 0;
            const desc = Number(r.descuento_porcentaje) || 0;
            const patrimonial = Number(r.valor_patrimonial) || 0;
            return { obra_id: r.id, nombre: r.nombre, valor_mensual: neto, valor_bruto: bruto, descuento_porcentaje: desc, valor_patrimonial: patrimonial };
        });
        const valor_total_obras = obrasConValor.reduce((s, o) => s + o.valor_mensual, 0);
        // Patrimonio (valor de activo) dividido por empresa propietaria:
        //   · Dedalius = todo el inventario (Σ cantidad × valor_compra), sin descuento.
        //   · cada empresa de flota = Σ valor de sus vehículos (paramétrico).
        // El total es la suma de las tres+ empresas.
        const patrimonio_dedalius = obrasConValor.reduce((s, o) => s + o.valor_patrimonial, 0);
        // Los vehículos son globales (no por obra): solo se suman en la vista "Todas las obras".
        const patrimonio_vehiculos = obraIdNum ? [] : (vehiculosPorEmpresaRows || []).map(r => ({
            nombre: r.nombre,
            color: r.color || '#64748b',
            tipo: 'vehiculos',
            valor: Number(r.valor) || 0,
        }));
        const patrimonio_por_empresa = [
            { nombre: 'Dedalius', color: '#0F6E56', tipo: 'inventario', valor: patrimonio_dedalius },
            ...patrimonio_vehiculos,
        ];
        const valor_total_patrimonio = patrimonio_por_empresa.reduce((s, e) => s + e.valor, 0);
        // Inversión por vehículo (treemap). Global → vacío al filtrar por una obra.
        const inversion_vehiculos = obraIdNum ? [] : (inversionVehiculosRows || []).map(r => ({
            label: `${r.patente}${r.marca ? ' · ' + r.marca : ''}`,
            valor: Number(r.valor) || 0,
            empresa: r.empresa || 'Sin empresa',
            color: r.color || '#64748b',
            tipo: r.tipo || 'otro',
        }));
        // Cuando hay filtro por obra, el "ranking" pierde sentido (es una sola obra) → vacío.
        const top_obras = obraIdNum
            ? []
            : obrasConValor.filter(o => o.valor_mensual > 0).slice(0, topObrasLimit);

        // Componer alertas, unificadas por tipo
        const formatUbic = (obra, bodega) => obra || bodega || '—';
        const alertas = [];

        alertasPendientesRows.forEach(r => {
            // Estancada: superó el límite (10 días desde solicitud, o la prórroga).
            const diasHastaLimite = Number(r.dias_hasta_limite);
            const estancada = Number.isFinite(diasHastaLimite) && diasHastaLimite <= 0;
            alertas.push({
                tipo: 'pendiente',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                estancada,
                prorroga_hasta: r.prorroga_hasta || null,
                titulo: estancada
                    ? `${r.codigo} estancada (${Number(r.dias)} días pendiente)`
                    : `${r.codigo} espera tu aprobación`,
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

        // Faltantes sin decisión (aprobación parcial sin solicitud de faltante)
        faltantesRows.forEach(r => {
            alertas.push({
                tipo: 'faltante',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                titulo: `${r.codigo} tiene un faltante sin decisión`,
                detalle: `${Number(r.unidades_faltantes)} u. no enviadas · ${formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre)} → ${formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre)}`,
            });
        });

        // Rechazos: integrados a "Requiere tu atención" (antes en sección aparte).
        rechazosRows.forEach(r => {
            alertas.push({
                tipo: 'rechazo',
                transferencia_id: r.id,
                codigo: r.codigo,
                dias: Number(r.dias) || 0,
                titulo: `${r.codigo} fue rechazada`,
                detalle: `${formatUbic(r.origen_obra_nombre, r.origen_bodega_nombre)} → ${formatUbic(r.destino_obra_nombre, r.destino_bodega_nombre)}${r.observaciones_rechazo ? ` · "${r.observaciones_rechazo}"` : ''}`,
                solicitante: r.rechazado_por_nombre || null,
            });
        });

        // Orden final por prioridad, dentro por días desc.
        const prio = { discrepancia: 0, faltante: 1, pendiente: 2, rechazo: 3, transito: 4 };
        alertas.sort((a, b) => {
            const pa = prio[a.tipo] ?? 9;
            const pb = prio[b.tipo] ?? 9;
            if (pa !== pb) return pa - pb;
            return (b.dias || 0) - (a.dias || 0);
        });

        // Histórico: sparklines (últimos 7 días) + comparativa mes anterior (~30 días atrás)
        // Los KPIs actuales (hoy, no del snapshot) se usan como último punto del sparkline
        // para evitar depender de que el cron haya corrido hoy.
        const kpisHoy = {
            pendientes: Number(pendientesRows[0]?.count) || 0,
            en_transito: Number(transitoRows[0]?.count) || 0,
            estancados: Number(estancadosRows[0]?.count) || 0,
            discrepancias: Number(discrepanciasRows[0]?.transferencias_afectadas) || 0,
            valor_obras: Number(valor_total_obras) || 0,
        };

        const snapshotsByKpi = {};
        (snapshotsRows || []).forEach(r => {
            if (!snapshotsByKpi[r.kpi]) snapshotsByKpi[r.kpi] = [];
            snapshotsByKpi[r.kpi].push({ fecha: r.fecha, valor: Number(r.valor) || 0 });
        });

        // Buscar snapshot ~30 días atrás. Estrategia robusta: target = HOY - 30 días.
        // Si no hay punto exacto, tomar el más cercano dentro de ventana ±3 días para
        // evitar comparar contra un día arbitrario lejano (ej. cron que faltó 5 días).
        const findMesAnterior = (series) => {
            if (!series || !series.length) return null;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const targetMs = today.getTime() - 30 * 86400000;
            let best = null;
            let bestDiff = Infinity;
            for (const p of series) {
                const pMs = new Date(p.fecha + (typeof p.fecha === 'string' && p.fecha.length === 10 ? 'T12:00:00' : '')).getTime();
                const diff = Math.abs(pMs - targetMs);
                if (diff < bestDiff && diff <= 3 * 86400000) {
                    bestDiff = diff;
                    best = p;
                }
            }
            return best ? best.valor : null;
        };

        const historico = {};
        for (const kpi of Object.keys(kpisHoy)) {
            const series = snapshotsByKpi[kpi] || [];
            // Sparkline: últimos 6 días del snapshot + valor actual = 7 puntos
            const last6 = series.slice(-6).map(p => p.valor);
            const sparkline = [...last6, kpisHoy[kpi]];
            // Comparativa: valor hace ~30 días (busca punto exacto o ±3 días).
            const mes_anterior = findMesAnterior(series);
            // delta_pct: null cuando no hay base comparable (primera vez o cron faltante).
            //            0 si mes_anterior=0 y hoy=0 (sin cambio real).
            //            Math.round del % en otros casos. Guard contra div by zero.
            let delta_pct = null;
            if (mes_anterior !== null) {
                if (mes_anterior === 0) {
                    delta_pct = kpisHoy[kpi] === 0 ? 0 : null; // null = "sin comparable" (subió desde 0)
                } else {
                    delta_pct = Math.round(((kpisHoy[kpi] - mes_anterior) / mes_anterior) * 100);
                }
            }
            historico[kpi] = { sparkline, mes_anterior, delta_pct };
        }

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
            filtered_obra_id: obraIdNum,
            kpis: {
                transferencias_pendientes: Number(pendientesRows[0]?.count) || 0,
                transferencias_en_transito: Number(transitoRows[0]?.count) || 0,
                discrepancias_pendientes: {
                    transferencias_afectadas: Number(discrepanciasRows[0]?.transferencias_afectadas) || 0,
                    unidades_totales: Number(discrepanciasRows[0]?.unidades_totales) || 0,
                },
                valor_total_obras: Number(valor_total_obras) || 0,
                valor_total_patrimonio: Number(valor_total_patrimonio) || 0,
                estancados_transito: Number(estancadosRows[0]?.count) || 0,
            },
            patrimonio_por_empresa,
            inversion_vehiculos,
            top_obras,
            alertas: alertas.slice(0, 8),
            rechazos_recientes,
            historico,
            valor_por_categoria: (categoriaRows || []).map(r => ({
                categoria_id: r.id,
                nombre: r.nombre,
                orden: Number(r.orden) || 0,
                valor: Number(r.valor_neto) || 0,
            })),
            bombas_hormigon_mes: {
                eventos: Number(bombasRows?.[0]?.eventos) || 0,
                obras_distintas: Number(bombasRows?.[0]?.obras_distintas) || 0,
                costo_externo: Number(bombasRows?.[0]?.costo_externo) || 0,
            },
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
                   o.nombre AS obra_nombre, b.nombre AS bodega_nombre,
                   b.responsable_nombre AS bodega_responsable_nombre
            FROM ubicaciones_stock us
            LEFT JOIN obras o ON us.obra_id = o.id
            LEFT JOIN bodegas b ON us.bodega_id = b.id
            WHERE us.item_id IN (?) AND us.cantidad > 0
            ORDER BY us.item_id, us.cantidad DESC
        `, [itemIds]);

        const result = {};
        for (const row of rows) {
            if (!result[row.item_id]) result[row.item_id] = [];
            const isObra = !!row.obra_id;
            result[row.item_id].push({
                type: isObra ? 'obra' : 'bodega',
                id: row.obra_id || row.bodega_id,
                nombre: row.obra_nombre || row.bodega_nombre,
                cantidad: Number(row.cantidad) || 0,
                // Solo aplica a bodegas (mig 060). Para obras siempre null.
                responsable_nombre: isObra ? null : row.bodega_responsable_nombre,
            });
        }
        return result;
    }
};

module.exports = inventarioService;

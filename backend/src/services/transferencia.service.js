const db = require('../config/db');
const { normalizeUbicacion: _normalizeUbicacion } = require('../utils/ubicacionStock');

/**
 * Helper SoD: ¿el usuario tiene el permiso especial para saltarse las reglas
 * de Segregation of Duties (solicitante ≠ aprobador ≠ transportista ≠ receptor)?
 * Usado en flujo normal (aprobar / despachar / recibir). Los flujos especiales
 * (push_directo, intra_bodega, orden_gerencia) NO aplican SoD porque por diseño
 * consolidan roles — su gate de permiso individual ya implica autoridad.
 */
function _hasBypass(userPermisos) {
    return Array.isArray(userPermisos) && userPermisos.includes('inventario.transferencias.sod_bypass');
}

/**
 * Construye un Error con statusCode 403 para violaciones SoD. El errorHandler
 * global respeta `err.statusCode` (ver middleware/errorHandler.js:61).
 */
function _sodError(msg) {
    const e = new Error(msg);
    e.statusCode = 403;
    return e;
}

/**
 * Flujo de stock (Ola 2 — decremento al recibir):
 *
 *  pendiente   → no toca stock
 *  aprobada    → no toca stock (solo persiste splits y cambia estado)
 *  en_transito → no toca stock
 *  recibida    → ORIGEN -= cantidad_enviada  +  DESTINO += cantidad_recibida
 *                Si cantidad_recibida ≠ cantidad_enviada → se registra discrepancia.
 *                  · recibida < enviada → merma/pérdida en tránsito
 *                  · recibida > enviada → sobrante (miscount u otro error)
 *                La diferencia NO se revierte al origen — queda registrada para
 *                auditoría y resolución manual.
 *  rechazada   → no toca stock (nada que revertir)
 *  cancelada   → no toca stock (nada que revertir)
 *
 * Compatibilidad legacy (transferencias creadas antes del deploy de Ola 2 que
 * ya descontaron stock al aprobar): la columna `stock_reconciliado` discrimina
 *   · TRUE  → régimen NUEVO. recibir() decrementa origen; rechazar/cancelar no.
 *   · FALSE → régimen LEGACY. recibir() NO decrementa (ya se hizo); rechazar/
 *             cancelar SÍ revierten vía _reversarStockAprobada.
 * El script `backend/scripts/fix_stock_transferencias_aprobadas.js` flipa
 * FALSE→TRUE tras re-incrementar el origen, llevando legacy al régimen nuevo.
 */

const transferenciaService = {
    /**
     * Helper: SELECT de transferencia con FOR UPDATE para transición de estado.
     * La migración 036 (columna `stock_reconciliado`) ya está aplicada en
     * todos los entornos — desde Sprint 3 de la auditoría se asume su
     * existencia y se eliminó el fallback ER_BAD_FIELD_ERROR.
     */
    async _selectForStatusChange(conn, sqlTemplate, params) {
        const sql = sqlTemplate.replace('{reconcil}', 'stock_reconciliado');
        const [rows] = await conn.query(sql, params);
        return rows[0] || null;
    },

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
        const {
            destino_obra_id, destino_bodega_id, items, items_custom, observaciones,
            requiere_pionetas, cantidad_pionetas,
            tipo_flujo, motivo,
            origen_obra_id, origen_bodega_id, // para devolución (obra → bodega)
        } = data;
        const itemsArr = Array.isArray(items) ? items : [];
        const customArr = Array.isArray(items_custom) ? items_custom : [];
        if (!itemsArr.length && !customArr.length) {
            throw new Error('Debe incluir al menos un ítem (catálogo o personalizado)');
        }
        // Items custom solo válidos en flujo 'solicitud' (obra pide a bodega cosas a comprar).
        if (customArr.length && tipo_flujo && tipo_flujo !== 'solicitud') {
            throw new Error('Items personalizados solo permitidos en flujo de solicitud');
        }
        // Validar shape de items custom
        for (const c of customArr) {
            if (!c.descripcion || typeof c.descripcion !== 'string' || !c.descripcion.trim()) {
                throw new Error('Item personalizado: descripcion requerida');
            }
            const cant = Number(c.cantidad);
            if (!Number.isFinite(cant) || cant < 1) {
                throw new Error('Item personalizado: cantidad debe ser >= 1');
            }
        }
        if (!destino_obra_id && !destino_bodega_id) throw new Error('Debe especificar un destino');
        const flujo = tipo_flujo || 'solicitud';
        const flujosPermitidos = ['solicitud', 'devolucion', 'intra_obra'];
        if (!flujosPermitidos.includes(flujo)) {
            throw new Error(`tipo_flujo inválido para crear(): ${flujo}`);
        }
        // Devolución: origen debe ser una obra; destino debe ser una bodega.
        if (flujo === 'devolucion') {
            if (!origen_obra_id) throw new Error('Devolución requiere origen_obra_id');
            if (!destino_bodega_id) throw new Error('Devolución requiere destino_bodega_id');
        }
        // Intra-obra: origen y destino son obras distintas.
        if (flujo === 'intra_obra') {
            if (!origen_obra_id) throw new Error('Intra-obra requiere origen_obra_id');
            if (!destino_obra_id) throw new Error('Intra-obra requiere destino_obra_id');
            if (origen_obra_id === destino_obra_id) {
                throw new Error('Intra-obra: origen y destino deben ser obras distintas');
            }
        }
        // Stock relevante para validación: por obra (devolucion, intra_obra) o global (solicitud).
        const validarStockPorObra = flujo === 'devolucion' || flujo === 'intra_obra';

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Red de seguridad: validar stock GLOBAL por ítem (suma todas las ubicaciones).
            // El frontend ya lo valida, pero evitamos que solicitudes imposibles entren
            // al flujo si el cliente está stale o alguien bypasea la UI.
            // Para devolución, el stock relevante es el de la obra origen (no global).
            for (const item of itemsArr) {
                let disponible;
                let desc;
                if (validarStockPorObra) {
                    const [stockRows] = await conn.query(
                        `SELECT COALESCE(cantidad, 0) as total,
                                (SELECT descripcion FROM items_inventario WHERE id = ?) as descripcion
                         FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id = ? AND bodega_id IS NULL`,
                        [item.item_id, item.item_id, origen_obra_id]
                    );
                    disponible = stockRows.length ? Number(stockRows[0].total) || 0 : 0;
                    desc = stockRows.length ? stockRows[0].descripcion : `ítem ${item.item_id}`;
                } else {
                    const [stockRows] = await conn.query(
                        `SELECT COALESCE(SUM(cantidad), 0) as total,
                                (SELECT descripcion FROM items_inventario WHERE id = ?) as descripcion
                         FROM ubicaciones_stock WHERE item_id = ?`,
                        [item.item_id, item.item_id]
                    );
                    disponible = Number(stockRows[0].total) || 0;
                    desc = stockRows[0].descripcion || `ítem ${item.item_id}`;
                }
                const solicitado = Number(item.cantidad) || 0;
                if (solicitado > disponible) {
                    throw new Error(`Stock insuficiente para ${desc}. Disponible: ${disponible}, solicitado: ${solicitado}`);
                }
            }

            const codigo = await this._generarCodigo();

            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
                  solicitante_id, observaciones, requiere_pionetas, cantidad_pionetas,
                  tipo_flujo, motivo, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    codigo,
                    validarStockPorObra ? origen_obra_id : (origen_obra_id || null),
                    validarStockPorObra ? null : (origen_bodega_id || null),
                    destino_obra_id || null,
                    destino_bodega_id || null,
                    solicitanteId,
                    observaciones || null,
                    requiere_pionetas || false,
                    cantidad_pionetas || null,
                    flujo,
                    motivo || null,
                    solicitanteId, // audit creado_por
                ]
            );
            const trfId = result.insertId;

            // Auditoría perf: batch INSERT en vez de loop async (N round-trips → 1).
            // Antes: 20 ítems = 20 queries serializadas dentro de transacción.
            if (itemsArr.length > 0) {
                const placeholders = itemsArr.map(() => '(?, ?, ?)').join(', ');
                const values = itemsArr.flatMap(item => [trfId, item.item_id, item.cantidad]);
                await conn.query(
                    `INSERT INTO transferencia_items (transferencia_id, item_id, cantidad_solicitada) VALUES ${placeholders}`,
                    values
                );
            }

            // Items personalizados (no en catálogo) — los lee el aprobador para tramitar compra.
            for (const c of customArr) {
                await conn.query(
                    `INSERT INTO transferencia_items_custom
                     (transferencia_id, descripcion, cantidad, unidad, observacion)
                     VALUES (?, ?, ?, ?, ?)`,
                    [
                        trfId,
                        String(c.descripcion).trim().slice(0, 500),
                        Number(c.cantidad),
                        c.unidad ? String(c.unidad).slice(0, 50) : null,
                        c.observacion ? String(c.observacion) : null,
                    ]
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
     * Helper: revierte stock al origen cuando una transferencia 'aprobada' se
     * rechaza o cancela. Lee splits desde transferencia_item_origenes (fuente de
     * verdad multi-origen). Si el ítem no tiene splits (transferencias aprobadas
     * antes de la migración 032), usa el origen de transferencia_items como
     * fallback — mismo comportamiento legacy.
     */
    async _reversarStockAprobada(conn, transferenciaId, trf) {
        const [items] = await conn.query(
            `SELECT id, item_id, cantidad_enviada, origen_obra_id, origen_bodega_id
             FROM transferencia_items WHERE transferencia_id = ?`,
            [transferenciaId]
        );
        for (const item of items) {
            const [splits] = await conn.query(
                `SELECT origen_obra_id, origen_bodega_id, cantidad_enviada
                 FROM transferencia_item_origenes WHERE transferencia_item_id = ?`,
                [item.id]
            );

            if (splits.length > 0) {
                for (const s of splits) {
                    if (s.cantidad_enviada > 0) {
                        const ubic = _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id);
                        await conn.query(
                            `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                             VALUES (?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                            [item.item_id, ubic.obra, ubic.bodega, s.cantidad_enviada]
                        );
                    }
                }
            } else {
                // Fallback legacy: usa origen de transferencia_items (transfers pre-032).
                const cantidad = item.cantidad_enviada || 0;
                if (cantidad > 0) {
                    const obraId = item.origen_obra_id ?? trf.origen_obra_id;
                    const bodegaId = item.origen_bodega_id ?? trf.origen_bodega_id;
                    const ubic = _normalizeUbicacion(obraId, bodegaId);
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                         VALUES (?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [item.item_id, ubic.obra, ubic.bodega, cantidad]
                    );
                }
            }
        }
    },

    /**
     * Aprueba la transferencia.
     *
     * Acepta DOS shapes de payload (backward-compatible):
     *
     *   A) Legacy (1 origen por ítem):
     *      { items: [{ item_id, cantidad_enviada, origen_obra_id, origen_bodega_id }] }
     *
     *   B) Multi-origen (N splits por ítem):
     *      { items: [{ item_id, splits: [{ origen_obra_id, origen_bodega_id, cantidad }] }] }
     *
     * En ambos casos:
     *   - Permite enviar MENOS que lo solicitado (aprobación parcial).
     *   - Valida que el stock exista en cada origen (previene errores obvios),
     *     pero NO decrementa stock. El decremento ocurre al recibir.
     *   - Persiste filas en transferencia_item_origenes (1 por split).
     *   - transferencia_items.cantidad_enviada queda como SUMA de splits (denormalizado).
     *   - transferencia_items.origen_obra_id/bodega_id apuntan al split primario (primer
     *     split con cantidad > 0) — mantiene compat con rechazar() y reportes legacy.
     *
     *   Nota Ola 2: dos aprobaciones pueden comprometer el mismo stock físico
     *   (validación no reserva). La segunda recepción lo notará como discrepancia.
     */
    async aprobar(id, aprobadorId, data, userPermisos) {
        const { items } = data;
        if (!items || !items.length) throw new Error('Debe incluir ítems');

        const defaultObraId = data.origen_obra_id || null;
        const defaultBodegaId = data.origen_bodega_id || null;

        // Normalizar payload a forma canónica: cada ítem con un array `splits`.
        // Shape legacy (cantidad_enviada + origen_*) se convierte en un solo split.
        const canonicales = items.map(item => {
            if (Array.isArray(item.splits)) {
                const splits = item.splits
                    .map(s => ({
                        obraId: s.origen_obra_id ?? null,
                        bodegaId: s.origen_bodega_id ?? null,
                        cantidad: parseFloat(s.cantidad) || 0,
                    }))
                    .filter(s => s.cantidad > 0);
                return { item_id: item.item_id, splits };
            }
            // Legacy shape
            const enviada = parseFloat(item.cantidad_enviada) || 0;
            if (enviada <= 0) return { item_id: item.item_id, splits: [] };
            return {
                item_id: item.item_id,
                splits: [{
                    obraId: item.origen_obra_id ?? defaultObraId ?? null,
                    bodegaId: item.origen_bodega_id ?? defaultBodegaId ?? null,
                    cantidad: enviada,
                }],
            };
        });

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // FOR UPDATE: lock pesimista contra race condition de doble aprobación
            const [trf] = await conn.query('SELECT estado, solicitante_id FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trf.length || trf[0].estado !== 'pendiente') throw new Error('Transferencia no está pendiente');

            // SoD: el aprobador no puede ser el solicitante.
            // sod_bypass es para casos excepcionales (obra unipersonal, emergencias);
            // queda registrado en logs_actividad para auditoría.
            if (trf[0].solicitante_id != null && trf[0].solicitante_id === aprobadorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes aprobar transferencias que tú mismo solicitaste. Otro usuario con permiso "Aprobar Transferencia" debe hacerlo.');
            }

            const [dbItems] = await conn.query(
                'SELECT id, item_id, cantidad_solicitada FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );
            const itemInfo = {}; // item_id → { id, cantidad_solicitada }
            dbItems.forEach(r => { itemInfo[r.item_id] = { id: r.id, cantidad_solicitada: r.cantidad_solicitada }; });

            // Agregar totales por item_id (consolidar si llegan varias filas para un mismo ítem)
            const totalByItem = {};
            for (const c of canonicales) {
                if (!(c.item_id in itemInfo)) {
                    throw new Error(`Ítem ${c.item_id} no pertenece a esta transferencia`);
                }
                for (const s of c.splits) {
                    if (s.cantidad < 0) throw new Error(`Cantidad inválida para ítem ${c.item_id}`);
                    if (!s.obraId && !s.bodegaId) {
                        throw new Error(`Ítem ${c.item_id}: cada split debe especificar origen (obra o bodega)`);
                    }
                }
                const total = c.splits.reduce((a, s) => a + s.cantidad, 0);
                totalByItem[c.item_id] = (totalByItem[c.item_id] || 0) + total;
            }

            // Validar suma de splits ≤ cantidad_solicitada por ítem
            for (const [itemId, total] of Object.entries(totalByItem)) {
                const solicitada = itemInfo[itemId].cantidad_solicitada;
                if (total > solicitada) {
                    throw new Error(`Ítem ${itemId}: suma de splits (${total}) excede lo solicitado (${solicitada})`);
                }
            }

            // Validar stock por origen + lock pesimista para evitar race condition.
            // Auditoría 6.5: antes era un SELECT sin lock, y dos aprobaciones
            // concurrentes del mismo ítem desde la misma obra pasaban ambas
            // validación → decrementaban origen dos veces. Ahora SELECT ... FOR UPDATE
            // dentro de la transacción ya abierta serializa las aprobaciones que
            // tocan la misma fila de stock.
            for (const c of canonicales) {
                for (const s of c.splits) {
                    const [stock] = await conn.query(
                        'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ? FOR UPDATE',
                        [c.item_id, s.obraId, s.bodegaId]
                    );
                    const disponible = stock.length ? stock[0].cantidad : 0;
                    if (s.cantidad > disponible) {
                        throw new Error(`Stock insuficiente para ítem ${c.item_id} en el origen indicado. Disponible: ${disponible}, requerido: ${s.cantidad}`);
                    }
                }
            }

            // Origen "principal" (cabecera): primer split con cantidad > 0 del primer ítem.
            let primario = null;
            for (const c of canonicales) {
                const firstSplit = c.splits.find(s => s.cantidad > 0);
                if (firstSplit) { primario = firstSplit; break; }
            }

            await conn.query(
                `UPDATE transferencias SET estado = 'aprobada', aprobador_id = ?, aprobado_por = ?, origen_obra_id = ?, origen_bodega_id = ?, fecha_aprobacion = NOW() WHERE id = ?`,
                [aprobadorId, aprobadorId, primario?.obraId || null, primario?.bodegaId || null, id]
            );

            // Actualizar cada transferencia_item + persistir splits.
            // Auditoría perf: acumular splits en un solo INSERT batch al final
            // (antes era 1 INSERT por split dentro del loop anidado).
            const origenRows = [];
            for (const c of canonicales) {
                const info = itemInfo[c.item_id];
                const total = c.splits.reduce((a, s) => a + s.cantidad, 0);
                const primarioItem = c.splits.find(s => s.cantidad > 0);

                await conn.query(
                    `UPDATE transferencia_items
                     SET cantidad_enviada = ?, origen_obra_id = ?, origen_bodega_id = ?
                     WHERE id = ?`,
                    [total, primarioItem?.obraId || null, primarioItem?.bodegaId || null, info.id]
                );

                // Limpiar splits previos (idempotencia: re-aprobación no duplica filas)
                await conn.query(
                    'DELETE FROM transferencia_item_origenes WHERE transferencia_item_id = ?',
                    [info.id]
                );

                for (const s of c.splits) {
                    origenRows.push([info.id, s.obraId, s.bodegaId, s.cantidad]);
                }
            }

            // Batch INSERT de todos los splits acumulados. Ola 2: no se decrementa
            // stock acá — el decremento ocurre al recibir.
            if (origenRows.length > 0) {
                const placeholders = origenRows.map(() => '(?, ?, ?, ?)').join(', ');
                const values = origenRows.flatMap(r => r);
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES ${placeholders}`,
                    values
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

    /**
     * Auto-crea una nueva solicitud por el "faltante" tras una aprobación parcial.
     * - Lee la transferencia original (destino, solicitante, items originales).
     * - Calcula el faltante por ítem: cantidad_solicitada - cantidad_enviada (de items).
     * - Crea una nueva transferencia en estado 'pendiente' apuntando con es_faltante_de_id.
     * - Retorna el id/código de la nueva solicitud.
     * - Se usa normalmente DESPUÉS de aprobar() con cantidades parciales.
     */
    async crearFaltante(transferenciaOriginalId, solicitanteId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [[origRow]] = await conn.query(
                'SELECT destino_obra_id, destino_bodega_id FROM transferencias WHERE id = ?',
                [transferenciaOriginalId]
            );
            if (!origRow) throw new Error('Transferencia original no encontrada');

            const [origItems] = await conn.query(
                `SELECT item_id, cantidad_solicitada, COALESCE(cantidad_enviada, 0) AS cantidad_enviada
                 FROM transferencia_items WHERE transferencia_id = ?`,
                [transferenciaOriginalId]
            );

            const faltantes = origItems
                .map(i => ({
                    item_id: i.item_id,
                    cantidad: Math.max(0, i.cantidad_solicitada - i.cantidad_enviada),
                }))
                .filter(i => i.cantidad > 0);

            if (!faltantes.length) {
                await conn.rollback();
                return null; // No hay faltante, no se crea nada
            }

            const codigo = await this._generarCodigo();

            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, destino_obra_id, destino_bodega_id, solicitante_id, observaciones, es_faltante_de_id, creado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    codigo,
                    origRow.destino_obra_id,
                    origRow.destino_bodega_id,
                    solicitanteId,
                    `Faltante de transferencia #${transferenciaOriginalId} (auto-generada)`,
                    transferenciaOriginalId,
                    solicitanteId, // audit creado_por
                ]
            );
            const newId = result.insertId;

            for (const f of faltantes) {
                await conn.query(
                    `INSERT INTO transferencia_items (transferencia_id, item_id, cantidad_solicitada)
                     VALUES (?, ?, ?)`,
                    [newId, f.item_id, f.cantidad]
                );
            }

            await conn.commit();
            return { id: newId, codigo, items: faltantes.length };
        } catch (err) {
            try { await conn.rollback(); } catch { /* ignore */ }
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Cambia el estado a en_transito. No mueve stock (ya se movió al aprobar).
     */
    async despachar(id, transportistaId, userPermisos) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trf] = await conn.query('SELECT estado, aprobador_id FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trf.length || trf[0].estado !== 'aprobada') throw new Error('Transferencia no está aprobada');

            // SoD: el transportista (quien despacha) no puede ser el aprobador.
            if (trf[0].aprobador_id != null && trf[0].aprobador_id === transportistaId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes despachar transferencias que tú mismo aprobaste. Otro usuario con permiso "Despachar Transferencia" debe hacerlo.');
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'en_transito', transportista_id = ?, despachado_por = ?, fecha_despacho = NOW() WHERE id = ?",
                [transportistaId, transportistaId, id]
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
     * Recepción: stock sube al destino y baja del origen (régimen nuevo).
     * Soporta DOS modos via parámetro `tipo`:
     *   · 'total'    → cierra la TRF (estado 'recibida'). Gaps acumulados vs
     *                  cantidad_enviada generan discrepancias automáticamente.
     *                  Comportamiento por defecto (back-compat con clientes
     *                  que no envían `tipo`).
     *   · 'parcial'  → registra lo que llegó en ESTE viaje y deja la TRF en
     *                  estado 'recepcion_parcial'. Permite múltiples eventos
     *                  hasta que el receptor cierre con 'total'. No genera
     *                  discrepancia. Bloquea over-receive (cumulative > enviada).
     *
     * Stock por evento (régimen nuevo): cada llamada decrementa origen +
     * incrementa destino SOLO por la cantidad de ESTE viaje (no por la
     * cantidad_enviada total). Para origen, FIFO por split via columna
     * transferencia_item_origenes.cantidad_decrementada (migración 048).
     *
     * Régimen legacy (stock_reconciliado = FALSE): el origen ya se descontó
     * al aprobar la TRF completa. Solo se incrementa destino. La auditoría
     * y los eventos se registran igual.
     *
     * cantidad_recibida en transferencia_items ACUMULA (no sobreescribe) entre
     * eventos. La cifra final = SUM de todos los eventos.
     *
     * SoD: el receptor no puede ser el transportista. Caso aprobada→recibida
     * directa (sin despacho intermedio): tampoco el aprobador. Se valida en
     * CADA evento.
     */
    async recibir(id, receptorId, items, userPermisos, tipo = 'total') {
        if (!items || !items.length) throw new Error('Debe incluir ítems');
        if (tipo !== 'parcial' && tipo !== 'total') {
            throw new Error('tipo debe ser "parcial" o "total"');
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [trfRows] = await conn.query('SELECT * FROM transferencias WHERE id = ? FOR UPDATE', [id]);
            if (!trfRows.length) throw new Error('Transferencia no encontrada');
            const trf = trfRows[0];
            if (!['en_transito', 'aprobada', 'recepcion_parcial'].includes(trf.estado)) {
                throw new Error('Transferencia no puede ser recibida');
            }

            // SoD: el receptor no puede ser el transportista (quien despachó).
            // Caso aprobada→recibida directa (sin estado en_tránsito intermedio):
            // tampoco puede ser el aprobador (transportista_id está null).
            if (trf.transportista_id != null && trf.transportista_id === receptorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes recibir transferencias que tú mismo despachaste. Otro usuario con permiso "Recibir Transferencia" debe hacerlo.');
            }
            if (trf.estado === 'aprobada' && trf.transportista_id == null && trf.aprobador_id != null
                && trf.aprobador_id === receptorId && !_hasBypass(userPermisos)) {
                throw _sodError('SoD violation: no puedes recibir transferencias que tú mismo aprobaste (sin paso por despacho). Otro usuario debe recibirla.');
            }

            // Régimen nuevo: decrementar origen según splits. Si la columna es
            // FALSE, legacy / ya descontado al aprobar.
            const regimenNuevo = trf.stock_reconciliado !== 0 && trf.stock_reconciliado !== false;

            // Fetch cantidades enviadas + cantidad_recibida acumulada desde BD
            const [dbItems] = await conn.query(
                'SELECT id, item_id, cantidad_enviada, cantidad_recibida, origen_obra_id, origen_bodega_id FROM transferencia_items WHERE transferencia_id = ?',
                [id]
            );
            const enviadaMap = {};
            const acumuladoMap = {};
            const trfItemIdMap = {};
            const itemRowMap = {};
            dbItems.forEach(r => {
                enviadaMap[r.item_id] = r.cantidad_enviada || 0;
                acumuladoMap[r.item_id] = r.cantidad_recibida || 0;
                trfItemIdMap[r.item_id] = r.id;
                itemRowMap[r.item_id] = r;
            });

            // Validación parcial: cumulative recibida (acumulado + este viaje)
            // no puede exceder cantidad_enviada. Para over-receive usar tipo='total'.
            if (tipo === 'parcial') {
                for (const item of items) {
                    if (!(item.item_id in enviadaMap)) {
                        throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                    }
                    const recibidaEnEvento = parseFloat(item.cantidad_recibida) || 0;
                    if (recibidaEnEvento < 0) {
                        throw new Error(`Cantidad recibida inválida para ítem ${item.item_id}`);
                    }
                    const proyectado = acumuladoMap[item.item_id] + recibidaEnEvento;
                    if (proyectado > enviadaMap[item.item_id]) {
                        const err = new Error(
                            `Recepción parcial no puede exceder cantidad enviada (ítem ${item.item_id}: ` +
                            `acumulado ${acumuladoMap[item.item_id]} + este viaje ${recibidaEnEvento} > enviada ${enviadaMap[item.item_id]}). ` +
                            `Usa "Recepción Total" para cerrar con discrepancia.`
                        );
                        err.statusCode = 400;
                        throw err;
                    }
                }
            }

            // Insertar cabecera del evento de recepción (audit)
            const [recepHeader] = await conn.query(
                `INSERT INTO transferencia_recepciones (transferencia_id, receptor_id, tipo, observacion)
                 VALUES (?, ?, ?, ?)`,
                [id, receptorId, tipo, null]
            );
            const recepcionId = recepHeader.insertId;

            // Procesar cada item del evento
            for (const item of items) {
                if (!(item.item_id in enviadaMap)) {
                    throw new Error(`Ítem ${item.item_id} no pertenece a esta transferencia`);
                }
                const recibidaEnEvento = parseFloat(item.cantidad_recibida) || 0;
                if (recibidaEnEvento < 0) {
                    throw new Error(`Cantidad recibida inválida para ítem ${item.item_id}`);
                }

                // Decremento de origen (solo régimen nuevo): FIFO por split via
                // cantidad_decrementada. En parciales sucesivos, el split que no
                // tiene saldo se salta y se consume del siguiente.
                if (regimenNuevo && recibidaEnEvento > 0) {
                    let amountRemaining = recibidaEnEvento;
                    const trfItemId = trfItemIdMap[item.item_id];
                    const [splits] = await conn.query(
                        `SELECT id, origen_obra_id, origen_bodega_id, cantidad_enviada, cantidad_decrementada
                         FROM transferencia_item_origenes
                         WHERE transferencia_item_id = ?
                         ORDER BY id ASC FOR UPDATE`,
                        [trfItemId]
                    );
                    if (splits.length > 0) {
                        for (const s of splits) {
                            if (amountRemaining <= 0) break;
                            const splitDisponible = (s.cantidad_enviada || 0) - (s.cantidad_decrementada || 0);
                            if (splitDisponible <= 0) continue;
                            const take = Math.min(amountRemaining, splitDisponible);
                            const ubicSplit = _normalizeUbicacion(s.origen_obra_id, s.origen_bodega_id);
                            await conn.query(
                                `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                                 WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                                [take, item.item_id, ubicSplit.obra, ubicSplit.bodega]
                            );
                            await conn.query(
                                'UPDATE transferencia_item_origenes SET cantidad_decrementada = cantidad_decrementada + ? WHERE id = ?',
                                [take, s.id]
                            );
                            amountRemaining -= take;
                        }
                        // Si quedó remaining después de splits (caso total con
                        // over-receive), se descuenta del origen primario como fallback.
                        if (amountRemaining > 0) {
                            const itemRow = itemRowMap[item.item_id];
                            const obraId = itemRow.origen_obra_id ?? trf.origen_obra_id;
                            const bodegaId = itemRow.origen_bodega_id ?? trf.origen_bodega_id;
                            const ubicFb = _normalizeUbicacion(obraId, bodegaId);
                            await conn.query(
                                `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                                 WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                                [amountRemaining, item.item_id, ubicFb.obra, ubicFb.bodega]
                            );
                        }
                    } else {
                        // Sin splits → fallback al origen de transferencia_items o cabecera
                        const itemRow = itemRowMap[item.item_id];
                        const obraId = itemRow.origen_obra_id ?? trf.origen_obra_id;
                        const bodegaId = itemRow.origen_bodega_id ?? trf.origen_bodega_id;
                        const ubicFb = _normalizeUbicacion(obraId, bodegaId);
                        await conn.query(
                            `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                             WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                            [recibidaEnEvento, item.item_id, ubicFb.obra, ubicFb.bodega]
                        );
                    }
                }

                // Acumular cantidad_recibida en transferencia_items (no sobreescribir)
                await conn.query(
                    'UPDATE transferencia_items SET cantidad_recibida = COALESCE(cantidad_recibida, 0) + ? WHERE transferencia_id = ? AND item_id = ?',
                    [recibidaEnEvento, id, item.item_id]
                );

                // Incrementar stock en destino (upsert)
                // Auditoría 6.6: copiar valor_arriendo_override del origen al destino si
                // el destino aún no existe. Antes el INSERT no incluía el override y la
                // facturación destino caía al valor base, perdiendo el precio especial
                // que tenía el ítem en la obra de origen.
                // Usamos el origen registrado en transferencia_items (itemRowMap) en vez
                // del trf.origen_* del header, porque el header puede ser NULL en flujos
                // legacy o multi-origen. Si tampoco está, omitimos la búsqueda (override
                // queda NULL en destino — comportamiento previo, sin regresión).
                // Si el destino YA tiene una fila, mantenemos su override (no
                // sobrescribir — el destino pudo haber sido configurado a propósito).
                if (recibidaEnEvento > 0) {
                    const ubicDest = _normalizeUbicacion(trf.destino_obra_id, trf.destino_bodega_id);
                    const rowItem = itemRowMap[item.item_id];
                    let overrideOrigen = null;
                    if (rowItem && (rowItem.origen_obra_id || rowItem.origen_bodega_id)) {
                        const origenResult = await conn.query(
                            `SELECT valor_arriendo_override FROM ubicaciones_stock
                             WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?`,
                            [item.item_id, rowItem.origen_obra_id ?? null, rowItem.origen_bodega_id ?? null]
                        );
                        const rows = Array.isArray(origenResult) ? origenResult[0] : null;
                        if (Array.isArray(rows) && rows.length > 0) {
                            overrideOrigen = rows[0].valor_arriendo_override ?? null;
                        }
                    }
                    await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                        [item.item_id, ubicDest.obra, ubicDest.bodega, recibidaEnEvento, overrideOrigen]
                    );
                }

                // Audit item del evento
                await conn.query(
                    `INSERT INTO transferencia_recepcion_items
                     (recepcion_id, transferencia_item_id, cantidad_recibida, observacion)
                     VALUES (?, ?, ?, ?)`,
                    [recepcionId, trfItemIdMap[item.item_id], recibidaEnEvento, item.observacion || null]
                );

                // Discrepancia: SOLO en recepción total y solo si cumulative ≠ enviada.
                // En parcial no se crea discrepancia (lo que falta "viene en otro viaje").
                if (tipo === 'total') {
                    const totalRecibidoFinal = acumuladoMap[item.item_id] + recibidaEnEvento;
                    if (totalRecibidoFinal !== enviadaMap[item.item_id]) {
                        await conn.query(
                            `INSERT INTO transferencia_discrepancias
                             (transferencia_id, item_id, cantidad_enviada, cantidad_recibida, observacion)
                             VALUES (?, ?, ?, ?, ?)`,
                            [id, item.item_id, enviadaMap[item.item_id], totalRecibidoFinal, item.observacion || null]
                        );
                    }
                }
            }

            // Transición de estado:
            //   · parcial → recepcion_parcial. Header receptor/fecha NO se setea
            //     (queda para la recepción final que cierra la TRF).
            //   · total   → recibida. Header receptor/fecha = ESTE evento.
            if (tipo === 'parcial') {
                await conn.query(
                    "UPDATE transferencias SET estado = 'recepcion_parcial' WHERE id = ?",
                    [id]
                );
            } else {
                await conn.query(
                    "UPDATE transferencias SET estado = 'recibida', receptor_id = ?, recibido_por = ?, fecha_recepcion = NOW() WHERE id = ?",
                    [receptorId, receptorId, id]
                );
            }

            await conn.commit();
            return { id, estado: tipo === 'parcial' ? 'recepcion_parcial' : 'recibida', recepcion_id: recepcionId };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Devuelve el historial de eventos de recepción de una TRF con items embebidos.
     * Usado por el frontend para renderizar la sección "Historial de recepciones"
     * en TransferenciaDetail.
     */
    async getRecepciones(transferenciaId) {
        const [recepciones] = await db.query(
            `SELECT r.id, r.transferencia_id, r.receptor_id, r.fecha_recepcion, r.tipo, r.observacion,
                    u.nombre AS receptor_nombre
             FROM transferencia_recepciones r
             LEFT JOIN usuarios u ON u.id = r.receptor_id
             WHERE r.transferencia_id = ?
             ORDER BY r.fecha_recepcion ASC, r.id ASC`,
            [transferenciaId]
        );
        if (recepciones.length === 0) return [];

        const ids = recepciones.map(r => r.id);
        const [itemRows] = await db.query(
            `SELECT ri.id, ri.recepcion_id, ri.transferencia_item_id, ri.cantidad_recibida, ri.observacion,
                    ti.item_id, i.descripcion AS item_descripcion, i.unidad
             FROM transferencia_recepcion_items ri
             INNER JOIN transferencia_items ti ON ti.id = ri.transferencia_item_id
             LEFT JOIN items i ON i.id = ti.item_id
             WHERE ri.recepcion_id IN (?)
             ORDER BY ri.id ASC`,
            [ids]
        );
        const itemsByRecepcion = {};
        itemRows.forEach(r => {
            if (!itemsByRecepcion[r.recepcion_id]) itemsByRecepcion[r.recepcion_id] = [];
            itemsByRecepcion[r.recepcion_id].push({
                id: r.id,
                transferencia_item_id: r.transferencia_item_id,
                item_id: r.item_id,
                item_descripcion: r.item_descripcion,
                unidad: r.unidad,
                cantidad_recibida: Number(r.cantidad_recibida) || 0,
                observacion: r.observacion,
            });
        });

        return recepciones.map(r => ({
            id: r.id,
            transferencia_id: r.transferencia_id,
            receptor_id: r.receptor_id,
            receptor_nombre: r.receptor_nombre,
            fecha_recepcion: r.fecha_recepcion,
            tipo: r.tipo,
            observacion: r.observacion,
            items: itemsByRecepcion[r.id] || [],
        }));
    },

    /**
     * Rechazar: permitido en pendiente, aprobada o en_transito.
     * Si estaba aprobada/en_transito bajo régimen legacy → reversar stock al origen.
     * Bajo régimen nuevo no hay reversa (stock aún no se había movido).
     *
     * Semánticamente cubre dos casos distintos con la misma operación:
     *   · rechazo del aprobador (desde pendiente/aprobada) — flujo de aprobación
     *   · rechazo de recepción (desde en_transito) — el receptor rechaza físicamente
     * Ambos terminan en estado 'rechazada'. La ruta
     * PUT /:id/rechazar-recepcion invoca este mismo método con permiso distinto.
     */
    async rechazar(id, aprobadorId, motivo) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const trf = await this._selectForStatusChange(
                conn,
                'SELECT estado, origen_obra_id, origen_bodega_id, {reconcil} FROM transferencias WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!trf) throw new Error('Transferencia no encontrada');
            if (!['pendiente', 'aprobada', 'en_transito'].includes(trf.estado)) {
                throw new Error('Solo se pueden rechazar transferencias pendientes, aprobadas o en tránsito');
            }

            // Legacy (stock_reconciliado=FALSE) + aprobada|en_transito → revertir stock.
            // Régimen nuevo → no hay nada que revertir (stock aún no se movió).
            const esLegacy = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
            if (['aprobada', 'en_transito'].includes(trf.estado) && esLegacy) {
                await this._reversarStockAprobada(conn, id, trf);
            }

            await conn.query(
                "UPDATE transferencias SET estado = 'rechazada', aprobador_id = ?, rechazado_por = ?, observaciones_rechazo = ?, fecha_aprobacion = NOW() WHERE id = ?",
                [aprobadorId, aprobadorId, motivo || null, id]
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
     * Cancelar: permitido en pendiente, aprobada o en_transito.
     * Si estaba aprobada/en_transito bajo régimen legacy → reversar stock al origen.
     * Bajo régimen nuevo no hay reversa (stock aún no se había movido).
     *
     * Soporta cancelación post-despacho (estado='en_transito'): el solicitante
     * o el aprobador aborta la transferencia aunque ya está físicamente viajando.
     */
    async cancelar(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const trf = await this._selectForStatusChange(
                conn,
                'SELECT estado, solicitante_id, origen_obra_id, origen_bodega_id, {reconcil} FROM transferencias WHERE id = ? FOR UPDATE',
                [id]
            );
            if (!trf) throw new Error('Transferencia no encontrada');
            if (!['pendiente', 'aprobada', 'en_transito'].includes(trf.estado)) {
                throw new Error('Solo se pueden cancelar transferencias pendientes, aprobadas o en tránsito');
            }

            // Legacy (stock_reconciliado=FALSE) + aprobada|en_transito → revertir stock.
            // Régimen nuevo → no hay nada que revertir.
            const esLegacy = trf.stock_reconciliado === 0 || trf.stock_reconciliado === false;
            if (['aprobada', 'en_transito'].includes(trf.estado) && esLegacy) {
                await this._reversarStockAprobada(conn, id, trf);
            }

            await conn.query("UPDATE transferencias SET estado = 'cancelada', cancelado_por = ? WHERE id = ?", [userId, id]);

            await conn.commit();
            return { id, estado: 'cancelada' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Push directo: bodega → obra SIN paso de aprobación. Material ya está listo
     * para salir; el bodeguero solo registra el movimiento. Queda en 'en_transito'
     * hasta que el receptor confirma en la obra.
     *
     * payload: {
     *   origen_bodega_id, destino_obra_id,
     *   items: [{ item_id, cantidad }],  // cantidad = enviada = solicitada
     *   observaciones?, motivo?
     * }
     */
    async pushDirecto(data, userId) {
        const { origen_bodega_id, destino_obra_id, items, observaciones, motivo } = data;
        if (!origen_bodega_id) throw new Error('Debe especificar bodega origen');
        if (!destino_obra_id) throw new Error('Debe especificar obra destino');
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar stock en bodega origen por cada ítem
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                if (cantidad <= 0) throw new Error(`Cantidad inválida para ítem ${item.item_id}`);
                const [stock] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?',
                    [item.item_id, origen_bodega_id]
                );
                const disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                if (cantidad > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id} en bodega. Disponible: ${disponible}, requerido: ${cantidad}`);
                }
            }

            const codigo = await this._generarCodigo();
            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_bodega_id, destino_obra_id, solicitante_id, aprobador_id,
                  observaciones, tipo_flujo, motivo, estado,
                  fecha_aprobacion, fecha_despacho,
                  creado_por, aprobado_por, despachado_por)
                 VALUES (?, ?, ?, ?, ?, ?, 'push_directo', ?, 'en_transito', NOW(), NOW(), ?, ?, ?)`,
                [codigo, origen_bodega_id, destino_obra_id, userId, userId, observaciones || null, motivo || null, userId, userId, userId]
            );
            const trfId = result.insertId;

            // Persistir items + splits (único origen = bodega)
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                const [itemRes] = await conn.query(
                    `INSERT INTO transferencia_items
                     (transferencia_id, item_id, cantidad_solicitada, cantidad_enviada, origen_bodega_id)
                     VALUES (?, ?, ?, ?, ?)`,
                    [trfId, item.item_id, cantidad, cantidad, origen_bodega_id]
                );
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES (?, NULL, ?, ?)`,
                    [itemRes.insertId, origen_bodega_id, cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Intra-bodega: bodega → bodega, instantáneo (estado 'recibida' en la misma tx).
     * No hay tránsito — mismo dueño, mismo edificio logísticamente hablando.
     *
     * payload: {
     *   origen_bodega_id, destino_bodega_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?
     * }
     */
    async intraBodega(data, userId) {
        const { origen_bodega_id, destino_bodega_id, items, observaciones, motivo } = data;
        if (!origen_bodega_id) throw new Error('Debe especificar bodega origen');
        if (!destino_bodega_id) throw new Error('Debe especificar bodega destino');
        if (origen_bodega_id === destino_bodega_id) throw new Error('Origen y destino deben ser bodegas distintas');
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar stock
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                if (cantidad <= 0) throw new Error(`Cantidad inválida para ítem ${item.item_id}`);
                const [stock] = await conn.query(
                    'SELECT cantidad FROM ubicaciones_stock WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?',
                    [item.item_id, origen_bodega_id]
                );
                const disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                if (cantidad > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id} en bodega origen. Disponible: ${disponible}, requerido: ${cantidad}`);
                }
            }

            const codigo = await this._generarCodigo();
            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_bodega_id, destino_bodega_id, solicitante_id, aprobador_id, receptor_id,
                  observaciones, tipo_flujo, motivo, estado,
                  fecha_aprobacion, fecha_despacho, fecha_recepcion,
                  creado_por, aprobado_por, despachado_por, recibido_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'intra_bodega', ?, 'recibida', NOW(), NOW(), NOW(), ?, ?, ?, ?)`,
                [codigo, origen_bodega_id, destino_bodega_id, userId, userId, userId, observaciones || null, motivo || null, userId, userId, userId, userId]
            );
            const trfId = result.insertId;

            // Mover stock atómicamente + persistir items con recibida=enviada=solicitada
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                const [itemRes] = await conn.query(
                    `INSERT INTO transferencia_items
                     (transferencia_id, item_id, cantidad_solicitada, cantidad_enviada, cantidad_recibida, origen_bodega_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [trfId, item.item_id, cantidad, cantidad, cantidad, origen_bodega_id]
                );
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES (?, NULL, ?, ?)`,
                    [itemRes.insertId, origen_bodega_id, cantidad]
                );
                // Decrementar origen
                await conn.query(
                    `UPDATE ubicaciones_stock SET cantidad = GREATEST(cantidad - ?, 0)
                     WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?`,
                    [cantidad, item.item_id, origen_bodega_id]
                );
                // Incrementar destino (upsert)
                await conn.query(
                    `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad)
                     VALUES (?, NULL, ?, ?)
                     ON DUPLICATE KEY UPDATE cantidad = cantidad + VALUES(cantidad)`,
                    [item.item_id, destino_bodega_id, cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo, estado: 'recibida' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    /**
     * Devolución: obra → bodega (cierre de obra, sobrante). Requiere aprobación
     * del dueño de bodega antes de movilizar. Modelo: solicitud con el flujo
     * estándar (pendiente → aprobada → en_transito → recibida) pero con
     * dirección invertida.
     *
     * payload: {
     *   origen_obra_id, destino_bodega_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?, requiere_pionetas?, cantidad_pionetas?
     * }
     */
    async devolucion(data, userId) {
        return this.crear({ ...data, tipo_flujo: 'devolucion' }, userId);
    },

    /**
     * Intra-obra: obra → obra con aprobación. Distintas obras pueden tener
     * distintos jefes, por lo que el flujo es el mismo que 'solicitud'
     * (pendiente → aprobada → en_transito → recibida). Stock se valida por obra.
     *
     * Delega en crear() con tipo_flujo='intra_obra'.
     *
     * payload: {
     *   origen_obra_id, destino_obra_id,
     *   items: [{ item_id, cantidad }],
     *   observaciones?, motivo?, requiere_pionetas?, cantidad_pionetas?
     * }
     */
    async intraObra(data, userId) {
        return this.crear({ ...data, tipo_flujo: 'intra_obra' }, userId);
    },

    /**
     * Orden de gerencia: flujo excepcional. El PM/dueño emite una orden
     * directa que bypasa 'pendiente' Y 'aprobada' — nace en 'en_transito'
     * (como push_directo) pero permite cualquier combinación origen/destino
     * y exige 'motivo' obligatorio para trazabilidad.
     *
     * Permiso: inventario.aprobar (no lo usa un bodeguero normal).
     *
     * payload: {
     *   origen_obra_id?, origen_bodega_id?,   // uno de los dos requerido
     *   destino_obra_id?, destino_bodega_id?, // uno de los dos requerido
     *   items: [{ item_id, cantidad }],
     *   motivo (OBLIGATORIO),
     *   observaciones?
     * }
     */
    async ordenGerencia(data, userId) {
        const {
            origen_obra_id, origen_bodega_id,
            destino_obra_id, destino_bodega_id,
            items, motivo, observaciones,
        } = data;

        if (!motivo || !String(motivo).trim()) {
            throw new Error('Orden de gerencia requiere motivo');
        }
        if (!origen_obra_id && !origen_bodega_id) {
            throw new Error('Debe especificar un origen (obra o bodega)');
        }
        if (origen_obra_id && origen_bodega_id) {
            throw new Error('Origen debe ser UNA obra O UNA bodega, no ambos');
        }
        if (!destino_obra_id && !destino_bodega_id) {
            throw new Error('Debe especificar un destino (obra o bodega)');
        }
        if (destino_obra_id && destino_bodega_id) {
            throw new Error('Destino debe ser UNA obra O UNA bodega, no ambos');
        }
        if (origen_obra_id && origen_obra_id === destino_obra_id) {
            throw new Error('Origen y destino no pueden ser la misma obra');
        }
        if (origen_bodega_id && origen_bodega_id === destino_bodega_id) {
            throw new Error('Origen y destino no pueden ser la misma bodega');
        }
        if (!items || !items.length) throw new Error('Debe incluir al menos un ítem');

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // Validar stock en el origen (obra o bodega).
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                if (cantidad <= 0) throw new Error(`Cantidad inválida para ítem ${item.item_id}`);
                let disponible = 0;
                if (origen_obra_id) {
                    const [stock] = await conn.query(
                        `SELECT cantidad FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id = ? AND bodega_id IS NULL`,
                        [item.item_id, origen_obra_id]
                    );
                    disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                } else {
                    const [stock] = await conn.query(
                        `SELECT cantidad FROM ubicaciones_stock
                         WHERE item_id = ? AND obra_id IS NULL AND bodega_id = ?`,
                        [item.item_id, origen_bodega_id]
                    );
                    disponible = stock.length ? Number(stock[0].cantidad) || 0 : 0;
                }
                if (cantidad > disponible) {
                    throw new Error(`Stock insuficiente para ítem ${item.item_id} en el origen. Disponible: ${disponible}, requerido: ${cantidad}`);
                }
            }

            const codigo = await this._generarCodigo();
            const [result] = await conn.query(
                `INSERT INTO transferencias
                 (codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
                  solicitante_id, aprobador_id,
                  observaciones, tipo_flujo, motivo, estado,
                  fecha_aprobacion, fecha_despacho,
                  creado_por, aprobado_por, despachado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'orden_gerencia', ?, 'en_transito', NOW(), NOW(), ?, ?, ?)`,
                [
                    codigo,
                    origen_obra_id || null,
                    origen_bodega_id || null,
                    destino_obra_id || null,
                    destino_bodega_id || null,
                    userId, userId,
                    observaciones || null,
                    String(motivo).trim(),
                    userId, userId, userId,
                ]
            );
            const trfId = result.insertId;

            // Persistir items + splits (único origen)
            for (const item of items) {
                const cantidad = parseFloat(item.cantidad) || 0;
                const [itemRes] = await conn.query(
                    `INSERT INTO transferencia_items
                     (transferencia_id, item_id, cantidad_solicitada, cantidad_enviada, origen_obra_id, origen_bodega_id)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [
                        trfId, item.item_id, cantidad, cantidad,
                        origen_obra_id || null, origen_bodega_id || null,
                    ]
                );
                await conn.query(
                    `INSERT INTO transferencia_item_origenes
                     (transferencia_item_id, origen_obra_id, origen_bodega_id, cantidad_enviada)
                     VALUES (?, ?, ?, ?)`,
                    [itemRes.insertId, origen_obra_id || null, origen_bodega_id || null, cantidad]
                );
            }

            await conn.commit();
            return { id: trfId, codigo, estado: 'en_transito' };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    },

    async getAll(query = {}, solicitanteId = null) {
        // Cuando solicitanteId viene seteado, scopear el listado a las solicitudes
        // del usuario (caller decide; típicamente cuando NO tiene
        // `inventario.transferencias.ver_todas`). null = sin filtro = ver todas.
        const { estado, page = 1, limit = 20 } = query;
        let where = 'WHERE t.activo = 1';
        const params = [];

        if (solicitanteId != null) { where += ' AND t.solicitante_id = ?'; params.push(solicitanteId); }
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

        // Normalizar DECIMAL → Number (mysql2 devuelve DECIMAL como string).
        items.forEach(i => {
            i.cantidad_solicitada = Number(i.cantidad_solicitada) || 0;
            i.cantidad_enviada = i.cantidad_enviada != null ? Number(i.cantidad_enviada) : null;
            i.cantidad_recibida = i.cantidad_recibida != null ? Number(i.cantidad_recibida) : null;
        });

        // Adjuntar splits (múltiples orígenes por ítem) si existen.
        // Un ítem aprobado normalmente tiene 1 split; si fue aprobado con
        // multi-origen tendrá N. Ítems pendientes (no aprobados aún) no tienen
        // splits — el frontend debe manejar array vacío.
        if (items.length > 0) {
            const itemIds = items.map(i => i.id);
            const [splits] = await db.query(`
                SELECT tio.transferencia_item_id, tio.origen_obra_id, tio.origen_bodega_id,
                       tio.cantidad_enviada,
                       oi.nombre as origen_obra_nombre, bi.nombre as origen_bodega_nombre
                FROM transferencia_item_origenes tio
                LEFT JOIN obras oi ON tio.origen_obra_id = oi.id
                LEFT JOIN bodegas bi ON tio.origen_bodega_id = bi.id
                WHERE tio.transferencia_item_id IN (${itemIds.map(() => '?').join(',')})
            `, itemIds);

            const splitsByItem = {};
            splits.forEach(s => {
                s.cantidad_enviada = Number(s.cantidad_enviada) || 0;
                if (!splitsByItem[s.transferencia_item_id]) splitsByItem[s.transferencia_item_id] = [];
                splitsByItem[s.transferencia_item_id].push(s);
            });
            items.forEach(i => { i.splits = splitsByItem[i.id] || []; });
        }

        // Items personalizados (fuera de catálogo). Pueden estar vacíos.
        const [itemsCustom] = await db.query(
            `SELECT id, descripcion, cantidad, unidad, observacion,
                    compra_realizada, notas_compra, fecha_compra
             FROM transferencia_items_custom
             WHERE transferencia_id = ?
             ORDER BY id ASC`,
            [id]
        );

        // Normalizar DECIMAL → Number en items personalizados
        itemsCustom.forEach(i => {
            i.cantidad = Number(i.cantidad) || 0;
        });

        return { ...rows[0], items, items_custom: itemsCustom };
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
        // Auditoría 3.6: validar/clamp page+limit antes de armar SQL.
        const rawPage = Number(query.page);
        const rawLimit = Number(query.limit);
        const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1;
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
            : 50;
        const { estado } = query;
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
            // Normalizar DECIMAL → Number (mysql2 devuelve DECIMAL como string)
            discrepancias.forEach(d => {
                d.cantidad_enviada = Number(d.cantidad_enviada) || 0;
                d.cantidad_recibida = Number(d.cantidad_recibida) || 0;
                d.diferencia = Number(d.diferencia) || 0;
            });
            const total_unidades_perdidas = discrepancias.reduce((s, d) => s + d.diferencia, 0);
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

/**
 * Servicio de ajuste masivo de stock (Ola 3 — stock bulk).
 *
 * bulkAdjust(adjustments, userId):
 *   - Upsert atómico sobre `ubicaciones_stock` para N pares (item, ubicación).
 *   - `ubicacion` es XOR: exactamente uno de { obra_id, bodega_id } debe estar seteado.
 *   - Cada ajuste puede traer `cantidad` y/o `valor_arriendo_override`.
 *   - MAX_ITEMS = 500 → 413 fuera de transacción.
 *   - Rollback total ante cualquier fallo de fila.
 *   - Devuelve { updated, created, diff } — `diff` registra cambios por fila
 *     (útil para auditoría; el logger persiste la invocación completa).
 *
 * Notas de diseño:
 *   - Mantenemos `<=>` (null-safe eq) para el lookup, igual al upsert single-row
 *     existente en inventario.service.js. Esto aprovecha el UNIQUE (item_id, obra_id,
 *     bodega_id) sin pelearnos con NULL vs NULL.
 *   - No usamos `INSERT ... ON DUPLICATE KEY UPDATE` porque necesitamos distinguir
 *     created/updated y recuperar estado previo para el diff.
 */
const db = require('../config/db');
const logger = require('../utils/logger-structured');

const MAX_ITEMS = 500;

function sanitizeAdjustment(raw, idx) {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`Ajuste #${idx}: debe ser un objeto`);
    }
    const item_id = Number(raw.item_id);
    if (!Number.isInteger(item_id) || item_id <= 0) {
        throw new Error(`Ajuste #${idx}: item_id inválido`);
    }
    const obra_id = raw.obra_id != null ? Number(raw.obra_id) : null;
    const bodega_id = raw.bodega_id != null ? Number(raw.bodega_id) : null;

    if (obra_id != null && bodega_id != null) {
        throw new Error(`Ajuste #${idx} (item=${item_id}): no puede tener obra_id y bodega_id a la vez`);
    }
    if (obra_id == null && bodega_id == null) {
        throw new Error(`Ajuste #${idx} (item=${item_id}): requiere obra_id o bodega_id`);
    }
    if (obra_id != null && (!Number.isInteger(obra_id) || obra_id <= 0)) {
        throw new Error(`Ajuste #${idx} (item=${item_id}): obra_id inválido`);
    }
    if (bodega_id != null && (!Number.isInteger(bodega_id) || bodega_id <= 0)) {
        throw new Error(`Ajuste #${idx} (item=${item_id}): bodega_id inválido`);
    }

    const fields = {};
    if (raw.cantidad !== undefined) {
        const n = Number(raw.cantidad);
        if (!Number.isFinite(n) || n < 0) {
            throw new Error(`Ajuste #${idx} (item=${item_id}): cantidad inválida`);
        }
        fields.cantidad = n;
    }
    if (raw.valor_arriendo_override !== undefined) {
        if (raw.valor_arriendo_override === null || raw.valor_arriendo_override === '') {
            fields.valor_arriendo_override = null;
        } else {
            const n = Number(raw.valor_arriendo_override);
            if (!Number.isFinite(n) || n < 0) {
                throw new Error(`Ajuste #${idx} (item=${item_id}): valor_arriendo_override inválido`);
            }
            fields.valor_arriendo_override = n;
        }
    }
    if (Object.keys(fields).length === 0) {
        throw new Error(`Ajuste #${idx} (item=${item_id}): sin campos para ajustar`);
    }

    return { item_id, obra_id, bodega_id, fields };
}

const stockBulkService = {
    MAX_ITEMS,

    /**
     * Ajuste masivo atómico de stock.
     * @param {Array} rawAdjustments
     * @param {number} userId
     * @returns {Promise<{ updated: number, created: number, diff: Array }>}
     */
    async bulkAdjust(rawAdjustments, userId) {
        if (!Array.isArray(rawAdjustments)) {
            throw new Error('Payload inválido: se esperaba un array de ajustes');
        }
        if (rawAdjustments.length === 0) {
            return { updated: 0, created: 0, diff: [] };
        }
        if (rawAdjustments.length > MAX_ITEMS) {
            const err = new Error(`Demasiados ajustes: ${rawAdjustments.length} > ${MAX_ITEMS}`);
            err.status = 413;
            throw err;
        }

        // Sanitizar todo antes de abrir la transacción
        const sanitized = rawAdjustments.map((r, i) => sanitizeAdjustment(r, i));

        // Duplicados dentro del mismo bulk: (item_id, obra_id, bodega_id) único
        const seen = new Set();
        for (const a of sanitized) {
            const key = `${a.item_id}|${a.obra_id ?? 'n'}|${a.bodega_id ?? 'n'}`;
            if (seen.has(key)) {
                throw new Error(`Ajuste duplicado: item=${a.item_id} ubicación=${a.obra_id ? 'obra_' + a.obra_id : 'bodega_' + a.bodega_id}`);
            }
            seen.add(key);
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            let updated = 0;
            let created = 0;
            const diff = [];

            for (const adj of sanitized) {
                // 1) Lookup existente con null-safe eq
                const [rows] = await conn.query(
                    `SELECT id, cantidad, valor_arriendo_override
                     FROM ubicaciones_stock
                     WHERE item_id = ? AND obra_id <=> ? AND bodega_id <=> ?
                     FOR UPDATE`,
                    [adj.item_id, adj.obra_id, adj.bodega_id]
                );

                const keys = Object.keys(adj.fields);
                const values = keys.map(k => adj.fields[k]);

                if (rows.length > 0) {
                    const prev = rows[0];
                    const setSql = keys.map(k => `${k} = ?`).join(', ');
                    const [result] = await conn.query(
                        `UPDATE ubicaciones_stock SET ${setSql} WHERE id = ?`,
                        [...values, prev.id]
                    );
                    if (result.affectedRows === 0) {
                        throw new Error(`UPDATE sin efecto en stock id=${prev.id}`);
                    }
                    // Diff
                    const changed = {};
                    for (const k of keys) {
                        const a = prev[k];
                        const b = adj.fields[k];
                        const eq = (a == null && b == null) || Number(a) === Number(b);
                        if (!eq) changed[k] = { from: a, to: b };
                    }
                    if (Object.keys(changed).length > 0) {
                        diff.push({
                            stock_id: prev.id,
                            item_id: adj.item_id,
                            obra_id: adj.obra_id,
                            bodega_id: adj.bodega_id,
                            action: 'update',
                            changed,
                        });
                    }
                    updated += 1;
                } else {
                    // Crear — cantidad por defecto 0 si no viene
                    const cantidad = adj.fields.cantidad ?? 0;
                    const valor_arriendo_override = adj.fields.valor_arriendo_override ?? null;
                    const [result] = await conn.query(
                        `INSERT INTO ubicaciones_stock (item_id, obra_id, bodega_id, cantidad, valor_arriendo_override)
                         VALUES (?, ?, ?, ?, ?)`,
                        [adj.item_id, adj.obra_id, adj.bodega_id, cantidad, valor_arriendo_override]
                    );
                    diff.push({
                        stock_id: result.insertId,
                        item_id: adj.item_id,
                        obra_id: adj.obra_id,
                        bodega_id: adj.bodega_id,
                        action: 'create',
                        changed: {
                            cantidad: { from: null, to: cantidad },
                            ...(valor_arriendo_override != null
                                ? { valor_arriendo_override: { from: null, to: valor_arriendo_override } }
                                : {}),
                        },
                    });
                    created += 1;
                }
            }

            await conn.commit();

            logger.info('ubicaciones_stock.bulkAdjust OK', {
                userId,
                count: sanitized.length,
                updated,
                created,
                changed: diff.length,
            });

            return { updated, created, diff };
        } catch (err) {
            await conn.rollback();
            logger.warn('ubicaciones_stock.bulkAdjust ROLLBACK', {
                userId,
                error: err.message,
                count: rawAdjustments.length,
            });
            throw err;
        } finally {
            conn.release();
        }
    },
};

module.exports = stockBulkService;

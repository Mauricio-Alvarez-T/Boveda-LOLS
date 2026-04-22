/**
 * Servicio de edición masiva de ítems de inventario (Ola 3).
 *
 * - bulkUpdate(items, userId): actualiza N ítems en una sola transacción.
 *   Si cualquier row falla (validación, ítem inexistente, SQL) → rollback total.
 *
 * Límites / convenciones:
 *   · MAX_ITEMS = 500 (petición más grande → 413 en la capa route).
 *   · Cada elemento debe traer `id` (entero > 0) + ≥ 1 campo editable.
 *   · Campos permitidos: subset de los mismos de la CRUD genérica.
 *   · Se devuelve `{ updated, diff }` — `diff` registra cambios por ítem (antes/después)
 *     para auditoría; el logger persiste la llamada completa.
 */
const db = require('../config/db');
const logger = require('../utils/logger-structured');

const MAX_ITEMS = 500;

// Columnas que el bulk puede tocar — mantener sincronizado con la CRUD genérica
// en `backend/index.js` (items_inventario.allowedFields). `imagen_url` queda
// intencionalmente FUERA porque se gestiona por upload dedicado.
const ALLOWED_FIELDS = [
    'categoria_id',
    'descripcion',
    'm2',
    'valor_compra',
    'valor_arriendo',
    'unidad',
    'es_consumible',
    'propietario',
    'activo',
];

const PROPIETARIO_VALIDOS = ['dedalius', 'lols'];

/**
 * Sanea el payload de un ítem: remueve campos no permitidos, normaliza tipos.
 * Devuelve `{ id, fields }` o lanza Error si el ítem es inválido.
 */
function sanitizeItem(raw, idx) {
    if (!raw || typeof raw !== 'object') {
        throw new Error(`Ítem #${idx}: debe ser un objeto`);
    }
    const id = Number(raw.id);
    if (!Number.isInteger(id) || id <= 0) {
        throw new Error(`Ítem #${idx}: id inválido`);
    }

    const fields = {};
    for (const key of ALLOWED_FIELDS) {
        if (raw[key] === undefined) continue;
        let v = raw[key];

        // Normalizaciones mínimas
        if (key === 'es_consumible' || key === 'activo') {
            v = v === true || v === 1 || v === '1' ? 1 : 0;
        }
        if (key === 'propietario' && v !== null && !PROPIETARIO_VALIDOS.includes(v)) {
            throw new Error(`Ítem #${idx} (id=${id}): propietario "${v}" inválido`);
        }
        if (key === 'categoria_id') {
            const n = Number(v);
            if (!Number.isInteger(n) || n <= 0) {
                throw new Error(`Ítem #${idx} (id=${id}): categoria_id inválido`);
            }
            v = n;
        }
        if (key === 'm2' || key === 'valor_compra' || key === 'valor_arriendo') {
            if (v === '' || v === null) v = null;
            else {
                const n = Number(v);
                if (Number.isNaN(n)) {
                    throw new Error(`Ítem #${idx} (id=${id}): ${key} no es numérico`);
                }
                v = n;
            }
        }
        if (key === 'descripcion') {
            v = String(v).trim();
            if (!v) throw new Error(`Ítem #${idx} (id=${id}): descripcion vacía`);
        }
        if (key === 'unidad' && v != null) {
            v = String(v).trim() || null;
        }

        fields[key] = v;
    }

    if (Object.keys(fields).length === 0) {
        throw new Error(`Ítem #${idx} (id=${id}): sin campos para actualizar`);
    }
    return { id, fields };
}

const itemInventarioBulkService = {
    MAX_ITEMS,
    ALLOWED_FIELDS,

    /**
     * Actualización masiva atómica.
     * @param {Array} rawItems  Payload crudo del request.
     * @param {number} userId   Quién lo dispara (para auditoría).
     * @returns {Promise<{ updated: number, diff: Array }>}
     */
    async bulkUpdate(rawItems, userId) {
        if (!Array.isArray(rawItems)) {
            throw new Error('Payload inválido: se esperaba un array de ítems');
        }
        if (rawItems.length === 0) {
            return { updated: 0, diff: [] };
        }
        if (rawItems.length > MAX_ITEMS) {
            const err = new Error(`Demasiados ítems: ${rawItems.length} > ${MAX_ITEMS}`);
            err.status = 413;
            throw err;
        }

        // 1) Sanitizar todo el payload ANTES de abrir transacción
        const sanitized = rawItems.map((r, i) => sanitizeItem(r, i));

        const ids = sanitized.map(s => s.id);
        // Chequeo duplicados: actualizar el mismo id dos veces en un bulk es ambiguo.
        const dupId = ids.find((id, i) => ids.indexOf(id) !== i);
        if (dupId !== undefined) {
            throw new Error(`Ítem id=${dupId} aparece más de una vez en el payload`);
        }

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // 2) Leer estado actual de todos los ítems involucrados (para diff + validación)
            const placeholders = ids.map(() => '?').join(',');
            const [rows] = await conn.query(
                `SELECT id, categoria_id, descripcion, m2, valor_compra, valor_arriendo,
                        unidad, es_consumible, propietario, activo
                 FROM items_inventario
                 WHERE id IN (${placeholders}) FOR UPDATE`,
                ids
            );
            if (rows.length !== ids.length) {
                const found = new Set(rows.map(r => r.id));
                const missing = ids.filter(id => !found.has(id));
                throw new Error(`Ítems inexistentes: ${missing.join(', ')}`);
            }
            const actual = Object.fromEntries(rows.map(r => [r.id, r]));

            // 3) Ejecutar UPDATE por ítem (más simple y preciso que CASE/WHEN masivo;
            //    con 500 rows es aceptable y mantiene legibilidad).
            const diff = [];
            for (const { id, fields } of sanitized) {
                const prev = actual[id];
                const keys = Object.keys(fields);
                const setSql = keys.map(k => `${k} = ?`).join(', ');
                const params = keys.map(k => fields[k]);
                params.push(id);
                const [result] = await conn.query(
                    `UPDATE items_inventario SET ${setSql} WHERE id = ?`,
                    params
                );
                if (result.affectedRows === 0) {
                    throw new Error(`UPDATE sin efecto en ítem id=${id}`);
                }
                // Registrar solo campos que REALMENTE cambiaron
                const changed = {};
                for (const k of keys) {
                    // Comparación laxa (MySQL puede devolver "1"/1, null/undefined)
                    const a = prev[k];
                    const b = fields[k];
                    const eq = (a == null && b == null) || String(a) === String(b);
                    if (!eq) changed[k] = { from: a, to: b };
                }
                if (Object.keys(changed).length > 0) {
                    diff.push({ id, changed });
                }
            }

            await conn.commit();

            logger.info('items_inventario.bulkUpdate OK', {
                userId,
                count: sanitized.length,
                changed: diff.length,
            });

            return { updated: sanitized.length, diff };
        } catch (err) {
            await conn.rollback();
            logger.warn('items_inventario.bulkUpdate ROLLBACK', {
                userId,
                error: err.message,
                count: rawItems.length,
            });
            throw err;
        } finally {
            conn.release();
        }
    },
};

module.exports = itemInventarioBulkService;

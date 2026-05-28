/**
 * Helpers para `descuentos_obra`.
 *
 * Centraliza el query y la normalización del descuento por obra para evitar
 * drift entre `inventario.service.js#getResumen`, `inventario.service.js#getStockPorObra`
 * y otros callers que necesiten el descuento aplicado.
 *
 * Política:
 *   - Solo se retornan descuentos de obras activas que participan en inventario
 *     (`obras.activa = 1 AND obras.participa_inventario = 1`).
 *   - El porcentaje se castea a `Number` para evitar `parseFloat` repetido en
 *     consumidores.
 *   - Obra sin descuento → no aparece en el Map. Consumidor debe usar
 *     `descuentoMap.get(obraId) ?? 0`.
 */

/**
 * Construye un Map<obra_id, porcentaje> con todos los descuentos activos.
 *
 * @param {import('../config/db')} db  Connection pool o transaction connection.
 * @returns {Promise<Map<number, number>>} Map<obra_id, porcentaje>. Vacío si no hay descuentos.
 */
async function getDescuentoMap(db) {
    const [rows] = await db.query(`
        SELECT d.obra_id, d.porcentaje
        FROM descuentos_obra d
        JOIN obras o ON d.obra_id = o.id
        WHERE o.activa = 1 AND o.participa_inventario = 1
    `);
    const map = new Map();
    for (const r of rows) {
        const pct = Number(r.porcentaje);
        if (Number.isFinite(pct)) {
            map.set(r.obra_id, pct);
        }
    }
    return map;
}

/**
 * Lee el descuento de UNA obra específica. Wrapper de conveniencia para
 * callers como `getStockPorObra` que ya tienen el obraId.
 *
 * No re-filtra por obra activa porque el caller ya validó (ej.
 * `getStockPorObra` rechaza obras inactivas con 404 antes de llamar aquí).
 *
 * @param {import('../config/db')} db
 * @param {number} obraId
 * @returns {Promise<number>} Porcentaje [0..100] o 0 si no existe.
 */
async function getDescuentoForObra(db, obraId) {
    const [rows] = await db.query(
        'SELECT porcentaje FROM descuentos_obra WHERE obra_id = ?',
        [obraId]
    );
    if (!rows.length) return 0;
    const pct = Number(rows[0].porcentaje);
    return Number.isFinite(pct) ? pct : 0;
}

module.exports = { getDescuentoMap, getDescuentoForObra };

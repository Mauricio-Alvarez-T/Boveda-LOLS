/**
 * Helpers para `ubicaciones_stock`.
 *
 * Schema (mig 017 + CHECK mig 050): una fila representa stock de un ítem en
 * UNA ubicación que es obra XOR bodega. La BD impone esto vía CHECK en 8.0+,
 * pero igual normalizamos en aplicación para mensajes de error decentes y
 * compatibilidad con MySQL 5.7.
 */

/**
 * Normaliza un par (obra_id, bodega_id) para INSERT/UPDATE/SELECT contra
 * `ubicaciones_stock`. Política: si hay obra, se descarta bodega (la bodega
 * dentro de una obra es descripción, no parte de la clave de ubicación).
 *
 * @param {number|null|undefined} obraId
 * @param {number|null|undefined} bodegaId
 * @returns {{ obra: number|null, bodega: number|null }}
 * @throws Error con statusCode 400 si ambos son null/0.
 */
function normalizeUbicacion(obraId, bodegaId) {
    const oid = obraId && Number(obraId) > 0 ? Number(obraId) : null;
    const bid = bodegaId && Number(bodegaId) > 0 ? Number(bodegaId) : null;
    if (!oid && !bid) {
        const err = new Error('Falta ubicación: requiere obra_id o bodega_id');
        err.statusCode = 400;
        throw err;
    }
    return { obra: oid, bodega: oid ? null : bid };
}

module.exports = { normalizeUbicacion };

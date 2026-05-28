/**
 * Kardex de movimientos de stock (mig 054).
 *
 * Cada cambio en `ubicaciones_stock.cantidad` debe dejar una fila acá con el
 * delta exacto (antes→después), tipo, referencia y usuario. Da trazabilidad
 * tipo kardex: "qué se movió, cuánto, cuándo, quién y por qué".
 *
 * `registrarMovimiento` SIEMPRE recibe una conexión `conn` y debe correr
 * dentro de la MISMA transacción que mutó el stock — así stock y kardex son
 * atómicos (o ambos o ninguno).
 */

const TIPOS_VALIDOS = new Set([
    'ajuste_manual',
    'transferencia_salida',
    'transferencia_entrada',
    'discrepancia',
    'factura',
    'recepcion',
]);

/**
 * Inserta una fila en stock_movimientos.
 *
 * @param {object} conn  Conexión de transacción (db.getConnection()).
 * @param {object} mov
 * @param {number} mov.item_id
 * @param {number|null} [mov.obra_id]
 * @param {number|null} [mov.bodega_id]   XOR con obra_id.
 * @param {string} mov.tipo               Uno de TIPOS_VALIDOS.
 * @param {number} mov.cantidad_anterior
 * @param {number} mov.cantidad_nueva
 * @param {string|null} [mov.referencia_tipo]
 * @param {number|null} [mov.referencia_id]
 * @param {string|null} [mov.motivo]
 * @param {number|null} [mov.usuario_id]
 */
async function registrarMovimiento(conn, mov) {
    const {
        item_id,
        obra_id = null,
        bodega_id = null,
        tipo,
        cantidad_anterior,
        cantidad_nueva,
        referencia_tipo = null,
        referencia_id = null,
        motivo = null,
        usuario_id = null,
    } = mov;

    if (!TIPOS_VALIDOS.has(tipo)) {
        throw new Error(`stockMovimiento: tipo inválido "${tipo}"`);
    }

    // No registrar si no hubo cambio real (delta 0) — evita ruido en el kardex.
    if (Number(cantidad_anterior) === Number(cantidad_nueva)) return;

    await conn.query(
        `INSERT INTO stock_movimientos
         (item_id, obra_id, bodega_id, tipo, cantidad_anterior, cantidad_nueva,
          referencia_tipo, referencia_id, motivo, usuario_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            item_id,
            obra_id,
            bodega_id,
            tipo,
            cantidad_anterior,
            cantidad_nueva,
            referencia_tipo,
            referencia_id,
            motivo,
            usuario_id,
        ]
    );
}

module.exports = { registrarMovimiento, TIPOS_VALIDOS };

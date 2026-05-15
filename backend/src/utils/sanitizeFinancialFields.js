/**
 * Helpers para omitir campos $ del JSON de respuesta cuando el usuario no
 * tiene los permisos financieros correspondientes.
 *
 * Política deny-by-default: si la lista de permisos no contiene el permiso
 * requerido, los campos $ se eliminan del objeto. Soporta valores nulos,
 * arrays, y objetos anidados típicos del inventario.
 *
 * Diseñado para uso en route handlers DESPUÉS de obtener el resultado del
 * service y ANTES de `res.json()`:
 *
 *     const result = await inventarioService.getStockPorObra(obraId);
 *     res.json({ data: sanitizeItems(result, req.user?.p || []) });
 *
 * Reusa `req.user.p` (array de strings) tal como lo deja `verifyToken`.
 */

// ─────────────────────────────────────────────────────────────────────────
// Predicados base
// ─────────────────────────────────────────────────────────────────────────

function has(perms, key) {
    return Array.isArray(perms) && perms.includes(key);
}

// ─────────────────────────────────────────────────────────────────────────
// Sanitizers por entidad
// Devuelven una COPIA sin los campos $ cuando falta el permiso. Si tiene
// el permiso, devuelven el objeto sin tocar (mismo ref — micro-optim).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Item de inventario o cualquier objeto con `valor_compra` / `valor_arriendo` /
 * `valor_arriendo_override` / agregados de arriendo por obra.
 */
function sanitizeItemCosto(item, perms) {
    if (item == null) return item;
    if (has(perms, 'inventario.costos.ver')) return item;
    const {
        valor_compra,
        valor_arriendo,
        valor_arriendo_override,
        ...rest
    } = item;
    return rest;
}

/**
 * Resumen ejecutivo / dashboards de inventario con valores agregados.
 * Si no puede ver montos $ del resumen, omitimos los totales monetarios.
 */
function sanitizeResumenInventario(resumen, perms) {
    if (resumen == null) return resumen;
    if (has(perms, 'inventario.resumen.ver_valores')) return resumen;

    // Clon superficial para no mutar el original.
    const clean = { ...resumen };

    // Top-level: valor_bruto, valor_neto, subtotal_bruto, etc.
    delete clean.valor_bruto;
    delete clean.valor_neto;
    delete clean.subtotal_bruto;
    delete clean.subtotal_neto;
    delete clean.costo_externo;
    delete clean.valor_mensual;

    // Top obras: cada obra puede traer valor_neto/valor_bruto.
    if (Array.isArray(clean.top_obras)) {
        clean.top_obras = clean.top_obras.map(o => {
            const { valor, valor_bruto, valor_neto, valor_mensual, descuento_porcentaje, ...obraRest } = o;
            return obraRest;
        });
    }
    if (Array.isArray(clean.obras)) {
        clean.obras = clean.obras.map(o => {
            const { valor, valor_bruto, valor_neto, valor_mensual, descuento_porcentaje, ...obraRest } = o;
            return obraRest;
        });
    }

    // KPIs anidados (bombas, etc.) — omitir campos $ explícitos.
    if (clean.bombas && typeof clean.bombas === 'object') {
        const { costo_externo, costo_total, costo, ...bRest } = clean.bombas;
        clean.bombas = bRest;
    }

    return clean;
}

/**
 * Registro de bomba de hormigón — sanitiza `costo`.
 */
function sanitizeRegistroBomba(reg, perms) {
    if (reg == null) return reg;
    if (has(perms, 'inventario.bombas.ver_costos')) return reg;
    const { costo, ...rest } = reg;
    return rest;
}

/**
 * Trabajador — sanitiza campos $ futuros (sueldo, anticipo, descuento).
 * Hoy estos campos no existen en la BD; el helper queda listo para cuando
 * se agreguen, sin necesidad de tocar los routes.
 */
function sanitizeTrabajadorFinanciero(t, perms) {
    if (t == null) return t;
    if (has(perms, 'trabajadores.financiero.ver')) return t;
    const {
        sueldo_base,
        sueldo_bruto,
        sueldo_liquido,
        anticipo,
        descuento_total,
        bono,
        gratificacion,
        valor_hora,
        ...rest
    } = t;
    return rest;
}

// ─────────────────────────────────────────────────────────────────────────
// Wrappers para colecciones (arrays) — atajo común
// ─────────────────────────────────────────────────────────────────────────

function sanitizeItemsCosto(arr, perms) {
    if (!Array.isArray(arr)) return arr;
    if (has(perms, 'inventario.costos.ver')) return arr;
    return arr.map(item => sanitizeItemCosto(item, perms));
}

function sanitizeRegistrosBomba(arr, perms) {
    if (!Array.isArray(arr)) return arr;
    if (has(perms, 'inventario.bombas.ver_costos')) return arr;
    return arr.map(r => sanitizeRegistroBomba(r, perms));
}

function sanitizeTrabajadoresFinanciero(arr, perms) {
    if (!Array.isArray(arr)) return arr;
    if (has(perms, 'trabajadores.financiero.ver')) return arr;
    return arr.map(t => sanitizeTrabajadorFinanciero(t, perms));
}

// ─────────────────────────────────────────────────────────────────────────
// Guard: bloquea PUT body que intenta editar campos $ sin el permiso
// correspondiente. Devuelve { ok:true } o { ok:false, error:string }.
// ─────────────────────────────────────────────────────────────────────────

function guardEditCostos(body, perms) {
    const touchesCostos =
        body && (
            Object.prototype.hasOwnProperty.call(body, 'valor_compra') ||
            Object.prototype.hasOwnProperty.call(body, 'valor_arriendo') ||
            Object.prototype.hasOwnProperty.call(body, 'valor_arriendo_override')
        );
    if (!touchesCostos) return { ok: true };
    if (has(perms, 'inventario.costos.editar')) return { ok: true };
    return { ok: false, error: 'No autorizado para editar campos financieros (valor_compra / valor_arriendo).' };
}

module.exports = {
    has,
    sanitizeItemCosto,
    sanitizeItemsCosto,
    sanitizeResumenInventario,
    sanitizeRegistroBomba,
    sanitizeRegistrosBomba,
    sanitizeTrabajadorFinanciero,
    sanitizeTrabajadoresFinanciero,
    guardEditCostos,
};

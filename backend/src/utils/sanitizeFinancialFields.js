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
 *
 * Soporta DOS shapes de entrada:
 *   A) Dashboard ejecutivo: { valor_bruto, valor_neto, top_obras: [{valor, ...}], bombas: {costo_externo}, ... }
 *   B) Resumen mensual:     { obras, bodegas, categorias: [{items: [{valor_arriendo, total_arriendo, ubicaciones: {[k]:{cantidad,total}}}]}], descuentos }
 */
function sanitizeResumenInventario(resumen, perms) {
    if (resumen == null) return resumen;
    if (has(perms, 'inventario.resumen.ver_valores')) return resumen;

    // Clon superficial para no mutar el original.
    const clean = { ...resumen };

    // ── Shape A: dashboard ejecutivo (top-level $) ──
    delete clean.valor_bruto;
    delete clean.valor_neto;
    delete clean.subtotal_bruto;
    delete clean.subtotal_neto;
    delete clean.costo_externo;
    delete clean.valor_mensual;
    delete clean.total_facturacion;
    delete clean.total_con_descuento;
    delete clean.descuento_monto;
    delete clean.descuento_porcentaje;

    // valor_por_categoria: ranking de categorías por valor $ — omitir entero.
    delete clean.valor_por_categoria;

    // kpis.valor_total_obras anidado dentro de kpis — limpiar
    if (clean.kpis && typeof clean.kpis === 'object') {
        const { valor_total_obras, valor_total_costo_obras, ...kRest } = clean.kpis;
        clean.kpis = kRest;
    }

    // top_obras / obras: cada obra puede traer valores monetarios.
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

    // ── Shape B: resumen mensual con categorías + items + ubicaciones ──
    // Mapa de descuentos por obra: lo eliminamos completamente (es información $).
    if (clean.descuentos !== undefined) {
        delete clean.descuentos;
    }
    // Auditoría 6.1: totales agregados (valor_bruto/neto/descuento) son $ — omitir.
    if (clean.totales !== undefined) {
        delete clean.totales;
    }

    if (Array.isArray(clean.categorias)) {
        clean.categorias = clean.categorias.map(cat => {
            if (!cat || typeof cat !== 'object') return cat;
            const cCat = { ...cat };
            // Subtotales monetarios por categoría
            delete cCat.subtotal_arriendo;
            // Items dentro de la categoría
            if (Array.isArray(cCat.items)) {
                cCat.items = cCat.items.map(it => {
                    if (!it || typeof it !== 'object') return it;
                    const cItem = { ...it };
                    delete cItem.valor_arriendo;
                    delete cItem.valor_compra;
                    delete cItem.total_arriendo;
                    delete cItem.total;
                    // ubicaciones: { obra_X: {cantidad, total}, bodega_Y: {...} }
                    // Quitamos `total` de cada ubicación, dejamos `cantidad`.
                    if (cItem.ubicaciones && typeof cItem.ubicaciones === 'object') {
                        const ubic = {};
                        for (const key of Object.keys(cItem.ubicaciones)) {
                            const u = cItem.ubicaciones[key];
                            if (u && typeof u === 'object') {
                                const { total, ...uRest } = u;
                                ubic[key] = uRest;
                            } else {
                                ubic[key] = u;
                            }
                        }
                        cItem.ubicaciones = ubic;
                    }
                    return cItem;
                });
            }
            return cCat;
        });
    }

    return clean;
}

/**
 * Stock detallado por ubicación (obra o bodega). Estructura:
 *   { obra, categorias: [{items: [{valor_arriendo, total}], subtotal_arriendo}], total_facturacion, descuento_*, total_con_descuento }
 * Gateado por `inventario.costos.ver` — sin permiso, vista solo con cantidades.
 */
function sanitizeStockUbicacionData(data, perms) {
    if (data == null) return data;
    if (has(perms, 'inventario.costos.ver')) return data;

    const clean = { ...data };
    // Totales generales monetarios
    delete clean.total_facturacion;
    delete clean.descuento_porcentaje;
    delete clean.descuento_monto;
    delete clean.total_con_descuento;

    if (Array.isArray(clean.categorias)) {
        clean.categorias = clean.categorias.map(cat => {
            if (!cat || typeof cat !== 'object') return cat;
            const cCat = { ...cat };
            delete cCat.subtotal_arriendo;
            if (Array.isArray(cCat.items)) {
                cCat.items = cCat.items.map(it => {
                    if (!it || typeof it !== 'object') return it;
                    const cItem = { ...it };
                    delete cItem.valor_arriendo;
                    delete cItem.valor_compra;
                    delete cItem.total;
                    return cItem;
                });
            }
            return cCat;
        });
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

/**
 * Middleware Express: intercepta `res.json` y limpia campos $ de listas o
 * items individuales del catálogo maestro (`/api/items-inventario`). Usado
 * cuando la ruta proviene del CRUD genérico (no aplicamos sanitizer manual
 * por route handler). Soporta tres shapes:
 *   - { data: [items], total } (listado paginado)
 *   - [items]                  (listado plano)
 *   - { ...item }              (registro individual)
 */
function sanitizeItemsMaestroMiddleware(req, res, next) {
    const original = res.json.bind(res);
    res.json = (body) => {
        const perms = req.user?.p;
        if (has(perms, 'inventario.costos.ver')) return original(body);
        if (body == null) return original(body);

        // Listado paginado
        if (body && Array.isArray(body.data)) {
            return original({ ...body, data: body.data.map(it => sanitizeItemCosto(it, perms)) });
        }
        // Array plano
        if (Array.isArray(body)) {
            return original(body.map(it => sanitizeItemCosto(it, perms)));
        }
        // Item individual con id (heurística: tiene valor_compra o valor_arriendo)
        if (typeof body === 'object' && (
            Object.prototype.hasOwnProperty.call(body, 'valor_compra') ||
            Object.prototype.hasOwnProperty.call(body, 'valor_arriendo')
        )) {
            return original(sanitizeItemCosto(body, perms));
        }
        return original(body);
    };
    next();
}

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
    sanitizeStockUbicacionData,
    sanitizeRegistroBomba,
    sanitizeRegistrosBomba,
    sanitizeTrabajadorFinanciero,
    sanitizeTrabajadoresFinanciero,
    sanitizeItemsMaestroMiddleware,
    guardEditCostos,
};

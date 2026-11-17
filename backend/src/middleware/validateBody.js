/**
 * Auditoría 4.4 / Plan v2 F1.3 — middleware de validación de body para rutas principales.
 *
 * No usamos Joi/zod (no queríamos agregar otra dep; además el deploy excluye
 * node_modules → una dep nueva exigiría npm install manual en cPanel). En su
 * lugar, mini-DSL declarativo propio: required, type, min/max, minLength,
 * maxLength, in[], format ('email'|'date'), pattern (RegExp) y arrayOf vía
 * itemRules. Para los pocos endpoints críticos alcanza de sobra.
 *
 * Uso:
 *   router.put('/stock', validateBody({
 *     item_id: { required: true, type: 'integer', min: 1 },
 *     cantidad: { type: 'integer', min: 0, max: 999999 },
 *   }), handler);
 *
 * Strip de claves desconocidas (opt-in, F1.3): validateBody(schema, { strip: true })
 * reemplaza req.body por SOLO las claves declaradas en el schema (anti
 * mass-assignment). Solo top-level — arrays/objetos anidados pasan intactos.
 *
 * Si la validación falla → res.status(400).json({ error: 'detalle...' }).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function _checkValue(name, value, rule) {
    if (value === undefined || value === null) {
        if (rule.required) return `${name} es requerido`;
        return null;
    }

    switch (rule.type) {
        case 'integer':
            if (!Number.isInteger(Number(value)) || !Number.isFinite(Number(value))) {
                return `${name} debe ser un entero`;
            }
            break;
        case 'number':
            if (!Number.isFinite(Number(value))) return `${name} debe ser un número`;
            break;
        case 'string':
            if (typeof value !== 'string') return `${name} debe ser un string`;
            if (rule.minLength && value.length < rule.minLength) {
                return `${name} debe tener al menos ${rule.minLength} caracteres`;
            }
            if (rule.maxLength && value.length > rule.maxLength) {
                return `${name} excede ${rule.maxLength} caracteres`;
            }
            if (rule.format === 'email' && !EMAIL_RE.test(value)) {
                return `${name} debe ser un email válido`;
            }
            if (rule.format === 'date' && !DATE_RE.test(value)) {
                return `${name} debe tener formato YYYY-MM-DD`;
            }
            if (rule.pattern && !rule.pattern.test(value)) {
                return `${name} tiene un formato inválido`;
            }
            break;
        case 'boolean':
            if (typeof value !== 'boolean') return `${name} debe ser true|false`;
            break;
        case 'array':
            if (!Array.isArray(value)) return `${name} debe ser un array`;
            if (rule.minLength && value.length < rule.minLength) {
                return `${name} debe tener al menos ${rule.minLength} elemento(s)`;
            }
            if (rule.itemRules) {
                for (let i = 0; i < value.length; i += 1) {
                    for (const [subKey, subRule] of Object.entries(rule.itemRules)) {
                        const err = _checkValue(`${name}[${i}].${subKey}`, value[i]?.[subKey], subRule);
                        if (err) return err;
                    }
                }
            }
            break;
        // 'any' o ausente → no chequear tipo
    }

    if (rule.min != null && Number(value) < rule.min) {
        return `${name} debe ser >= ${rule.min}`;
    }
    if (rule.max != null && Number(value) > rule.max) {
        return `${name} debe ser <= ${rule.max}`;
    }
    if (rule.in && !rule.in.includes(value)) {
        return `${name} debe ser uno de: ${rule.in.join(', ')}`;
    }
    return null;
}

/**
 * Valida un objeto suelto con el mismo mini-DSL (para cuerpos con listas de objetos que llevan su propio schema,
 * p. ej. POST /sitio-web/editor/guardar). `prefijo` antecede el nombre del campo en el mensaje. Devuelve
 * { error } o { valor } (con `strip`, solo las claves declaradas presentes, como el middleware).
 */
function validarObjeto(schema, body, { strip = false, prefijo = '' } = {}) {
    const obj = body || {};
    for (const [name, rule] of Object.entries(schema)) {
        const err = _checkValue(`${prefijo}${name}`, obj[name], rule);
        if (err) return { error: err };
    }
    if (!strip) return { valor: obj };
    // Strip de claves desconocidas (anti mass-assignment). Solo top-level:
    // conserva las claves declaradas que estén presentes (incluido null);
    // descarta undefined y todo lo no declarado. Los valores anidados
    // (arrays/objetos) pasan tal cual.
    const clean = {};
    for (const key of Object.keys(schema)) {
        if (obj[key] !== undefined) clean[key] = obj[key];
    }
    return { valor: clean };
}

function validateBody(schema, options = {}) {
    const { strip = false } = options;
    return (req, res, next) => {
        const r = validarObjeto(schema, req.body || {}, { strip });
        if (r.error) return res.status(400).json({ error: r.error });
        if (strip) req.body = r.valor;
        next();
    };
}

module.exports = validateBody;
module.exports.validarObjeto = validarObjeto;

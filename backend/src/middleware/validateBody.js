/**
 * Auditoría 4.4 — middleware de validación de body para rutas principales.
 *
 * No usamos Joi (no queríamos agregar otra dep) — implementamos un mini-DSL
 * declarativo que cubre los chequeos básicos: required, type, min/max,
 * arrayOf{...}. Suficiente para los pocos endpoints críticos del módulo
 * Inventario. Para validaciones más complejas habría que migrar a Joi/Zod.
 *
 * Uso:
 *   router.put('/stock', validateBody({
 *     item_id: { required: true, type: 'integer', min: 1 },
 *     cantidad: { type: 'integer', min: 0, max: 999999 },
 *   }), handler);
 *
 * Si la validación falla → res.status(400).json({ error: 'detalle...' }).
 */

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
            if (rule.maxLength && value.length > rule.maxLength) {
                return `${name} excede ${rule.maxLength} caracteres`;
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

function validateBody(schema) {
    return (req, res, next) => {
        const body = req.body || {};
        for (const [name, rule] of Object.entries(schema)) {
            const err = _checkValue(name, body[name], rule);
            if (err) return res.status(400).json({ error: err });
        }
        next();
    };
}

module.exports = validateBody;

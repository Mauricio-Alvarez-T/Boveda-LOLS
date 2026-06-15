/**
 * Schemas de validación para endpoints de escritura de Transferencias. Plan v2 F1.3.
 *
 * Strip top-level: los arrays anidados (items, items_custom, splits) pasan
 * intactos — sus reglas validan presencia/tipos básicos; la lógica fina
 * (multi-origen, SoD, stock) la valida el service. `crearTransferencia` incluye
 * TODOS los campos que lee service.crear (y los origen_* de los flujos que
 * delegan en él) para que el strip no borre nada legítimo. `tipo_flujo` se
 * conserva si viene, pero el handler lo sobreescribe server-side en las rutas
 * específicas (solicitud-materiales, etc.).
 */

const crearTransferencia = {
    items: {
        type: 'array', itemRules: {
            item_id: { required: true, type: 'integer', min: 1 },
            cantidad: { type: 'number', min: 0 },
        },
    },
    items_custom: {
        type: 'array', itemRules: {
            descripcion: { required: true, type: 'string', maxLength: 500 },
            cantidad: { type: 'number', min: 0 },
            unidad: { type: 'string', maxLength: 50 },
            observacion: { type: 'string', maxLength: 1000 },
        },
    },
    origen_obra_id: { type: 'integer', min: 1 },
    origen_bodega_id: { type: 'integer', min: 1 },
    destino_obra_id: { type: 'integer', min: 1 },
    destino_bodega_id: { type: 'integer', min: 1 },
    observaciones: { type: 'string', maxLength: 1000 },
    motivo: { type: 'string', maxLength: 1000 },
    requiere_pionetas: { type: 'boolean' },
    cantidad_pionetas: { type: 'integer', min: 0 },
    tipo_flujo: { type: 'string', maxLength: 50 },
};

// PUT /:id/aprobar — payload flexible (legacy / multi-origen). itemRules lenient:
// solo exige item_id; splits/cantidades anidados pasan intactos (strip es top-level).
const aprobar = {
    items: { type: 'array', itemRules: { item_id: { required: true, type: 'integer', min: 1 } } },
    items_custom: { type: 'array' },
    items_custom_nuevos: { type: 'array' },
    origen_obra_id: { type: 'integer', min: 1 },
    origen_bodega_id: { type: 'integer', min: 1 },
};

// PUT /:id/recibir
const recibir = {
    items: {
        type: 'array', itemRules: {
            item_id: { required: true, type: 'integer', min: 1 },
            cantidad_recibida: { type: 'number', min: 0 },
            observacion: { type: 'string', maxLength: 1000 },
        },
    },
    items_custom: {
        type: 'array', itemRules: {
            transferencia_item_custom_id: { required: true, type: 'integer', min: 1 },
            cantidad_recibida: { type: 'number', min: 0 },
        },
    },
    tipo: { type: 'string', in: ['parcial', 'total'] },
    observacion: { type: 'string', maxLength: 1000 },
};

// PUT /discrepancias/:id/resolver
const resolverDiscrepancia = {
    estado: { required: true, type: 'string', in: ['resuelta', 'descartada'] },
    resolucion: { required: true, type: 'string', minLength: 1, maxLength: 1000 },
};

// ── Flujos especiales (antes sin validateBody) ──
// Items de catálogo: { item_id, cantidad }. Sin items_custom (esos flujos los
// rechaza el service). Validación de presencia/tipo acá; la lógica de negocio
// (stock, origen≠destino, etc.) sigue en el service como defensa en profundidad.
// Sin strip: el service destructura explícito y los wrappers agregan tipo_flujo.
const _itemsCatalogo = {
    required: true, type: 'array', minLength: 1,
    itemRules: {
        item_id: { required: true, type: 'integer', min: 1 },
        cantidad: { type: 'number', min: 0 },
    },
};

// POST /push-directo — bodega → obra sin aprobación
const pushDirecto = {
    origen_bodega_id: { required: true, type: 'integer', min: 1 },
    destino_obra_id: { required: true, type: 'integer', min: 1 },
    items: _itemsCatalogo,
    observaciones: { type: 'string', maxLength: 1000 },
    motivo: { type: 'string', maxLength: 1000 },
};

// POST /intra-bodega — bodega → bodega con aprobación
const intraBodega = {
    origen_bodega_id: { required: true, type: 'integer', min: 1 },
    destino_bodega_id: { required: true, type: 'integer', min: 1 },
    items: _itemsCatalogo,
    observaciones: { type: 'string', maxLength: 1000 },
    motivo: { type: 'string', maxLength: 1000 },
};

// POST /devolucion — obra → bodega con aprobación
const devolucion = {
    origen_obra_id: { required: true, type: 'integer', min: 1 },
    destino_bodega_id: { required: true, type: 'integer', min: 1 },
    items: _itemsCatalogo,
    observaciones: { type: 'string', maxLength: 1000 },
    motivo: { type: 'string', maxLength: 1000 },
    requiere_pionetas: { type: 'boolean' },
    cantidad_pionetas: { type: 'integer', min: 0 },
};

// POST /intra-obra — obra → obra con aprobación
const intraObra = {
    origen_obra_id: { required: true, type: 'integer', min: 1 },
    destino_obra_id: { required: true, type: 'integer', min: 1 },
    items: _itemsCatalogo,
    observaciones: { type: 'string', maxLength: 1000 },
    motivo: { type: 'string', maxLength: 1000 },
    requiere_pionetas: { type: 'boolean' },
    cantidad_pionetas: { type: 'integer', min: 0 },
};

module.exports = {
    crearTransferencia, aprobar, recibir, resolverDiscrepancia,
    pushDirecto, intraBodega, devolucion, intraObra,
};

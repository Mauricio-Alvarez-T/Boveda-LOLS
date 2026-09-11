/**
 * Schemas (mini-DSL de validateBody) de las rutas especializadas de trabajadores.
 * Solo FORMA; el negocio (fecha ≥ ingreso, detalle obligatorio según causal, estado) vive en
 * services/desvinculacion.service.js.
 */
const { codigosSeleccionables } = require('../config/causalesDesvinculacion');

// PUT /:id/desvincular
const desvincular = {
    fecha_desvinculacion: { required: true, type: 'string', format: 'date' },
    causal_codigo: { required: true, type: 'string', in: codigosSeleccionables() },
    detalle: { type: 'string', maxLength: 2000 },
    no_recontratar: { type: 'boolean' },
};

// PUT /:id/reactivar — la marca "no recontratar" se conserva salvo pedido explícito.
const reactivar = {
    quitar_marca_no_recontratar: { type: 'boolean' },
};

module.exports = { desvincular, reactivar };

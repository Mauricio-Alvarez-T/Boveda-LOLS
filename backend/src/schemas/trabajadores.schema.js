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

// PUT /:id/reactivar = REINGRESO (mig 152): abre un período nuevo desde `fecha_ingreso`.
// Empresa/obra/cargo/categoría solo se cambian si vienen; `fecha_termino_contrato` null = indefinido.
// La marca "no recontratar" se conserva salvo pedido explícito.
const reactivar = {
    fecha_ingreso: { required: true, type: 'string', format: 'date' },
    empresa_id: { type: 'integer', min: 1 },
    obra_id: { type: 'integer', min: 1 },
    cargo_id: { type: 'integer', min: 1 },
    categoria_reporte: { type: 'string', in: ['obra', 'operaciones', 'rotativo'] },
    fecha_termino_contrato: { type: 'string', format: 'date' },
    quitar_marca_no_recontratar: { type: 'boolean' },
};

module.exports = { desvincular, reactivar };

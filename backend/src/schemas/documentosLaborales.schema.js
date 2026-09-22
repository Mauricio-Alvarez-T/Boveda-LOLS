/**
 * Schemas (mini-DSL de validateBody) de /api/documentos-laborales. Solo FORMA; el negocio
 * (datos faltantes, trabajador desvinculado, tipo no configurado) vive en documentosLaborales.service.
 */
const { EMITIBLES, KIT_INGRESO } = require('../plantillas/documentos');

/** Línea concepto/monto del finiquito (haberes y descuentos). CLP entero, sin negativos. */
const LINEA_MONTO = {
    concepto: { required: true, type: 'string', maxLength: 120 },
    monto: { required: true, type: 'integer', min: 0, max: 999999999 },
};

// POST /emitir/:trabajadorId — un documento suelto (amonestación, finiquito o cualquiera del kit).
const emitir = {
    codigo: { required: true, type: 'string', in: [...EMITIBLES] },
    fecha_documento: { type: 'string', format: 'date' },
    // Contrato
    dias_plazo: { type: 'integer', min: 1, max: 365 },
    // EPP
    epp_items: { type: 'array', itemRules: {} },
    // ODI
    division: { type: 'string', maxLength: 60 },
    ubicacion: { type: 'string', maxLength: 120 },
    duracion_charla: { type: 'string', maxLength: 40 },
    // Amonestación
    fecha_carta: { type: 'string', format: 'date' },
    fecha_infraccion: { type: 'string', format: 'date' },
    motivo: { type: 'string', maxLength: 200 },
    detalle: { type: 'string', maxLength: 2000 },
    // Finiquito (B5). Las líneas se validan una a una (itemRules); el tope de 10 y el total ≥ 0 son
    // negocio (finiquito.plantilla.requiere). `causal_codigo` solo aplica si la baja no tiene artículo.
    fecha_finiquito: { type: 'string', format: 'date' },
    lugar_firma: { type: 'string', maxLength: 100 },
    haberes: { type: 'array', itemRules: LINEA_MONTO },
    descuentos: { type: 'array', itemRules: LINEA_MONTO },
    causal_codigo: { type: 'string', maxLength: 30 },
};

// POST /kit-ingreso/:trabajadorId — varios documentos del kit de una vez (casillas del modal).
const kitIngreso = {
    documentos: { required: true, type: 'array', minLength: 1 },
    fecha_documento: { type: 'string', format: 'date' },
    dias_plazo: { type: 'integer', min: 1, max: 365 },
    epp_items: { type: 'array', itemRules: {} },
    division: { type: 'string', maxLength: 60 },
    ubicacion: { type: 'string', maxLength: 120 },
    duracion_charla: { type: 'string', maxLength: 40 },
};

module.exports = { emitir, kitIngreso, KIT_INGRESO };

/**
 * Schemas (mini-DSL de validateBody) de /api/documentos-laborales. Solo FORMA; el negocio
 * (datos faltantes, trabajador desvinculado, tipo no configurado) vive en documentosLaborales.service.
 */
const { EMITIBLES, KIT_INGRESO } = require('../plantillas/documentos');

// POST /emitir/:trabajadorId — un documento suelto (amonestación o cualquiera del kit).
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

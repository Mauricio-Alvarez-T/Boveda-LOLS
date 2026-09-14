/**
 * Schemas (mini-DSL de validateBody) de /api/documentos-lotes (plan Gestiones B6). Solo FORMA; el
 * negocio (documento no disponible, lote ajeno, estado del lote) vive en documentosLotes.service.
 * Los arrays de ids se sanean en el service (enteros > 0, sin repetidos): itemRules solo valida objetos.
 */

// POST / — RRHH arma un lote para un portador.
const crear = {
    portador_id: { required: true, type: 'integer', min: 1 },
    documento_ids: { required: true, type: 'array', minLength: 1 },
    observacion: { type: 'string', maxLength: 500 },
};

// PUT /:id/confirmar-retiro — el portador dice qué documentos SÍ recibió (vacío = ninguno).
const confirmarRetiro = {
    documento_ids: { required: true, type: 'array' },
};

// PUT /:id/recepcion — RRHH recibe firmados y/o devueltos sin firma (al menos uno de los dos con datos).
const recepcion = {
    firmados: { type: 'array' },
    sin_firma: { type: 'array' },
    observacion: { type: 'string', maxLength: 300 },
};

module.exports = { crear, confirmarRetiro, recepcion };

/**
 * Schemas de validación (mini-DSL de validateBody) para /api/cargo-sueldos.
 *
 * Solo FORMA: enteros CLP ≥ 0 y largo de observaciones. Las reglas de negocio
 * (cargo existe, historial solo si cambió un monto) viven en cargoSueldo.service.js.
 * Los bonos son opcionales: si no vienen, el service conserva el valor anterior (o 0).
 */
const MAX_SUELDO = 99999999;   // $99.999.999
const MAX_BONO = 9999999;      // $9.999.999

const upsert = {
    sueldo_base: { required: true, type: 'integer', min: 0, max: MAX_SUELDO },
    bono_colacion: { type: 'integer', min: 0, max: MAX_BONO },
    bono_movilizacion: { type: 'integer', min: 0, max: MAX_BONO },
    observaciones: { type: 'string', maxLength: 500 },
};

module.exports = { upsert, MAX_SUELDO, MAX_BONO };

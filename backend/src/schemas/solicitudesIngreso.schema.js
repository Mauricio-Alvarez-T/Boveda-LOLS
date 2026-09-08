/**
 * Schemas de validación (mini-DSL de validateBody) para la ficha de ingreso
 * digital: POST /api/solicitudes-ingreso (terreno) y PUT /:id/aprobar (oficina).
 *
 * Las rutas usan { strip: true }: cualquier clave no declarada se elimina del
 * body antes de llegar al service (anti mass-assignment). Por eso estos campos
 * son superset-exacto de lo que solicitudIngreso.service normaliza.
 *
 * Reglas de forma solamente. Las de negocio viven en el service: DV del RUT
 * (utils/rut.validateRut → 400), RUT ya existente en trabajadores o con
 * solicitud pendiente (409), trims, '' → NULL en opcionales.
 *
 * Campos de la ficha (decisión del dueño 2026-09-07):
 *   ○ obligatorios: rut, nombres, apellido_paterno, cargo_id, obra_id, fecha_ingreso
 *   — opcionales: apellido_materno, fecha_nacimiento, estado_civil, direccion,
 *     comuna, afp, salud, nacionalidad, telefono, cargas_familiares, observaciones
 *   Ficha completa (mig 109, pedido de oficina 2026-09-08), también opcionales:
 *     talla_calzado (35-47), talla_pantalon (38-50), talla_polera (S-XXL),
 *     cuenta_rut (boolean; con true el service fija BancoEstado/vista/RUT sin DV),
 *     banco, tipo_cuenta (vista | corriente), numero_cuenta.
 *   EMPRESA la pone la oficina al aprobar → solo en `aprobar`, obligatoria.
 */

// rut: maxLength holgado a propósito (la columna es VARCHAR(12) pero el
// service lo normaliza con formatRut antes de guardar; un "12.345.678-9 " con
// espacio no debe rebotar por largo sino por DV si corresponde).
const fichaRules = {
    rut: { required: true, type: 'string', minLength: 1, maxLength: 20 },
    nombres: { required: true, type: 'string', minLength: 1, maxLength: 100 },
    apellido_paterno: { required: true, type: 'string', minLength: 1, maxLength: 100 },
    apellido_materno: { type: 'string', maxLength: 100 },
    cargo_id: { required: true, type: 'integer', min: 1 },
    obra_id: { required: true, type: 'integer', min: 1 },
    fecha_ingreso: { required: true, type: 'string', format: 'date' },
    fecha_nacimiento: { type: 'string', format: 'date' },
    estado_civil: { type: 'string', maxLength: 30 },
    direccion: { type: 'string', maxLength: 255 },
    comuna: { type: 'string', maxLength: 100 },
    afp: { type: 'string', maxLength: 60 },
    salud: { type: 'string', maxLength: 60 },
    nacionalidad: { type: 'string', maxLength: 60 },
    telefono: { type: 'string', maxLength: 20 },
    cargas_familiares: { type: 'integer', min: 0, max: 255 },   // TINYINT UNSIGNED
    talla_calzado: { type: 'integer', min: 35, max: 47 },
    talla_pantalon: { type: 'integer', min: 38, max: 50 },
    talla_polera: { type: 'string', maxLength: 5 },             // S/M/L/XL/XXL (lista en el service, case-insensitive)
    cuenta_rut: { type: 'boolean' },
    banco: { type: 'string', maxLength: 60 },
    tipo_cuenta: { type: 'string', in: ['vista', 'corriente'] },
    numero_cuenta: { type: 'string', maxLength: 30 },
    observaciones: { type: 'string', maxLength: 2000 },
};

// POST / — la ficha tal como la llena terreno (sin empresa).
const crear = { ...fichaRules };

// PUT /:id/aprobar — la ficha COMPLETA ya revisada/corregida por la oficina.
// empresa_id es obligatoria para crear el trabajador (igual que en WorkerForm);
// categoria_reporte opcional, default 'obra' en el service (ENUM mig 008).
const aprobar = {
    ...fichaRules,
    empresa_id: { required: true, type: 'integer', min: 1 },
    categoria_reporte: { type: 'string', in: ['obra', 'operaciones', 'rotativo'] },
};

// PUT /:id/rechazar — motivo obligatorio (el service además rechaza blancos).
const rechazar = {
    motivo: { required: true, type: 'string', minLength: 1, maxLength: 2000 },
};

module.exports = { crear, aprobar, rechazar };

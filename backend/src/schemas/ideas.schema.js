/**
 * Schemas de /api/ideas (validateBody, mini-DSL propio).
 *
 * Desde el 20-10-2026 el formulario manda solo el tipo y UN texto (`detalle`); el título
 * (`resumen`) lo saca el service de la primera línea si no viene. Los demás campos se
 * siguen aceptando (opcionales) por compatibilidad.
 */

const TIPOS = ['idea', 'cuesta', 'falla'];
const FRECUENCIAS = ['diaria', 'semanal', 'ocasional'];
const ALCANCES = ['solo_yo', 'equipo', 'obra', 'todos'];
const BENEFICIOS = ['tiempo', 'errores', 'informacion', 'otro'];
const ESTADOS = ['pendiente', 'aceptada', 'desechada', 'hecha'];
const MOTIVOS = ['preferencia', 'ya_existe', 'regla_negocio', 'no_compensa', 'duplicada'];

// POST /ideas
const crear = {
    tipo: { required: true, type: 'string', in: TIPOS },
    resumen: { type: 'string', maxLength: 200 },
    detalle: { required: true, type: 'string', minLength: 1, maxLength: 4000 },
    esperado: { type: 'string', maxLength: 2000 },
    frecuencia: { type: 'string', in: FRECUENCIAS },
    alcance: { type: 'string', in: ALCANCES },
    beneficio: { type: 'string', in: BENEFICIOS },
    pantalla: { type: 'string', maxLength: 255 },
    pantalla_nombre: { type: 'string', maxLength: 120 },
    obra_id: { type: 'integer', min: 1 },
    dispositivo: { type: 'string', in: ['movil', 'escritorio'] },
    // data URL de la miniatura (mig 121). 12 KB en base64 ≈ 16,4 K caracteres + prefijo;
    // el tope fino (bytes reales y formato) lo valida el service.
    foto: { type: 'string', maxLength: 20000 },
};

// PATCH /ideas/:id (revisores)
const revisar = {
    estado: { type: 'string', in: ESTADOS },
    motivo: { type: 'string', in: MOTIVOS },
    respuesta: { type: 'string', maxLength: 1000 },
    nota_interna: { type: 'string', maxLength: 1000 },
};

module.exports = { crear, revisar, TIPOS, FRECUENCIAS, ALCANCES, BENEFICIOS, ESTADOS, MOTIVOS };

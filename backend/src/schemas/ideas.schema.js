/**
 * Schemas de /api/ideas (validateBody, mini-DSL propio).
 *
 * Las reglas que dependen del tipo (la idea exige frecuencia/alcance/beneficio y un
 * problema contado con algo de detalle; la falla exige "qué esperabas") no caben en
 * el DSL y se validan en el service, con los mismos mínimos que muestra el formulario.
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
    resumen: { required: true, type: 'string', minLength: 1, maxLength: 200 },
    detalle: { required: true, type: 'string', minLength: 1, maxLength: 4000 },
    esperado: { type: 'string', maxLength: 2000 },
    frecuencia: { type: 'string', in: FRECUENCIAS },
    alcance: { type: 'string', in: ALCANCES },
    beneficio: { type: 'string', in: BENEFICIOS },
    pantalla: { type: 'string', maxLength: 255 },
    pantalla_nombre: { type: 'string', maxLength: 120 },
    obra_id: { type: 'integer', min: 1 },
    dispositivo: { type: 'string', in: ['movil', 'escritorio'] },
};

// PATCH /ideas/:id (revisores)
const revisar = {
    estado: { type: 'string', in: ESTADOS },
    motivo: { type: 'string', in: MOTIVOS },
    respuesta: { type: 'string', maxLength: 1000 },
    nota_interna: { type: 'string', maxLength: 1000 },
};

module.exports = { crear, revisar, TIPOS, FRECUENCIAS, ALCANCES, BENEFICIOS, ESTADOS, MOTIVOS };

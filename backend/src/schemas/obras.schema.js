/**
 * Schemas de validación para endpoints de escritura de Obras. Plan v2 F1.3.
 * Campos = allowedFields de obrasOptions (index.js). El service ya whitelistea;
 * el schema agrega validación de tipo/fecha + 400 con mensaje claro.
 */

const crearObra = {
    nombre: { required: true, type: 'string', maxLength: 255 },
    direccion: { type: 'string', maxLength: 255 },
    empresa_id: { required: true, type: 'integer', min: 1 },
    activa: { type: 'boolean' },
    participa_inventario: { type: 'boolean' },
    participa_asistencia: { type: 'boolean' },
    participa_transferencias: { type: 'boolean' },
    participa_bombas: { type: 'boolean' },
    encargado_nombre: { type: 'string', maxLength: 255 },
    es_prueba: { type: 'boolean' },
    fecha_inicio: { type: 'string', format: 'date' },
    fecha_termino: { type: 'string', format: 'date' },
};

// Update: mismos campos, todos opcionales (sin required).
const editarObra = Object.fromEntries(
    Object.entries(crearObra).map(([k, rule]) => {
        const { required, ...rest } = rule;
        return [k, rest];
    })
);

const finalizarObra = {
    fecha_termino: { required: true, type: 'string', format: 'date' },
    fecha_inicio: { type: 'string', format: 'date' },
};

module.exports = { crearObra, editarObra, finalizarObra };

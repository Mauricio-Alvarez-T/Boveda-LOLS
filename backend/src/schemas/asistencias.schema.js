/**
 * Schemas de validación (mini-DSL de validateBody) para endpoints de escritura
 * de Asistencias. Plan v2 F1.3 — oleada 1.
 *
 * Los campos deben ser superset-exacto de lo que el service usa: con { strip: true }
 * cualquier clave no declarada se elimina del body antes de llegar al service.
 */

// Reglas de un registro de asistencia (compartidas por /batch y /bulk/:obra_id).
const registroItemRules = {
    trabajador_id: { required: true, type: 'integer', min: 1 },
    obra_id: { type: 'integer', min: 1 },
    fecha: { type: 'string', format: 'date' },
    estado_id: { required: true, type: 'integer', min: 1 },
    tipo_ausencia_id: { type: 'integer', min: 1 },
    observacion: { type: 'string', maxLength: 1000 },
    horas_extra: { type: 'number', min: 0 },
    hora_entrada: { type: 'string', maxLength: 8 },
    hora_salida: { type: 'string', maxLength: 8 },
    hora_colacion_inicio: { type: 'string', maxLength: 8 },
    hora_colacion_fin: { type: 'string', maxLength: 8 },
};

// POST /batch — registros multi-obra/multi-fecha (obra_id y fecha van dentro de cada registro).
const batch = {
    registros: { required: true, type: 'array', minLength: 1, itemRules: registroItemRules },
};

// POST /bulk/:obra_id — misma forma; obra_id viene por param.
const bulk = {
    registros: { required: true, type: 'array', minLength: 1, itemRules: registroItemRules },
};

// PUT /:id — mirror de ALLOWED_FIELDS de asistencia.service.update (todos opcionales).
const actualizar = {
    estado_id: { type: 'integer', min: 1 },
    tipo_ausencia_id: { type: 'integer', min: 1 },
    observacion: { type: 'string', maxLength: 1000 },
    hora_entrada: { type: 'string', maxLength: 8 },
    hora_salida: { type: 'string', maxLength: 8 },
    hora_colacion_inicio: { type: 'string', maxLength: 8 },
    hora_colacion_fin: { type: 'string', maxLength: 8 },
    horas_extra: { type: 'number', min: 0 },
};

// POST /periodos — crea asistencias sintéticas en un rango.
const crearPeriodo = {
    trabajador_id: { required: true, type: 'integer', min: 1 },
    obra_id: { required: true, type: 'integer', min: 1 },
    estado_id: { required: true, type: 'integer', min: 1 },
    fecha_inicio: { required: true, type: 'string', format: 'date' },
    fecha_fin: { required: true, type: 'string', format: 'date' },
    tipo_ausencia_id: { type: 'integer', min: 1 },
    observacion: { type: 'string', maxLength: 1000 },
};

// POST /traslado-obra
const trasladoObra = {
    trabajador_id: { required: true, type: 'integer', min: 1 },
    obra_actual_id: { required: true, type: 'integer', min: 1 },
    obra_destino_id: { required: true, type: 'integer', min: 1 },
    fecha: { required: true, type: 'string', format: 'date' },
    comentario: { type: 'string', maxLength: 1000 },
};

// POST /horarios/:obraId — configuración semanal.
const guardarHorarios = {
    horarios: {
        required: true, type: 'array', minLength: 1, itemRules: {
            dia_semana: { required: true, type: 'string', maxLength: 10 },
            hora_entrada: { type: 'string', maxLength: 8 },
            hora_salida: { type: 'string', maxLength: 8 },
            hora_colacion_inicio: { type: 'string', maxLength: 8 },
            hora_colacion_fin: { type: 'string', maxLength: 8 },
        },
    },
};

module.exports = { batch, bulk, actualizar, crearPeriodo, trasladoObra, guardarHorarios };

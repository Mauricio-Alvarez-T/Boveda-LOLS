/**
 * Configuración compartida para el subsistema de Historial de Actividad.
 *
 * Reúne constantes que antes vivían dentro de `middleware/logger.js` y se
 * necesitan también desde `routes/logs.routes.js` (filtros, export CSV) y
 * los tests.
 *
 * Aprendizaje del sprint: tener las constantes acá evita drift cuando
 * cambia un nombre legible o se agrega un módulo a `ENTIDAD_RESOLVERS`.
 */

// Campos sensibles o ruidosos que jamás deben ir al log.
const EXCLUDED_KEYS = new Set([
    'id', 'created_at', 'updated_at', 'password', 'password_hash',
    'user_agent', 'token', 'refresh_token'
]);

// Etiquetas humanas para keys técnicas (usadas en `buildResumen`).
const LABEL_MAP = {
    empresa_id: 'Empresa', obra_id: 'Obra', cargo_id: 'Cargo',
    nombres: 'Nombres', apellido_paterno: 'Apellido P.', apellido_materno: 'Apellido M.',
    rut: 'RUT', email: 'Correo', telefono: 'Teléfono', activo: 'Estado',
    razon_social: 'Razón Social', nombre: 'Nombre', direccion: 'Dirección',
    estado_id: 'Estado Asistencia', tipo_ausencia_id: 'Tipo Ausencia',
    observacion: 'Observación', hora_entrada: 'Hora Entrada', hora_salida: 'Hora Salida',
    horas_extra: 'Horas Extra', fecha_ingreso: 'F. Ingreso',
    categoria_reporte: 'Categoría Reporte', rol_id: 'Rol',
    tipo_documento_id: 'Tipo Documento', trabajador_id: 'Trabajador',
    fecha_vencimiento: 'F. Vencimiento'
};

// Acciones consideradas "ruido" cuando el usuario sólo quiere ver cambios
// reales. El endpoint /api/logs los excluye por default.
const NOISY_ACCIONES = new Set(['LOGIN']);

// Acciones visibles por default en el panel del Historial.
const ACCIONES_VISIBLES = ['CREATE', 'UPDATE', 'DELETE', 'UPLOAD', 'EMAIL'];

/**
 * Resolución de entidad desde el path de la API + body de la request.
 *
 * Cuando el middleware loguea una acción, intenta poblar `entidad_tipo` y
 * `entidad_label` a partir del módulo (segmento /api/<modulo>/...). El
 * label viene de:
 *   1. La fila del recurso en su tabla maestra (UPDATE/DELETE — hay item_id).
 *   2. El body de la request (CREATE — todavía no hay id).
 *
 * Para agregar un módulo nuevo: incluir su entrada acá. La query del label
 * se construye `SELECT ${labelExpr} AS label FROM ${tabla} WHERE id = ?`.
 * `bodyKeys` es la lista priorizada de campos a probar en CREATE.
 */
const ENTIDAD_RESOLVERS = {
    trabajadores: {
        tipo: 'trabajador',
        tabla: 'trabajadores',
        labelExpr: "CONCAT(nombres, ' ', apellido_paterno)",
        bodyKeys: [
            (b) => (b.nombres && b.apellido_paterno) ? `${b.nombres} ${b.apellido_paterno}` : null,
            'nombre', 'rut',
        ],
    },
    obras: {
        tipo: 'obra',
        tabla: 'obras',
        labelExpr: 'nombre',
        bodyKeys: ['nombre'],
    },
    empresas: {
        tipo: 'empresa',
        tabla: 'empresas',
        labelExpr: 'razon_social',
        bodyKeys: ['razon_social', 'rut', 'nombre'],
    },
    cargos: {
        tipo: 'cargo',
        tabla: 'cargos',
        labelExpr: 'nombre',
        bodyKeys: ['nombre'],
    },
    usuarios: {
        tipo: 'usuario',
        tabla: 'usuarios',
        labelExpr: 'nombre',
        bodyKeys: ['nombre', 'email'],
    },
    'tipos-ausencia': {
        tipo: 'tipo_ausencia',
        tabla: 'tipos_ausencia',
        labelExpr: 'nombre',
        bodyKeys: ['nombre'],
    },
    'estados-asistencia': {
        tipo: 'estado_asistencia',
        tabla: 'estados_asistencia',
        labelExpr: 'nombre',
        bodyKeys: ['nombre', 'codigo'],
    },
    transferencias: {
        tipo: 'transferencia',
        tabla: 'transferencias',
        labelExpr: 'codigo',
        bodyKeys: ['codigo'],
    },
    'items-inventario': {
        tipo: 'item',
        tabla: 'items_inventario',
        labelExpr: 'descripcion',
        bodyKeys: ['descripcion', 'nombre'],
    },
    bodegas: {
        tipo: 'bodega',
        tabla: 'bodegas',
        labelExpr: 'nombre',
        bodyKeys: ['nombre'],
    },
    'sabados-extra': {
        tipo: 'sabado_extra',
        tabla: 'sabados_extra',
        labelExpr: "CONCAT('Sábado ', DATE_FORMAT(fecha, '%d-%m-%Y'))",
        bodyKeys: [
            (b) => b.fecha ? `Sábado ${b.fecha}` : null,
        ],
    },
};

module.exports = {
    EXCLUDED_KEYS,
    LABEL_MAP,
    NOISY_ACCIONES,
    ACCIONES_VISIBLES,
    ENTIDAD_RESOLVERS,
};

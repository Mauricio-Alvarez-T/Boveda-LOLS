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
    'user_agent', 'token', 'refresh_token',
    // Montos de remuneración (plan Gestiones B3/B5): nunca al detalle del log (lo ve sistema.logs.ver).
    'sueldo_base', 'bono_colacion', 'bono_movilizacion',
    // Snapshot de emisión de documentos (mig 110): puede traer remuneración.
    'metadata'
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
    fecha_vencimiento: 'F. Vencimiento',
    // Inventario / transferencias y otros campos frecuentes en el detalle.
    descripcion: 'Descripción', codigo: 'Código', motivo: 'Motivo',
    items: 'Ítems', item_ids: 'Ítems', trabajador_ids: 'Trabajadores',
    cantidad: 'Cantidad', cantidad_solicitada: 'Cant. solicitada',
    cantidad_enviada: 'Cant. enviada', cantidad_recibida: 'Cant. recibida',
    tipo_flujo: 'Tipo', tipo: 'Tipo', unidad: 'Unidad', fuente: 'Origen',
    fecha: 'Fecha', monto: 'Monto', patente: 'Patente', marca: 'Marca', modelo: 'Modelo',
    // Facturas de inventario.
    numero_factura: 'N° factura', proveedor: 'Proveedor', fecha_factura: 'Fecha factura',
    monto_neto: 'Monto neto', precio_unitario: 'Precio unitario', bodega_id: 'Bodega',
    // Ficha de ingreso digital (mig 108): datos personales del trabajador.
    fecha_nacimiento: 'F. Nacimiento', estado_civil: 'Estado civil', comuna: 'Comuna',
    afp: 'AFP', salud: 'Salud', nacionalidad: 'Nacionalidad', cargas_familiares: 'Cargas familiares',
    observaciones: 'Observaciones', motivo_rechazo: 'Motivo rechazo',
    // Sueldo por cargo (mig 111).
    evento: 'Evento', cargo: 'Cargo', cambio_montos: 'Cambió montos',
    // Desvinculación con causal (mig 112).
    fecha_desvinculacion: 'F. Desvinculación', causal_desvinculacion: 'Causal', causal_codigo: 'Causal', causal: 'Causal',
    no_recontratar: 'No recontratar', tenia_marca_no_recontratar: 'Tenía marca', quitar_marca_no_recontratar: 'Quitar marca',
    // Documentos laborales generados (mig 110).
    origen: 'Origen', estado: 'Estado doc.', plantilla_version: 'Versión plantilla', fecha_generacion: 'F. Generación',
    fecha_descarga: 'F. Descarga', solicitud_id: 'Solicitud', documentos: 'Documentos', dias_plazo: 'Plazo (días)',
    representante_nombre: 'Representante legal', representante_rut: 'RUT representante',
    // Custodia de documentos físicos (mig 114).
    portador_id: 'Portador', lote_id: 'Lote', recibidos: 'Recibidos', no_entregados: 'No entregados',
    firmados: 'Firmados', sin_firma: 'Sin firma', en_terreno: 'En terreno', liberados: 'Liberados',
    // Alertas de documentos sin firmar (mig 115).
    dias_aviso: 'Días aviso', dias_critico: 'Días crítico', etiqueta: 'Etiqueta', categoria: 'Categoría'
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

// Ficha de ingreso digital (mig 108). Se registra bajo DOS claves con el mismo
// resolver: el activityLogger deriva el módulo del path
// (`/api/solicitudes-ingreso/...`) y el log manual del service (aprobar) usa
// el nombre de la tabla (`solicitudes_ingreso`).
const SOLICITUD_INGRESO_RESOLVER = {
    tipo: 'solicitud_ingreso',
    tabla: 'solicitudes_ingreso',
    labelExpr: "CONCAT(nombres, ' ', apellido_paterno, ' (', rut, ')')",
    bodyKeys: [
        (b) => (b.nombres && b.apellido_paterno) ? `${b.nombres} ${b.apellido_paterno}` : null,
        'rut',
    ],
};

const ENTIDAD_RESOLVERS = {
    'solicitudes-ingreso': SOLICITUD_INGRESO_RESOLVER,
    solicitudes_ingreso: SOLICITUD_INGRESO_RESOLVER,
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
    // /api/cargo-sueldos/:cargoId — item_id es el cargo (el log manual del service lo etiqueta).
    'cargo-sueldos': {
        tipo: 'cargo',
        tabla: 'cargos',
        labelExpr: 'nombre',
        bodyKeys: ['cargo'],
    },
    // /api/documentos-laborales/:id — item_id es el documento (el log manual del service lo etiqueta).
    'documentos-laborales': {
        tipo: 'documento',
        tabla: 'documentos',
        labelExpr: 'nombre_archivo',
        bodyKeys: ['resumen', 'tipo'],
    },
    // /api/documentos-lotes/:id — item_id es el lote de custodia (mig 114); el log manual trae `resumen`.
    'documentos-lotes': {
        tipo: 'lote_documentos',
        tabla: 'documentos_lotes',
        labelExpr: "CONCAT('Lote #', id)",
        bodyKeys: ['resumen'],
    },
    // /api/documentos-alertas/config/:id — umbrales por categoría (mig 115); el logger global registra el PUT.
    'documentos-alertas': {
        tipo: 'alerta_documentos',
        tabla: 'documentos_alertas_config',
        labelExpr: 'etiqueta',
        bodyKeys: ['etiqueta', 'categoria'],
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
    // Lista de trabajadores en actividades sugeridas (mig 116): la lista se identifica
    // por obra + semana (lunes). Los logs anteriores al rename conservan su label ya guardado.
    'actividades-sugeridas': {
        tipo: 'actividad_sugerida',
        tabla: 'actividades_sugeridas',
        labelExpr: "CONCAT('Semana del ', DATE_FORMAT(semana, '%d-%m-%Y'))",
        bodyKeys: [
            (b) => b.semana ? `Semana del ${b.semana}` : null,
        ],
    },
    'facturas-inventario': {
        tipo: 'factura',
        tabla: 'facturas_inventario',
        labelExpr: "CONCAT('#', numero_factura)",
        bodyKeys: [
            (b) => b.numero_factura ? `#${b.numero_factura}` : null,
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

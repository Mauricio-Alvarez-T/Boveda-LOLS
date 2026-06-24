
export interface Empresa {
    id: number;
    rut: string;
    razon_social: string;
    direccion: string | null;
    telefono: string | null;
    activo: boolean;
}

export interface Obra {
    id: number;
    nombre: string;
    direccion: string | null;
    empresa_id: number;
    empresa_nombre?: string;
    activa: boolean;
    participa_inventario?: boolean;
    /** Participación por apartado (mig 075): si FALSE, la obra no aparece en ese módulo. */
    participa_asistencia?: boolean;
    participa_transferencias?: boolean;
    participa_bombas?: boolean;
    /** Encargado que solicita material en obras de inventario (texto libre). */
    encargado_nombre?: string | null;
    /** Si TRUE, obra de prueba: aislada de reportes/inventario/dashboard/asistencia/selectores. */
    es_prueba?: boolean;
    /** Si TRUE, obra concluida: fuera de toda la operación; visible solo en "Obras Finalizadas". */
    finalizada?: boolean;
    /** Fecha de inicio de la obra (manual; fallback a primera asistencia). */
    fecha_inicio?: string | null;
    /** Fecha de término (se setea al finalizar; fallback a última asistencia). */
    fecha_termino?: string | null;
}

/** Tarjeta de la sección "Obras Finalizadas" (GET /obras/finalizadas). */
export interface ObraFinalizada {
    id: number;
    nombre: string;
    empresa_nombre: string | null;
    fecha_inicio: string | null;
    fecha_termino: string | null;
    dias_duracion: number | null;
    /** Histórico: trabajadores DISTINTOS que registraron asistencia en la obra. */
    total_trabajadores: number;
    /** Desglose por cargo actual del trabajador, ordenado desc. */
    por_cargo: { cargo: string; cantidad: number }[];
}

export interface Cargo {
    id: number;
    nombre: string;
    activo: boolean;
}

export interface Conductor {
    id: number;
    nombre: string;
    activo: boolean;
}

export interface Trabajador {
    id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    empresa_id: number | null;
    empresa_nombre?: string;
    obra_id: number | null;
    obra_nombre?: string;
    cargo_id: number | null;
    cargo_nombre?: string;
    email: string | null;
    telefono: string | null;
    carnet_frente_url: string | null;
    carnet_dorso_url: string | null;
    fecha_ingreso: string | null;
    fecha_desvinculacion: string | null;
    categoria_reporte: 'obra' | 'operaciones' | 'rotativo';
    activo: boolean;
    /** Si TRUE, trabajador de prueba: aislado de reportes/dashboard/asistencia/consultas operativas. */
    es_prueba?: boolean;
    /** Clase/tipo de licencia de conducir (ej: B, A2, D). */
    licencia_conducir?: string | null;
    /** Fecha de vencimiento de la licencia de conducir. */
    licencia_vencimiento?: string | null;
}

// ── Módulo Vehículos ──────────────────────────────────────────────────

/** Empresa de flota (catálogo paramétrico; tabla empresas_vehiculos). */
export interface EmpresaVehiculo {
    id: number;
    nombre: string;
    /** Color identificador en hex (ej. '#16a34a'). */
    color: string;
    activo: boolean;
    /** Conteo de vehículos activos (enriquecido por el backend en el listado). */
    vehiculos_count?: number;
}

export interface Vehiculo {
    id: number;
    patente: string;
    marca: string;
    modelo: string;
    anio: number;
    tipo: 'camioneta' | 'camion' | 'auto' | 'furgon' | 'bus' | 'otro';
    /** Empresa de flota asignada (FK a empresas_vehiculos). Null = sin asignar. */
    empresa_id?: number | null;
    /** Nombre/color de la empresa, enriquecidos por el backend vía JOIN. */
    empresa_nombre?: string | null;
    empresa_color?: string | null;
    conductor_id?: number | null;
    kilometraje_actual: number;
    color?: string | null;
    /** Valor de activo (patrimonio) del vehículo. Se suma por empresa de flota. */
    valor?: number;
    /** TRUE si el vehículo está en leasing (arriendo financiero, no es propio). */
    es_leasing?: boolean;
    observaciones?: string | null;
    activo: boolean;
    // Campos enriquecidos por el backend (subconsultas)
    conductor_nombre?: string | null;
    seguro_tipo?: string | null;
    seguro_vencimiento?: string | null;
    revision_tecnica_vencimiento?: string | null;
    revision_gases_vencimiento?: string | null;
}

export type VehiculoDocumentoCategoria =
    | 'permiso_circulacion'
    | 'seguro_terceros'
    | 'primera_inscripcion'
    | 'poliza';

export interface VehiculoDocumento {
    id: number;
    vehiculo_id: number;
    categoria: VehiculoDocumentoCategoria;
    nombre_archivo: string;
    fecha_subida?: string;
    created_at?: string;
}

export interface VehiculoSeguro {
    id: number;
    vehiculo_id: number;
    tipo: 'SOAP' | 'complementario' | 'otro';
    compania?: string | null;
    numero_poliza?: string | null;
    fecha_inicio: string;
    fecha_vencimiento: string;
    monto?: number | null;
    observaciones?: string | null;
    activo: boolean;
}

export interface VehiculoRevision {
    id: number;
    vehiculo_id: number;
    tipo: 'tecnica' | 'gases' | 'mecanica';
    fecha: string;
    fecha_vencimiento: string;
    resultado: 'aprobado' | 'rechazado' | 'pendiente';
    planta?: string | null;
    direccion?: string | null;
    observaciones?: string | null;
    periodicidad_anios?: number | null;
    dias_alerta?: number | null;
    email_alerta?: string | null;
    tel_alerta?: string | null;
    hora_alerta?: string | null;
    activo: boolean;
}

export interface VehiculoMantencion {
    id: number;
    vehiculo_id: number;
    fecha: string;
    tipo: string;
    km_al_realizar: number;
    descripcion?: string | null;
    costo?: number | null;
    taller?: string | null;
    fecha_proxima?: string | null;
    dias_alerta?: number | null;
    email_alerta?: string | null;
    tel_alerta?: string | null;
    hora_alerta?: string | null;
    activo: boolean;
}

export interface VehiculoPermiso {
    id: number;
    vehiculo_id: number;
    numero_permiso?: string | null;
    fecha_emision?: string | null;
    fecha_vencimiento: string;
    monto?: number | null;
    municipalidad?: string | null;
    observaciones?: string | null;
    dias_alerta?: number | null;
    email_alerta?: string | null;
    tel_alerta?: string | null;
    activo: boolean;
}

export interface VehiculoAlerta {
    patente?: string;
    marca?: string;
    modelo?: string;
    nombre?: string;   // para licencias (nombre del trabajador)
    rut?: string;
    elemento: string;
    fecha_vencimiento: string;
    dias_restantes: number;
    categoria: 'seguro' | 'revision' | 'licencia';
}

export interface TipoDocumento {
    id: number;
    nombre: string;
    dias_vigencia: number | null;
    obligatorio: boolean;
    activo: boolean;
}

export interface Documento {
    id: number;
    trabajador_id: number;
    tipo_documento_id: number;
    tipo_nombre?: string;
    nombre_archivo: string;
    ruta_archivo: string;
    rut_empresa_al_subir: string;
    fecha_subida: string;
    fecha_vencimiento: string | null;
    subido_por: number;
    activo: boolean;
}

export interface EstadoAsistencia {
    id: number;
    nombre: string;
    codigo: string;
    color: string;
    es_presente: boolean;
    cuenta_dia_trabajado: boolean;
    activo: boolean;
}

export interface TipoAusencia {
    id: number;
    nombre: string;
    es_justificada: boolean;
    activo: boolean;
}

export interface Asistencia {
    id?: number;
    trabajador_id: number;
    rut?: string;
    nombres?: string;
    apellido_paterno?: string;
    cargo_id?: number;
    cargo_nombre?: string;
    obra_id: number;
    fecha: string;
    estado_id: number;
    estado_nombre?: string;
    estado_codigo?: string;
    estado_color?: string;
    es_presente?: boolean;
    tipo_ausencia_id: number | null;
    tipo_ausencia_nombre?: string;
    observacion: string | null;
    hora_entrada: string | null;
    hora_salida: string | null;
    hora_colacion_inicio: string | null;
    hora_colacion_fin: string | null;
    horas_extra: number;
    registrado_por: number;
    registrado_por_nombre?: string;
}

export interface ConfiguracionHorario {
    id?: number;
    obra_id: number;
    dia_semana: 'lun' | 'mar' | 'mie' | 'jue' | 'vie' | 'sab';
    hora_entrada: string;
    hora_salida: string;
    hora_colacion_inicio: string;
    hora_colacion_fin: string;
    activo: boolean;
}

export interface PeriodoAusencia {
    id: number;
    trabajador_id: number;
    obra_id: number;
    estado_id: number;
    estado_nombre?: string;
    estado_codigo?: string;
    estado_color?: string;
    tipo_ausencia_id: number | null;
    tipo_ausencia_nombre?: string;
    fecha_inicio: string;
    fecha_fin: string;
    observacion: string | null;
    creado_por: number;
    nombres?: string;
    apellido_paterno?: string;
    rut?: string;
    activo: boolean;
    dias_afectados?: number;
}

export interface Feriado {
    id: number;
    fecha: string;
    nombre: string;
    tipo: 'nacional' | 'obra' | 'patronal' | 'otro';
    irrenunciable: boolean;
    activo: boolean;
}

// ── Inventario ──

export interface CategoriaInventario {
    id: number;
    nombre: string;
    orden: number;
    activo: boolean;
}

export interface Bodega {
    id: number;
    nombre: string;
    direccion: string | null;
    /** Legacy FK — sin uso desde mig 060. Reservado por compatibilidad. */
    responsable_id: number | null;
    /** Texto libre editable desde BodegaForm (mig 060). */
    responsable_nombre?: string | null;
    activa: boolean;
    /** Participación por apartado (mig 075): si FALSE, la bodega no aparece en ese módulo. */
    participa_inventario?: boolean;
    participa_transferencias?: boolean;
}

export interface ItemInventario {
    id: number;
    nro_item: number;
    categoria_id: number;
    categoria_nombre?: string;
    descripcion: string;
    m2: number | null;
    valor_compra: number;
    valor_arriendo: number;
    unidad: string;
    imagen_url: string | null;
    es_consumible: boolean;
    propietario: 'dedalius' | 'lols';
    activo: boolean;
}

export interface UbicacionStock {
    id: number;
    item_id: number;
    obra_id: number | null;
    bodega_id: number | null;
    obra_nombre?: string;
    bodega_nombre?: string;
    cantidad: number;
    valor_arriendo_override: number | null;
}

export interface Transferencia {
    id: number;
    codigo: string;
    estado: 'pendiente' | 'aprobada' | 'en_transito' | 'recepcion_parcial' | 'recibida' | 'rechazada' | 'cancelada';
    origen_obra_id: number | null;
    origen_bodega_id: number | null;
    destino_obra_id: number | null;
    destino_bodega_id: number | null;
    origen_nombre?: string;
    destino_nombre?: string;
    // Joins enriquecidos del backend (getById/getAll). Opcionales porque
    // no todos los endpoints los traen.
    origen_obra_nombre?: string | null;
    origen_bodega_nombre?: string | null;
    /** Responsable de la bodega origen (mig 060). Solo si origen es bodega. */
    origen_bodega_responsable_nombre?: string | null;
    destino_obra_nombre?: string | null;
    destino_bodega_nombre?: string | null;
    /** Responsable de la bodega destino (mig 060). Solo si destino es bodega. */
    destino_bodega_responsable_nombre?: string | null;
    aprobador_nombre?: string | null;
    receptor_nombre?: string | null;
    transportista_nombre?: string | null;
    observaciones_rechazo?: string | null;
    solicitante_id: number;
    solicitante_nombre?: string;
    aprobador_id: number | null;
    transportista_id: number | null;
    receptor_id: number | null;
    // Audit trail (migración 039). Pueden ser null si la transferencia
    // es anterior a la migración o si la transición aún no ocurrió.
    creado_por?: number | null;
    aprobado_por?: number | null;
    despachado_por?: number | null;
    recibido_por?: number | null;
    rechazado_por?: number | null;
    cancelado_por?: number | null;
    // Nombres de quien rechazó/canceló (getById los expone vía JOIN) — para el
    // respaldo de WhatsApp en estados terminales.
    rechazado_por_nombre?: string | null;
    cancelado_por_nombre?: string | null;
    fecha_solicitud: string;
    fecha_aprobacion: string | null;
    fecha_despacho: string | null;
    fecha_recepcion: string | null;
    requiere_pionetas: boolean;
    cantidad_pionetas: number | null;
    observaciones: string | null;
    tipo_flujo: 'solicitud' | 'solicitud_materiales' | 'push_directo' | 'intra_bodega' | 'intra_obra' | 'orden_gerencia' | 'devolucion';
    motivo: string | null;
    items?: TransferenciaItem[];
    activo: boolean;
}

export interface TransferenciaItem {
    id: number;
    transferencia_id: number;
    item_id: number;
    item_descripcion?: string;
    cantidad_solicitada: number;
    cantidad_enviada: number | null;
    cantidad_recibida: number | null;
    observacion: string | null;
    unidad?: string;
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    origen_obra_nombre?: string | null;
    origen_bodega_nombre?: string | null;
    splits?: TransferenciaItemSplit[];
}

/**
 * Split de origen de un ítem aprobado multi-origen.
 * Persistido en transferencia_item_origenes (migración 032).
 */
export interface TransferenciaItemSplit {
    origen_obra_id: number | null;
    origen_bodega_id: number | null;
    cantidad_enviada: number;
    origen_obra_nombre?: string | null;
    origen_bodega_nombre?: string | null;
}

/**
 * Evento de recepción (audit). Una TRF puede tener N parciales + 1 total.
 * Persistido en transferencia_recepciones (migración 048).
 */
export interface TransferenciaRecepcion {
    id: number;
    transferencia_id: number;
    receptor_id: number;
    receptor_nombre?: string | null;
    fecha_recepcion: string;
    tipo: 'parcial' | 'total';
    observacion: string | null;
    /** Foto opcional adjunta a la recepción (URL servida por /api/uploads/transferencias). */
    foto_url?: string | null;
    items: TransferenciaRecepcionItem[];
}

/**
 * Item recibido en un evento específico de recepción.
 * Persistido en transferencia_recepcion_items (migración 048).
 */
export interface TransferenciaRecepcionItem {
    id: number;
    transferencia_item_id: number;
    item_id?: number;
    item_descripcion?: string;
    unidad?: string;
    cantidad_recibida: number;
    observacion: string | null;
}

/**
 * Split de aprobación en UI — representa 1 ubicación de despacho elegida
 * por el aprobador. Una aprobación puede tener N splits por ítem.
 */
export interface ApprovalSplit {
    origen_obra_id: number | null;
    origen_bodega_id: number | null;
    cantidad: number;
}

/**
 * Estado de aprobación por ítem: la cantidad solicitada (inmutable) y los
 * splits que el aprobador fue componiendo.
 */
export interface ApprovalItemState {
    item_id: number;
    cantidad_solicitada: number;
    splits: ApprovalSplit[];
}

export interface FacturaInventario {
    id: number;
    numero_factura: string;
    proveedor: string;
    fecha_factura: string;
    monto_neto: number;
    observaciones: string | null;
    registrado_por: number;
    items?: FacturaItem[];
    activo: boolean;
}

export interface FacturaItem {
    id: number;
    factura_id: number;
    item_id: number;
    item_descripcion?: string;
    obra_id: number | null;
    bodega_id: number | null;
    ubicacion_nombre?: string;
    cantidad: number;
    precio_unitario: number;
}

export interface RegistroBombaHormigon {
    id: number;
    obra_id: number;
    obra_nombre?: string;
    fecha: string;
    tipo_bomba: string;
    /** Hora de inicio del servicio (HH:MM[:SS]). */
    hora_inicio?: string | null;
    /** Si se realizó toma de muestras (probetas). */
    toma_muestras?: boolean;
    /** Si hubo traslado de bombas. */
    traslado_bombas?: boolean;
    /** Cantidad de vibradores usados. */
    vibradores?: number | null;
    /** Tipo de hormigón bombeado (texto libre, ej. "H-30"). */
    tipo_hormigon?: string | null;
    /** Volumen bombeado en metros cúbicos. */
    cantidad_m3?: number | null;
    /** Frecuencia (texto libre). */
    frecuencia?: string | null;
    /** Si el hormigón lleva aditivo hidrófugo (impermeabilizante). */
    hidrofugo?: boolean;
    /** Origen de los vibradores: "Arriendo" o "De la casa". */
    vibradores_origen?: string | null;
    /** Si se contaba con permiso para ocupar la calzada (vía pública). */
    permiso_calzada?: boolean;
    es_externa: boolean;
    proveedor: string | null;
    costo: number | null;
    observaciones: string | null;
    activo: boolean;
}

export interface TransferenciaDiscrepanciaItem {
    id: number;
    transferencia_id: number;
    item_id: number;
    item_descripcion: string;
    nro_item: number;
    unidad: string;
    cantidad_enviada: number;
    cantidad_recibida: number;
    diferencia: number;
    observacion: string | null;
    estado: 'pendiente' | 'resuelta' | 'descartada';
    resolucion: string | null;
    resuelto_por: number | null;
    resuelto_por_nombre: string | null;
    fecha_resolucion: string | null;
    reportado_por: number | null;
    reportado_por_nombre: string | null;
    created_at: string;
}

export interface TransferenciaConDiscrepancias {
    id: number;
    codigo: string;
    fecha_solicitud: string;
    fecha_aprobacion: string | null;
    fecha_despacho: string | null;
    fecha_recepcion: string | null;
    origen_obra_nombre: string | null;
    origen_bodega_nombre: string | null;
    /** Responsable de la bodega origen (mig 060). */
    origen_bodega_responsable_nombre?: string | null;
    destino_obra_nombre: string | null;
    destino_bodega_nombre: string | null;
    /** Responsable de la bodega destino (mig 060). */
    destino_bodega_responsable_nombre?: string | null;
    solicitante_id: number | null;
    solicitante_nombre: string | null;
    aprobador_id: number | null;
    aprobador_nombre: string | null;
    transportista_id: number | null;
    transportista_nombre: string | null;
    receptor_id: number | null;
    receptor_nombre: string | null;
    discrepancias: TransferenciaDiscrepanciaItem[];
    total_unidades_perdidas: number;
    total_items_afectados: number;
}

export interface DiscrepanciaInventario {
    id: number;
    item_id: number;
    item_descripcion?: string;
    obra_id: number | null;
    bodega_id: number | null;
    ubicacion_nombre?: string;
    cantidad_sistema: number;
    cantidad_reportada: number;
    diferencia: number;
    estado: 'pendiente' | 'resuelta' | 'descartada';
    reportado_por: number;
    resolucion: string | null;
    activo: boolean;
}


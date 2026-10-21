
export interface Empresa {
    id: number;
    rut: string;
    razon_social: string;
    direccion: string | null;
    telefono: string | null;
    activo: boolean;
    /** Representante legal que firma contratos/finiquitos generados por Bóveda (mig 110). */
    representante_nombre?: string | null;
    representante_rut?: string | null;
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

/** Parámetros de sueldo vigentes de un cargo (mig 111; GET /cargo-sueldos). Montos CLP enteros. */
export interface CargoSueldo {
    id: number | null;
    cargo_id: number;
    cargo_nombre?: string;
    sueldo_base: number;
    bono_colacion: number;
    bono_movilizacion: number;
    observaciones: string | null;
    actualizado_por: number | null;
    actualizado_por_nombre?: string | null;
    updated_at?: string | null;
}

/** Una fila por cambio de montos (append-only; GET /cargo-sueldos/:id/historial). */
export interface CargoSueldoHistorial {
    id: number;
    cargo_id: number;
    sueldo_base: number;
    bono_colacion: number;
    bono_movilizacion: number;
    observaciones: string | null;
    cambiado_por: number | null;
    cambiado_por_nombre?: string | null;
    cambiado_en: string;
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
    /** Causal de la baja vigente (código del catálogo, mig 112); null si activo. */
    causal_desvinculacion?: string | null;
    /** Marca de aviso al recontratar (solo advierte). */
    no_recontratar?: boolean;
    categoria_reporte: 'obra' | 'operaciones' | 'rotativo';
    activo: boolean;
    /** Si TRUE, trabajador de prueba: aislado de reportes/dashboard/asistencia/consultas operativas. */
    es_prueba?: boolean;
    /** Clase/tipo de licencia de conducir (ej: B, A2, D). */
    licencia_conducir?: string | null;
    /** Fecha de vencimiento de la licencia de conducir. */
    licencia_vencimiento?: string | null;
    // ── Ficha de ingreso digital (mig 108): datos personales opcionales ──
    // Los llena terreno en la solicitud o la oficina en WorkerForm; todos NULL-ables.
    fecha_nacimiento?: string | null;
    estado_civil?: string | null;
    direccion?: string | null;
    comuna?: string | null;
    afp?: string | null;
    salud?: string | null;
    nacionalidad?: string | null;
    cargas_familiares?: number | null;
    // Ficha completa (mig 109): tallas + pago de remuneraciones.
    talla_calzado?: number | null;
    talla_pantalon?: number | null;
    talla_polera?: string | null;
    cuenta_rut?: boolean | null;
    banco?: string | null;
    tipo_cuenta?: 'vista' | 'corriente' | string | null;
    numero_cuenta?: string | null;
}

// ── Solicitudes de ingreso (ficha digital, mig 108) ───────────────────

/** Ciclo de vida de una solicitud: nace pendiente; la oficina la aprueba (crea el trabajador) o la rechaza con motivo. */
export type SolicitudIngresoEstado = 'pendiente' | 'aprobada' | 'rechazada';

/**
 * Fila de `solicitudes_ingreso` tal como la entrega GET /solicitudes-ingreso
 * (con los *_nombre resueltos por LEFT JOIN). `empresa_id` la pone la OFICINA
 * al aprobar — terreno no la llena.
 */
export interface SolicitudIngreso {
    id: number;
    estado: SolicitudIngresoEstado;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    cargo_id: number | null;
    cargo_nombre?: string | null;
    obra_id: number | null;
    obra_nombre?: string | null;
    empresa_id: number | null;
    empresa_nombre?: string | null;
    fecha_ingreso: string;
    fecha_nacimiento: string | null;
    estado_civil: string | null;
    direccion: string | null;
    comuna: string | null;
    afp: string | null;
    salud: string | null;
    nacionalidad: string | null;
    telefono: string | null;
    cargas_familiares: number | null;
    talla_calzado: number | null;
    talla_pantalon: number | null;
    talla_polera: string | null;
    cuenta_rut: boolean | null;
    banco: string | null;
    tipo_cuenta: string | null;
    numero_cuenta: string | null;
    observaciones: string | null;
    solicitante_id: number;
    solicitante_nombre?: string | null;
    fecha_solicitud: string;
    resuelto_por: number | null;
    resuelto_por_nombre?: string | null;
    fecha_resolucion: string | null;
    motivo_rechazo: string | null;
    /** Trabajador creado al aprobar (null mientras está pendiente o si fue rechazada). */
    trabajador_id: number | null;
    created_at?: string;
    updated_at?: string;
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

/** Una cuota del leasing de un vehículo (fecha + estado de pago). */
export interface VehiculoLeasingCuota {
    id?: number;
    /** Fecha de la cuota, 'YYYY-MM-DD'. */
    fecha: string;
    pagada: boolean;
}

export interface Vehiculo {
    id: number;
    patente: string;
    marca: string;
    modelo: string;
    anio: number;
    /** moto/maquinaria/remolque desde mig 107 (flota de constructora). */
    tipo: 'camioneta' | 'camion' | 'auto' | 'furgon' | 'bus' | 'moto' | 'maquinaria' | 'remolque' | 'otro';
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
    /** Precio de compra/adquisición. Base de la diferencia compra-venta al vender. */
    precio_compra?: number;
    /** TRUE si el vehículo está en leasing (arriendo financiero, no es propio). */
    es_leasing?: boolean;
    /** Inicio del contrato de leasing (mig 103). */
    leasing_fecha_inicio?: string | null;
    /** Fin del contrato; entra al contador de vencimientos 30 días antes (mig 103). */
    leasing_fecha_termino?: string | null;
    /** Contrato de leasing YA finalizado (mig 104): deja de avisar el vencimiento. */
    leasing_terminado?: boolean;
    /** A quién quedó el vehículo al terminar el leasing (compra, banco, venta...). */
    leasing_traspaso_a?: string | null;
    /** Si false, el término del leasing no cuenta en el aviso (mig 106; default true). */
    avisar_leasing_30d?: boolean;
    /** Si false, los seguros de este vehículo no cuentan en el aviso (mig 103; default true). */
    avisar_alerta_seguro?: boolean;
    /** Cuotas del leasing (solo si es_leasing). Las trae el backend en getById. */
    cuotas?: VehiculoLeasingCuota[];
    observaciones?: string | null;
    activo: boolean;
    // Campos enriquecidos por el backend (subconsultas)
    conductor_nombre?: string | null;
    seguro_tipo?: string | null;
    seguro_vencimiento?: string | null;
    revision_tecnica_vencimiento?: string | null;
    revision_gases_vencimiento?: string | null;
}

/**
 * Venta de un vehículo (historial). Los montos llegan como string desde MySQL
 * (columnas DECIMAL); castea con Number() antes de operar/formatear.
 */
export interface VehiculoVenta {
    id: number;
    vehiculo_id: number;
    fecha_venta: string;
    precio_compra: number;
    precio_venta: number;
    /** Calculada por el backend: precio_venta − precio_compra (+ ganancia, − pérdida). */
    diferencia: number;
    comprador?: string | null;
    observaciones?: string | null;
    vendido_por?: number | null;
    created_at?: string;
    // Datos del vehículo, enriquecidos por el backend vía JOIN.
    patente: string;
    marca: string;
    modelo: string;
    anio: number;
    tipo: string;
    empresa_nombre?: string | null;
    empresa_color?: string | null;
}

export type VehiculoDocumentoCategoria =
    | 'permiso_circulacion'
    | 'seguro_terceros'
    | 'primera_inscripcion'
    | 'certificado_primera_inscripcion'
    | 'poliza';

export interface VehiculoDocumento {
    id: number;
    vehiculo_id: number;
    categoria: VehiculoDocumentoCategoria;
    nombre_archivo: string;
    /** Emisión / desde cuándo rige. OPCIONAL: hay documentos sin fecha (mig 100). */
    fecha?: string | null;
    /** Vencimiento. Si está, el documento entra en el contador del menú. */
    fecha_vencimiento?: string | null;
    observaciones?: string | null;
    /** Checkbox "Avisar 30 días antes" (mig 105, default true): cuenta en el aviso del menú. */
    avisar_30d?: boolean | number;
    fecha_subida?: string;
    created_at?: string;
}

/**
 * Una cosa que vence en el módulo Vehículos (GET /vehiculos/vencimientos).
 * Solo papeles del VEHÍCULO: las licencias de conducir no entran acá.
 */
export interface VehiculoVencimiento {
    /** De dónde sale: define el ícono y la etiqueta en el panel. */
    categoria: 'documento' | 'revision' | 'mantencion' | 'seguro' | 'permiso' | 'leasing';
    id: number;
    vehiculo_id: number | null;
    /** Tipo dentro de la categoría (ej. 'permiso_circulacion', 'tecnica', 'SOAP'). */
    subtipo: string | null;
    patente: string | null;
    marca: string | null;
    modelo: string | null;
    fecha_vencimiento: string;
    /** Negativo = ya venció (−3 = venció hace 3 días). */
    dias_restantes: number;
}

/** Respuesta de GET /vehiculos/vencimientos. */
export interface VehiculoVencimientosResumen {
    items: VehiculoVencimiento[];
    total: number;
    vencidos: number;
    por_vencer: number;
    dias: number;
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
    /** Adjunto opcional del registro (certificado). Solo el nombre: la ruta no sale del backend. */
    nombre_archivo?: string | null;
    dias_alerta?: number | null;
    email_alerta?: string | null;
    tel_alerta?: string | null;
    hora_alerta?: string | null;
    /** Checkbox "Avisar 30 días antes" (mig 105, default true). */
    avisar_30d?: boolean | number;
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
    /** Adjunto opcional del registro (boleta/informe del taller). */
    nombre_archivo?: string | null;
    dias_alerta?: number | null;
    email_alerta?: string | null;
    tel_alerta?: string | null;
    hora_alerta?: string | null;
    /** Checkbox "Avisar 30 días antes" (mig 105, default true). */
    avisar_30d?: boolean | number;
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
    /** Clave estable del sistema (plantilla Bóveda, mig 110); null = tipo manual. */
    codigo?: string | null;
    /** Descarga/impresión solo con documentos.laborales.descargar. */
    restringido?: boolean | number;
}

/** Estado monótono de un documento (mig 110): subido|generado → descargado → entregado (B6). */
/** `entregado` (mig 110) quedó sin uso: B6 lo reemplazó por en_terreno → firmado (mig 114). */
export type DocumentoEstado = 'subido' | 'generado' | 'descargado' | 'entregado' | 'en_terreno' | 'firmado';
export type DocumentoOrigen = 'subido' | 'generado';

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
    // Mig 110 (documentos generados por Bóveda). Ausentes si el backend aún no migró.
    tipo_obligatorio?: boolean | number | null;
    tipo_codigo?: string | null;
    restringido?: boolean | number;
    origen?: DocumentoOrigen;
    estado?: DocumentoEstado;
    generado_por?: number | null;
    generado_por_nombre?: string | null;
    fecha_generacion?: string | null;
    fecha_descarga?: string | null;
    plantilla_version?: string | null;
    // Mig 114 (custodia de documentos físicos, B6). Solo en GET /documentos-laborales/trabajador/:id.
    lote_id?: number | null;
    lote_estado?: 'pendiente_retiro' | 'en_terreno' | 'cerrado' | null;
    lote_retirado_en?: string | null;
    portador_nombre?: string | null;
    fecha_firmado?: string | null;
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
    /** Justificativo adjunto (foto o archivo). La ruta en disco nunca viaja: se descarga por endpoint. */
    tiene_justificativo?: boolean;
    justificativo_nombre?: string | null;
    justificativo_mime?: string | null;
    justificativo_tamano?: number | null;
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
    /** Bodega Virtual (mig 099): oculta por default en GET /bodegas (override ?incluir_virtual=true). */
    es_virtual?: boolean | number;
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
    /** Suma de ítems con destino en bodega virtual (mig 099). DECIMAL → puede llegar como string. */
    monto_virtual?: number | string;
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
    /** Tipo de trabajo del bombeo (texto libre, ej. "Coronación tapa", "Radier"). */
    tipo_trabajo?: string | null;
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
    /** Origen de los vibradores: "Empresa" o "Externa". */
    vibradores_origen?: string | null;
    /** Detalle libre de los vibradores (cantidad, sonda, etc.). */
    vibradores_detalle?: string | null;
    /** Si se contaba con permiso para ocupar la calzada (vía pública). */
    permiso_calzada?: boolean;
    es_externa: boolean;
    proveedor: string | null;
    costo: number | null;
    observaciones: string | null;
    /** Usuario que creó la programación = el "Solicitante" del mensaje de WhatsApp. */
    registrado_por?: number;
    /** Nombre del solicitante (JOIN usuarios en `bomba-hormigon.service.js`). */
    registrado_por_nombre?: string | null;
    activo: boolean;
}

/**
 * Un movimiento de stock de una diferencia (cantidad con signo: + suma, − resta). La simulación y la
 * respuesta de RESOLVER y el plan de REHACER traen `antes`/`despues`; lo guardado en `ajuste_stock`
 * de filas viejas puede no traerlos.
 */
export interface AjusteStockDiscrepancia {
    obra_id: number | null;
    bodega_id: number | null;
    ubicacion_nombre: string;
    cantidad: number;
    /** Stock de la ubicación antes del ajuste. */
    antes?: number;
    /** Stock de la ubicación después del ajuste. */
    despues?: number;
}

/** Motivo por el que el servidor NO aplicaría la decisión (p. ej. DESTINO_SIN_STOCK). */
export interface BloqueoDiscrepancia {
    code: string | null;
    message: string;
}

/**
 * Respuesta de PUT /transferencias/discrepancias/:id/resolver?simular=1 (no escribe): qué ubicaciones
 * cambiarían, de cuánto a cuánto, el aviso y, si no se puede, el bloqueo.
 */
export interface SimulacionResolverDiscrepancia {
    ajustes: AjusteStockDiscrepancia[];
    aviso: string | null;
    bloqueo: BloqueoDiscrepancia | null;
    /** true = aprobar la cierra con la regla anterior, sin mover stock (su aviso es informativo). */
    cerrada_regla_anterior?: boolean;
}

/** Lo que el servidor aplicó al resolver: ajustes de stock + aviso (unidades sin respaldo…). */
export interface AjusteStockResultado {
    ajustes: AjusteStockDiscrepancia[];
    aviso: string | null;
}

/** Respuesta de PUT /transferencias/discrepancias/:id/resolver (dentro de { data }). */
export interface ResolverDiscrepanciaResultado {
    id: number;
    estado: 'resuelta' | 'descartada';
    resolucion: string;
    ajustes: AjusteStockDiscrepancia[];
    aviso: string | null;
    /** true = se aprobó una de la regla anterior: el servidor la cerró sin mover stock. */
    cerrada_regla_anterior?: boolean;
}

/**
 * Plan de POST /transferencias/discrepancias/:id/rehacer (?simular=1 no escribe): deja el stock
 * como si hubiera llegado lo ENVIADO y reabre la fila como pendiente (solo Super Administrador).
 */
export interface RehacerDiscrepanciaPlan {
    id: number;
    transferencia_codigo: string | null;
    /** Descripción del ítem. */
    item: string | null;
    enviada: number;
    recibida: number;
    /** recibida − enviada (> 0 sobrante). */
    dif: number;
    /** 'nuevo' (el origen descontó al recibir) / 'anterior' (descontó lo enviado al aprobar). */
    regimen: string | null;
    ajustes: AjusteStockDiscrepancia[];
    aviso: string | null;
    /**
     * Advertencias sueltas del plan (p. ej. ajustes manuales del ítem posteriores a la recepción,
     * que el plan no ve), sin repetir `aviso`.
     */
    avisos: string[];
    estado_anterior: string | null;
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
    /** Columna GENERADA en BD = enviada − recibida (> 0 faltante). El signo sale de las cantidades. */
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
    /** Foto de la recepción (mig 078). */
    foto_url?: string | null;
    /**
     * Ajustes aplicados al resolver (mig 129, columna TEXT con JSON { ajustes, aviso }). Puede llegar
     * como objeto o como string JSON según la versión del backend: leer con `parseAjusteStock`.
     */
    ajuste_stock?: AjusteStockResultado | string | null;
    /**
     * Mig 130. true = regla ANTERIOR: la diferencia ya se aplicó al stock al recibir (aprobarla la
     * cierra sin mover nada; rechazarla exige rehacerla antes). false = regla nueva: al stock entró lo
     * enviado y la diferencia está pendiente. null = backend sin la mig 130 (el servidor decide).
     */
    diferencia_aplicada?: 0 | 1 | boolean | '0' | '1' | null;
    /**
     * Causa del modelo anterior (mig 129, solo staging). Ya no se escribe; si viene, la fila ajustó
     * stock al resolverse y no se puede rehacer sola (el servidor responde 409 CON_AJUSTE).
     */
    causa?: string | null;
    /** Origen primario del ítem (obra o bodega con responsable) y destino, ya armados por el servidor. */
    origen_nombre?: string | null;
    destino_nombre?: string | null;
    /** Stock de HOY del ítem en el origen primario / destino (DECIMAL: puede llegar como string). */
    origen_stock_actual?: number | string | null;
    destino_stock_actual?: number | string | null;
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
    /**
     * Régimen de stock de la transferencia. FALSE/0 = solicitud antigua (el origen descontó lo
     * enviado al aprobar). Solo informativo en la pantalla: el servidor lo usa al REHACER.
     */
    stock_reconciliado?: boolean | 0 | 1 | null;
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


// ─── Ideas para Bóveda (mig 120, docs/reglas/ideas.md) ────────────────────────
export type IdeaTipo = 'idea' | 'cuesta' | 'falla';
export type IdeaEstado = 'pendiente' | 'aceptada' | 'desechada' | 'hecha';
export type IdeaMotivo = 'preferencia' | 'ya_existe' | 'regla_negocio' | 'no_compensa' | 'duplicada';
export type IdeaFrecuencia = 'diaria' | 'semanal' | 'ocasional';
export type IdeaAlcance = 'solo_yo' | 'equipo' | 'obra' | 'todos';
export type IdeaBeneficio = 'tiempo' | 'errores' | 'informacion' | 'otro';

export interface Idea {
    id: number;
    usuario_id: number;
    tipo: IdeaTipo;
    /** idea/cuesta: qué cambiar · falla: qué estaba haciendo. */
    resumen: string;
    /** idea/cuesta: el problema de hoy · falla: qué pasó. */
    detalle: string;
    /** Solo falla: qué esperaba que pasara. */
    esperado: string | null;
    frecuencia: IdeaFrecuencia | null;
    alcance: IdeaAlcance | null;
    beneficio: IdeaBeneficio | null;
    pantalla: string | null;
    pantalla_nombre: string | null;
    obra_id: number | null;
    obra_nombre?: string | null;
    dispositivo: 'movil' | 'escritorio' | null;
    estado: IdeaEstado;
    motivo: IdeaMotivo | null;
    /** Lo que ve el autor en "Mis ideas". */
    respuesta: string | null;
    /** Solo revisores; el backend no la manda en "Mis ideas". */
    nota_interna?: string | null;
    revisor_nombre?: string | null;
    revisado_en: string | null;
    hecha_en: string | null;
    created_at: string;
    updated_at: string;
    autor_nombre?: string;
    autor_rol?: string | null;
    autor_email?: string;
    /** Mis ideas: hubo un cambio que el autor aún no ve. */
    novedad?: boolean;
    /** Foto opcional (mig 121): nunca viaja en el listado; se pide a /ideas/:id/foto. */
    tiene_foto?: boolean;
    foto_bytes?: number | null;
}

export interface IdeaHecha {
    id: number;
    tipo: IdeaTipo;
    resumen: string;
    respuesta: string | null;
    hecha_en: string;
    /** Crédito público: nombre de pila + inicial. */
    autor: string;
}

export interface IdeasResumenBandeja {
    pendiente: number;
    aceptada: number;
    desechada: number;
    hecha: number;
    pendiente_mas_antigua: string | null;
}

// ─── Costos de obra (mig 122, docs/reglas/costos.md) ──────────────────────────
/** Categorías de gasto (mig 124), en grupos: ver costosConfig · GRUPOS_CATEGORIA. */
export type CostoCategoria =
    | 'sueldos_administracion' | 'sueldos' | 'anticipos' | 'subcontrato'
    | 'arriendo_equipos' | 'servicios_basicos' | 'logistica_seguridad' | 'combustible' | 'gastos_generales'
    | 'hormigon' | 'acero' | 'materiales' | 'herramientas'
    | 'permisos' | 'mitigaciones'
    | 'otro';
export type CostoTipoDocumento = 'factura' | 'boleta' | 'guia' | 'planilla' | 'otro';
export type CostoEstadoPago = 'por_pagar' | 'pagada';

export interface CostoObraLista {
    obra_id: number;
    obra_nombre: string;
    finalizada: boolean;
    tiene_presupuesto: boolean;
    partidas: number;
    costo_presupuestado: number;
    gastado_neto: number;
    gastos: number;
    por_completar: number;
    por_pagar: number;
}

export interface CostoPresupuesto {
    id: number;
    obra_id: number;
    gg_pct: number | string;
    imprevistos_pct: number | string;
    utilidad_pct: number | string;
    iva_pct: number | string;
    observacion?: string | null;
    /** Superficie construida (mig 123), para el costo por m². */
    superficie_m2?: number | string | null;
    /** Cierre de obra (mig 123): con fecha, los montos quedan congelados. */
    cerrado_at?: string | null;
}

export interface CostoPartida {
    id: number;
    capitulo: string;
    codigo: string | null;
    descripcion: string;
    unidad: string | null;
    cantidad: number | string;
    precio_unitario: number | string;
    origen: 'original' | 'modificacion';
    motivo: string | null;
    orden: number;
    created_at?: string;
    /** Calculados por el backend. */
    total: number;
    gastado: number;
    diferencia: number;
}

export interface CostoGasto {
    id: number;
    obra_id: number;
    fecha: string;
    tipo_documento: CostoTipoDocumento;
    proveedor: string | null;
    folio: string | null;
    monto_neto: number | string | null;
    iva: number | string | null;
    monto_total: number | string;
    categoria: CostoCategoria | null;
    partida_id: number | null;
    partida_descripcion?: string | null;
    partida_capitulo?: string | null;
    estado_pago: CostoEstadoPago;
    fecha_vencimiento: string | null;
    fecha_pago: string | null;
    observacion: string | null;
    tiene_foto: boolean;
    foto_nombre?: string | null;
    foto_mime?: string | null;
    foto_tamano?: number | null;
    creado_por_nombre?: string | null;
    created_at: string;
}

export interface CostoResumen {
    costo_directo: number;
    costo_directo_original: number;
    costo_directo_modificaciones: number;
    gastos_generales: number;
    imprevistos: number;
    costo_presupuestado: number;
    utilidad: number;
    neto: number;
    iva: number;
    total: number;
    gastado_neto: number;
    gastado_estimado: boolean;
    disponible: number;
    pct_gastado: number | null;
    gastos_generales_gastado: number;
    /** Sueldos, anticipos y subcontratos sin partida (la mano de obra va dentro de los precios unitarios). */
    mano_obra_sin_partida: number;
    sin_asignar: number;
    por_completar: number;
    por_pagar: { n: number; monto: number };
    vencidas: { n: number; monto: number };
    capitulos: { capitulo: string; presupuestado: number; gastado: number; partidas: number }[];
    partidas_excedidas: { id: number; capitulo: string; descripcion: string; presupuestado: number; gastado: number }[];
    cobros: {
        cobrado: { n: number; neto: number; total: number };
        por_cobrar: { n: number; neto: number; total: number };
        retenido: number;
    };
}

/** Cobro al mandante (mig 123): lo que entra = neto + IVA − retención. */
export interface CostoCobro {
    id: number;
    obra_id: number;
    fecha: string;
    glosa: string;
    monto_neto: number | string;
    iva: number | string;
    retencion: number | string;
    estado: 'por_cobrar' | 'cobrado';
    fecha_cobro: string | null;
    observacion: string | null;
    /** Calculado por el backend. */
    total: number;
    creado_por_nombre?: string | null;
}

/** Números finales de una obra al cerrarla (costosCierre.service · resumenCierre). */
export interface CostoCierreResumen {
    fecha: string;
    superficie_m2: number | null;
    presupuesto: { costo_directo: number; gastos_generales: number; imprevistos: number; costo_presupuestado: number; utilidad: number; neto: number };
    real: { gastado_neto: number; gastado_estimado: boolean; por_categoria: Record<string, number>; gastos_generales_gastado: number; sin_asignar: number };
    venta: { neto: number; fuente: 'cobros' | 'presupuesto'; cobrado_neto: number; por_cobrar_neto: number; retenido: number };
    margen: { presupuestado: number; pct_presupuestado: number | null; real: number; pct_real: number | null };
    desviacion_costo: number;
    desviacion_pct: number | null;
    capitulos: { capitulo: string; presupuestado: number; gastado: number }[];
    excedidas: { id: number; capitulo: string; descripcion: string; presupuestado: number; gastado: number }[];
    pendientes: { por_pagar: { n: number; monto: number }; por_completar: number; por_cobrar: { n: number; total: number } };
}

export interface CostoCierre {
    cerrado_at: string;
    cerrado_por_nombre: string | null;
    resumen: CostoCierreResumen | null;
    lecciones: string | null;
}

export interface CostoMovimientoFlujo {
    tipo: 'cobro' | 'pago';
    id: number;
    obra_id: number;
    obra_nombre: string;
    fecha: string | null;
    fecha_documento?: string | null;
    detalle: string;
    monto: number;
}

export interface CostoBaldeFlujo {
    clave: string;
    desde: string | null;
    hasta: string | null;
    entradas: number;
    salidas: number;
    neto: number;
    items: CostoMovimientoFlujo[];
}

export interface CostoFlujo {
    hoy: string;
    semanas: CostoBaldeFlujo[];
    atrasado: CostoBaldeFlujo;
    mas_adelante: CostoBaldeFlujo;
    sin_fecha: CostoBaldeFlujo;
    totales: { entradas: number; salidas: number };
}

export interface CostoComparacionObra {
    obra_id: number;
    nombre: string;
    finalizada: boolean;
    cerrada: boolean;
    cerrado_at: string | null;
    superficie_m2: number | null;
    partidas: number;
    costo_presupuestado: number;
    gastado_neto: number;
    gastado_estimado: boolean;
    venta_neto: number;
    venta_fuente: 'cobros' | 'presupuesto';
    margen_pct_presupuestado: number | null;
    margen_pct_real: number | null;
    desviacion_pct: number | null;
    por_m2: { presupuestado: number | null; real: number | null; venta: number | null };
    por_categoria: Record<string, number>;
}

export interface CostoComparacion {
    obras: CostoComparacionObra[];
    promedio_cerradas: { obras: number; costo_real_m2: number | null; costo_presupuestado_m2: number | null; margen_pct_real: number | null } | null;
}

export interface CostoDetalleObra {
    obra: { id: number; nombre: string; finalizada: boolean };
    presupuesto: CostoPresupuesto | null;
    partidas: CostoPartida[];
    gastos: CostoGasto[];
    cobros: CostoCobro[];
    cierre: CostoCierre | null;
    resumen: CostoResumen;
}

export interface CostoHistorial {
    id: number;
    entidad: 'presupuesto' | 'partida' | 'gasto' | 'cobro';
    entidad_id: number | null;
    accion: 'crear' | 'editar' | 'borrar' | 'importar' | 'cerrar' | 'reabrir';
    resumen: string;
    detalle: Record<string, unknown> | null;
    usuario_nombre: string | null;
    created_at: string;
}

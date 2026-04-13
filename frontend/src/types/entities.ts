
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
}

export interface Cargo {
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
    es_sabado: boolean;
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
    responsable_id: number | null;
    responsable_nombre?: string;
    activa: boolean;
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
    estado: 'pendiente' | 'aprobada' | 'en_transito' | 'recibida' | 'rechazada' | 'cancelada';
    origen_obra_id: number | null;
    origen_bodega_id: number | null;
    destino_obra_id: number | null;
    destino_bodega_id: number | null;
    origen_nombre?: string;
    destino_nombre?: string;
    solicitante_id: number;
    solicitante_nombre?: string;
    aprobador_id: number | null;
    transportista_id: number | null;
    receptor_id: number | null;
    fecha_solicitud: string;
    fecha_aprobacion: string | null;
    fecha_despacho: string | null;
    fecha_recepcion: string | null;
    requiere_pionetas: boolean;
    cantidad_pionetas: number | null;
    observaciones: string | null;
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
    es_externa: boolean;
    proveedor: string | null;
    costo: number | null;
    observaciones: string | null;
    activo: boolean;
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


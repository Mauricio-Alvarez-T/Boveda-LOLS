import type { Permission } from './index';

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


import { Permission } from './index';

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

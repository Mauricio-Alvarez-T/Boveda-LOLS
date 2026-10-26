import type { PapelesFlotaApi } from '../fichasVehiculosInicio';
import type { EtapaDocumento } from '../../../documentos-fisicos/documentosAlertas';

/**
 * Contrato de GET /api/dashboard/gerencia («Inicio de gerencia», backend/src/services/inicioGerencia.service.js).
 * Cada bloque es null sin el permiso de su módulo o si su consulta falló. Los $ de pérdidas solo vienen con permiso de
 * valores (`con_valores`).
 */

export type CausalFalta = 'seguidos' | 'lunes' | 'tres';

export interface FaltasGerenciaApi {
    anio: number;
    mes: number;
    total: number;
    tres_causales: number;
    lista: { trabajador_id: number; rut: string | null; nombre: string; obra: string | null; fechas: string[]; causales: CausalFalta[] }[];
}

export interface PerdidaApi {
    id: number;
    transferencia_id: number;
    codigo: string;
    descripcion: string | null;
    unidad: string | null;
    /** Enviada − recibida (siempre > 0: faltó). */
    faltan: number;
    origen: string | null;
    destino: string | null;
    recibio: string | null;
    fecha: string | null;
    dias: number;
    del_mes: boolean;
    /** Solo con permiso de valores (si no, no viaja). null = el ítem no tiene valor de compra. */
    valor_unitario?: number | null;
    valor?: number | null;
}

export interface PerdidasApi {
    con_valores: boolean;
    /** Ítems con faltante (diferencias pendientes) y en cuántos envíos. */
    n: number;
    envios: number;
    n_mes: number;
    /** Solo con permiso de valores. */
    total?: number;
    total_mes?: number;
    sin_valor?: number;
    lista: PerdidaApi[];
}

export interface DocumentosGerenciaApi {
    dias: number;
    vencidos: number;
    por_vencer: number;
    lista: { documento_id: number; tipo: string | null; trabajador_id: number; rut: string | null; nombre: string; obra: string | null; fecha: string; dias: number }[];
}

export interface PapelLaboralApi {
    documento_id: number;
    tipo_codigo: string;
    tipo_nombre: string;
    etapa: EtapaDocumento;
    /** Días desde que se generó; en terreno, el día hábil de tenencia. */
    dias: number;
    critical: boolean;
    dias_aviso: number;
    dias_critico: number;
    trabajador: { id: number; nombre: string; rut: string | null };
    obra_nombre: string | null;
    portador_nombre: string | null;
}

export interface PapelesGerenciaApi { total: number; criticos: number; lista: PapelLaboralApi[] }

export interface SolicitudTrabadaApi {
    id: number;
    codigo: string;
    solicitante_id: number | null;
    solicitante: string | null;
    cargo: string | null;
    destino: string | null;
    origen: string | null;
    fecha: string;
    dias: number;
    items: { descripcion: string | null; unidad: string | null; pedida: number }[];
}

export interface SolicitudesGerenciaApi { dias_limite: number; total: number; lista: SolicitudTrabadaApi[] }

/** 7.º tema (Marcos 2026-10-26): un trabajador activo con contrato a plazo fijo vencido o por vencer (mig 138). */
export interface ContratoPorVencerApi {
    trabajador_id: number;
    rut: string | null;
    nombre: string;
    obra: string | null;
    cargo: string | null;
    /** Fecha de ingreso 'YYYY-MM-DD' (null si la ficha no la tiene). */
    ingreso: string | null;
    /** `fecha_termino_contrato`, 'YYYY-MM-DD'. */
    fecha: string;
    /** Días hasta el término: negativo = ya venció; 0 = vence hoy. */
    dias: number;
}

export interface ContratosGerenciaApi {
    /** Ventana de «por vencer» (30). */
    dias: number;
    vencidos: number;
    por_vencer: number;
    lista: ContratoPorVencerApi[];
}

export interface GerenciaApi {
    hoy: string;
    faltas: FaltasGerenciaApi | null;
    vehiculos: PapelesFlotaApi | null;
    perdidas: PerdidasApi | null;
    documentos: DocumentosGerenciaApi | null;
    papeles: PapelesGerenciaApi | null;
    solicitudes: SolicitudesGerenciaApi | null;
    /** Sin `trabajadores.ver` (o con un backend anterior al 2026-10-26) no viene o viene null. */
    contratos?: ContratosGerenciaApi | null;
    aprobadores: { id: number; nombre: string | null }[];
}


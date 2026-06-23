import { useState, useCallback, useEffect } from 'react';
import api from '../../services/api';
import type { ApiResponse } from '../../types';

export interface DashboardKpis {
    transferencias_pendientes: number;
    transferencias_en_transito: number;
    discrepancias_pendientes: {
        transferencias_afectadas: number;
        unidades_totales: number;
    };
    valor_total_obras: number;
    valor_total_patrimonio: number;
    /** Solo inventario (Σ cantidad × valor_compra), sin vehículos. */
    valor_inventario: number;
    /** Lo invertido en compra de todos los vehículos activos (global). */
    valor_vehiculos: number;
    estancados_transito: number;
}

export interface DashboardRechazo {
    transferencia_id: number;
    codigo: string;
    dias: number;
    origen: string;
    destino: string;
    observaciones_rechazo: string | null;
    rechazado_por: string | null;
}

export interface TopObra {
    obra_id: number;
    nombre: string;
    valor_mensual: number;
    valor_bruto: number;
    descuento_porcentaje: number;
    valor_patrimonial: number;
}

export interface DashboardAlerta {
    tipo: 'pendiente' | 'discrepancia' | 'transito' | 'rechazo' | 'faltante';
    transferencia_id: number;
    codigo: string;
    dias: number;
    titulo: string;
    detalle: string;
    solicitante?: string | null;
    /** Solo en alertas tipo 'pendiente': true si superó el plazo (10 días o prórroga). */
    estancada?: boolean;
    /** Fecha hasta la que se extendió el plazo (si se prorrogó). */
    prorroga_hasta?: string | null;
}

export interface KpiHistorico {
    sparkline: number[];
    mes_anterior: number | null;
    delta_pct: number | null;
}

export interface DashboardHistorico {
    pendientes: KpiHistorico;
    en_transito: KpiHistorico;
    estancados: KpiHistorico;
    discrepancias: KpiHistorico;
    valor_obras: KpiHistorico;
}

export interface CategoriaValor {
    categoria_id: number;
    nombre: string;
    orden: number;
    valor: number;
}

/** Patrimonio (valor en activos) por empresa propietaria: Dedalius (inventario) + empresas de flota (vehículos). */
export interface PatrimonioEmpresa {
    nombre: string;
    color: string;
    /** Sub-rótulo descriptivo: 'inventario', 'vehículos' o 'inventario + vehículos'. */
    tipo: string;
    valor: number;
}

/** Un vehículo con su valor, para el treemap de inversión en vehículos. */
export interface InversionVehiculo {
    label: string;
    valor: number;
    empresa: string;
    color: string;
    tipo: string;
}

export interface BombasHormigonMes {
    eventos: number;
    obras_distintas: number;
    costo_externo: number;
}

export interface DashboardEjecutivoData {
    filtered_obra_id: number | null;
    kpis: DashboardKpis;
    patrimonio_por_empresa: PatrimonioEmpresa[];
    inversion_vehiculos: InversionVehiculo[];
    top_obras: TopObra[];
    alertas: DashboardAlerta[];
    rechazos_recientes: DashboardRechazo[];
    historico: DashboardHistorico;
    valor_por_categoria: CategoriaValor[];
    bombas_hormigon_mes: BombasHormigonMes;
}

export function useDashboardEjecutivo(obraId: number | null = null) {
    const [data, setData] = useState<DashboardEjecutivoData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = obraId
                ? `/inventario/dashboard-ejecutivo?obra_id=${obraId}`
                : '/inventario/dashboard-ejecutivo';
            const res = await api.get<ApiResponse<DashboardEjecutivoData>>(url);
            setData(res.data.data);
            setLastUpdated(Date.now());
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Error al cargar el resumen ejecutivo');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [obraId]);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    return { data, loading, error, refetch: fetchDashboard, lastUpdated };
}

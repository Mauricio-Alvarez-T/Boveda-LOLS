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
}

export interface DashboardAlerta {
    tipo: 'pendiente' | 'discrepancia' | 'transito';
    transferencia_id: number;
    codigo: string;
    dias: number;
    titulo: string;
    detalle: string;
    solicitante?: string | null;
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

export interface DashboardEjecutivoData {
    kpis: DashboardKpis;
    top_obras: TopObra[];
    alertas: DashboardAlerta[];
    rechazos_recientes: DashboardRechazo[];
    historico: DashboardHistorico;
}

export function useDashboardEjecutivo() {
    const [data, setData] = useState<DashboardEjecutivoData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<number | null>(null);

    const fetchDashboard = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get<ApiResponse<DashboardEjecutivoData>>('/inventario/dashboard-ejecutivo');
            setData(res.data.data);
            setLastUpdated(Date.now());
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Error al cargar el resumen ejecutivo');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

    return { data, loading, error, refetch: fetchDashboard, lastUpdated };
}

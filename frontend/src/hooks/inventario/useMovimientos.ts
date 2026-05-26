import { useState, useCallback } from 'react';
import api from '../../services/api';

export type TipoMovimiento =
    | 'ajuste_manual'
    | 'transferencia_salida'
    | 'transferencia_entrada'
    | 'discrepancia'
    | 'factura'
    | 'recepcion';

export interface Movimiento {
    id: number;
    item_id: number;
    obra_id: number | null;
    bodega_id: number | null;
    tipo: TipoMovimiento;
    cantidad_anterior: number;
    cantidad_nueva: number;
    delta: number;
    referencia_tipo: string | null;
    referencia_id: number | null;
    motivo: string | null;
    usuario_id: number | null;
    created_at: string;
    // Campos enriquecidos por el JOIN del backend:
    nro_item: number;
    item_descripcion: string;
    unidad: string;
    obra_nombre: string | null;
    bodega_nombre: string | null;
    usuario_nombre: string | null;
}

export interface MovimientosFiltros {
    obra_id?: number | string;
    bodega_id?: number | string;
    item_id?: number | string;
    tipo?: TipoMovimiento | '';
    desde?: string;
    hasta?: string;
    page?: number;
    limit?: number;
}

interface Pagination {
    page: number;
    limit: number;
    total: number;
    pages: number;
}

export function useMovimientos() {
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [pagination, setPagination] = useState<Pagination | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchMovimientos = useCallback(async (filtros: MovimientosFiltros = {}) => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string> = {};
            for (const [k, v] of Object.entries(filtros)) {
                if (v !== undefined && v !== null && v !== '') params[k] = String(v);
            }
            const res = await api.get('/inventario/movimientos', { params });
            setMovimientos(res.data?.data ?? []);
            setPagination(res.data?.pagination ?? null);
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
                || 'No se pudieron cargar los movimientos';
            setError(msg);
            setMovimientos([]);
            setPagination(null);
        } finally {
            setLoading(false);
        }
    }, []);

    return { movimientos, pagination, loading, error, fetchMovimientos };
}

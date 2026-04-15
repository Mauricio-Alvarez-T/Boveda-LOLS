import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { Transferencia, TransferenciaConDiscrepancias } from '../../types/entities';

interface TransferenciaListResponse {
    data: Transferencia[];
    total: number;
    page: number;
    limit: number;
}

interface CrearTransferenciaData {
    destino_obra_id?: number | null;
    destino_bodega_id?: number | null;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    requiere_pionetas?: boolean;
    cantidad_pionetas?: number;
}

interface AprobarData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    items: { item_id: number; cantidad_enviada: number }[];
}

export function useTransferencias() {
    const [transferencias, setTransferencias] = useState<Transferencia[]>([]);
    const [selected, setSelected] = useState<Transferencia | null>(null);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(0);
    const [discrepancias, setDiscrepancias] = useState<TransferenciaConDiscrepancias[]>([]);
    const [selectedDiscrepancia, setSelectedDiscrepancia] = useState<TransferenciaConDiscrepancias | null>(null);

    const fetchAll = useCallback(async (query: Record<string, any> = {}) => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            Object.entries(query).forEach(([k, v]) => { if (v != null) params.set(k, String(v)); });
            const res = await api.get<TransferenciaListResponse>(`/transferencias?${params}`);
            setTransferencias(res.data.data);
            setTotal(res.data.total);
        } catch {
            setTransferencias([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchById = useCallback(async (id: number) => {
        setLoading(true);
        try {
            const res = await api.get<ApiResponse<Transferencia>>(`/transferencias/${id}`);
            setSelected(res.data.data);
            return res.data.data;
        } catch {
            setSelected(null);
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    const crear = useCallback(async (data: CrearTransferenciaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>('/transferencias', data);
            toast.success(`Solicitud ${res.data.data.codigo} creada`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear solicitud');
            return null;
        }
    }, []);

    const aprobar = useCallback(async (id: number, data: AprobarData) => {
        try {
            await api.put(`/transferencias/${id}/aprobar`, data);
            toast.success('Transferencia aprobada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al aprobar');
            return false;
        }
    }, []);

    const despachar = useCallback(async (id: number) => {
        try {
            await api.put(`/transferencias/${id}/despachar`);
            toast.success('Transferencia despachada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al despachar');
            return false;
        }
    }, []);

    const recibir = useCallback(async (id: number, items: { item_id: number; cantidad_recibida: number }[]) => {
        try {
            await api.put(`/transferencias/${id}/recibir`, { items });
            toast.success('Transferencia recibida — stock actualizado');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al recibir');
            return false;
        }
    }, []);

    const rechazar = useCallback(async (id: number, motivo: string) => {
        try {
            await api.put(`/transferencias/${id}/rechazar`, { motivo });
            toast.success('Transferencia rechazada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al rechazar');
            return false;
        }
    }, []);

    const cancelar = useCallback(async (id: number) => {
        try {
            await api.put(`/transferencias/${id}/cancelar`);
            toast.success('Transferencia cancelada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al cancelar');
            return false;
        }
    }, []);

    const fetchDiscrepancias = useCallback(async (estado: string = 'pendiente') => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (estado) params.set('estado', estado);
            const res = await api.get<{ data: TransferenciaConDiscrepancias[]; total: number }>(
                `/transferencias/discrepancias?${params}`
            );
            setDiscrepancias(res.data.data);
            return res.data.data;
        } catch {
            setDiscrepancias([]);
            return [];
        } finally {
            setLoading(false);
        }
    }, []);

    const resolverDiscrepancia = useCallback(async (
        id: number,
        estado: 'resuelta' | 'descartada',
        resolucion: string
    ) => {
        try {
            await api.put(`/transferencias/discrepancias/${id}/resolver`, { estado, resolucion });
            toast.success(estado === 'resuelta' ? 'Discrepancia resuelta' : 'Discrepancia descartada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al actualizar discrepancia');
            return false;
        }
    }, []);

    const fetchStockPorItems = useCallback(async (itemIds: number[]): Promise<Record<number, { type: string; id: number; nombre: string; cantidad: number }[]>> => {
        try {
            const res = await api.post<{ data: Record<number, { type: string; id: number; nombre: string; cantidad: number }[]> }>('/inventario/stock-por-items', { item_ids: itemIds });
            return res.data.data;
        } catch {
            return {};
        }
    }, []);

    return {
        transferencias, selected, loading, total,
        discrepancias, selectedDiscrepancia, setSelectedDiscrepancia,
        fetchAll, fetchById, crear, aprobar, despachar, recibir, rechazar, cancelar,
        fetchDiscrepancias, resolverDiscrepancia,
        fetchStockPorItems, setSelected
    };
}

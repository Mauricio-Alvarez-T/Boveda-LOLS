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
    tipo_flujo?: 'solicitud' | 'devolucion';
    motivo?: string;
}

interface PushDirectoData {
    origen_bodega_id: number;
    destino_obra_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface IntraBodegaData {
    origen_bodega_id: number;
    destino_bodega_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface DevolucionData {
    origen_obra_id: number;
    destino_bodega_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
    requiere_pionetas?: boolean;
    cantidad_pionetas?: number;
}

interface IntraObraData {
    origen_obra_id: number;
    destino_obra_id: number;
    items: { item_id: number; cantidad: number }[];
    observaciones?: string;
    motivo?: string;
}

interface OrdenGerenciaData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    destino_obra_id?: number | null;
    destino_bodega_id?: number | null;
    items: { item_id: number; cantidad: number }[];
    motivo: string;
    observaciones?: string;
}

interface AprobarData {
    origen_obra_id?: number | null;
    origen_bodega_id?: number | null;
    items: Array<
        // Legacy shape
        | {
            item_id: number;
            cantidad_enviada: number;
            origen_obra_id?: number | null;
            origen_bodega_id?: number | null;
        }
        // Multi-origen shape
        | {
            item_id: number;
            splits: {
                origen_obra_id: number | null;
                origen_bodega_id: number | null;
                cantidad: number;
            }[];
        }
    >;
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

    const pushDirecto = useCallback(async (data: PushDirectoData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/push-directo', data
            );
            toast.success(`Push directo ${res.data.data.codigo} creado`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear push directo');
            return null;
        }
    }, []);

    const intraBodega = useCallback(async (data: IntraBodegaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/intra-bodega', data
            );
            toast.success(`Movimiento ${res.data.data.codigo} registrado — stock actualizado`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al mover entre bodegas');
            return null;
        }
    }, []);

    const devolucion = useCallback(async (data: DevolucionData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>(
                '/transferencias/devolucion', data
            );
            toast.success(`Devolución ${res.data.data.codigo} creada`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear devolución');
            return null;
        }
    }, []);

    const intraObra = useCallback(async (data: IntraObraData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string }>>(
                '/transferencias/intra-obra', data
            );
            toast.success(`Traslado intra-obra ${res.data.data.codigo} creado`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear traslado intra-obra');
            return null;
        }
    }, []);

    const ordenGerencia = useCallback(async (data: OrdenGerenciaData) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; estado: string }>>(
                '/transferencias/orden-gerencia', data
            );
            toast.success(`Orden de gerencia ${res.data.data.codigo} emitida`);
            return res.data.data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al emitir orden de gerencia');
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

    const crearFaltante = useCallback(async (transferenciaId: number) => {
        try {
            const res = await api.post<ApiResponse<{ id: number; codigo: string; items: number } | null>>(
                `/transferencias/${transferenciaId}/crear-faltante`
            );
            const data = res.data.data;
            if (data) {
                toast.success(`Solicitud ${data.codigo} creada por el faltante`);
            }
            return data;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al crear solicitud por faltante');
            return null;
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

    const recibir = useCallback(async (id: number, items: { item_id: number; cantidad_recibida: number; observacion?: string }[]) => {
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

    const rechazarRecepcion = useCallback(async (id: number, motivo: string) => {
        try {
            await api.put(`/transferencias/${id}/rechazar-recepcion`, { motivo });
            toast.success('Recepción rechazada');
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Error al rechazar recepción');
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
        fetchAll, fetchById, crear, pushDirecto, intraBodega, devolucion,
        intraObra, ordenGerencia,
        aprobar, crearFaltante, despachar, recibir, rechazar, rechazarRecepcion, cancelar,
        fetchDiscrepancias, resolverDiscrepancia,
        fetchStockPorItems, setSelected
    };
}

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';

export interface StockRow {
    id: number; // item_id (identificador de ítem, no stock_id — stock_id puede ser null si no existe fila)
    nro_item: number;
    descripcion: string;
    unidad: string;
    categoria_id: number;
    categoria_nombre: string;
    cantidad: number;
    valor_arriendo: number; // efectivo (override si está, sino base)
    ubicacion_stock_id: number | null;
}

interface StockResponseCategoria {
    id: number;
    nombre: string;
    items: Array<{
        id: number;
        nro_item: number;
        descripcion: string;
        unidad: string;
        cantidad: number;
        valor_arriendo: number;
        ubicacion_stock_id: number | null;
    }>;
}

interface StockResponsePayload {
    obra?: { id: number; nombre: string };
    bodega?: { id: number; nombre: string };
    categorias: StockResponseCategoria[];
}

export type UbicacionRef =
    | { type: 'obra'; id: number }
    | { type: 'bodega'; id: number };

interface AdjustmentPayload {
    adjustments: Array<{
        item_id: number;
        obra_id?: number;
        bodega_id?: number;
        cantidad?: number;
        valor_arriendo_override?: number | null;
    }>;
}

/**
 * Hook para el editor masivo de stock por ubicación (Ola 3).
 */
export function useStockMaestro() {
    const [rows, setRows] = useState<StockRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchByUbicacion = useCallback(async (ubi: UbicacionRef | null) => {
        if (!ubi) { setRows([]); return; }
        setLoading(true);
        try {
            const url = ubi.type === 'obra'
                ? `/inventario/stock/obra/${ubi.id}`
                : `/inventario/stock/bodega/${ubi.id}`;
            const res = await api.get<{ data: StockResponsePayload }>(url);
            const cats = res.data.data?.categorias || [];
            const flat: StockRow[] = [];
            for (const c of cats) {
                for (const it of c.items) {
                    flat.push({
                        id: it.id,
                        nro_item: it.nro_item,
                        descripcion: it.descripcion,
                        unidad: it.unidad,
                        categoria_id: c.id,
                        categoria_nombre: c.nombre,
                        cantidad: Number(it.cantidad) || 0,
                        valor_arriendo: Number(it.valor_arriendo) || 0,
                        ubicacion_stock_id: it.ubicacion_stock_id,
                    });
                }
            }
            setRows(flat);
        } catch {
            setRows([]);
            toast.error('Error al cargar stock de la ubicación');
        } finally {
            setLoading(false);
        }
    }, []);

    const bulkAdjust = useCallback(async (payload: AdjustmentPayload): Promise<boolean> => {
        setSaving(true);
        try {
            const res = await api.put<{ data: { updated: number; created: number; diff: any[] } }>(
                '/inventario/stock/bulk', payload
            );
            const { updated, created } = res.data.data;
            if (updated === 0 && created === 0) {
                toast.info('Sin cambios');
            } else {
                toast.success(`Stock ajustado: ${updated} actualizados, ${created} creados`);
            }
            return true;
        } catch (err: any) {
            if (err.response?.status === 413) {
                toast.error(`Demasiados ajustes: máximo ${err.response.data.maxItems} por envío`);
            } else {
                toast.error(err.response?.data?.error || 'Error al ajustar stock');
            }
            return false;
        } finally {
            setSaving(false);
        }
    }, []);

    return { rows, loading, saving, fetchByUbicacion, bulkAdjust };
}

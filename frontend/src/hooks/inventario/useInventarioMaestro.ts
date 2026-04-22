import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ItemInventario } from '../../types/entities';

interface CategoriaMinimal {
    id: number;
    nombre: string;
}

export interface StockLocation {
    type: 'obra' | 'bodega';
    id: number;
    nombre: string;
    cantidad: number;
}

/** Mapa: item_id → array de ubicaciones con stock */
export type StockByItemMap = Record<number, StockLocation[]>;

interface BulkUpdatePayload {
    items: Array<Partial<ItemInventario> & { id: number }>;
}

interface BulkUpdateResponse {
    updated: number;
    diff: Array<{ id: number; changed: Record<string, { from: any; to: any }> }>;
}

/**
 * Hook del grid maestro de ítems (Ola 3).
 * - fetchAll(): lista completa de ítems + categorías + stock por ubicación.
 * - bulkUpdate(payload): PUT /api/inventario/items/bulk. Maneja 413 y errores de validación.
 */
export function useInventarioMaestro() {
    const [items, setItems] = useState<ItemInventario[]>([]);
    const [categorias, setCategorias] = useState<CategoriaMinimal[]>([]);
    const [stockMap, setStockMap] = useState<StockByItemMap>({});
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            // El CRUD genérico devuelve { data: [...], total, page, limit } con paginación;
            // pedimos un limit alto para traerlos todos (inventario maestro es finito).
            const [itemsRes, catsRes] = await Promise.all([
                api.get<{ data: ItemInventario[]; total: number }>('/items-inventario?limit=5000'),
                api.get<{ data: CategoriaMinimal[] }>('/categorias-inventario?limit=500'),
            ]);
            const fetchedItems = itemsRes.data.data || [];
            setItems(fetchedItems);
            setCategorias(catsRes.data.data || []);

            // Fetch stock por ubicación para todos los ítems en un solo batch
            if (fetchedItems.length > 0) {
                try {
                    const ids = fetchedItems.map(i => i.id);
                    const stockRes = await api.post<{ data: StockByItemMap }>(
                        '/inventario/stock-por-items',
                        { item_ids: ids }
                    );
                    setStockMap(stockRes.data.data || {});
                } catch {
                    // Stock es informativo — no bloqueamos por error
                    setStockMap({});
                }
            }
        } catch {
            setItems([]);
            setCategorias([]);
            setStockMap({});
            toast.error('Error al cargar inventario maestro');
        } finally {
            setLoading(false);
        }
    }, []);

    const bulkUpdate = useCallback(async (payload: BulkUpdatePayload): Promise<BulkUpdateResponse | null> => {
        setSaving(true);
        try {
            const res = await api.put<{ data: BulkUpdateResponse }>('/inventario/items/bulk', payload);
            const data = res.data.data;
            if (data.updated === 0) {
                toast.info('Sin cambios');
            } else {
                toast.success(`Actualizados ${data.updated} ítems (${data.diff.length} con cambios efectivos)`);
            }
            // Refrescar lista para reflejar lo guardado
            await fetchAll();
            return data;
        } catch (err: any) {
            if (err.response?.status === 413) {
                toast.error(`Demasiados cambios: máximo ${err.response.data.maxItems} ítems por envío`);
            } else {
                toast.error(err.response?.data?.error || 'Error al guardar cambios');
            }
            return null;
        } finally {
            setSaving(false);
        }
    }, [fetchAll]);

    return { items, categorias, stockMap, loading, saving, fetchAll, bulkUpdate };
}

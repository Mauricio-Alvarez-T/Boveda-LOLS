import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ItemInventario } from '../../types/entities';

interface CategoriaMinimal {
    id: number;
    nombre: string;
}

interface BulkUpdatePayload {
    items: Array<Partial<ItemInventario> & { id: number }>;
}

interface BulkUpdateResponse {
    updated: number;
    diff: Array<{ id: number; changed: Record<string, { from: any; to: any }> }>;
}

/**
 * Hook del grid maestro de ítems (Ola 3).
 * - fetchAll(): lista completa de ítems + categorías.
 * - bulkUpdate(payload): PUT /api/inventario/items/bulk. Maneja 413 y errores de validación.
 */
export function useInventarioMaestro() {
    const [items, setItems] = useState<ItemInventario[]>([]);
    const [categorias, setCategorias] = useState<CategoriaMinimal[]>([]);
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
            setItems(itemsRes.data.data || []);
            setCategorias(catsRes.data.data || []);
        } catch {
            setItems([]);
            setCategorias([]);
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

    return { items, categorias, loading, saving, fetchAll, bulkUpdate };
}

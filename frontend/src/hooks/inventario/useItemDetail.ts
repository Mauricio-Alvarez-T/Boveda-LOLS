import { useState, useCallback, useRef } from 'react';
import api from '../../services/api';
import type { ItemInventario } from '../../types/entities';

export interface StockLocation {
    type: 'obra' | 'bodega';
    id: number;
    nombre: string;
    cantidad: number;
}

export interface UseItemDetailReturn {
    selectedItemId: number | null;
    itemData: ItemInventario | null;
    stockLocations: StockLocation[];
    loading: boolean;
    stockLoading: boolean;
    openItem: (itemId: number, preloadedData?: Partial<ItemInventario>) => void;
    closeItem: () => void;
}

/**
 * Hook para manejar el modal de detalle de ítem.
 * Soporta dos modos:
 *  - Con preloadedData: muestra info inmediato, solo fetchea stock.
 *  - Sin preloadedData: fetchea item + stock en paralelo.
 * Cache de items por sesión (stock siempre fresco).
 */
export function useItemDetail(): UseItemDetailReturn {
    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [itemData, setItemData] = useState<ItemInventario | null>(null);
    const [stockLocations, setStockLocations] = useState<StockLocation[]>([]);
    const [loading, setLoading] = useState(false);
    const [stockLoading, setStockLoading] = useState(false);

    // Cache de items ya vistos (no de stock)
    const cache = useRef<Map<number, ItemInventario>>(new Map());

    const fetchStock = useCallback(async (itemId: number) => {
        try {
            const res = await api.post<{ data: Record<number, StockLocation[]> }>(
                '/inventario/stock-por-items',
                { item_ids: [itemId] }
            );
            return res.data?.data?.[itemId] || [];
        } catch (err) {
            console.error(`Failed to fetch stock for item ${itemId}:`, err);
            return [];
        }
    }, []);

    const fetchItem = useCallback(async (itemId: number): Promise<ItemInventario | null> => {
        // Cache hit
        const cached = cache.current.get(itemId);
        if (cached) return cached;

        try {
            // Backend crud.controller.getById returns item directamente (no envuelto en { data })
            const res = await api.get<ItemInventario>(`/items-inventario/${itemId}`);
            const item = res.data;
            if (!item || typeof item !== 'object' || !('id' in item)) return null;
            cache.current.set(itemId, item);
            return item;
        } catch (err) {
            console.error(`Failed to fetch item ${itemId}:`, err);
            return null;
        }
    }, []);

    const openItem = useCallback((itemId: number, preloadedData?: Partial<ItemInventario>) => {
        setSelectedItemId(itemId);
        setStockLocations([]);

        if (preloadedData) {
            // Datos parciales disponibles → mostrar inmediato
            setItemData({
                id: itemId,
                nro_item: 0,
                categoria_id: 0,
                descripcion: '',
                m2: null,
                valor_compra: 0,
                valor_arriendo: 0,
                unidad: 'U',
                imagen_url: null,
                activo: true,
                ...preloadedData,
            } as ItemInventario);
            setLoading(false);

            // Fetch stock en background
            setStockLoading(true);
            fetchStock(itemId).then(stock => {
                setStockLocations(stock);
                setStockLoading(false);
            });

            // Si faltan campos clave, fetch item completo en background
            if (!preloadedData.imagen_url && !preloadedData.categoria_nombre) {
                fetchItem(itemId).then(full => {
                    if (full) setItemData(prev => prev ? { ...prev, ...full } : full);
                });
            }
        } else {
            // Sin datos → fetch ambos en paralelo
            setLoading(true);
            setStockLoading(true);
            Promise.all([fetchItem(itemId), fetchStock(itemId)])
                .then(([item, stock]) => {
                    if (item) setItemData(item);
                    setStockLocations(stock);
                    setLoading(false);
                    setStockLoading(false);
                })
                .catch(err => {
                    console.error('Error loading item detail:', err);
                    setLoading(false);
                    setStockLoading(false);
                });
        }
    }, [fetchItem, fetchStock]);

    const closeItem = useCallback(() => {
        setSelectedItemId(null);
        setItemData(null);
        setStockLocations([]);
    }, []);

    return {
        selectedItemId,
        itemData,
        stockLocations,
        loading,
        stockLoading,
        openItem,
        closeItem,
    };
}

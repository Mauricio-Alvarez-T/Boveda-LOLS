import { useCallback, useState } from 'react';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario, Bodega, Obra, CategoriaInventario } from '../../types/entities';
import { useTransferencias } from './useTransferencias';
import { EMPTY_WIZARD_DATA, type WizardData } from '../../components/inventario/nuevo-movimiento/wizardEngine';

/**
 * Carga los datos maestros del wizard de "Nuevo movimiento" (catálogo, bodegas,
 * obras, categorías + stock por ítem). Extraído de NuevoMovimientoWizard para
 * separar la carga de datos de la vista/estado (que viven en `useWizardEngine` +
 * `NuevoMovimientoWizardView`). `reload()` se dispara al abrir el wizard.
 */
export function useNuevoMovimientoData() {
    const { fetchStockPorItems } = useTransferencias();
    const [data, setData] = useState<WizardData>(EMPTY_WIZARD_DATA);
    const [loadingData, setLoadingData] = useState(true);

    const reload = useCallback(async () => {
        setLoadingData(true);
        try {
            const [itemsRes, bodRes, obrasRes, catRes] = await Promise.all([
                api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500'),
                api.get<ApiResponse<Bodega[]>>('/bodegas?activa=true&participa_transferencias=1&limit=50'),
                api.get<ApiResponse<Obra[]>>('/obras?activo=true&participa_transferencias=1&limit=500'),
                api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=100'),
            ]);
            const items = itemsRes.data.data;
            const stockMap = items.length ? await fetchStockPorItems(items.map(i => i.id)) : {};
            setData({
                catalogo: items,
                bodegas: bodRes.data.data || [],
                obras: (obrasRes.data.data || []).map(o => ({ id: o.id, nombre: o.nombre })),
                categorias: catRes.data.data || [],
                stockMap,
            });
            setLoadingData(false);
        } catch {
            setLoadingData(false);
        }
    }, [fetchStockPorItems]);

    return { data, loadingData, reload };
}

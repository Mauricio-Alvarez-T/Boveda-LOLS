import { useCallback } from 'react';
import { toast } from 'sonner';
import api from '../../services/api';
import { showApiError } from '../../utils/toastUtils';

export function useInventarioActions() {
    const updateStock = useCallback(async (
        itemId: number,
        obraId: number | null,
        bodegaId: number | null,
        data: { cantidad?: number; valor_arriendo_override?: number | null }
    ) => {
        try {
            await api.put('/inventario/stock', {
                item_id: itemId,
                obra_id: obraId,
                bodega_id: bodegaId,
                ...data
            });
            toast.success('Stock actualizado');
            return true;
        } catch (err) {
            showApiError(err, 'Error al actualizar stock');
            return false;
        }
    }, []);

    const updateDescuento = useCallback(async (obraId: number, porcentaje: number) => {
        try {
            await api.put(`/inventario/descuento/obra/${obraId}`, { porcentaje });
            toast.success('Descuento actualizado');
            return true;
        } catch (err) {
            showApiError(err, 'Error al actualizar descuento');
            return false;
        }
    }, []);

    return { updateStock, updateDescuento };
}

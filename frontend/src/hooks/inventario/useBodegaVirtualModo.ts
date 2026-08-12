import { useCallback, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import type { BodegaVirtualModo } from './useInventarioData';

/**
 * Modo de visibilidad de la Bodega Virtual (mig 099), POR USUARIO:
 *   ocultar (default) → mostrar (sin sumar) → sumar → ocultar → ...
 * Persistido en localStorage con clave por usuario (patrón useDashboardLayout),
 * para que lo que active un usuario no cambie lo que ven los demás.
 */

const STORAGE_PREFIX = 'sgdl_bodega_virtual_modo_';
const MODOS: BodegaVirtualModo[] = ['ocultar', 'mostrar', 'sumar'];

const isModo = (v: unknown): v is BodegaVirtualModo =>
    v === 'ocultar' || v === 'mostrar' || v === 'sumar';

export function useBodegaVirtualModo() {
    const { user } = useAuth();
    const storageKey = `${STORAGE_PREFIX}${user?.id ?? 'anon'}`;

    const [modo, setModo] = useState<BodegaVirtualModo>(() => {
        try {
            const saved = localStorage.getItem(storageKey);
            return isModo(saved) ? saved : 'ocultar';
        } catch {
            return 'ocultar';
        }
    });

    const cycle = useCallback(() => {
        setModo(prev => {
            const next = MODOS[(MODOS.indexOf(prev) + 1) % MODOS.length];
            try { localStorage.setItem(storageKey, next); } catch { /* storage lleno/bloqueado: el modo queda en memoria */ }
            return next;
        });
    }, [storageKey]);

    return { modo, cycle };
}

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/**
 * Contadores de Ideas para Bóveda, como stores de módulo (mismo diseño que
 * `useSolicitudesIngreso`): una sola request compartida entre el menú lateral,
 * el modal y la bandeja; al cambiar algo, `refetch` baja el número en todos lados.
 *
 *  · `useMisIdeasResumen`: para cualquier usuario — cuántas ideas tiene y cuántas
 *    cambiaron de estado sin que las haya visto (el punto en "Proponer una mejora").
 *  · `useIdeasPendientes`: solo revisores (`ideas.revisar`) — el número del menú.
 */

const REFRESCO_MS = 5 * 60 * 1000;

interface Store<T> {
    get: () => T;
    subscribe: (cb: () => void) => () => void;
    cargar: () => Promise<void>;
    montar: () => () => void;
}

function crearStore<T>(inicial: T, url: string, leer: (data: unknown) => T): Store<T> {
    let estado = inicial;
    let enVuelo: Promise<void> | null = null;
    let timer: number | null = null;
    let montados = 0;
    const subs = new Set<() => void>();
    const emitir = (n: T) => { estado = n; subs.forEach(fn => fn()); };

    const cargar = () => {
        if (enVuelo) return enVuelo;
        enVuelo = api.get<{ data: unknown }>(url)
            .then(res => emitir(leer(res.data.data)))
            // Silencioso: un contador no es lugar para un toast.
            .catch(() => { /* se queda con el último valor */ })
            .finally(() => { enVuelo = null; });
        return enVuelo;
    };

    return {
        get: () => estado,
        subscribe: cb => { subs.add(cb); return () => { subs.delete(cb); }; },
        cargar,
        montar: () => {
            montados++;
            if (montados === 1) {
                cargar();
                timer = window.setInterval(cargar, REFRESCO_MS);
            }
            return () => {
                montados--;
                if (montados === 0 && timer !== null) { window.clearInterval(timer); timer = null; }
            };
        },
    };
}

const misIdeasStore = crearStore(
    { total: 0, novedades: 0 },
    '/ideas/mias/resumen',
    d => {
        const r = (d || {}) as { total?: number; novedades?: number };
        return { total: Number(r.total) || 0, novedades: Number(r.novedades) || 0 };
    },
);

const pendientesStore = crearStore(
    { total: 0 },
    '/ideas/pendientes/count',
    d => ({ total: Number((d as { total?: number } | null)?.total) || 0 }),
);

export function useMisIdeasResumen() {
    const { isAuthenticated } = useAuth();
    const snap = useSyncExternalStore(misIdeasStore.subscribe, misIdeasStore.get);
    useEffect(() => (isAuthenticated ? misIdeasStore.montar() : undefined), [isAuthenticated]);
    const refetch = useCallback(() => misIdeasStore.cargar(), []);
    return { ...snap, refetch };
}

export function useIdeasPendientes() {
    const { hasPermission } = useAuth();
    const puedeRevisar = hasPermission('ideas.revisar');
    const snap = useSyncExternalStore(pendientesStore.subscribe, pendientesStore.get);
    useEffect(() => (puedeRevisar ? pendientesStore.montar() : undefined), [puedeRevisar]);
    const refetch = useCallback(() => (puedeRevisar ? pendientesStore.cargar() : Promise.resolve()), [puedeRevisar]);
    return { pendientes: puedeRevisar ? snap.total : 0, refetch };
}

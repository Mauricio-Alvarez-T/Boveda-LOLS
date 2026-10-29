import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import api from '../../services/api';
import { SONDEO_PUBLICACION_MS, mensajeError } from './sitioWebConfig';
import type { DetallePublicacion } from './tipos';

/**
 * Cómo va una publicación después del commit (plan 4.7.9): `GET /sitio-web/publicaciones/:id`, que de paso pone al
 * día la compilación (GitHub Actions) y el «en línea» (build.txt del sitio). Se consulta cada 10 s **solo mientras
 * alguien la está mirando y no terminó** (patrón `useErroresSoporte`: un store por publicación, compartido entre
 * quienes la muestran). Al desmontar el último, se apaga el sondeo.
 */

interface Snap { datos: DetallePublicacion | null; error: string | null }

interface Store {
    snap: Snap;
    subs: Set<() => void>;
    enVuelo: Promise<void> | null;
    timer: number | null;
    montados: number;
}

const stores = new Map<number, Store>();

function storeDe(id: number): Store {
    let s = stores.get(id);
    if (!s) {
        s = { snap: { datos: null, error: null }, subs: new Set(), enVuelo: null, timer: null, montados: 0 };
        stores.set(id, s);
    }
    return s;
}

function parar(s: Store) {
    if (s.timer !== null) { window.clearInterval(s.timer); s.timer = null; }
}

function cargar(id: number): Promise<void> {
    const s = storeDe(id);
    if (s.enVuelo) return s.enVuelo;
    s.enVuelo = api.get<{ data: DetallePublicacion }>(`/sitio-web/publicaciones/${id}`)
        .then(res => {
            s.snap = { datos: res.data.data, error: null };
            if (res.data.data.terminada) parar(s);
        })
        .catch(e => {
            // Un error al sondear no borra lo que ya se veía.
            s.snap = { datos: s.snap.datos, error: mensajeError(e, 'No se pudo consultar la publicación.') };
        })
        .finally(() => {
            s.enVuelo = null;
            s.subs.forEach(fn => fn());
        });
    return s.enVuelo;
}

function montar(id: number): () => void {
    const s = storeDe(id);
    s.montados++;
    if (s.montados === 1) {
        cargar(id);
        if (!s.snap.datos?.terminada) {
            s.timer = window.setInterval(() => {
                if (storeDe(id).snap.datos?.terminada) parar(s);
                else cargar(id);
            }, SONDEO_PUBLICACION_MS);
        }
    }
    return () => {
        s.montados--;
        if (s.montados === 0) parar(s);
    };
}

export function useEstadoPublicacion(id: number) {
    const s = storeDe(id);
    const suscribir = useMemo(() => (cb: () => void) => { s.subs.add(cb); return () => { s.subs.delete(cb); }; }, [s]);
    const leer = useCallback(() => s.snap, [s]);
    const snap = useSyncExternalStore(suscribir, leer);
    useEffect(() => montar(id), [id]);
    const recargar = useCallback(() => cargar(id), [id]);
    return { ...snap, recargar };
}

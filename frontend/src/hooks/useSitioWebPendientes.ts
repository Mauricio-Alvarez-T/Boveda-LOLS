import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { totalPendientes } from '../components/sitio-web/reglas';

/**
 * El número de «Sitio web» en el menú (mig 147): fotos por aprobar + obras que la próxima publicación cambia
 * (`GET /sitio-web/pendientes`). Solo quien publica (`sitio_web.publicar`): es lo que le espera a esa persona. Un pedido
 * compartido entre el menú y la pantalla (como `useIdeasPendientes`), cada 5 minutos; la pantalla lo vuelve a pedir
 * después de aprobar, incluir o publicar (`recargarPendientesSitioWeb`).
 */

const REFRESCO_MS = 5 * 60 * 1000;

let total = 0;
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;
const subs = new Set<() => void>();

function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    enVuelo = api.get<{ data: { fotosPorAprobar: number; obrasConCambios: number } }>('/sitio-web/pendientes')
        .then(res => {
            total = totalPendientes(res.data?.data);
            subs.forEach(fn => fn());
        })
        // Silencioso: un contador no es lugar para un toast (sin la migración 147 responde 409).
        .catch(() => { /* se queda con el último valor */ })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

function montar(): () => void {
    montados++;
    if (montados === 1) {
        cargar();
        timer = window.setInterval(cargar, REFRESCO_MS);
    }
    return () => {
        montados--;
        if (montados === 0 && timer !== null) { window.clearInterval(timer); timer = null; }
    };
}

const suscribir = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
const leer = () => total;

/** Vuelve a pedir el número (después de una acción que lo cambia). Sin nadie mirando, no hace nada. */
export const recargarPendientesSitioWeb = (): Promise<void> => (montados > 0 ? cargar() : Promise.resolve());

export function useSitioWebPendientes() {
    const { hasPermission } = useAuth();
    const publica = hasPermission('sitio_web.publicar');
    const snap = useSyncExternalStore(suscribir, leer);
    useEffect(() => (publica ? montar() : undefined), [publica]);
    const refetch = useCallback(() => (publica ? cargar() : Promise.resolve()), [publica]);
    return { pendientes: publica ? snap : 0, refetch };
}

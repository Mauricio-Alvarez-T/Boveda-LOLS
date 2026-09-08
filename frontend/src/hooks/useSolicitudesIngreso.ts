import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';

/** Cada cuánto se refresca solo (5 min: una ficha nueva de terreno debe verse pronto en oficina). */
const REFRESCO_MS = 5 * 60 * 1000;

interface Estado {
    /** Solicitudes de ingreso en estado `pendiente` (GET /solicitudes-ingreso/pendientes/count). */
    pendientes: number;
    loading: boolean;
}

/**
 * Store de módulo, NO estado por componente — mismo diseño que
 * `useVencimientosVehiculos`: el contador lo consumen a la vez el menú lateral
 * (badge de Consultas), el botón "Solicitudes" de la página y la Bandeja del
 * Día. Una sola request compartida y una sola verdad: al aprobar/rechazar, el
 * `refetch` baja el número en los tres lugares.
 */
let estado: Estado = { pendientes: 0, loading: false };
const suscriptores = new Set<() => void>();
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;

const emitir = (nuevo: Estado) => { estado = nuevo; suscriptores.forEach(fn => fn()); };

/** Una sola request aunque la pidan varios componentes en el mismo tick. */
function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    emitir({ ...estado, loading: true });
    // incluir_prueba: mismo criterio que la lista del panel y la grilla de Consultas.
    enVuelo = api.get<{ data: { total: number } }>('/solicitudes-ingreso/pendientes/count?incluir_prueba=true')
        .then(res => { emitir({ pendientes: Number(res.data.data?.total) || 0, loading: false }); })
        // Silencioso: el contador no es lugar para un toast — sin datos no se muestra número.
        .catch(() => { emitir({ pendientes: 0, loading: false }); })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

const subscribe = (cb: () => void) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; };
const getSnapshot = () => estado;

/**
 * Pendientes de la ficha de ingreso digital. El conteo lo expone el backend
 * SOLO a quien aprueba (`trabajadores.solicitud.aprobar`): sin ese permiso no
 * se pide nada y `pendientes` es 0 (el solicitante ve sus fichas en la lista,
 * no en el badge).
 */
export function useSolicitudesIngreso() {
    const { hasPermission } = useAuth();
    const puedeAprobar = hasPermission('trabajadores.solicitud.aprobar');
    const snap = useSyncExternalStore(subscribe, getSnapshot);

    const refetch = useCallback(() => (puedeAprobar ? cargar() : Promise.resolve()), [puedeAprobar]);

    useEffect(() => {
        if (!puedeAprobar) return;
        montados++;
        cargar();
        // Un único intervalo para todos los consumidores, no uno por componente.
        if (timer == null) timer = window.setInterval(cargar, REFRESCO_MS);
        return () => {
            montados--;
            if (montados === 0 && timer != null) { window.clearInterval(timer); timer = null; }
        };
    }, [puedeAprobar]);

    // Gate también a la salida: el store es de módulo y sobrevive un cambio de
    // sesión en la misma pestaña — un usuario sin permiso no debe heredar el número.
    return { pendientes: puedeAprobar ? snap.pendientes : 0, loading: snap.loading, refetch };
}

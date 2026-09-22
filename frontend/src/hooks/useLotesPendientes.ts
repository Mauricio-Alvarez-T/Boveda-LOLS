import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { PendientesLotes } from '../components/documentos-fisicos/documentosFisicos';

/** Cada cuánto se refresca solo (5 min: el portador debe ver pronto que RRHH le armó un lote). */
const REFRESCO_MS = 5 * 60 * 1000;

interface Estado {
    pendientes: PendientesLotes | null;
    loading: boolean;
}

/**
 * Store de módulo (mismo diseño que useSolicitudesIngreso): el contador de lotes lo consumen a la vez el
 * botón "Documentos físicos" de Gestiones y la Bandeja del Día. Una sola request compartida; `refetch`
 * tras crear/confirmar/recibir un lote actualiza ambos.
 * Gate: documentos.entrega.registrar (RRHH: alcance global) o .portar (portador: solo sus lotes) — el
 * backend decide el alcance; sin ninguno no se pide nada.
 */
let estado: Estado = { pendientes: null, loading: false };
const suscriptores = new Set<() => void>();
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;

const emitir = (nuevo: Estado) => { estado = nuevo; suscriptores.forEach(fn => fn()); };

function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    emitir({ ...estado, loading: true });
    enVuelo = api.get<{ data: PendientesLotes }>('/documentos-lotes/pendientes/count')
        .then(res => { emitir({ pendientes: res.data?.data ?? null, loading: false }); })
        // Silencioso: sin datos no se muestra número (mig 114 pendiente devuelve ceros igual).
        .catch(() => { emitir({ pendientes: null, loading: false }); })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

const subscribe = (cb: () => void) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; };
const getSnapshot = () => estado;

export function useLotesPendientes() {
    const { hasPermission } = useAuth();
    const habilitado = hasPermission('documentos.entrega.registrar') || hasPermission('documentos.entrega.portar');
    const snap = useSyncExternalStore(subscribe, getSnapshot);

    const refetch = useCallback(() => (habilitado ? cargar() : Promise.resolve()), [habilitado]);

    useEffect(() => {
        if (!habilitado) return;
        montados++;
        cargar();
        if (timer == null) timer = window.setInterval(cargar, REFRESCO_MS);
        return () => {
            montados--;
            if (montados === 0 && timer != null) { window.clearInterval(timer); timer = null; }
        };
    }, [habilitado]);

    // Gate también a la salida: el store sobrevive un cambio de sesión en la misma pestaña.
    const pendientes = habilitado ? snap.pendientes : null;
    return {
        pendientes,
        /** Lo que exige acción de QUIEN mira: al portador, sus lotes por confirmar; a RRHH, los lotes en terreno. */
        badge: pendientes ? (pendientes.alcance === 'propios' ? pendientes.por_confirmar : pendientes.en_terreno + pendientes.por_confirmar) : 0,
        loading: snap.loading,
        refetch,
    };
}

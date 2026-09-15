import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { AlertasDocumentos } from '../components/documentos-fisicos/documentosAlertas';

/** Cada cuánto se refresca solo (5 min: los días cambian una vez al día, pero los lotes se mueven). */
const REFRESCO_MS = 5 * 60 * 1000;

interface Estado { alertas: AlertasDocumentos | null; loading: boolean }

/**
 * Store de módulo (mismo diseño que useSolicitudesIngreso / useLotesPendientes): las alertas de documentos
 * sin firmar las consumen la Bandeja del Día y la pestaña Documentos físicos. Gate: documentos.entrega.registrar
 * (RRHH). El portador NO las ve: para él basta el contador de sus lotes (useLotesPendientes).
 */
let estado: Estado = { alertas: null, loading: false };
const suscriptores = new Set<() => void>();
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;

const emitir = (nuevo: Estado) => { estado = nuevo; suscriptores.forEach(fn => fn()); };

function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    emitir({ ...estado, loading: true });
    enVuelo = api.get<{ data: AlertasDocumentos }>('/documentos-alertas/pendientes')
        .then(res => { emitir({ alertas: res.data?.data ?? null, loading: false }); })
        // Silencioso: sin datos no hay filas (mig 115 pendiente devuelve la estructura vacía igual).
        .catch(() => { emitir({ alertas: null, loading: false }); })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

const subscribe = (cb: () => void) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; };
const getSnapshot = () => estado;

export function useDocumentosAlertas() {
    const { hasPermission } = useAuth();
    const habilitado = hasPermission('documentos.entrega.registrar');
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

    return { alertas: habilitado ? snap.alertas : null, loading: snap.loading, refetch };
}

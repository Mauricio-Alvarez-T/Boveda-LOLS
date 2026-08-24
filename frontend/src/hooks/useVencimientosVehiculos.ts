import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { VehiculoVencimientosResumen } from '../types/entities';

const VACIO: VehiculoVencimientosResumen = { items: [], total: 0, vencidos: 0, por_vencer: 0, dias: 30 };

/** Cada cuánto se refresca solo (10 min: los vencimientos cambian por día, no por minuto). */
const REFRESCO_MS = 10 * 60 * 1000;

type Estado = VehiculoVencimientosResumen & { loading: boolean };

/**
 * Store de módulo, NO estado por componente: hoy hay tres consumidores montados a
 * la vez (menú lateral, página de Vehículos y bandeja del Inicio). Con un
 * useState por hook serían tres requests iguales y, peor, tres verdades: al
 * guardar un documento se actualizaba el contador de la página pero el del menú
 * quedaba viejo hasta su propio refresco.
 */
let estado: Estado = { ...VACIO, loading: false };
const suscriptores = new Set<() => void>();
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;

const emitir = (nuevo: Estado) => { estado = nuevo; suscriptores.forEach(fn => fn()); };

/** Una sola request aunque la pidan varios componentes en el mismo tick. */
function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    emitir({ ...estado, loading: true });
    enVuelo = api.get<{ data: VehiculoVencimientosResumen }>('/vehiculos/vencimientos')
        .then(res => { emitir({ ...(res.data.data || VACIO), loading: false }); })
        // Silencioso: el contador no es lugar para un toast — sin datos no se muestra número.
        .catch(() => { emitir({ ...VACIO, loading: false }); })
        .finally(() => { enVuelo = null; });
    return enVuelo;
}

const subscribe = (cb: () => void) => { suscriptores.add(cb); return () => { suscriptores.delete(cb); }; };
const getSnapshot = () => estado;

/**
 * Vencimientos del módulo Vehículos: total para el badge y `items` para
 * desglosar por empresa/vehículo. Sin permiso `vehiculos.ver` no pide nada.
 */
export function useVencimientosVehiculos() {
    const { hasPermission } = useAuth();
    const puedeVer = hasPermission('vehiculos.ver');
    const snap = useSyncExternalStore(subscribe, getSnapshot);

    const refetch = useCallback(() => (puedeVer ? cargar() : Promise.resolve()), [puedeVer]);

    useEffect(() => {
        if (!puedeVer) return;
        montados++;
        cargar();
        // Un único intervalo para todos los consumidores, no uno por componente.
        if (timer == null) timer = window.setInterval(cargar, REFRESCO_MS);
        return () => {
            montados--;
            if (montados === 0 && timer != null) { window.clearInterval(timer); timer = null; }
        };
    }, [puedeVer]);

    return { ...snap, refetch };
}

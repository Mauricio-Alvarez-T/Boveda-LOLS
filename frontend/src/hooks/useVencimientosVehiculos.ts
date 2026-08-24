import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { VehiculoVencimientosResumen } from '../types/entities';

const VACIO: VehiculoVencimientosResumen = { items: [], total: 0, vencidos: 0, por_vencer: 0, dias: 30 };

/** Cada cuánto se refresca solo el contador (10 min: los vencimientos cambian por día, no por minuto). */
const REFRESCO_MS = 10 * 60 * 1000;

/**
 * Contador de vencimientos del módulo Vehículos para el badge del menú.
 *
 * Vive en el Sidebar, que se monta en TODAS las páginas: por eso el fetch es uno
 * solo, silencioso (un error no muestra toast — el menú no es el lugar para
 * reportarlo) y sin permiso `vehiculos.ver` no se llama nunca.
 */
export function useVencimientosVehiculos() {
    const { hasPermission } = useAuth();
    const puedeVer = hasPermission('vehiculos.ver');
    const [data, setData] = useState<VehiculoVencimientosResumen>(VACIO);
    const [loading, setLoading] = useState(false);

    const refetch = useCallback(async () => {
        if (!puedeVer) { setData(VACIO); return; }
        setLoading(true);
        try {
            const res = await api.get<{ data: VehiculoVencimientosResumen }>('/vehiculos/vencimientos');
            setData(res.data.data || VACIO);
        } catch {
            setData(VACIO);   // silencioso: sin datos el badge simplemente no aparece
        } finally { setLoading(false); }
    }, [puedeVer]);

    useEffect(() => {
        refetch();
        if (!puedeVer) return;
        const id = window.setInterval(refetch, REFRESCO_MS);
        return () => window.clearInterval(id);
    }, [refetch, puedeVer]);

    return { ...data, loading, refetch };
}

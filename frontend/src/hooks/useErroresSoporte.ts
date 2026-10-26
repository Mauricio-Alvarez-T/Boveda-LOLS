import { useCallback, useEffect, useSyncExternalStore } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { esSuperAdmin } from '../components/dashboard/widgets/inventarioPerfil/perfil';

/**
 * El número de «Errores» de Soporte (mig 141): cuántos avisos esperan revisión (falla, pantalla rota, permiso) y si en
 * la última hora varias personas tuvieron respuestas lentas. Solo el Super Administrador (rol 1) y nunca con «ver
 * como». Un solo pedido compartido entre el menú y la pestaña (como `useIdeasPendientes`), cada 5 minutos.
 */

export interface ResumenErrores {
    pendientes: number;
    lentos: { personas: number; veces: number; desde: string | null; hasta: string | null };
}

const VACIO: ResumenErrores = { pendientes: 0, lentos: { personas: 0, veces: 0, desde: null, hasta: null } };
const REFRESCO_MS = 5 * 60 * 1000;

let estado: ResumenErrores = VACIO;
let enVuelo: Promise<void> | null = null;
let timer: number | null = null;
let montados = 0;
const subs = new Set<() => void>();

function cargar(): Promise<void> {
    if (enVuelo) return enVuelo;
    enVuelo = api.get<{ data: ResumenErrores }>('/soporte/errores/resumen')
        .then(res => {
            const d = res.data?.data;
            estado = {
                pendientes: Number(d?.pendientes) || 0,
                lentos: {
                    personas: Number(d?.lentos?.personas) || 0, veces: Number(d?.lentos?.veces) || 0,
                    desde: d?.lentos?.desde ?? null, hasta: d?.lentos?.hasta ?? null,
                },
            };
            subs.forEach(fn => fn());
        })
        // Silencioso: un contador no es lugar para un toast.
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
const leer = () => estado;

export function useErroresSoporte() {
    const { user, verComo } = useAuth();
    const activo = esSuperAdmin(user) && !verComo;
    const snap = useSyncExternalStore(suscribir, leer);
    useEffect(() => (activo ? montar() : undefined), [activo]);
    const refetch = useCallback(() => cargar(), []);
    return { ...(activo ? snap : VACIO), refetch };
}

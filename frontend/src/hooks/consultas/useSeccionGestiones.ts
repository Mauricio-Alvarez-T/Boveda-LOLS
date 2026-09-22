import { useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    resolverSeccion, seccionesDisponibles, tieneParamsGrilla, leerUltima, guardarUltima, PARAMS_GRILLA,
    type PermisosGestiones, type SeccionGestiones,
} from '../../components/consultas/gestionesNav';

interface Opts {
    permisos: PermisosGestiones;
    userId: number | string | null | undefined;
    /**
     * Fija la sección e ignora URL y memoria (tutoriales de Ayuda: el sandbox monta la página bajo /ayuda sin
     * router propio y con permisos all-true; sin esto caería en la portada y no escribiría la URL de /ayuda).
     */
    seccionFija?: SeccionGestiones;
}

/**
 * Sección actual de Gestiones (plan Gestiones B8). La URL (`?tab=`) es la fuente de verdad: al montar, si la
 * sección resuelta (tab → deep-link de filtros → última usada → portada/única) no coincide con la URL se hace
 * un `replace` (recarga y botón atrás deterministas); al mostrar una sección de trabajo se recuerda por usuario.
 */
export function useSeccionGestiones({ permisos, userId, seccionFija }: Opts) {
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab');
    const conParams = tieneParamsGrilla(searchParams);
    const disponibles = useMemo(() => seccionesDisponibles(permisos), [permisos]);

    const seccion = useMemo<SeccionGestiones | null>(() => {
        if (seccionFija) return seccionFija;
        return resolverSeccion({ tab, tieneParamsGrilla: conParams, permisos, ultima: leerUltima(userId) });
    }, [seccionFija, tab, conParams, permisos, userId]);

    // La URL refleja la sección (replace: no deja una entrada de historial basura).
    useEffect(() => {
        if (seccionFija || !seccion || tab === seccion) return;
        setSearchParams(prev => { const next = new URLSearchParams(prev); next.set('tab', seccion); return next; }, { replace: true });
    }, [seccionFija, seccion, tab, setSearchParams]);

    // Memoria por usuario (solo secciones de trabajo; `guardarUltima` ignora la portada).
    useEffect(() => {
        if (seccionFija || !seccion) return;
        guardarUltima(userId, seccion);
    }, [seccionFija, seccion, userId]);

    /** Navega a una sección (push). `extra` = params de la grilla para los atajos de la portada. No-op si ya está ahí sin extras. */
    const irA = useCallback((destino: SeccionGestiones, extra?: Record<string, string>) => {
        if (seccionFija) return;
        if (destino === seccion && !extra) return;
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            next.set('tab', destino);
            // Fuera de la grilla los filtros no aplican: no arrastrarlos a la portada ni a otra sección.
            if (destino !== 'trabajadores') { for (const k of PARAMS_GRILLA) next.delete(k); next.delete('page'); }
            if (extra) for (const [k, v] of Object.entries(extra)) next.set(k, v);
            return next;
        });
    }, [seccionFija, seccion, setSearchParams]);

    return { seccion, irA, disponibles, sinAcceso: seccion === null };
}

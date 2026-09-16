import { useCallback, useSyncExternalStore } from 'react';

/**
 * ¿Se cumple esta media query ahora? (2026-09-16)
 *
 * Existe por la razón que documenta `ui/Modal.tsx:53-59`: elegir el layout con `hidden md:block` /
 * `md:hidden` monta los hijos DOS VECES en el DOM. En el Modal eso duplicaba ids de formulario; en el
 * panel de filtros duplicaba los 12 controles y sus `aria-label`. Con esto se renderiza uno solo.
 *
 * `useSyncExternalStore` en vez de useState+useEffect: matchMedia es exactamente un store externo, y así
 * no hay un setState dentro del efecto (que el React Compiler marca como render en cascada).
 */
export const useMediaQuery = (query: string): boolean => {
    const subscribe = useCallback((alCambiar: () => void) => {
        if (typeof window === 'undefined' || !window.matchMedia) return () => {};
        const mq = window.matchMedia(query);
        mq.addEventListener('change', alCambiar);
        return () => mq.removeEventListener('change', alCambiar);
    }, [query]);

    const leer = useCallback(
        () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(query).matches,
        [query]
    );

    // El tercer argumento es el valor en servidor/prerender: sin ventana, no hay rail.
    return useSyncExternalStore(subscribe, leer, () => false);
};

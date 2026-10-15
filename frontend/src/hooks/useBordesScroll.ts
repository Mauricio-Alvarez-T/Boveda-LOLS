// Idea: GradualBlur de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { calcBordes, type Bordes } from '../utils/movimiento';

export interface BordesScroll<T extends HTMLElement> extends Bordes {
    /** Va en el contenedor con `overflow-x-auto`. */
    ref: RefObject<T | null>;
}

/**
 * ¿Queda contenido escondido a la izquierda / derecha de un scroll horizontal? (diseno.md §9)
 *
 * Existe por la franja de chips de asistencia en mobile: en un teléfono de 360 px un día con
 * A/F/JI/TO/V/LM deja los últimos detrás de una barra de scroll invisible y el capataz no sabe
 * que «LM 2» existe ni que se puede filtrar. Se pinta con `ui/BordeScroll`.
 *
 * - Mide amortiguado con `requestAnimationFrame` (como `useTutorialSpotlight`): a lo más una
 *   medición por frame aunque el scroll dispare varios eventos.
 * - El estado solo cambia cuando un booleano se da vuelta: scrollear NO re-renderiza por frame.
 * - La medición inicial la hace el `ResizeObserver` (dispara una vez al llamar `observe()`), así
 *   que no hay `setState` síncrono dentro del efecto.
 * - El `ResizeObserver` mira el contenedor Y cada hijo directo: el ancho del contenedor lo pone el
 *   padre, así que si un chip crece (9→10, la fuente web que llega tarde) solo lo delata el hijo.
 *   Las llamadas iniciales de cada `observe()` caen en el mismo frame y se funden en una medición.
 * - `medirCuando` es la identidad del contenido (p. ej. los ids de los chips): al cambiar, vuelve a
 *   cablear el observer para que los hijos nuevos o reemplazados también se observen.
 * - Un contenedor oculto (`md:hidden` en desktop) mide 0×0 y ambos bordes quedan en false.
 */
export function useBordesScroll<T extends HTMLElement>(medirCuando?: unknown): BordesScroll<T> {
    const ref = useRef<T>(null);
    const [bordes, setBordes] = useState<Bordes>({ antes: false, despues: false });

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        let raf = 0;
        const medir = () => {
            raf = 0;
            const n = calcBordes(el.scrollLeft, el.scrollWidth, el.clientWidth);
            // Mismo objeto si nada cambió: React descarta el render.
            setBordes(p => (p.antes === n.antes && p.despues === n.despues ? p : n));
        };
        const programar = () => {
            if (!raf) raf = requestAnimationFrame(medir);
        };

        el.addEventListener('scroll', programar, { passive: true });
        // Sin ResizeObserver (navegador muy viejo): una sola medición, igual en el próximo frame.
        const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(programar);
        if (ro) {
            ro.observe(el);
            for (const hijo of Array.from(el.children)) ro.observe(hijo);
        } else programar();

        return () => {
            el.removeEventListener('scroll', programar);
            ro?.disconnect();
            if (raf) cancelAnimationFrame(raf);
        };
    }, [medirCuando]);

    return { ref, antes: bordes.antes, despues: bordes.despues };
}

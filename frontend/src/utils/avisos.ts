import type { CSSProperties } from 'react';

/**
 * Avisos (sonner): la duración y la «mecha» que muestra cuánto le queda a cada uno (2026-10-20).
 *
 * La mecha es una línea fina abajo del aviso que se acorta hasta que se cierra solo (idea: Swipe Toast de
 * React Bits; el CSS vive en index.css § Avisos). Para que no mienta, cada aviso con duración propia pasa
 * la misma duración a la línea: en vez de `{ duration: 8000 }`, `{ ...conDuracion(8000) }`.
 */

/** Duración por defecto de los avisos: la del `<Toaster>` de main.tsx. */
export const DURACION_AVISO = 3000;

/** Opciones de un aviso que dura `ms` (también la mecha). `Infinity` = sin mecha: no se cierra solo. */
export const conDuracion = (ms: number): { duration: number; style: CSSProperties } => ({
    duration: ms,
    style: (Number.isFinite(ms)
        ? { '--aviso-duracion': `${ms}ms` }
        : { '--aviso-mecha': 'transparent' }) as unknown as CSSProperties,
});

/** Estilo por defecto del `<Toaster>` (toastOptions.style): la mecha dura lo mismo que el aviso. */
export const ESTILO_AVISO = { '--aviso-duracion': `${DURACION_AVISO}ms` } as CSSProperties;

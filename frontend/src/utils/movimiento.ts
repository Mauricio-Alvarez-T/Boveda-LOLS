/**
 * Aritmética del movimiento (diseno.md §9): funciones puras que deciden HACIA DÓNDE
 * se mueve algo, separadas de los componentes para poder testearlas sin DOM.
 */

/** Sentido de un cambio: 1 = subió / avanzó, -1 = bajó / retrocedió, 0 = sin cambio o no comparable. */
export type Direccion = -1 | 0 | 1;

/**
 * Dirección del cambio entre dos valores. Si alguno falta (null/undefined) o no es
 * finito (NaN, ±Infinity) devuelve 0: sin un "antes" real no hay movimiento que
 * mostrar, y un 0 jamás anima (el valor aparece estático).
 *
 * Uso: `NumeroRodante` (la cifra entra desde abajo si subió, desde arriba si bajó) y
 * el paso del wizard (entra desde el lado hacia el que se avanza).
 */
export function direccionCambio(antes: number | null | undefined, ahora: number | null | undefined): Direccion {
    if (antes == null || ahora == null) return 0;
    if (!Number.isFinite(antes) || !Number.isFinite(ahora)) return 0;
    if (ahora > antes) return 1;
    if (ahora < antes) return -1;
    return 0;
}

/** Qué bordes de un scroll horizontal tienen contenido escondido detrás. */
export interface Bordes {
    /** Hay contenido a la izquierda (ya se scrolleó algo). */
    antes: boolean;
    /** Hay contenido a la derecha (todavía no se llega al final). */
    despues: boolean;
}

/**
 * Bordes con contenido oculto en un contenedor con scroll horizontal (diseno.md §9).
 * El `umbral` (px) absorbe el redondeo subpíxel de `scrollLeft` con zoom o DPR
 * fraccionario: sin él, al llegar al final el borde podría quedar prendido por 0,5 px.
 * Sin desborde (`scrollWidth <= clientWidth`) ambos quedan en false.
 *
 * Uso: `hooks/useBordesScroll` + `ui/BordeScroll` (franja de chips de asistencia).
 */
export function calcBordes(scrollLeft: number, scrollWidth: number, clientWidth: number, umbral = 4): Bordes {
    return {
        antes: scrollLeft > umbral,
        despues: scrollLeft + clientWidth < scrollWidth - umbral,
    };
}

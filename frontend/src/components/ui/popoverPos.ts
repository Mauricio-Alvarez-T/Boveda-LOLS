/**
 * Colocación de una lista flotante respecto de su disparador (2026-09-16).
 *
 * Vive aparte de `Filters.tsx` porque es la parte con casos borde de verdad —espacio justo abajo, espacio
 * justo arriba, ventana muy baja— y acá sí se puede testear: el jest del front solo corre `*.test.ts`
 * puros, sin JSX.
 *
 * Convención: se devuelve `top` cuando la lista cuelga hacia abajo y `bottom` cuando se voltea hacia
 * arriba, para que en los dos casos el borde pegado al disparador quede fijo aunque la lista crezca.
 */

/** Lo que se necesita de un `DOMRect`. */
export interface RectDisparador {
    top: number;
    bottom: number;
    left: number;
    width: number;
}

export interface PosicionPopover {
    left: number;
    width: number;
    maxHeight: number;
    top?: number;
    bottom?: number;
}

/** Alto máximo de la lista (buscador + opciones). */
export const ALTO_MAX = 320;
/** Por debajo de esto la lista no sirve: se muestra igual, con scroll. */
export const ALTO_MIN = 160;
/** Ancho mínimo para que las opciones largas no queden ilegibles en un campo angosto. */
export const ANCHO_MIN = 200;
/** Aire entre la lista y el borde de la ventana. */
const MARGEN = 12;
/** Separación entre el disparador y la lista. */
const SEPARACION = 4;

/**
 * Dónde dibujar la lista. Abre hacia abajo salvo que arriba haya más sitio, y recorta el alto al hueco
 * disponible para que la lista nunca se salga de la ventana (por eso `maxHeight`, no `height`).
 */
export function calcularPosicion(r: RectDisparador, alturaVentana: number, altoMax: number = ALTO_MAX): PosicionPopover {
    const libreAbajo = alturaVentana - r.bottom;
    const abajo = libreAbajo >= altoMax || libreAbajo >= r.top;
    const hueco = (abajo ? libreAbajo : r.top) - MARGEN;

    const base = {
        left: r.left,
        width: Math.max(r.width, ANCHO_MIN),
        maxHeight: Math.max(ALTO_MIN, Math.min(altoMax, hueco)),
    };

    return abajo
        ? { ...base, top: r.bottom + SEPARACION }
        : { ...base, bottom: alturaVentana - r.top + SEPARACION };
}

/**
 * ¿El disparador se fue de la pantalla? Es el único caso en que conviene cerrar la lista mientras el
 * usuario scrollea: si el campo sigue a la vista, la lista lo sigue.
 */
export function fueraDeVista(r: RectDisparador, alturaVentana: number): boolean {
    return r.bottom < 0 || r.top > alturaVentana;
}

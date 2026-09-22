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

// Solo el tipo: `import type` se borra al compilar, así que el jest de node nunca carga React.
import type { CSSProperties } from 'react';

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
/** Separación por defecto entre el disparador y la lista. */
export const SEPARACION = 4;

/**
 * Dónde dibujar la lista. Abre hacia abajo salvo que arriba haya más sitio, y recorta el alto al hueco
 * disponible para que la lista nunca se salga de la ventana (por eso `maxHeight`, no `height`).
 *
 * `separacion` es parámetro porque no todos los flotantes respiran igual: el desplegable de filtros deja
 * 4px, los menús del header de asistencia 8 y el tooltip de stock 6.
 */
export function calcularPosicion(
    r: RectDisparador,
    alturaVentana: number,
    altoMax: number = ALTO_MAX,
    separacion: number = SEPARACION,
): PosicionPopover {
    const libreAbajo = alturaVentana - r.bottom;
    const abajo = libreAbajo >= altoMax || libreAbajo >= r.top;
    const hueco = (abajo ? libreAbajo : r.top) - MARGEN;

    const base = {
        left: r.left,
        width: Math.max(r.width, ANCHO_MIN),
        maxHeight: Math.max(ALTO_MIN, Math.min(altoMax, hueco)),
    };

    return abajo
        ? { ...base, top: r.bottom + separacion }
        : { ...base, bottom: alturaVentana - r.top + separacion };
}

/**
 * ¿El disparador se fue de la pantalla? Es el único caso en que conviene cerrar la lista mientras el
 * usuario scrollea: si el campo sigue a la vista, la lista lo sigue.
 */
export function fueraDeVista(r: RectDisparador, alturaVentana: number): boolean {
    return r.bottom < 0 || r.top > alturaVentana;
}

/**
 * Qué trozo de la aritmética llega al `style`. No son tres cálculos distintos: es el MISMO, y cada
 * consumidor aplica solo lo que su layout no resuelve ya por CSS. Sin esto, los menús del header de
 * asistencia —que en mobile son `fixed left-3 right-3`, del ancho del viewport a propósito— recibirían
 * un `left`/`width` en línea que pisa esas clases y los descentra.
 *
 *  - `lista`   → hereda el ancho del disparador y se recorta al hueco (`FilterSelect`).
 *  - `hoja`    → el ancho lo pone el CSS: solo la vertical (menús móviles de asistencia).
 *  - `tooltip` → ancho natural (`min-w-*`) y sin alto impuesto: solo el ancla (`StockBadge`).
 */
export type VarianteFlotante = 'lista' | 'hoja' | 'tooltip';

export function estiloFlotante(p: PosicionPopover, variante: VarianteFlotante = 'lista'): CSSProperties {
    const vertical = p.top !== undefined ? { top: p.top } : { bottom: p.bottom };
    switch (variante) {
        case 'hoja':
            return { position: 'fixed', ...vertical };
        case 'tooltip':
            return { position: 'fixed', left: p.left, ...vertical };
        default:
            return { position: 'fixed', left: p.left, width: p.width, maxHeight: p.maxHeight, ...vertical };
    }
}

/**
 * ¿La posición recién medida es la misma que la anterior? Seguir al disparador obliga a remedir en cada
 * frame de scroll, y un `setState` por frame re-renderiza el menú entero; cuando el que scrollea es un
 * contenedor que NO mueve al disparador, la posición no cambia y conviene devolver la referencia previa
 * para que React corte ahí. Mismo truco que el `sameRect` de `useTutorialSpotlight`.
 */
export function mismaPosicion(a: PosicionPopover | null, b: PosicionPopover): boolean {
    return !!a && a.left === b.left && a.width === b.width && a.maxHeight === b.maxHeight
        && a.top === b.top && a.bottom === b.bottom;
}

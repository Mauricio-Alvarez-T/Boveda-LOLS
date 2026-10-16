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

/** Tramo horizontal (px) que ocupa una opción dentro de su fila: borde izquierdo y derecho. */
export interface Tramo {
    l: number;
    r: number;
}

/** Recorrido del indicador elástico de `ui/PestanasElasticas` entre dos opciones. */
export interface PlanElastico {
    /** Primer tiempo: el indicador se estira hasta cubrir la opción de origen y la de destino. */
    estirado: Tramo;
    /** 1 = viaja a la derecha, -1 = a la izquierda. */
    direccion: 1 | -1;
    /**
     * Segundo tiempo: el borde de adelante llega a su lugar y el de atrás se pasa `aplaste` px
     * hacia adelante (el indicador queda un poco más angosto) antes de soltarse en `hasta`.
     */
    aplastado: Tramo;
}

/**
 * Plan del indicador elástico (diseno.md §9.12). El aplaste nunca supera la mitad del ancho
 * de destino, así una opción angosta no queda con el indicador dado vuelta; un aplaste
 * negativo cuenta como 0. Si origen y destino comparten centro se toma la derecha.
 */
export function planElastico(desde: Tramo, hasta: Tramo, aplaste: number): PlanElastico {
    const direccion: 1 | -1 = (hasta.l + hasta.r) / 2 >= (desde.l + desde.r) / 2 ? 1 : -1;
    const a = Math.max(0, Math.min(aplaste, (hasta.r - hasta.l) / 2));
    return {
        estirado: { l: Math.min(desde.l, hasta.l), r: Math.max(desde.r, hasta.r) },
        direccion,
        aplastado: direccion === 1 ? { l: hasta.l + a, r: hasta.r } : { l: hasta.l, r: hasta.r - a },
    };
}

/**
 * Opción a la que lleva una tecla en una fila de pestañas (patrón WAI-ARIA "tabs"): las
 * flechas avanzan y retroceden dando la vuelta en los extremos; Inicio y Fin van a la
 * primera y a la última. Cualquier otra tecla, o una fila vacía, devuelve null.
 */
export function indicePorTecla(tecla: string, actual: number, total: number): number | null {
    if (total <= 0) return null;
    switch (tecla) {
        case 'ArrowRight': return (actual + 1) % total;
        case 'ArrowLeft': return (actual - 1 + total) % total;
        case 'Home': return 0;
        case 'End': return total - 1;
        default: return null;
    }
}

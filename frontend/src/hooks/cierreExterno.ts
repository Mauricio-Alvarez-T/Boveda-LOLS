/**
 * ¿El clic cayó dentro del menú? (2026-09-16)
 *
 * Vive aparte de `useCierreExterno.ts` porque es la parte que se rompe de verdad: un popover en PORTAL
 * no cuelga del ancla, así que un `ancla.contains(destino)` a secas lo declara «fuera» y el menú se
 * cierra al tocar sus propias opciones. Acá además se puede testear — el jest del front corre
 * `testEnvironment: 'node'`, sin DOM — y por eso el parámetro es estructural (`{ contains }`) en vez de
 * `HTMLElement`: en producción llegan nodos reales, en el test un doble de dos líneas.
 */

/** Cualquier cosa que sepa decir si contiene un nodo. En la app, un `HTMLElement`. */
export interface ZonaDentro {
    contains(nodo: unknown): boolean;
}

/**
 * ¿`destino` está dentro de alguna de las zonas? Las zonas nulas se ignoran: el popover todavía no está
 * montado en el primer render con el menú abierto.
 */
export function estaDentro(destino: unknown, zonas: readonly (ZonaDentro | null | undefined)[]): boolean {
    return zonas.some(z => !!z && z.contains(destino));
}

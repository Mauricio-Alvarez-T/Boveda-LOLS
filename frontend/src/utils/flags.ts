/**
 * Flags BOOLEAN del backend llegan como número 0/1 (mysql2 sin typeCast), no
 * como false/true. `flagOff` devuelve true SOLO cuando el flag está
 * explícitamente apagado (0 o false). undefined/null/1/true ⇒ NO off (se trata
 * como participando) — robusto si la columna falta en payloads reducidos.
 */
export const flagOff = (v: unknown): boolean => v === 0 || v === false;

/**
 * Flags BOOLEAN del backend. Desde Fase 1 (typeCast en db.js) llegan como
 * boolean real; antes llegaban como 0/1. Estos helpers son dual-aware (aceptan
 * ambas formas) para tolerar assets cacheados y mocks legacy.
 *
 * - `flagOff`: true SOLO si el flag está explícitamente apagado (0 o false).
 *   undefined/null/1/true ⇒ NO off — robusto si la columna falta en payloads
 *   reducidos.
 * - `flagOn`: true SOLO si el flag está explícitamente prendido (1 o true).
 *   Útil para tristate (ej. sabados.asistio ∈ {null, no, sí}).
 */
export const flagOff = (v: unknown): boolean => v === 0 || v === false;
export const flagOn = (v: unknown): boolean => v === 1 || v === true;

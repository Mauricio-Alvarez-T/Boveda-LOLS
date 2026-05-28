import type { Bodega } from '../types/entities';

/**
 * Formato unificado para mostrar una bodega en cualquier vista.
 *
 *   "Bodega Central (Juan Pérez)" — si tiene responsable_nombre con valor.
 *   "Bodega Central"               — si no.
 *
 * Usar en selectores, chips origen/destino de transferencias, LocationRow
 * de InventarioItemCard, etc. Centraliza el patrón para que cambiar el
 * formato a futuro sea una sola edición.
 */
export function formatBodegaConResponsable(
    b: Pick<Bodega, 'nombre' | 'responsable_nombre'>
): string {
    const r = b.responsable_nombre?.trim();
    return r ? `${b.nombre} (${r})` : b.nombre;
}

/**
 * Variante para cuando los campos vienen sueltos (no como objeto Bodega).
 * Útil en queries de transferencias donde traemos
 * `origen_bodega_nombre` + `origen_bodega_responsable_nombre` planos.
 */
export function formatBodegaNombreResponsable(
    nombre: string | null | undefined,
    responsableNombre: string | null | undefined
): string {
    if (!nombre) return '';
    const r = responsableNombre?.trim();
    return r ? `${nombre} (${r})` : nombre;
}

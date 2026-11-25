/**
 * Lee una cantidad escrita por la persona, con decimales: acepta coma o punto
 * («0,5», "0.5", " 1,25 "). Devuelve null si no es un número (vacío, «abc», «0,»
 * a medio escribir cuenta como 0).
 *
 * Existe porque `parseInt` botaba los decimales: «1/2 m³ de arena» escrito 0,5
 * llegaba como 0 y el servidor rechazaba la solicitud (Felipe Escobar, 18-nov).
 */
export function parseCantidad(texto: string): number | null {
    const limpio = texto.trim().replace(',', '.');
    if (limpio === '' || limpio === '.') return null;
    const n = Number(limpio.endsWith('.') ? limpio.slice(0, -1) : limpio);
    return Number.isFinite(n) ? n : null;
}

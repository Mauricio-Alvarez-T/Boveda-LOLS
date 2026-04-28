/**
 * Helpers centralizados para manejo de fechas en formato YYYY-MM-DD.
 *
 * Existencia: auditoría módulo Inventario Sprint 4 (Item 4.2). Antes había
 * 3+ definiciones duplicadas (sabadosWhatsApp.ts, FacturasTab.tsx,
 * TransferenciaDetail.tsx) cada una con su criterio. Centralizar acá garantiza
 * un único origen y evita bugs por timezone (toLocaleDateString aplica TZ del
 * navegador y puede mostrar el día anterior si la fecha viene en UTC).
 */

/**
 * Normaliza una fecha que puede venir como 'YYYY-MM-DD' o como ISO completo
 * 'YYYY-MM-DDTHH:mm:ss.000Z' (MySQL2 driver devuelve columnas DATE como
 * objetos Date que JSON.stringify convierte a ISO).
 *
 * Devuelve solo la parte YYYY-MM-DD sin tocar zona horaria.
 */
export function normalizarFecha(raw: string | null | undefined): string {
    if (!raw) return '';
    return String(raw).split('T')[0];
}

/**
 * Formato corto DD-MM-YYYY desde cualquier representación.
 * Ej.: '2026-04-28' → '28-04-2026'.
 */
export function fmtFechaCorta(raw: string | null | undefined): string {
    const norm = normalizarFecha(raw);
    const parts = norm.split('-');
    if (parts.length !== 3) return norm;
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
}

/**
 * Formato amigable "28 abr 2026" usando locale es-CL.
 *
 * IMPORTANTE: si raw es solo 'YYYY-MM-DD' (sin hora) construye un Date local
 * con `T00:00:00` para evitar el bug de UTC. Si raw ya trae hora la deja
 * pasar y deja que toLocaleDateString aplique la conversión.
 */
export function fmtFecha(raw: string | null | undefined): string {
    if (!raw) return '';
    const s = String(raw);
    const isoLocal = s.length === 10 && /^\d{4}-\d{2}-\d{2}$/.test(s)
        ? `${s}T00:00:00`
        : s;
    const d = new Date(isoLocal);
    if (isNaN(d.getTime())) return s;
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Día del mes (DD) desde la fecha. Útil para encabezados de tablas mensuales.
 */
export function diaDelMes(raw: string | null | undefined): string {
    const parts = normalizarFecha(raw).split('-');
    return parts.length === 3 ? parts[2] : '';
}

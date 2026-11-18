/**
 * Fecha del calendario CHILENO ('YYYY-MM-DD'), no la de UTC: `new Date().toISOString()` ya es «mañana» desde las
 * ~21:00 de Chile. Igual que `backend/src/utils/fechaChile.js` (el servidor decide con la misma hora).
 */
const FORMATO = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
});

export const fechaChile = (d: Date = new Date()): string => FORMATO.format(d);
export const hoyChile = (): string => fechaChile();

/**
 * Día cerrado (Marcos 2026-11-18): la asistencia se marca el mismo día; un día anterior solo con
 * `asistencia.dias_pasados` (RR.HH.). El servidor lo hace cumplir igual (middleware/diaCerrado.js).
 */
export const PERMISO_DIAS_PASADOS = 'asistencia.dias_pasados';
export const esDiaPasado = (fecha: string, hoy: string = hoyChile()): boolean => /^\d{4}-\d{2}-\d{2}/.test(fecha) && fecha.slice(0, 10) < hoy;

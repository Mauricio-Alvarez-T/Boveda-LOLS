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
 * Día cerrado (Marcos 2026-11-18). Quién marca un día que ya pasó (el servidor hace cumplir lo mismo,
 * middleware/diaCerrado.js):
 *   · `asistencia.dias_pasados` (RR.HH., mig 154): cualquier día;
 *   · `asistencia.dias_pasados_mes` (jefes de obra, mig 155, confirmado por Daphne): un día del mes en curso;
 *   · los demás: solo hoy.
 */
export const PERMISO_DIAS_PASADOS = 'asistencia.dias_pasados';
export const PERMISO_DIAS_DEL_MES = 'asistencia.dias_pasados_mes';

const esFecha = (f: string) => /^\d{4}-\d{2}-\d{2}/.test(f);
export const esDiaPasado = (fecha: string, hoy: string = hoyChile()): boolean => esFecha(fecha) && fecha.slice(0, 10) < hoy;

/** ¿Ese día ya no lo puede marcar quien tiene estos permisos? `motivo`: 'dia' (solo hoy) o 'mes' (mes anterior). */
export function diaCerradoPara(
    fecha: string, puede: (clave: string) => boolean, hoy: string = hoyChile(),
): { cerrado: boolean; motivo: 'dia' | 'mes' | null } {
    if (!esDiaPasado(fecha, hoy) || puede(PERMISO_DIAS_PASADOS)) return { cerrado: false, motivo: null };
    if (puede(PERMISO_DIAS_DEL_MES)) {
        return fecha.slice(0, 7) < hoy.slice(0, 7) ? { cerrado: true, motivo: 'mes' } : { cerrado: false, motivo: null };
    }
    return { cerrado: true, motivo: 'dia' };
}

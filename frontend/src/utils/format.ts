/**
 * Superficie única de formato (Design System, Fase 2).
 *
 * Un solo lugar para importar formateadores de dinero, números y fechas.
 * Reemplaza las ~10 definiciones locales de `fmtMoney` y ~6 de `fmtDate`
 * repartidas por el código (baseline F2). NO mueve currency.ts ni fechas.ts:
 * los re-exporta para mantener compatibilidad con los imports existentes.
 *
 * Uso nuevo:  import { fmtMoney, fmtNumber, fmtFecha } from '../utils/format';
 */

export { formatCLP, parseCLP } from './currency';
export {
    normalizarFecha,
    fmtFecha,
    fmtFechaCorta,
    diaDelMes,
    formatDuracion,
} from './fechas';

import { formatCLP } from './currency';

/**
 * Dinero CLP: "$14.000" (sin decimales, redondeado, punto de miles es-CL).
 * Alias semántico de `formatCLP` — para que la migración por-página sea un
 * simple cambio de import (borrar el `const fmtMoney = ...` local → importar).
 * `formatCLP` redondea y descarta NaN/null/'' (los duplicados locales no lo
 * hacían), así que migrar a esto es un upgrade de robustez.
 */
export const fmtMoney = formatCLP;

/**
 * Miles es-CL SIN símbolo. 14000 → "14.000". null/''/NaN → "".
 * Para cantidades, kilometraje, etc. (no dinero).
 * @param opts.decimals fija decimales fijos (min=max). Default: enteros.
 */
export function fmtNumber(
    value: number | string | null | undefined,
    opts?: { decimals?: number },
): string {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '';
    const d = opts?.decimals;
    return n.toLocaleString('es-CL', d != null
        ? { minimumFractionDigits: d, maximumFractionDigits: d }
        : undefined);
}

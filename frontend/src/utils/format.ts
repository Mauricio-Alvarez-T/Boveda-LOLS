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
 * Dinero CLP preservando decimales cuando existen: "$1.234,56" / "$14.000".
 * Para precios unitarios y montos de factura, donde redondear alteraría el dato
 * mostrado respecto del documento. Si no hay decimales se ve igual que fmtMoney.
 */
export function fmtMoneyExacto(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') return '';
    const n = typeof value === 'string' ? Number(value) : value;
    if (!Number.isFinite(n)) return '';
    return `$${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })}`;
}

/**
 * Dinero CLP abreviado EN FORMATO CHILENO: "$40,7M" / "$14.901M".
 *
 * ⚠️ Úsalo SOLO donde el ancho es físicamente insuficiente (ticks de eje en
 * gráficos). Todo monto normal va completo con `fmtMoney` — el punto en Chile
 * es separador de MILES, así que un decimal con punto ("$14901.5M") se lee mal.
 *
 * Reglas: agrupación es-CL; 1 decimal bajo 100 millones, entero sobre eso (para
 * no producir "$14.901,5M"); bajo 1 millón devuelve el monto completo (evita el
 * viejo bug "$1000K" que nunca rotaba a millones); negativos con signo delante.
 */
export function fmtMoneyCompacto(value: number | string | null | undefined): string {
    const raw = typeof value === 'string' ? Number(value) : value;
    const n = Number.isFinite(raw as number) ? (raw as number) : 0;
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';
    if (abs >= 1_000_000) {
        const millones = abs / 1_000_000;
        const decimals = millones < 100 ? 1 : 0;
        return `${sign}$${millones.toLocaleString('es-CL', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        })}M`;
    }
    return `${sign}$${Math.round(abs).toLocaleString('es-CL')}`;
}

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

/**
 * Rangos de fecha de los atajos de la grilla de Trabajadores (2026-09-15). Puro y testeable: el
 * componente vive en FiltrosRapidos.tsx y Jest solo compila archivos .ts sin JSX.
 *
 * Todo se calcula en hora LOCAL a propósito. Con `toISOString()` —el error que ya estaba en el
 * filtro de "ausentes hoy"— un 30 de septiembre a las 23:30 en Chile ya es 1 de octubre en UTC, y
 * "ingresos de este mes" saltaría al mes siguiente.
 */

const ymd = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Primer y último día del mes en curso, más el mes en formato YYYY-MM (para aniversario10m). */
export function mesEnCurso(hoy: Date = new Date()): { desde: string; hasta: string; mes: string } {
    const y = hoy.getFullYear();
    const m = hoy.getMonth();
    return {
        desde: ymd(new Date(y, m, 1)),
        hasta: ymd(new Date(y, m + 1, 0)),   // día 0 del mes siguiente = último del actual
        mes: `${y}-${String(m + 1).padStart(2, '0')}`,
    };
}

/** Los últimos `dias` días hasta hoy, ambos extremos incluidos. */
export function ultimosDias(dias: number, hoy: Date = new Date()): { desde: string; hasta: string } {
    const desde = new Date(hoy);
    desde.setDate(desde.getDate() - dias);
    return { desde: ymd(desde), hasta: ymd(hoy) };
}

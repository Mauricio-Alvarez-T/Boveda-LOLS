import type { CostoCategoria, CostoTipoDocumento, CostoEstadoPago } from '../../types/entities';

/**
 * Textos y reglas chicas de Costos de obra (mig 122, docs/reglas/costos.md). Las
 * cuentas viven en el backend (costos.service.js); acá solo se presentan. Montos y
 * fechas con `utils/format` (fmtMoney, fmtNumber, fmtFecha), como el resto de Bóveda.
 */

export const ETIQUETA_COSTOS = 'Presupuestos';

export const CATEGORIAS: Record<CostoCategoria, string> = {
    materiales: 'Materiales',
    mano_obra: 'Mano de obra',
    maquinaria: 'Maquinaria y equipos',
    subcontrato: 'Subcontrato',
    combustible: 'Combustible',
    gastos_generales: 'Gastos generales',
    otro: 'Otro',
};

export const TIPOS_DOC: Record<CostoTipoDocumento, string> = {
    factura: 'Factura',
    boleta: 'Boleta',
    guia: 'Guía de despacho',
    otro: 'Otro',
};

export const ESTADOS_PAGO: Record<CostoEstadoPago, string> = {
    por_pagar: 'Por pagar',
    pagada: 'Pagada',
};

export const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';
export const ETIQUETA = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2';

/** Porcentaje en formato chileno: 15 → "15 %", 2.5 → "2,5 %". */
export const pct = (v: number | string | null | undefined): string => {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} %` : '—';
};

/** Fecha local de hoy, AAAA-MM-DD (para los <input type="date">). */
export const hoyISO = (): string => {
    const d = new Date();
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Neto de un gasto para comparar con el presupuesto (mismo criterio que el backend). */
export function netoGasto(g: { monto_neto: number | string | null; monto_total: number | string; tipo_documento: CostoTipoDocumento }): { neto: number; estimado: boolean } {
    if (g.monto_neto !== null && g.monto_neto !== undefined && g.monto_neto !== '') return { neto: Number(g.monto_neto), estimado: false };
    const total = Number(g.monto_total) || 0;
    if (g.tipo_documento === 'factura') return { neto: Math.round(total / 1.19), estimado: true };
    return { neto: total, estimado: false };
}

/** Un gasto queda "por completar" si le falta el proveedor o a qué se imputa. */
export const porCompletar = (g: { proveedor: string | null; partida_id: number | null; categoria: CostoCategoria | null }) =>
    !g.proveedor || (!g.partida_id && !g.categoria);

export type Semaforo = 'ok' | 'cerca' | 'pasado' | 'sin';

/** Gastado contra presupuestado: bajo 85 % ok, 85–100 % cerca, sobre 100 % pasado. */
export function semaforo(presupuestado: number, gastado: number): Semaforo {
    if (!presupuestado) return gastado > 0 ? 'pasado' : 'sin';
    const r = gastado / presupuestado;
    if (r > 1) return 'pasado';
    if (r >= 0.85) return 'cerca';
    return 'ok';
}

/** Color de la barra según el semáforo (tokens: el color ES el dato). */
export const COLOR_BARRA: Record<Semaforo, string> = {
    ok: 'bg-brand-primary',
    cerca: 'bg-warning',
    pasado: 'bg-destructive',
    sin: 'bg-muted-foreground/30',
};

/** Mensaje de error de la API o uno por defecto. */
export const mensajeError = (e: unknown, porDefecto: string): string => {
    const r = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
    return r?.error || r?.message || porDefecto;
};

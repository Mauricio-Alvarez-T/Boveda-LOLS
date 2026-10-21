/**
 * Lógica PURA (sin React) de la CAUSA al resolver una diferencia de transferencia
 * (dueño 2026-10-21, mig 128). La consumen DiscrepanciaDetail.tsx y useTransferencias.ts;
 * vive aparte para testearla sin arrastrar framer-motion (molde: faltanteReason.ts).
 *
 * El signo sale SIEMPRE de cantidad_recibida vs cantidad_enviada. La columna
 * `diferencia` de la BD es generada como enviada − recibida (signo opuesto al del
 * contrato de la API): usarla para elegir causas ofrecería las del signo contrario.
 *
 * Las cantidades reales del ajuste las calcula el servidor (lo descontado de más, lo
 * que alcanzó a descontarse del origen, las unidades sin respaldo): los textos de acá
 * explican el efecto y la confirmación muestra lo que devolvió la API.
 */
import type {
    AjusteStockDiscrepancia,
    AjusteStockResultado,
    CausaDiscrepancia,
} from '../../types/entities';
import { fmtNumber } from '../../utils/format';

export type SignoDiscrepancia = 'sobrante' | 'faltante';

export const CAUSAS_SOBRANTE: readonly CausaDiscrepancia[] = ['origen_envio_de_mas', 'error_conteo_recepcion'];
export const CAUSAS_FALTANTE: readonly CausaDiscrepancia[] = ['perdida_en_transito', 'nunca_salio', 'llego_despues'];

/** Rótulo de cada causa (lo que lee quien resuelve y lo que queda en la tarjeta cerrada). */
export const CAUSA_LABEL: Record<CausaDiscrepancia, string> = {
    origen_envio_de_mas: 'El origen mandó de más',
    error_conteo_recepcion: 'Se contó mal al recibir',
    perdida_en_transito: 'Se perdió o dañó en el camino',
    nunca_salio: 'Nunca salió del origen',
    llego_despues: 'Llegó después',
};

/** Causas que mueven stock: en una solicitud del régimen anterior el backend responde 409. */
const CAUSAS_MUEVEN_STOCK: ReadonlySet<CausaDiscrepancia> = new Set<CausaDiscrepancia>([
    'error_conteo_recepcion', 'perdida_en_transito', 'llego_despues',
]);

/** Texto (mismo que el 409 del backend) para las causas bloqueadas en régimen anterior. */
export const AVISO_REGIMEN_ANTERIOR = 'Solicitud anterior al cambio de stock: ajusta a mano';

/** Estados HTTP que se muestran DENTRO del modal (queda abierto para elegir otra causa), sin toast. */
export const ESTADOS_ERROR_EN_MODAL: readonly number[] = [400, 409];

/** Redondeo a 3 decimales: las cantidades son DECIMAL (kg, m³) y 1.1 − 0.3 no da 0.8 exacto. */
export function redondear(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** Cantidad legible (es-CL, decimales solo si los hay): 1234 → «1.234», 2.5 → «2,5». */
export function fmtCantidad(n: number): string {
    return fmtNumber(redondear(n));
}

/**
 * Sobrante o faltante y cuántas unidades (N = |recibida − enviada|).
 * null si no hay diferencia (no debería listarse, pero no se ofrece ninguna causa).
 */
export function signoDiscrepancia(
    cantidadEnviada: number | string | null | undefined,
    cantidadRecibida: number | string | null | undefined,
): { signo: SignoDiscrepancia; n: number } | null {
    const enviada = Number(cantidadEnviada) || 0;
    const recibida = Number(cantidadRecibida) || 0;
    const d = redondear(recibida - enviada);
    if (d === 0) return null;
    return { signo: d > 0 ? 'sobrante' : 'faltante', n: Math.abs(d) };
}

/** Solo las causas que calzan con el signo (2 de sobrante o 3 de faltante). */
export function causasPara(signo: SignoDiscrepancia): readonly CausaDiscrepancia[] {
    return signo === 'sobrante' ? CAUSAS_SOBRANTE : CAUSAS_FALTANTE;
}

/** ¿La causa calza con el signo? (defensa: el backend igual responde 400 si no). */
export function causaCalzaConSigno(causa: CausaDiscrepancia, signo: SignoDiscrepancia): boolean {
    return causasPara(signo).includes(causa);
}

export function causaMueveStock(causa: CausaDiscrepancia): boolean {
    return CAUSAS_MUEVEN_STOCK.has(causa);
}

/**
 * ¿Solicitud del régimen anterior (stock_reconciliado = FALSE)? mysql2 devuelve TINYINT
 * como 0/1. Ausente (backend viejo o tutorial) → NO es anterior: el backend decide con su 409.
 */
export function esRegimenAnterior(stockReconciliado: unknown): boolean {
    return stockReconciliado === false || stockReconciliado === 0 || stockReconciliado === '0';
}

/** Causa no elegible: mueve stock y la solicitud es del régimen anterior. */
export function causaBloqueada(causa: CausaDiscrepancia, regimenAnterior: boolean): boolean {
    return regimenAnterior && causaMueveStock(causa);
}

export interface ContextoEfecto {
    /** Unidades de diferencia (|recibida − enviada|). */
    n: number;
    /** Lo que llegó (para «se queda con las R que llegaron»). */
    recibida: number;
    unidad?: string | null;
    /** Nombre real del origen (obra o bodega con responsable). */
    origen: string;
    /** Nombre real del destino. */
    destino: string;
}

function cant(n: number, unidad?: string | null): string {
    const u = unidad?.trim();
    return u ? `${fmtCantidad(n)} ${u}` : fmtCantidad(n);
}

/**
 * Una línea con el efecto CONCRETO en el stock de elegir esta causa, con los nombres
 * reales y la cantidad. Ej.: «Bascuñan 661 −80 un · Conferencia 622 vuelve a tener las
 * que se le descontaron de más» / «Se descuentan 2 un de Conferencia 622 como pérdida».
 */
export function efectoCausa(causa: CausaDiscrepancia, ctx: ContextoEfecto): string {
    const N = cant(ctx.n, ctx.unidad);
    switch (causa) {
        case 'origen_envio_de_mas':
            return `No se mueve stock: ${ctx.destino} se queda con las ${cant(ctx.recibida, ctx.unidad)} que llegaron`;
        case 'error_conteo_recepcion':
            // El backend devuelve al origen solo lo que se le descontó de más al recibir (si su stock no alcanzaba
            // y quedó en 0, no hay nada que devolver): el texto no promete más que eso.
            return `${ctx.destino} −${N} · si al recibir se le descontaron de más a ${ctx.origen}, se le devuelven`;
        case 'perdida_en_transito':
            return `Se descuentan ${N} de ${ctx.origen} como pérdida · ${ctx.destino} no cambia`;
        case 'nunca_salio':
            return `No se mueve stock: las ${N} siguen en ${ctx.origen}`;
        case 'llego_despues':
            return `${ctx.origen} −${N} · ${ctx.destino} +${N}`;
    }
}

function esCausa(v: unknown): v is CausaDiscrepancia {
    return typeof v === 'string' && Object.prototype.hasOwnProperty.call(CAUSA_LABEL, v);
}

/** Causa conocida o null (tolera valores viejos/desconocidos que vengan de la BD). */
export function leerCausa(v: unknown): CausaDiscrepancia | null {
    return esCausa(v) ? v : null;
}

function idONull(v: unknown): number | null {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? null : n;
}

/** Normaliza una lista de ajustes de la API (descarta los de cantidad 0 o no numérica). */
export function normalizarAjustes(raw: unknown): AjusteStockDiscrepancia[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((a): AjusteStockDiscrepancia | null => {
            if (!a || typeof a !== 'object') return null;
            const r = a as Record<string, unknown>;
            const cantidad = redondear(Number(r.cantidad));
            if (!Number.isFinite(cantidad) || cantidad === 0) return null;
            const nombre = typeof r.ubicacion_nombre === 'string' && r.ubicacion_nombre.trim()
                ? r.ubicacion_nombre.trim()
                : '—';
            return { obra_id: idONull(r.obra_id), bodega_id: idONull(r.bodega_id), ubicacion_nombre: nombre, cantidad };
        })
        .filter((a): a is AjusteStockDiscrepancia => a !== null);
}

function leerAviso(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Lee `ajuste_stock` (TEXT con JSON en BD): objeto, string JSON o nada.
 * null si no hay nada que mostrar o el JSON está roto (nunca lanza).
 */
export function parseAjusteStock(raw: unknown): AjusteStockResultado | null {
    let v: unknown = raw;
    if (typeof v === 'string') {
        if (!v.trim()) return null;
        try { v = JSON.parse(v); } catch { return null; }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    return { ajustes: normalizarAjustes(r.ajustes), aviso: leerAviso(r.aviso) };
}

/** «Bascuñan 661 −80 un» / «Conferencia 622 +5 un»: signo tipográfico (−, no guion). */
export function fmtAjuste(a: AjusteStockDiscrepancia, unidad?: string | null): string {
    const signo = a.cantidad > 0 ? '+' : '−';
    return `${a.ubicacion_nombre} ${signo}${cant(Math.abs(a.cantidad), unidad)}`;
}

/** Resumen en una línea para el toast: «Bascuñan 661 −80 un · Conferencia 622 +5 un». */
export function resumenAjustes(ajustes: AjusteStockDiscrepancia[], unidad?: string | null): string {
    return ajustes.map(a => fmtAjuste(a, unidad)).join(' · ');
}

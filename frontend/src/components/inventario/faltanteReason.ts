/**
 * Tipos + lógica PURA del faltante de aprobación (sin React) para que sean
 * testeables sin arrastrar el componente/modal (framer-motion ESM en ts-jest).
 * Lo consume FaltanteDecisionModal.tsx (que re-exporta FaltanteItemRow).
 */

export interface FaltanteItemRow {
    item_descripcion: string;
    unidad?: string;
    /** Lo que pidió el solicitante. */
    cantidad_solicitada: number;
    /** Lo que el aprobador alcanzó a asignar (suma de splits). */
    cantidad_enviada: number;
    /** Diferencia pedido − enviado (> 0). */
    cantidad_faltante: number;
    /** Stock total disponible del ítem (suma de todas las ubicaciones). */
    stock_disponible: number;
}

export type FaltanteReasonKind = 'sin_stock' | 'parcial' | 'manual';

/**
 * Por qué este ítem quedó corto (función PURA):
 *  - sin_stock: no hay nada en bodega/obras.
 *  - parcial:   hay algo pero menos que lo pedido (techo de stock).
 *  - manual:    hay stock suficiente, pero el aprobador decidió enviar menos.
 */
export function faltanteReason(
    row: Pick<FaltanteItemRow, 'cantidad_solicitada' | 'stock_disponible'>
): { kind: FaltanteReasonKind; label: string } {
    if (row.stock_disponible <= 0) return { kind: 'sin_stock', label: 'Sin stock' };
    if (row.stock_disponible < row.cantidad_solicitada) {
        return { kind: 'parcial', label: `Solo ${row.stock_disponible} disponible` };
    }
    return { kind: 'manual', label: 'Ajuste manual' };
}

export type FaltanteDecision = 'crear_nueva' | 'ninguna';

/**
 * ¿El faltante fue 100% decisión del aprobador? (todos los ítems son "Ajuste
 * manual": había stock para lo pedido y aun así envió menos). Función PURA.
 */
export function faltanteEsSoloManual(
    rows: Pick<FaltanteItemRow, 'cantidad_solicitada' | 'stock_disponible'>[]
): boolean {
    return rows.length > 0 && rows.every(r => faltanteReason(r).kind === 'manual');
}

/**
 * Opción preseleccionada del modal de faltante (función PURA):
 *  - Todo "Ajuste manual" → 'ninguna': el aprobador recortó a propósito; crear
 *    una solicitud por lo que acaba de descartar sería contradictorio.
 *  - Algún ítem corto por stock (sin_stock / parcial) → 'crear_nueva': queda
 *    pendiente para cuando llegue stock.
 */
export function defaultFaltanteDecision(
    rows: Pick<FaltanteItemRow, 'cantidad_solicitada' | 'stock_disponible'>[]
): FaltanteDecision {
    return faltanteEsSoloManual(rows) ? 'ninguna' : 'crear_nueva';
}

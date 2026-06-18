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

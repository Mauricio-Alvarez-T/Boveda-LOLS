import type { FacturaInventario } from '../../../types/entities';

/** Línea de factura tal como la devuelve GET /facturas-inventario/:id (DECIMAL puede llegar como string). */
export interface FacturaItemDetalle {
    id: number;
    item_id: number | null;
    cantidad: number | string;
    precio_unitario: number | string;
    item_descripcion?: string | null;
    unidad?: string | null;
    /** Texto de la línea tal cual en la factura (mig 157). */
    descripcion_factura?: string | null;
    /** Medidas opcionales de la línea, ej. «15 x 60» (mig 158). */
    medidas?: string | null;
    /** Destino: solo facturas anteriores a la mig 157 (las que movían stock). */
    obra_nombre?: string | null;
    bodega_nombre?: string | null;
    bodega_es_virtual?: number | boolean;
}

export type FacturaDetalle = Omit<FacturaInventario, 'items'> & { items: FacturaItemDetalle[] };

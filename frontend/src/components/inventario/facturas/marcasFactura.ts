/**
 * Marcas de color de las facturas y filtros de la lista (mig 158). Puro, sin DOM.
 *
 * Marca COMPARTIDA por factura (la ve todo el equipo), paleta FIJA de 5 colores. Cada color puede
 * tener un nombre que le pone quien gestiona facturas («naranjo = Maquinaria nueva»).
 * Las clases son literales completas: Tailwind v4 solo genera las que ve escritas.
 */

export type ColorFactura = 'naranjo' | 'azul' | 'verde' | 'amarillo' | 'morado';

export interface ColorPaleta {
    color: ColorFactura;
    /** Nombre por defecto si el equipo no le puso uno. */
    etiqueta: string;
    /** Punto de color (filtros, fila, leyenda). */
    punto: string;
    /** Borde izquierdo de la fila marcada. */
    borde: string;
    /** Relleno suave de la fila en el Excel (ARGB). */
    excel: string;
}

export const PALETA: ColorPaleta[] = [
    { color: 'naranjo', etiqueta: 'Naranjo', punto: 'bg-orange-400', borde: 'border-l-orange-400', excel: 'FFF8CBAD' },
    { color: 'azul', etiqueta: 'Azul', punto: 'bg-blue-400', borde: 'border-l-blue-400', excel: 'FFB4C7E7' },
    { color: 'verde', etiqueta: 'Verde', punto: 'bg-green-400', borde: 'border-l-green-400', excel: 'FFC6E0B4' },
    { color: 'amarillo', etiqueta: 'Amarillo', punto: 'bg-yellow-300', borde: 'border-l-yellow-300', excel: 'FFFFE699' },
    { color: 'morado', etiqueta: 'Morado', punto: 'bg-purple-400', borde: 'border-l-purple-400', excel: 'FFD9C3E9' },
];

export const colorDe = (c?: string | null): ColorPaleta | undefined => PALETA.find(p => p.color === c);

/** Nombre a mostrar: el que le puso el equipo o el del color. */
export function nombreColor(c: ColorFactura, nombres: Partial<Record<ColorFactura, string | null>>): string {
    const n = (nombres[c] || '').trim();
    return n || (colorDe(c)?.etiqueta ?? c);
}

/** Filtros de la lista / del export. `color`: '' = todas, 'marcadas' = con cualquier marca, o un color. */
export interface FiltrosFacturas {
    desde: string;
    hasta: string;
    q: string;
    color: '' | 'marcadas' | ColorFactura;
}

export const FILTROS_VACIOS: FiltrosFacturas = { desde: '', hasta: '', q: '', color: '' };

export const hayFiltros = (f: FiltrosFacturas) => !!(f.desde || f.hasta || f.q.trim() || f.color);

/** Query string de la API (GET /facturas-inventario y /export-lineas). Solo lo que tiene valor. */
export function paramsFiltros(f: FiltrosFacturas): Record<string, string> {
    const p: Record<string, string> = {};
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.desde)) p.fecha_desde = f.desde;
    if (/^\d{4}-\d{2}-\d{2}$/.test(f.hasta)) p.fecha_hasta = f.hasta;
    if (f.q.trim()) p.q = f.q.trim();
    if (f.color) p.color = f.color;
    return p;
}

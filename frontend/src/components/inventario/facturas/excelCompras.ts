/**
 * Excel «COMPRAS» de facturas de inventario (mig 158), con el formato de la planilla manual del equipo:
 * una fila por línea de factura, agrupada por CATEGORÍA del ítem con subtotal, y total general.
 * Columnas: ITEM, DESCRIPCIÓN, MEDIDAS, UNID, CANTIDAD, $ UNID, $ TOTAL, FACTURA, FECHA, PROVEEDOR
 * (sin M2, $M2 ni YUAN: decisión del dueño 2026-11-25). Las filas de facturas marcadas llevan el color
 * suave de su marca y al pie va la leyenda con el nombre de cada color.
 * `construirLibroCompras` es puro (testeable en node); `descargarExcelCompras` solo guarda el archivo.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { PALETA, colorDe, nombreColor, type ColorFactura, type FiltrosFacturas } from './marcasFactura';

/** Fila de GET /facturas-inventario/export-lineas. */
export interface LineaCompra {
    factura_id: number;
    numero_factura: string | null;
    proveedor: string | null;
    fecha_factura: string | null;
    color_marca: ColorFactura | null;
    cantidad: number;
    precio_unitario: number;
    total: number;
    descripcion_factura: string | null;
    medidas: string | null;
    nro_item: number | null;
    item_descripcion: string | null;
    unidad: string | null;
    categoria: string;
}

export interface GrupoCompras { categoria: string; lineas: LineaCompra[]; subtotal: number }

/** Agrupa por categoría conservando el orden que trae el backend (categoría → fecha → número). */
export function agruparPorCategoria(lineas: LineaCompra[]): { grupos: GrupoCompras[]; total: number } {
    const grupos: GrupoCompras[] = [];
    for (const l of lineas) {
        let g = grupos.find(x => x.categoria === l.categoria);
        if (!g) { g = { categoria: l.categoria, lineas: [], subtotal: 0 }; grupos.push(g); }
        g.lineas.push(l);
        g.subtotal += Number(l.total) || 0;
    }
    return { grupos, total: grupos.reduce((s, g) => s + g.subtotal, 0) };
}

const ddmmaa = (ymd: string) => { const [y, m, d] = ymd.split('-'); return `${d}-${m}-${y}`; };

/** «COMPRAS 2025», «COMPRAS 01-03-2025 al 31-08-2025», «COMPRAS desde 01-03-2025» o «COMPRAS» a secas. */
export function tituloCompras(f: Pick<FiltrosFacturas, 'desde' | 'hasta'>): string {
    const { desde, hasta } = f;
    if (desde && hasta) {
        if (desde.slice(5) === '01-01' && hasta.slice(5) === '12-31' && desde.slice(0, 4) === hasta.slice(0, 4)) return `COMPRAS ${desde.slice(0, 4)}`;
        return `COMPRAS ${ddmmaa(desde)} al ${ddmmaa(hasta)}`;
    }
    if (desde) return `COMPRAS desde ${ddmmaa(desde)}`;
    if (hasta) return `COMPRAS hasta ${ddmmaa(hasta)}`;
    return 'COMPRAS';
}

const COLUMNAS: { titulo: string; ancho: number }[] = [
    { titulo: 'ITEM', ancho: 7 },
    { titulo: 'DESCRIPCIÓN', ancho: 48 },
    { titulo: 'MEDIDAS', ancho: 14 },
    { titulo: 'UNID', ancho: 7 },
    { titulo: 'CANTIDAD', ancho: 11 },
    { titulo: '$ UNID', ancho: 14 },
    { titulo: '$ TOTAL', ancho: 15 },
    { titulo: 'FACTURA', ancho: 12 },
    { titulo: 'FECHA', ancho: 11 },
    { titulo: 'PROVEEDOR', ancho: 28 },
];
const PESOS = '"$"#,##0';
const GRIS_HEADER = 'FFBFBFBF';
const GRIS_SUBTOTAL = 'FFD9D9D9';
const solido = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

/**
 * Arma el libro. `nombres` = nombre de cada color (para la leyenda); `filtrosTexto` = línea bajo el título.
 */
export function construirLibroCompras(
    lineas: LineaCompra[],
    opts: { titulo: string; filtrosTexto?: string; nombres?: Partial<Record<ColorFactura, string | null>> }
): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bóveda LOLS';
    const ws = wb.addWorksheet('Compras', { views: [{ state: 'frozen', ySplit: 4 }] });
    ws.columns = COLUMNAS.map(c => ({ width: c.ancho }));

    ws.getCell('B1').value = opts.titulo;
    ws.getCell('B1').font = { bold: true, size: 16 };
    if (opts.filtrosTexto) {
        ws.getCell('B2').value = opts.filtrosTexto;
        ws.getCell('B2').font = { italic: true, size: 9, color: { argb: 'FF666666' } };
    }

    const header = ws.getRow(4);
    COLUMNAS.forEach((c, i) => {
        const cell = header.getCell(i + 1);
        cell.value = c.titulo;
        cell.font = { bold: true };
        cell.fill = solido(GRIS_HEADER);
        cell.alignment = { horizontal: i === 1 ? 'left' : 'center', vertical: 'middle' };
    });

    const { grupos, total } = agruparPorCategoria(lineas);
    let r = 5;
    let correlativo = 0;
    for (const g of grupos) {
        r += 1; // fila en blanco entre grupos, como en la planilla
        const titulo = ws.getRow(r);
        titulo.getCell(2).value = g.categoria;
        titulo.getCell(2).font = { bold: true, size: 11 };
        r += 1;
        for (const l of g.lineas) {
            correlativo += 1;
            const fila = ws.getRow(r);
            const descripcion = l.item_descripcion || l.descripcion_factura || '';
            fila.values = [
                correlativo,
                descripcion.toUpperCase(),
                l.medidas || '',
                l.unidad || 'U',
                Number(l.cantidad) || 0,
                Number(l.precio_unitario) || 0,
                Number(l.total) || 0,
                l.numero_factura || '',
                l.fecha_factura ? ddmmaa(l.fecha_factura) : '',
                l.proveedor || '',
            ];
            fila.getCell(6).numFmt = PESOS;
            fila.getCell(7).numFmt = PESOS;
            const marca = colorDe(l.color_marca);
            if (marca) for (let c = 1; c <= COLUMNAS.length; c++) fila.getCell(c).fill = solido(marca.excel);
            r += 1;
        }
        const sub = ws.getRow(r);
        sub.getCell(6).value = `SUBTOTAL ${g.categoria}`;
        sub.getCell(7).value = g.subtotal;
        sub.getCell(7).numFmt = PESOS;
        for (const c of [6, 7]) { sub.getCell(c).font = { bold: true }; sub.getCell(c).fill = solido(GRIS_SUBTOTAL); }
        sub.getCell(6).alignment = { horizontal: 'right' };
        r += 1;
    }

    r += 1;
    const tot = ws.getRow(r);
    tot.getCell(6).value = 'TOTAL GENERAL';
    tot.getCell(7).value = total;
    tot.getCell(7).numFmt = PESOS;
    for (const c of [6, 7]) { tot.getCell(c).font = { bold: true, size: 12 }; tot.getCell(c).fill = solido(GRIS_HEADER); }
    tot.getCell(6).alignment = { horizontal: 'right' };

    // Leyenda: solo los colores que aparecen.
    const usados = PALETA.filter(p => lineas.some(l => l.color_marca === p.color));
    if (usados.length) {
        r += 2;
        ws.getRow(r).getCell(2).value = 'Marcas';
        ws.getRow(r).getCell(2).font = { bold: true };
        for (const p of usados) {
            r += 1;
            const fila = ws.getRow(r);
            fila.getCell(1).fill = solido(p.excel);
            fila.getCell(2).value = nombreColor(p.color, opts.nombres || {});
        }
    }
    return wb;
}

/** Arma y descarga el .xlsx. */
export async function descargarExcelCompras(
    lineas: LineaCompra[],
    opts: { titulo: string; filtrosTexto?: string; nombres?: Partial<Record<ColorFactura, string | null>> }
): Promise<void> {
    const wb = construirLibroCompras(lineas, opts);
    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `${opts.titulo.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'COMPRAS'}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

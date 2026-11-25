/**
 * Excel «COMPRAS» de facturas de inventario (mig 158), con el formato de la planilla manual del equipo:
 * una fila por línea de factura, agrupada por CATEGORÍA del ítem con subtotal, y total general.
 * Columnas: ITEM, DESCRIPCIÓN, MEDIDAS, UNID, CANTIDAD, $ UNID, $ TOTAL, FACTURA, FECHA, PROVEEDOR
 * (sin M2, $M2 ni YUAN: decisión del dueño 2026-11-25). Las filas de facturas marcadas llevan el color
 * suave de su marca y al pie va la leyenda con el nombre de cada color. Apartados con colores de la Bóveda
 * (cabecera pizarra, banda verde por categoría, subtotal verde suave, total pizarra) + hoja «Resumen».
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
const NCOL = COLUMNAS.length;

// Colores de la Bóveda (no chocan con los rellenos suaves de las marcas).
const PIZARRA = 'FF1E293B';      // cabecera de columnas, total general
const VERDE_LOLS = 'FF029E4D';   // banda de categoría, línea bajo el título
const VERDE_SUAVE = 'FFE6F4EC';  // fila de subtotal
const BORDE = 'FFE2E8F0';        // separador fino entre líneas
const GRIS_TEXTO = 'FF64748B';
const BLANCO = 'FFFFFFFF';

const solido = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Segoe UI', size: 10, ...extra });
const trazo = (argb: string, style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Border> => ({ style, color: { argb } });

/** Aplica relleno/fuente/borde a las columnas 1..n de una fila (las celdas unidas toman el estilo de la primera). */
function pintarFila(row: ExcelJS.Row, n: number, estilo: { fill?: string; font?: Partial<ExcelJS.Font>; border?: Partial<ExcelJS.Borders> }) {
    for (let c = 1; c <= n; c++) {
        const cell = row.getCell(c);
        if (estilo.fill) cell.fill = solido(estilo.fill);
        if (estilo.font) cell.font = estilo.font;
        if (estilo.border) cell.border = estilo.border;
    }
}

const hoyDdmmaa = (d: Date) => `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Título unido a lo ancho con línea verde debajo + subtítulo gris (filas 1 y 2). */
function encabezado(ws: ExcelJS.Worksheet, ncol: number, titulo: string, subtitulo: string) {
    ws.mergeCells(1, 1, 1, ncol);
    const t = ws.getCell(1, 1);
    t.value = titulo;
    pintarFila(ws.getRow(1), ncol, { font: fuente({ size: 18, bold: true, color: { argb: PIZARRA } }), border: { bottom: trazo(VERDE_LOLS, 'thick') } });
    t.alignment = { vertical: 'middle' };
    ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, ncol);
    const s = ws.getCell(2, 1);
    s.value = subtitulo;
    s.font = fuente({ size: 9, italic: true, color: { argb: GRIS_TEXTO } });
    s.alignment = { vertical: 'middle' };
}

/** Fila de cabecera de columnas: pizarra con texto blanco. `izquierda` = columnas alineadas a la izquierda. */
function cabecera(row: ExcelJS.Row, titulos: string[], izquierda: number[]) {
    pintarFila(row, titulos.length, { fill: PIZARRA, font: fuente({ bold: true, color: { argb: BLANCO } }) });
    titulos.forEach((titulo, i) => {
        const cell = row.getCell(i + 1);
        cell.value = titulo;
        cell.alignment = { horizontal: izquierda.includes(i + 1) ? 'left' : 'center', vertical: 'middle' };
    });
    row.height = 22;
}

/** Fila de total sobre fondo pizarra: etiqueta unida en 1..colValor-1, monto en colValor. */
function filaTotal(ws: ExcelJS.Worksheet, r: number, ncol: number, colValor: number, etiqueta: string, valor: number) {
    ws.mergeCells(r, 1, r, colValor - 1);
    const row = ws.getRow(r);
    pintarFila(row, ncol, { fill: PIZARRA, font: fuente({ size: 12, bold: true, color: { argb: BLANCO } }) });
    row.getCell(1).value = etiqueta;
    row.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(colValor).value = valor;
    row.getCell(colValor).numFmt = PESOS;
    row.height = 22;
}

type OpcionesLibro = { titulo: string; filtrosTexto?: string; nombres?: Partial<Record<ColorFactura, string | null>>; generado?: Date };

/**
 * Arma el libro. `nombres` = nombre de cada color (para la leyenda); `filtrosTexto` = línea bajo el título.
 * Hoja «Compras» (detalle por categoría) + hoja «Resumen» (subtotal y % por categoría).
 * Apartados: cabecera pizarra · banda verde por categoría · subtotal verde suave · total general pizarra.
 */
export function construirLibroCompras(lineas: LineaCompra[], opts: OpcionesLibro): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bóveda LOLS';
    const ws = wb.addWorksheet('Compras', {
        views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
        pageSetup: {
            orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '4:4',
            margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
        },
    });
    ws.columns = COLUMNAS.map(c => ({ width: c.ancho }));

    const { grupos, total } = agruparPorCategoria(lineas);
    const nFacturas = new Set(lineas.map(l => l.factura_id)).size;
    const subtitulo = [
        opts.filtrosTexto,
        plural(lineas.length, 'línea', 'líneas'),
        plural(nFacturas, 'factura', 'facturas'),
        `generado el ${hoyDdmmaa(opts.generado ?? new Date())}`,
    ].filter(Boolean).join(' · ');
    encabezado(ws, NCOL, opts.titulo, subtitulo);
    cabecera(ws.getRow(4), COLUMNAS.map(c => c.titulo), [2, 10]);

    let r = 5;
    let correlativo = 0;
    for (const g of grupos) {
        r += 1; // fila en blanco entre grupos, como en la planilla

        // Banda de la categoría: verde LOLS a lo ancho.
        ws.mergeCells(r, 1, r, NCOL);
        const banda = ws.getRow(r);
        pintarFila(banda, NCOL, { fill: VERDE_LOLS, font: fuente({ size: 11, bold: true, color: { argb: BLANCO } }) });
        banda.getCell(1).value = `${g.categoria} · ${plural(g.lineas.length, 'línea', 'líneas')}`;
        banda.getCell(1).alignment = { vertical: 'middle', indent: 1 };
        banda.height = 20;
        r += 1;

        for (const l of g.lineas) {
            correlativo += 1;
            const fila = ws.getRow(r);
            const descripcion = l.item_descripcion || l.descripcion_factura || '';
            const cantidad = Number(l.cantidad) || 0;
            fila.values = [
                correlativo,
                descripcion.toUpperCase(),
                l.medidas || '',
                l.unidad || 'U',
                cantidad,
                Number(l.precio_unitario) || 0,
                Number(l.total) || 0,
                l.numero_factura || '',
                l.fecha_factura ? ddmmaa(l.fecha_factura) : '',
                l.proveedor || '',
            ];
            const marca = colorDe(l.color_marca);
            pintarFila(fila, NCOL, { font: fuente(), border: { bottom: trazo(BORDE) }, fill: marca?.excel });
            fila.getCell(5).numFmt = Number.isInteger(cantidad) ? '#,##0' : '#,##0.##';
            fila.getCell(6).numFmt = PESOS;
            fila.getCell(7).numFmt = PESOS;
            fila.getCell(7).font = fuente({ bold: true });
            for (const c of [1, 3, 4, 8, 9]) fila.getCell(c).alignment = { horizontal: 'center' };
            r += 1;
        }

        // Subtotal: verde suave a lo ancho, con borde verde arriba.
        ws.mergeCells(r, 1, r, 6);
        const sub = ws.getRow(r);
        pintarFila(sub, NCOL, {
            fill: VERDE_SUAVE,
            font: fuente({ bold: true, color: { argb: PIZARRA } }),
            border: { top: trazo(VERDE_LOLS, 'medium') },
        });
        sub.getCell(1).value = `SUBTOTAL ${g.categoria}`;
        sub.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
        sub.getCell(7).value = g.subtotal;
        sub.getCell(7).numFmt = PESOS;
        sub.height = 18;
        r += 1;
    }

    r += 1;
    filaTotal(ws, r, NCOL, 7, 'TOTAL GENERAL', total);

    // Leyenda: solo los colores que aparecen.
    const usados = PALETA.filter(p => lineas.some(l => l.color_marca === p.color));
    if (usados.length) {
        r += 2;
        const titulo = ws.getRow(r);
        pintarFila(titulo, 2, { fill: PIZARRA, font: fuente({ size: 9, bold: true, color: { argb: BLANCO } }) });
        titulo.getCell(2).value = 'MARCAS';
        const caja = { top: trazo(BORDE), left: trazo(BORDE), bottom: trazo(BORDE), right: trazo(BORDE) };
        for (const p of usados) {
            r += 1;
            const fila = ws.getRow(r);
            fila.getCell(1).fill = solido(p.excel);
            fila.getCell(1).border = caja;
            fila.getCell(2).value = nombreColor(p.color, opts.nombres || {});
            fila.getCell(2).font = fuente();
        }
    }

    hojaResumen(wb, grupos, total, opts.titulo, subtitulo);
    return wb;
}

/** Hoja «Resumen»: una fila por categoría con líneas, subtotal y % del total. */
function hojaResumen(wb: ExcelJS.Workbook, grupos: GrupoCompras[], total: number, titulo: string, subtitulo: string) {
    const ws = wb.addWorksheet('Resumen', {
        views: [{ showGridLines: false }],
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = [{ width: 36 }, { width: 10 }, { width: 18 }, { width: 13 }];
    encabezado(ws, 4, `RESUMEN · ${titulo}`, subtitulo);
    cabecera(ws.getRow(4), ['CATEGORÍA', 'LÍNEAS', 'SUBTOTAL', '% DEL TOTAL'], [1]);
    let r = 5;
    for (const g of grupos) {
        const fila = ws.getRow(r);
        fila.values = [g.categoria, g.lineas.length, g.subtotal, total ? g.subtotal / total : 0];
        pintarFila(fila, 4, { font: fuente(), border: { bottom: trazo(BORDE) } });
        // Borde verde a la izquierda: amarra con las bandas de la hoja Compras.
        fila.getCell(1).border = { left: trazo(VERDE_LOLS, 'thick'), bottom: trazo(BORDE) };
        fila.getCell(1).font = fuente({ bold: true });
        fila.getCell(2).alignment = { horizontal: 'center' };
        fila.getCell(3).numFmt = PESOS;
        fila.getCell(4).numFmt = '0.0%';
        r += 1;
    }
    filaTotal(ws, r, 4, 3, 'TOTAL GENERAL', total);
    ws.getRow(r).getCell(4).value = total ? 1 : 0;
    ws.getRow(r).getCell(4).numFmt = '0.0%';
}

/** Arma y descarga el .xlsx. */
export async function descargarExcelCompras(
    lineas: LineaCompra[],
    opts: OpcionesLibro
): Promise<void> {
    const wb = construirLibroCompras(lineas, opts);
    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `${opts.titulo.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'COMPRAS'}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

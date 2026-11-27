/**
 * Excel de una pestaña del Análisis de trabajadores: una hoja por tabla, con título, filtros usados y la
 * fecha de generación arriba (mismos colores de la Bóveda que el Excel «COMPRAS» de facturas).
 * `construirLibroAnalisis` es puro (testeable en node); `descargarExcelAnalisis` solo guarda el archivo.
 * El módulo se importa perezoso desde la pantalla: exceljs pesa y solo se usa al exportar.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { Tabla } from './analisis';

const PIZARRA = 'FF1E293B';
const VERDE_LOLS = 'FF029E4D';
const BORDE = 'FFE2E8F0';
const GRIS_TEXTO = 'FF64748B';
const BLANCO = 'FFFFFFFF';

const fuente = (extra: Partial<ExcelJS.Font> = {}): Partial<ExcelJS.Font> => ({ name: 'Segoe UI', size: 10, ...extra });

/** Nombre de hoja válido para Excel: sin []:*?/\, máx. 31 caracteres y sin repetir. */
export function nombreHoja(nombre: string, usados: Set<string>): string {
    const base = (nombre.replace(/[[\]:*?/\\]/g, ' ').trim() || 'Hoja').slice(0, 31);
    let n = base;
    for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
    usados.add(n.toLowerCase());
    return n;
}

export interface OpcionesLibro { titulo: string; subtitulo: string }

export function construirLibroAnalisis(tablas: Tabla[], opts: OpcionesLibro): ExcelJS.Workbook {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bóveda LOLS';
    const usados = new Set<string>();
    for (const t of tablas) {
        const ws = wb.addWorksheet(nombreHoja(t.nombre, usados), { views: [{ state: 'frozen', ySplit: 4 }] });
        const ncol = Math.max(t.columnas.length, 2);

        ws.mergeCells(1, 1, 1, ncol);
        const titulo = ws.getCell(1, 1);
        titulo.value = `${opts.titulo} · ${t.nombre}`;
        titulo.font = fuente({ size: 16, bold: true, color: { argb: PIZARRA } });
        for (let c = 1; c <= ncol; c++) ws.getCell(1, c).border = { bottom: { style: 'thick', color: { argb: VERDE_LOLS } } };
        ws.getRow(1).height = 28;
        ws.mergeCells(2, 1, 2, ncol);
        const sub = ws.getCell(2, 1);
        sub.value = opts.subtitulo;
        sub.font = fuente({ size: 9, italic: true, color: { argb: GRIS_TEXTO } });

        const cab = ws.getRow(4);
        t.columnas.forEach((col, i) => {
            const cell = cab.getCell(i + 1);
            cell.value = col || (i === 0 ? t.nombre : '');
            cell.font = fuente({ bold: true, color: { argb: BLANCO } });
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: PIZARRA } };
            cell.alignment = { horizontal: i === 0 ? 'left' : 'center', vertical: 'middle', wrapText: true };
        });
        cab.height = 22;

        t.filas.forEach((fila, r) => {
            const row = ws.getRow(5 + r);
            fila.forEach((v, c) => {
                const cell = row.getCell(c + 1);
                cell.value = v;
                cell.font = fuente();
                cell.border = { bottom: { style: 'thin', color: { argb: BORDE } } };
                if (typeof v === 'number') {
                    if (t.pesos?.includes(c)) cell.numFmt = '"$"#,##0';
                    else if (t.pct?.includes(c)) cell.numFmt = '0.0"%"';
                    else cell.numFmt = Number.isInteger(v) ? '#,##0' : '#,##0.0';
                }
            });
        });
        if (!t.filas.length) {
            ws.getCell(5, 1).value = 'Sin datos con estos filtros';
            ws.getCell(5, 1).font = fuente({ italic: true, color: { argb: GRIS_TEXTO } });
        }

        t.columnas.forEach((col, i) => {
            const largos = [col.length, ...t.filas.map(f => String(f[i] ?? '').length)];
            ws.getColumn(i + 1).width = Math.min(Math.max(...largos) + 4, i === 0 ? 48 : 22);
        });
    }
    return wb;
}

export async function descargarExcelAnalisis(tablas: Tabla[], opts: OpcionesLibro & { archivo: string }): Promise<void> {
    const wb = construirLibroAnalisis(tablas, opts);
    const buffer = await wb.xlsx.writeBuffer();
    const nombre = `${opts.archivo.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'Analisis'}.xlsx`;
    saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), nombre);
}

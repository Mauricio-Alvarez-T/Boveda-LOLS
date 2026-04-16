/**
 * Utilidad para exportar datos de inventario a Excel (.xlsx) con diseño.
 * Usa ExcelJS para estilos (colores, bordes, fonts) + file-saver para descarga.
 */
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import type { StockObraData } from '../hooks/inventario/useInventarioData';

/* ── Paleta de colores (matching la UI) ── */
const BRAND_PRIMARY = '1B6B4A';   // verde oscuro
const BRAND_LIGHT   = 'E6F0EA';   // verde claro bg
const BRAND_BG      = 'F5F7FA';   // gris header
const CAT_BG        = 'EDF5F0';   // verde suave categoría
const SUBTOTAL_BG   = 'EDEDF2';   // gris subtotal
const TOTAL_BG      = 'E6F0EA';   // verde total
const DISCOUNT_BG   = 'FEF9EE';   // amarillo descuento
const WHITE         = 'FFFFFF';
const ZEBRA         = 'F8F8FB';    // filas alternas
const BORDER_COLOR  = 'D8D8DD';
const RED_TEXT       = 'DC2626';

const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;
const fmtDate  = () => new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' });

/* ── Helpers de estilo ── */
const thinBorder: Partial<ExcelJS.Borders> = {
    top:    { style: 'thin', color: { argb: BORDER_COLOR } },
    bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    left:   { style: 'thin', color: { argb: BORDER_COLOR } },
    right:  { style: 'thin', color: { argb: BORDER_COLOR } },
};

const boldFont = (size = 10, color = '000000'): Partial<ExcelJS.Font> => ({
    bold: true, size, color: { argb: color }, name: 'Calibri',
});

const normalFont = (size = 10, color = '333333'): Partial<ExcelJS.Font> => ({
    size, color: { argb: color }, name: 'Calibri',
});

const fill = (color: string): ExcelJS.Fill => ({
    type: 'pattern', pattern: 'solid', fgColor: { argb: color },
});

/**
 * Exporta la vista actual de "Por Obra/Bodega" a un archivo .xlsx con diseño.
 */
export async function exportStockObra(data: StockObraData) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bóveda LOLS';
    wb.created = new Date();

    const sheetName = data.obra.nombre.substring(0, 31);
    const ws = wb.addWorksheet(sheetName, {
        views: [{ showGridLines: false }],
    });

    // ── Anchos de columna ──
    ws.columns = [
        { key: 'nro',     width: 7 },
        { key: 'desc',    width: 45 },
        { key: 'm2',      width: 10 },
        { key: 'arriendo', width: 16 },
        { key: 'unidad',  width: 8 },
        { key: 'cantidad', width: 12 },
        { key: 'total',   width: 18 },
    ];

    let row: ExcelJS.Row;

    // ══════════════════════════════════════════════
    //  TÍTULO — branding header
    // ══════════════════════════════════════════════
    ws.mergeCells('A1:G1');
    row = ws.getRow(1);
    row.height = 36;
    row.getCell(1).value = `📦  INVENTARIO — ${data.obra.nombre.toUpperCase()}`;
    row.getCell(1).font = boldFont(16, WHITE);
    row.getCell(1).fill = fill(BRAND_PRIMARY);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Subtítulo con fecha
    ws.mergeCells('A2:G2');
    row = ws.getRow(2);
    row.height = 22;
    row.getCell(1).value = `Exportado el ${fmtDate()}`;
    row.getCell(1).font = normalFont(9, '666666');
    row.getCell(1).fill = fill(BRAND_LIGHT);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Fila vacía de separación
    ws.getRow(3).height = 6;

    // ══════════════════════════════════════════════
    //  ENCABEZADO DE TABLA
    // ══════════════════════════════════════════════
    const headerLabels = ['#', 'Descripción', 'M²', 'V. Arriendo', 'UN', 'Cantidad', 'Total'];
    const headerAligns: ExcelJS.Alignment['horizontal'][] = ['center', 'left', 'center', 'right', 'center', 'right', 'right'];
    row = ws.getRow(4);
    row.height = 24;
    headerLabels.forEach((label, i) => {
        const cell = row.getCell(i + 1);
        cell.value = label;
        cell.font = boldFont(10, '333333');
        cell.fill = fill(BRAND_BG);
        cell.border = {
            ...thinBorder,
            bottom: { style: 'medium', color: { argb: BRAND_PRIMARY } },
        };
        cell.alignment = { vertical: 'middle', horizontal: headerAligns[i] };
    });

    let currentRow = 5;

    // ══════════════════════════════════════════════
    //  CATEGORÍAS + ÍTEMS
    // ══════════════════════════════════════════════
    for (const cat of data.categorias) {
        // ── Fila de categoría ──
        ws.mergeCells(`A${currentRow}:G${currentRow}`);
        row = ws.getRow(currentRow);
        row.height = 22;
        const catCell = row.getCell(1);
        catCell.value = `  ▸  ${cat.nombre.toUpperCase()}`;
        catCell.font = boldFont(10, BRAND_PRIMARY);
        catCell.fill = fill(CAT_BG);
        catCell.alignment = { vertical: 'middle' };
        catCell.border = thinBorder;
        currentRow++;

        // ── Ítems ──
        cat.items.forEach((item, idx) => {
            row = ws.getRow(currentRow);
            row.height = 20;
            const isZebra = idx % 2 !== 0;
            const bgColor = isZebra ? ZEBRA : WHITE;

            const values = [
                item.nro_item,
                item.descripcion,
                item.m2 ? item.m2.toFixed(2) : '',
                fmtMoney(item.valor_arriendo),
                item.unidad,
                item.cantidad,
                item.total > 0 ? fmtMoney(item.total) : '',
            ];

            values.forEach((val, i) => {
                const cell = row.getCell(i + 1);
                cell.value = val;
                cell.font = i === 1 ? normalFont(10, '1a1a1a') : normalFont(10, '555555');
                cell.fill = fill(bgColor);
                cell.border = thinBorder;
                cell.alignment = {
                    vertical: 'middle',
                    horizontal: headerAligns[i],
                };
            });

            // Negrita para el total
            if (item.total > 0) {
                row.getCell(7).font = boldFont(10, '1a1a1a');
            }

            currentRow++;
        });

        // ── Subtotal categoría ──
        row = ws.getRow(currentRow);
        row.height = 22;
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        const subLabel = row.getCell(1);
        subLabel.value = `Total ${cat.nombre}`;
        subLabel.font = boldFont(9, '777777');
        subLabel.fill = fill(SUBTOTAL_BG);
        subLabel.alignment = { vertical: 'middle', horizontal: 'right' };
        subLabel.border = thinBorder;

        const subCant = row.getCell(6);
        subCant.value = cat.subtotal_cantidad;
        subCant.font = boldFont(10, '333333');
        subCant.fill = fill(SUBTOTAL_BG);
        subCant.alignment = { vertical: 'middle', horizontal: 'right' };
        subCant.border = thinBorder;

        const subTotal = row.getCell(7);
        subTotal.value = fmtMoney(cat.subtotal_arriendo);
        subTotal.font = boldFont(10, BRAND_PRIMARY);
        subTotal.fill = fill(SUBTOTAL_BG);
        subTotal.alignment = { vertical: 'middle', horizontal: 'right' };
        subTotal.border = thinBorder;

        currentRow++;

        // Espacio entre categorías
        ws.getRow(currentRow).height = 4;
        currentRow++;
    }

    // ══════════════════════════════════════════════
    //  TOTALES FINALES
    // ══════════════════════════════════════════════

    // Total Facturación
    row = ws.getRow(currentRow);
    row.height = 28;
    ws.mergeCells(`A${currentRow}:F${currentRow}`);
    const totalLabel = row.getCell(1);
    totalLabel.value = 'TOTAL FACTURACIÓN';
    totalLabel.font = boldFont(12, '1a1a1a');
    totalLabel.fill = fill(BRAND_BG);
    totalLabel.alignment = { vertical: 'middle', horizontal: 'right' };
    totalLabel.border = { ...thinBorder, top: { style: 'medium', color: { argb: BRAND_PRIMARY } } };

    const totalVal = row.getCell(7);
    totalVal.value = fmtMoney(data.total_facturacion);
    totalVal.font = boldFont(13, BRAND_PRIMARY);
    totalVal.fill = fill(TOTAL_BG);
    totalVal.alignment = { vertical: 'middle', horizontal: 'right' };
    totalVal.border = { ...thinBorder, top: { style: 'medium', color: { argb: BRAND_PRIMARY } } };
    currentRow++;

    // Descuento (si existe)
    if (data.descuento_porcentaje > 0) {
        row = ws.getRow(currentRow);
        row.height = 24;
        ws.mergeCells(`A${currentRow}:F${currentRow}`);
        const descLabel = row.getCell(1);
        descLabel.value = `Descuento ${data.descuento_porcentaje}%`;
        descLabel.font = boldFont(10, '999999');
        descLabel.fill = fill(DISCOUNT_BG);
        descLabel.alignment = { vertical: 'middle', horizontal: 'right' };
        descLabel.border = thinBorder;

        const descVal = row.getCell(7);
        descVal.value = `-${fmtMoney(data.descuento_monto)}`;
        descVal.font = boldFont(11, RED_TEXT);
        descVal.fill = fill(DISCOUNT_BG);
        descVal.alignment = { vertical: 'middle', horizontal: 'right' };
        descVal.border = thinBorder;
        currentRow++;

        // Total con descuento
        row = ws.getRow(currentRow);
        row.height = 28;
        ws.mergeCells(`A${currentRow}:F${currentRow}`);
        const tcdLabel = row.getCell(1);
        tcdLabel.value = 'TOTAL CON DESCUENTO';
        tcdLabel.font = boldFont(12, '1a1a1a');
        tcdLabel.fill = fill(BRAND_BG);
        tcdLabel.alignment = { vertical: 'middle', horizontal: 'right' };
        tcdLabel.border = { ...thinBorder, top: { style: 'medium', color: { argb: BRAND_PRIMARY } } };

        const tcdVal = row.getCell(7);
        tcdVal.value = fmtMoney(data.total_con_descuento);
        tcdVal.font = boldFont(13, BRAND_PRIMARY);
        tcdVal.fill = fill(TOTAL_BG);
        tcdVal.alignment = { vertical: 'middle', horizontal: 'right' };
        tcdVal.border = { ...thinBorder, top: { style: 'medium', color: { argb: BRAND_PRIMARY } } };
        currentRow++;
    }

    // ── Footer ──
    currentRow++;
    ws.mergeCells(`A${currentRow}:G${currentRow}`);
    row = ws.getRow(currentRow);
    row.getCell(1).value = 'Generado por Bóveda LOLS — www.boveda.lols.cl';
    row.getCell(1).font = normalFont(8, 'AAAAAA');
    row.getCell(1).alignment = { horizontal: 'center' };

    // ══════════════════════════════════════════════
    //  GENERAR Y DESCARGAR
    // ══════════════════════════════════════════════
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `Stock_${data.obra.nombre.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑ ]/g, '').replace(/\s+/g, '_')}_${today}.xlsx`;
    saveAs(blob, filename);
}

/**
 * Exporta el Resumen General a un archivo .xlsx con diseño.
 */
export async function exportResumen(data: import('../hooks/inventario/useInventarioData').ResumenData) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bóveda LOLS';
    wb.created = new Date();

    const ws = wb.addWorksheet('Resumen General', {
        views: [{ showGridLines: false }],
    });

    // Construir columnas base
    const cols: Partial<ExcelJS.Column>[] = [
        { key: 'nro',     width: 7 },
        { key: 'desc',    width: 45 },
        { key: 'm2',      width: 10 },
        { key: 'arriendo', width: 14 },
        { key: 'unidad',  width: 8 },
        { key: 'total_qty', width: 12 },
    ];

    // Columnas por obra y bodega
    data.obras.forEach(o => cols.push({ key: `obra_${o.id}`, width: 10 }));
    data.bodegas.forEach(b => cols.push({ key: `bodega_${b.id}`, width: 10 }));

    ws.columns = cols;

    let row: ExcelJS.Row;

    // ══════════════════════════════════════════════
    //  TÍTULO
    // ══════════════════════════════════════════════
    const lastColLetter = ws.getColumn(cols.length).letter;
    ws.mergeCells(`A1:${lastColLetter}1`);
    row = ws.getRow(1);
    row.height = 36;
    row.getCell(1).value = `📦  RESUMEN GENERAL DE INVENTARIO`;
    row.getCell(1).font = boldFont(16, WHITE);
    row.getCell(1).fill = fill(BRAND_PRIMARY);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    // Subtítulo con fecha
    ws.mergeCells(`A2:${lastColLetter}2`);
    row = ws.getRow(2);
    row.height = 22;
    row.getCell(1).value = `Exportado el ${fmtDate()}`;
    row.getCell(1).font = normalFont(9, '666666');
    row.getCell(1).fill = fill(BRAND_LIGHT);
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

    ws.getRow(3).height = 6;

    // ══════════════════════════════════════════════
    //  ENCABEZADO DE TABLA
    // ══════════════════════════════════════════════
    const headerLabels = ['#', 'Descripción', 'M²', 'V. Arriendo', 'UN', 'Total Cant.'];
    data.obras.forEach(o => headerLabels.push(o.nombre));
    data.bodegas.forEach(b => headerLabels.push(b.nombre));

    row = ws.getRow(4);
    row.height = 24;
    headerLabels.forEach((label, i) => {
        const cell = row.getCell(i + 1);
        cell.value = label;
        cell.font = boldFont(10, '333333');
        cell.fill = fill(BRAND_BG);
        cell.border = { ...thinBorder, bottom: { style: 'medium', color: { argb: BRAND_PRIMARY } } };
        // Base cols have their own alignment, location columns are centered
        const align = i === 1 ? 'left' : (i < 5 ? 'center' : (i === 5 ? 'right' : 'center'));
        cell.alignment = { vertical: 'middle', horizontal: align as any };
    });

    let currentRow = 5;

    // ══════════════════════════════════════════════
    //  CATEGORÍAS + ÍTEMS
    // ══════════════════════════════════════════════
    for (const cat of data.categorias) {
        ws.mergeCells(`A${currentRow}:${lastColLetter}${currentRow}`);
        row = ws.getRow(currentRow);
        row.height = 22;
        const catCell = row.getCell(1);
        catCell.value = `  ▸  ${cat.nombre.toUpperCase()}`;
        catCell.font = boldFont(10, BRAND_PRIMARY);
        catCell.fill = fill(CAT_BG);
        catCell.alignment = { vertical: 'middle' };
        catCell.border = thinBorder;
        currentRow++;

        cat.items.forEach((item, idx) => {
            row = ws.getRow(currentRow);
            row.height = 20;
            const isZebra = idx % 2 !== 0;
            const bgColor = isZebra ? ZEBRA : WHITE;

            const values = [
                item.nro_item,
                item.descripcion,
                item.m2 ? item.m2.toFixed(2) : '',
                fmtMoney(item.valor_arriendo),
                item.unidad,
                item.total_cantidad,
            ];

            // Cantidades por ubicación
            data.obras.forEach(o => values.push(item.ubicaciones[`obra_${o.id}`]?.cantidad || 0));
            data.bodegas.forEach(b => values.push(item.ubicaciones[`bodega_${b.id}`]?.cantidad || 0));

            values.forEach((val, i) => {
                const cell = row.getCell(i + 1);
                // Blank out 0 values for locations to make it cleaner
                cell.value = (i > 5 && val === 0) ? '' : val;
                cell.font = i === 1 ? normalFont(10, '1a1a1a') : normalFont(10, '555555');
                
                // Highlight location values if > 0
                if (i > 5 && (val as number) > 0) {
                    const isBodega = i >= 6 + data.obras.length;
                    cell.font = boldFont(10, isBodega ? '92400e' : '1e40af'); // Amber or Blue text
                } else if (i === 5 && (val as number) > 0) {
                    cell.font = boldFont(10, '1a1a1a');
                }

                cell.fill = fill(bgColor);
                cell.border = thinBorder;
                const align = i === 1 ? 'left' : (i < 5 ? 'center' : (i === 5 ? 'right' : 'center'));
                cell.alignment = { vertical: 'middle', horizontal: align as any };
            });

            currentRow++;
        });

        ws.getRow(currentRow).height = 4;
        currentRow++;
    }

    // ── Calcular Totales Generales ──
    let totalArriendo = 0;
    let totalCantidad = 0;
    let totalDescuento = 0;

    for (const cat of data.categorias) {
        for (const item of cat.items) {
            totalArriendo += item.total_arriendo;
            totalCantidad += item.total_cantidad;
        }
    }

    data.obras.forEach(o => {
        const descPorcentaje = data.descuentos[o.id] || 0;
        if (descPorcentaje > 0) {
            const obraArriendo = data.categorias.reduce((sum, cat) =>
                sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.total || 0), 0), 0
            );
            totalDescuento += (obraArriendo * descPorcentaje) / 100;
        }
    });

    // ── Resumen de Totales ──
    // Fila Total General
    currentRow++;
    row = ws.getRow(currentRow);
    row.height = 24;
    ws.mergeCells(`A${currentRow}:E${currentRow}`);
    let c = row.getCell(1);
    c.value = 'TOTAL GENERAL';
    c.font = boldFont(11, '1a1a1a');
    c.fill = fill(BRAND_BG);
    c.alignment = { vertical: 'middle', horizontal: 'right' };
    c.border = thinBorder;

    c = row.getCell(6);
    c.value = totalCantidad;
    c.font = boldFont(11, '1a1a1a');
    c.fill = fill(BRAND_BG);
    c.alignment = { vertical: 'middle', horizontal: 'right' };
    c.border = thinBorder;
    
    // Blank the rest except Total Arriendo? We don't have a single column for it easily.
    // Let's add it right after Total Cantidad
    const totalArriendoCol = 7;
    c = row.getCell(totalArriendoCol);
    c.value = fmtMoney(totalArriendo);
    c.font = boldFont(11, BRAND_PRIMARY);
    c.fill = fill(TOTAL_BG);
    c.alignment = { vertical: 'middle', horizontal: 'right' };
    c.border = thinBorder;

    // Descuentos
    if (totalDescuento > 0) {
        currentRow++;
        row = ws.getRow(currentRow);
        row.height = 22;
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        c = row.getCell(1);
        c.value = 'DESCUENTOS APLICADOS';
        c.font = boldFont(10, '999999');
        c.fill = fill(DISCOUNT_BG);
        c.alignment = { vertical: 'middle', horizontal: 'right' };
        c.border = thinBorder;

        c = row.getCell(totalArriendoCol);
        c.value = `-${fmtMoney(totalDescuento)}`;
        c.font = boldFont(11, RED_TEXT);
        c.fill = fill(DISCOUNT_BG);
        c.alignment = { vertical: 'middle', horizontal: 'right' };
        c.border = thinBorder;

        currentRow++;
        row = ws.getRow(currentRow);
        row.height = 26;
        ws.mergeCells(`A${currentRow}:E${currentRow}`);
        c = row.getCell(1);
        c.value = 'TOTAL CON DESCUENTOS';
        c.font = boldFont(12, '1a1a1a');
        c.fill = fill(TOTAL_BG);
        c.alignment = { vertical: 'middle', horizontal: 'right' };
        c.border = thinBorder;

        c = row.getCell(totalArriendoCol);
        c.value = fmtMoney(totalArriendo - totalDescuento);
        c.font = boldFont(12, BRAND_PRIMARY);
        c.fill = fill(TOTAL_BG);
        c.alignment = { vertical: 'middle', horizontal: 'right' };
        c.border = thinBorder;
    }

    // ── Footer ──
    currentRow++;
    ws.mergeCells(`A${currentRow}:${lastColLetter}${currentRow}`);
    row = ws.getRow(currentRow);
    row.getCell(1).value = 'Generado por Bóveda LOLS — www.boveda.lols.cl';
    row.getCell(1).font = normalFont(8, 'AAAAAA');
    row.getCell(1).alignment = { horizontal: 'center' };

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

    const today = new Date().toISOString().slice(0, 10);
    const filename = `Resumen_Inventario_${today}.xlsx`;
    saveAs(blob, filename);
}

/**
 * Utilidad para exportar datos de inventario a Excel (.xlsx).
 * Usa SheetJS (xlsx) — ligera, sin dependencias nativas.
 */
import * as XLSX from 'xlsx';
import type { StockObraData } from '../hooks/inventario/useInventarioData';

/**
 * Exporta la vista actual de "Por Obra/Bodega" a un archivo .xlsx.
 * Incluye categorías, ítems, subtotales, total facturación y descuento
 * tal como se ven en pantalla.
 */
export function exportStockObra(data: StockObraData) {
    const rows: (string | number | null)[][] = [];

    // Encabezado
    rows.push(['#', 'Descripción', 'M2', 'V. Arriendo', 'UN', 'Cantidad', 'Total']);

    for (const cat of data.categorias) {
        // Fila de categoría
        rows.push([cat.nombre, '', '', '', '', '', '']);

        for (const item of cat.items) {
            rows.push([
                item.nro_item,
                item.descripcion,
                item.m2 ?? '',
                item.valor_arriendo,
                item.unidad,
                item.cantidad,
                item.total,
            ]);
        }

        // Subtotal categoría
        rows.push(['', `Total ${cat.nombre}`, '', '', '', cat.subtotal_cantidad, cat.subtotal_arriendo]);
    }

    // Fila vacía de separación
    rows.push([]);

    // Total facturación
    rows.push(['', '', '', '', '', 'TOTAL FACTURACIÓN', data.total_facturacion]);

    // Descuento
    if (data.descuento_porcentaje > 0) {
        rows.push(['', '', '', '', '', `Descuento ${data.descuento_porcentaje}%`, -data.descuento_monto]);
        rows.push(['', '', '', '', '', 'TOTAL CON DESCUENTO', data.total_con_descuento]);
    }

    // Crear workbook
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // Anchos de columna razonables
    ws['!cols'] = [
        { wch: 6 },   // #
        { wch: 40 },  // Descripción
        { wch: 8 },   // M2
        { wch: 14 },  // V. Arriendo
        { wch: 6 },   // UN
        { wch: 10 },  // Cantidad
        { wch: 14 },  // Total
    ];

    const wb = XLSX.utils.book_new();
    const sheetName = data.obra.nombre.substring(0, 31); // Excel max 31 chars
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    // Generar y descargar
    const today = new Date().toISOString().slice(0, 10);
    const filename = `Stock_${data.obra.nombre.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.xlsx`;
    XLSX.writeFile(wb, filename);
}

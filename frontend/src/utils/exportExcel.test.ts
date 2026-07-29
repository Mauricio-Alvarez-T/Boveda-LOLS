/**
 * Tests del export a Excel del "Resumen General de Inventario".
 *
 * NO son tests de estilo: generan el .xlsx de verdad (ExcelJS corre igual en
 * node), lo vuelven a abrir y verifican el CONTENIDO de las filas de totales.
 * Nacen de dos reclamos de obra (2026-07-29):
 *   1. En pantalla el descuento y el neto se ven por obra, pero en el Excel las
 *      filas de descuento salían vacías (solo la última columna tenía monto).
 *   2. El encabezado con los nombres de obra debe quedar FIJO al bajar.
 * Además fijan que los montos del Excel cuadren con los de la app (redondeados).
 */
import ExcelJS from 'exceljs';
import type { ResumenData } from '../hooks/inventario/useInventarioData';

// `saveAs` toca el DOM: lo interceptamos para quedarnos con el Blob generado.
const savedBlobs: Blob[] = [];
jest.mock('file-saver', () => ({
    saveAs: (blob: Blob) => { savedBlobs.push(blob); },
}));

import { exportResumen } from './exportExcel';

// Obra 1 con 25% de descuento; obra 2 sin descuento (neto = bruto).
// Bodega aparte: el descuento es por obra, la bodega nunca lleva monto.
const OBRA_A = 11, OBRA_B = 22, BODEGA = 33;

const resumen = (): ResumenData => ({
    obras: [{ id: OBRA_A, nombre: 'ULA 325' }, { id: OBRA_B, nombre: 'EW 195' }],
    bodegas: [{ id: BODEGA, nombre: 'Bodega Central' }],
    descuentos: { [OBRA_A]: 25 },
    categorias: [{
        id: 1,
        nombre: 'Andamios',
        orden: 1,
        items: [
            {
                id: 1, nro_item: 1, descripcion: 'ANDAMIO VERTICAL', m2: null,
                valor_compra: 0, valor_arriendo: 1000, unidad: 'U', imagen_url: null,
                ubicaciones: {
                    [`obra_${OBRA_A}`]: { cantidad: 10, total: 10000 },
                    [`obra_${OBRA_B}`]: { cantidad: 4, total: 4000 },
                    [`bodega_${BODEGA}`]: { cantidad: 2, total: 2000 },
                },
                total_arriendo: 16000, total_cantidad: 16,
            },
            {
                // Monto con decimal: la app muestra $2.001 (redondea), el Excel debe igualar.
                id: 2, nro_item: 2, descripcion: 'DIAGONAL 1,8 mts', m2: null,
                valor_compra: 0, valor_arriendo: 650, unidad: 'U', imagen_url: null,
                ubicaciones: { [`obra_${OBRA_A}`]: { cantidad: 3, total: 2000.5 } },
                total_arriendo: 2000.5, total_cantidad: 3,
            },
        ],
    }],
});

/** Genera el xlsx y lo reabre para inspeccionarlo. */
async function generar(data: ResumenData) {
    savedBlobs.length = 0;
    await exportResumen(data);
    expect(savedBlobs).toHaveLength(1);
    const buf = Buffer.from(await savedBlobs[0].arrayBuffer());
    const wb = new ExcelJS.Workbook();
    // `load` declara su propio tipo Buffer (choca con el de @types/node en TS 5).
    await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
    return wb.getWorksheet('Resumen General')!;
}

/** Texto de la celda 1 (etiqueta) de cada fila, para ubicar las filas de totales. */
const buscarFila = (ws: ExcelJS.Worksheet, etiqueta: string) => {
    let found: ExcelJS.Row | undefined;
    ws.eachRow(r => { if (String(r.getCell(1).value ?? '').trim() === etiqueta) found = r; });
    return found;
};

describe('exportResumen — filas de totales', () => {
    it('TOTAL CON DESCUENTO trae el neto en CADA columna de obra (no solo el total global)', async () => {
        const ws = await generar(resumen());
        const fila = buscarFila(ws, 'TOTAL CON DESCUENTO');
        expect(fila).toBeDefined();

        // Col 7 = primera obra, col 8 = segunda, col 9 = bodega, col 10 = Total Arriendo.
        // Obra A: bruto 12.000,5 − 25% (3.000,125) = 9.000,375 → $9.000
        expect(fila!.getCell(7).value).toBe('$9.000');
        // Obra B sin descuento: neto = bruto = $4.000 (se muestra igual, para leer la fila completa)
        expect(fila!.getCell(8).value).toBe('$4.000');
        // Bodega: nunca lleva monto
        expect(fila!.getCell(9).value == null || fila!.getCell(9).value === '').toBe(true);
        // Total global: 18.000,5 − 3.000,125 = 15.000,375 → $15.000
        expect(fila!.getCell(10).value).toBe('$15.000');
    });

    it('DESCUENTO POR OBRA trae el monto de cada obra con descuento', async () => {
        const ws = await generar(resumen());
        const fila = buscarFila(ws, 'DESCUENTO POR OBRA');
        expect(fila).toBeDefined();
        expect(fila!.getCell(7).value).toBe('-$3.000');   // 25% de 12.000,5
        expect(fila!.getCell(8).value == null || fila!.getCell(8).value === '').toBe(true); // sin descuento
        expect(fila!.getCell(10).value).toBe('-$3.000');
    });

    it('ya no existe la fila duplicada "DESCUENTOS APLICADOS"', async () => {
        const ws = await generar(resumen());
        expect(buscarFila(ws, 'DESCUENTOS APLICADOS')).toBeUndefined();
    });

    it('los montos van redondeados, como en pantalla (nunca "…,5")', async () => {
        const ws = await generar(resumen());
        const montos: string[] = [];
        ws.eachRow(r => r.eachCell(c => {
            if (typeof c.value === 'string' && c.value.includes('$')) montos.push(c.value);
        }));
        expect(montos.length).toBeGreaterThan(0);
        expect(montos.filter(m => m.includes(','))).toEqual([]);
        // El total general del ítem con decimal quedó redondeado hacia arriba.
        expect(montos).toContain('$2.001');
    });

    it('sin descuentos configurados no aparecen las filas de descuento', async () => {
        const ws = await generar({ ...resumen(), descuentos: {} });
        expect(buscarFila(ws, 'TOTAL GENERAL')).toBeDefined();
        expect(buscarFila(ws, 'DESCUENTO POR OBRA')).toBeUndefined();
        expect(buscarFila(ws, 'TOTAL CON DESCUENTO')).toBeUndefined();
    });
});

describe('exportResumen — encabezado fijo', () => {
    it('la hoja queda con panel congelado bajo la fila de encabezado', async () => {
        const ws = await generar(resumen());
        const view = ws.views[0] as ExcelJS.WorksheetViewFrozen;
        expect(view.state).toBe('frozen');
        expect(view.ySplit).toBe(4);      // fila 4 = encabezado con los nombres de obra
        expect(ws.getRow(4).getCell(7).value).toBe('ULA 325');
    });
});

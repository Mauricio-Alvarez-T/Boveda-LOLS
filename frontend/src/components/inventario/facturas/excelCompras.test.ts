import { agruparPorCategoria, construirLibroCompras, tituloCompras, type LineaCompra } from './excelCompras';
import { paramsFiltros, nombreColor, hayFiltros, FILTROS_VACIOS } from './marcasFactura';

const linea = (p: Partial<LineaCompra>): LineaCompra => ({
    factura_id: 1, numero_factura: '1', proveedor: 'ACME', fecha_factura: '2025-01-24', color_marca: null,
    cantidad: 1, precio_unitario: 1000, total: 1000, descripcion_factura: null, medidas: null,
    nro_item: 1, item_descripcion: 'ÍTEM', unidad: 'U', categoria: 'MAQUINARIA', ...p,
});

const LINEAS: LineaCompra[] = [
    linea({ numero_factura: '225967', item_descripcion: 'Soldadora laser', precio_unitario: 3000000, total: 3000000, color_marca: 'naranjo' }),
    linea({ numero_factura: '225965', item_descripcion: 'Barredora industrial', precio_unitario: 2750000, total: 2750000 }),
    linea({ numero_factura: '449', item_descripcion: 'Alzaprima', categoria: 'ALZAPRIMAS', cantidad: 50, precio_unitario: 30000, total: 1500000, medidas: '3 m', color_marca: 'azul' }),
];

describe('agruparPorCategoria', () => {
    test('un grupo por categoría en el orden recibido, con subtotal y total', () => {
        const { grupos, total } = agruparPorCategoria(LINEAS);
        expect(grupos.map(g => [g.categoria, g.lineas.length, g.subtotal])).toEqual([['MAQUINARIA', 2, 5750000], ['ALZAPRIMAS', 1, 1500000]]);
        expect(total).toBe(7250000);
    });
});

describe('tituloCompras', () => {
    test('año completo, rango, solo desde/hasta, sin fechas', () => {
        expect(tituloCompras({ desde: '2025-01-01', hasta: '2025-12-31' })).toBe('COMPRAS 2025');
        expect(tituloCompras({ desde: '2025-03-01', hasta: '2025-08-31' })).toBe('COMPRAS 01-03-2025 al 31-08-2025');
        expect(tituloCompras({ desde: '2025-03-01', hasta: '' })).toBe('COMPRAS desde 01-03-2025');
        expect(tituloCompras({ desde: '', hasta: '2025-08-31' })).toBe('COMPRAS hasta 31-08-2025');
        expect(tituloCompras({ desde: '', hasta: '' })).toBe('COMPRAS');
    });
});

describe('construirLibroCompras', () => {
    const wb = construirLibroCompras(LINEAS, { titulo: 'COMPRAS 2025', filtrosTexto: 'Del 01-01-2025 al 31-12-2025', nombres: { naranjo: 'Maquinaria nueva' } });
    const ws = wb.getWorksheet('Compras')!;
    const filas: { n: number; v: unknown[] }[] = [];
    ws.eachRow((row, n) => filas.push({ n, v: (row.values as unknown[]).slice(1) }));
    const buscar = (texto: string) => filas.find(f => f.v.some(x => x === texto));

    test('título, cabecera sin M2/$M2/YUAN y en el orden de la planilla', () => {
        expect(ws.getCell('B1').value).toBe('COMPRAS 2025');
        expect((ws.getRow(4).values as unknown[]).slice(1)).toEqual(['ITEM', 'DESCRIPCIÓN', 'MEDIDAS', 'UNID', 'CANTIDAD', '$ UNID', '$ TOTAL', 'FACTURA', 'FECHA', 'PROVEEDOR']);
    });

    test('filas de líneas con correlativo, descripción en mayúsculas, medidas y fecha dd-mm-aaaa', () => {
        const soldadora = buscar('SOLDADORA LASER')!;
        expect(soldadora.v).toEqual([1, 'SOLDADORA LASER', '', 'U', 1, 3000000, 3000000, '225967', '24-01-2025', 'ACME']);
        expect(buscar('ALZAPRIMA')!.v[2]).toBe('3 m');
    });

    test('subtotales y total NUMÉRICOS con formato pesos', () => {
        const sub = buscar('SUBTOTAL MAQUINARIA')!;
        expect(ws.getRow(sub.n).getCell(7).value).toBe(5750000);
        expect(ws.getRow(sub.n).getCell(7).numFmt).toBe('"$"#,##0');
        const tot = buscar('TOTAL GENERAL')!;
        expect(ws.getRow(tot.n).getCell(7).value).toBe(7250000);
    });

    test('filas marcadas con el color de su marca; sin marca sin relleno; leyenda con el nombre del equipo', () => {
        const fillDe = (texto: string) => (ws.getRow(buscar(texto)!.n).getCell(2).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;
        expect(fillDe('SOLDADORA LASER')).toBe('FFF8CBAD');
        expect(fillDe('BARREDORA INDUSTRIAL')).toBeUndefined();
        expect(buscar('Maquinaria nueva')).toBeDefined();   // naranjo con nombre
        expect(buscar('Azul')).toBeDefined();               // azul sin nombre → etiqueta
        expect(buscar('Verde')).toBeUndefined();            // color no usado: no va a la leyenda
    });
});

describe('marcasFactura', () => {
    test('paramsFiltros solo manda lo que tiene valor y fechas válidas', () => {
        expect(paramsFiltros(FILTROS_VACIOS)).toEqual({});
        expect(paramsFiltros({ desde: '2025-01-01', hasta: '2025-1-31', q: '  acme ', color: 'marcadas' }))
            .toEqual({ fecha_desde: '2025-01-01', q: 'acme', color: 'marcadas' });
        expect(hayFiltros(FILTROS_VACIOS)).toBe(false);
        expect(hayFiltros({ ...FILTROS_VACIOS, color: 'azul' })).toBe(true);
    });

    test('nombreColor: el del equipo o la etiqueta del color', () => {
        expect(nombreColor('verde', { verde: 'Arriendo' })).toBe('Arriendo');
        expect(nombreColor('verde', { verde: '  ' })).toBe('Verde');
    });
});

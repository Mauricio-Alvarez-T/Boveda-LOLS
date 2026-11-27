import { agruparPorCategoria, agruparPorMes, construirLibroCompras, nombreMes, tituloCompras, type LineaCompra } from './excelCompras';
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
    const wb = construirLibroCompras(LINEAS, { titulo: 'COMPRAS 2025', filtrosTexto: 'Del 01-01-2025 al 31-12-2025', nombres: { naranjo: 'Maquinaria nueva' }, generado: new Date(2026, 10, 25) });
    const ws = wb.getWorksheet('Compras')!;
    const filas: { n: number; v: unknown[] }[] = [];
    ws.eachRow((row, n) => filas.push({ n, v: (row.values as unknown[]).slice(1) }));
    const buscar = (texto: string) => filas.find(f => f.v.some(x => x === texto));

    test('título, cabecera sin M2/$M2/YUAN y en el orden de la planilla', () => {
        expect(ws.getCell('A1').value).toBe('COMPRAS 2025');
        expect(ws.getCell('A2').value).toBe('Del 01-01-2025 al 31-12-2025 · 3 líneas · 1 factura · 1 mes · generado el 25-11-2026');
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

    const fill = (n: number, c: number) => (ws.getRow(n).getCell(c).fill as { fgColor?: { argb?: string } } | undefined)?.fgColor?.argb;

    test('apartados diferenciados: cabecera pizarra, banda verde por categoría, subtotal verde suave a lo ancho, total pizarra', () => {
        expect(fill(4, 1)).toBe('FF1E293B');
        expect(fill(4, 10)).toBe('FF1E293B');
        const banda = buscar('MAQUINARIA · 2 líneas')!;
        expect(fill(banda.n, 1)).toBe('FF029E4D');
        expect(fill(banda.n, 10)).toBe('FF029E4D');
        expect(buscar('ALZAPRIMAS · 1 línea')).toBeDefined();
        const sub = buscar('SUBTOTAL MAQUINARIA')!;
        expect(fill(sub.n, 1)).toBe('FFE6F4EC');
        expect(fill(sub.n, 10)).toBe('FFE6F4EC');
        expect(fill(buscar('TOTAL GENERAL')!.n, 7)).toBe('FF1E293B');
        const franja = buscar('ENERO 2025 · 1 factura · 3 líneas')!;
        expect(fill(franja.n, 1)).toBe('FF1E293B');
        expect(fill(buscar('TOTAL ENERO 2025')!.n, 7)).toBe('FFE2E8F0');
    });

    test('hoja Resumen: bloque POR MES y bloque POR CATEGORÍA, cada uno con su total', () => {
        const rs = wb.getWorksheet('Resumen')!;
        const v = (n: number) => (rs.getRow(n).values as unknown[]).slice(1);
        expect(wb.worksheets.map(w => w.name)).toEqual(['Compras', 'Resumen']);
        expect(v(4)[0]).toBe('POR MES');
        expect(v(5)).toEqual(['MES', 'FACTURAS', 'LÍNEAS', 'TOTAL', '% DEL TOTAL']);
        expect(v(6)).toEqual(['ENERO 2025', 1, 3, 7250000, 1]);
        expect(v(7)[0]).toBe('TOTAL GENERAL');
        expect(rs.getRow(7).getCell(4).value).toBe(7250000);
        expect(v(9)[0]).toBe('POR CATEGORÍA');
        expect(v(10)).toEqual(['CATEGORÍA', 'FACTURAS', 'LÍNEAS', 'SUBTOTAL', '% DEL TOTAL']);
        expect(v(11)).toEqual(['MAQUINARIA', 1, 2, 5750000, 5750000 / 7250000]);
        expect(v(12)).toEqual(['ALZAPRIMAS', 1, 1, 1500000, 1500000 / 7250000]);
        expect(rs.getRow(13).getCell(4).value).toBe(7250000);
        expect(rs.getRow(13).getCell(5).value).toBe(1);
    });
});

describe('separado por mes (fecha de la factura)', () => {
    // Orden del backend: categoría → fecha → número. Julio trae 2 facturas; una factura sin fecha va al final.
    const VARIAS: LineaCompra[] = [
        linea({ factura_id: 13, numero_factura: '284329', fecha_factura: '2026-11-18', categoria: 'ANDAMIOS', item_descripcion: 'Andamio vertical', total: 3821220 }),
        linea({ factura_id: 10, numero_factura: '273659', fecha_factura: '2026-07-28', categoria: 'ALZAPRIMAS', item_descripcion: 'Alzaprima 4.0', total: 24705680 }),
        linea({ factura_id: 12, numero_factura: '278290', fecha_factura: '2026-08-31', categoria: 'ALZAPRIMAS', item_descripcion: 'Alzaprima roja', total: 10822900 }),
        linea({ factura_id: 12, numero_factura: '278290', fecha_factura: '2026-08-31', categoria: 'ALZAPRIMAS', item_descripcion: 'Alzaprima azul', total: 10822900 }),
        linea({ factura_id: 11, numero_factura: '274120', fecha_factura: '2026-07-15', categoria: 'MAQUINARIA', item_descripcion: 'Betonera', total: 389000 }),
        linea({ factura_id: 14, numero_factura: '9', fecha_factura: null, categoria: 'SIN CATEGORÍA', item_descripcion: 'Sin fecha', total: 1000 }),
    ];

    test('nombreMes', () => {
        expect(nombreMes('2026-07')).toBe('JULIO 2026');
        expect(nombreMes('2026-12')).toBe('DICIEMBRE 2026');
        expect(nombreMes('')).toBe('SIN FECHA');
    });

    test('agruparPorMes: meses cronológicos, sin fecha al final, categorías en el orden del backend', () => {
        const { meses, total } = agruparPorMes(VARIAS);
        expect(meses.map(m => [m.nombre, m.facturas, m.lineas, m.total])).toEqual([
            ['JULIO 2026', 2, 2, 25094680],
            ['AGOSTO 2026', 1, 2, 21645800],
            ['NOVIEMBRE 2026', 1, 1, 3821220],
            ['SIN FECHA', 1, 1, 1000],
        ]);
        expect(meses[0].grupos.map(g => g.categoria)).toEqual(['ALZAPRIMAS', 'MAQUINARIA']);
        expect(total).toBe(25094680 + 21645800 + 3821220 + 1000);
    });

    const wb = construirLibroCompras(VARIAS, { titulo: 'COMPRAS', generado: new Date(2026, 10, 27) });
    const ws = wb.getWorksheet('Compras')!;
    const filas: { n: number; v: unknown[] }[] = [];
    ws.eachRow((row, n) => filas.push({ n, v: (row.values as unknown[]).slice(1) }));
    const fila = (texto: string) => filas.find(f => f.v.some(x => x === texto))!;

    test('franja por mes en orden, total de cada mes y correlativo que sigue entre meses', () => {
        const franjas = filas.filter(f => typeof f.v[0] === 'string' && /^(JULIO|AGOSTO|NOVIEMBRE) 2026 · |^SIN FECHA · /.test(f.v[0] as string));
        expect(franjas.map(f => f.v[0])).toEqual([
            'JULIO 2026 · 2 facturas · 2 líneas',
            'AGOSTO 2026 · 1 factura · 2 líneas',
            'NOVIEMBRE 2026 · 1 factura · 1 línea',
            'SIN FECHA · 1 factura · 1 línea',
        ]);
        expect(ws.getRow(fila('TOTAL JULIO 2026').n).getCell(7).value).toBe(25094680);
        expect(ws.getRow(fila('TOTAL AGOSTO 2026').n).getCell(7).value).toBe(21645800);
        expect(fila('BETONERA').v[0]).toBe(2);
        expect(fila('ALZAPRIMA ROJA').v[0]).toBe(3);
        expect(fila('ANDAMIO VERTICAL').v[0]).toBe(5);
        expect(fila('TOTAL JULIO 2026').n).toBeLessThan(fila('AGOSTO 2026 · 1 factura · 2 líneas').n);
        expect(ws.getRow(fila('TOTAL GENERAL').n).getCell(7).value).toBe(25094680 + 21645800 + 3821220 + 1000);
        expect(ws.getCell('A2').value).toBe('6 líneas · 5 facturas · 4 meses · generado el 27-11-2026');
    });

    test('cada mes se pliega: detalle en nivel 1; franja y total del mes quedan visibles', () => {
        expect(ws.properties.outlineLevelRow).toBe(1);
        const nivel = (texto: string) => ws.getRow(fila(texto).n).outlineLevel || 0;
        expect(nivel('ALZAPRIMAS · 1 línea')).toBe(1);
        expect(nivel('BETONERA')).toBe(1);
        expect(nivel('SUBTOTAL MAQUINARIA')).toBe(1);
        expect(nivel('JULIO 2026 · 2 facturas · 2 líneas')).toBe(0);
        expect(nivel('TOTAL JULIO 2026')).toBe(0);
        expect(nivel('TOTAL GENERAL')).toBe(0);
    });

    test('Resumen POR MES con facturas, líneas y total de cada mes', () => {
        const rs = wb.getWorksheet('Resumen')!;
        const v = (n: number) => (rs.getRow(n).values as unknown[]).slice(1, 4);
        expect([v(6), v(7), v(8), v(9)]).toEqual([['JULIO 2026', 2, 2], ['AGOSTO 2026', 1, 2], ['NOVIEMBRE 2026', 1, 1], ['SIN FECHA', 1, 1]]);
        expect(rs.getRow(10).getCell(4).value).toBe(25094680 + 21645800 + 3821220 + 1000);
    });

    test('el libro se puede escribir a .xlsx', async () => {
        const buffer = await wb.xlsx.writeBuffer();
        expect(buffer.byteLength).toBeGreaterThan(1000);
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

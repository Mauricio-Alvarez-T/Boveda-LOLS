/**
 * Tests de la lectura del itemizado desde Excel (Costos de obra, mig 122).
 *
 * Arman un .xlsx de verdad con ExcelJS (corre igual en node), lo leen con
 * `leerPresupuestoExcel` y fijan lo que tiene que entender sin plantilla:
 *   · la fila de encabezados aunque haya títulos arriba (nombre de la obra, fecha),
 *   · los títulos de capítulo = filas con texto y SIN cantidad ni precio,
 *   · las filas de totales (Subtotal, Costo directo, IVA…) se saltan,
 *   · celdas con fórmula (se usa el resultado) y números escritos como texto chileno,
 *   · si hay columna de capítulo, manda esa columna.
 */
import ExcelJS from 'exceljs';
import { leerPresupuestoExcel, aNumero } from './excelPresupuesto';

async function archivo(armar: (h: ExcelJS.Worksheet) => void): Promise<File> {
    const libro = new ExcelJS.Workbook();
    armar(libro.addWorksheet('Itemizado'));
    const buf = await libro.xlsx.writeBuffer();
    return { name: 'presupuesto.xlsx', arrayBuffer: async () => buf } as unknown as File;
}

describe('aNumero', () => {
    test('formato chileno y números de Excel', () => {
        expect(aNumero(45000)).toBe(45000);
        expect(aNumero('45.000')).toBe(45000);
        expect(aNumero('1.234,5')).toBe(1234.5);
        expect(aNumero('$ 89.900')).toBe(89900);
        expect(aNumero('12,5')).toBe(12.5);
        expect(aNumero('')).toBeNull();
        expect(aNumero('gl')).toBeNull();
    });
});

describe('leerPresupuestoExcel', () => {
    test('Excel típico: título arriba, capítulos como filas sueltas, totales al final', async () => {
        const f = await archivo(h => {
            h.addRow(['PRESUPUESTO OBRA BASCUÑAN 661']);
            h.addRow(['Fecha: 10/10/2026']);
            h.addRow([]);
            h.addRow(['Ítem', 'Descripción', 'Unidad', 'Cantidad', 'P.U.', 'Total']);
            h.addRow(['1', 'OBRAS PRELIMINARES']);
            h.addRow(['1.1', 'Instalación de faenas', 'gl', 1, 1500000, { formula: 'D6*E6', result: 1500000 }]);
            h.addRow(['2', '2. OBRA GRUESA']);
            h.addRow(['2.1', 'Hormigón H-25', 'm3', { formula: '40+2', result: 42 }, '138.000', null]);
            h.addRow(['2.2', 'Enfierradura', 'kg', '3.800', '1.450,5', null]);
            h.addRow([null, 'Subtotal obra gruesa', null, null, null, 9999]);
            h.addRow([null, 'COSTO DIRECTO', null, null, null, 9999]);
            h.addRow([null, 'IVA 19%', null, null, null, 9999]);
        });
        const r = await leerPresupuestoExcel(f);
        expect(r.hoja).toBe('Itemizado');
        expect(r.filas).toEqual([
            { capitulo: 'OBRAS PRELIMINARES', codigo: '1.1', descripcion: 'Instalación de faenas', unidad: 'gl', cantidad: 1, precio_unitario: 1500000 },
            { capitulo: 'OBRA GRUESA', codigo: '2.1', descripcion: 'Hormigón H-25', unidad: 'm3', cantidad: 42, precio_unitario: 138000 },
            { capitulo: 'OBRA GRUESA', codigo: '2.2', descripcion: 'Enfierradura', unidad: 'kg', cantidad: 3800, precio_unitario: 1450.5 },
        ]);
        expect(r.descartadas).toBe(3);
        expect(r.columnas.precio_unitario).toBe('P.U.');
    });

    test('con columna de capítulo, manda la columna', async () => {
        const f = await archivo(h => {
            h.addRow(['Capítulo', 'Ítem', 'Partida', 'Un', 'Cantidad', 'Precio unitario']);
            h.addRow(['Terminaciones', '3.1', 'Cerámica de piso', 'm2', 210, 15390]);
            h.addRow(['Terminaciones', '3.2', 'Pintura interior', 'm2', 640, 3200]);
            h.addRow(['Instalaciones', '4.1', 'Empalme eléctrico', 'gl', 1, null]);
        });
        const r = await leerPresupuestoExcel(f);
        expect(r.filas.map(x => [x.capitulo, x.descripcion, x.precio_unitario])).toEqual([
            ['Terminaciones', 'Cerámica de piso', 15390],
            ['Terminaciones', 'Pintura interior', 3200],
            ['Instalaciones', 'Empalme eléctrico', 0],   // sin precio: queda en $0 para completar
        ]);
    });

    test('sin encabezados reconocibles avisa qué columnas busca', async () => {
        const f = await archivo(h => {
            h.addRow(['Nombre', 'Monto']);
            h.addRow(['Algo', 1000]);
        });
        await expect(leerPresupuestoExcel(f)).rejects.toThrow(/encabezados/);
    });
});

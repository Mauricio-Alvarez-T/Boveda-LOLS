/**
 * Informe de asistencia a actividades sugeridas (pedido del dueño 2026-09-21):
 * resumen por cargo + Excel de dos hojas ("Por cargo" y "Por obra").
 *
 * Mocks de db por substring del SQL (patrón de excel_export.test.js) y el buffer
 * generado se reabre con ExcelJS para assertear celdas reales.
 */
const ExcelJS = require('exceljs');

jest.mock('../src/config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));

const service = require('../src/services/actividadesSugeridas.service');
const db = require('../src/config/db');

const SEMANA = '2026-09-28'; // lunes

const FILAS = [
    { rut: '11.111.111-1', nombres: 'VICTOR RAUL', apellido_paterno: 'MORALES', apellido_materno: 'TASAYCO', cargo_nombre: 'CERAMISTA', obra_nombre: 'DOMEYKO', observacion: 'llegó tarde' },
    { rut: '22.222.222-2', nombres: 'ANA', apellido_paterno: 'SOTO', apellido_materno: null, cargo_nombre: 'CERAMISTA', obra_nombre: 'TOESCA', observacion: null },
    { rut: '33.333.333-3', nombres: 'LUIS HUMBERTO', apellido_paterno: 'RUIZ', apellido_materno: 'OVALLE', cargo_nombre: 'JORNAL', obra_nombre: 'DOMEYKO', observacion: null },
];

/** Enruta cada query por su forma: semanas / por cargo / cabeceras / detalle. */
function mockDatos({ semanas = [SEMANA], filas = FILAS } = {}) {
    db.query.mockImplementation((sql) => {
        if (/SELECT DISTINCT/.test(sql)) return Promise.resolve([semanas.map(s => ({ semana: s }))]);
        if (/GROUP BY c\.id/.test(sql)) {
            const mapa = new Map();
            filas.forEach(f => mapa.set(f.cargo_nombre, (mapa.get(f.cargo_nombre) || 0) + 1));
            return Promise.resolve([[...mapa.entries()].map(([cargo_nombre, asistieron]) => ({ cargo_nombre, asistieron }))]);
        }
        if (/COUNT\(DISTINCT s\.obra_id\)/.test(sql)) {
            return Promise.resolve([[{ listas: 2, obras: new Set(filas.map(f => f.obra_nombre)).size }]]);
        }
        return Promise.resolve([filas]);
    });
}

const abrir = async (buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    return wb;
};
/** Todo el texto de una hoja, para buscar rótulos sin depender de la fila exacta. */
const textoDe = (ws) => {
    const out = [];
    ws.eachRow((row) => row.eachCell({ includeEmpty: false }, (c) => out.push(String(c.value ?? ''))));
    return out.join('\n');
};

describe('Informe de actividades sugeridas — resumen', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('sin semana usa la última con asistencia registrada', async () => {
        mockDatos({ semanas: ['2026-10-05', SEMANA] });
        const r = await service.resumenSemana();
        expect(r.semana).toBe('2026-10-05');
        expect(r.semana_label).toBe('Semana lun 05/10 – vie 09/10');
        expect(r.semanas_disponibles).toEqual(['2026-10-05', SEMANA]);
    });

    test('con semana explícita agrupa por cargo y totaliza', async () => {
        mockDatos();
        const r = await service.resumenSemana(SEMANA);
        expect(r.semana).toBe(SEMANA);
        expect(r.por_cargo).toEqual([
            { cargo_nombre: 'CERAMISTA', asistieron: 2 },
            { cargo_nombre: 'JORNAL', asistieron: 1 },
        ]);
        expect(r.total_asistieron).toBe(3);
        expect(r.listas).toBe(2);
        expect(r.obras).toBe(2);
    });

    test('solo cuenta listas realizadas, filas asistio y excluye obras de prueba', async () => {
        mockDatos();
        await service.resumenSemana(SEMANA);
        const sqls = db.query.mock.calls.map(c => c[0]).join('\n---\n');
        expect(sqls).toMatch(/s\.estado = 'realizada'/);
        expect(sqls).toMatch(/t\.estado = 'asistio'/);
        expect(sqls).toMatch(/o\.es_prueba = 0/);
        // Las obras finalizadas SÍ entran: es historial de pago.
        expect(sqls).not.toMatch(/o\.finalizada/);
    });

    test('sin semanas con asistencia devuelve el resumen vacío sin reventar', async () => {
        mockDatos({ semanas: [] });
        const r = await service.resumenSemana();
        expect(r).toMatchObject({ semana: null, semana_label: null, total_asistieron: 0, por_cargo: [], listas: 0, obras: 0 });
    });

    test('el LIMIT de semanas va interpolado y saneado (MariaDB rechaza el placeholder)', async () => {
        mockDatos();
        await service.semanasConAsistencia('99');
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/LIMIT 52/);           // tope
        expect(params).toBeUndefined();
        await service.semanasConAsistencia('; DROP TABLE x');
        expect(db.query.mock.calls[1][0]).toMatch(/LIMIT 12/); // basura → default
    });
});

describe('Informe de actividades sugeridas — Excel', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('rechaza una semana que no es lunes o inválida, sin tocar la BD', async () => {
        await expect(service.generarInformeExcel('2026-09-30')).rejects.toMatchObject({ statusCode: 400, message: 'La semana debe indicarse por su lunes' });
        await expect(service.generarInformeExcel('no-es-fecha')).rejects.toMatchObject({ statusCode: 400 });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('dos hojas: "Por cargo" agrupa por cargo y "Por obra" anida cargo dentro de obra', async () => {
        mockDatos();
        const wb = await abrir(await service.generarInformeExcel(SEMANA));
        expect(wb.worksheets.map(w => w.name)).toEqual(['Por cargo', 'Por obra']);

        const cargo = textoDe(wb.getWorksheet('Por cargo'));
        expect(cargo).toContain('ASISTENCIA A ACTIVIDADES SUGERIDAS');
        expect(cargo).toContain('Semana lun 28/09 – vie 02/10');
        expect(cargo).toContain('CERAMISTA — 2 asistieron');
        expect(cargo).toContain('JORNAL — 1 asistieron');
        expect(cargo).toContain('TOTAL ASISTIERON: 3');
        expect(cargo).toContain('11.111.111-1');          // RUT
        expect(cargo).toContain('MORALES TASAYCO');        // apellidos juntos
        expect(cargo).toContain('llegó tarde');            // observación

        const obra = textoDe(wb.getWorksheet('Por obra'));
        expect(obra).toContain('DOMEYKO — 2 asistieron');
        expect(obra).toContain('TOESCA — 1 asistieron');
        expect(obra).toMatch(/DOMEYKO — 2 asistieron[\s\S]*CERAMISTA — 1[\s\S]*JORNAL — 1/);
    });

    test('encabezados de tabla y panel congelado en ambas hojas', async () => {
        mockDatos();
        const wb = await abrir(await service.generarInformeExcel(SEMANA));
        for (const ws of wb.worksheets) {
            expect(ws.getCell(5, 1).value).toBe('N°');
            expect(ws.getCell(5, 4).value).toBe('RUT');
            expect(ws.getCell(5, 5).value).toBe('CARGO');
            expect(ws.getCell(5, 6).value).toBe('OBRA');
            expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 });
        }
    });

    test('semana sin asistencias: hojas con el aviso, sin filas de trabajadores', async () => {
        mockDatos({ filas: [] });
        const wb = await abrir(await service.generarInformeExcel(SEMANA));
        for (const ws of wb.worksheets) {
            expect(textoDe(ws)).toContain('Sin asistencias registradas esta semana.');
            expect(textoDe(ws)).not.toContain('TOTAL ASISTIERON');
        }
    });

    test('ninguna celda menciona sábado', async () => {
        mockDatos();
        const wb = await abrir(await service.generarInformeExcel(SEMANA));
        for (const ws of wb.worksheets) expect(textoDe(ws)).not.toMatch(/s[aá]bado/i);
    });
});

/**
 * Regla "FILA VIGENTE" (docs/reglas/asistencia.md — 2026-08-24).
 *
 * La UK de asistencias es (trabajador, obra, fecha) → un trabajador puede tener
 * 2 filas el mismo día en obras distintas (traslado TO+A intencional, o duplicado
 * histórico al re-guardar tras cambiar de obra — caso real García Arancibia).
 * Regla: gana la fila de id MÁS ALTO; los pares TO se preservan.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');
const ExcelJS = require('exceljs');

// Fila base estilo García: dos obras, mismo día.
const fila = (over) => ({
    id: 1, trabajador_id: 594, obra_id: 32, fecha: '2026-08-20',
    estado_id: 1, estado_codigo: 'A', es_presente: 1,
    rut: '17.281.879-K', nombres: 'CRISTIAN', apellido_paterno: 'GARCIA', apellido_materno: 'ARANCIBIA',
    ...over,
});

describe('_filaVigente (helper)', () => {
    test('con duplicado cross-obra gana la fila de id más alto', () => {
        const vieja = fila({ id: 100, obra_id: 32, estado_codigo: 'A' });
        const nueva = fila({ id: 200, obra_id: 34, estado_id: 2, estado_codigo: 'F' });
        const out = asistenciaService._filaVigente([vieja, nueva]);
        expect(out).toHaveLength(1);
        expect(out[0].estado_codigo).toBe('F');
        expect(out[0].id).toBe(200);
    });

    test('fila sintética de período (id null) pierde ante fila real', () => {
        const sintetica = fila({ id: null, _from_periodo: true, estado_codigo: 'LM' });
        const real = fila({ id: 50, estado_codigo: 'F', estado_id: 2 });
        const out = asistenciaService._filaVigente([sintetica, real]);
        expect(out).toHaveLength(1);
        expect(out[0].id).toBe(50);
    });

    test('fechas distintas y trabajadores distintos no se tocan', () => {
        const rows = [
            fila({ id: 1, fecha: '2026-08-19' }),
            fila({ id: 2, fecha: '2026-08-20' }),
            fila({ id: 3, trabajador_id: 999, fecha: '2026-08-20' }),
        ];
        expect(asistenciaService._filaVigente(rows)).toHaveLength(3);
    });
});

describe('getByObraAndFecha — dedupe solo en ALL', () => {
    beforeEach(() => jest.clearAllMocks());

    const mockRows = () => [
        fila({ id: 100, obra_id: 32, estado_codigo: 'A' }),
        fila({ id: 200, obra_id: 34, estado_id: 2, estado_codigo: 'F', es_presente: 0 }),
    ];

    test("'ALL': devuelve solo la fila vigente (F, id mayor)", async () => {
        db.query
            .mockResolvedValueOnce([[]])            // feriados
            .mockResolvedValueOnce([mockRows()])    // asistencias
            .mockResolvedValueOnce([[]]);           // periodos (_filasDePeriodos)
        const { registros } = await asistenciaService.getByObraAndFecha('ALL', '2026-08-20');
        expect(registros).toHaveLength(1);
        expect(registros[0].estado_codigo).toBe('F');
    });

    test('por obra: NO dedupea (cada obra ve su propia fila, p.ej. TO origen)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([mockRows()])
            .mockResolvedValueOnce([[]]);
        const { registros } = await asistenciaService.getByObraAndFecha(32, '2026-08-20');
        expect(registros).toHaveLength(2);
    });
});

describe('getReporte — dedupe solo sin filtro de obra', () => {
    beforeEach(() => jest.clearAllMocks());

    test('sin obra (calendario del trabajador): gana la fila más nueva', async () => {
        db.query.mockResolvedValueOnce([[
            fila({ id: 100, obra_id: 32, estado_codigo: 'A' }),
            fila({ id: 200, obra_id: 34, estado_id: 2, estado_codigo: 'F' }),
        ]]);
        // Sin fecha_inicio/fin → no entra al bloque de períodos.
        const { registros } = await asistenciaService.getReporte({ trabajador_id: 594 });
        expect(registros).toHaveLength(1);
        expect(registros[0].estado_codigo).toBe('F');
    });

    test('con obra: passthrough sin dedupe', async () => {
        db.query.mockResolvedValueOnce([[
            fila({ id: 100, obra_id: 32 }),
            fila({ id: 200, obra_id: 32, fecha: '2026-08-21' }),
        ]]);
        const { registros } = await asistenciaService.getReporte({ obra_id: '32', trabajador_id: 594 });
        expect(registros).toHaveLength(2);
    });
});

describe('_limpiarDuplicadosCrossObra (prevención en escritura)', () => {
    let conn;
    beforeEach(() => {
        conn = { query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
    });

    test('con id: borra solo filas MÁS ANTIGUAS de otras obras y protege TO', async () => {
        const n = await asistenciaService._limpiarDuplicadosCrossObra(conn, [
            { trabajador_id: 594, fecha: '2026-08-20', obra_id: 34, id: 200 },
        ]);
        expect(n).toBe(1);
        const [sql, params] = conn.query.mock.calls[0];
        expect(sql).toMatch(/DELETE a FROM asistencias/);
        expect(sql).toMatch(/codigo = 'TO'/);          // guard del traslado
        expect(sql).toMatch(/a\.id < \?/);             // solo más antiguas
        expect(sql).toMatch(/a\.obra_id <> \?/);       // solo otras obras
        expect(params).toEqual([594, '2026-08-20', 34, 200]);
    });

    test('sin id (crearPeriodo): borra las de otras obras sin guard de id', async () => {
        await asistenciaService._limpiarDuplicadosCrossObra(conn, [
            { trabajador_id: 594, fecha: '2026-08-20', obra_id: 34 },
        ]);
        const [sql, params] = conn.query.mock.calls[0];
        expect(sql).not.toMatch(/a\.id < \?/);
        expect(params).toEqual([594, '2026-08-20', 34]);
    });

    test('lista vacía: no toca la BD', async () => {
        const n = await asistenciaService._limpiarDuplicadosCrossObra(conn, []);
        expect(n).toBe(0);
        expect(conn.query).not.toHaveBeenCalled();
    });
});

describe('bulkCreate integra la limpieza en la transacción', () => {
    let mockConn;
    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            beginTransaction: jest.fn(),
            // Default con affectedRows: cubre el DELETE de limpieza sin agotar cadenas.
            query: jest.fn().mockResolvedValue([{ affectedRows: 0 }]),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    test('tras el upsert borra duplicados viejos de otras obras y commitea', async () => {
        mockConn.query
            .mockResolvedValueOnce([[]]) // feriados
            .mockResolvedValueOnce([[{ id: 594, fecha_ingreso: null, fecha_desvinculacion: null }]]) // trabajadores
            .mockResolvedValueOnce([[]]) // existentes → INSERT
            .mockResolvedValueOnce([{ insertId: 200 }]) // INSERT
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE limpieza
        const registros = [{ trabajador_id: 594, obra_id: 34, fecha: '2026-08-20', estado_id: 2 }];
        // Lunes 2026-08-24 es hábil; usamos jueves 20-08-2026 (hábil).
        const result = await asistenciaService.bulkCreate(34, registros, 99, {});
        expect(result[0]).toMatchObject({ action: 'created', id: 200 });

        const deleteCall = mockConn.query.mock.calls.find(c => /DELETE a FROM asistencias/.test(c[0]));
        expect(deleteCall).toBeTruthy();
        expect(deleteCall[1]).toEqual([594, '2026-08-20', 34, 200]);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
    });
});

describe('getAlertasFaltas — atribución por obra del registro + fila vigente', () => {
    beforeEach(() => jest.clearAllMocks());

    test('la query filtra por a.obra_id y excluye F con fila más nueva en otra obra', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 2 }]]) // estado F
            .mockResolvedValueOnce([[]]);          // faltas
        await asistenciaService.getAlertasFaltas(32, 8, 2026);
        const faltasSql = db.query.mock.calls[1][0];
        expect(faltasSql).toMatch(/a\.obra_id = \?/);
        expect(faltasSql).not.toMatch(/t\.obra_id = \?/);
        expect(faltasSql).toMatch(/NOT EXISTS/);
    });
});

describe('Excel global con duplicado cross-obra', () => {
    beforeEach(() => jest.clearAllMocks());

    test('la celda del día muestra la fila vigente (F) y DESCUENTOS la lista', async () => {
        const mockWorkers = [{
            id: 594, rut: '17.281.879-K', nombres: 'CRISTIAN', apellido_paterno: 'GARCIA',
            apellido_materno: 'ARANCIBIA', empresa_nombre: 'LOLS EMPRESAS DE INGENIERIA LTDA',
            activo: 1, obra_id: 34,
        }];
        const mockEstados = [
            { id: 1, codigo: 'A', nombre: 'Asiste', color: '#34C759', activo: 1, es_presente: 1, cuenta_dia_trabajado: 1 },
            { id: 2, codigo: 'F', nombre: 'Falta', color: '#FF3B30', activo: 1, es_presente: 0, cuenta_dia_trabajado: 0 },
        ];
        // Jueves 20-08-2026: duplicado A(obra 32, id 100) + F(obra 34, id 200).
        const mockRegistros = [
            fila({ id: 100, obra_id: 32, estado_id: 1, estado_codigo: 'A' }),
            fila({ id: 200, obra_id: 34, estado_id: 2, estado_codigo: 'F' }),
        ];
        db.query.mockImplementation((sql) => {
            if (sql.includes('FROM trabajadores')) return Promise.resolve([mockWorkers]);
            if (sql.includes('FROM estados_asistencia')) return Promise.resolve([mockEstados]);
            if (sql.includes('FROM asistencias')) return Promise.resolve([mockRegistros]);
            return Promise.resolve([[]]);
        });

        const buffer = await asistenciaService.generarExcel({ fecha_inicio: '2026-08-01', fecha_fin: '2026-08-31' });
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(buffer);
        const ws = wb.worksheets.find(w => w.name.toLowerCase().includes('lols'));

        // Día 20 → col = 9 + 19 + 2 (Q1 + DESC Q1 intercaladas tras el día 15) = 30
        const celda20 = ws.getCell(9, 30);
        expect(celda20.value).toBe('F');

        // DESC Q2 (col 43) lista la falta del jueves 20
        const descQ2 = String(ws.getCell(9, 43).value || '');
        expect(descQ2).toContain('F: jueves 20');
    });
});

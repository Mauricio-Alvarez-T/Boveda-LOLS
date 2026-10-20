jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const pool = require('../src/config/db');
const service = require('../src/services/inicioAsistencia.service');
const { hoyChile, sumarDias } = require('../src/utils/fechaChile');

/**
 * Detalle «Asistencia» del Inicio, fase 2 (2026-10-20): próximos 14 días, descuentos del mes y horas
 * extra por obra, cada bloque con su permiso.
 */
describe('inicioAsistencia.getDetalle', () => {
    const TODOS = ['asistencia.ver', 'asistencia.periodo.ver', 'asistencia.exportar_excel', 'asistencia.horas_extra.ver'];

    afterEach(() => {
        pool.query.mockReset();
        pool.query.mockResolvedValue([[]]);
    });

    test('rango del mes', () => {
        expect(service._internal.rangoMes('2026-02-10')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
        expect(service._internal.rangoMes('2026-10-20')).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
    });

    test('sin permisos de pago: descuentos y horas extra no se consultan', async () => {
        const r = await service.getDetalle(null, ['asistencia.ver']);
        expect(r.descuentos).toBeNull();
        expect(r.horasExtra).toBeNull();
        const sqls = pool.query.mock.calls.map(([sql]) => sql);
        expect(sqls.some(s => s.includes('horas_extra'))).toBe(false);
        expect(sqls.some(s => s.includes('cuenta_dia_trabajado'))).toBe(false);
        // Sin asistencia.periodo.ver tampoco se leen períodos; los feriados sí.
        expect(sqls.some(s => s.includes('periodos_ausencia'))).toBe(false);
        expect(sqls.some(s => s.includes('FROM feriados'))).toBe(true);
    });

    test('próximos: inicio y término de períodos dentro de 14 días, feriados primero el mismo día', async () => {
        const hoy = hoyChile();
        const d = (n) => sumarDias(hoy, n);
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('periodos_ausencia')) {
                return [[
                    { id: 1, inicio: d(-5), fin: d(2), codigo: 'LM', estado: 'Licencia Médica', trabajador_id: 7, rut: '7-0', nombres: 'Jorge', apellido_paterno: 'Rivera', obra: 'TOESCA' },
                    { id: 2, inicio: d(6), fin: d(20), codigo: 'V', estado: 'Vacaciones', trabajador_id: 8, rut: '8-0', nombres: 'Álvaro', apellido_paterno: 'Cortés', obra: 'DOMEYKO' },
                ]];
            }
            if (sql.includes('FROM feriados')) return [[{ fecha: d(2), nombre: 'Feriado X', irrenunciable: 0 }]];
            return [[]];
        });

        const r = await service.getDetalle(null, TODOS);
        expect(r.proximos.eventos.map(e => [e.tipo, e.fecha])).toEqual([
            ['feriado', d(2)], ['fin', d(2)], ['inicio', d(6)],
        ]);
        expect(r.proximos.eventos[1].vuelve).toBe(d(3));
        expect(r.proximos.eventos[2].hasta).toBe(d(20));
    });

    test('descuentos: suma días que no se pagan, JI aparte, F primero en las columnas', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('cuenta_dia_trabajado')) {
                return [[
                    { trabajador_id: 1, rut: '1-9', nombres: 'Pedro', apellido_paterno: 'Muñoz', codigo: 'F', dias: 3 },
                    { trabajador_id: 2, rut: '2-7', nombres: 'Jorge', apellido_paterno: 'Rivera', codigo: 'LM', dias: 8 },
                    { trabajador_id: 1, rut: '1-9', nombres: 'Pedro', apellido_paterno: 'Muñoz', codigo: 'PSG', dias: 1 },
                    { trabajador_id: 3, rut: '3-5', nombres: 'Ana', apellido_paterno: 'Pérez', codigo: 'JI', dias: 2 },
                ]];
            }
            return [[]];
        });

        const r = await service.getDetalle(null, TODOS);
        expect(r.descuentos.columnas).toEqual(['F', 'LM', 'PSG']);
        expect(r.descuentos.lista.map(t => [t.apellido_paterno, t.total, t.ji])).toEqual([
            ['Rivera', 8, 0], ['Muñoz', 4, 0], ['Pérez', 0, 2],
        ]);
        expect(r.descuentos).toMatchObject({ trabajadores: 3, dias: 12 });
    });

    test('horas extra por obra con total; con obra elegida filtra por la obra del registro', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('SUM(a.horas_extra)')) {
                return [[{ obra_id: 1, obra: 'TOESCA', horas: '186.5', trabajadores: 12 }, { obra_id: 2, obra: 'DOMEYKO', horas: '42', trabajadores: 4 }]];
            }
            return [[]];
        });

        const r = await service.getDetalle(5, TODOS);
        expect(r.horasExtra.total).toBe(228.5);
        expect(r.horasExtra.porObra[0]).toEqual({ obra_id: 1, obra: 'TOESCA', horas: 186.5, trabajadores: 12 });
        const [sql, params] = pool.query.mock.calls.find(([s]) => s.includes('SUM(a.horas_extra)'));
        expect(sql).toContain('AND a.obra_id = ?');
        expect(params[params.length - 1]).toBe(5);
    });

    test('inicio de mes hacia atrás cruza años', () => {
        expect(service._internal.inicioMesAtras('2026-02-15', 5)).toBe('2025-09-01');
        expect(service._internal.inicioMesAtras('2026-10-20', 0)).toBe('2026-10-01');
    });

    test('tendencia: siempre 6 meses, los sin datos en null, el actual parcial; sin vacaciones ni fines de semana', async () => {
        const mesActual = hoyChile().slice(0, 7);
        const mesAnterior = service._internal.inicioMesAtras(hoyChile(), 1).slice(0, 7);
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes("DATE_FORMAT(a.fecha, '%Y-%m') AS mes")) {
                return [[
                    { mes: mesAnterior, registros: 1000, ausencias: 39, faltas: 12 },
                    { mes: mesActual, registros: 500, ausencias: 22, faltas: 9 },
                ]];
            }
            return [[]];
        });

        const r = await service.getDetalle(null, ['asistencia.ver']);
        expect(r.tendencia).toHaveLength(6);
        expect(r.tendencia[0].tasa).toBeNull();
        expect(r.tendencia[4]).toMatchObject({ mes: mesAnterior, tasa: 3.9, tasaFaltas: 1.2, parcial: false });
        expect(r.tendencia[5]).toMatchObject({ mes: mesActual, tasa: 4.4, tasaFaltas: 1.8, parcial: true });
        const [sql] = pool.query.mock.calls.find(([s]) => s.includes("AS mes"));
        expect(sql).toContain("ea.codigo <> 'V'");
        expect(sql).toContain('WEEKDAY(a.fecha) < 5');
    });

    test('faltas por obra con tasa, y patrón viernes/lunes con sus fechas', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('HAVING faltas > 0')) {
                return [[{ obra_id: 1, obra: 'TOESCA', registros: 275, faltas: 14, trabajadores: 9 }]];
            }
            if (sql.includes('DAYOFWEEK(a.fecha) IN (2, 6)')) {
                return [[{ trabajador_id: 4, rut: '4-0', nombres: 'Tomás', apellido_paterno: 'Leiva', obra: 'DOMEYKO', fechas: '2026-09-04,2026-10-05', n: 2 }]];
            }
            return [[]];
        });

        const r = await service.getDetalle(null, ['asistencia.ver']);
        expect(r.faltasObra).toEqual([{ obra_id: 1, obra: 'TOESCA', faltas: 14, registros: 275, trabajadores: 9, tasa: 5.1 }]);
        expect(r.patronFinde).toMatchObject({ dias: 60, minimo: 2 });
        expect(r.patronFinde.lista[0]).toMatchObject({ apellido_paterno: 'Leiva', n: 2, fechas: ['2026-09-04', '2026-10-05'] });
        const [, params] = pool.query.mock.calls.find(([s]) => s.includes('DAYOFWEEK'));
        expect(params[params.length - 1]).toBe(2);
    });

    test('un bloque que falla no tumba a los otros', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('cuenta_dia_trabajado')) throw new Error('boom');
            return [[]];
        });
        const r = await service.getDetalle(null, TODOS);
        expect(r.descuentos).toBeNull();
        expect(r.horasExtra).toEqual({ desde: expect.any(String), hasta: expect.any(String), total: 0, porObra: [] });
        expect(r.proximos.eventos).toEqual([]);
    });
});

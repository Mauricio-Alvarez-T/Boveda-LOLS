jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/utils/fechaChile', () => {
    const real = jest.requireActual('../src/utils/fechaChile');
    // Miércoles 18 de noviembre de 2026.
    return { ...real, hoyChile: () => '2026-11-18' };
});

const pool = require('../src/config/db');
const servicio = require('../src/services/asistenciaSinLista.service');

/**
 * Obras que no pasaron la lista en los días hábiles del último mes (Marcos 2026-11-18): Daphne lo ve en el Inicio y
 * al entrar al otro día.
 */
describe('asistenciaSinLista', () => {
    afterEach(() => {
        pool.query.mockReset();
        pool.query.mockResolvedValue([[]]);
    });

    test('días hábiles del último mes: sin hoy, sin fin de semana ni feriados, del más reciente al más antiguo', async () => {
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('FROM feriados')) return [[{ fecha: '2026-11-13' }]]; // viernes 13: feriado
            return [[]];
        });
        const dias = await servicio._internal.diasHabilesAnteriores('2026-11-18');
        // mar 17, lun 16, (vie 13 feriado), jue 12, mié 11, mar 10…
        expect(dias.slice(0, 5)).toEqual(['2026-11-17', '2026-11-16', '2026-11-12', '2026-11-11', '2026-11-10']);
        // …hasta el lunes 19 de octubre (30 días corridos atrás): 22 hábiles menos el feriado.
        expect(dias[dias.length - 1]).toBe('2026-10-19');
        expect(dias).toHaveLength(21);
        expect(dias).not.toContain('2026-11-14'); // sábado
        const [, params] = pool.query.mock.calls.find(([s]) => s.includes('FROM feriados'));
        expect(params).toEqual(['2026-10-19', '2026-11-17']);
    });

    test('«pasó la lista»: filas propias, o fila para toda la dotación; solo licencias no cuenta', () => {
        const { paso } = servicio._internal;
        expect(paso({ registros: 0, propios: 0, dotacion: 12 })).toBe(false);
        expect(paso({ registros: 2, propios: 0, dotacion: 12 })).toBe(false);
        expect(paso({ registros: 12, propios: 11, dotacion: 12 })).toBe(true);
        expect(paso({ registros: 3, propios: 0, dotacion: 3 })).toBe(true);
    });

    test('junta por obra los días sin lista y los guardados, dice qué pasó y quién guardó la última', async () => {
        pool.query.mockImplementation(async (sql, params) => {
            if (sql.includes('FROM feriados')) return [[]];
            if (sql.includes('CROSS JOIN')) {
                return [[
                    // DOMEYKO: ayer nadie pasó la lista; anteayer solo estaban las licencias.
                    { obra_id: 7, obra: 'DOMEYKO', encargado: 'Pedro Soto', asistencia_desde: '2026-09-01', fecha: '2026-11-17', registros: 0, propios: 0, dotacion: 20 },
                    { obra_id: 7, obra: 'DOMEYKO', encargado: 'Pedro Soto', fecha: '2026-11-16', registros: 2, propios: 0, dotacion: 20 },
                    { obra_id: 7, obra: 'DOMEYKO', encargado: 'Pedro Soto', fecha: '2026-11-13', registros: 20, propios: 18, dotacion: 20 },
                    // GORBEA: ayer sin lista.
                    { obra_id: 9, obra: 'GORBEA', encargado: null, fecha: '2026-11-17', registros: 0, propios: 0, dotacion: 8 },
                    // ULA: todo guardado.
                    { obra_id: 3, obra: 'ULA', encargado: null, fecha: '2026-11-17', registros: 15, propios: 15, dotacion: 15 },
                    // Obra sin trabajadores ese día: no cuenta.
                    { obra_id: 4, obra: 'NUEVA', encargado: null, fecha: '2026-11-17', registros: 0, propios: 0, dotacion: 0 },
                ]];
            }
            if (sql.includes('LIMIT 1')) {
                return params[0] === 7
                    ? [[{ fecha: '2026-11-13', por: 'Pedro Soto' }]]
                    : [[]];
            }
            return [[]];
        });

        const r = await servicio.getSinLista();

        expect(r.hoy).toBe('2026-11-18');
        expect(r.desde).toBe('2026-10-19');
        expect(r.dias[0]).toBe('2026-11-17');
        expect(r.obras.map(o => o.obra)).toEqual(['DOMEYKO', 'GORBEA']);
        expect(r.obras[0]).toEqual({
            obra_id: 7, obra: 'DOMEYKO', encargado: 'Pedro Soto', asistencia_desde: '2026-09-01', dotacion: 20,
            dias: [
                { fecha: '2026-11-17', motivo: 'nadie', registros: 0 },
                { fecha: '2026-11-16', motivo: 'solo_periodos', registros: 2 },
            ],
            guardadas: ['2026-11-13'],
            ultima: { fecha: '2026-11-13', por: 'Pedro Soto' },
        });
        expect(r.obras[1].ultima).toBeNull();
        expect(r.obras[1].guardadas).toEqual([]);

        const [sql] = pool.query.mock.calls.find(([s]) => s.includes('CROSS JOIN'));
        expect(sql).toContain('o.participa_asistencia = 1');
        // Una obra «En preparación» (sin fecha) no cuenta; una que pasa lista, solo desde ese día (mig 156).
        expect(sql).toContain('o.asistencia_desde IS NOT NULL AND o.asistencia_desde <= d.fecha');
        expect(sql).toContain('FROM periodos_ausencia p');
        expect(sql).not.toContain('AND o.id = ?');
    });

    test('con obra elegida filtra por ella', async () => {
        await servicio.getSinLista(7);
        const [sql, params] = pool.query.mock.calls.find(([s]) => s.includes('CROSS JOIN'));
        expect(sql).toContain('AND o.id = ?');
        expect(params[params.length - 1]).toBe(7);
    });
});

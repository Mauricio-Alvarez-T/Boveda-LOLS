jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn(),
    }),
}));

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

describe('asistenciaService.batchSave (P1.1)', () => {
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    test('retorna [] si no hay registros', async () => {
        const result = await asistenciaService.batchSave([], 1, {});
        expect(result).toEqual([]);
        expect(mockConn.beginTransaction).not.toHaveBeenCalled();
    });

    test('rechaza registros sin trabajador_id / obra_id / fecha', async () => {
        await expect(
            asistenciaService.batchSave([{ estado_id: 1 }], 1, {})
        ).rejects.toThrow(/trabajador_id, obra_id y fecha/);

        await expect(
            asistenciaService.batchSave([{ trabajador_id: 1, obra_id: 2, fecha: '2026-04-20' }], 1, {})
        ).rejects.toThrow(/estado_id/);
    });

    test('hace upsert multi-obra en una sola transacción (INSERT para nuevos)', async () => {
        // Pre-fetch sequence en bulkCreate con obraId='ALL':
        //  1) SELECT feriados
        //  2) SELECT trabajadores (rango laboral)
        //  3) SELECT existentes (IN-tuple) — devolvemos vacío => ambos INSERT
        //  4) INSERT #1
        //  5) INSERT #2
        mockConn.query
            .mockResolvedValueOnce([[]]) // feriados
            .mockResolvedValueOnce([[
                { id: 1, fecha_ingreso: null, fecha_desvinculacion: null },
                { id: 2, fecha_ingreso: null, fecha_desvinculacion: null },
            ]]) // trabajadores
            .mockResolvedValueOnce([[]]) // existentes
            .mockResolvedValueOnce([{ insertId: 100 }])
            .mockResolvedValueOnce([{ insertId: 101 }]);

        const registros = [
            {
                trabajador_id: 1, obra_id: 10, fecha: '2026-04-20',
                estado_id: 1, hora_entrada: '08:00', hora_salida: '18:00'
            },
            {
                trabajador_id: 2, obra_id: 11, fecha: '2026-04-20',
                estado_id: 1, hora_entrada: '08:00', hora_salida: '18:00'
            },
        ];

        const result = await asistenciaService.batchSave(registros, 99, {});

        expect(mockConn.beginTransaction).toHaveBeenCalledTimes(1);
        expect(mockConn.commit).toHaveBeenCalledTimes(1);
        expect(mockConn.rollback).not.toHaveBeenCalled();
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ trabajador_id: 1, action: 'created', id: 100 });
        expect(result[1]).toMatchObject({ trabajador_id: 2, action: 'created', id: 101 });

        // Verificar que los INSERTs respetaron el obra_id por-registro (multi-obra)
        const insertCalls = mockConn.query.mock.calls.filter(c => /INSERT INTO asistencias/.test(c[0]));
        expect(insertCalls).toHaveLength(2);
        expect(insertCalls[0][1]).toEqual(expect.arrayContaining([1, 10, '2026-04-20']));
        expect(insertCalls[1][1]).toEqual(expect.arrayContaining([2, 11, '2026-04-20']));
    });

    test('rechaza fines de semana (hace rollback)', async () => {
        const registros = [{
            trabajador_id: 1, obra_id: 10, fecha: '2026-04-19', // domingo
            estado_id: 1
        }];
        await expect(
            asistenciaService.batchSave(registros, 1, {})
        ).rejects.toThrow(/fines de semana/);
        expect(mockConn.rollback).toHaveBeenCalled();
    });
});

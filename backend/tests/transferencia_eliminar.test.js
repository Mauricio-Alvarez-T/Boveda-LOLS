/**
 * Tests del hard delete de transferencias y diferencias (bajo permiso
 * inventario.transferencias.eliminar). Borra el registro y, por FK CASCADE,
 * sus hijos. NO toca stock (decisión de producto: purgar datos de prueba).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const transferenciaService = require('../src/services/transferencia.service');
const db = require('../src/config/db');

function makeConn() {
    return {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
    };
}

describe('eliminar() — hard delete de transferencia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('borra la transferencia (DELETE) y commitea; NO toca stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query
            .mockResolvedValueOnce([[{ id: 22, codigo: 'TRF-202605-0003', estado: 'recibida' }]]) // SELECT FOR UPDATE
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // DELETE FROM transferencias

        const result = await transferenciaService.eliminar(22, 77);

        const delCalls = conn.query.mock.calls.filter(c => /DELETE FROM transferencias WHERE id/.test(c[0]));
        expect(delCalls).toHaveLength(1);
        // NO debe tocar stock
        const stockCalls = conn.query.mock.calls.filter(c => /ubicaciones_stock|stock_movimientos/.test(c[0]));
        expect(stockCalls).toHaveLength(0);
        expect(conn.commit).toHaveBeenCalled();
        expect(result).toMatchObject({ id: 22, codigo: 'TRF-202605-0003' });
    });

    test('404 si la transferencia no existe → rollback', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[]]); // SELECT vacío

        await expect(transferenciaService.eliminar(999, 77)).rejects.toMatchObject({ statusCode: 404 });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });
});

describe('eliminarDiscrepancia() — hard delete de una diferencia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('borra la fila de discrepancia (DELETE), sin tocar stock', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 9, transferencia_id: 22 }]]) // SELECT
            .mockResolvedValueOnce([{ affectedRows: 1 }]);              // DELETE

        const result = await transferenciaService.eliminarDiscrepancia(9, 77);

        const delCalls = db.query.mock.calls.filter(c => /DELETE FROM transferencia_discrepancias WHERE id/.test(c[0]));
        expect(delCalls).toHaveLength(1);
        expect(result).toMatchObject({ id: 9 });
    });

    test('404 si la diferencia no existe', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(transferenciaService.eliminarDiscrepancia(999, 77)).rejects.toMatchObject({ statusCode: 404 });
    });
});

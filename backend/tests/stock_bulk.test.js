/**
 * Tests Ola 3 — bulkAdjust de stock (ubicaciones_stock).
 *
 * Casos:
 *   · happy path mixto: 1 ítem existente (update) + 1 nuevo (insert) → counters correctos
 *   · cap 413: > MAX_ITEMS sin tocar DB
 *   · validación: duplicado (misma item+ubicación dos veces) rechazado
 *   · rollback: si segundo UPDATE falla → rollback + first insert/update descartado
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));
jest.mock('../src/utils/logger-structured', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

const svc = require('../src/services/stockBulk.service');
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

describe('stockBulk.bulkAdjust', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy mixto: 1 update + 1 insert → updated=1, created=1, diff=2', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // Ajuste 1: SELECT existente (item=5, bodega=2) → encontrado
            .mockResolvedValueOnce([[{ id: 77, cantidad: 10, valor_arriendo_override: null }]])
            // UPDATE
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // Ajuste 2: SELECT (item=6, obra=9) → no existe
            .mockResolvedValueOnce([[]])
            // INSERT
            .mockResolvedValueOnce([{ insertId: 201, affectedRows: 1 }]);

        const result = await svc.bulkAdjust([
            { item_id: 5, bodega_id: 2, cantidad: 25 },
            { item_id: 6, obra_id: 9, cantidad: 3, valor_arriendo_override: 150 },
        ], 42);

        expect(result.updated).toBe(1);
        expect(result.created).toBe(1);
        expect(result.diff).toHaveLength(2);

        const updDiff = result.diff.find(d => d.action === 'update');
        expect(updDiff).toBeDefined();
        expect(updDiff.changed.cantidad).toEqual({ from: 10, to: 25 });

        const insDiff = result.diff.find(d => d.action === 'create');
        expect(insDiff.stock_id).toBe(201);
        expect(insDiff.changed.cantidad).toEqual({ from: null, to: 3 });
        expect(insDiff.changed.valor_arriendo_override).toEqual({ from: null, to: 150 });

        expect(conn.commit).toHaveBeenCalled();
        expect(conn.rollback).not.toHaveBeenCalled();
    });

    test('cap 413: supera MAX_ITEMS → .status=413 sin getConnection', async () => {
        const tooMany = Array.from({ length: svc.MAX_ITEMS + 1 }, (_, i) => ({
            item_id: i + 1, bodega_id: 1, cantidad: 0,
        }));

        await expect(svc.bulkAdjust(tooMany, 1)).rejects.toMatchObject({ status: 413 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('validación: duplicado (mismo item+ubicación) → rechaza antes de transacción', async () => {
        await expect(svc.bulkAdjust([
            { item_id: 5, bodega_id: 2, cantidad: 10 },
            { item_id: 5, bodega_id: 2, cantidad: 20 },
        ], 1)).rejects.toThrow(/duplicado/i);

        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('rollback: si segundo UPDATE afecta 0 filas → rollback + error', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // Ajuste 1: OK
            .mockResolvedValueOnce([[{ id: 1, cantidad: 5, valor_arriendo_override: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // Ajuste 2: SELECT existe pero UPDATE falla
            .mockResolvedValueOnce([[{ id: 2, cantidad: 8, valor_arriendo_override: null }]])
            .mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(svc.bulkAdjust([
            { item_id: 10, bodega_id: 1, cantidad: 100 },
            { item_id: 11, bodega_id: 1, cantidad: 200 },
        ], 1)).rejects.toThrow(/UPDATE sin efecto/);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('validación: obra_id y bodega_id ambos seteados → rechaza', async () => {
        await expect(svc.bulkAdjust([
            { item_id: 1, obra_id: 2, bodega_id: 3, cantidad: 1 },
        ], 1)).rejects.toThrow(/no puede tener obra_id y bodega_id/);
    });
});

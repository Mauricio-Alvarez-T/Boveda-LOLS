/**
 * Tests Ola 3 — bulkUpdate de ítems de inventario.
 *
 * 3 casos clave según handoff:
 *   · happy path: N ítems válidos → updated === N, diff registra cambios
 *   · cap 413: > MAX_ITEMS → error con .status=413 sin tocar DB
 *   · rollback: si un UPDATE falla → rollback() y propaga
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

const svc = require('../src/services/itemInventarioBulk.service');
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

describe('itemInventarioBulk.bulkUpdate', () => {
    beforeEach(() => jest.clearAllMocks());

    test('happy path: 2 ítems válidos → updated=2 + diff refleja cambios reales', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        // SELECT FOR UPDATE → estado actual
        conn.query
            .mockResolvedValueOnce([[
                { id: 1, categoria_id: 10, descripcion: 'Viejo A', m2: null, valor_compra: 100, valor_arriendo: 5, unidad: 'u', es_consumible: 0, propietario: 'lols', activo: 1 },
                { id: 2, categoria_id: 10, descripcion: 'Viejo B', m2: null, valor_compra: 200, valor_arriendo: 10, unidad: 'u', es_consumible: 0, propietario: 'lols', activo: 1 },
            ]])
            // UPDATE item 1
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE item 2
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await svc.bulkUpdate([
            { id: 1, descripcion: 'Nuevo A', valor_arriendo: 7 },
            { id: 2, propietario: 'dedalius' },
        ], 99);

        expect(result.updated).toBe(2);
        expect(result.diff).toHaveLength(2);

        const d1 = result.diff.find(d => d.id === 1);
        expect(d1.changed.descripcion).toEqual({ from: 'Viejo A', to: 'Nuevo A' });
        expect(d1.changed.valor_arriendo).toEqual({ from: 5, to: 7 });

        const d2 = result.diff.find(d => d.id === 2);
        expect(d2.changed.propietario).toEqual({ from: 'lols', to: 'dedalius' });

        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.rollback).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('cap 413: payload de MAX_ITEMS+1 → error con .status=413 y NO abre transacción', async () => {
        // No mockeamos getConnection — debe fallar antes de llegar a abrirla
        const tooMany = Array.from({ length: svc.MAX_ITEMS + 1 }, (_, i) => ({
            id: i + 1, descripcion: `x${i}`,
        }));

        await expect(svc.bulkUpdate(tooMany, 99)).rejects.toMatchObject({
            status: 413,
        });

        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('rollback: si un UPDATE devuelve 0 filas afectadas → rollback + error', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT FOR UPDATE → ambos ítems existen
            .mockResolvedValueOnce([[
                { id: 1, categoria_id: 10, descripcion: 'A', m2: null, valor_compra: 100, valor_arriendo: 5, unidad: 'u', es_consumible: 0, propietario: 'lols', activo: 1 },
                { id: 2, categoria_id: 10, descripcion: 'B', m2: null, valor_compra: 200, valor_arriendo: 10, unidad: 'u', es_consumible: 0, propietario: 'lols', activo: 1 },
            ]])
            // UPDATE item 1 OK
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE item 2 falla (0 filas) — simula carrera / corrupción
            .mockResolvedValueOnce([{ affectedRows: 0 }]);

        await expect(svc.bulkUpdate([
            { id: 1, descripcion: 'A nuevo' },
            { id: 2, descripcion: 'B nuevo' },
        ], 99)).rejects.toThrow(/UPDATE sin efecto/);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });
});

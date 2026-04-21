/**
 * Tests para Ola 2 — Fase 1:
 *   · cambio semántico stock (se mueve al recibir)
 *   · flag stock_reconciliado (régimen nuevo vs legacy)
 *   · nuevos flujos: pushDirecto, intraBodega, devolucion
 *
 * Usa el mismo pattern de mocks que transferencia_aprobacion_parcial.test.js.
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

describe('recibir() — régimen nuevo vs legacy', () => {
    beforeEach(() => jest.clearAllMocks());

    test('1) régimen nuevo (stock_reconciliado=TRUE): decrementa origen por splits + aumenta destino', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'en_transito', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
        };

        conn.query
            // SELECT transferencias
            .mockResolvedValueOnce([[trfRow]])
            // SELECT transferencia_items (dbItems)
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 3, origen_obra_id: null, origen_bodega_id: 2 }]])
            // SELECT splits for item 200
            .mockResolvedValueOnce([[{ origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 3 }]])
            // UPDATE ubicaciones_stock (decremento origen)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencia_items cantidad_recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT ubicaciones_stock destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencias → recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.recibir(100, 77, [
            { item_id: 5, cantidad_recibida: 3 },
        ]);

        // Debe haber 1 decremento (GREATEST) en origen bodega=2
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(1);
        expect(decrementCalls[0][1]).toEqual([3, 5, null, 2]);

        // Debe haber 1 incremento (INSERT ... ON DUPLICATE KEY) en destino
        const incrementCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(incrementCalls).toHaveLength(1);
        expect(incrementCalls[0][1]).toEqual([5, 9, null, 3]);

        expect(conn.commit).toHaveBeenCalled();
    });

    test('2) régimen legacy (stock_reconciliado=FALSE): solo aumenta destino, NO decrementa origen', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 101, estado: 'en_transito', stock_reconciliado: 0,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            .mockResolvedValueOnce([[{ id: 201, item_id: 5, cantidad_enviada: 3, origen_obra_id: null, origen_bodega_id: 2 }]])
            // NO hay SELECT splits — régimen legacy salta decremento
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE → recibida

        await transferenciaService.recibir(101, 77, [
            { item_id: 5, cantidad_recibida: 3 },
        ]);

        // NO debe haber UPDATE GREATEST (decremento)
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(0);

        // Sí el incremento destino
        const incrementCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(incrementCalls).toHaveLength(1);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('aprobar() — Ola 2 no decrementa stock', () => {
    beforeEach(() => jest.clearAllMocks());

    test('3) aprobar ya NO decrementa stock (regresión Ola 2)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ id: 10, item_id: 1, cantidad_solicitada: 2 }]])
            .mockResolvedValueOnce([[{ cantidad: 10 }]])  // stock check (sanity)
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE transferencias
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE transferencia_items
            .mockResolvedValueOnce([{ affectedRows: 0 }])  // DELETE origenes previos
            .mockResolvedValueOnce([{ insertId: 1 }]);     // INSERT origen (split)

        await transferenciaService.aprobar(5, 99, {
            items: [{ item_id: 1, splits: [{ origen_obra_id: 1, origen_bodega_id: null, cantidad: 2 }] }],
        });

        // No debe haber ningún UPDATE GREATEST (decremento de stock)
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(0);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('rechazar() — legacy revierte, régimen nuevo no', () => {
    beforeEach(() => jest.clearAllMocks());

    test('4) rechazar transferencia nueva (stock_reconciliado=TRUE + aprobada) NO toca stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'aprobada', origen_obra_id: null, origen_bodega_id: 2, stock_reconciliado: 1 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE → rechazada

        await transferenciaService.rechazar(200, 99, 'motivo cualquiera');

        // No debe haber ningún INSERT ON DUPLICATE KEY (reversión)
        const reversionCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(reversionCalls).toHaveLength(0);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('5) rechazar transferencia legacy (stock_reconciliado=FALSE + aprobada) SÍ revierte stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'aprobada', origen_obra_id: null, origen_bodega_id: 2, stock_reconciliado: 0 }]])
            // _reversarStockAprobada: SELECT items
            .mockResolvedValueOnce([[{ id: 50, item_id: 7, cantidad_enviada: 2, origen_obra_id: null, origen_bodega_id: 2 }]])
            // SELECT splits
            .mockResolvedValueOnce([[{ origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 2 }]])
            // INSERT ubicaciones_stock (reversión)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencias → rechazada
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.rechazar(201, 99, 'motivo');

        const reversionCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(reversionCalls).toHaveLength(1);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('pushDirecto()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('6) crea transferencia en_transito sin aprobación, con splits y tipo_flujo=push_directo', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]); // _generarCodigo

        conn.query
            // SELECT stock (bodega origen)
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            // INSERT transferencias
            .mockResolvedValueOnce([{ insertId: 300 }])
            // INSERT transferencia_items
            .mockResolvedValueOnce([{ insertId: 400 }])
            // INSERT transferencia_item_origenes
            .mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await transferenciaService.pushDirecto({
            origen_bodega_id: 2,
            destino_obra_id: 9,
            items: [{ item_id: 5, cantidad: 3 }],
        }, 77);

        expect(res).toMatchObject({ id: 300, estado: 'en_transito' });

        const trfInsert = conn.query.mock.calls.find(c => /INSERT INTO transferencias/.test(c[0]));
        expect(trfInsert[0]).toMatch(/'push_directo'/);
        expect(trfInsert[0]).toMatch(/'en_transito'/);

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('intraBodega()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('7) crea transferencia recibida en misma tx + mueve stock atómicamente', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]);

        conn.query
            // SELECT stock bodega origen
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            // INSERT transferencias
            .mockResolvedValueOnce([{ insertId: 500 }])
            // INSERT transferencia_items
            .mockResolvedValueOnce([{ insertId: 600 }])
            // INSERT transferencia_item_origenes
            .mockResolvedValueOnce([{ insertId: 1 }])
            // UPDATE stock origen (decremento)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT stock destino (incremento upsert)
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const res = await transferenciaService.intraBodega({
            origen_bodega_id: 2,
            destino_bodega_id: 3,
            items: [{ item_id: 5, cantidad: 4 }],
        }, 77);

        expect(res).toMatchObject({ id: 500, estado: 'recibida' });

        const trfInsert = conn.query.mock.calls.find(c => /INSERT INTO transferencias/.test(c[0]));
        expect(trfInsert[0]).toMatch(/'intra_bodega'/);
        expect(trfInsert[0]).toMatch(/'recibida'/);

        // Debe haber 1 decremento y 1 incremento
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(1);
        const upsertCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(upsertCalls).toHaveLength(1);

        expect(conn.commit).toHaveBeenCalled();
    });

    test('intra-bodega con stock insuficiente → rollback', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query.mockResolvedValueOnce([[{ cantidad: 1 }]]); // disponible=1, requerido=4

        await expect(transferenciaService.intraBodega({
            origen_bodega_id: 2,
            destino_bodega_id: 3,
            items: [{ item_id: 5, cantidad: 4 }],
        }, 77)).rejects.toThrow(/Stock insuficiente/);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });
});

describe('devolucion()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('8) crea transferencia pendiente con tipo_flujo=devolucion, origen=obra, destino=bodega', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]);

        conn.query
            // SELECT stock obra origen
            .mockResolvedValueOnce([[{ total: 10, descripcion: 'Ítem X' }]])
            // INSERT transferencias
            .mockResolvedValueOnce([{ insertId: 700 }])
            // INSERT transferencia_items
            .mockResolvedValueOnce([{ insertId: 800 }]);

        const res = await transferenciaService.devolucion({
            origen_obra_id: 15,
            destino_bodega_id: 2,
            items: [{ item_id: 5, cantidad: 3 }],
            motivo: 'cierre de obra',
        }, 77);

        expect(res).toMatchObject({ id: 700 });

        const trfInsert = conn.query.mock.calls.find(c => /INSERT INTO transferencias/.test(c[0]));
        expect(trfInsert).toBeDefined();
        // params: codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
        //         solicitante_id, observaciones, requiere_pionetas, cantidad_pionetas,
        //         tipo_flujo, motivo
        expect(trfInsert[1][1]).toBe(15);          // origen_obra_id
        expect(trfInsert[1][2]).toBe(null);        // origen_bodega_id
        expect(trfInsert[1][3]).toBe(null);        // destino_obra_id
        expect(trfInsert[1][4]).toBe(2);           // destino_bodega_id
        expect(trfInsert[1][9]).toBe('devolucion'); // tipo_flujo
        expect(trfInsert[1][10]).toBe('cierre de obra'); // motivo

        expect(conn.commit).toHaveBeenCalled();
    });
});

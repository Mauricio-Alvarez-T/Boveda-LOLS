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

// ============================================================
// Fase 2 — 4 flujos/acciones restantes
// ============================================================

describe('intraObra() — Fase 2', () => {
    beforeEach(() => jest.clearAllMocks());

    test('10) crea transferencia pendiente con tipo_flujo=intra_obra, origen y destino = obras distintas', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]);

        conn.query
            // SELECT stock obra origen (validación por obra)
            .mockResolvedValueOnce([[{ total: 8, descripcion: 'Ítem X' }]])
            // INSERT transferencias
            .mockResolvedValueOnce([{ insertId: 900 }])
            // INSERT transferencia_items
            .mockResolvedValueOnce([{ insertId: 901 }]);

        const res = await transferenciaService.intraObra({
            origen_obra_id: 11,
            destino_obra_id: 22,
            items: [{ item_id: 5, cantidad: 3 }],
            motivo: 'traslado entre obras',
        }, 77);

        expect(res).toMatchObject({ id: 900 });

        const trfInsert = conn.query.mock.calls.find(c => /INSERT INTO transferencias/.test(c[0]));
        expect(trfInsert).toBeDefined();
        // params: codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
        //         solicitante_id, observaciones, requiere_pionetas, cantidad_pionetas,
        //         tipo_flujo, motivo
        expect(trfInsert[1][1]).toBe(11);              // origen_obra_id
        expect(trfInsert[1][2]).toBe(null);            // origen_bodega_id
        expect(trfInsert[1][3]).toBe(22);              // destino_obra_id
        expect(trfInsert[1][4]).toBe(null);            // destino_bodega_id
        expect(trfInsert[1][9]).toBe('intra_obra');    // tipo_flujo
        expect(trfInsert[1][10]).toBe('traslado entre obras');

        // El stock se valida por obra (no global)
        const stockCheck = conn.query.mock.calls.find(c =>
            /FROM ubicaciones_stock/.test(c[0]) && /obra_id = \? AND bodega_id IS NULL/.test(c[0])
        );
        expect(stockCheck).toBeDefined();

        expect(conn.commit).toHaveBeenCalled();
    });

    test('intra_obra con origen = destino → rechaza', async () => {
        await expect(transferenciaService.intraObra({
            origen_obra_id: 11,
            destino_obra_id: 11,
            items: [{ item_id: 5, cantidad: 3 }],
        }, 77)).rejects.toThrow(/distintas/);
    });
});

describe('ordenGerencia() — Fase 2', () => {
    beforeEach(() => jest.clearAllMocks());

    test('11) sin motivo → error de validación, no abre conexión', async () => {
        await expect(transferenciaService.ordenGerencia({
            origen_bodega_id: 2,
            destino_obra_id: 9,
            items: [{ item_id: 5, cantidad: 3 }],
        }, 77)).rejects.toThrow(/motivo/i);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('11b) con motivo → crea en_transito con tipo_flujo=orden_gerencia, aprobador=transportista=userId', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]);

        conn.query
            // SELECT stock bodega origen
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            // INSERT transferencias
            .mockResolvedValueOnce([{ insertId: 1000 }])
            // INSERT transferencia_items
            .mockResolvedValueOnce([{ insertId: 1001 }])
            // INSERT transferencia_item_origenes
            .mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await transferenciaService.ordenGerencia({
            origen_bodega_id: 2,
            destino_obra_id: 9,
            items: [{ item_id: 5, cantidad: 3 }],
            motivo: '  urgencia PM  ',
        }, 77);

        expect(res).toMatchObject({ id: 1000, estado: 'en_transito' });

        const trfInsert = conn.query.mock.calls.find(c => /INSERT INTO transferencias/.test(c[0]));
        expect(trfInsert[0]).toMatch(/'orden_gerencia'/);
        expect(trfInsert[0]).toMatch(/'en_transito'/);
        // params: codigo, origen_obra_id, origen_bodega_id, destino_obra_id, destino_bodega_id,
        //         solicitante_id, aprobador_id, observaciones, motivo
        expect(trfInsert[1][5]).toBe(77);            // solicitante_id
        expect(trfInsert[1][6]).toBe(77);            // aprobador_id = userId
        expect(trfInsert[1][8]).toBe('urgencia PM'); // motivo trimmed

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('rechazar() desde en_transito — Fase 2', () => {
    beforeEach(() => jest.clearAllMocks());

    test('12) régimen nuevo (stock_reconciliado=TRUE) desde en_transito: pasa a rechazada SIN tocar stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT transferencias
            .mockResolvedValueOnce([[{ estado: 'en_transito', origen_obra_id: null, origen_bodega_id: 2, stock_reconciliado: 1 }]])
            // UPDATE transferencias → rechazada
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.rechazar(500, 77, 'material dañado');

        // No debe haber reversas de stock (ni INSERT ON DUPLICATE KEY ni UPDATE stock)
        const stockWrites = conn.query.mock.calls.filter(c =>
            /ubicaciones_stock/.test(c[0])
        );
        expect(stockWrites).toHaveLength(0);

        const updateCall = conn.query.mock.calls.find(c => /UPDATE transferencias SET estado = 'rechazada'/.test(c[0]));
        expect(updateCall).toBeDefined();

        expect(conn.commit).toHaveBeenCalled();
    });

    test('12b) régimen legacy (stock_reconciliado=FALSE) desde en_transito: reversa stock vía helper', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT transferencias (legacy)
            .mockResolvedValueOnce([[{ estado: 'en_transito', origen_obra_id: null, origen_bodega_id: 2, stock_reconciliado: 0 }]])
            // SELECT transferencia_items (para _reversarStockAprobada)
            .mockResolvedValueOnce([[{ id: 777, item_id: 5, cantidad_enviada: 3, origen_obra_id: null, origen_bodega_id: 2 }]])
            // SELECT splits
            .mockResolvedValueOnce([[{ origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 3 }]])
            // INSERT ubicaciones_stock (reversa upsert)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencias → rechazada
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.rechazar(500, 77, 'devuelto al origen');

        // Debe haber exactamente 1 upsert (reversa stock)
        const reversa = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(reversa).toHaveLength(1);
        expect(reversa[0][1]).toEqual([5, null, 2, 3]);

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('cancelar() desde en_transito — Fase 2', () => {
    beforeEach(() => jest.clearAllMocks());

    test('13) régimen nuevo desde en_transito: pasa a cancelada SIN tocar stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT transferencias
            .mockResolvedValueOnce([[{ estado: 'en_transito', solicitante_id: 77, origen_obra_id: null, origen_bodega_id: 2, stock_reconciliado: 1 }]])
            // UPDATE transferencias → cancelada
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.cancelar(600, 77);

        const stockWrites = conn.query.mock.calls.filter(c =>
            /ubicaciones_stock/.test(c[0])
        );
        expect(stockWrites).toHaveLength(0);

        const updateCall = conn.query.mock.calls.find(c => /UPDATE transferencias SET estado = 'cancelada'/.test(c[0]));
        expect(updateCall).toBeDefined();

        expect(conn.commit).toHaveBeenCalled();
    });
});

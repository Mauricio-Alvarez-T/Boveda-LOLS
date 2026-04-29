/**
 * Tests para aprobación parcial + multi-origen de transferencias.
 *
 * El service usa db.getConnection() + conn.beginTransaction/commit/rollback, así
 * que mockeamos getConnection para devolver un "conn" con query/commit/rollback
 * mockeados. Cada test programa la secuencia de respuestas esperadas según el
 * flujo del método (ver transferencia.service.js).
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

describe('transferenciaService.aprobar — parcial + multi-origen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('1) aprobación parcial: envia menos que lo solicitado, decrementa stock y persiste 1 split', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // 1. SELECT estado
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            // 2. SELECT transferencia_items
            .mockResolvedValueOnce([[{ id: 10, item_id: 1, cantidad_solicitada: 2 }]])
            // 3. SELECT ubicaciones_stock (sanity check)
            .mockResolvedValueOnce([[{ cantidad: 1 }]])
            // 4. UPDATE transferencias → aprobada
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // 5. UPDATE transferencia_items (cantidad_enviada = 1)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // 6. DELETE transferencia_item_origenes
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            // 7. INSERT transferencia_item_origenes (split)
            .mockResolvedValueOnce([{ insertId: 1 }]);

        const res = await transferenciaService.aprobar(5, 99, {
            items: [{
                item_id: 1,
                splits: [{ origen_obra_id: 1, origen_bodega_id: null, cantidad: 1 }],
            }],
        });

        expect(res).toEqual({ id: 5, estado: 'aprobada' });
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.rollback).not.toHaveBeenCalled();

        // Ola 2: aprobar NO decrementa stock (eso ocurre al recibir)
        const stockCall = conn.query.mock.calls.find(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(stockCall).toBeUndefined();

        // Sí persiste el split
        const splitInsert = conn.query.mock.calls.find(c =>
            /INSERT INTO transferencia_item_origenes/.test(c[0])
        );
        expect(splitInsert).toBeDefined();
    });

    test('2) aprobación con split en 2 ubicaciones: inserta 2 filas de origenes y 2 decrementos', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT estado
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            // SELECT items
            .mockResolvedValueOnce([[{ id: 20, item_id: 7, cantidad_solicitada: 2 }]])
            // SELECT stock split 1 (obra=1)
            .mockResolvedValueOnce([[{ cantidad: 1 }]])
            // SELECT stock split 2 (obra=2)
            .mockResolvedValueOnce([[{ cantidad: 5 }]])
            // UPDATE transferencias
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencia_items
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // DELETE origenes previos
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            // INSERT split 1
            .mockResolvedValueOnce([{ insertId: 1 }])
            // INSERT split 2
            .mockResolvedValueOnce([{ insertId: 2 }]);

        const res = await transferenciaService.aprobar(6, 99, {
            items: [{
                item_id: 7,
                splits: [
                    { origen_obra_id: 1, origen_bodega_id: null, cantidad: 1 },
                    { origen_obra_id: 2, origen_bodega_id: null, cantidad: 1 },
                ],
            }],
        });

        expect(res.estado).toBe('aprobada');

        const insertSplitCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_item_origenes/.test(c[0])
        );
        expect(insertSplitCalls).toHaveLength(2);

        // Ola 2: aprobar ya no decrementa stock
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(0);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('3) suma de splits > cantidad_solicitada → rechaza con rollback', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ id: 30, item_id: 3, cantidad_solicitada: 2 }]]);

        await expect(transferenciaService.aprobar(7, 99, {
            items: [{
                item_id: 3,
                splits: [
                    { origen_obra_id: 1, origen_bodega_id: null, cantidad: 2 },
                    { origen_obra_id: 2, origen_bodega_id: null, cantidad: 1 },
                ],
            }],
        })).rejects.toThrow(/excede lo solicitado/);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('4) split sin stock suficiente en el origen → rollback atómico', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ id: 40, item_id: 4, cantidad_solicitada: 3 }]])
            // stock disponible solo 1, pero se piden 3 en ese origen
            .mockResolvedValueOnce([[{ cantidad: 1 }]]);

        await expect(transferenciaService.aprobar(8, 99, {
            items: [{
                item_id: 4,
                splits: [{ origen_obra_id: 1, origen_bodega_id: null, cantidad: 3 }],
            }],
        })).rejects.toThrow(/Stock insuficiente/);

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('5) payload legacy (cantidad_enviada + origen_*) sigue funcionando', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ id: 50, item_id: 5, cantidad_solicitada: 4 }]])
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE transferencias
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE items
            .mockResolvedValueOnce([{ affectedRows: 0 }])  // DELETE origenes
            .mockResolvedValueOnce([{ insertId: 1 }]);     // INSERT origen

        const res = await transferenciaService.aprobar(9, 99, {
            items: [{
                item_id: 5,
                cantidad_enviada: 4,
                origen_obra_id: 3,
                origen_bodega_id: null,
            }],
        });

        expect(res.estado).toBe('aprobada');
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('transferenciaService.crearFaltante', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('crea nueva transferencia con es_faltante_de_id apuntando a la original', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        // _generarCodigo usa db.query (no conn.query)
        db.query.mockResolvedValueOnce([[]]); // no hay códigos previos → seq=1

        conn.query
            // SELECT destino
            .mockResolvedValueOnce([[{ destino_obra_id: 10, destino_bodega_id: null }]])
            // SELECT items originales
            .mockResolvedValueOnce([[
                { item_id: 1, cantidad_solicitada: 5, cantidad_enviada: 2 },
                { item_id: 2, cantidad_solicitada: 3, cantidad_enviada: 3 }, // sin faltante
                { item_id: 3, cantidad_solicitada: 4, cantidad_enviada: 1 },
            ]])
            // INSERT transferencias (nueva)
            .mockResolvedValueOnce([{ insertId: 500 }])
            // INSERT item 1 (faltante=3)
            .mockResolvedValueOnce([{ insertId: 1001 }])
            // INSERT item 3 (faltante=3)
            .mockResolvedValueOnce([{ insertId: 1002 }]);

        const res = await transferenciaService.crearFaltante(123, 77);

        expect(res).toMatchObject({ id: 500, items: 2 });
        expect(res.codigo).toMatch(/^TRF-\d{6}-0001$/);

        // Verificar que el INSERT transferencias recibe es_faltante_de_id=123
        const trfInsert = conn.query.mock.calls.find(c =>
            /INSERT INTO transferencias/.test(c[0])
        );
        expect(trfInsert).toBeDefined();
        // params: codigo, destino_obra, destino_bodega, solicitante, observaciones, es_faltante_de_id
        expect(trfInsert[1][5]).toBe(123);
        expect(trfInsert[1][3]).toBe(77); // solicitante

        // Items insertados: solo los 2 con faltante
        const itemInserts = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_items/.test(c[0])
        );
        expect(itemInserts).toHaveLength(2);
        // item 1 faltante = 5-2 = 3
        expect(itemInserts[0][1]).toEqual([500, 1, 3]);
        // item 3 faltante = 4-1 = 3
        expect(itemInserts[1][1]).toEqual([500, 3, 3]);

        expect(conn.commit).toHaveBeenCalled();
    });

    test('si no hay faltante (todo fue enviado), retorna null sin crear nada', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ destino_obra_id: 10, destino_bodega_id: null }]])
            .mockResolvedValueOnce([[
                { item_id: 1, cantidad_solicitada: 2, cantidad_enviada: 2 },
            ]]);

        const res = await transferenciaService.crearFaltante(123, 77);
        expect(res).toBeNull();
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });
});

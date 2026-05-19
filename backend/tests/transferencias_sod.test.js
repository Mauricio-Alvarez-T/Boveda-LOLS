/**
 * Tests SoD (Segregation of Duties) en el flujo de transferencias.
 *
 * Política: solicitante ≠ aprobador ≠ transportista ≠ receptor sobre la misma
 * transferencia. Backend bloquea con 403 + statusCode. Bypass sólo con permiso
 * `inventario.transferencias.sod_bypass`.
 *
 * Flujos especiales (push_directo, intra_bodega, orden_gerencia) NO aplican SoD
 * porque por diseño consolidan roles.
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

describe('SoD — aprobar()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('rechaza 403 si aprobador === solicitante sin sod_bypass', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        // SELECT estado, solicitante_id → solicitante_id = 77 (mismo que aprobadorId)
        conn.query.mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: 77 }]]);

        await expect(
            transferenciaService.aprobar(
                100,
                77, // aprobadorId === solicitante_id
                { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] },
                ['inventario.transferencias.aprobar'] // sin sod_bypass
            )
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/SoD violation/i),
        });

        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('permite si aprobador ≠ solicitante', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            // SELECT estado, solicitante_id → distinto
            .mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: 50 }]])
            // SELECT transferencia_items
            .mockResolvedValueOnce([[{ id: 200, item_id: 1, cantidad_solicitada: 5 }]])
            // SELECT ubicaciones_stock (validación de stock)
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            // UPDATE transferencias → aprobada
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencia_items
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // DELETE origenes
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            // INSERT transferencia_item_origenes
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.aprobar(
            100,
            77,
            { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] },
            ['inventario.transferencias.aprobar']
        );

        expect(conn.commit).toHaveBeenCalled();
    });

    test('permite con sod_bypass aunque aprobador === solicitante', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: 77 }]])
            .mockResolvedValueOnce([[{ id: 200, item_id: 1, cantidad_solicitada: 5 }]])
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.aprobar(
            100,
            77,
            { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] },
            ['inventario.transferencias.aprobar', 'inventario.transferencias.sod_bypass']
        );

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('SoD — despachar()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('rechaza 403 si transportista === aprobador sin sod_bypass', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query.mockResolvedValueOnce([[{ estado: 'aprobada', aprobador_id: 88 }]]);

        await expect(
            transferenciaService.despachar(
                100,
                88, // transportistaId === aprobador_id
                ['inventario.transferencias.despachar']
            )
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/SoD violation/i),
        });

        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('permite si transportista ≠ aprobador', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'aprobada', aprobador_id: 50 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await transferenciaService.despachar(
            100,
            88,
            ['inventario.transferencias.despachar']
        );

        expect(result).toEqual({ id: 100, estado: 'en_transito' });
        expect(conn.commit).toHaveBeenCalled();
    });

    test('permite con sod_bypass aunque transportista === aprobador', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'aprobada', aprobador_id: 88 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.despachar(
            100,
            88,
            ['inventario.transferencias.despachar', 'inventario.transferencias.sod_bypass']
        );

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('SoD — recibir()', () => {
    beforeEach(() => jest.clearAllMocks());

    test('rechaza 403 si receptor === transportista sin sod_bypass', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100,
            estado: 'en_transito',
            stock_reconciliado: 1,
            transportista_id: 99,
            aprobador_id: 50,
            destino_obra_id: null,
            destino_bodega_id: 5,
        };
        conn.query.mockResolvedValueOnce([[trfRow]]);

        await expect(
            transferenciaService.recibir(
                100,
                99, // receptorId === transportista_id
                [{ item_id: 1, cantidad_recibida: 1 }],
                ['inventario.transferencias.recibir']
            )
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/SoD violation/i),
        });

        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('rechaza 403 si recibe directo desde aprobada y receptor === aprobador', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100,
            estado: 'aprobada',
            stock_reconciliado: 1,
            transportista_id: null,
            aprobador_id: 88,
            destino_obra_id: 5,
            destino_bodega_id: null,
        };
        conn.query.mockResolvedValueOnce([[trfRow]]);

        await expect(
            transferenciaService.recibir(
                100,
                88, // receptorId === aprobador_id (sin despacho intermedio)
                [{ item_id: 1, cantidad_recibida: 1 }],
                ['inventario.transferencias.recibir']
            )
        ).rejects.toMatchObject({
            statusCode: 403,
        });
    });

    test('permite si receptor ≠ transportista', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100,
            estado: 'en_transito',
            stock_reconciliado: 1,
            transportista_id: 50,
            aprobador_id: 60,
            destino_obra_id: 9,
            destino_bodega_id: null,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // SELECT transferencia_items
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 3, origen_obra_id: null, origen_bodega_id: 2 }]])
            // SELECT splits
            .mockResolvedValueOnce([[{ origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 3 }]])
            // UPDATE ubicaciones_stock decremento origen
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencia_items cantidad_recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT ubicaciones_stock destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE transferencias → recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.recibir(
            100,
            77,
            [{ item_id: 5, cantidad_recibida: 3 }],
            ['inventario.transferencias.recibir']
        );

        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('Helper _hasBypass — comportamiento defensivo', () => {
    beforeEach(() => jest.clearAllMocks());

    test('sin userPermisos (undefined) NO bypass', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: 77 }]]);

        await expect(
            transferenciaService.aprobar(100, 77, { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] }, undefined)
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('userPermisos array vacío NO bypass', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: 77 }]]);

        await expect(
            transferenciaService.aprobar(100, 77, { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] }, [])
        ).rejects.toMatchObject({ statusCode: 403 });
    });

    test('solicitante_id nulo NO bloquea (caso edge: legacy data sin solicitante)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{ estado: 'pendiente', solicitante_id: null }]])
            .mockResolvedValueOnce([[{ id: 200, item_id: 1, cantidad_solicitada: 5 }]])
            .mockResolvedValueOnce([[{ cantidad: 10 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 0 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.aprobar(
            100,
            77,
            { items: [{ item_id: 1, cantidad_enviada: 1, origen_bodega_id: 2 }] },
            []
        );

        expect(conn.commit).toHaveBeenCalled();
    });
});

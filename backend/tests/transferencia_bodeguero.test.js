/**
 * Tests del scoping por bodega destino (rol Bodeguero, mig 097).
 *
 * usuarios.bodega_id: un usuario CON bodega asignada
 *   - VE además las transferencias destinadas a su bodega (getAll),
 *   - solo puede RECIBIR / RECHAZAR-RECEPCIÓN las destinadas a SU bodega (403 si ajena).
 * Usuarios sin bodega (null) = comportamiento previo intacto.
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

describe('getAll() — scope por bodega destino', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('con solicitanteId + destinoBodegaId: WHERE (solicitante OR destino_bodega)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({}, 5, 3);

        const sql = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];
        expect(sql).toMatch(/\(t\.solicitante_id = \? OR t\.destino_bodega_id = \?\)/);
        expect(params.slice(0, 2)).toEqual([5, 3]);
        // El count usa el mismo WHERE
        expect(db.query.mock.calls[1][0]).toMatch(/\(t\.solicitante_id = \? OR t\.destino_bodega_id = \?\)/);
    });

    test('sin destinoBodegaId: scope solo por solicitante (regresión)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({}, 5);

        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/t\.solicitante_id = \?/);
        expect(sql).not.toMatch(/destino_bodega_id = \?/);
    });

    test('ver_todas (ambos null): sin scope por usuario', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({}, null, null);

        const sql = db.query.mock.calls[0][0];
        expect(sql).not.toMatch(/solicitante_id = \?/);
        expect(sql).not.toMatch(/destino_bodega_id = \?/);
    });
});

describe('recibir() — enforcement bodega destino', () => {
    beforeEach(() => jest.clearAllMocks());

    test('403 si el usuario tiene bodega y la TRF va destinada a OTRA bodega', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query.mockResolvedValueOnce([[{
            id: 100, estado: 'en_transito', destino_bodega_id: 9,
            transportista_id: null, aprobador_id: 2, stock_reconciliado: 1,
        }]]);

        await expect(
            transferenciaService.recibir(100, 42, [], ['inventario.transferencias.recibir'], 'total', null, [], 3)
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/tu bodega/i),
        });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('usuario con bodega correcta (destino = su bodega) pasa el check', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        // Solo fijamos la 1ª query (la TRF); el resto genérico — si algo lanza
        // después, NO debe ser el error de bodega.
        conn.query.mockResolvedValue([[]]);
        conn.query.mockResolvedValueOnce([[{
            id: 100, estado: 'en_transito', destino_bodega_id: 3,
            transportista_id: null, aprobador_id: 2, stock_reconciliado: 1,
        }]]);

        try {
            await transferenciaService.recibir(100, 42, [], ['inventario.transferencias.recibir'], 'total', null, [], 3);
        } catch (err) {
            expect(err.message).not.toMatch(/tu bodega/i);
        }
    });

    test('usuario SIN bodega (null) no gatilla el enforcement aunque el destino sea bodega', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValue([[]]);
        conn.query.mockResolvedValueOnce([[{
            id: 100, estado: 'en_transito', destino_bodega_id: 9,
            transportista_id: null, aprobador_id: 2, stock_reconciliado: 1,
        }]]);

        try {
            await transferenciaService.recibir(100, 42, [], ['inventario.transferencias.recibir'], 'total', null, [], null);
        } catch (err) {
            expect(err.message).not.toMatch(/tu bodega/i);
        }
    });
});

describe('setFotoRecepcion() — enforcement bodega destino', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('403 si el usuario tiene bodega y la recepción es de TRF destino OTRA bodega', async () => {
        db.query.mockResolvedValueOnce([[{ id: 5, destino_bodega_id: 9 }]]); // SELECT recepción+destino
        await expect(
            transferenciaService.setFotoRecepcion(100, 5, '/api/uploads/x.jpg', 3)
        ).rejects.toMatchObject({ statusCode: 403, message: expect.stringMatching(/tu bodega/i) });
        // NO debe llegar al UPDATE
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('usuario con bodega correcta → hace el UPDATE', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, destino_bodega_id: 3 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await transferenciaService.setFotoRecepcion(100, 5, '/api/uploads/x.jpg', 3);
        expect(r).toMatchObject({ recepcion_id: 5, foto_url: '/api/uploads/x.jpg' });
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('usuario SIN bodega (null) → sin enforcement (regresión)', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 5, destino_bodega_id: 9 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const r = await transferenciaService.setFotoRecepcion(100, 5, '/api/uploads/x.jpg', null);
        expect(r.foto_url).toBe('/api/uploads/x.jpg');
        expect(db.query).toHaveBeenCalledTimes(2);
    });
});

describe('rechazar() — enforcement bodega destino (solo vía rechazar-recepcion)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('403 si el usuario tiene bodega y la TRF va destinada a OTRA bodega', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query.mockResolvedValueOnce([[{
            estado: 'en_transito', origen_obra_id: 1, origen_bodega_id: null,
            destino_bodega_id: 9, stock_reconciliado: 1,
        }]]);

        await expect(
            transferenciaService.rechazar(100, 42, 'no corresponde', 3)
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/tu bodega/i),
        });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('flujo del aprobador (sin userBodegaId) sigue funcionando — régimen nuevo', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        conn.query
            .mockResolvedValueOnce([[{
                estado: 'pendiente', origen_obra_id: 1, origen_bodega_id: null,
                destino_bodega_id: 9, stock_reconciliado: 1,
            }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE → rechazada

        const r = await transferenciaService.rechazar(100, 42, 'motivo');
        expect(r).toMatchObject({ estado: 'rechazada' });
        expect(conn.commit).toHaveBeenCalled();
    });
});

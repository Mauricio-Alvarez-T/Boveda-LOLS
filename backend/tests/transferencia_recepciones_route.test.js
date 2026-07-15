/**
 * GET /api/transferencias/:id/recepciones — permiso + scoping.
 *
 * (1) Regresión permiso: debe usar 'inventario.ver' (no el permiso fantasma
 *     'inventario.transferencias.ver' que daba 403 a todos).
 * (2) Scoping (mig 097): mismo criterio que GET /:id — sin `ver_todas` solo se ve
 *     el historial de TRFs propias o destinadas a la bodega del usuario.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const VER_TODAS = 'inventario.transferencias.ver_todas';
const makeToken = (permisos, id = 1, bodegaId = null) =>
    jwt.sign({ id, email: 'u@lols.cl', rol_id: 2, rv: 1, p: permisos, bodega_id: bodegaId }, SECRET);

// getById() + getRecepciones() consultan db.query; devolvemos una fila-TRF genérica
// (con solicitante_id/destino_bodega_id configurables por test).
function mockTrf({ solicitante_id = 1, destino_bodega_id = null } = {}) {
    db.query.mockResolvedValue([[{ id: 1, solicitante_id, destino_bodega_id }]]);
}

describe('GET /api/transferencias/:id/recepciones — permiso + scoping', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('con inventario.ver y TRF PROPIA → 200', async () => {
        mockTrf({ solicitante_id: 1 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 1)}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('sin inventario.ver → 403 (gate de permiso)', async () => {
        mockTrf({ solicitante_id: 1 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['asistencia.ver'], 1)}`);
        expect(res.status).toBe(403);
    });

    test('sin token → 401', async () => {
        const res = await request(app).get('/api/transferencias/1/recepciones');
        expect(res.status).toBe(401);
    });

    test('TRF ajena, sin ver_todas ni bodega → 403 (scoping)', async () => {
        mockTrf({ solicitante_id: 7, destino_bodega_id: 8 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 1)}`);
        expect(res.status).toBe(403);
    });

    test('bodeguero: TRF ajena DESTINADA a su bodega → 200', async () => {
        mockTrf({ solicitante_id: 7, destino_bodega_id: 3 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 1, 3)}`);
        expect(res.status).toBe(200);
    });

    test('bodeguero: TRF ajena destinada a OTRA bodega → 403', async () => {
        mockTrf({ solicitante_id: 7, destino_bodega_id: 8 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 1, 3)}`);
        expect(res.status).toBe(403);
    });

    test('ver_todas: TRF ajena → 200', async () => {
        mockTrf({ solicitante_id: 7, destino_bodega_id: 8 });
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver', VER_TODAS], 1)}`);
        expect(res.status).toBe(200);
    });
});

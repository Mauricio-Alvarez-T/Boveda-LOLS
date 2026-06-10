/**
 * Regresión: GET /api/transferencias/:id/recepciones debe usar un permiso que
 * EXISTA en permisos.config. Antes pedía 'inventario.transferencias.ver' (permiso
 * fantasma) → 403 para TODOS, incl. Super Admin → el historial de entregas
 * (viajes) quedaba vacío. Debe usar 'inventario.ver' (igual que ver la TRF).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 1, email: 'admin@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

describe('GET /api/transferencias/:id/recepciones — permiso', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockResolvedValue([[]]); // sin eventos → getRecepciones retorna []
    });

    test('con permiso inventario.ver → 200 (no 403)', async () => {
        const token = makeToken(['inventario.ver']);
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body.data)).toBe(true);
    });

    test('sin inventario.ver → 403', async () => {
        const token = makeToken(['asistencia.ver']); // permiso de otro módulo
        const res = await request(app)
            .get('/api/transferencias/1/recepciones')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });

    test('sin token → 401', async () => {
        const res = await request(app).get('/api/transferencias/1/recepciones');
        expect(res.status).toBe(401);
    });
});

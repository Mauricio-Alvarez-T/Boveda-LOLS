const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const app = require('../index');

/** GET /api/dashboard/asistencia (detalle del Inicio, fase 2): permiso y validación de obra. */
describe('GET /api/dashboard/asistencia', () => {
    const token = (p) => jwt.sign({ id: 1, email: 'test@lols.cl', rol_id: 1, rv: 1, p }, process.env.JWT_SECRET || 'secret');

    test('sin asistencia.ver → 403', async () => {
        const r = await request(app).get('/api/dashboard/asistencia').set('Authorization', `Bearer ${token(['dashboard.view'])}`);
        expect(r.status).toBe(403);
    });

    test('obra_id no numérico → 400', async () => {
        const r = await request(app).get('/api/dashboard/asistencia?obra_id=abc').set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
        expect(r.status).toBe(400);
    });

    test('con asistencia.ver → 200 y bloques de pago en null', async () => {
        const r = await request(app).get('/api/dashboard/asistencia').set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ descuentos: null, horasExtra: null });
        expect(r.body.data.proximos.eventos).toEqual([]);
    });
});

/**
 * Regresión (Soporte 30-oct): abrir una transferencia que ya no existe (p. ej. recién
 * eliminada) respondía 500 «Transferencia no encontrada» → Soporte lo contaba como
 * FALLA DEL SERVIDOR. Debe ser 404: es un dato que no está, no una caída.
 * Usa el servicio REAL con la DB mockeada vacía.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = jwt.sign(
    { id: 5, email: 'u@lols.cl', rol_id: 2, rv: 1, p: ['inventario.ver'], bodega_id: null },
    SECRET
);

describe('Transferencia inexistente → 404 (no 500)', () => {
    test('GET /api/transferencias/:id', async () => {
        const res = await request(app)
            .get('/api/transferencias/999999')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('Transferencia no encontrada');
    });

    test('servicio: getById y prorrogar lanzan statusCode 404', async () => {
        const service = require('../src/services/transferencia.service');
        await expect(service.getById(999999)).rejects.toMatchObject({ statusCode: 404 });
        await expect(service.prorrogar(999999, 5)).rejects.toMatchObject({ statusCode: 404 });
    });
});

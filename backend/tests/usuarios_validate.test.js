/**
 * Tests de integración del wiring de validateBody (F1.3) en usuarios.routes:
 * POST /usuarios valida required y la clave desconocida no llega al INSERT.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn(), getConnection: jest.fn() }));
jest.mock('../src/services/version.service', () => ({
    increment: jest.fn().mockResolvedValue(2), get: jest.fn().mockReturnValue(1), init: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/services/crud.service', () => jest.fn().mockImplementation(() => ({
    update: jest.fn().mockResolvedValue({}), getAll: jest.fn().mockResolvedValue([]),
    getById: jest.fn().mockResolvedValue({}), softDelete: jest.fn().mockResolvedValue(undefined),
})));
jest.mock('../src/middleware/auth', () => (req, res, next) => { req.user = { id: 1, rol_id: 1, p: ['usuarios.crear'] }; next(); });
jest.mock('../src/middleware/rbac', () => ({ checkPermission: () => (req, res, next) => next() }));
jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));
jest.mock('../src/routes/crud.routes', () => () => require('express').Router());

const express = require('express');
const request = require('supertest');
const db = require('../src/config/db');

let app;
beforeAll(() => {
    const router = require('../src/routes/usuarios.routes');
    app = express();
    app.use(express.json());
    app.use('/usuarios', router);
    app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
});
beforeEach(() => jest.clearAllMocks());

describe('POST /usuarios — validateBody (F1.3)', () => {
    test('falta rol_id → 400, sin INSERT', async () => {
        const res = await request(app).post('/usuarios').send({ nombre: 'Ana', email: 'a@b.cl', password: 'secreto' });
        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('email inválido → 400', async () => {
        const res = await request(app).post('/usuarios').send({ nombre: 'Ana', email: 'no-email', password: 'secreto', rol_id: 2 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/email/);
    });

    test('password corta (<5) → 400', async () => {
        const res = await request(app).post('/usuarios').send({ nombre: 'Ana', email: 'a@b.cl', password: 'ab', rol_id: 2 });
        expect(res.status).toBe(400);
    });

    // Boundary del bug: 4 chars pasaba el backend (min 4) pero el login exige 5
    // → usuario creable que no podía loguear. Ahora backend tambien exige 5.
    test('password de 4 chars → 400 (no crear usuario que no puede loguear)', async () => {
        const res = await request(app).post('/usuarios').send({ nombre: 'Ana', email: 'a@b.cl', password: '1234', rol_id: 2 });
        expect(res.status).toBe(400);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('body válido con clave basura extra → 201 y la basura NO llega al INSERT', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 7 }]);
        const res = await request(app).post('/usuarios')
            .send({ nombre: 'Ana', email: 'a@b.cl', password: 'secreto', rol_id: 2, is_admin: true, hack: 'x' });
        expect(res.status).toBe(201);
        expect(db.query).toHaveBeenCalledTimes(1);
        const params = db.query.mock.calls[0][1];
        expect(params).not.toContain(true);   // is_admin no se filtró a los params
        expect(params).not.toContain('x');
        expect(params).toEqual(['Ana', 'a@b.cl', 'hashed', 2, null, null]);
    });
});

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
    })
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

describe('RBAC Integration Tests - Asistencia', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should return 403 when user has no edit permission for asistencia', async () => {
        // Firmar token SIN el permiso asistencia.guardar
        const tokenForbidden = jwt.sign({ 
            id: 1, email: 'test@lols.cl', rol_id: 2, rv: 1, p: ['dashboard.view'] 
        }, process.env.JWT_SECRET || 'secret');

        const response = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${tokenForbidden}`)
            .send({ registros: [] });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('No tienes permisos para esta acción');
    });

    test('should allow access when user has edit permission for asistencia', async () => {
        // Firmar token CON el permiso asistencia.guardar
        const tokenAllowed = jwt.sign({ 
            id: 1, email: 'test@lols.cl', rol_id: 2, rv: 1, p: ['asistencia.guardar'] 
        }, process.env.JWT_SECRET || 'secret');

        db.getConnection = jest.fn().mockResolvedValue({
            beginTransaction: jest.fn(),
            query: jest.fn().mockResolvedValue([[]]),
            commit: jest.fn(),
            release: jest.fn()
        });

        const response = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${tokenAllowed}`)
            .send({ registros: [] });

        expect(response.status).not.toBe(403);
    });
});

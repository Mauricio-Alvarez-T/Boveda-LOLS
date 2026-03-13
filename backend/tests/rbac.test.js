const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db');

describe('RBAC Integration Tests - Asistencia', () => {
    let token;

    beforeAll(() => {
        token = jwt.sign({ id: 1, email: 'test@lols.cl', rol_id: 2 }, process.env.JWT_SECRET || 'secret');
    });

    beforeEach(() => {
        jest.clearAllMocks();
        // Setup default mock implementation
        db.query.mockImplementation((sql, params) => {
            if (sql.includes('permisos_rol')) {
                return Promise.resolve([[{ tiene_permiso: 1 }]]); // Default allowed
            }
            return Promise.resolve([[]]);
        });
    });

    test('should return 403 when user has no edit permission for asistencia', async () => {
        db.query.mockImplementation((sql, params) => {
            if (sql.includes('permisos_rol')) {
                return Promise.resolve([[{ tiene_permiso: 0 }]]); // Forbidden
            }
            return Promise.resolve([[]]);
        });

        const response = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ registros: [] });

        expect(response.status).toBe(403);
        expect(response.body.error).toBe('No tienes permisos para esta acción');
    });

    test('should allow access when user has edit permission for asistencia', async () => {
        // Default mock allows it
        db.getConnection = jest.fn().mockResolvedValue({
            beginTransaction: jest.fn(),
            query: jest.fn().mockResolvedValue([[]]),
            commit: jest.fn(),
            release: jest.fn()
        });

        const response = await request(app)
            .post('/api/asistencias/bulk/1')
            .set('Authorization', `Bearer ${token}`)
            .send({ registros: [] });

        expect(response.status).not.toBe(403);
    });
});

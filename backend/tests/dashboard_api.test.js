const request = require('supertest');
const app = require('../index');
const jwt = require('jsonwebtoken');

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

// Mock para saltar la lógica compleja del dashboard inside y solo testear el endpoint routing
jest.mock('../src/services/dashboard.service', () => ({
    getSummary: jest.fn().mockResolvedValue({
        stats: { workers: 50 },
        alerts: []
    })
}));

describe('Dashboard API - Anti-Regression Tests', () => {
    let token;

    beforeAll(() => {
        token = jwt.sign({ 
            id: 1, email: 'test@lols.cl', rol_id: 1, rv: 1, p: ['dashboard.view'] 
        }, process.env.JWT_SECRET || 'secret');
    });

    test('debe responder 200 en /api/dashboard/summary y NO lanzar ReferenceError por imports faltantes', async () => {
        const response = await request(app)
            .get('/api/dashboard/summary')
            .set('Authorization', `Bearer ${token}`);

        // Si el endpoint explota porque faltó `require('dashboardService')` (bug anterior),
        // response.status será 500. Queremos que sea 200 y reciba la data.
        expect(response.status).toBe(200);
        expect(response.body.data.stats.workers).toBe(50);
    });
});

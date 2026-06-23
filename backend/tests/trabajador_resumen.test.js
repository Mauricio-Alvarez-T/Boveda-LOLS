/**
 * GET /api/trabajadores/:id/resumen — ficha-resumen (contrato + stats de asistencia).
 * Solo lectura, gateado por 'trabajadores.ver'. Verifica shape + coerción a Number,
 * 404 si el trabajador no existe, y 403 sin permiso.
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

describe('GET /api/trabajadores/:id/resumen', () => {
    beforeEach(() => jest.clearAllMocks());

    test('con trabajadores.ver → 200 + stats numéricos', async () => {
        db.query
            .mockResolvedValueOnce([[{ fecha_ingreso: '2025-01-01', fecha_desvinculacion: null, activo: 1 }]])
            .mockResolvedValueOnce([[{ dias_trabajados: '120', faltas: '3', dias_presente: '118', dias_vacaciones: '5', dias_licencia: '2', dias_registrados: '130' }]]);

        const res = await request(app)
            .get('/api/trabajadores/5/resumen')
            .set('Authorization', `Bearer ${makeToken(['trabajadores.ver'])}`);

        expect(res.status).toBe(200);
        expect(res.body.data.activo).toBe(true);
        expect(res.body.data.dias_trabajados).toBe(120);
        expect(res.body.data.faltas).toBe(3);
        expect(res.body.data.fecha_ingreso).toBe('2025-01-01');
    });

    test('trabajador inexistente → 404', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app)
            .get('/api/trabajadores/999/resumen')
            .set('Authorization', `Bearer ${makeToken(['trabajadores.ver'])}`);
        expect(res.status).toBe(404);
    });

    test('sin permiso trabajadores.ver → 403', async () => {
        const res = await request(app)
            .get('/api/trabajadores/5/resumen')
            .set('Authorization', `Bearer ${makeToken(['asistencia.ver'])}`);
        expect(res.status).toBe(403);
    });
});

/**
 * SEGURIDAD (regresión): aislamiento del listado de Solicitudes (transferencias) por
 * usuario. Por defecto cada usuario ve SOLO las suyas (solicitante_id = req.user.id);
 * solo con `inventario.transferencias.ver_todas` ve todas. El detalle (/:id) devuelve
 * 403 si la transferencia es de otro y no se tiene ese permiso. Si esto se rompe,
 * cualquier usuario vería/abriría solicitudes ajenas → este test lo congela.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

jest.mock('../src/services/transferencia.service', () => ({
    getAll: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getById: jest.fn(),
    getPendientes: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getMisSolicitudes: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getDiscrepancias: jest.fn().mockResolvedValue({ data: [], total: 0 }),
}));

const request = require('supertest');
const app = require('../index');
const service = require('../src/services/transferencia.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const VER_TODAS = 'inventario.transferencias.ver_todas';
// rol_id 2 (NO super admin) — el aislamiento NO debe depender del rol, solo del permiso.
const makeToken = (permisos, id = 5) => jwt.sign({ id, email: 'u@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);

describe('GET /api/transferencias — aislamiento por usuario', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        service.getAll.mockResolvedValue({ data: [], total: 0 });
    });

    test('SIN ver_todas → getAll scopeado a solicitante_id = req.user.id', async () => {
        const res = await request(app)
            .get('/api/transferencias')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 5)}`);
        expect(res.status).toBe(200);
        expect(service.getAll).toHaveBeenCalledWith(expect.any(Object), 5);
    });

    test('CON ver_todas → getAll sin scope (solicitanteId null)', async () => {
        const res = await request(app)
            .get('/api/transferencias')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver', VER_TODAS], 5)}`);
        expect(res.status).toBe(200);
        expect(service.getAll).toHaveBeenCalledWith(expect.any(Object), null);
    });

    test('sin inventario.ver → 403', async () => {
        const res = await request(app)
            .get('/api/transferencias')
            .set('Authorization', `Bearer ${makeToken(['asistencia.ver'], 5)}`);
        expect(res.status).toBe(403);
    });

    test('sin token → 401', async () => {
        const res = await request(app).get('/api/transferencias');
        expect(res.status).toBe(401);
    });
});

describe('GET /api/transferencias/:id — defensa en profundidad', () => {
    beforeEach(() => jest.clearAllMocks());

    test('SIN ver_todas y transferencia AJENA → 403', async () => {
        service.getById.mockResolvedValue({ id: 9, solicitante_id: 7, items: [] });
        const res = await request(app)
            .get('/api/transferencias/9')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 5)}`);
        expect(res.status).toBe(403);
    });

    test('SIN ver_todas y transferencia PROPIA → 200', async () => {
        service.getById.mockResolvedValue({ id: 9, solicitante_id: 5, items: [] });
        const res = await request(app)
            .get('/api/transferencias/9')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'], 5)}`);
        expect(res.status).toBe(200);
    });

    test('CON ver_todas y transferencia ajena → 200', async () => {
        service.getById.mockResolvedValue({ id: 9, solicitante_id: 7, items: [] });
        const res = await request(app)
            .get('/api/transferencias/9')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver', VER_TODAS], 5)}`);
        expect(res.status).toBe(200);
    });
});

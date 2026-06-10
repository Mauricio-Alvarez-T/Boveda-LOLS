/**
 * Feature "Obra finalizada": exclusión por defecto en GET /obras, endpoints
 * finalizar/reactivar (permiso obras.finalizar) y stats GET /obras/finalizadas.
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
const makeToken = (permisos) => jwt.sign({ id: 1, email: 'a@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const adminToken = makeToken(['obras.ver', 'obras.crear', 'obras.editar', 'obras.eliminar', 'obras.finalizar']);

describe('GET /api/obras — exclusión de finalizadas', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('sin params → excluye finalizadas (finalizada = 0 en el SELECT)', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, nombre: 'Obra A', activa: 1 }]]).mockResolvedValueOnce([[{ total: 1 }]]);
        const res = await request(app).get('/api/obras').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[0][0]).toMatch(/finalizada = 0/);
    });

    test('?incluir_finalizadas=true → NO filtra finalizada = 0', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await request(app).get('/api/obras?incluir_finalizadas=true').set('Authorization', `Bearer ${adminToken}`);
        expect(db.query.mock.calls[0][0]).not.toMatch(/finalizada = 0/);
    });

    test('?finalizada=1 → filtra por finalizada explícito (sin el default = 0)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await request(app).get('/api/obras?finalizada=1').set('Authorization', `Bearer ${adminToken}`);
        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/finalizada = \?/);
        expect(sql).not.toMatch(/finalizada = 0/);
    });
});

describe('PUT /api/obras/:id/finalizar y /reactivar', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('finalizar sin fecha_termino → 400', async () => {
        const res = await request(app).put('/api/obras/5/finalizar').set('Authorization', `Bearer ${adminToken}`).send({});
        expect(res.status).toBe(400);
    });

    test('finalizar OK → UPDATE con finalizada=1 y fecha_termino', async () => {
        // El logger de auditoría hace un SELECT previo del obra en mutaciones;
        // buscamos la llamada UPDATE entre todas, no asumimos índice 0.
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const res = await request(app).put('/api/obras/5/finalizar').set('Authorization', `Bearer ${adminToken}`).send({ fecha_termino: '2026-06-08' });
        expect(res.status).toBe(200);
        expect(res.body.finalizada).toBe(true);
        const upd = db.query.mock.calls.find(c => /UPDATE obras SET/.test(c[0]) && /finalizada = 1/.test(c[0]));
        expect(upd).toBeDefined();
        expect(upd[0]).toMatch(/fecha_termino = \?/);
        expect(upd[1]).toContain('2026-06-08');
    });

    test('NO se puede finalizar vía PUT genérico /:id con solo obras.editar (bypass cerrado)', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const token = makeToken(['obras.ver', 'obras.editar']);
        await request(app).put('/api/obras/5').set('Authorization', `Bearer ${token}`).send({ nombre: 'X', finalizada: 1 });
        // 'finalizada' fue removido de allowedFields → ningún UPDATE debe setearlo.
        const setFinalizada = db.query.mock.calls.find(c => /UPDATE obras SET[\s\S]*finalizada/.test(c[0]));
        expect(setFinalizada).toBeUndefined();
    });

    test('finalizar 403 sin permiso obras.finalizar', async () => {
        const token = makeToken(['obras.ver', 'obras.editar']);
        const res = await request(app).put('/api/obras/5/finalizar').set('Authorization', `Bearer ${token}`).send({ fecha_termino: '2026-06-08' });
        expect(res.status).toBe(403);
    });

    test('reactivar → UPDATE finalizada = 0', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1 }]);
        const res = await request(app).put('/api/obras/5/reactivar').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.finalizada).toBe(false);
        const upd = db.query.mock.calls.find(c => /UPDATE obras SET finalizada = 0/.test(c[0]));
        expect(upd).toBeDefined();
    });
});

describe('GET /api/obras/finalizadas — stats', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('devuelve obras con total_trabajadores y por_cargo mergeado', async () => {
        db.query
            .mockResolvedValueOnce([[
                { id: 1, nombre: 'Edificio X', empresa_nombre: 'LOLS', fecha_inicio: '2026-01-01', fecha_termino: '2026-06-01', dias_duracion: 151, total_trabajadores: 30 },
            ]])
            .mockResolvedValueOnce([[
                { obra_id: 1, cargo: 'Jornalero', cantidad: 20 },
                { obra_id: 1, cargo: 'Carpintero', cantidad: 10 },
            ]]);
        const res = await request(app).get('/api/obras/finalizadas').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].total_trabajadores).toBe(30);
        expect(res.body.data[0].dias_duracion).toBe(151);
        expect(res.body.data[0].por_cargo).toHaveLength(2);
        expect(res.body.data[0].por_cargo[0]).toEqual({ cargo: 'Jornalero', cantidad: 20 });
    });

    test('vacío → data: [] sin segunda query', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const res = await request(app).get('/api/obras/finalizadas').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

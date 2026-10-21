/**
 * Plantillas de correo (/api/usuarios/me/plantillas).
 *
 * Nace del 2026-10-21: «Enviar reporte» en Gestiones mostraba «Error al cargar plantillas» porque el GET
 * ordenaba por `predeterminada` y la columna real es `es_predeterminada` (migración 009). Lo que fijan:
 *   · el GET no nombra la columna en el SQL (funciona con cualquiera de los dos nombres),
 *   · la respuesta trae siempre `es_predeterminada` y la predeterminada va primero,
 *   · «predeterminar» usa `es_predeterminada` y, si esa columna no existe, prueba `predeterminada`.
 *
 * Mocks de BD, sin conexión real (patrón de asistencia_borrar.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = jwt.sign({ id: 9, email: 'op@lols.cl', rol_id: 1, rv: 1, p: ['sistema.plantillas.gestionar'] }, SECRET);
const campoMalo = () => Object.assign(new Error("Unknown column 'es_predeterminada'"), { code: 'ER_BAD_FIELD_ERROR' });

describe('GET /api/usuarios/me/plantillas', () => {
    beforeEach(() => jest.clearAllMocks());

    test('con la columna de la migración 009: la predeterminada primero y como booleano', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, usuario_id: 9, nombre: 'Simple', asunto: 'a', cuerpo: 'b', es_predeterminada: 0 },
            { id: 2, usuario_id: 9, nombre: 'Formal', asunto: 'c', cuerpo: 'd', es_predeterminada: 1 },
        ]]);
        const res = await request(app).get('/api/usuarios/me/plantillas').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.map(p => p.id)).toEqual([2, 1]);
        expect(res.body.data[0].es_predeterminada).toBe(true);
        const [sql] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/predeterminada/);
    });

    test('con el nombre viejo (`predeterminada`) también responde y traduce el campo', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, usuario_id: 9, nombre: 'Simple', asunto: 'a', cuerpo: 'b', predeterminada: 0 },
            { id: 3, usuario_id: 9, nombre: 'DT', asunto: 'e', cuerpo: 'f', predeterminada: 1 },
        ]]);
        const res = await request(app).get('/api/usuarios/me/plantillas').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data.map(p => [p.id, p.es_predeterminada])).toEqual([[3, true], [1, false]]);
    });

    test('sin la tabla responde lista vacía (no error)', async () => {
        db.query.mockRejectedValueOnce(Object.assign(new Error('no table'), { code: 'ER_NO_SUCH_TABLE' }));
        const res = await request(app).get('/api/usuarios/me/plantillas').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});

describe('PUT /api/usuarios/me/plantillas/:id/predeterminar', () => {
    beforeEach(() => jest.clearAllMocks());

    test('marca la elegida y desmarca las demás en una sola sentencia sobre es_predeterminada', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
        const res = await request(app).put('/api/usuarios/me/plantillas/2/predeterminar').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(db.query).toHaveBeenCalledTimes(1);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/SET es_predeterminada = \(id = \?\) WHERE usuario_id = \?/);
        expect(params).toEqual(['2', 9]);
    });

    test('si la columna se llama `predeterminada`, reintenta con ese nombre', async () => {
        db.query.mockRejectedValueOnce(campoMalo()).mockResolvedValueOnce([{ affectedRows: 3 }]);
        const res = await request(app).put('/api/usuarios/me/plantillas/2/predeterminar').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[1][0]).toMatch(/SET predeterminada = \(id = \?\)/);
    });
});

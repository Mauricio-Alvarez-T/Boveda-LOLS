/**
 * errorHandler — errores enriquecidos (plan Gestiones B1, 2026-09-11).
 *
 * - Un error de dominio puede traer `code` y `details` (ej. 409 con `required`) y el
 *   cliente los recibe en el body para reaccionar (antes solo llegaba `{ error }`).
 * - Los 5xx NO exponen code/details (podrían ser internos).
 * - `ER_ROW_IS_REFERENCED_2` (FK RESTRICT al borrar/reciclar) → 409 legible, no 500 crudo.
 */
jest.mock('../src/utils/logger-structured', () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }));
jest.mock('fs', () => ({ ...jest.requireActual('fs'), appendFile: jest.fn((p, c, cb) => cb && cb()) }));

const errorHandler = require('../src/middleware/errorHandler');

function run(err, req = {}) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, { method: 'GET', originalUrl: '/api/x', user: { id: 1 }, ...req }, res, jest.fn());
    return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

const httpError = (msg, statusCode, extra = {}) => Object.assign(new Error(msg), { statusCode, ...extra });

describe('errorHandler', () => {
    test('error simple con statusCode → { error }', () => {
        const r = run(httpError('No encontrado', 404));
        expect(r.status).toBe(404);
        expect(r.body).toEqual({ error: 'No encontrado' });
    });

    test('4xx con code y details → los propaga (details no pisa `error`)', () => {
        const r = run(httpError('Ya desvinculado', 409, { code: 'YA_DESVINCULADO', details: { required: ['x.y'], error: 'hack', fecha: '2026-01-01' } }));
        expect(r.status).toBe(409);
        expect(r.body).toEqual({ error: 'Ya desvinculado', code: 'YA_DESVINCULADO', required: ['x.y'], fecha: '2026-01-01' });
    });

    test('5xx no expone code ni details', () => {
        const r = run(Object.assign(new Error('boom'), { code: 'INTERNO', details: { secreto: 1 } }));
        expect(r.status).toBe(500);
        expect(r.body).toEqual({ error: 'boom' });
    });

    test('códigos MySQL ER_* no se exponen como code de dominio', () => {
        const r = run(Object.assign(new Error('x'), { code: 'ER_BAD_FIELD_ERROR' }));
        expect(r.status).toBe(500);
        expect(r.body).not.toHaveProperty('code');
    });

    test('ER_DUP_ENTRY → 409 (sin cambios)', () => {
        const r = run(Object.assign(new Error('dup'), { code: 'ER_DUP_ENTRY' }));
        expect(r.status).toBe(409);
        expect(r.body.error).toMatch(/ya existe/i);
    });

    test('ER_ROW_IS_REFERENCED_2 → 409 legible con code', () => {
        const r = run(Object.assign(new Error('Cannot delete or update a parent row'), { code: 'ER_ROW_IS_REFERENCED_2' }));
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('ER_ROW_IS_REFERENCED_2');
        expect(r.body.error).toMatch(/datos asociados/i);
    });

    test('ER_NO_REFERENCED_ROW_2 → 400 (sin cambios)', () => {
        const r = run(Object.assign(new Error('fk'), { code: 'ER_NO_REFERENCED_ROW_2' }));
        expect(r.status).toBe(400);
    });
});

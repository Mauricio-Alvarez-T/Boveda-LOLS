/**
 * Tests del mini-DSL validateBody v2 (Plan v2 F1.3):
 * strip de claves desconocidas, format email/date, minLength string, itemRules.
 */
const validateBody = require('../src/middleware/validateBody');

// Ejecuta el middleware con un body fake y captura el resultado.
function run(schema, options, body) {
    const req = { body };
    const captured = { status: null, json: null, nexted: false };
    const res = {
        status(c) { captured.status = c; return this; },
        json(o) { captured.json = o; return this; },
    };
    validateBody(schema, options)(req, res, () => { captured.nexted = true; });
    return { req, ...captured };
}

describe('validateBody v2', () => {
    describe('strip de claves desconocidas', () => {
        const schema = { nombre: { type: 'string' }, rol_id: { type: 'integer' }, obra_id: { type: 'integer' } };

        test('elimina claves no declaradas y conserva las del schema', () => {
            const r = run(schema, { strip: true }, { nombre: 'Ana', rol_id: 2, is_admin: true, hack: 'x' });
            expect(r.nexted).toBe(true);
            expect(r.req.body).toEqual({ nombre: 'Ana', rol_id: 2 });
            expect(r.req.body.is_admin).toBeUndefined();
        });

        test('conserva null explícito de una clave declarada', () => {
            const r = run(schema, { strip: true }, { nombre: 'Ana', obra_id: null });
            expect(r.req.body).toEqual({ nombre: 'Ana', obra_id: null });
            expect('obra_id' in r.req.body).toBe(true);
        });

        test('sin { strip } el body queda intacto (retrocompat)', () => {
            const r = run(schema, {}, { nombre: 'Ana', extra: 1 });
            expect(r.nexted).toBe(true);
            expect(r.req.body).toEqual({ nombre: 'Ana', extra: 1 });
        });
    });

    describe('validación de tipos / formatos', () => {
        test('tipo inválido → 400 con mensaje', () => {
            const r = run({ rol_id: { required: true, type: 'integer' } }, {}, { rol_id: 'abc' });
            expect(r.status).toBe(400);
            expect(r.json.error).toMatch(/rol_id/);
            expect(r.nexted).toBe(false);
        });

        test('required ausente → 400', () => {
            const r = run({ nombre: { required: true, type: 'string' } }, {}, {});
            expect(r.status).toBe(400);
            expect(r.json.error).toMatch(/requerido/);
        });

        test('format email acepta válido y rechaza inválido', () => {
            expect(run({ email: { type: 'string', format: 'email' } }, {}, { email: 'a@b.cl' }).nexted).toBe(true);
            const bad = run({ email: { type: 'string', format: 'email' } }, {}, { email: 'no-email' });
            expect(bad.status).toBe(400);
            expect(bad.json.error).toMatch(/email/);
        });

        test('format date exige YYYY-MM-DD', () => {
            expect(run({ f: { type: 'string', format: 'date' } }, {}, { f: '2026-06-11' }).nexted).toBe(true);
            expect(run({ f: { type: 'string', format: 'date' } }, {}, { f: '11/06/2026' }).status).toBe(400);
        });

        test('minLength en string', () => {
            expect(run({ pw: { type: 'string', minLength: 4 } }, {}, { pw: 'abc' }).status).toBe(400);
            expect(run({ pw: { type: 'string', minLength: 4 } }, {}, { pw: 'abcd' }).nexted).toBe(true);
        });

        test('in[] (enum)', () => {
            expect(run({ tipo: { type: 'string', in: ['parcial', 'total'] } }, {}, { tipo: 'otro' }).status).toBe(400);
            expect(run({ tipo: { type: 'string', in: ['parcial', 'total'] } }, {}, { tipo: 'total' }).nexted).toBe(true);
        });
    });

    describe('itemRules (arrays de objetos)', () => {
        const schema = {
            registros: {
                required: true, type: 'array', minLength: 1, itemRules: {
                    trabajador_id: { required: true, type: 'integer' },
                    fecha: { type: 'string', format: 'date' },
                },
            },
        };

        test('valida cada elemento — item inválido → 400 con índice', () => {
            const r = run(schema, {}, { registros: [{ trabajador_id: 1, fecha: '2026-06-11' }, { fecha: '2026-06-12' }] });
            expect(r.status).toBe(400);
            expect(r.json.error).toMatch(/registros\[1\]\.trabajador_id/);
        });

        test('array vacío con minLength 1 → 400', () => {
            expect(run(schema, {}, { registros: [] }).status).toBe(400);
        });

        test('array válido pasa', () => {
            const r = run(schema, {}, { registros: [{ trabajador_id: 1, fecha: '2026-06-11' }] });
            expect(r.nexted).toBe(true);
        });

        test('strip top-level NO toca el interior de los items', () => {
            const r = run(schema, { strip: true }, { registros: [{ trabajador_id: 1, basura: 'x' }] });
            expect(r.nexted).toBe(true);
            expect(r.req.body.registros[0]).toEqual({ trabajador_id: 1, basura: 'x' });
        });
    });
});

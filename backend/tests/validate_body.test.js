const validateBody = require('../src/middleware/validateBody');

function makeRes() {
    const res = {
        statusCode: 200,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    return res;
}

describe('validateBody middleware', () => {
    test('rechaza si falta campo required', () => {
        const mw = validateBody({ item_id: { required: true, type: 'integer', min: 1 } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: {} }, res, next);
        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/item_id/);
    });

    test('rechaza tipo incorrecto', () => {
        const mw = validateBody({ cantidad: { type: 'integer' } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { cantidad: 'abc' } }, res, next);
        expect(res.statusCode).toBe(400);
        expect(next).not.toHaveBeenCalled();
    });

    test('rechaza fuera de rango (max)', () => {
        const mw = validateBody({ cantidad: { type: 'integer', min: 0, max: 999999 } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { cantidad: 1000000 } }, res, next);
        expect(res.statusCode).toBe(400);
    });

    test('rechaza fuera de rango (min)', () => {
        const mw = validateBody({ cantidad: { type: 'integer', min: 0 } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { cantidad: -1 } }, res, next);
        expect(res.statusCode).toBe(400);
    });

    test('acepta payload válido', () => {
        const mw = validateBody({
            item_id: { required: true, type: 'integer', min: 1 },
            cantidad: { type: 'integer', min: 0, max: 999999 },
        });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { item_id: 5, cantidad: 100 } }, res, next);
        expect(next).toHaveBeenCalled();
        expect(res.statusCode).toBe(200);
    });

    test('valida array no vacío', () => {
        const mw = validateBody({ items: { required: true, type: 'array', minLength: 1 } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { items: [] } }, res, next);
        expect(res.statusCode).toBe(400);
    });

    test('valida itemRules dentro de array', () => {
        const mw = validateBody({
            items: {
                required: true,
                type: 'array',
                minLength: 1,
                itemRules: {
                    item_id: { required: true, type: 'integer', min: 1 },
                    cantidad: { required: true, type: 'integer', min: 1 },
                },
            },
        });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { items: [{ item_id: 1, cantidad: 0 }] } }, res, next);
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toMatch(/cantidad/);
    });

    test('campos opcionales ausentes pasan', () => {
        const mw = validateBody({
            obra_id: { type: 'integer', min: 1 },
            bodega_id: { type: 'integer', min: 1 },
        });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: {} }, res, next);
        expect(next).toHaveBeenCalled();
    });

    test('valida enum (in)', () => {
        const mw = validateBody({ estado: { type: 'string', in: ['pendiente', 'resuelta', 'descartada'] } });
        const res = makeRes();
        const next = jest.fn();
        mw({ body: { estado: 'wrong' } }, res, next);
        expect(res.statusCode).toBe(400);
    });
});

/**
 * Unit del helper de paginación (src/utils/pagination.js).
 *
 * Núcleo del fix: page/limit de req.query llegan como STRING y NO deben
 * bindearse crudos en `LIMIT ? OFFSET ?` (mysql2 los pasa como `LIMIT '20'` y
 * MariaDB tira 500). normalizePagination castea a entero, clampa y da fallback.
 * Ver RUNBOOK.md §6.
 */

const { normalizePagination } = require('../src/utils/pagination');

describe('normalizePagination', () => {
    test('string de req.query → enteros (no strings)', () => {
        const { page, limit, offset } = normalizePagination({ page: '1', limit: '20' });
        expect(page).toBe(1);
        expect(limit).toBe(20);
        expect(offset).toBe(0);
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
    });

    test('page string > 1 calcula offset numérico', () => {
        expect(normalizePagination({ page: '3', limit: '20' })).toEqual({ page: 3, limit: 20, offset: 40 });
    });

    test('sin query usa defaults (page 1, limit 20, offset 0)', () => {
        expect(normalizePagination()).toEqual({ page: 1, limit: 20, offset: 0 });
        expect(normalizePagination({})).toEqual({ page: 1, limit: 20, offset: 0 });
    });

    test('defaultLimit custom se respeta cuando limit no viene', () => {
        expect(normalizePagination({}, 50).limit).toBe(50);
    });

    test('clampa limit al techo (default 200) y a custom maxLimit', () => {
        expect(normalizePagination({ limit: '9999' }).limit).toBe(200);
        expect(normalizePagination({ limit: '9999' }, 50, 100).limit).toBe(100);
    });

    test('basura (NaN, negativo, no-numérico) cae al default y page a 1', () => {
        expect(normalizePagination({ page: 'abc', limit: 'xyz' })).toEqual({ page: 1, limit: 20, offset: 0 });
        expect(normalizePagination({ page: '-5', limit: '-10' })).toEqual({ page: 1, limit: 20, offset: 0 });
        expect(normalizePagination({ page: '0', limit: '0' })).toEqual({ page: 1, limit: 20, offset: 0 });
    });

    test('trunca decimales (LIMIT/OFFSET deben ser enteros)', () => {
        expect(normalizePagination({ page: '2.9', limit: '20.7' })).toEqual({ page: 2, limit: 20, offset: 20 });
    });
});

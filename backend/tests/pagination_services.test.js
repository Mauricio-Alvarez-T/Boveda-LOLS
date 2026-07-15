/**
 * Regresión de binding: los getAll paginados NO deben bindear page/limit como
 * STRING en `LIMIT ? OFFSET ?` (mysql2 → `LIMIT '20'` → MariaDB 500). Cubre los
 * tres servicios que compartían el patrón crudo antes del fix. Ver RUNBOOK.md §6.
 *
 * Mismo caso latente ya cubierto para transferencias en
 * transferencia_getall_filtros.test.js ("paginación").
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const db = require('../src/config/db');
const bombaService = require('../src/services/bomba-hormigon.service');
const discrepanciaService = require('../src/services/discrepancia.service');
const facturaService = require('../src/services/factura-inventario.service');

const lastTwo = (callIdx = 0) => db.query.mock.calls[callIdx][1].slice(-2);

describe('binding de paginación (page/limit string → number) por servicio', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('bomba-hormigon.getAll bindea number y clampa', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await bombaService.getAll({ page: '2', limit: '9999' });
        const [limit, offset] = lastTwo();
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
        expect(limit).toBe(200);  // 9999 clampeado
        expect(offset).toBe(200); // (2-1)*200
    });

    test('discrepancia.getAll bindea number', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await discrepanciaService.getAll({ page: '1', limit: '20' });
        const [limit, offset] = lastTwo();
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
        expect(limit).toBe(20);
        expect(offset).toBe(0);
    });

    test('factura-inventario.getAll bindea number (default limit 20)', async () => {
        db.query
            .mockResolvedValueOnce([[]])                // rows
            .mockResolvedValueOnce([[{ total: 0 }]]);   // count
        await facturaService.getAll({ page: '3', limit: '20' });
        const [limit, offset] = lastTwo(0); // params del SELECT de rows
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
        expect(limit).toBe(20);
        expect(offset).toBe(40); // (3-1)*20
    });

    test('basura en query cae al default sin romper (factura)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);
        await facturaService.getAll({ page: 'abc', limit: 'xyz' });
        const [limit, offset] = lastTwo(0);
        expect(limit).toBe(20);
        expect(offset).toBe(0);
    });
});

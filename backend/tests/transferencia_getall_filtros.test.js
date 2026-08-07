/**
 * Tests de los filtros de búsqueda del listado de transferencias:
 * getAll() acepta fecha_desde / fecha_hasta / solicitante_id (query) y los aplica
 * al WHERE; getSolicitantes() devuelve la lista DISTINCT para el dropdown del filtro.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const transferenciaService = require('../src/services/transferencia.service');
const db = require('../src/config/db');

describe('getAll() — filtros fecha + solicitante', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('aplica fecha_desde / fecha_hasta / solicitante_id al WHERE', async () => {
        db.query
            .mockResolvedValueOnce([[]])                // SELECT rows
            .mockResolvedValueOnce([[{ total: 0 }]]);   // SELECT count

        await transferenciaService.getAll({ fecha_desde: '2026-06-13', fecha_hasta: '2026-06-19', solicitante_id: 7 });

        const sql = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];
        expect(sql).toMatch(/t\.fecha_solicitud >= \?/);
        expect(sql).toMatch(/t\.fecha_solicitud < DATE_ADD\(\?, INTERVAL 1 DAY\)/);
        expect(sql).toMatch(/t\.solicitante_id = \?/);
        expect(params).toEqual(expect.arrayContaining(['2026-06-13', '2026-06-19', 7]));
    });

    test('sin filtros: el WHERE no incluye fecha ni solicitante de query', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({});

        const sql = db.query.mock.calls[0][0];
        expect(sql).not.toMatch(/fecha_solicitud >=/);
        expect(sql).not.toMatch(/fecha_solicitud < DATE_ADD/);
    });

    test('getSolicitantes() devuelve filas DISTINCT', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, nombre: 'Ana' }, { id: 2, nombre: 'Beto' }]]);
        const r = await transferenciaService.getSolicitantes();
        expect(r).toHaveLength(2);
        expect(db.query.mock.calls[0][0]).toMatch(/SELECT DISTINCT/i);
    });
});

describe('getAll() — q + incluir_finalizadas (histórico)', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('q busca por código (LIKE parametrizado) también en el COUNT', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({ q: 'TRF-00' });

        const sql = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];
        expect(sql).toMatch(/t\.codigo LIKE \?/);
        expect(params).toEqual(expect.arrayContaining(['%TRF-00%']));
        // El count reusa el mismo WHERE y los mismos params (sin limit/offset).
        const countSql = db.query.mock.calls[1][0];
        const countParams = db.query.mock.calls[1][1];
        expect(countSql).toMatch(/t\.codigo LIKE \?/);
        expect(countParams).toEqual(expect.arrayContaining(['%TRF-00%']));
    });

    test('q vacío o solo espacios NO agrega LIKE', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({ q: '   ' });
        expect(db.query.mock.calls[0][0]).not.toMatch(/LIKE/);
    });

    test('default (sin flag): el listado sigue excluyendo obras finalizadas', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({});
        expect(db.query.mock.calls[0][0]).toMatch(/es_prueba = 1 OR finalizada = 1/);
    });

    test('incluir_finalizadas=true levanta la exclusión de finalizadas pero NUNCA la de prueba', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({ incluir_finalizadas: 'true' });
        const sql = db.query.mock.calls[0][0];
        expect(sql).not.toMatch(/finalizada = 1/);
        expect(sql).toMatch(/es_prueba = 1/);
    });

    test('incluir_finalizadas=true conserva el scoping por solicitante/bodega (histórico no abre datos ajenos)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({ incluir_finalizadas: 'true' }, 5, 3);
        const sql = db.query.mock.calls[0][0];
        const params = db.query.mock.calls[0][1];
        expect(sql).toMatch(/\(t\.solicitante_id = \? OR t\.destino_bodega_id = \?\)/);
        expect(params[0]).toBe(5);
        expect(params[1]).toBe(3);
    });
});

describe('paginación — page/limit como STRING (req.query) bindean NÚMEROS', () => {
    // Regresión: page/limit vienen de req.query como string; mysql2 bindeaba
    // `LIMIT '20'` y MariaDB lo rechazaba (500 "near ''20' OFFSET 0'"). El fix
    // castea a entero antes del SQL. Con los defaults numéricos NO se disparaba,
    // por eso la UI no lo notaba; cualquier cliente que pasara page/limit rompía.
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('getAll({ page:"1", limit:"20" }) bindea limit/offset como number, no string', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({ page: '1', limit: '20' });

        const params = db.query.mock.calls[0][1];
        const [limit, offset] = params.slice(-2);
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
        expect(limit).toBe(20);
        expect(offset).toBe(0);
    });

    test('getAll respeta page string > 1 (offset numérico correcto)', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await transferenciaService.getAll({ page: '3', limit: '20' });

        const [limit, offset] = db.query.mock.calls[0][1].slice(-2);
        expect(limit).toBe(20);
        expect(offset).toBe(40); // (3-1)*20
    });

    test('getAll clampa limit excesivo a 200 y descarta basura (fallback default 20)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({ page: '1', limit: '9999' });
        expect(db.query.mock.calls[0][1].slice(-2)[0]).toBe(200);

        db.query.mockReset();
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        await transferenciaService.getAll({ page: 'abc', limit: 'xyz' });
        const [limit, offset] = db.query.mock.calls[0][1].slice(-2);
        expect(limit).toBe(20);
        expect(offset).toBe(0);
    });

    test('getMisSolicitudes({ page:"2", limit:"20" }) bindea number', async () => {
        db.query.mockResolvedValueOnce([[]]);

        await transferenciaService.getMisSolicitudes(7, { page: '2', limit: '20' });

        const params = db.query.mock.calls[0][1]; // [userId, limit, offset]
        expect(params[0]).toBe(7);
        expect(typeof params[1]).toBe('number');
        expect(typeof params[2]).toBe('number');
        expect(params[1]).toBe(20);
        expect(params[2]).toBe(20); // (2-1)*20
    });
});

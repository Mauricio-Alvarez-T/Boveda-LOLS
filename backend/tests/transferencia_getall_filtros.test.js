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

/**
 * Filtro por rango de FECHA DE INGRESO en la búsqueda avanzada de Consultas
 * (fiscalizacion.service.searchTrabajadores): "ingresos del período".
 * Extremos opcionales e inclusivos; formato inválido se ignora.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const fiscalizacionService = require('../src/services/fiscalizacion.service');
const db = require('../src/config/db');

describe('searchTrabajadores — filtro fecha_ingreso_desde/hasta', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query
            .mockResolvedValueOnce([[{ total: 5 }]]) // COUNT tipos_documento obligatorios
            .mockResolvedValueOnce([[]]);            // query principal
    });

    const sqlYParams = () => db.query.mock.calls[1];

    test('desde + hasta: rango inclusivo sobre t.fecha_ingreso', async () => {
        await fiscalizacionService.searchTrabajadores({
            fecha_ingreso_desde: '2026-07-24',
            fecha_ingreso_hasta: '2026-08-24',
        });
        const [sql, params] = sqlYParams();
        expect(sql).toMatch(/t\.fecha_ingreso >= \?/);
        expect(sql).toMatch(/t\.fecha_ingreso <= \?/);
        expect(params).toEqual([5, '2026-07-24', '2026-08-24']);
    });

    test('solo desde: aplica un extremo', async () => {
        await fiscalizacionService.searchTrabajadores({ fecha_ingreso_desde: '2026-08-01' });
        const [sql, params] = sqlYParams();
        expect(sql).toMatch(/t\.fecha_ingreso >= \?/);
        expect(sql).not.toMatch(/t\.fecha_ingreso <= \?/);
        expect(params).toEqual([5, '2026-08-01']);
    });

    test('formato inválido se ignora (no entra a la query)', async () => {
        await fiscalizacionService.searchTrabajadores({
            fecha_ingreso_desde: '2026-8-1',
            fecha_ingreso_hasta: "2026-08-24' OR 1=1",
        });
        const [sql, params] = sqlYParams();
        expect(sql).not.toMatch(/t\.fecha_ingreso >= \?/);
        expect(sql).not.toMatch(/t\.fecha_ingreso <= \?/);
        expect(params).toEqual([5]);
    });

    test('combinable con aniversario10m (regresión)', async () => {
        await fiscalizacionService.searchTrabajadores({
            aniversario10m: '2027-06',
            fecha_ingreso_desde: '2026-08-01',
        });
        const [sql, params] = sqlYParams();
        // aniversario10m: rango semiabierto [ago-2026, sep-2026)
        expect(sql).toMatch(/t\.fecha_ingreso IS NOT NULL/);
        expect(sql).toMatch(/t\.fecha_ingreso < \?/);
        // rango nuevo además del de aniversario
        expect(sql).toMatch(/t\.fecha_ingreso >= \?[\s\S]*t\.fecha_ingreso >= \?/);
        expect(params).toEqual([5, '2026-08-01', '2026-09-01', '2026-08-01']);
    });
});

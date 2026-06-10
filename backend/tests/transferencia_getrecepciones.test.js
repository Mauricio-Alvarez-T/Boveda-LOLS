/**
 * Regresión: getRecepciones() debe consultar la tabla de ítems correcta
 * (items_inventario). Antes hacía `LEFT JOIN items` (tabla inexistente) →
 * "Table '...items' doesn't exist" al haber al menos 1 evento con ítems.
 * Los tests previos no lo cazaron porque devolvían 0 eventos (return temprano
 * antes de la 2da query).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const transferenciaService = require('../src/services/transferencia.service');
const db = require('../src/config/db');

describe('getRecepciones() — historial de viajes con ítems', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    test('mapea eventos + items y consulta items_inventario (no un "items" pelado)', async () => {
        db.query
            // 1ª query: cabeceras de recepción (2 viajes)
            .mockResolvedValueOnce([[
                { id: 1, transferencia_id: 5, receptor_id: 9, fecha_recepcion: '2026-06-08 10:00:00', tipo: 'parcial', observacion: 'viaje 1', receptor_nombre: 'Juan Pérez' },
                { id: 2, transferencia_id: 5, receptor_id: 9, fecha_recepcion: '2026-06-08 12:00:00', tipo: 'total', observacion: null, receptor_nombre: 'Juan Pérez' },
            ]])
            // 2ª query: items del viaje 1
            .mockResolvedValueOnce([[
                { id: 11, recepcion_id: 1, transferencia_item_id: 100, cantidad_recibida: 3, observacion: null, item_id: 50, item_descripcion: 'Andamio', unidad: 'U' },
            ]]);

        const result = await transferenciaService.getRecepciones(5);

        expect(result).toHaveLength(2);
        expect(result[0].receptor_nombre).toBe('Juan Pérez');
        expect(result[0].tipo).toBe('parcial');
        expect(result[0].items).toHaveLength(1);
        expect(result[0].items[0].item_descripcion).toBe('Andamio');
        expect(result[1].items).toEqual([]); // viaje 2 sin items

        // La query de ítems debe usar items_inventario, NO un 'items' inexistente.
        const itemsQuery = db.query.mock.calls[1][0];
        expect(itemsQuery).toMatch(/items_inventario/);
        expect(itemsQuery).not.toMatch(/JOIN\s+items\s+i\b/);
    });

    test('sin eventos → retorna [] sin segunda query', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const result = await transferenciaService.getRecepciones(5);
        expect(result).toEqual([]);
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

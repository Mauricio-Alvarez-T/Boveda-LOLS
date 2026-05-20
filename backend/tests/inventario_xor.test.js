jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const inventarioService = require('../src/services/inventario.service');
const { normalizeUbicacion } = require('../src/utils/ubicacionStock');
const db = require('../src/config/db');

describe('Inventario XOR — ubicación obra | bodega', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── normalizeUbicacion ─────────────────────────────────────────
    describe('normalizeUbicacion', () => {
        test('obra+null → { obra, bodega: null }', () => {
            expect(normalizeUbicacion(5, null)).toEqual({ obra: 5, bodega: null });
        });

        test('null+bodega → { obra: null, bodega }', () => {
            expect(normalizeUbicacion(null, 7)).toEqual({ obra: null, bodega: 7 });
        });

        test('obra+bodega → descarta bodega (política mig 050)', () => {
            expect(normalizeUbicacion(5, 7)).toEqual({ obra: 5, bodega: null });
        });

        test('ambos null → throw 400', () => {
            expect(() => normalizeUbicacion(null, null)).toThrow(/requiere obra_id o bodega_id/);
            try { normalizeUbicacion(null, null); } catch (e) { expect(e.statusCode).toBe(400); }
        });

        test('ambos 0 → throw 400', () => {
            expect(() => normalizeUbicacion(0, 0)).toThrow(/requiere/);
        });

        test('strings numéricos válidos → convierte a number', () => {
            expect(normalizeUbicacion('5', null)).toEqual({ obra: 5, bodega: null });
        });
    });

    // ── actualizarStock XOR ────────────────────────────────────────
    describe('actualizarStock — validación XOR', () => {
        test('obra=null + bodega=null → throw 400', async () => {
            await expect(inventarioService.actualizarStock(1, null, null, { cantidad: 10 }))
                .rejects.toThrow(/exactamente uno: obra_id o bodega_id/);
        });

        test('obra=1 + bodega=5 → throw 400', async () => {
            await expect(inventarioService.actualizarStock(1, 1, 5, { cantidad: 10 }))
                .rejects.toThrow(/exactamente uno/);
        });

        test('obra=1 + bodega=null → UPSERT con bodega=NULL', async () => {
            db.query
                .mockResolvedValueOnce([[]]) // SELECT existing → empty
                .mockResolvedValueOnce([{ insertId: 99 }]); // INSERT
            const res = await inventarioService.actualizarStock(1, 5, null, { cantidad: 10 });
            expect(res.id).toBe(99);
            // Confirmar que el INSERT usó bodega=null
            const insertCall = db.query.mock.calls[1];
            expect(insertCall[1]).toEqual([1, 5, null, 10, null]);
        });

        test('obra=null + bodega=7 → UPSERT con obra=NULL', async () => {
            db.query
                .mockResolvedValueOnce([[]]) // SELECT existing → empty
                .mockResolvedValueOnce([{ insertId: 100 }]); // INSERT
            const res = await inventarioService.actualizarStock(1, null, 7, { cantidad: 10 });
            expect(res.id).toBe(100);
            const insertCall = db.query.mock.calls[1];
            expect(insertCall[1]).toEqual([1, null, 7, 10, null]);
        });
    });

    // ── getStockPorObra: JOIN filtra bodega_id IS NULL ─────────────
    describe('getStockPorObra — JOIN excluye filas con bodega_id seteado', () => {
        test('SQL incluye AND us.bodega_id IS NULL en el JOIN', async () => {
            db.query
                .mockResolvedValueOnce([[{ id: 1, nombre: 'OBRA-X' }]]) // obra lookup
                .mockResolvedValueOnce([[]]) // items
                .mockResolvedValueOnce([[]]); // descuento

            await inventarioService.getStockPorObra(1);

            const itemsQuery = db.query.mock.calls[1][0];
            expect(itemsQuery).toMatch(/us\.obra_id = \?\s+AND\s+us\.bodega_id IS NULL/);
        });
    });

    // ── getStockPorBodega: JOIN filtra obra_id IS NULL ─────────────
    describe('getStockPorBodega — JOIN excluye filas con obra_id seteado', () => {
        test('SQL incluye AND us.obra_id IS NULL en el JOIN', async () => {
            db.query
                .mockResolvedValueOnce([[{ id: 1, nombre: 'BODEGA-Y' }]]) // bodega lookup
                .mockResolvedValueOnce([[]]); // items

            await inventarioService.getStockPorBodega(1);

            const itemsQuery = db.query.mock.calls[1][0];
            expect(itemsQuery).toMatch(/us\.bodega_id = \?\s+AND\s+us\.obra_id IS NULL/);
        });
    });
});

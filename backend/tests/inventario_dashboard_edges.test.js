/**
 * Tests Sprint 1 auditoría: edge cases en getDashboardEjecutivo.
 *
 * Cubre:
 *   - delta_pct = null cuando no hay snapshot 30 días atrás (sin comparable)
 *   - delta_pct = 0 cuando mes_anterior=0 y kpisHoy=0 (sin cambio real)
 *   - delta_pct = null cuando mes_anterior=0 y kpisHoy>0 (subió desde 0, no comparable)
 *   - mes_anterior usa snapshot dentro de ventana ±3 días, no primer punto del array
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const inventarioService = require('../src/services/inventario.service');
const db = require('../src/config/db');

describe('getDashboardEjecutivo — edge cases delta_pct', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    /**
     * Helper para mockear las 9+ queries paralelas del service.
     * Devuelve mocks con valores por defecto, permite override de snapshots.
     */
    function mockBaseQueries(snapshotsRows = []) {
        db.query
            // 1. count pendientes
            .mockResolvedValueOnce([[{ count: 0 }]])
            // 2. count en_transito
            .mockResolvedValueOnce([[{ count: 0 }]])
            // 3. discrepancias
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])
            // 4. valor por obra
            .mockResolvedValueOnce([[]])
            // 5a. alertas pendientes
            .mockResolvedValueOnce([[]])
            // 5b. alertas discrepancias
            .mockResolvedValueOnce([[]])
            // 5c. alertas tránsitos atascados
            .mockResolvedValueOnce([[]])
            // 6. rechazos recientes
            .mockResolvedValueOnce([[]])
            // 7. count estancados
            .mockResolvedValueOnce([[{ count: 0 }]])
            // 8. snapshots (30 días)
            .mockResolvedValueOnce([snapshotsRows])
            // 9. categorías valor
            .mockResolvedValueOnce([[]])
            // 10. bombas hormigón mes
            .mockResolvedValueOnce([[{ eventos: 0, obras_distintas: 0, costo_externo: 0 }]]);
    }

    test('delta_pct es null si no hay snapshots', async () => {
        mockBaseQueries([]);
        const result = await inventarioService.getDashboardEjecutivo();
        Object.values(result.historico).forEach(h => {
            expect(h.delta_pct).toBeNull();
        });
    });

    test('delta_pct es 0 si mes_anterior=0 y hoy=0', async () => {
        const today = new Date();
        const target = new Date(today.getTime() - 30 * 86400000);
        const fechaStr = target.toISOString().split('T')[0];
        mockBaseQueries([
            { kpi: 'pendientes', fecha: fechaStr, valor: 0 },
        ]);
        const result = await inventarioService.getDashboardEjecutivo();
        expect(result.historico.pendientes.mes_anterior).toBe(0);
        expect(result.historico.pendientes.delta_pct).toBe(0);
    });

    test('delta_pct es null si mes_anterior=0 y hoy>0 (no comparable)', async () => {
        const today = new Date();
        const target = new Date(today.getTime() - 30 * 86400000);
        const fechaStr = target.toISOString().split('T')[0];

        // Mock con pendientes = 5 hoy, 0 hace 30 días
        db.query
            .mockResolvedValueOnce([[{ count: 5 }]])  // hoy pendientes = 5
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[
                { kpi: 'pendientes', fecha: fechaStr, valor: 0 },
            ]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ eventos: 0, obras_distintas: 0, costo_externo: 0 }]]);

        const result = await inventarioService.getDashboardEjecutivo();
        expect(result.historico.pendientes.mes_anterior).toBe(0);
        expect(result.historico.pendientes.delta_pct).toBeNull();
    });

    test('delta_pct se calcula bien si mes_anterior > 0', async () => {
        const today = new Date();
        const target = new Date(today.getTime() - 30 * 86400000);
        const fechaStr = target.toISOString().split('T')[0];

        // hoy = 12, hace 30 días = 10 → +20%
        db.query
            .mockResolvedValueOnce([[{ count: 12 }]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[
                { kpi: 'pendientes', fecha: fechaStr, valor: 10 },
            ]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ eventos: 0, obras_distintas: 0, costo_externo: 0 }]]);

        const result = await inventarioService.getDashboardEjecutivo();
        expect(result.historico.pendientes.mes_anterior).toBe(10);
        expect(result.historico.pendientes.delta_pct).toBe(20);
    });

    test('mes_anterior toma snapshot dentro de ventana ±3 días, no fuera de ella', async () => {
        const today = new Date();
        // Snapshot solo hace 7 días (fuera de ventana ±3 alrededor de 30 días)
        const tooClose = new Date(today.getTime() - 7 * 86400000);
        const fechaStr = tooClose.toISOString().split('T')[0];

        mockBaseQueries([
            { kpi: 'pendientes', fecha: fechaStr, valor: 100 },
        ]);
        const result = await inventarioService.getDashboardEjecutivo();
        // No debe usar el punto de hace 7 días como mes_anterior
        expect(result.historico.pendientes.mes_anterior).toBeNull();
        expect(result.historico.pendientes.delta_pct).toBeNull();
    });
});

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(),
        query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(),
        rollback: jest.fn(),
        release: jest.fn()
    })
}));

const dashboardService = require('../src/services/dashboard.service');
const pool = require('../src/config/db');

describe('Dashboard Service - 10 Months Rule', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('should add 10 months alert when in the last week of the month', async () => {
        // Set date to March 25, 2026 (last week of March)
        const mockDate = new Date(2026, 2, 25); // March is 2
        jest.useFakeTimers().setSystemTime(mockDate);

        const mockWorkers = [
            { id: 1, rut: '123-4', nombres: 'Juan', apellido_paterno: 'Perez', fecha_ingreso: '2025-06-01', empresa_nombre: 'Empresa A', fecha_cumple_10m: '2026-04-01' }
        ];

        // Mock pool.query to return the workers for the 10m query
        // The getSummary function does many queries, we need to handle them or just mock the one we care about
        pool.query.mockResolvedValue([mockWorkers]);

        const result = await dashboardService.getSummary(null, [{ modulo: 'trabajadores', puede_ver: true }], 'Test User');

        // Verify the alert was added
        const alert10m = result.alerts.find(a => a.titulo === '10 Meses de Contrato');
        expect(alert10m).toBeDefined();
        expect(alert10m.count).toBe(1);
        expect(alert10m.mensaje).toContain('cumplen 10 meses');

        jest.useRealTimers();
    });

    test('should NOT add 10 months alert when NOT in the last week of the month', async () => {
        // Set date to March 10, 2026 (NOT last week)
        const mockDate = new Date(2026, 2, 10);
        jest.useFakeTimers().setSystemTime(mockDate);

        // Mock pool.query to return empty for whatever it asks
        pool.query.mockResolvedValue([[]]);

        const result = await dashboardService.getSummary(null, [], 'Test User');

        const alert10m = result.alerts.find(a => a.titulo === '10 Meses de Contrato');
        expect(alert10m).toBeUndefined();

        jest.useRealTimers();
    });
});

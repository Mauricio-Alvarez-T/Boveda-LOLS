const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

jest.mock('../src/config/db');

describe('Asistencia Service - Superposition Logic', () => {
    let mockConn;

    beforeEach(() => {
        jest.clearAllMocks();
        mockConn = {
            beginTransaction: jest.fn(),
            query: jest.fn(),
            commit: jest.fn(),
            rollback: jest.fn(),
            release: jest.fn(),
        };
        db.getConnection.mockResolvedValue(mockConn);
    });

    test('should deactivate all overlapping periods if new period is LM', async () => {
        const data = {
            trabajador_id: 1,
            obra_id: 1,
            estado_id: 5, // Assume 5 is LM
            fecha_inicio: '2026-03-01',
            fecha_fin: '2026-03-05'
        };

        // Mock state check: return LM code
        mockConn.query.mockResolvedValueOnce([[{ codigo: 'LM' }]]); // SELECT codigo FROM estados_asistencia
        mockConn.query.mockResolvedValueOnce([{}]); // UPDATE periodos_ausencia
        mockConn.query.mockResolvedValueOnce([{ insertId: 10 }]); // INSERT INTO periodos_ausencia
        mockConn.query.mockResolvedValue([{}]); // Multiple INSERT/UPDATE asistencias

        await asistenciaService.crearPeriodo(data, 1, {});

        // Verify that the UPDATE query for LM was called (noea.codigo <> 'LM' filter should NOT be there)
        const updateCall = mockConn.query.mock.calls.find(call => 
            call[0].includes('UPDATE periodos_ausencia') && !call[0].includes('ea.codigo <> \'LM\'')
        );
        expect(updateCall).toBeDefined();
        expect(mockConn.commit).toHaveBeenCalled();
    });

    test('should NOT deactivate LM periods if new period is NOT LM', async () => {
        const data = {
            trabajador_id: 1,
            obra_id: 1,
            estado_id: 3, // Assume 3 is Vacaciones
            fecha_inicio: '2026-03-01',
            fecha_fin: '2026-03-05'
        };

        // Mock state check: return VAC code
        mockConn.query.mockResolvedValueOnce([[{ codigo: 'VAC' }]]); 
        mockConn.query.mockResolvedValueOnce([{}]); // UPDATE periodos_ausencia
        mockConn.query.mockResolvedValueOnce([{ insertId: 11 }]); 
        mockConn.query.mockResolvedValue([{}]);

        await asistenciaService.crearPeriodo(data, 1, {});

        // Verify that the UPDATE query included the filter to respect LMs
        const updateCall = mockConn.query.mock.calls.find(call => 
            call[0].includes('UPDATE periodos_ausencia') && call[0].includes('ea.codigo <> \'LM\'')
        );
        expect(updateCall).toBeDefined();
    });
});

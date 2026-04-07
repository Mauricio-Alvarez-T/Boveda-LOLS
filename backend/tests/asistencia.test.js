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

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

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

        // Mock implementacion para consultas dinamicas
        mockConn.query.mockImplementation((sql, params) => {
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('fecha_ingreso')) return Promise.resolve([[{ fecha_ingreso: '2020-01-01', fecha_desvinculacion: null }]]);
            if (sql.includes('SELECT codigo FROM estados_asistencia')) return Promise.resolve([[{ codigo: 'LM' }]]);
            if (sql.includes('UPDATE periodos_ausencia')) return Promise.resolve([{}]);
            if (sql.includes('INSERT INTO periodos_ausencia')) return Promise.resolve([{ insertId: 10 }]);
            return Promise.resolve([[]]);
        });

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

        // Mock implementacion para consultas dinamicas
        mockConn.query.mockImplementation((sql, params) => {
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('fecha_ingreso')) return Promise.resolve([[{ fecha_ingreso: '2020-01-01', fecha_desvinculacion: null }]]);
            if (sql.includes('SELECT codigo FROM estados_asistencia')) return Promise.resolve([[{ codigo: 'VAC' }]]);
            if (sql.includes('UPDATE periodos_ausencia')) return Promise.resolve([{}]);
            if (sql.includes('INSERT INTO periodos_ausencia')) return Promise.resolve([{ insertId: 11 }]);
            return Promise.resolve([[]]);
        });

        await asistenciaService.crearPeriodo(data, 1, {});

        // Verify that the UPDATE query included the filter to respect LMs
        const updateCall = mockConn.query.mock.calls.find(call => 
            call[0].includes('UPDATE periodos_ausencia') && call[0].includes('ea.codigo <> \'LM\'')
        );
        expect(updateCall).toBeDefined();
    });
});

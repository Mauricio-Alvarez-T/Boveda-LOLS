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

    test('LM omite sábados, domingos y feriados al generar filas de asistencia (bug RRHH abril 2026)', async () => {
        // Período LM lunes 2026-04-13 a domingo 2026-04-19 (7 días).
        // Debe insertar SOLO 5 filas (lun-vie). Sat/sun + cualquier feriado se saltan.
        const data = {
            trabajador_id: 7,
            obra_id: 5,
            estado_id: 8, // LM
            fecha_inicio: '2026-04-13', // lunes
            fecha_fin: '2026-04-19',    // domingo
        };

        const insertCalls = [];
        mockConn.query.mockImplementation((sql, params) => {
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('fecha_ingreso')) return Promise.resolve([[{ fecha_ingreso: '2020-01-01', fecha_desvinculacion: null }]]);
            if (sql.includes('SELECT codigo FROM estados_asistencia')) return Promise.resolve([[{ codigo: 'LM' }]]);
            if (sql.includes('SELECT dia_semana')) return Promise.resolve([[
                { dia_semana: 'lun', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'mar', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'mie', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'jue', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'vie', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
            ]]);
            if (sql.includes('UPDATE periodos_ausencia')) return Promise.resolve([{}]);
            if (sql.includes('INSERT INTO periodos_ausencia')) return Promise.resolve([{ insertId: 12 }]);
            if (sql.includes('INSERT INTO asistencias')) {
                insertCalls.push(params);
                return Promise.resolve([{}]);
            }
            return Promise.resolve([[]]);
        });

        const result = await asistenciaService.crearPeriodo(data, 1, {});

        // 5 filas insertadas, 2 saltadas (sat 18 + dom 19).
        expect(insertCalls.length).toBe(5);
        expect(result.dias_afectados).toBe(5);
        expect(result.dias_saltados).toBe(2);
        expect(result.tipo).toBe('LM');

        // Las fechas insertadas son lun-vie únicamente.
        const fechasInsertadas = insertCalls.map(c => c[2]).sort();
        expect(fechasInsertadas).toEqual([
            '2026-04-13', '2026-04-14', '2026-04-15', '2026-04-16', '2026-04-17'
        ]);
    });

    test('LM también salta feriados que caen en día hábil', async () => {
        // Período LM 2026-05-01 (vie, FERIADO) a 2026-05-04 (lun) → 4 días calendario.
        // Debe saltar el viernes (feriado) e insertar solo lunes (sab/dom también saltados).
        const data = {
            trabajador_id: 1,
            obra_id: 1,
            estado_id: 8, // LM
            fecha_inicio: '2026-05-01',
            fecha_fin: '2026-05-04',
        };

        const insertCalls = [];
        mockConn.query.mockImplementation((sql, params) => {
            if (sql.includes('FROM feriados')) return Promise.resolve([[
                { fecha: '2026-05-01' }
            ]]);
            if (sql.includes('fecha_ingreso')) return Promise.resolve([[{ fecha_ingreso: '2020-01-01', fecha_desvinculacion: null }]]);
            if (sql.includes('SELECT codigo FROM estados_asistencia')) return Promise.resolve([[{ codigo: 'LM' }]]);
            if (sql.includes('SELECT dia_semana')) return Promise.resolve([[
                { dia_semana: 'lun', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'mar', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'mie', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'jue', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
                { dia_semana: 'vie', hora_entrada: '08:00:00', hora_salida: '18:00:00' },
            ]]);
            if (sql.includes('UPDATE periodos_ausencia')) return Promise.resolve([{}]);
            if (sql.includes('INSERT INTO periodos_ausencia')) return Promise.resolve([{ insertId: 13 }]);
            if (sql.includes('INSERT INTO asistencias')) {
                insertCalls.push(params);
                return Promise.resolve([{}]);
            }
            return Promise.resolve([[]]);
        });

        const result = await asistenciaService.crearPeriodo(data, 1, {});

        // 4 días calendario: vie(feriado), sab, dom, lun → 1 inserción (lun), 3 saltadas.
        expect(result.dias_afectados).toBe(1);
        expect(result.dias_saltados).toBe(3);
        const fechas = insertCalls.map(c => c[2]);
        expect(fechas).toEqual(['2026-05-04']);
    });

    test('Períodos NO-LM (vacaciones) mantienen comportamiento histórico — insertan todos los días', async () => {
        const data = {
            trabajador_id: 7,
            obra_id: 5,
            estado_id: 3, // VAC
            fecha_inicio: '2026-04-13', // lunes
            fecha_fin: '2026-04-19',    // domingo
        };

        const insertCalls = [];
        mockConn.query.mockImplementation((sql, params) => {
            if (sql.includes('FROM feriados')) return Promise.resolve([[]]);
            if (sql.includes('fecha_ingreso')) return Promise.resolve([[{ fecha_ingreso: '2020-01-01', fecha_desvinculacion: null }]]);
            if (sql.includes('SELECT codigo FROM estados_asistencia')) return Promise.resolve([[{ codigo: 'VAC' }]]);
            if (sql.includes('UPDATE periodos_ausencia')) return Promise.resolve([{}]);
            if (sql.includes('INSERT INTO periodos_ausencia')) return Promise.resolve([{ insertId: 14 }]);
            if (sql.includes('INSERT INTO asistencias')) {
                insertCalls.push(params);
                return Promise.resolve([{}]);
            }
            return Promise.resolve([[]]);
        });

        const result = await asistenciaService.crearPeriodo(data, 1, {});

        // 7 días calendario completos.
        expect(insertCalls.length).toBe(7);
        expect(result.dias_afectados).toBe(7);
        expect(result.dias_saltados).toBe(0);
        expect(result.tipo).toBe('OTRO');
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

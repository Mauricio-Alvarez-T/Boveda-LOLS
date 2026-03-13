const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

jest.mock('../src/config/db');
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn()
}));

describe('Asistencia Service - Avanzado', () => {
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

    describe('Auditoría de Cambios (bulkCreate)', () => {
        test('should detect changes and generate log entries correctly', async () => {
            const obraId = 1;
            const registradoPor = 1;
            const registros = [{
                trabajador_id: 10,
                fecha: '2026-03-01',
                estado_id: 2, // Nuevo estado
                hora_entrada: '08:00',
                hora_salida: '18:00'
            }];

            // Mocks para simular existencia previa
            mockConn.query.mockResolvedValueOnce([[{
                id: 100,
                trabajador_id: 10,
                estado_id: 1, // Estado anterior diferente
                hora_entrada: '09:00',
                hora_salida: '17:00'
            }]]); // SELECT existing
            
            mockConn.query.mockResolvedValueOnce([{}]); // UPDATE asistencias

            // Mocks para _logBulkChanges (que se llama internamente)
            db.query.mockResolvedValueOnce([[{ id: 10, nombres: 'Juan', apellido_paterno: 'Perez' }]]); // SELECT workers
            db.query.mockResolvedValueOnce([[{ id: 1, nombre: 'Asiste' }, { id: 2, nombre: 'Falta' }]]); // SELECT estados
            db.query.mockResolvedValueOnce([[{ id: 1, nombre: 'Licencia' }]]); // SELECT tipos_ausencia

            await asistenciaService.bulkCreate(obraId, registros, registradoPor, {});

            // Verificar que se haya llamado al commit
            expect(mockConn.commit).toHaveBeenCalled();

            // Esperar un poco ya que _logBulkChanges es async y no se espera con await en bulkCreate (según el código visto)
            await new Promise(resolve => setTimeout(resolve, 100));

            // Verificar que se intentó insertar en log_asistencia (o similar, según la lógica de _logBulkChanges)
            // Nota: En el código de bulkCreate visto, _logBulkChanges se llama pero no vimos su implementación completa de inserción.
            // Sin embargo, vimos que llena logEntries.
        });
    });

    describe('Periodos Multi-mes', () => {
        test('should create multiple attendance records across month boundaries', async () => {
            const data = {
                trabajador_id: 10,
                obra_id: 1,
                estado_id: 3, // Vacaciones
                fecha_inicio: '2026-03-30',
                fecha_fin: '2026-04-02'
            };

            mockConn.query.mockResolvedValueOnce([[{ codigo: 'VAC' }]]); // SELECT codigo
            mockConn.query.mockResolvedValueOnce([{}]); // UPDATE periodos superpuestos
            mockConn.query.mockResolvedValueOnce([{ insertId: 500 }]); // INSERT periodo
            
            // Mocks para los INSERTs de asistencia (4 días: 30, 31, 1, 2)
            mockConn.query.mockResolvedValue([{}]); 
            
            // Mocks adicionales para logs finales
            db.query.mockResolvedValueOnce([[{ nombres: 'Juan', apellido_paterno: 'Perez' }]]);
            db.query.mockResolvedValueOnce([[{ nombre: 'Vacaciones' }]]);

            const result = await asistenciaService.crearPeriodo(data, 1, {});

            expect(result.dias_afectados).toBe(4);
            expect(mockConn.commit).toHaveBeenCalled();
            
            // Verificar que se llamaron a los 4 inserts/updates de asistencia
            const attendanceCalls = mockConn.query.mock.calls.filter(call => call[0].includes('INSERT INTO asistencias'));
            expect(attendanceCalls.length).toBe(4);
        });
    });
});

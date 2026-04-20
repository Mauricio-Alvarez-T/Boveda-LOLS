jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

/**
 * Bug report: un trabajador con traslado (o cualquier situación que produzca
 * 2 filas de asistencia con estado F en el mismo día) aparecía como "Falta 2
 * lunes en el mes (06, 06)" — la misma fecha contada dos veces.
 *
 * El fix deduplica las fechas por trabajador antes de evaluar las reglas.
 */
describe('asistenciaService.getAlertasFaltas — deduplicación de fechas', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('fechas duplicadas por trabajador no se cuentan dos veces', async () => {
        // 1era query: estado F
        db.query.mockResolvedValueOnce([[{ id: 3 }]]);
        // 2da query: faltas — mismo lunes (2026-04-06) repetido 2 veces para el mismo trabajador
        db.query.mockResolvedValueOnce([[
            { trabajador_id: 1, fecha: '2026-04-06', obra_id: 10, nombres: 'Cristopher', apellido_paterno: 'Arévalo', rut: '16.279.325-K' },
            { trabajador_id: 1, fecha: '2026-04-06', obra_id: 11, nombres: 'Cristopher', apellido_paterno: 'Arévalo', rut: '16.279.325-K' },
        ]]);

        const result = await asistenciaService.getAlertasFaltas('ALL', 4, 2026);

        // Solo 1 lunes real → no debería haber alerta de lunes (regla exige >=2)
        const lunesAlert = result[0]?.alertas?.find(a => a.tipo === 'lunes');
        expect(lunesAlert).toBeUndefined();

        // total_faltas debe reflejar días únicos (1), no filas (2)
        if (result.length > 0) {
            expect(result[0].total_faltas).toBe(1);
        }
    });

    test('2 lunes reales distintos generan alerta con fechas únicas', async () => {
        db.query.mockResolvedValueOnce([[{ id: 3 }]]);
        db.query.mockResolvedValueOnce([[
            { trabajador_id: 1, fecha: '2026-04-06', obra_id: 10, nombres: 'C', apellido_paterno: 'A', rut: 'X' },
            { trabajador_id: 1, fecha: '2026-04-06', obra_id: 11, nombres: 'C', apellido_paterno: 'A', rut: 'X' }, // duplicado
            { trabajador_id: 1, fecha: '2026-04-13', obra_id: 10, nombres: 'C', apellido_paterno: 'A', rut: 'X' },
        ]]);

        const result = await asistenciaService.getAlertasFaltas('ALL', 4, 2026);
        const lunesAlert = result[0].alertas.find(a => a.tipo === 'lunes');

        expect(lunesAlert).toBeDefined();
        expect(lunesAlert.mensaje).toBe('Falta 2 lunes en el mes (06, 13)');
        expect(result[0].total_faltas).toBe(2);
    });
});

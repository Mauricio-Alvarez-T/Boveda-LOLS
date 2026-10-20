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

describe('asistenciaService.getFaltasMes — todos los que faltaron (tarjeta «Faltas del mes»)', () => {
    beforeEach(() => jest.clearAllMocks());

    const filas = [
        // Trabajador 1: una sola falta → no gatilla reglas, pero sale en getFaltasMes.
        { trabajador_id: 1, fecha: '2026-10-07', obra_id: 10, obra_nombre: 'TOESCA 2770', nombres: 'Ana', apellido_paterno: 'Soto', rut: '1-9' },
        // Trabajador 2: 2 días seguidos → reiterada; su falta más reciente fue en otra obra.
        { trabajador_id: 2, fecha: '2026-10-08', obra_id: 10, obra_nombre: 'TOESCA 2770', nombres: 'Luis', apellido_paterno: 'Rojas', rut: '2-7' },
        { trabajador_id: 2, fecha: '2026-10-09', obra_id: 11, obra_nombre: 'DOMEYKO', nombres: 'Luis', apellido_paterno: 'Rojas', rut: '2-7' },
    ];

    test('incluye a quien no llega a ninguna regla, con alertas vacías, y la obra de su última falta', async () => {
        db.query.mockResolvedValueOnce([[{ id: 3 }]]);
        db.query.mockResolvedValueOnce([filas]);

        const result = await asistenciaService.getFaltasMes('ALL', 10, 2026);

        expect(result).toHaveLength(2);
        const ana = result.find(t => t.trabajador_id === 1);
        expect(ana).toMatchObject({ total_faltas: 1, fechas: ['2026-10-07'], alertas: [], obra_nombre: 'TOESCA 2770' });
        const luis = result.find(t => t.trabajador_id === 2);
        expect(luis.total_faltas).toBe(2);
        expect(luis.obra_nombre).toBe('DOMEYKO');
        expect(luis.alertas.map(a => a.tipo)).toEqual(['consecutivas']);
        // La query trae el nombre de la obra donde ocurrió la falta.
        expect(db.query.mock.calls[1][0]).toMatch(/LEFT JOIN obras o ON o\.id = a\.obra_id/);
    });

    test('getAlertasFaltas sigue devolviendo solo a los reiterados', async () => {
        db.query.mockResolvedValueOnce([[{ id: 3 }]]);
        db.query.mockResolvedValueOnce([filas]);

        const result = await asistenciaService.getAlertasFaltas('ALL', 10, 2026);

        expect(result.map(t => t.trabajador_id)).toEqual([2]);
    });

    test('sin estado F activo → lista vacía', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(asistenciaService.getFaltasMes('ALL', 10, 2026)).resolves.toEqual([]);
    });
});

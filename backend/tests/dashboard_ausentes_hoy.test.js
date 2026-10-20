jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const pool = require('../src/config/db');
const dashboardService = require('../src/services/dashboard.service');
const asistenciaService = require('../src/services/asistencia.service');
const { fechaChile, sumarDias } = require('../src/utils/fechaChile');

/**
 * Tarjeta «Asistencia» del Inicio, fase 1 (2026-10-20): /dashboard/summary trae los ausentes de hoy
 * completos y agrupados por motivo, y «hoy» es el día de Chile, no el de UTC.
 */
describe('fechaChile', () => {
    test('a las 22:30 de Chile (01:30 UTC del día siguiente) sigue siendo el mismo día', () => {
        // 2026-10-21T01:30Z = 2026-10-20 22:30 en Chile (UTC-3 en horario de verano).
        expect(fechaChile(new Date('2026-10-21T01:30:00Z'))).toBe('2026-10-20');
    });

    test('sumarDias cruza meses y años sin zona horaria', () => {
        expect(sumarDias('2026-11-01', -1)).toBe('2026-10-31');
        expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    });
});

describe('dashboard.getSummary — ausentesHoy', () => {
    const permisos = ['asistencia.ver'];
    const ausente = (id, codigo, estado) => ({
        trabajador_id: id, rut: `${id}-0`, nombres: 'N', apellido_paterno: `P${id}`, apellido_materno: null,
        codigo, estado, obra: 'TOESCA',
    });

    afterEach(() => {
        jest.restoreAllMocks();
        pool.query.mockReset();
        pool.query.mockResolvedValue([[]]);
    });

    test('agrupa por código, más numeroso primero, y deja ausentesDetalle en 20', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockResolvedValue([]);
        const filas = [
            ...Array.from({ length: 15 }, (_, i) => ausente(i + 1, 'F', 'Falta')),
            ausente(100, 'LM', 'Licencia Médica'),
            ausente(101, 'LM', 'Licencia Médica'),
            ausente(102, 'V', 'Vacaciones'),
            ausente(103, 'PSG', 'Permiso sin goce'),
            ausente(104, 'PSG', 'Permiso sin goce'),
            ausente(105, 'PSG', 'Permiso sin goce'),
        ];
        pool.query.mockImplementation(async (sql) => {
            if (sql.includes('LIMIT 500')) return [filas];
            return [[]];
        });

        const r = await dashboardService.getSummary(null, permisos, 'Test');

        expect(r.ausentesHoy.porEstado.map(g => [g.codigo, g.n])).toEqual([['F', 15], ['PSG', 3], ['LM', 2], ['V', 1]]);
        expect(r.ausentesHoy.lista).toHaveLength(21);
        expect(r.ausentesDetalle).toHaveLength(20);
        expect(r.ausentesDetalle[0]).toEqual({ nombres: 'N', apellido_paterno: 'P1', estado: 'Falta', obra: 'TOESCA' });
    });

    test('pregunta por el día de Chile', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockResolvedValue([]);
        await dashboardService.getSummary(null, permisos, 'Test');
        const llamada = pool.query.mock.calls.find(([sql]) => sql.includes('LIMIT 500'));
        expect(llamada[1][0]).toBe(fechaChile());
    });
});

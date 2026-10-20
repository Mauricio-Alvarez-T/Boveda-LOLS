jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const dashboardService = require('../src/services/dashboard.service');
const asistenciaService = require('../src/services/asistencia.service');

/**
 * Tarjeta «Faltas del mes» del Inicio (2026-10-20): /dashboard/summary trae a TODOS los que faltaron
 * en el mes (más faltas arriba), además de los reiterados de siempre en `trabajadoresConAlertas`.
 */
describe('dashboard.getSummary — faltasMes', () => {
    const permisos = ['asistencia.ver'];
    const t = (id, apellido, total, tipos = []) => ({
        trabajador_id: id, nombres: 'X', apellido_paterno: apellido, rut: `${id}-0`, obra_nombre: 'OBRA',
        total_faltas: total, fechas: [], alertas: tipos.map(tipo => ({ tipo, mensaje: tipo })),
    });

    afterEach(() => jest.restoreAllMocks());

    test('ordena por cantidad de faltas y cuenta trabajadores, faltas y reiterados', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockResolvedValue([
            t(1, 'Soto', 1),
            t(2, 'Rojas', 3, ['acumuladas']),
            t(3, 'Arce', 1),
            t(4, 'Muñoz', 2, ['consecutivas']),
        ]);

        const r = await dashboardService.getSummary(null, permisos, 'Test');

        expect(r.faltasMes).toMatchObject({ trabajadores: 4, faltas: 7, reiteradas: 2 });
        expect(r.faltasMes.lista.map(x => x.trabajador_id)).toEqual([2, 4, 3, 1]);
        expect(r.trabajadoresConAlertas.map(x => x.trabajador_id)).toEqual([2, 4]);
    });

    test('si el cálculo falla, el Inicio no se cae: faltasMes null', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockRejectedValue(new Error('boom'));
        const r = await dashboardService.getSummary(null, permisos, 'Test');
        expect(r.faltasMes).toBeNull();
        expect(r.trabajadoresConAlertas).toEqual([]);
    });
});

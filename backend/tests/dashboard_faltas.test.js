jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));

const dashboardService = require('../src/services/dashboard.service');
const asistenciaService = require('../src/services/asistencia.service');

/**
 * Tarjeta «Faltas del mes» del Inicio (2026-10-20): /dashboard/summary trae a los reiterados del
 * Art. 160 N°3 (2 lunes, 3 días o 2 seguidos), con más faltas arriba y su total real (sin el corte en 20).
 */
describe('dashboard.getSummary — faltasMes', () => {
    const permisos = ['asistencia.ver'];
    const t = (id, apellido, total, tipos = []) => ({
        trabajador_id: id, nombres: 'X', apellido_paterno: apellido, rut: `${id}-0`, obra_nombre: 'OBRA',
        total_faltas: total, fechas: [], alertas: tipos.map(tipo => ({ tipo, mensaje: tipo })),
    });

    afterEach(() => jest.restoreAllMocks());

    test('solo reiterados, ordenados por cantidad de faltas', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockResolvedValue([
            t(1, 'Soto', 1),
            t(2, 'Rojas', 3, ['acumuladas']),
            t(3, 'Arce', 1),
            t(4, 'Muñoz', 2, ['consecutivas']),
        ]);

        const r = await dashboardService.getSummary(null, permisos, 'Test');

        expect(r.faltasMes.reiterados).toBe(2);
        expect(r.faltasMes.lista.map(x => x.trabajador_id)).toEqual([2, 4]);
        expect(r.trabajadoresConAlertas.map(x => x.trabajador_id)).toEqual([2, 4]);
    });

    test('el total de reiterados no se corta en 20', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockResolvedValue(
            Array.from({ length: 25 }, (_, i) => t(i + 1, `A${i}`, 3, ['acumuladas'])));
        const r = await dashboardService.getSummary(null, permisos, 'Test');
        expect(r.faltasMes.reiterados).toBe(25);
        expect(r.trabajadoresConAlertas).toHaveLength(20);
    });

    test('si el cálculo falla, el Inicio no se cae: faltasMes null', async () => {
        jest.spyOn(asistenciaService, 'getFaltasMes').mockRejectedValue(new Error('boom'));
        const r = await dashboardService.getSummary(null, permisos, 'Test');
        expect(r.faltasMes).toBeNull();
        expect(r.trabajadoresConAlertas).toEqual([]);
    });
});

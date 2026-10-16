import { fechaDelDia, resumenDelDia, type EstadoObraHoy } from './resumenInicio';

const VIERNES = 5;
const SABADO = 6;
const DOMINGO = 0;

const estado = (pares: [number, string, boolean][]): Record<string, EstadoObraHoy> =>
    Object.fromEntries(pares.map(([id, nombre, guardada]) => [String(id), { nombre, guardada }]));

const staging = estado([
    [38, 'Obra Demo Centro', true],
    [39, 'Obra Demo Sur', false],
    [10, 'EW 195', false],
    [22, 'Domeyko', false],
]);

describe('resumenDelDia (tarjeta verde del Inicio)', () => {
    test('obras sin guardar: frase en plural, obras en orden alfabético y la única lista por nombre', () => {
        const r = resumenDelDia(staging, { vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES });
        expect(r.total).toBe(4);
        expect(r.guardadas).toBe(1);
        expect(r.sinGuardar).toEqual(['Domeyko', 'EW 195', 'Obra Demo Sur']);
        expect(r.titulo).toBe('3 obras aún no guardan la asistencia de hoy');
        expect(r.detalle).toBe('Obra Demo Centro ya está lista.');
    });

    test('una sola obra sin guardar va en singular; los vehículos vencidos se suman al detalle', () => {
        const r = resumenDelDia(estado([[1, 'A', true], [2, 'B', true], [3, 'C', false]]), { vehiculosVencidos: 3, otrosPendientes: 0, diaSemana: VIERNES });
        expect(r.titulo).toBe('1 obra aún no guarda la asistencia de hoy');
        expect(r.detalle).toBe('2 de 3 obras ya están listas. Además hay 3 vencimientos de vehículos.');
    });

    test('ninguna guardada todavía', () => {
        const r = resumenDelDia(estado([[1, 'A', false], [2, 'B', false]]), { vehiculosVencidos: 1, otrosPendientes: 0, diaSemana: VIERNES });
        expect(r.detalle).toBe('Ninguna obra la ha guardado todavía. Además hay 1 vencimiento de vehículos.');
    });

    test('con una obra elegida, el detalle cuenta cómo va esa obra', () => {
        expect(resumenDelDia(staging, { obraId: 38, vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES }).detalle)
            .toBe('Obra Demo Centro ya está lista.');
        expect(resumenDelDia(staging, { obraId: 39, vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES }).detalle)
            .toBe('Obra Demo Sur todavía no la guarda.');
        // Obra elegida que no está en la lista (finalizada o de prueba): cae al resumen general.
        expect(resumenDelDia(staging, { obraId: 999, vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES }).detalle)
            .toBe('Obra Demo Centro ya está lista.');
    });

    test('todas guardadas: lo que queda en la bandeja o "Todo al día"', () => {
        const todas = estado([[1, 'A', true], [2, 'B', true]]);
        expect(resumenDelDia(todas, { vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES }))
            .toMatchObject({ titulo: 'Asistencia de hoy guardada en todas las obras', detalle: 'Todo al día.', sinGuardar: [] });
        expect(resumenDelDia(todas, { vehiculosVencidos: 0, otrosPendientes: 2, diaSemana: VIERNES }).detalle)
            .toBe('Quedan 2 pendientes en la bandeja.');
        expect(resumenDelDia(todas, { vehiculosVencidos: 2, otrosPendientes: 2, diaSemana: VIERNES }).detalle)
            .toBe('Además hay 2 vencimientos de vehículos.');
    });

    test('fin de semana: no cobra la asistencia como pendiente', () => {
        for (const dia of [SABADO, DOMINGO]) {
            const r = resumenDelDia(staging, { vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: dia });
            expect(r.finDeSemana).toBe(true);
            expect(r.titulo).toBe('Fin de semana');
            expect(r.detalle).toBe('La asistencia se marca de lunes a viernes.');
        }
    });

    test('sin permiso de asistencia (sin obras): habla de la bandeja', () => {
        expect(resumenDelDia({}, { vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES }))
            .toMatchObject({ total: 0, titulo: 'Todo al día', detalle: 'Nada urgente por resolver.' });
        expect(resumenDelDia({}, { vehiculosVencidos: 0, otrosPendientes: 1, diaSemana: VIERNES }).titulo)
            .toBe('Tienes 1 pendiente hoy');
        expect(resumenDelDia({}, { vehiculosVencidos: 4, otrosPendientes: 5, diaSemana: VIERNES }))
            .toMatchObject({ titulo: 'Tienes 5 pendientes hoy', detalle: 'Además hay 4 vencimientos de vehículos.' });
    });

    test('limpia espacios de los nombres (el backend trae "HAWKINS ")', () => {
        const r = resumenDelDia(estado([[1, 'HAWKINS ', false], [2, 'Abate 80', true]]), { vehiculosVencidos: 0, otrosPendientes: 0, diaSemana: VIERNES });
        expect(r.sinGuardar).toEqual(['HAWKINS']);
    });
    test('fechaDelDia: día y mes en castellano, sin coma ni año', () => {
        expect(fechaDelDia(new Date(2026, 9, 16, 12))).toBe('Viernes 16 de octubre');
        expect(fechaDelDia(new Date(2026, 0, 4, 12))).toBe('Domingo 4 de enero');
    });
});

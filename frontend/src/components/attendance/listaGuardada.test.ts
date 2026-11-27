import { listaGuardada } from './listaGuardada';

describe('¿el día tiene la lista guardada? (misma regla que la campana, Marcos 2026-11-27)', () => {
    test('sin ninguna fila: no está guardada', () => {
        expect(listaGuardada([], 16)).toBe(false);
    });

    test('RIVAS VICUÑA 25-11: solo las licencias y vacaciones puestas por adelantado no son una lista', () => {
        const periodos = [{ id: 1, de_periodo: 1 }, { id: 2, de_periodo: 1 }, { id: 3, de_periodo: 1 }];
        expect(listaGuardada(periodos, 16)).toBe(false);
    });

    test('la fila que el servidor completa desde un período (sin id) tampoco cuenta', () => {
        expect(listaGuardada([{ id: null, de_periodo: 0 }], 16)).toBe(false);
    });

    test('una fila propia basta', () => {
        expect(listaGuardada([{ id: 1, de_periodo: 1 }, { id: 9, de_periodo: 0 }], 16)).toBe(true);
    });

    test('una fila sin la marca (servidor viejo) cuenta como propia', () => {
        expect(listaGuardada([{ id: 9 }], 16)).toBe(true);
    });

    test('si toda la dotación tiene fila (todos de licencia), cuenta como guardada', () => {
        expect(listaGuardada([{ id: 1, de_periodo: 1 }, { id: 2, de_periodo: 1 }], 2)).toBe(true);
    });
});

import { estadoBotonGuardar, listaGuardada } from './listaGuardada';

describe('color del botón Guardar (Marcos 2026-11-27: rojo sin guardar, verde guardada)', () => {
    const base = {
        conObra: true, cargando: false, hayTrabajadores: true, noLaboral: false,
        diaCerrado: false, puedeGuardar: true, listaGuardada: false, hayCambios: false,
    };

    test('el día sin la lista guardada: rojo', () => {
        expect(estadoBotonGuardar(base)).toBe('sin_guardar');
    });

    test('guardada y sin cambios: verde', () => {
        expect(estadoBotonGuardar({ ...base, listaGuardada: true })).toBe('guardada');
    });

    test('guardada, pero se cambió una A por una F: rojo otra vez', () => {
        expect(estadoBotonGuardar({ ...base, listaGuardada: true, hayCambios: true })).toBe('sin_guardar');
    });

    test('un día que ya pasó y no puede tocar: cerrado (gris con candado), guardado o no', () => {
        expect(estadoBotonGuardar({ ...base, diaCerrado: true, puedeGuardar: false })).toBe('cerrado');
        expect(estadoBotonGuardar({ ...base, diaCerrado: true, puedeGuardar: false, listaGuardada: true })).toBe('cerrado');
    });

    test('cargando, sin obra, sin trabajadores, fin de semana o sin permiso: como siempre', () => {
        expect(estadoBotonGuardar({ ...base, cargando: true })).toBe('normal');
        expect(estadoBotonGuardar({ ...base, conObra: false })).toBe('normal');
        expect(estadoBotonGuardar({ ...base, hayTrabajadores: false })).toBe('normal');
        expect(estadoBotonGuardar({ ...base, noLaboral: true })).toBe('normal');
        expect(estadoBotonGuardar({ ...base, puedeGuardar: false })).toBe('normal');
    });
});

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

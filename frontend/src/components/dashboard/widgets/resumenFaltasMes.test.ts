import { diasFaltas, nombreMes, reglasDe, REGLA_FALTA } from './resumenFaltasMes';

describe('faltasMes', () => {
    test('reglas en orden fijo (seguidas, lunes, 3 o más) y sin repetir', () => {
        const alertas = [
            { tipo: 'acumuladas' as const, mensaje: '' },
            { tipo: 'consecutivas' as const, mensaje: '' },
            { tipo: 'acumuladas' as const, mensaje: '' },
        ];
        expect(reglasDe({ alertas })).toEqual(['consecutivas', 'acumuladas']);
        expect(reglasDe({ alertas: [] })).toEqual([]);
    });

    test('solo «2 días seguidos» es grave (rojo)', () => {
        expect(Object.entries(REGLA_FALTA).filter(([, r]) => r.grave).map(([k]) => k)).toEqual(['consecutivas']);
    });

    test('días en corto, con «y» antes del último y el mes al final', () => {
        expect(diasFaltas(['2026-10-06'])).toBe('6 oct');
        expect(diasFaltas(['2026-10-06', '2026-10-13'])).toBe('6 y 13 oct');
        expect(diasFaltas(['2026-10-06', '2026-10-07', '2026-10-13'])).toBe('6, 7 y 13 oct');
    });

    test('muchos días: se corta con el resto contado', () => {
        const fechas = ['01', '02', '05', '06', '07', '08', '09'].map(d => `2026-10-${d}`);
        expect(diasFaltas(fechas)).toBe('1, 2, 5, 6, 7 … (+2) oct');
    });

    test('sin fechas → vacío', () => {
        expect(diasFaltas(undefined)).toBe('');
        expect(diasFaltas([])).toBe('');
    });

    test('nombre del mes', () => {
        expect(nombreMes(new Date(2026, 9, 20))).toBe('octubre');
    });
});

import { ariaTira, diasFaltas, nombreMes, ordenarReiterados, reglasDe, REGLA_FALTA, tiraDelMes } from './resumenFaltasMes';

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

describe('tira del mes y orden de urgencia', () => {
    test('octubre 2026: 31 días, el 1 es jueves, lunes 5/12/19/26', () => {
        const tira = tiraDelMes(['2026-10-05', '2026-10-12', '2026-10-13'], 2026, 10, 20);
        expect(tira).toHaveLength(31);
        expect(tira.filter(d => d.lunes).map(d => d.dia)).toEqual([5, 12, 19, 26]);
        expect(tira.filter(d => d.tipo === 'falta').map(d => d.dia)).toEqual([5, 12, 13]);
        expect(tira[2].tipo).toBe('finde'); // sábado 3
        expect(tira[20].tipo).toBe('futuro'); // 21
        expect(tira.filter(d => d.hoy).map(d => d.dia)).toEqual([20]);
    });

    test('febrero no bisiesto tiene 28 días; fechas de otro mes no cuentan', () => {
        const tira = tiraDelMes(['2026-01-30', '2026-02-02'], 2026, 2, null);
        expect(tira).toHaveLength(28);
        expect(tira.filter(d => d.tipo === 'falta').map(d => d.dia)).toEqual([2]);
        expect(tira.some(d => d.tipo === 'futuro' || d.hoy)).toBe(false);
    });

    test('aria de la tira nombra el día de la semana', () => {
        expect(ariaTira(['2026-10-05', '2026-10-13'])).toBe('Faltas: lunes 5 y martes 13');
        expect(ariaTira([])).toBe('Sin faltas este mes');
    });

    test('urgencia: 2 días seguidos primero, luego cantidad de faltas', () => {
        const t = (apellido: string, total: number, tipos: ('consecutivas' | 'lunes' | 'acumuladas')[]) => ({
            apellido_paterno: apellido, total_faltas: total, alertas: tipos.map(tipo => ({ tipo, mensaje: '' })),
        });
        const orden = ordenarReiterados([t('Soto', 4, ['acumuladas']), t('Fuentes', 2, ['consecutivas']), t('Araya', 3, ['acumuladas', 'lunes'])]);
        expect(orden.map(x => x.apellido_paterno)).toEqual(['Fuentes', 'Soto', 'Araya']);
    });
});

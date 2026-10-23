import { ariaFaltas, diasFaltas, fraseFaltas, mensajeGrupoFaltas, nombreMes, ordenarReiterados, reglasDe, REGLA_FALTA, semanasDelMes } from './resumenFaltasMes';

describe('mensaje «Preguntar al grupo»', () => {
    const carla = {
        nombres: 'Carla', apellido_paterno: 'Simulado', obra_nombre: 'Obra Demo Sur', total_faltas: 2,
        fechas: ['2026-10-15', '2026-10-16'], alertas: [{ tipo: 'consecutivas' as const, mensaje: '' }],
    };
    const PIE = '\n\n_Mensaje generado desde Bóveda LOLS_';

    test('nombre en negrita, obra, días con «hoy» y la regla', () => {
        expect(mensajeGrupoFaltas(carla, '2026-10-16')).toBe(
            'Hola, consulta por *Carla Simulado* (Obra Demo Sur): lleva 2 faltas sin justificar en octubre, '
            + 'el jueves 15 y hoy viernes 16 (2 días seguidos). ¿Alguien sabe qué pasó? '
            + `Si tuvo licencia o permiso, por favor envíen el respaldo para justificarlas.${PIE}`);
    });

    test('días pasados con «el» al comienzo y varias reglas en orden', () => {
        const t = {
            ...carla, total_faltas: 3, fechas: ['2026-10-05', '2026-10-12', '2026-10-13'],
            alertas: [{ tipo: 'acumuladas' as const, mensaje: '' }, { tipo: 'lunes' as const, mensaje: '' }, { tipo: 'consecutivas' as const, mensaje: '' }],
        };
        expect(mensajeGrupoFaltas(t, '2026-10-23')).toContain(
            'lleva 3 faltas sin justificar en octubre, el lunes 5, lunes 12 y martes 13 (2 días seguidos, 2 lunes y 3 o más días).');
    });

    test('sin obra ni fechas no deja huecos; una falta en singular', () => {
        const t = { ...carla, obra_nombre: null, total_faltas: 1, fechas: [], alertas: [] };
        expect(mensajeGrupoFaltas(t, '2026-10-23')).toBe(
            'Hola, consulta por *Carla Simulado*: lleva 1 falta sin justificar en octubre. ¿Alguien sabe qué pasó? '
            + `Si tuvo licencia o permiso, por favor envíen el respaldo para justificarla.${PIE}`);
    });
});

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

describe('mini calendario y orden de urgencia', () => {
    test('octubre 2026: 5 semanas; el 1 es jueves, así que la primera parte con 3 huecos', () => {
        const s = semanasDelMes(['2026-10-05', '2026-10-12', '2026-10-13'], 2026, 10, 20);
        expect(s).toHaveLength(5);
        expect(s[0].map(c => c.dia)).toEqual([null, null, null, 1, 2]);
        expect(s[4].map(c => c.dia)).toEqual([26, 27, 28, 29, 30]);
        // Los lunes son la primera columna: «2 lunes» se ve como columna.
        expect(s.map(w => w[0]).filter(c => c.tipo === 'falta').map(c => c.dia)).toEqual([5, 12]);
        expect(s[2][1]).toEqual({ dia: 13, tipo: 'falta', hoy: false });
        expect(s[3][1]).toEqual({ dia: 20, tipo: 'habil', hoy: true });
        expect(s[3][2].tipo).toBe('futuro');
    });

    test('febrero 2026 (el 1 es domingo): 4 semanas justas; fechas de otro mes no cuentan', () => {
        const s = semanasDelMes(['2026-01-30', '2026-02-02'], 2026, 2, null);
        expect(s.map(w => w.map(c => c.dia))).toEqual([[2, 3, 4, 5, 6], [9, 10, 11, 12, 13], [16, 17, 18, 19, 20], [23, 24, 25, 26, 27]]);
        expect(s.flat().filter(c => c.tipo === 'falta').map(c => c.dia)).toEqual([2]);
        expect(s.flat().some(c => c.tipo === 'futuro' || c.hoy)).toBe(false);
    });

    test('frase de fechas con «(hoy)», y aria con el día completo', () => {
        expect(fraseFaltas(['2026-10-05', '2026-10-12', '2026-10-13', '2026-10-20'], '2026-10-20'))
            .toBe('Faltó el lun 5, lun 12, mar 13 y mar 20 (hoy).');
        expect(fraseFaltas(['2026-10-14'], '2026-10-20')).toBe('Faltó el mié 14.');
        expect(ariaFaltas(['2026-10-05', '2026-10-13'])).toBe('Faltas: lunes 5 y martes 13');
        expect(ariaFaltas([])).toBe('Sin faltas este mes');
    });

    test('urgencia: 2 días seguidos primero, luego cantidad de faltas', () => {
        const t = (apellido: string, total: number, tipos: ('consecutivas' | 'lunes' | 'acumuladas')[]) => ({
            apellido_paterno: apellido, total_faltas: total, alertas: tipos.map(tipo => ({ tipo, mensaje: '' })),
        });
        const orden = ordenarReiterados([t('Soto', 4, ['acumuladas']), t('Fuentes', 2, ['consecutivas']), t('Araya', 3, ['acumuladas', 'lunes'])]);
        expect(orden.map(x => x.apellido_paterno)).toEqual(['Fuentes', 'Soto', 'Araya']);
    });
});

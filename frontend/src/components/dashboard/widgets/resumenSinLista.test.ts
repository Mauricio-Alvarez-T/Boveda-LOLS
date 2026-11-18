import { bajadaCasilla, cuando, cuandoDias, queEPaso, textoUltima, type ObraSinLista, type SinListaData } from './resumenSinLista';

// Miércoles 18 de noviembre de 2026.
const HOY = '2026-11-18';
const obra = (nombre: string, fechas: string[], extra: Partial<ObraSinLista> = {}): ObraSinLista => ({
    obra_id: nombre.length, obra: nombre, encargado: null, dotacion: 10,
    dias: fechas.map(fecha => ({ fecha, motivo: 'nadie', registros: 0 })), ultima: null, ...extra,
});

describe('obras sin pasar la lista (Marcos 2026-11-18)', () => {
    it('dice el día como se habla: ayer, anteayer o el día de la semana', () => {
        expect(cuando('2026-11-17', HOY)).toBe('ayer');
        expect(cuando('2026-11-16', HOY)).toBe('anteayer');
        expect(cuando('2026-11-13', HOY)).toBe('viernes 13');
        // Más de una semana atrás, con el mes (sin él se leía como de este mes).
        expect(cuando('2026-11-10', HOY)).toBe('martes 10 de noviembre');
        expect(cuando('2026-10-21', HOY)).toBe('miércoles 21 de octubre');
    });

    it('junta los días: uno, dos o «N días»', () => {
        expect(cuandoDias(obra('A', ['2026-11-17']).dias, HOY)).toBe('ayer');
        expect(cuandoDias(obra('A', ['2026-11-17', '2026-11-13']).dias, HOY)).toBe('ayer y el viernes 13');
        expect(cuandoDias(obra('A', ['2026-11-17', '2026-11-16', '2026-11-13']).dias, HOY)).toBe('3 días');
    });

    it('la bajada de la casilla: cuándo y cuál con una obra; los nombres con varias', () => {
        const una: SinListaData = { hoy: HOY, dias: [], obras: [obra('DOMEYKO', ['2026-11-17'])] };
        expect(bajadaCasilla(una)).toBe('ayer · DOMEYKO');
        const tres: SinListaData = { hoy: HOY, dias: [], obras: ['DOMEYKO', 'GORBEA', 'ULA'].map(n => obra(n, ['2026-11-17'])) };
        expect(bajadaCasilla(tres)).toBe('DOMEYKO, GORBEA y 1 más');
    });

    it('qué pasó: nadie, o solo las licencias y vacaciones', () => {
        expect(queEPaso({ fecha: '2026-11-17', motivo: 'nadie', registros: 0 })).toBe('Nadie pasó la lista');
        expect(queEPaso({ fecha: '2026-11-17', motivo: 'solo_periodos', registros: 2 }))
            .toBe('Nadie pasó la lista: solo estaban las licencias o vacaciones de 2 personas');
    });

    it('quién guardó la última lista', () => {
        expect(textoUltima(obra('A', [], { ultima: { fecha: '2026-11-13', por: 'Pedro Soto' } }), HOY))
            .toBe('La última la guardó Pedro Soto el viernes 13.');
        expect(textoUltima(obra('A', [], { ultima: { fecha: '2026-11-17', por: 'Pedro Soto' } }), HOY))
            .toBe('La última la guardó Pedro Soto ayer.');
        expect(textoUltima(obra('A', [], { ultima: { fecha: '2026-10-21', por: 'Mauricio Álvarez' } }), HOY))
            .toBe('La última la guardó Mauricio Álvarez el miércoles 21 de octubre.');
        expect(textoUltima(obra('A', []), HOY)).toBe('No tiene listas guardadas antes de hoy.');
    });
});

import {
    bajadaCasilla, calendarioMes, cuando, cuandoDias, queEPaso, soloRecientes, textoUltima, tramoMes,
    type ObraSinLista, type SinListaData,
} from './resumenSinLista';
import { diasPorMes, mensajeSinLista } from './mensajesWhatsApp';

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

    it('la ventana al entrar solo lleva los últimos 5 días hábiles', () => {
        const dias = ['2026-11-17', '2026-11-16', '2026-11-13', '2026-11-12', '2026-11-11', '2026-11-10', '2026-10-21'];
        const s: SinListaData = {
            hoy: HOY, dias, obras: [
                obra('DOMEYKO', ['2026-11-17', '2026-10-21']),
                obra('GORBEA', ['2026-10-21']), // solo un día viejo: no sale en la ventana
            ],
        };
        const r = soloRecientes(s);
        expect(r.obras.map(o => o.obra)).toEqual(['DOMEYKO']);
        expect(r.obras[0].dias.map(d => d.fecha)).toEqual(['2026-11-17']);
        expect(r.dias).toHaveLength(5);
        expect(s.obras[0].dias).toHaveLength(2); // no toca el original
    });

    it('calendario del mes: semanas de lunes a viernes, cada día con su estado', () => {
        // 30 días atrás = lunes 19 de octubre; feriado el viernes 13 (no está entre los hábiles).
        const dias = ['2026-11-17', '2026-11-16', '2026-11-12', '2026-11-11', '2026-10-20', '2026-10-19'];
        const s: SinListaData = { hoy: HOY, desde: '2026-10-19', dias, obras: [] };
        const o = obra('DOMEYKO', ['2026-11-17', '2026-10-19'], { guardadas: ['2026-11-16', '2026-11-12'] });
        const semanas = calendarioMes(s, o);
        expect(semanas).toHaveLength(5); // 19-oct, 26-oct, 2-nov, 9-nov, 16-nov
        expect(semanas.every(w => w.length === 5)).toBe(true);
        const de = (f: string) => semanas.flat().find(c => c?.fecha === f)?.estado;
        expect(de('2026-10-19')).toBe('falta');
        expect(de('2026-11-17')).toBe('falta');
        expect(de('2026-11-16')).toBe('guardada');
        expect(de('2026-11-13')).toBe('feriado');
        expect(de('2026-11-11')).toBe('no_aplica');
        expect(de('2026-11-18')).toBe('hoy');
        // Después de hoy, vacío.
        expect(semanas[4][3]).toBeNull();
        expect(semanas[0][0]?.dia).toBe(19);
        expect(tramoMes(s)).toBe('19 de octubre al 17 de noviembre');
    });

    it('calendario: lo de antes del día en que la obra empezó a pasar lista sale «antes» (mig 156)', () => {
        const dias = ['2026-11-17', '2026-11-16', '2026-11-12', '2026-11-11', '2026-10-20', '2026-10-19'];
        const s: SinListaData = { hoy: HOY, desde: '2026-10-19', dias, obras: [] };
        const o = obra('BASCUÑAN', ['2026-11-17'], { guardadas: ['2026-11-16'], asistencia_desde: '2026-11-16' });
        const de = (f: string) => calendarioMes(s, o).flat().find(c => c?.fecha === f)?.estado;
        expect(de('2026-10-19')).toBe('antes');
        expect(de('2026-11-12')).toBe('antes');
        expect(de('2026-11-13')).toBe('antes'); // feriado, pero antes de empezar: da lo mismo
        expect(de('2026-11-16')).toBe('guardada');
        expect(de('2026-11-17')).toBe('falta');
    });

    it('el mensaje de WhatsApp con muchos días los agrupa por mes', () => {
        expect(diasPorMes(['2026-10-20', '2026-10-21', '2026-11-03', '2026-11-17']))
            .toBe('el 20 y 21 de octubre, y el 3 y 17 de noviembre');
        expect(mensajeSinLista('DOMEYKO', ['2026-11-16', '2026-11-17'])).toContain('falta la asistencia del lunes 16 de noviembre y martes 17 de noviembre');
        expect(mensajeSinLista('DOMEYKO', ['2026-10-20', '2026-10-21', '2026-11-03', '2026-11-17']))
            .toContain('falta la asistencia de 4 días: el 20 y 21 de octubre, y el 3 y 17 de noviembre.');
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

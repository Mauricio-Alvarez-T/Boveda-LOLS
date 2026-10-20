import { anchoRelativo, bloqueFecha, describirEvento, fechaCorta, fmtHoras, habilDesde } from './resumenAsistenciaDetalle';

const persona = { trabajador_id: 1, rut: '1-9', nombres: 'Jorge', apellido_paterno: 'Rivera', obra: 'TOESCA' };

describe('detalle de asistencia, fase 2', () => {
    test('fecha corta y bloque con «Hoy» / «Mañana»', () => {
        expect(fechaCorta('2026-10-22')).toBe('jue 22 oct');
        expect(bloqueFecha('2026-10-20', '2026-10-20')).toEqual({ dia: 'mar', num: 20, relativo: 'Hoy' });
        expect(bloqueFecha('2026-10-21', '2026-10-20').relativo).toBe('Mañana');
        expect(bloqueFecha('2026-11-01', '2026-10-31')).toEqual({ dia: 'dom', num: 1, relativo: 'Mañana' });
        expect(bloqueFecha('2026-10-25', '2026-10-20').relativo).toBeNull();
    });

    test('día hábil siguiente salta el fin de semana', () => {
        expect(habilDesde('2026-10-24')).toBe('2026-10-26'); // sábado → lunes
        expect(habilDesde('2026-10-22')).toBe('2026-10-22');
    });

    test('termina licencia: ámbar y vuelve el día hábil siguiente', () => {
        const e = describirEvento({ tipo: 'fin', fecha: '2026-10-23', codigo: 'LM', estado: 'Licencia Médica', vuelve: '2026-10-24', ...persona });
        expect(e).toEqual({ rotulo: 'Termina licencia médica', tono: 'warning', texto: 'Rivera Jorge', detalle: 'TOESCA · vuelve el lun 26 oct' });
    });

    test('empiezan vacaciones: neutro, con el último día', () => {
        const e = describirEvento({ tipo: 'inicio', fecha: '2026-10-26', codigo: 'V', estado: 'Vacaciones', hasta: '2026-11-06', ...persona, obra: null });
        expect(e).toEqual({ rotulo: 'Empieza vacaciones', tono: 'neutral', texto: 'Rivera Jorge', detalle: 'hasta el vie 6 nov' });
    });

    test('feriado', () => {
        expect(describirEvento({ tipo: 'feriado', fecha: '2026-10-31', nombre: 'Día de las Iglesias Evangélicas', irrenunciable: false }).rotulo).toBe('Feriado');
        expect(describirEvento({ tipo: 'feriado', fecha: '2026-09-18', nombre: 'Independencia', irrenunciable: true }).rotulo).toBe('Feriado irrenunciable');
    });

    test('horas y barras', () => {
        expect(fmtHoras(186.5)).toBe('186,5 h');
        expect(fmtHoras(42)).toBe('42 h');
        expect(anchoRelativo(93, 186)).toBe('50.0%');
        expect(anchoRelativo(1, 1000)).toBe('2.0%');
        expect(anchoRelativo(0, 0)).toBe('0%');
    });
});

const { isoDe, esLunesIso, viernesDe, labelSemana } = require('../src/utils/semana');

describe('utils/semana (etiqueta compartida por servicio, Excel e historial)', () => {
    test('isoDe acepta string, ISO con hora y Date de mysql2', () => {
        expect(isoDe('2026-09-28')).toBe('2026-09-28');
        expect(isoDe('2026-09-28T03:00:00.000Z')).toBe('2026-09-28');
        expect(isoDe(new Date(2026, 8, 28, 12))).toBe('2026-09-28');
        expect(isoDe(null)).toBeNull();
        expect(isoDe('basura')).toBeNull();
    });

    test('esLunesIso distingue el lunes del resto', () => {
        expect(esLunesIso('2026-09-28')).toBe(true);
        expect(esLunesIso('2026-09-26')).toBe(false); // sábado
        expect(esLunesIso('basura')).toBe(false);
    });

    test('viernesDe y labelSemana arman el rango lun–vie', () => {
        expect(viernesDe('2026-09-28')).toBe('2026-10-02');
        expect(labelSemana('2026-09-28')).toBe('Semana lun 28/09 – vie 02/10');
        expect(labelSemana('2026-12-28')).toBe('Semana lun 28/12 – vie 01/01');
        expect(labelSemana(null)).toBeNull();
    });

    test('la etiqueta nunca menciona un sábado', () => {
        expect(labelSemana('2026-09-28')).not.toMatch(/s[aá]b/i);
    });
});

import { lunesDeSemana, viernesDeSemana, esLunes, fmtSemana, fmtSemanaCorta, opcionesSemanas, aIso } from './semanas';

describe('semanas (lista de actividades sugeridas: semana lun–vie)', () => {
    test('lunesDeSemana: cualquier día de la semana → su lunes (domingo cierra la semana)', () => {
        expect(lunesDeSemana('2026-09-21')).toBe('2026-09-21'); // lunes
        expect(lunesDeSemana('2026-09-23')).toBe('2026-09-21'); // miércoles
        expect(lunesDeSemana('2026-09-26')).toBe('2026-09-21'); // sábado histórico → lunes de esa semana
        expect(lunesDeSemana('2026-09-27')).toBe('2026-09-21'); // domingo
        expect(lunesDeSemana('2026-09-28')).toBe('2026-09-28'); // lunes siguiente
    });

    test('tolera ISO completo del backend y fechas inválidas', () => {
        expect(lunesDeSemana('2026-09-26T03:00:00.000Z')).toBe('2026-09-21');
        expect(lunesDeSemana('basura')).toBe('');
        expect(fmtSemana('basura')).toBe('');
        expect(fmtSemana(null)).toBe('');
    });

    test('viernesDeSemana y esLunes', () => {
        expect(viernesDeSemana('2026-09-21')).toBe('2026-09-25');
        expect(esLunes('2026-09-21')).toBe(true);
        expect(esLunes('2026-09-26')).toBe(false);
    });

    test('fmtSemana: "Semana lun 21/09 – vie 25/09", sin fin de semana y sin la palabra sábado', () => {
        expect(fmtSemana('2026-09-21')).toBe('Semana lun 21/09 – vie 25/09');
        expect(fmtSemana('2026-09-26')).toBe('Semana lun 21/09 – vie 25/09'); // normaliza al lunes
        expect(fmtSemana('2026-09-21')).not.toMatch(/s[aá]b/i);
    });

    test('fmtSemana cruza de mes y de año', () => {
        expect(fmtSemana('2026-09-28')).toBe('Semana lun 28/09 – vie 02/10');
        expect(fmtSemana('2026-12-28')).toBe('Semana lun 28/12 – vie 01/01');
    });

    test('fmtSemanaCorta', () => {
        expect(fmtSemanaCorta('2026-09-21')).toBe('21/09 – 25/09');
    });

    test('opcionesSemanas arranca en la semana en curso (aunque hoy sea viernes) y avanza de 7 en 7', () => {
        const ops = opcionesSemanas('2026-09-25', 3); // viernes
        expect(ops.map(o => o.value)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05']);
        expect(ops[0].label).toBe('Semana lun 21/09 – vie 25/09 (en curso)');
        expect(ops[1].label).toBe('Semana lun 28/09 – vie 02/10');
        expect(opcionesSemanas('2026-09-27', 1)[0].value).toBe('2026-09-21'); // domingo aún cuenta la semana en curso
    });

    test('aIso formatea local con ceros', () => {
        expect(aIso(new Date(2026, 0, 5, 12))).toBe('2026-01-05');
    });
});

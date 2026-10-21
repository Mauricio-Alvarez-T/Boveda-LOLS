import { contarEstado, desgloseAusentes, gruposAusentes, listaObras, segmentosObras, type AusentesHoy } from './resumenAsistenciaHoy';

const g = (codigo: string, n: number) => ({ codigo, nombre: codigo, n });

describe('asistencia de hoy (Inicio)', () => {
    test('desglose: los 2 motivos más numerosos y el resto como «otros»', () => {
        expect(desgloseAusentes([g('F', 5), g('LM', 4), g('V', 2), g('PSG', 1)])).toBe('5 F · 4 LM · 3 otros');
    });

    test('desglose: si el resto es un solo motivo, se nombra', () => {
        expect(desgloseAusentes([g('F', 5), g('LM', 4), g('V', 2)])).toBe('5 F · 4 LM · 2 V');
        expect(desgloseAusentes([g('F', 1)])).toBe('1 F');
        expect(desgloseAusentes([g('F', 5), g('LM', 4), g('V', 1), g('PSG', 0)])).toBe('5 F · 4 LM · 1 V');
    });

    test('desglose vacío si nadie faltó', () => {
        expect(desgloseAusentes([])).toBe('');
    });

    test('contarEstado: licencias activas', () => {
        const a: AusentesHoy = { fecha: '2026-10-20', total: 3, porEstado: [g('F', 2), g('LM', 1)], lista: [] };
        expect(contarEstado(a, 'LM')).toBe(1);
        expect(contarEstado(a, 'V')).toBe(0);
        expect(contarEstado(null, 'LM')).toBe(0);
    });

    test('grupos: personas por apellido y ancho proporcional', () => {
        const p = (id: number, apellido: string, codigo: string) => ({
            trabajador_id: id, rut: `${id}`, nombres: 'N', apellido_paterno: apellido, codigo, estado: codigo,
        });
        const a: AusentesHoy = {
            fecha: '2026-10-20', total: 4, porEstado: [g('F', 3), g('LM', 1)],
            lista: [p(1, 'Soto', 'F'), p(2, 'Araya', 'F'), p(3, 'Muñoz', 'LM'), p(4, 'Ñuñez', 'F')],
        };
        const grupos = gruposAusentes(a);
        expect(grupos.map(x => [x.codigo, x.ancho])).toEqual([['F', '75.00%'], ['LM', '25.00%']]);
        expect(grupos[0].personas.map(x => x.apellido_paterno)).toEqual(['Araya', 'Ñuñez', 'Soto']);
    });

    test('segmentos de obras: uno por obra hasta 24; con más, barra continua', () => {
        expect(segmentosObras(4, 3)).toEqual([true, true, true, false]);
        expect(segmentosObras(30, 10)).toBeNull();
        expect(segmentosObras(0, 0)).toBeNull();
    });

    test('lista de obras en corto', () => {
        expect(listaObras(['DOMEYKO'])).toBe('DOMEYKO');
        expect(listaObras(['DOMEYKO', 'GORBEA'])).toBe('DOMEYKO y GORBEA');
        expect(listaObras(['A', 'B', 'C', 'D'])).toBe('A, B y 2 más');
    });
});

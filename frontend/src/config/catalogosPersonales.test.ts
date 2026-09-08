import { COMUNAS_RM, AFP_OPTIONS, SALUD_OPTIONS, toSelectOptions } from './catalogosPersonales';

describe('catalogosPersonales', () => {
    test('COMUNAS_RM: 52 comunas, sin duplicados, orden alfabético', () => {
        expect(COMUNAS_RM).toHaveLength(52);
        expect(new Set(COMUNAS_RM).size).toBe(52);
        const ordenadas = [...COMUNAS_RM].sort((a, b) => a.localeCompare(b, 'es'));
        expect([...COMUNAS_RM]).toEqual(ordenadas);
    });

    test('AFP y salud sin duplicados; salud incluye FONASA', () => {
        expect(new Set(AFP_OPTIONS).size).toBe(AFP_OPTIONS.length);
        expect(new Set(SALUD_OPTIONS).size).toBe(SALUD_OPTIONS.length);
        expect(SALUD_OPTIONS).toContain('FONASA');
    });

    test('toSelectOptions mapea la lista y agrega el valor legado al final', () => {
        const opts = toSelectOptions(AFP_OPTIONS, 'Modelo, Habitat');
        expect(opts).toHaveLength(AFP_OPTIONS.length + 1);
        expect(opts[opts.length - 1]).toEqual({ value: 'Modelo, Habitat', label: 'Modelo, Habitat' });
    });

    test('toSelectOptions no duplica un valor que ya está en la lista ni agrega vacíos', () => {
        expect(toSelectOptions(AFP_OPTIONS, 'Modelo')).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, '')).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, null)).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, '  ')).toHaveLength(AFP_OPTIONS.length);
    });
});

import {
    COMUNAS_RM, AFP_OPTIONS, SALUD_OPTIONS, toSelectOptions,
    TALLAS_CALZADO, TALLAS_PANTALON, TALLAS_POLERA, BANCOS_CHILE, BANCO_CUENTA_RUT,
} from './catalogosPersonales';

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

    test('tallas: calzado 35-47, pantalón 38-50, polera S-XXL', () => {
        expect(TALLAS_CALZADO).toHaveLength(13);
        expect(TALLAS_CALZADO[0]).toBe('35');
        expect(TALLAS_CALZADO[12]).toBe('47');
        expect(TALLAS_PANTALON).toHaveLength(13);
        expect(TALLAS_PANTALON[0]).toBe('38');
        expect(TALLAS_PANTALON[12]).toBe('50');
        expect([...TALLAS_POLERA]).toEqual(['S', 'M', 'L', 'XL', 'XXL']);
    });

    test('bancos: sin duplicados, incluye el banco de la cuenta RUT y "Otro"', () => {
        expect(new Set(BANCOS_CHILE).size).toBe(BANCOS_CHILE.length);
        expect(BANCOS_CHILE).toContain(BANCO_CUENTA_RUT);
        expect(BANCOS_CHILE[BANCOS_CHILE.length - 1]).toBe('Otro');
    });

    test('toSelectOptions no duplica un valor que ya está en la lista ni agrega vacíos', () => {
        expect(toSelectOptions(AFP_OPTIONS, 'Modelo')).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, '')).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, null)).toHaveLength(AFP_OPTIONS.length);
        expect(toSelectOptions(AFP_OPTIONS, '  ')).toHaveLength(AFP_OPTIONS.length);
    });
});

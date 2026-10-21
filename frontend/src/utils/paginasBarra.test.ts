import { repartirPaginas } from './paginasBarra';

const sumaPagina = (anchos: number[], extras: number[], inicios: boolean[], gap: number) => {
    const paginas: number[] = [];
    anchos.forEach((w, i) => {
        if (inicios[i]) paginas.push(0);
        const p = paginas.length - 1;
        paginas[p] += (inicios[i] ? 0 : gap) + w + extras[i];
    });
    return paginas;
};

describe('repartirPaginas (barra de pestañas sin nombres cortados)', () => {
    test('si todo cabe no hay páginas ni extras', () => {
        const r = repartirPaginas([80, 90, 70], 4, 300, 300);
        expect(r.desborda).toBe(false);
        expect(r.extras).toEqual([0, 0, 0]);
    });

    test('cada página llena el ancho justo, también la última', () => {
        const anchos = [120, 110, 150, 90, 100, 130, 80, 70];
        const r = repartirPaginas(anchos, 2, 296, 368);
        expect(r.desborda).toBe(true);
        sumaPagina(anchos, r.extras, r.inicios, 2).forEach(total => expect(total).toBeCloseTo(296, 5));
    });

    test('una opción nunca queda partida entre dos páginas', () => {
        const anchos = [120, 110, 150, 90];
        const r = repartirPaginas(anchos, 2, 250, 300);
        // 120+2+110 = 232 ≤ 250 → página 1; 150 abre la 2; 150+2+90 = 242 ≤ 250 → misma página.
        expect(r.inicios).toEqual([true, false, true, false]);
    });

    test('una opción más ancha que la barra va sola y sin extra', () => {
        const r = repartirPaginas([400, 50], 2, 300, 300);
        expect(r.inicios).toEqual([true, true]);
        expect(r.extras[0]).toBe(0);
        expect(r.extras[1]).toBe(250);
    });
});

import { calcularPosicion, fueraDeVista, ALTO_MAX, ALTO_MIN, ANCHO_MIN, type RectDisparador } from './popoverPos';

/** Campo de 40px de alto en `top`, del ancho indicado. */
const campo = (top: number, width = 296): RectDisparador => ({ top, bottom: top + 40, left: 24, width });

describe('popoverPos (colocación de la lista flotante)', () => {
    it('con sitio de sobra abre hacia abajo, pegada al campo', () => {
        const p = calcularPosicion(campo(100), 900);
        expect(p.top).toBe(144);          // 100 + 40 + 4 de separación
        expect(p.bottom).toBeUndefined();
        expect(p.maxHeight).toBe(ALTO_MAX);
        expect(p.left).toBe(24);
    });

    it('sin sitio abajo y con sitio arriba se voltea, anclada por abajo', () => {
        // Campo casi al fondo: abajo quedan 60px, arriba 800.
        const p = calcularPosicion(campo(800), 900);
        expect(p.top).toBeUndefined();
        expect(p.bottom).toBe(104);       // 900 - 800 + 4
        expect(p.maxHeight).toBe(ALTO_MAX);
    });

    it('recorta el alto al hueco disponible en vez de salirse de la ventana', () => {
        // Ventana de 400 y campo arriba: abajo quedan 260px (más que arriba, así que cuelga hacia abajo)
        // y la lista ocupa 248 (260 - 12 de margen), no los 320 del máximo.
        const p = calcularPosicion(campo(100), 400);
        expect(p.top).toBe(144);
        expect(p.maxHeight).toBe(248);
        expect(p.maxHeight).toBeLessThan(ALTO_MAX);
    });

    it('nunca baja del alto mínimo, aunque la ventana sea diminuta', () => {
        const p = calcularPosicion(campo(10), 120);
        expect(p.maxHeight).toBe(ALTO_MIN);
    });

    it('elige el lado con más sitio cuando ninguno alcanza para el alto máximo', () => {
        // Ventana de 500. Campo en 300: abajo 160, arriba 300 → se voltea.
        expect(calcularPosicion(campo(300), 500).bottom).toBeDefined();
        // Campo en 100: abajo 360, arriba 100 → abre hacia abajo.
        expect(calcularPosicion(campo(100), 500).top).toBeDefined();
    });

    it('respeta el ancho del campo, con un mínimo legible', () => {
        expect(calcularPosicion(campo(100, 296), 900).width).toBe(296);
        expect(calcularPosicion(campo(100, 120), 900).width).toBe(ANCHO_MIN);
    });

    it('fueraDeVista solo es verdad cuando el campo salió de la pantalla', () => {
        expect(fueraDeVista(campo(300), 900)).toBe(false);
        expect(fueraDeVista(campo(0), 900)).toBe(false);          // justo en el borde superior
        expect(fueraDeVista(campo(-60), 900)).toBe(true);         // se fue por arriba
        expect(fueraDeVista(campo(901), 900)).toBe(true);         // se fue por abajo
        expect(fueraDeVista(campo(880), 900)).toBe(false);        // asomando por abajo, todavía visible
    });
});

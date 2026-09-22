import {
    calcularPosicion, fueraDeVista, estiloFlotante, mismaPosicion,
    ALTO_MAX, ALTO_MIN, ANCHO_MIN,
    type RectDisparador, type PosicionPopover,
} from './popoverPos';

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

describe('separacion — cada flotante respira distinto', () => {
    it('corre la lista los pixeles que pida el consumidor', () => {
        expect(calcularPosicion(campo(100), 900).top).toBe(144);                    // 4, el default
        expect(calcularPosicion(campo(100), 900, ALTO_MAX, 8).top).toBe(148);       // menús móviles
        expect(calcularPosicion(campo(100), 900, ALTO_MAX, 6).top).toBe(146);       // tooltip de stock
    });

    it('también cuando se voltea hacia arriba', () => {
        expect(calcularPosicion(campo(800), 900, ALTO_MAX, 8).bottom).toBe(108);
    });
});

describe('estiloFlotante — cada variante aplica solo lo que su CSS no resuelve', () => {
    it("'hoja' NO emite left ni width: los pone el CSS (`left-3 right-3`)", () => {
        // Es el punto del enum. Un `left`/`width` en línea descentraría el menú móvil.
        expect(estiloFlotante(calcularPosicion(campo(100), 900), 'hoja'))
            .toEqual({ position: 'fixed', top: 144 });
    });

    it("'tooltip' ancla sin imponer ancho ni alto (el chip tiene min-w propio)", () => {
        expect(estiloFlotante(calcularPosicion(campo(100), 900), 'tooltip'))
            .toEqual({ position: 'fixed', left: 24, top: 144 });
    });

    it("'lista' emite el paquete completo, y es el default", () => {
        const esperado = { position: 'fixed', left: 24, width: 296, maxHeight: ALTO_MAX, top: 144 };
        expect(estiloFlotante(calcularPosicion(campo(100), 900), 'lista')).toEqual(esperado);
        expect(estiloFlotante(calcularPosicion(campo(100), 900))).toEqual(esperado);
    });

    it('volteada emite bottom y NINGÚN top', () => {
        // Un `top: undefined` conviviendo con `bottom` estira el flotante de punta a punta.
        const e = estiloFlotante(calcularPosicion(campo(800), 900), 'lista');
        expect(e.bottom).toBe(104);
        expect('top' in e).toBe(false);
    });

    it('colgando hacia abajo no emite bottom', () => {
        expect('bottom' in estiloFlotante(calcularPosicion(campo(100), 900), 'lista')).toBe(false);
    });
});

describe('mismaPosicion — corta el re-render cuando el scroll no movió nada', () => {
    const base: PosicionPopover = { left: 24, width: 296, maxHeight: ALTO_MAX, top: 144 };

    it('dos mediciones iguales son la misma posición', () => {
        expect(mismaPosicion(calcularPosicion(campo(100), 900), calcularPosicion(campo(100), 900))).toBe(true);
    });

    it('distingue top de bottom aunque el resto coincida', () => {
        const volteada: PosicionPopover = { left: 24, width: 296, maxHeight: ALTO_MAX, bottom: 144 };
        expect(mismaPosicion(base, volteada)).toBe(false);
    });

    it('detecta el movimiento de un solo pixel', () => {
        expect(mismaPosicion(base, { ...base, top: 145 })).toBe(false);
        expect(mismaPosicion(base, { ...base, maxHeight: 248 })).toBe(false);
    });

    it('sin posición previa nunca es igual (primera medición)', () => {
        expect(mismaPosicion(null, base)).toBe(false);
    });
});

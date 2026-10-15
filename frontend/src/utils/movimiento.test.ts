import { calcBordes, direccionCambio } from './movimiento';

describe('movimiento (aritmética de animaciones, diseno.md §9)', () => {
    test('direccionCambio: sube = 1, baja = -1, igual = 0', () => {
        expect(direccionCambio(3, 4)).toBe(1);
        expect(direccionCambio(4, 3)).toBe(-1);
        expect(direccionCambio(4, 4)).toBe(0);
        expect(direccionCambio(0, 0)).toBe(0);
        expect(direccionCambio(-2, -1)).toBe(1); // negativos: compara el valor, no el módulo
    });

    test('direccionCambio: sin "antes" o "ahora" comparable no hay movimiento', () => {
        expect(direccionCambio(null, 5)).toBe(0);
        expect(direccionCambio(5, null)).toBe(0);
        expect(direccionCambio(undefined, 5)).toBe(0);
        expect(direccionCambio(5, undefined)).toBe(0);
        expect(direccionCambio(NaN, 1)).toBe(0);
        expect(direccionCambio(1, NaN)).toBe(0);
        expect(direccionCambio(1, Infinity)).toBe(0);
        expect(direccionCambio(-Infinity, 1)).toBe(0);
    });

    test('direccionCambio: pasos del wizard (el paso entra desde el lado hacia el que se avanza)', () => {
        expect(direccionCambio(0, 1)).toBe(1);   // Siguiente → entra desde la derecha
        expect(direccionCambio(2, 1)).toBe(-1);  // Atrás → entra desde la izquierda
        expect(direccionCambio(2, 0)).toBe(-1);  // Reiniciar el tutorial desde Revisar
        expect(direccionCambio(1, 1)).toBe(0);   // re-render sin cambio de paso: no anima
    });

    // Contenedor de 300 px de ancho visible con 500 px de contenido (desborde de 200).
    test('calcBordes: sin desborde no hay bordes', () => {
        expect(calcBordes(0, 300, 300)).toEqual({ antes: false, despues: false });
        expect(calcBordes(0, 200, 300)).toEqual({ antes: false, despues: false }); // contenido más chico
        expect(calcBordes(0, 0, 0)).toEqual({ antes: false, despues: false });     // md:hidden mide 0x0
    });

    test('calcBordes: al inicio, al medio y al final', () => {
        expect(calcBordes(0, 500, 300)).toEqual({ antes: false, despues: true });
        expect(calcBordes(100, 500, 300)).toEqual({ antes: true, despues: true });
        expect(calcBordes(200, 500, 300)).toEqual({ antes: true, despues: false });
    });

    test('calcBordes: dentro del umbral cuenta como borde alcanzado', () => {
        // 4 px por defecto: absorbe el redondeo subpíxel de scrollLeft.
        expect(calcBordes(4, 500, 300)).toEqual({ antes: false, despues: true });
        expect(calcBordes(5, 500, 300).antes).toBe(true);
        expect(calcBordes(196, 500, 300)).toEqual({ antes: true, despues: false });
        expect(calcBordes(195, 500, 300).despues).toBe(true);
        expect(calcBordes(199.5, 500, 300).despues).toBe(false);
        expect(calcBordes(0, 303, 300)).toEqual({ antes: false, despues: false }); // desborde menor al umbral
    });

    test('calcBordes: umbral configurable', () => {
        expect(calcBordes(2, 500, 300, 0)).toEqual({ antes: true, despues: true });
        expect(calcBordes(10, 500, 300, 20).antes).toBe(false);
        expect(calcBordes(185, 500, 300, 20).despues).toBe(false);
    });
});

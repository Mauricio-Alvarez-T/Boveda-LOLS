import { calcBordes, direccionCambio, indicePorTecla, planElastico } from './movimiento';

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
    // Fila de pestañas: Ejecutivo [0,100] · Resumen [104,200] · Movim. [204,260].
    const ejecutivo = { l: 0, r: 100 };
    const resumen = { l: 104, r: 200 };
    const movim = { l: 204, r: 260 };

    test('planElastico: hacia la derecha se estira sobre ambas y aplasta desde la izquierda', () => {
        expect(planElastico(ejecutivo, resumen, 3)).toEqual({
            estirado: { l: 0, r: 200 },
            direccion: 1,
            aplastado: { l: 107, r: 200 },
        });
        // Saltando opciones, el estirado cubre también las del medio.
        expect(planElastico(ejecutivo, movim, 3).estirado).toEqual({ l: 0, r: 260 });
    });

    test('planElastico: hacia la izquierda aplasta desde la derecha', () => {
        expect(planElastico(movim, resumen, 3)).toEqual({
            estirado: { l: 104, r: 260 },
            direccion: -1,
            aplastado: { l: 104, r: 197 },
        });
    });

    test('planElastico: el aplaste nunca da vuelta el indicador ni es negativo', () => {
        const angosta = { l: 50, r: 54 };
        expect(planElastico(ejecutivo, angosta, 3).aplastado).toEqual({ l: 52, r: 54 }); // tope: mitad del ancho
        expect(planElastico(resumen, ejecutivo, -5).aplastado).toEqual(ejecutivo);
        expect(planElastico(ejecutivo, ejecutivo, 3).direccion).toBe(1); // mismo centro → derecha
    });

    test('indicePorTecla: flechas con vuelta en los extremos, Inicio/Fin y teclas ajenas', () => {
        expect(indicePorTecla('ArrowRight', 0, 8)).toBe(1);
        expect(indicePorTecla('ArrowRight', 7, 8)).toBe(0);
        expect(indicePorTecla('ArrowLeft', 0, 8)).toBe(7);
        expect(indicePorTecla('ArrowLeft', 3, 8)).toBe(2);
        expect(indicePorTecla('Home', 5, 8)).toBe(0);
        expect(indicePorTecla('End', 2, 8)).toBe(7);
        expect(indicePorTecla('Enter', 2, 8)).toBeNull();
        expect(indicePorTecla('ArrowDown', 2, 8)).toBeNull(); // fila horizontal: arriba/abajo no mueven
        expect(indicePorTecla('ArrowRight', 0, 0)).toBeNull();
    });
});

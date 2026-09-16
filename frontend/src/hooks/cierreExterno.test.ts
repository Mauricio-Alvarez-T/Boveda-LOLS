/**
 * Regresión del menú que se cerraba al tocar sus propias opciones.
 *
 * Un popover en portal se monta en `document.body`, no dentro del ancla, así que preguntarle solo al
 * ancla si contiene al destino da «fuera» para cada clic sobre el propio menú. De ahí que `estaDentro`
 * reciba VARIAS zonas.
 */

import { estaDentro, type ZonaDentro } from './cierreExterno';

/** Doble de un nodo: contiene exactamente lo que se le enumere. */
const zona = (...dentro: unknown[]): ZonaDentro => ({ contains: n => dentro.includes(n) });

describe('estaDentro', () => {
    const boton = 'boton';
    const opcion = 'opcion-del-popover';
    const fondo = 'fondo-de-la-pagina';

    it('el destino del ancla cuenta como dentro', () => {
        expect(estaDentro(boton, [zona(boton), zona(opcion)])).toBe(true);
    });

    it('el destino de un popover en portal TAMBIÉN cuenta como dentro (el bug)', () => {
        // Con una sola zona (el ancla) esto daría false y el menú se cerraría solo.
        expect(estaDentro(opcion, [zona(boton)])).toBe(false);
        expect(estaDentro(opcion, [zona(boton), zona(opcion)])).toBe(true);
    });

    it('un clic en el resto de la página queda fuera', () => {
        expect(estaDentro(fondo, [zona(boton), zona(opcion)])).toBe(false);
    });

    it('las zonas aún no montadas no rompen ni cuentan', () => {
        expect(estaDentro(fondo, [null, undefined])).toBe(false);
        expect(estaDentro(boton, [null, zona(boton), undefined])).toBe(true);
    });

    it('sin zonas, nada está dentro', () => {
        expect(estaDentro(boton, [])).toBe(false);
    });
});

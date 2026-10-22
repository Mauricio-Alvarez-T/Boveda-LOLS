/**
 * Celular chileno del conductor (mig 132). Misma regla que backend/src/utils/telefono.js: si una cambia,
 * cambiar la otra (los casos de abajo son los mismos de backend/tests/conductores_telefono.test.js).
 */
import { celularValido, formatoCelular, normalizarCelular, numeroWhatsApp } from './celular';

describe('normalizarCelular', () => {
    test.each([
        ['912345678', '+56912345678'],
        ['9 1234 5678', '+56912345678'],
        ['9-1234-5678', '+56912345678'],
        ['+56 9 1234 5678', '+56912345678'],
        ['+56912345678', '+56912345678'],
        ['56912345678', '+56912345678'],
        ['0056 9 1234 5678', '+56912345678'],
        ['(+56) 9 1234.5678', '+56912345678'],
        ['  +56-9-8765-4321  ', '+56987654321'],
    ])('%p → %p', (entrada, salida) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: salida });
    });

    test.each([null, undefined, '', '   '])('vacío (%p) → null: el teléfono es opcional', (entrada) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: null });
        expect(celularValido(entrada)).toBe(true);
    });

    test.each(['12345678', '812345678', '9123456789', '+56 2 2345 6789', '+54 9 1234 5678', '+912345678', '9 1234 567a', '56 9 1234 567', '+56'])(
        'inválido: %p', (entrada) => {
            expect(normalizarCelular(entrada)).toEqual({ ok: false });
            expect(celularValido(entrada)).toBe(false);
        },
    );

    // Copiado desde Contactos o WhatsApp: el teléfono pega marcas invisibles alrededor del número.
    const c = (n: number) => String.fromCharCode(n);
    test.each([
        [c(0x202D) + '+56 9 1234 5678' + c(0x202C), '+56912345678'],
        [c(0x202A) + '+56 9 1234 5678' + c(0x202C), '+56912345678'],
        [c(0x200E) + '+56912345678', '+56912345678'],
        ['9 1234' + c(0x2013) + '5678', '+56912345678'],
        ['+56 9 1234' + c(0x2011) + '5678', '+56912345678'],
    ])('pegado con caracteres invisibles o guion tipográfico (%#) → %p', (entrada, salida) => {
        expect(normalizarCelular(entrada)).toEqual({ ok: true, valor: salida });
    });

    test('solo marcas invisibles cuenta como vacío; letras siguen siendo inválidas', () => {
        expect(normalizarCelular(c(0x202D) + c(0x202C))).toEqual({ ok: true, valor: null });
        expect(normalizarCelular('9' + c(0x202D) + '1234abcd')).toEqual({ ok: false });
    });
});

describe('formatoCelular y numeroWhatsApp', () => {
    test('formatoCelular lo deja legible; vacío queda vacío y lo inválido tal cual', () => {
        expect(formatoCelular('+56912345678')).toBe('+56 9 1234 5678');
        expect(formatoCelular('912345678')).toBe('+56 9 1234 5678');
        expect(formatoCelular(null)).toBe('');
        expect(formatoCelular(undefined)).toBe('');
        expect(formatoCelular(' 1234 ')).toBe('1234');
    });

    test('numeroWhatsApp: «569…» sin el «+», o null si no hay un celular válido', () => {
        expect(numeroWhatsApp('+56912345678')).toBe('56912345678');
        expect(numeroWhatsApp('9 8765 4321')).toBe('56987654321');
        expect(numeroWhatsApp(null)).toBeNull();
        expect(numeroWhatsApp('')).toBeNull();
        expect(numeroWhatsApp('22345678')).toBeNull();
    });
});

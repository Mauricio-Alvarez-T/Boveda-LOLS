/**
 * Formato de montos CLP.
 *
 * Regresión del bug "$14901.5M": el Resumen Ejecutivo abreviaba con
 * `(n/1e6).toFixed(1)` → separador decimal en-US sobre un público que lee el
 * punto como separador de MILES, y sin agrupación en la mantisa.
 *
 * Los esperados se construyen con `toLocaleString('es-CL')` en vez de
 * hardcodear "14.901": el separador depende del ICU del runtime de Node y no
 * queremos que el CI se caiga por eso. Lo que sí se asserta duro es la
 * ESTRUCTURA (signo, símbolo, sufijo, cantidad de decimales).
 */

import { fmtMoney, fmtMoneyExacto, fmtMoneyCompacto, fmtNumber } from './format';

const esCL = (n: number, decimals?: number) =>
    n.toLocaleString('es-CL', decimals != null
        ? { minimumFractionDigits: decimals, maximumFractionDigits: decimals }
        : undefined);

describe('fmtMoney — monto completo agrupado (canónico)', () => {
    test('agrupa miles y redondea', () => {
        expect(fmtMoney(14_901_523_456)).toBe(`$${esCL(14901523456)}`);
        expect(fmtMoney(1903.5)).toBe(`$${esCL(1904)}`);
    });

    test('nunca deja el número sin agrupar (el bug original)', () => {
        // La agrupación es lo que hace legible el monto: debe traer separadores.
        const out = fmtMoney(14_901_523_456);
        expect(out.replace(/[$\d]/g, '').length).toBeGreaterThan(0);
        expect(out).not.toMatch(/M$/);
    });

    test('descarta null / vacío / NaN', () => {
        expect(fmtMoney(null)).toBe('');
        expect(fmtMoney(undefined)).toBe('');
        expect(fmtMoney('')).toBe('');
        expect(fmtMoney('abc')).toBe('');
    });
});

describe('fmtMoneyExacto — preserva decimales (precios de factura)', () => {
    test('mantiene los centavos cuando existen', () => {
        expect(fmtMoneyExacto(1234.56)).toBe(`$${esCL(1234.56)}`);
    });

    test('entero se ve igual que fmtMoney', () => {
        expect(fmtMoneyExacto(14_000)).toBe(fmtMoney(14_000));
    });

    test('descarta null / vacío / NaN', () => {
        expect(fmtMoneyExacto(null)).toBe('');
        expect(fmtMoneyExacto('abc')).toBe('');
    });
});

describe('fmtMoneyCompacto — abreviación chilena (solo ejes de gráfico)', () => {
    test('sobre 100 millones: entero agrupado, sin decimal ambiguo', () => {
        // Antes: "$14901.5M" (el "." se leía como miles). Ahora: "$14.902M".
        expect(fmtMoneyCompacto(14_901_523_456)).toBe(`$${esCL(Math.round(14_901_523_456 / 1e6))}M`);
        expect(fmtMoneyCompacto(14_901_523_456)).not.toMatch(/,/); // sin decimales
        expect(fmtMoneyCompacto(447_700_000)).toBe(`$${esCL(448)}M`);
    });

    test('bajo 100 millones: 1 decimal con coma chilena', () => {
        expect(fmtMoneyCompacto(40_712_900)).toBe(`$${esCL(40.7, 1)}M`);
        expect(fmtMoneyCompacto(94_600_000)).toBe(`$${esCL(94.6, 1)}M`);
    });

    test('bajo 1 millón devuelve monto completo (mata el viejo bug "$1000K")', () => {
        expect(fmtMoneyCompacto(999_999)).toBe(`$${esCL(999999)}`);
        expect(fmtMoneyCompacto(999_999)).not.toMatch(/K/);
        expect(fmtMoneyCompacto(1_000_000)).toBe(`$${esCL(1, 1)}M`);
    });

    test('negativos llevan signo (antes salían sin abreviar)', () => {
        expect(fmtMoneyCompacto(-5_000_000)).toBe(`-$${esCL(5, 1)}M`);
    });

    test('cero y basura → $0', () => {
        expect(fmtMoneyCompacto(0)).toBe('$0');
        expect(fmtMoneyCompacto(null)).toBe('$0');
        expect(fmtMoneyCompacto('abc')).toBe('$0');
    });
});

describe('fmtNumber — cantidades sin símbolo', () => {
    test('agrupa miles y respeta decimales fijos', () => {
        expect(fmtNumber(14_000)).toBe(esCL(14000));
        expect(fmtNumber(10.5)).toBe(esCL(10.5));
        expect(fmtNumber(10, { decimals: 2 })).toBe(esCL(10, 2));
    });
});

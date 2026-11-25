import { describe, it, expect } from 'vitest';
import { parseCantidad } from './parseCantidad';

describe('parseCantidad', () => {
    it('acepta coma y punto como separador decimal', () => {
        expect(parseCantidad('0,5')).toBe(0.5);
        expect(parseCantidad('0.5')).toBe(0.5);
        expect(parseCantidad(' 1,25 ')).toBe(1.25);
    });
    it('enteros siguen funcionando', () => {
        expect(parseCantidad('3')).toBe(3);
    });
    it('a medio escribir no se pierde el número', () => {
        expect(parseCantidad('0,')).toBe(0);
        expect(parseCantidad('2.')).toBe(2);
    });
    it('vacío o basura → null', () => {
        expect(parseCantidad('')).toBeNull();
        expect(parseCantidad(',')).toBeNull();
        expect(parseCantidad('abc')).toBeNull();
        expect(parseCantidad('1,2,3')).toBeNull();
    });
});

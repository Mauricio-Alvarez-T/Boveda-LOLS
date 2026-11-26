import { escribirMontoDecimal, textoMontoDecimal, valorMontoDecimal } from './montoDecimal';

/** Simula escribir tecla por tecla al final del campo, como lo hace la persona. */
function teclear(teclas: string): { valor: number; texto: string } {
    let r = { valor: 0, texto: '' };
    for (const k of teclas) r = escribirMontoDecimal(r.texto, r.texto + k);
    return r;
}

describe('montoDecimal', () => {
    it('escribe con coma decimal y separa miles con punto', () => {
        expect(teclear('1500,5')).toEqual({ valor: 1500.5, texto: '$1.500,5' });
        expect(teclear('1250,75')).toEqual({ valor: 1250.75, texto: '$1.250,75' });
    });

    it('la tecla «.» se toma como coma decimal', () => {
        expect(teclear('1500.5')).toEqual({ valor: 1500.5, texto: '$1.500,5' });
    });

    it('a medio escribir no se pierde la coma ni los ceros', () => {
        expect(teclear('1500,').texto).toBe('$1.500,');
        expect(teclear('1500,0').texto).toBe('$1.500,0');
        expect(teclear('1500,05')).toEqual({ valor: 1500.05, texto: '$1.500,05' });
        expect(teclear(',5')).toEqual({ valor: 0.5, texto: '$0,5' });
    });

    it('máximo 2 decimales (columna DECIMAL(12,2))', () => {
        expect(teclear('10,999')).toEqual({ valor: 10.99, texto: '$10,99' });
    });

    it('enteros siguen igual que antes', () => {
        expect(teclear('14000')).toEqual({ valor: 14000, texto: '$14.000' });
    });

    it('borrar desde «$1.500» deja 150, no 1,50', () => {
        expect(escribirMontoDecimal('$1.500', '$1.50')).toEqual({ valor: 150, texto: '$150' });
        expect(escribirMontoDecimal('$1.500,5', '$1.500,')).toEqual({ valor: 1500, texto: '$1.500,' });
        expect(escribirMontoDecimal('$5', '')).toEqual({ valor: 0, texto: '' });
    });

    it('pegar desde una planilla: punto con 1-2 dígitos = decimal; con 3 = miles', () => {
        expect(escribirMontoDecimal('', '1500.50')).toEqual({ valor: 1500.5, texto: '$1.500,50' });
        expect(escribirMontoDecimal('', '1.500')).toEqual({ valor: 1500, texto: '$1.500' });
        expect(escribirMontoDecimal('', '$1.234.567,8')).toEqual({ valor: 1234567.8, texto: '$1.234.567,8' });
    });

    it('lee y muestra un valor guardado', () => {
        expect(textoMontoDecimal(1500.5)).toBe('$1.500,5');
        expect(textoMontoDecimal(0)).toBe('');
        expect(valorMontoDecimal('$1.500,5')).toBe(1500.5);
        expect(valorMontoDecimal('')).toBe(0);
    });
});

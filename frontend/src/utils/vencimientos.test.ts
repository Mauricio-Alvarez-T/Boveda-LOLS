/**
 * Tests del cálculo de vencimientos (util compartida por el chip de la ficha, el
 * panel del menú y el contador). Lo que fijan:
 *   · "hoy" cuenta como POR VENCER, no como vencido (el documento aún sirve),
 *   · el parseo NO usa `new Date('YYYY-MM-DD')`, que en Chile (UTC−3/−4) corre
 *     las fechas un día hacia atrás y desfasaría todos los avisos.
 */
import {
    DIAS_AVISO_VENCIMIENTO, parseFechaLocal, diasHastaVencimiento,
    estadoVencimiento, textoVencimiento,
} from './vencimientos';

const HOY = new Date(2026, 7, 24);   // 24-08-2026 (mes 7 = agosto)

describe('diasHastaVencimiento', () => {
    it('cuenta los días que faltan, negativo si ya venció', () => {
        expect(diasHastaVencimiento('2026-08-24', HOY)).toBe(0);    // hoy
        expect(diasHastaVencimiento('2026-08-25', HOY)).toBe(1);
        expect(diasHastaVencimiento('2026-09-23', HOY)).toBe(30);
        expect(diasHastaVencimiento('2026-08-21', HOY)).toBe(-3);   // venció hace 3 días
    });

    it('acepta fechas ISO con hora (así las manda MySQL a veces)', () => {
        expect(diasHastaVencimiento('2026-08-30T00:00:00.000Z', HOY)).toBe(6);
    });

    it('sin fecha o con basura devuelve null', () => {
        expect(diasHastaVencimiento(null, HOY)).toBeNull();
        expect(diasHastaVencimiento('', HOY)).toBeNull();
        expect(diasHastaVencimiento('mañana', HOY)).toBeNull();
    });

    it('no se corre un día por zona horaria (bug de new Date("YYYY-MM-DD"))', () => {
        // new Date('2026-08-24') es medianoche UTC → 23-08 21:00 en Chile.
        const f = parseFechaLocal('2026-08-24')!;
        expect(f.getDate()).toBe(24);
        expect(f.getMonth()).toBe(7);
        expect(diasHastaVencimiento('2026-08-24', HOY)).toBe(0);
    });

    it('la hora del "hoy" que recibe no altera el cálculo', () => {
        const tarde = new Date(2026, 7, 24, 23, 59, 59);
        expect(diasHastaVencimiento('2026-08-25', tarde)).toBe(1);
    });
});

describe('estadoVencimiento', () => {
    it('vencido solo con días negativos; hoy todavía es "por vencer"', () => {
        expect(estadoVencimiento(-1)).toBe('vencido');
        expect(estadoVencimiento(0)).toBe('por_vencer');
    });

    it('el umbral de 30 días es inclusivo', () => {
        expect(estadoVencimiento(DIAS_AVISO_VENCIMIENTO)).toBe('por_vencer');
        expect(estadoVencimiento(DIAS_AVISO_VENCIMIENTO + 1)).toBe('vigente');
    });

    it('sin fecha no hay estado (no se pinta chip)', () => {
        expect(estadoVencimiento(null)).toBeNull();
    });
});

describe('textoVencimiento', () => {
    it('redacta el estado en español', () => {
        expect(textoVencimiento(-3)).toBe('Venció hace 3d');
        expect(textoVencimiento(0)).toBe('Vence hoy');
        expect(textoVencimiento(12)).toBe('Vence en 12d');
        expect(textoVencimiento(90)).toBe('Vigente');
        expect(textoVencimiento(null)).toBe('Sin fecha');
    });
});

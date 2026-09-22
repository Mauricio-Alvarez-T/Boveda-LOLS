import { antiguedad, porcentajeDocs } from './fichaTrabajador';

describe('fichaTrabajador', () => {
    const hoy = new Date(2026, 8, 15); // 15-sep-2026

    it('antiguedad en días, meses y años', () => {
        expect(antiguedad('2026-09-03', null, hoy)?.texto).toBe('12 días');
        expect(antiguedad('2026-09-15', null, hoy)?.texto).toBe('0 días');
        expect(antiguedad('2026-08-14', null, hoy)?.texto).toBe('1 mes');
        expect(antiguedad('2025-11-15', null, hoy)?.texto).toBe('10 meses');
        expect(antiguedad('2025-09-15', null, hoy)?.texto).toBe('1 año');
        expect(antiguedad('2024-07-10', null, hoy)?.texto).toBe('2 años 2 meses');
    });

    it('el mes incompleto no se cuenta', () => {
        // Ingresó el 20; al 15 del mes siguiente todavía no cumple el mes.
        expect(antiguedad('2026-08-20', null, hoy)?.meses).toBe(0);
        expect(antiguedad('2026-08-15', null, hoy)?.meses).toBe(1);
    });

    it('usa la fecha de término cuando el contrato terminó', () => {
        expect(antiguedad('2026-01-15', '2026-04-15', hoy)?.texto).toBe('3 meses');
        // Un desvinculado no "sigue sumando" con el paso del tiempo.
        expect(antiguedad('2026-01-15', '2026-04-15', new Date(2027, 0, 1))?.texto).toBe('3 meses');
    });

    it('marca el tramo de renovación (10-11 meses)', () => {
        expect(antiguedad('2025-11-15', null, hoy)?.porCumplir10Meses).toBe(true);
        expect(antiguedad('2025-10-15', null, hoy)?.porCumplir10Meses).toBe(true);
        expect(antiguedad('2025-09-15', null, hoy)?.porCumplir10Meses).toBe(false);
        expect(antiguedad('2026-01-15', null, hoy)?.porCumplir10Meses).toBe(false);
    });

    it('sin fecha, fecha inválida o ingreso futuro → null', () => {
        expect(antiguedad(null, null, hoy)).toBeNull();
        expect(antiguedad('', null, hoy)).toBeNull();
        expect(antiguedad('basura', null, hoy)).toBeNull();
        expect(antiguedad('2027-01-01', null, hoy)).toBeNull();
    });

    it('acepta datetime de MySQL', () => {
        expect(antiguedad('2025-11-15 00:00:00', null, hoy)?.texto).toBe('10 meses');
    });

    it('porcentajeDocs acota y sin obligatorios devuelve 100', () => {
        expect(porcentajeDocs(0, 0)).toBe(100);
        expect(porcentajeDocs(3, 6)).toBe(50);
        expect(porcentajeDocs(7, 6)).toBe(100);
        expect(porcentajeDocs(-1, 6)).toBe(0);
    });
});

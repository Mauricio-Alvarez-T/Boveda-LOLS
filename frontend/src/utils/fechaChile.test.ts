import { diaCerradoPara, esDiaPasado, PERMISO_DIAS_DEL_MES, PERMISO_DIAS_PASADOS } from './fechaChile';

// Miércoles 18 de noviembre de 2026.
const HOY = '2026-11-18';
const con = (...claves: string[]) => (k: string) => claves.includes(k);

describe('día cerrado (Marcos 2026-11-18)', () => {
    test('hoy y adelante nunca están cerrados', () => {
        expect(esDiaPasado('2026-11-18', HOY)).toBe(false);
        expect(diaCerradoPara('2026-11-18', con(), HOY)).toEqual({ cerrado: false, motivo: null });
        expect(diaCerradoPara('2026-11-20', con(), HOY).cerrado).toBe(false);
    });

    test('sin permiso: cualquier día anterior a hoy está cerrado', () => {
        expect(diaCerradoPara('2026-11-17', con('asistencia.guardar'), HOY)).toEqual({ cerrado: true, motivo: 'dia' });
    });

    test('jefe de obra (días del mes, confirmado por Daphne): el mes en curso sí; un mes anterior no', () => {
        const jefe = con('asistencia.guardar', PERMISO_DIAS_DEL_MES);
        expect(diaCerradoPara('2026-11-02', jefe, HOY)).toEqual({ cerrado: false, motivo: null });
        expect(diaCerradoPara('2026-10-30', jefe, HOY)).toEqual({ cerrado: true, motivo: 'mes' });
    });

    test('RR.HH. (días que ya pasaron): cualquier día', () => {
        expect(diaCerradoPara('2026-01-05', con(PERMISO_DIAS_PASADOS), HOY).cerrado).toBe(false);
    });
});

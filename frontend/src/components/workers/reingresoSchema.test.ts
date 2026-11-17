import { fechaMinReingreso, fechaMaxReingreso, validarReingreso, buildReingresoPayload, type ReingresoFormData } from './reingresoSchema';

const base: ReingresoFormData = {
    fecha_ingreso: '2026-09-01', empresa_id: 0, obra_id: 0, cargo_id: 0,
    categoria_reporte: 'obra', fecha_termino_contrato: '', quitar_marca: false,
};
const HOY = new Date(2026, 8, 1); // 1-sep-2026

describe('reingresoSchema', () => {
    test('mínimo = día siguiente al último egreso (cruza mes); sin egreso → null', () => {
        expect(fechaMinReingreso('2026-06-30')).toBe('2026-07-01');
        expect(fechaMinReingreso('2026-06-30T00:00:00.000Z')).toBe('2026-07-01');
        expect(fechaMinReingreso(null)).toBeNull();
        expect(fechaMaxReingreso(HOY)).toBe('2026-10-01');
    });

    test('valida solape con el egreso, tope de 30 días y término', () => {
        expect(validarReingreso({ ...base, fecha_ingreso: '2026-06-30' }, '2026-06-30', HOY)).toMatch(/posterior al último egreso \(2026-06-30\)/);
        expect(validarReingreso({ ...base, fecha_ingreso: '2026-10-02' }, '2026-06-30', HOY)).toMatch(/30 días/);
        expect(validarReingreso({ ...base, fecha_termino_contrato: '2026-08-31' }, '2026-06-30', HOY)).toMatch(/término/);
        expect(validarReingreso(base, '2026-06-30', HOY)).toBeNull();
    });

    test('payload: sin ids en 0, término vacío = null, la marca solo se quita si existía', () => {
        expect(buildReingresoPayload({ ...base, quitar_marca: true }, false)).toEqual({
            fecha_ingreso: '2026-09-01', categoria_reporte: 'obra', fecha_termino_contrato: null, quitar_marca_no_recontratar: false,
        });
        expect(buildReingresoPayload({ ...base, empresa_id: 1, obra_id: 2, cargo_id: 3, fecha_termino_contrato: '2026-09-15', quitar_marca: true }, true)).toEqual({
            fecha_ingreso: '2026-09-01', categoria_reporte: 'obra', fecha_termino_contrato: '2026-09-15', quitar_marca_no_recontratar: true,
            empresa_id: 1, obra_id: 2, cargo_id: 3,
        });
    });
});

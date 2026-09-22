import { cargoSueldoSchema, sueldoDefaults, buildSueldoPayload, totalMensual, MAX_SUELDO, MAX_BONO } from './cargoSueldoSchema';

describe('cargoSueldoSchema', () => {
    it('acepta montos enteros válidos', () => {
        expect(cargoSueldoSchema.safeParse({ sueldo_base: 553553, bono_colacion: 20000, bono_movilizacion: 0, observaciones: 'ok' }).success).toBe(true);
    });
    it('rechaza negativos, decimales, excesos y observaciones largas', () => {
        expect(cargoSueldoSchema.safeParse({ sueldo_base: -1, bono_colacion: 0, bono_movilizacion: 0 }).success).toBe(false);
        expect(cargoSueldoSchema.safeParse({ sueldo_base: 1000.5, bono_colacion: 0, bono_movilizacion: 0 }).success).toBe(false);
        expect(cargoSueldoSchema.safeParse({ sueldo_base: MAX_SUELDO + 1, bono_colacion: 0, bono_movilizacion: 0 }).success).toBe(false);
        expect(cargoSueldoSchema.safeParse({ sueldo_base: 1, bono_colacion: MAX_BONO + 1, bono_movilizacion: 0 }).success).toBe(false);
        expect(cargoSueldoSchema.safeParse({ sueldo_base: 1, bono_colacion: 0, bono_movilizacion: 0, observaciones: 'x'.repeat(501) }).success).toBe(false);
    });
});

describe('helpers', () => {
    it('sueldoDefaults: vacío → ceros; con fila → sus valores', () => {
        expect(sueldoDefaults(null)).toEqual({ sueldo_base: 0, bono_colacion: 0, bono_movilizacion: 0, observaciones: '' });
        expect(sueldoDefaults({ id: 1, cargo_id: 4, sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: null, actualizado_por: null }))
            .toEqual({ sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: '' });
    });
    it('buildSueldoPayload: trunca y manda observaciones vacía como null', () => {
        expect(buildSueldoPayload({ sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: '   ' }))
            .toEqual({ sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: null });
        expect(buildSueldoPayload({ sueldo_base: 1, bono_colacion: 0, bono_movilizacion: 0, observaciones: ' Ajuste ' }).observaciones).toBe('Ajuste');
    });
    it('totalMensual suma y tolera parciales', () => {
        expect(totalMensual({ sueldo_base: 553553, bono_colacion: 20000, bono_movilizacion: 15000 })).toBe(588553);
        expect(totalMensual({ sueldo_base: undefined })).toBe(0);
    });
});

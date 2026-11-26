import { buildCartaPayload, causalDeLaBaja, validarCarta, type CartaAvisoForm } from './cartaAviso';

const base: CartaAvisoForm = {
    causal: 'INASISTENCIA', elegida: false, fechaCarta: '2026-10-26', lugar: 'Santiago',
    dias: ['2026-10-20', '2026-10-19', '2026-10-20'], hechos: '',
};

describe('carta de aviso (mig 160)', () => {
    test('la causal sale de la baja: fija, a elegir (operativa LOLS) u otra (no hay carta)', () => {
        expect(causalDeLaBaja({ causal_codigo: 'VENCIMIENTO_PLAZO', articulo_texto: 'Artículo 159, N° 4' })).toEqual({ tipo: 'fija', causal: 'VENCIMIENTO_PLAZO' });
        expect(causalDeLaBaja({ causal_codigo: 'TERMINO_FAENA', articulo_texto: null })).toEqual({ tipo: 'elegir' });
        expect(causalDeLaBaja({ causal_codigo: 'ABANDONO', articulo_texto: 'Artículo 160, N° 4' })).toEqual({ tipo: 'otra' });
    });

    test('qué falta antes de emitir', () => {
        expect(validarCarta(base)).toBeNull();
        expect(validarCarta({ ...base, dias: [] })).toMatch(/al menos un día/);
        expect(validarCarta({ ...base, causal: '' })).toMatch(/Elige la causal/);
        const nec = { ...base, causal: 'NECESIDADES_EMPRESA' as const };
        expect(validarCarta(nec)).toMatch(/hechos/);
        expect(validarCarta({ ...nec, hechos: 'x' })).toBeNull();
    });

    test('lo que se manda: días ordenados y sin repetir; nada de dinero; la causal solo si se eligió', () => {
        expect(buildCartaPayload(base)).toEqual({
            codigo: 'CARTA_AVISO', fecha_carta: '2026-10-26', lugar: 'Santiago', dias_inasistencia: ['2026-10-19', '2026-10-20'],
        });
        const p = buildCartaPayload({ ...base, causal: 'NECESIDADES_EMPRESA', elegida: true, hechos: ' termina la obra ' });
        expect(p).toEqual({
            codigo: 'CARTA_AVISO', fecha_carta: '2026-10-26', lugar: 'Santiago', causal_codigo: 'NECESIDADES_EMPRESA',
            hechos: 'termina la obra',
        });
    });
});

import {
    avanzarFaena, teclaFaena, pisosObra, horaFaena, rotuloFaena, posicionChispa,
    FAENA_INICIAL, PASO_SOLO, PASO_TECLA, TICS_AMANECIDO, SUELO_Y, ALTO_PISO,
    type EstadoFaena,
} from './faena';

/** Corre `n` tics seguidos. */
const tics = (e: EstadoFaena, n: number, entrando = false): EstadoFaena => {
    let s = e;
    for (let i = 0; i < n; i++) s = avanzarFaena(s, entrando);
    return s;
};

describe('faena de madrugada (fondo del inicio de sesión)', () => {
    it('sola amanece en 40 s (400 tics de 100 ms)', () => {
        expect(tics(FAENA_INICIAL, 399).avance).toBeLessThan(1);
        expect(tics(FAENA_INICIAL, 400).avance).toBe(1);
        expect(avanzarFaena(FAENA_INICIAL, false).avance).toBeCloseTo(PASO_SOLO, 6);
    });

    it('amanecida espera 4 s y vuelve a empezar de noche', () => {
        const amanecida: EstadoFaena = { avance: 1, espera: 0, chispas: 3 };
        expect(tics(amanecida, TICS_AMANECIDO - 1).avance).toBe(1);
        const otraVez = tics(amanecida, TICS_AMANECIDO);
        expect(otraVez.avance).toBe(0);
        expect(otraVez.chispas).toBe(3);
    });

    it('al entrar corre al amanecer en 0,8 s y se queda ahí (no vuelve a empezar)', () => {
        expect(tics(FAENA_INICIAL, 7, true).avance).toBeLessThan(1);
        expect(tics(FAENA_INICIAL, 8, true).avance).toBe(1);
        const amanecida: EstadoFaena = { avance: 1, espera: 0, chispas: 0 };
        // Mismo objeto: React no vuelve a pintar mientras se espera al servidor.
        expect(avanzarFaena(amanecida, true)).toBe(amanecida);
        expect(tics(amanecida, TICS_AMANECIDO * 2, true).avance).toBe(1);
    });

    it('cada tecla sube la obra y saca una chispa, sin pasarse del amanecer', () => {
        const una = teclaFaena(FAENA_INICIAL);
        expect(una.avance).toBeCloseTo(PASO_TECLA, 6);
        expect(una.chispas).toBe(1);
        let e = FAENA_INICIAL;
        for (let i = 0; i < 60; i++) e = teclaFaena(e);
        expect(e.avance).toBe(1);
        expect(e.chispas).toBe(60);
    });

    it('la obra va de 2 pisos de noche a 10 al amanecer', () => {
        expect(pisosObra(0)).toBe(2);
        expect(pisosObra(0.5)).toBe(6);
        expect(pisosObra(1)).toBe(10);
        expect(pisosObra(1.4)).toBe(10);
        expect(pisosObra(-1)).toBe(2);
    });

    it('la hora va de 05:30 a 07:15 y el rótulo cambia al amanecer', () => {
        expect(horaFaena(0)).toBe('05:30');
        expect(horaFaena(0.5)).toBe('06:23');
        expect(horaFaena(1)).toBe('07:15');
        expect(rotuloFaena(0.2)).toBe('05:51 · FAENA DE MADRUGADA');
        expect(rotuloFaena(1)).toBe('07:15 · AMANECE EN LA OBRA');
    });

    it('la chispa salta sobre el piso de arriba, dentro del ancho de la obra', () => {
        const p = posicionChispa(5, 4);
        expect(p.y).toBe(SUELO_Y - 4 * ALTO_PISO + 4);
        for (let n = 1; n < 30; n++) {
            const { x } = posicionChispa(n, 2);
            expect(x).toBeGreaterThanOrEqual(230);
            expect(x).toBeLessThan(310);
        }
    });
});

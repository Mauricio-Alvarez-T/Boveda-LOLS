import { mesEnCurso, ultimosDias } from './rangosFecha';

describe('atajos de la grilla — rangos de fecha', () => {
    it('mesEnCurso abarca del día 1 al último día, sin desbordar el mes', () => {
        expect(mesEnCurso(new Date(2026, 8, 15))).toEqual({ desde: '2026-09-01', hasta: '2026-09-30', mes: '2026-09' });
        expect(mesEnCurso(new Date(2026, 1, 3))).toEqual({ desde: '2026-02-01', hasta: '2026-02-28', mes: '2026-02' });
        expect(mesEnCurso(new Date(2026, 0, 31))).toEqual({ desde: '2026-01-01', hasta: '2026-01-31', mes: '2026-01' });
    });

    it('mesEnCurso resuelve febrero de un año bisiesto', () => {
        expect(mesEnCurso(new Date(2028, 1, 10)).hasta).toBe('2028-02-29');
    });

    it('mesEnCurso usa la fecha LOCAL, no UTC', () => {
        // 23:30 del 30-sep en Chile ya es 1-oct en UTC: con toISOString el rango saltaría a octubre.
        expect(mesEnCurso(new Date(2026, 8, 30, 23, 30)).mes).toBe('2026-09');
    });

    it('ultimosDias cuenta hacia atrás y cruza el cambio de mes', () => {
        expect(ultimosDias(60, new Date(2026, 8, 15))).toEqual({ desde: '2026-07-17', hasta: '2026-09-15' });
        expect(ultimosDias(7, new Date(2026, 0, 3))).toEqual({ desde: '2025-12-27', hasta: '2026-01-03' });
    });

    it('ultimosDias(0) es hoy', () => {
        const r = ultimosDias(0, new Date(2026, 8, 15));
        expect(r.desde).toBe('2026-09-15');
        expect(r.hasta).toBe('2026-09-15');
    });
});

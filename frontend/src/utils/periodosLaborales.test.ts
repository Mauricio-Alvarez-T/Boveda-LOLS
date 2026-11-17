import {
    parseCerrados, periodosDe, periodosCerradosDe, fueraDePeriodo, tituloFuera, evaluarArt159, agruparDocsPorPeriodo,
    type PeriodoLaboral,
} from './periodosLaborales';

describe('periodosDe + fueraDePeriodo', () => {
    test('sin períodos cerrados = comportamiento de siempre', () => {
        const p = periodosDe({ fecha_ingreso: '2026-03-01T00:00:00.000Z', fecha_desvinculacion: '2026-06-30' });
        expect(p).toEqual([{ desde: '2026-03-01', hasta: '2026-06-30' }]);
        expect(fueraDePeriodo('2026-02-28', p)).toBe('pre_contrato');
        expect(fueraDePeriodo('2026-06-30', p)).toBeNull();
        expect(fueraDePeriodo('2026-07-01', p)).toBe('finiquitado');
    });

    test('reingresado: hueco entre períodos bloqueado, ambos períodos valen', () => {
        const p = periodosDe({ fecha_ingreso: '2026-09-01', fecha_desvinculacion: null, periodos_cerrados: '2026-01-15|2026-06-30' });
        expect(fueraDePeriodo('2026-03-10', p)).toBeNull();
        expect(fueraDePeriodo('2026-07-15', p)).toBe('entre_periodos');
        expect(fueraDePeriodo('2026-09-01', p)).toBeNull();
        expect(fueraDePeriodo('2026-01-01', p)).toBe('pre_contrato');
        expect(tituloFuera('entre_periodos')).toMatch(/entre períodos/);
        expect(tituloFuera(null)).toBe('');
    });

    test('reactivado con el flujo viejo (solapado) → sin regresión', () => {
        const p = periodosDe({ fecha_ingreso: '2026-01-15', periodos_cerrados: '2026-01-15|2026-06-30' });
        expect(fueraDePeriodo('2026-07-15', p)).toBeNull();
    });

    test('sin datos no bloquea; parse tolera vacío', () => {
        expect(fueraDePeriodo('2026-01-01', periodosDe({}))).toBeNull();
        expect(parseCerrados(null)).toEqual([]);
        expect(parseCerrados('|2026-06-30')).toEqual([{ desde: null, hasta: '2026-06-30' }]);
    });

    test('prefiere los objetos del resumen (con empresa) y los ordena', () => {
        const cerr = periodosCerradosDe({
            periodos_cerrados: 'ignorado|2020-01-01',
            periodos_laborales: [
                { desde: '2025-05-01', hasta: '2025-08-31', empresa_id: 1 },
                { desde: '2024-01-01', hasta: '2024-03-31', empresa_id: 2 },
            ],
        });
        expect(cerr.map(p => p.desde)).toEqual(['2024-01-01', '2025-05-01']);
    });
});

describe('evaluarArt159', () => {
    const LOLS = 1, MAUA = 2;
    test('primer reingreso con la misma empresa → info (2º contrato)', () => {
        const r = evaluarArt159([{ desde: '2026-01-01', hasta: '2026-04-30', empresa_id: LOLS }], LOLS, '2026-09-01');
        expect(r).toMatchObject({ contratos: 2, nivel: 'info' });
        expect(r.meses).toBe(3);
    });

    test('3er contrato con menos de 12 meses → alerta; con 12 o más → presunción', () => {
        const dos: PeriodoLaboral[] = [
            { desde: '2025-07-01', hasta: '2025-10-31', empresa_id: LOLS },
            { desde: '2025-11-15', hasta: '2026-02-28', empresa_id: LOLS },
        ];
        expect(evaluarArt159(dos, LOLS, '2026-04-01').nivel).toBe('alerta');
        const largos: PeriodoLaboral[] = [
            { desde: '2025-01-01', hasta: '2025-07-31', empresa_id: LOLS },
            { desde: '2025-08-15', hasta: '2026-02-28', empresa_id: LOLS },
        ];
        const r = evaluarArt159(largos, LOLS, '2026-03-15');
        expect(r.contratos).toBe(3);
        expect(r.meses).toBeGreaterThanOrEqual(12);
        expect(r.nivel).toBe('presuncion');
    });

    test('otra empresa o fuera de los 15 meses no cuenta', () => {
        expect(evaluarArt159([{ desde: '2026-01-01', hasta: '2026-04-30', empresa_id: MAUA }], LOLS, '2026-09-01').nivel).toBe('ninguno');
        expect(evaluarArt159([{ desde: '2023-01-01', hasta: '2023-04-30', empresa_id: LOLS }], LOLS, '2026-09-01').nivel).toBe('ninguno');
        expect(evaluarArt159([], null, '2026-09-01').nivel).toBe('ninguno');
    });
});

describe('agruparDocsPorPeriodo', () => {
    const periodos: PeriodoLaboral[] = [{ desde: '2026-01-15', hasta: '2026-06-30' }, { desde: '2026-09-01', hasta: null }];
    test('cada documento a su período; el finiquito emitido tras la baja queda en el período 1; actual primero', () => {
        const docs = [
            { id: 1, fecha_subida: '2026-01-20' },
            { id: 2, fecha_subida: '2026-07-05', fecha_generacion: '2026-07-05 10:00:00' }, // finiquito
            { id: 3, fecha_subida: '2026-09-02' },
            { id: 4, fecha_subida: null },
            { id: 5, fecha_subida: '2025-12-01' }, // anterior a todo → primer período
        ];
        const g = agruparDocsPorPeriodo(docs, periodos);
        expect(g.map(x => x.indice)).toEqual([1, 0]);
        expect(g[0].docs.map(d => d.id)).toEqual([3, 4]);
        expect(g[1].docs.map(d => d.id)).toEqual([1, 2, 5]);
    });
});

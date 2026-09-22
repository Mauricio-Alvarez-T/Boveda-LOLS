import {
    GRUPOS, GRUPOS_POR_DEFECTO, contarPorGrupo, totalActivos, gruposIniciales,
    leerRailAbierto, guardarRailAbierto, CLAVE_RAIL,
    type ValoresFiltros,
} from './filtrosPanel';

const VACIO: ValoresFiltros = {
    obra: '', empresa: '', cargo: '', categoria: '',
    activo: 'true', ausentes: false,
    completitud: '', docTipoFalta: '', docVigencia: '',
    faltaDato: '',
    ingresoDesde: '', ingresoHasta: '', salidaDesde: '', salidaHasta: '',
};

describe('filtrosPanel (rail vertical de filtros, 2026-09-16)', () => {
    it('GRUPOS cubre los 12 controles del panel, cada clave en un solo grupo', () => {
        const claves = GRUPOS.flatMap(g => g.preguntas.flat());
        expect(new Set(claves).size).toBe(claves.length);
        expect(new Set(claves)).toEqual(new Set(Object.keys(VACIO)));
        // 12 controles: 4 + 2 + 3 + 1 + 2 rangos.
        expect(GRUPOS.reduce((n, g) => n + g.preguntas.length, 0)).toBe(12);
    });

    it('sin filtros puestos todos los contadores son 0 ("Solo activos" es el default)', () => {
        expect(contarPorGrupo(VACIO)).toEqual({ trabajo: 0, situacion: 0, papeles: 0, ficha: 0, fechas: 0 });
        expect(totalActivos(VACIO)).toBe(0);
    });

    it('cuenta por grupo lo que el usuario eligió', () => {
        const v: ValoresFiltros = { ...VACIO, obra: '7', cargo: '3', activo: 'false', docVigencia: 'vencido' };
        expect(contarPorGrupo(v)).toEqual({ trabajo: 2, situacion: 1, papeles: 1, ficha: 0, fechas: 0 });
        expect(totalActivos(v)).toBe(4);
    });

    it('la obra del selector global no cuenta como filtro; otra obra sí', () => {
        const v: ValoresFiltros = { ...VACIO, obra: '7' };
        expect(contarPorGrupo(v, { obraContexto: '7' }).trabajo).toBe(0);
        expect(contarPorGrupo(v, { obraContexto: '9' }).trabajo).toBe(1);
        expect(contarPorGrupo(v).trabajo).toBe(1);
    });

    it('un rango de fechas cuenta como UNO, con un extremo o con los dos', () => {
        expect(contarPorGrupo({ ...VACIO, ingresoDesde: '2026-09-01' }).fechas).toBe(1);
        expect(contarPorGrupo({ ...VACIO, ingresoDesde: '2026-09-01', ingresoHasta: '2026-09-30' }).fechas).toBe(1);
        expect(contarPorGrupo({ ...VACIO, ingresoHasta: '2026-09-30', salidaDesde: '2026-08-01' }).fechas).toBe(2);
    });

    it('el toggle de ausentes cuenta solo cuando está encendido', () => {
        expect(contarPorGrupo({ ...VACIO, ausentes: false }).situacion).toBe(0);
        expect(contarPorGrupo({ ...VACIO, ausentes: true }).situacion).toBe(1);
    });

    it('gruposIniciales: los dos por defecto, más el que traiga un deep-link', () => {
        expect(gruposIniciales(VACIO)).toEqual([...GRUPOS_POR_DEFECTO]);
        // La alerta "Documentos Vencidos" del Inicio entra con doc_vigencia=vencido.
        expect(gruposIniciales({ ...VACIO, docVigencia: 'vencido' })).toEqual(['trabajo', 'situacion', 'papeles']);
        expect(gruposIniciales({ ...VACIO, faltaDato: 'tallas', salidaDesde: '2026-08-01' }))
            .toEqual(['trabajo', 'situacion', 'ficha', 'fechas']);
    });

    it('memoria del rail: clave por usuario, default cerrado, tolera storage bloqueado', () => {
        const datos: Record<string, string> = {};
        const st = { getItem: (k: string) => datos[k] ?? null, setItem: (k: string, v: string) => { datos[k] = v; } };

        expect(leerRailAbierto(12, st)).toBe(false);
        expect(guardarRailAbierto(12, true, st)).toBe(true);
        expect(datos[CLAVE_RAIL + '12']).toBe('1');
        expect(leerRailAbierto(12, st)).toBe(true);
        expect(leerRailAbierto(99, st)).toBe(false);          // otro usuario, otra clave
        guardarRailAbierto(12, false, st);
        expect(leerRailAbierto(12, st)).toBe(false);

        // Sin id o sin storage no se lee ni escribe.
        expect(leerRailAbierto(null, st)).toBe(false);
        expect(guardarRailAbierto(undefined, true, st)).toBe(false);
        expect(guardarRailAbierto(12, true, null)).toBe(false);

        // Incógnito: localStorage lanza y nadie explota.
        const roto = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } };
        expect(leerRailAbierto(12, roto)).toBe(false);
        expect(guardarRailAbierto(12, true, roto)).toBe(false);
    });
});

import {
    destinoGrilla, filtrosActivos, filtrosIniciales, fmtDuracion, fmtPct, mesCorto, paramsApi, rangoActivo, rangoRapido,
    tablasDe, textoRango, type CostosApi, type DotacionApi, type PerfilApi,
} from './analisis';
import { construirLibroAnalisis, nombreHoja } from './excelAnalisis';

const HOY = '2026-11-27';
const FILTROS = { desde: '2025-12', hasta: '2026-11', fecha_desde: '2025-12-01', fecha_hasta: HOY, empresa_id: null, obra_id: null, cargo_id: null, categoria: null };

describe('rangos y filtros', () => {
    it('rangos rápidos', () => {
        expect(rangoRapido('12m', HOY)).toEqual({ desde: '2025-12', hasta: '2026-11' });
        expect(rangoRapido('anio', HOY)).toEqual({ desde: '2026-01', hasta: '2026-11' });
        expect(rangoRapido('anio_pasado', HOY)).toEqual({ desde: '2025-01', hasta: '2025-12' });
        expect(rangoRapido('24m', HOY)).toEqual({ desde: '2024-12', hasta: '2026-11' });
    });

    it('rangoActivo reconoce el rápido y devuelve null si es a mano', () => {
        expect(rangoActivo(filtrosIniciales(HOY), HOY)).toBe('12m');
        expect(rangoActivo({ desde: '2026-03', hasta: '2026-05' }, HOY)).toBeNull();
    });

    it('paramsApi omite vacíos; filtrosActivos no cuenta el rango', () => {
        const f = { ...filtrosIniciales(HOY), obra_id: '7' };
        expect(paramsApi(f)).toEqual({ desde: '2025-12', hasta: '2026-11', obra_id: '7' });
        expect(filtrosActivos(f)).toBe(1);
        expect(filtrosActivos(filtrosIniciales(HOY))).toBe(0);
    });
});

describe('formatos', () => {
    it('mes, porcentaje, duración y rango', () => {
        expect(mesCorto('2026-03')).toBe('mar 26');
        expect(fmtPct(12.5)).toBe('12,5%');
        expect(fmtPct(null)).toBe('—');
        expect(fmtDuracion(20)).toBe('20 días');
        expect(fmtDuracion(91)).toBe('3 meses');
        expect(fmtDuracion(1095)).toBe('3 años');
        expect(textoRango('2026-11', '2026-11')).toBe('noviembre 2026');
        expect(textoRango('2025-12', '2026-11')).toBe('diciembre 2025 a noviembre 2026');
    });
});

describe('destinoGrilla (ir al detalle)', () => {
    it('activos de una obra; salidas del rango; sin id no hay destino', () => {
        expect(destinoGrilla('obra', 5)).toEqual({ obra_id: '5', activo: 'true' });
        expect(destinoGrilla('categoria', 'rotativo')).toEqual({ categoria: 'rotativo', activo: 'true' });
        expect(destinoGrilla('cargo', 3, { salidas: { desde: '2026-01-01', hasta: '2026-11-27' } }))
            .toEqual({ cargo_id: '3', activo: '', salida_desde: '2026-01-01', salida_hasta: '2026-11-27' });
        expect(destinoGrilla('obra', null)).toBeNull();
    });
});

describe('tablas y Excel', () => {
    const dot: DotacionApi = {
        filtros: FILTROS, generado_en: '', activos: 3, variacion: { desde: 2, hasta: 3 }, en_obra_finalizada: 1,
        serie: [{ mes: '2026-10', dotacion: 2, ingresos: 1, reingresos: 0, parcial: false }, { mes: '2026-11', dotacion: 3, ingresos: 1, reingresos: 1, parcial: true }],
        por_obra: [{ id: 1, etiqueta: 'Obra A', n: 2 }, { id: 2, etiqueta: 'Obra B', n: 1, finalizada: true }],
        por_empresa: [], por_cargo: [], por_categoria: [{ id: 'obra', etiqueta: 'obra', n: 3 }],
    };

    it('dotación: serie con el mes en curso marcado, obra finalizada y categoría legible', () => {
        const t = tablasDe('dotacion', dot);
        expect(t.map(x => x.nombre)).toEqual(['Dotación mensual', 'Por obra', 'Por empresa', 'Por cargo', 'Por categoría']);
        expect(t[0].filas[1]).toEqual(['noviembre 2026 (en curso)', 3, 1, 1]);
        expect(t[1].filas[1]).toEqual(['Obra B', 1, 'Sí']);
        expect(t[4].filas[0]).toEqual(['Obra', 3]);
    });

    it('perfil: solo conteos (sin nombres)', () => {
        const p = {
            filtros: FILTROS, generado_en: '', activos: 1, edad: [{ etiqueta: '25 a 34', n: 1 }], antiguedad: [], nacionalidad: [], comunas: [],
            afp: [], salud: [], estado_civil: [], cargas: [], fichas_incompletas: { contrato: 0, pago: 1, tallas: 0 },
            documentos: { vencidos: 2, por_vencer: 1, dias_por_vencer: 30, obligatorios: 4, por_obra: [] },
            contratos_vencen: 0, solicitudes: { pendiente: 1, aprobada: 2, rechazada: 0, reingreso: 1, total: 3, horas_aprobacion: 20 },
        } satisfies PerfilApi;
        const t = tablasDe('perfil', p);
        expect(t.find(x => x.nombre === 'Papeles')?.filas).toContainEqual(['Documentos vencidos', 2]);
    });

    it('costos: montos con formato de pesos en el Excel', () => {
        const c: CostosApi = {
            filtros: FILTROS, generado_en: '', estimado: true, total_mensual: 1_400_000, sueldo_base_total: 1_200_000,
            trabajadores_con_sueldo: 2, promedio_por_trabajador: 700_000, sin_dato: 0, cargos_sin_dato: [],
            por_cargo: [{ id: 1, etiqueta: 'Jornal', trabajadores: 2, monto: 1_400_000 }], por_obra: [], por_empresa: [],
        };
        const wb = construirLibroAnalisis(tablasDe('costos', c), { titulo: 'Análisis', subtitulo: 'filtros' });
        const ws = wb.getWorksheet('Por cargo')!;
        expect(ws.getCell(1, 1).value).toBe('Análisis · Por cargo');
        expect(ws.getCell(5, 1).value).toBe('Jornal');
        expect(ws.getCell(5, 3).value).toBe(1_400_000);
        expect(ws.getCell(5, 3).numFmt).toBe('"$"#,##0');
        // Tabla vacía → aviso en vez de hoja en blanco.
        expect(wb.getWorksheet('Por obra')!.getCell(5, 1).value).toBe('Sin datos con estos filtros');
    });

    it('nombreHoja: sin caracteres prohibidos, máx. 31 y sin repetir', () => {
        const usados = new Set<string>();
        expect(nombreHoja('Por obra', usados)).toBe('Por obra');
        expect(nombreHoja('Por obra', usados)).toBe('Por obra 2');
        expect(nombreHoja('A/B: [x]', usados)).toBe('A B   x');
        expect(nombreHoja('x'.repeat(40), usados)).toHaveLength(31);
    });
});

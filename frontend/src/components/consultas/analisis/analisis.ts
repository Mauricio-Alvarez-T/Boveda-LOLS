/**
 * Análisis de trabajadores (Gestiones → «Análisis», mig 163) — tipos de GET /api/analisis-trabajadores/* y
 * lógica PURA de la pantalla: rangos rápidos, query, formatos, destinos «ir al detalle» y tablas para el Excel.
 * Reglas: docs/reglas/rrhh-trabajadores.md § Análisis de trabajadores.
 */

export type PestanaAnalisis = 'dotacion' | 'rotacion' | 'asistencia' | 'perfil' | 'costos';

export const PESTANAS: { key: PestanaAnalisis; label: string }[] = [
    { key: 'dotacion', label: 'Dotación' },
    { key: 'rotacion', label: 'Rotación' },
    { key: 'asistencia', label: 'Asistencia' },
    { key: 'perfil', label: 'Perfil y papeles' },
    { key: 'costos', label: 'Costos' },
];

// ─── Respuestas ─────────────────────────────────────────────────────────────────────────────────

export interface FiltrosAplicados {
    desde: string; hasta: string; fecha_desde: string; fecha_hasta: string;
    empresa_id: number | null; obra_id: number | null; cargo_id: number | null; categoria: string | null;
}
interface Base { filtros: FiltrosAplicados; generado_en: string }

/** Grupo con id (para ir al detalle) y cantidad. */
export interface Grupo { id: number | string | null; etiqueta: string; n: number; finalizada?: boolean }
/** Conteo sin id (perfil). */
export interface Conteo { etiqueta: string; n: number }

export interface DotacionApi extends Base {
    activos: number;
    variacion: { desde: number; hasta: number };
    serie: { mes: string; dotacion: number; ingresos: number; reingresos: number; parcial: boolean }[];
    por_obra: Grupo[];
    en_obra_finalizada: number;
    por_empresa: Grupo[];
    por_cargo: Grupo[];
    por_categoria: Grupo[];
}

export interface RotacionApi extends Base {
    ingresos: number; reingresos: number; salidas: number; tasa_rango: number | null;
    serie: { mes: string; ingresos: number; reingresos: number; salidas: number; dotacion: number; tasa: number | null; parcial: boolean }[];
    permanencia: { promedio_dias: number | null; mediana_dias: number | null; con_dato: number };
    salidas_antes_30: number; salidas_antes_90: number; no_recontratar: number; volvieron: number;
    causales: Conteo[];
    por_obra: Grupo[]; por_cargo: Grupo[]; por_empresa: Grupo[];
}

export interface RankingAsistencia { id: number | null; etiqueta: string; registros: number; ausencias: number; faltas: number; ausentismo: number | null }
export interface AsistenciaApi extends Base {
    registros: number; ausencias: number; faltas: number; ausentismo: number | null;
    serie: ({ mes: string; registros: number; ausencias: number; faltas: number; ausentismo: number | null } & Record<string, number | string | null>)[];
    estados: { codigo: string; nombre: string; presente: boolean; n: number }[];
    por_obra: RankingAsistencia[]; por_cargo: RankingAsistencia[];
    top_faltas: { trabajador_id: number; nombre: string; faltas: number }[];
    horas_extra: { total: number; serie: { mes: string; horas: number }[]; por_obra: Grupo[] } | null;
}

export interface PerfilApi extends Base {
    activos: number;
    edad: Conteo[]; antiguedad: Conteo[]; nacionalidad: Conteo[]; comunas: Conteo[];
    afp: Conteo[]; salud: Conteo[]; estado_civil: Conteo[]; cargas: Conteo[];
    fichas_incompletas: { contrato: number; pago: number; tallas: number };
    documentos: {
        vencidos: number; por_vencer: number; dias_por_vencer: number; obligatorios: number;
        por_obra: { id: number | null; etiqueta: string; trabajadores: number; completos: number; porcentaje: number | null }[];
    };
    contratos_vencen: number;
    solicitudes: { pendiente: number; aprobada: number; rechazada: number; reingreso: number; total: number; horas_aprobacion: number | null };
}

export interface GrupoCosto { id: number | null; etiqueta: string; trabajadores: number; monto: number }
export interface CostosApi extends Base {
    estimado: true;
    total_mensual: number; sueldo_base_total: number; trabajadores_con_sueldo: number;
    promedio_por_trabajador: number | null; sin_dato: number;
    cargos_sin_dato: Grupo[];
    por_cargo: GrupoCosto[]; por_obra: GrupoCosto[]; por_empresa: GrupoCosto[];
}

export interface DatosPorPestana {
    dotacion: DotacionApi; rotacion: RotacionApi; asistencia: AsistenciaApi; perfil: PerfilApi; costos: CostosApi;
}

// ─── Filtros ────────────────────────────────────────────────────────────────────────────────────

export interface FiltrosAnalisis {
    desde: string; // 'YYYY-MM'
    hasta: string;
    empresa_id: string;
    obra_id: string;
    cargo_id: string;
    categoria: string;
}

export type RangoRapido = '12m' | 'anio' | 'anio_pasado' | '24m';
export const RANGOS: { key: RangoRapido; label: string }[] = [
    { key: '12m', label: '12 meses' },
    { key: 'anio', label: 'Este año' },
    { key: 'anio_pasado', label: 'Año pasado' },
    { key: '24m', label: '24 meses' },
];

export function sumarMeses(mes: string, n: number): string {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Desde/hasta de un rango rápido. `hoy` = 'YYYY-MM-DD' (hora de Chile). */
export function rangoRapido(r: RangoRapido, hoy: string): { desde: string; hasta: string } {
    const mes = hoy.slice(0, 7);
    const anio = Number(hoy.slice(0, 4));
    switch (r) {
        case 'anio': return { desde: `${anio}-01`, hasta: mes };
        case 'anio_pasado': return { desde: `${anio - 1}-01`, hasta: `${anio - 1}-12` };
        case '24m': return { desde: sumarMeses(mes, -23), hasta: mes };
        default: return { desde: sumarMeses(mes, -11), hasta: mes };
    }
}

/** Qué rango rápido coincide con el desde/hasta actual (o null si es a mano). */
export function rangoActivo(f: Pick<FiltrosAnalisis, 'desde' | 'hasta'>, hoy: string): RangoRapido | null {
    return RANGOS.find(r => {
        const x = rangoRapido(r.key, hoy);
        return x.desde === f.desde && x.hasta === f.hasta;
    })?.key ?? null;
}

export const filtrosIniciales = (hoy: string): FiltrosAnalisis => ({
    ...rangoRapido('12m', hoy), empresa_id: '', obra_id: '', cargo_id: '', categoria: '',
});

/** Parámetros para la API (sin vacíos). */
export function paramsApi(f: FiltrosAnalisis): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(f)) if (v) out[k] = String(v);
    return out;
}

/** Cuántos filtros de «quién» hay puestos (sin contar el rango). */
export const filtrosActivos = (f: FiltrosAnalisis): number =>
    [f.empresa_id, f.obra_id, f.cargo_id, f.categoria].filter(Boolean).length;

// ─── Formatos ───────────────────────────────────────────────────────────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-03' → 'mar 26'. */
export const mesCorto = (mes: string): string => `${MESES[Number(mes.slice(5, 7)) - 1] ?? '?'} ${mes.slice(2, 4)}`;
/** '2026-03' → 'marzo 2026'. */
export const mesLargo = (mes: string): string => `${MESES_LARGO[Number(mes.slice(5, 7)) - 1] ?? '?'} ${mes.slice(0, 4)}`;

export const fmtNum = (n: number | null | undefined): string => (n == null ? '—' : n.toLocaleString('es-CL'));
export const fmtPct = (n: number | null | undefined): string =>
    (n == null ? '—' : `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);
/** Días → texto corto legible: 45 → '1,5 meses'; 400 → '1,1 años'. */
export function fmtDuracion(dias: number | null | undefined): string {
    if (dias == null) return '—';
    if (dias < 60) return `${dias} días`;
    if (dias < 730) return `${(dias / 30.4).toLocaleString('es-CL', { maximumFractionDigits: 1 })} meses`;
    return `${(dias / 365).toLocaleString('es-CL', { maximumFractionDigits: 1 })} años`;
}

/** Rango para títulos: 'dic 25 – nov 26' o 'noviembre 2026' si es un mes. */
export const textoRango = (desde: string, hasta: string): string =>
    (desde === hasta ? mesLargo(desde) : `${mesLargo(desde)} a ${mesLargo(hasta)}`);

// ─── Ir al detalle (grilla de Trabajadores) ────────────────────────────────────────────────────

export type Dimension = 'obra' | 'empresa' | 'cargo' | 'categoria';
const PARAM: Record<Dimension, string> = { obra: 'obra_id', empresa: 'empresa_id', cargo: 'cargo_id', categoria: 'categoria' };

/**
 * Params de la grilla para ver a las personas detrás de una barra. null = no hay a dónde ir (barra «Sin dato»
 * u «Otros»). `salidas` = con una baja en el rango, sigan fuera o hayan vuelto (la grilla filtra por la obra ACTUAL).
 */
export function destinoGrilla(
    dim: Dimension, id: number | string | null, opts: { salidas?: { desde: string; hasta: string } } = {}
): Record<string, string> | null {
    if (id == null || id === '') return null;
    const p: Record<string, string> = { [PARAM[dim]]: String(id) };
    if (opts.salidas) {
        // Activos y finiquitados: el filtro de salidas de la grilla mira el historial de bajas, así que también
        // aparecen quienes se fueron en el rango y ya volvieron (con `activo=false` quedarían fuera).
        p.activo = '';
        p.salida_desde = opts.salidas.desde;
        p.salida_hasta = opts.salidas.hasta;
    } else {
        p.activo = 'true';
    }
    return p;
}

// ─── Tablas (Excel y vista en tabla) ───────────────────────────────────────────────────────────

export type Celda = string | number | null;
export interface Tabla {
    nombre: string;
    columnas: string[];
    filas: Celda[][];
    /** Índices de columnas con formato de pesos / porcentaje. */
    pesos?: number[];
    pct?: number[];
}

const conTotal = (nombre: string, xs: { etiqueta: string; n: number }[], col = 'Trabajadores'): Tabla => ({
    nombre, columnas: ['', col], filas: xs.map(x => [x.etiqueta, x.n]),
});

/** Las tablas de una pestaña (una hoja por tabla en el Excel). */
export function tablasDe<K extends PestanaAnalisis>(pestana: K, d: DatosPorPestana[K]): Tabla[] {
    switch (pestana) {
        case 'dotacion': {
            const x = d as DotacionApi;
            return [
                { nombre: 'Dotación mensual', columnas: ['Mes', 'Dotación al cierre', 'Ingresos', 'De ellos, reingresos'],
                    filas: x.serie.map(m => [mesLargo(m.mes) + (m.parcial ? ' (en curso)' : ''), m.dotacion, m.ingresos, m.reingresos]) },
                { nombre: 'Por obra', columnas: ['Obra', 'Activos', 'Obra finalizada'], filas: x.por_obra.map(o => [o.etiqueta, o.n, o.finalizada ? 'Sí' : '']) },
                conTotal('Por empresa', x.por_empresa, 'Activos'),
                conTotal('Por cargo', x.por_cargo, 'Activos'),
                conTotal('Por categoría', x.por_categoria.map(c => ({ ...c, etiqueta: etiquetaCategoria(c.etiqueta) })), 'Activos'),
            ];
        }
        case 'rotacion': {
            const x = d as RotacionApi;
            return [
                { nombre: 'Rotación mensual', columnas: ['Mes', 'Ingresos', 'Reingresos', 'Salidas', 'Dotación al cierre', 'Rotación %'],
                    filas: x.serie.map(m => [mesLargo(m.mes), m.ingresos, m.reingresos, m.salidas, m.dotacion, m.tasa]), pct: [5] },
                { nombre: 'Causales', columnas: ['Causal', 'Salidas'], filas: x.causales.map(c => [c.etiqueta, c.n]) },
                conTotal('Salidas por obra', x.por_obra, 'Salidas'),
                conTotal('Salidas por cargo', x.por_cargo, 'Salidas'),
                conTotal('Salidas por empresa', x.por_empresa, 'Salidas'),
                { nombre: 'Resumen', columnas: ['Indicador', 'Valor'], filas: [
                    ['Ingresos', x.ingresos], ['Reingresos', x.reingresos], ['Salidas', x.salidas],
                    ['Rotación del rango %', x.tasa_rango],
                    ['Permanencia promedio (días)', x.permanencia.promedio_dias], ['Permanencia mediana (días)', x.permanencia.mediana_dias],
                    ['Salidas antes de 30 días', x.salidas_antes_30], ['Salidas antes de 90 días', x.salidas_antes_90],
                    ['Con marca «No recontratar»', x.no_recontratar], ['Ya volvieron', x.volvieron],
                ] },
            ];
        }
        case 'asistencia': {
            const x = d as AsistenciaApi;
            const ranking = (nombre: string, r: RankingAsistencia[]): Tabla => ({
                nombre, columnas: ['', 'Días registrados', 'Ausencias', 'Faltas', 'Ausentismo %'],
                filas: r.map(o => [o.etiqueta, o.registros, o.ausencias, o.faltas, o.ausentismo]), pct: [4],
            });
            const t: Tabla[] = [
                { nombre: 'Ausentismo mensual', columnas: ['Mes', 'Días registrados', 'Ausencias', 'Faltas', 'Ausentismo %'],
                    filas: x.serie.map(m => [mesLargo(m.mes), m.registros, m.ausencias, m.faltas, m.ausentismo]), pct: [4] },
                { nombre: 'Días por estado', columnas: ['Código', 'Estado', 'Días'], filas: x.estados.map(e => [e.codigo, e.nombre, e.n]) },
                ranking('Por obra', x.por_obra),
                ranking('Por cargo', x.por_cargo),
                { nombre: 'Más faltas', columnas: ['Trabajador', 'Faltas'], filas: x.top_faltas.map(p => [p.nombre, p.faltas]) },
            ];
            if (x.horas_extra) {
                t.push({ nombre: 'Horas extra por mes', columnas: ['Mes', 'Horas'], filas: x.horas_extra.serie.map(m => [mesLargo(m.mes), m.horas]) });
                t.push(conTotal('Horas extra por obra', x.horas_extra.por_obra, 'Horas'));
            }
            return t;
        }
        case 'perfil': {
            const x = d as PerfilApi;
            return [
                conTotal('Edad', x.edad), conTotal('Antigüedad', x.antiguedad), conTotal('Nacionalidad', x.nacionalidad),
                conTotal('Comunas', x.comunas), conTotal('AFP', x.afp), conTotal('Salud', x.salud),
                conTotal('Estado civil', x.estado_civil), conTotal('Cargas familiares', x.cargas),
                { nombre: 'Papeles', columnas: ['Indicador', 'Valor'], filas: [
                    ['Fichas sin datos del contrato', x.fichas_incompletas.contrato],
                    ['Fichas sin datos de pago', x.fichas_incompletas.pago],
                    ['Fichas sin tallas', x.fichas_incompletas.tallas],
                    ['Documentos vencidos', x.documentos.vencidos],
                    [`Documentos que vencen en ${x.documentos.dias_por_vencer} días`, x.documentos.por_vencer],
                    ['Contratos a plazo que vencen en 30 días', x.contratos_vencen],
                    ['Solicitudes de ingreso', x.solicitudes.total],
                    ['  pendientes', x.solicitudes.pendiente], ['  aprobadas', x.solicitudes.aprobada], ['  rechazadas', x.solicitudes.rechazada],
                    ['  de reingreso', x.solicitudes.reingreso],
                    ['Horas promedio hasta aprobar', x.solicitudes.horas_aprobacion],
                ] },
                { nombre: 'Documentos por obra', columnas: ['Obra', 'Trabajadores', 'Con todos los obligatorios', '%'],
                    filas: x.documentos.por_obra.map(o => [o.etiqueta, o.trabajadores, o.completos, o.porcentaje]), pct: [3] },
            ];
        }
        case 'costos': {
            const x = d as CostosApi;
            const costo = (nombre: string, xs: GrupoCosto[]): Tabla => ({
                nombre, columnas: ['', 'Trabajadores', 'Costo mensual estimado'], filas: xs.map(g => [g.etiqueta, g.trabajadores, g.monto]), pesos: [2],
            });
            return [
                costo('Por cargo', x.por_cargo), costo('Por obra', x.por_obra), costo('Por empresa', x.por_empresa),
                conTotal('Cargos sin sueldo', x.cargos_sin_dato),
                { nombre: 'Resumen', columnas: ['Indicador', 'Valor'], filas: [
                    ['Costo mensual estimado', x.total_mensual], ['Solo sueldos base', x.sueldo_base_total],
                    ['Trabajadores con sueldo del cargo', x.trabajadores_con_sueldo], ['Promedio por trabajador', x.promedio_por_trabajador],
                    ['Trabajadores sin sueldo cargado', x.sin_dato],
                ], pesos: [] },
            ];
        }
        default: return [];
    }
}

export const etiquetaCategoria = (c: string): string =>
    ({ obra: 'Obra', operaciones: 'Operaciones', rotativo: 'Rotativo' } as Record<string, string>)[c] ?? c;

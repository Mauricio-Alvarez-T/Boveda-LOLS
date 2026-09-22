/**
 * Agrupación del panel de filtros de la grilla de Trabajadores (rail vertical, 2026-09-16).
 *
 * Doce controles en una columna de 320px son una lista larga: la investigación de filtros empresariales
 * (Pencil & Paper, Helios, Baymard) coincide en que el rail se lee cuando los controles están AGRUPADOS por
 * la pregunta que responden, con secciones plegables y un contador por sección. Eso es lo que vive acá: la
 * estructura y el conteo, en un .ts puro y testeable (el jest del front solo corre `*.test.ts` sin JSX).
 *
 * Ojo con el contador: `activeFilterCount` (useConsultasFilters) cuenta 17 cosas, cinco de las cuales NO
 * están en el panel (la búsqueda y los cuatro atajos). La suma de los contadores por grupo es, a propósito,
 * MENOR que ese número. No son el mismo dato y no hay que "arreglar" la diferencia.
 */

export type GrupoFiltroId = 'trabajo' | 'situacion' | 'papeles' | 'ficha' | 'fechas';

/** Valores de los filtros que viven en el panel (los atajos y la búsqueda quedan fuera a propósito). */
export interface ValoresFiltros {
    obra: string;
    empresa: string;
    cargo: string;
    categoria: string;
    activo: string;
    ausentes: boolean;
    completitud: string;
    docTipoFalta: string;
    docVigencia: string;
    faltaDato: string;
    ingresoDesde: string;
    ingresoHasta: string;
    salidaDesde: string;
    salidaHasta: string;
}

type ClaveFiltro = keyof ValoresFiltros;

export interface GrupoFiltro {
    id: GrupoFiltroId;
    titulo: string;
    /** Una pregunta = un control. Un rango de fechas son dos claves que cuentan como UNA. */
    preguntas: readonly (readonly ClaveFiltro[])[];
}

/** Orden del rail: primero lo que se pregunta a diario, al final lo que se pregunta una vez al mes. */
export const GRUPOS: readonly GrupoFiltro[] = [
    { id: 'trabajo', titulo: 'Dónde trabaja', preguntas: [['obra'], ['empresa'], ['cargo'], ['categoria']] },
    { id: 'situacion', titulo: 'Situación', preguntas: [['activo'], ['ausentes']] },
    { id: 'papeles', titulo: 'Papeles', preguntas: [['completitud'], ['docTipoFalta'], ['docVigencia']] },
    { id: 'ficha', titulo: 'Datos de la ficha', preguntas: [['faltaDato']] },
    { id: 'fechas', titulo: 'Fechas', preguntas: [['ingresoDesde', 'ingresoHasta'], ['salidaDesde', 'salidaHasta']] },
] as const;

/** Grupos abiertos al montar el rail: los dos primeros, más los que traigan algo activo (deep-links). */
export const GRUPOS_POR_DEFECTO: readonly GrupoFiltroId[] = ['trabajo', 'situacion'];

export interface OpcionesConteo {
    /** Obra del selector global: si el filtro coincide con ella no es una elección del usuario, no cuenta. */
    obraContexto?: string;
}

/** ¿Este filtro está puesto? Mismos criterios que `activeFilterCount` para que no se contradigan. */
function activa(clave: ClaveFiltro, valores: ValoresFiltros, opts: OpcionesConteo): boolean {
    const v = valores[clave];
    if (clave === 'activo') return v !== 'true';           // "Solo activos" es el default
    if (clave === 'obra') return !!v && v !== (opts.obraContexto || '');
    return typeof v === 'boolean' ? v : !!v;
}

/** Cuántos controles puestos tiene cada grupo. Un rango de fechas cuenta como uno. */
export function contarPorGrupo(valores: ValoresFiltros, opts: OpcionesConteo = {}): Record<GrupoFiltroId, number> {
    const salida = {} as Record<GrupoFiltroId, number>;
    for (const grupo of GRUPOS) {
        salida[grupo.id] = grupo.preguntas.filter(claves => claves.some(c => activa(c, valores, opts))).length;
    }
    return salida;
}

/** Total de controles del panel puestos (no incluye búsqueda ni atajos). */
export function totalActivos(valores: ValoresFiltros, opts: OpcionesConteo = {}): number {
    return Object.values(contarPorGrupo(valores, opts)).reduce((a, b) => a + b, 0);
}

/** Qué grupos arrancan desplegados. Un deep-link a `doc_vigencia=vencido` abre «Papeles» y nada más. */
export function gruposIniciales(valores: ValoresFiltros, opts: OpcionesConteo = {}): GrupoFiltroId[] {
    const cuenta = contarPorGrupo(valores, opts);
    return GRUPOS.filter(g => GRUPOS_POR_DEFECTO.includes(g.id) || cuenta[g.id] > 0).map(g => g.id);
}

// ── Memoria por usuario (misma forma que gestionesNav.leerUltima) ──────────────

export const CLAVE_RAIL = 'boveda.gestiones.filtrosAbiertos.';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): StorageLike | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** ¿El rail quedó abierto la última vez? Sin id o sin storage (incógnito) → cerrado. */
export function leerRailAbierto(userId: number | string | null | undefined, st: StorageLike | null = storage()): boolean {
    if (userId == null || userId === '' || !st) return false;
    try { return st.getItem(CLAVE_RAIL + userId) === '1'; } catch { return false; }
}

/** Guarda el estado del rail. Nunca lanza: en incógnito simplemente no hay memoria. */
export function guardarRailAbierto(userId: number | string | null | undefined, abierto: boolean, st: StorageLike | null = storage()): boolean {
    if (userId == null || userId === '' || !st) return false;
    try { st.setItem(CLAVE_RAIL + userId, abierto ? '1' : '0'); return true; } catch { return false; }
}

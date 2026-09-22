/**
 * Secciones de Gestiones (plan Gestiones B8, 2026-09-15) — lógica PURA de navegación, sin DOM ni router.
 *
 * Gestiones nació como "lista de trabajadores + sus documentos" y hoy tiene cuatro secciones: la grilla de
 * trabajadores, Solicitudes de ingreso, Documentos físicos y la portada (tarjetas). Reglas del dueño:
 *  - La portada solo existe para quien tiene ≥ 2 secciones; con una sola se entra directo a ella.
 *  - Al pulsar «Gestiones» en el menú (URL sin `tab`) se abre LO ÚLTIMO que usó esa persona (memoria por
 *    usuario en localStorage); sin memoria → portada. La "casa" es el título del header.
 *  - Un deep-link con filtros de la grilla (`?completitud=faltantes`, `?q=…`) abre la grilla aunque la
 *    memoria diga otra cosa; un `tab` explícito manda sobre todo.
 */

export type SeccionGestiones = 'inicio' | 'trabajadores' | 'solicitudes' | 'fisicos';
export type SeccionTrabajo = Exclude<SeccionGestiones, 'inicio'>;

export interface PermisosGestiones {
    /** trabajadores.ver */
    trabajadores: boolean;
    /** trabajadores.solicitud.crear || .aprobar */
    solicitudes: boolean;
    /** documentos.entrega.registrar || .portar */
    fisicos: boolean;
}

export const SECCION_LABEL: Record<SeccionGestiones, string> = {
    inicio: 'Gestiones',
    trabajadores: 'Trabajadores',
    solicitudes: 'Solicitudes de ingreso',
    fisicos: 'Documentos físicos',
};

/** Orden fijo de las secciones de trabajo (switcher del header y tarjetas de la portada). */
const ORDEN: SeccionTrabajo[] = ['trabajadores', 'solicitudes', 'fisicos'];

/** Query params de la grilla (espejo de hooks/consultas/useConsultasFilters.ts). Un deep-link con alguno abre la grilla. */
export const PARAMS_GRILLA = ['q', 'obra_id', 'empresa_id', 'cargo_id', 'categoria', 'activo', 'completitud', 'ausentes', 'aniversario10m', 'ingreso_desde', 'ingreso_hasta', 'falta_dato', 'doc_tipo_falta', 'doc_vigencia', 'salida_desde', 'salida_hasta', 'no_recontratar', 'finiquito', 'solo_prueba'] as const;

export const esParamGrilla = (key: string): boolean => (PARAMS_GRILLA as readonly string[]).includes(key);

export function tieneParamsGrilla(params: Pick<URLSearchParams, 'keys'>): boolean {
    for (const k of params.keys()) if (esParamGrilla(k)) return true;
    return false;
}

export const esSeccionTrabajo = (v: unknown): v is SeccionTrabajo => typeof v === 'string' && (ORDEN as string[]).includes(v);
export const esSeccion = (v: unknown): v is SeccionGestiones => v === 'inicio' || esSeccionTrabajo(v);

export function seccionesDisponibles(p: PermisosGestiones): SeccionTrabajo[] {
    return ORDEN.filter(s => p[s]);
}

export interface EntradaResolucion {
    /** `searchParams.get('tab')`. */
    tab: string | null | undefined;
    /** Hay algún param de la grilla en la URL (deep-link de filtros). */
    tieneParamsGrilla: boolean;
    permisos: PermisosGestiones;
    /** Última sección de trabajo recordada para este usuario. */
    ultima: SeccionTrabajo | null | undefined;
}

/**
 * Sección a mostrar. Orden: tab explícito válido y permitido → deep-link de filtros (con trabajadores.ver) →
 * última recordada (si sigue permitida) → portada si hay ≥ 2 secciones → la única → null (sin acceso).
 * `tab=inicio` con una sola sección colapsa a esa sección (una portada de una tarjeta es ruido).
 */
export function resolverSeccion({ tab, tieneParamsGrilla, permisos, ultima }: EntradaResolucion): SeccionGestiones | null {
    const disp = seccionesDisponibles(permisos);
    if (!disp.length) return null;
    const unica = disp.length === 1 ? disp[0] : null;

    if (tab === 'inicio') return unica ?? 'inicio';
    if (esSeccionTrabajo(tab) && permisos[tab]) return tab;
    if (tieneParamsGrilla && permisos.trabajadores) return 'trabajadores';
    if (esSeccionTrabajo(ultima) && permisos[ultima]) return ultima;
    return unica ?? 'inicio';
}

// ── Memoria por usuario ────────────────────────────────────────────────────────

export const CLAVE_ULTIMA = 'boveda.gestiones.ultimaSeccion.';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const storage = (): StorageLike | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };

/** Última sección de trabajo del usuario, o null (sin id, sin storage, valor corrupto). */
export function leerUltima(userId: number | string | null | undefined, st: StorageLike | null = storage()): SeccionTrabajo | null {
    if (userId == null || userId === '' || !st) return null;
    try {
        const v = st.getItem(CLAVE_ULTIMA + userId);
        return esSeccionTrabajo(v) ? v : null;
    } catch { return null; }
}

/** Guarda la sección de trabajo; `inicio` (u otra cosa) no se guarda. Nunca lanza. */
export function guardarUltima(userId: number | string | null | undefined, seccion: SeccionGestiones, st: StorageLike | null = storage()): boolean {
    if (userId == null || userId === '' || !st || !esSeccionTrabajo(seccion)) return false;
    try { st.setItem(CLAVE_ULTIMA + userId, seccion); return true; } catch { return false; }
}

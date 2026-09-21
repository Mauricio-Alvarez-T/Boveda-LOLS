/**
 * Helpers de SEMANA (lunes a viernes) para la "Lista de trabajadores en
 * actividades sugeridas": la lista no se asigna a un día sino a una semana,
 * identificada por la fecha de su LUNES ('YYYY-MM-DD'). Decisión de jefatura
 * 2026-09-21. Sin dependencias: todo en hora local con Date a mediodía para
 * esquivar el bug de UTC.
 */

const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Date local a mediodía desde 'YYYY-MM-DD' (o ISO completo; se toma la parte fecha). */
function aMediodia(iso: string): Date {
    const s = String(iso).slice(0, 10);
    return new Date(s + 'T12:00:00');
}

/** 'YYYY-MM-DD' local de un Date. */
export function aIso(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Lunes ('YYYY-MM-DD') de la semana que contiene la fecha dada. */
export function lunesDeSemana(iso: string): string {
    const d = aMediodia(iso);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return aIso(d);
}

/** Viernes ('YYYY-MM-DD') de la semana cuyo lunes se indica. */
export function viernesDeSemana(lunesIso: string): string {
    const d = aMediodia(lunesIso);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + 4);
    return aIso(d);
}

export function esLunes(iso: string): boolean {
    const d = aMediodia(iso);
    return !Number.isNaN(d.getTime()) && d.getDay() === 1;
}

/** 'lun 21/09' */
function diaCorto(iso: string): string {
    const d = aMediodia(iso);
    return `${DIAS_CORTOS[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

/**
 * Etiqueta legible de la semana: "Semana lun 21/09 – vie 25/09".
 * Acepta cualquier fecha de la semana (se normaliza al lunes) para tolerar
 * datos históricos o ISO completo del backend.
 */
export function fmtSemana(iso: string | null | undefined): string {
    if (!iso) return '';
    const lunes = lunesDeSemana(iso);
    if (!lunes) return '';
    return `Semana ${diaCorto(lunes)} – ${diaCorto(viernesDeSemana(lunes))}`;
}

/** Versión compacta para cajas chicas: "21/09 – 25/09". */
export function fmtSemanaCorta(iso: string | null | undefined): string {
    if (!iso) return '';
    const lunes = lunesDeSemana(iso);
    if (!lunes) return '';
    const l = aMediodia(lunes), v = aMediodia(viernesDeSemana(lunes));
    return `${pad2(l.getDate())}/${pad2(l.getMonth() + 1)} – ${pad2(v.getDate())}/${pad2(v.getMonth() + 1)}`;
}

export interface OpcionSemana { value: string; label: string }

/**
 * Opciones para el selector de semana: desde la semana en curso (aunque hoy
 * sea viernes o domingo) hacia adelante, `n` semanas. Valor = lunes ISO.
 */
export function opcionesSemanas(hoyIso: string, n = 26): OpcionSemana[] {
    const lunes = lunesDeSemana(hoyIso);
    if (!lunes) return [];
    const out: OpcionSemana[] = [];
    const d = aMediodia(lunes);
    for (let i = 0; i < n; i++) {
        const iso = aIso(d);
        out.push({ value: iso, label: fmtSemana(iso) + (i === 0 ? ' (en curso)' : '') });
        d.setDate(d.getDate() + 7);
    }
    return out;
}

/**
 * Lógica pura de la bandeja de Solicitudes de ingreso (rediseño 2026-09-15): contadores por estado,
 * antigüedad de una solicitud pendiente y agrupación por obra. Sin React ni fetch → testeable.
 */
import type { SolicitudIngreso, SolicitudIngresoEstado } from '../../types/entities';

export type FiltroSolicitudes = SolicitudIngresoEstado | 'todas';

export const FILTROS_SOLICITUDES: { value: FiltroSolicitudes; label: string }[] = [
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'aprobada', label: 'Aprobadas' },
    { value: 'rechazada', label: 'Rechazadas' },
    { value: 'todas', label: 'Todas' },
];

export type ConteoEstados = Record<FiltroSolicitudes, number>;

export function contarPorEstado(items: SolicitudIngreso[]): ConteoEstados {
    const c: ConteoEstados = { pendiente: 0, aprobada: 0, rechazada: 0, todas: items.length };
    for (const s of items) if (s.estado in c) c[s.estado] += 1;
    return c;
}

export function filtrar(items: SolicitudIngreso[], filtro: FiltroSolicitudes): SolicitudIngreso[] {
    return filtro === 'todas' ? items : items.filter(s => s.estado === filtro);
}

/** Días calendario completos desde `desde` hasta `hoy` (0 = hoy; fecha inválida → null). */
export function diasDesde(desde: string | null | undefined, hoy: Date = new Date()): number | null {
    if (!desde) return null;
    const d = new Date(desde);
    if (Number.isNaN(d.getTime())) return null;
    const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const b = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    return Math.max(0, Math.round((b - a) / 86_400_000));
}

export type TonoEspera = 'ok' | 'aviso' | 'critico';

/** Semáforo de espera de una pendiente: ≥2 días aviso, ≥5 días crítico (una ficha parada frena el ingreso a obra). */
export function tonoEspera(dias: number | null): TonoEspera {
    if (dias === null) return 'ok';
    if (dias >= 5) return 'critico';
    if (dias >= 2) return 'aviso';
    return 'ok';
}

export function textoEspera(dias: number | null): string {
    if (dias === null) return '';
    if (dias === 0) return 'Enviada hoy';
    if (dias === 1) return 'Enviada ayer';
    return `Hace ${dias} días`;
}

export interface GrupoObra { clave: string; obra: string; items: SolicitudIngreso[] }

/** Agrupa por obra conservando el orden de llegada (el backend ya ordena pendientes primero, recientes primero). */
export function agruparPorObra(items: SolicitudIngreso[]): GrupoObra[] {
    const mapa = new Map<string, GrupoObra>();
    for (const s of items) {
        const clave = s.obra_id != null ? String(s.obra_id) : 'sin-obra';
        let g = mapa.get(clave);
        if (!g) { g = { clave, obra: s.obra_nombre || 'Sin obra', items: [] }; mapa.set(clave, g); }
        g.items.push(s);
    }
    return [...mapa.values()];
}

export const iniciales = (s: Pick<SolicitudIngreso, 'apellido_paterno' | 'nombres'>) =>
    `${(s.apellido_paterno || '')[0] || ''}${(s.nombres || '')[0] || ''}`.toUpperCase();

export const nombreCompleto = (s: Pick<SolicitudIngreso, 'apellido_paterno' | 'apellido_materno' | 'nombres'>) =>
    [s.apellido_paterno, s.apellido_materno, s.nombres].filter(Boolean).join(' ');

/**
 * Desde qué día pasa lista cada obra (Marcos 2026-11-20, mig 156). Una obra se crea antes de que haya gente trabajando
 * («llevan hormigón, juntan herramientas»): mientras está «En preparación» no avisa días sin lista; el día que se
 * guarda la primera lista queda «Pasa lista desde» ese día (lo pone el servidor). Lógica pura, sin DOM (jest en node).
 */
import { flagOff } from '../../utils/flags';

/** `preparacion` = participa pero sin fecha; `desde` = pasa lista desde `fecha`; `no` = no participa en Asistencia. */
export type EstadoAsistenciaObra = 'preparacion' | 'desde' | 'no';

export interface ValorAsistenciaObra {
    estado: EstadoAsistenciaObra;
    /** 'YYYY-MM-DD'. Con `preparacion`/`no` es solo la que se propone si eligen «Pasa lista desde». */
    fecha: string;
}

export interface ObraConAsistencia {
    participa_asistencia?: boolean | number | null;
    asistencia_desde?: string | null;
}

/** El API manda la fecha como 'YYYY-MM-DD' o con hora ('…T03:00:00.000Z'): solo el día. */
export const soloDia = (v?: string | null): string => {
    const s = String(v ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

export function valorAsistencia(o: ObraConAsistencia, hoy: string): ValorAsistenciaObra {
    const fecha = soloDia(o.asistencia_desde);
    if (flagOff(o.participa_asistencia)) return { estado: 'no', fecha: fecha || hoy };
    return fecha ? { estado: 'desde', fecha } : { estado: 'preparacion', fecha: hoy };
}

/** Lo que se manda en el PUT /obras/:id. «No pasa asistencia» deja la fecha como estaba. */
export function cuerpoAsistencia(v: ValorAsistenciaObra): { participa_asistencia: boolean; asistencia_desde?: string | null } {
    if (v.estado === 'no') return { participa_asistencia: false };
    return { participa_asistencia: true, asistencia_desde: v.estado === 'desde' ? v.fecha : null };
}

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-11-16' → '16 nov'. */
export function diaCorto(iso: string): string {
    const [, m, d] = iso.slice(0, 10).split('-').map(Number);
    return `${d} ${MES_CORTO[m - 1] ?? ''}`.trim();
}

/** Texto del chip «Asis» de Configuración → Obras. */
export function etiquetaChip(v: ValorAsistenciaObra): string {
    if (v.estado === 'desde') return `Asis · desde ${diaCorto(v.fecha)}`;
    if (v.estado === 'preparacion') return 'Asis · preparando';
    return 'Asis';
}

export const OPCIONES_ASISTENCIA: { estado: EstadoAsistenciaObra; titulo: string; ayuda: string }[] = [
    {
        estado: 'preparacion', titulo: 'En preparación',
        ayuda: 'Llevan materiales y herramientas; todavía no hay gente trabajando. No avisa días sin lista.',
    },
    {
        estado: 'desde', titulo: 'Pasa lista desde',
        ayuda: 'Desde ese día, si un día hábil no se guarda la lista, le avisa a RR.HH.',
    },
    {
        estado: 'no', titulo: 'No pasa asistencia',
        ayuda: 'No aparece en Asistencia (por ejemplo, una bodega).',
    },
];

export const NOTA_PREPARACION =
    'Si queda «En preparación», el día que el jefe de obra guarde la primera lista pasa solo a «Pasa lista desde» ese día.';

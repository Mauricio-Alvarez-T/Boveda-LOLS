/**
 * Detalle «Asistencia» del Inicio, fase 2 (dueño 2026-10-20): próximos 14 días, descuentos del mes y
 * horas extra por obra. Lógica pura, sin DOM. Datos de GET /dashboard/asistencia (backend
 * `inicioAsistencia.service`); cada bloque llega null si el perfil no tiene su permiso.
 */

interface Persona {
    trabajador_id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    obra?: string | null;
}

export type EventoProximo =
    | ({ tipo: 'inicio'; fecha: string; codigo: string; estado: string; hasta: string } & Persona)
    | ({ tipo: 'fin'; fecha: string; codigo: string; estado: string; vuelve: string } & Persona)
    | { tipo: 'feriado'; fecha: string; nombre: string; irrenunciable: boolean };

export interface FilaDescuento {
    trabajador_id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    /** Días por código que no se paga (F, LM, PSG…). */
    dias: Record<string, number>;
    /** Días con jornada incompleta (sus horas las calcula el Excel). */
    ji: number;
    total: number;
}

export interface DetalleAsistenciaApi {
    hoy: string;
    proximos: { desde: string; hasta: string; eventos: EventoProximo[] } | null;
    descuentos: { desde: string; hasta: string; columnas: string[]; trabajadores: number; dias: number; lista: FilaDescuento[] } | null;
    horasExtra: { desde: string; hasta: string; total: number; porObra: { obra_id: number; obra: string; horas: number; trabajadores: number }[] } | null;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const partes = (iso: string) => iso.slice(0, 10).split('-').map(Number) as [number, number, number];
const dow = (iso: string) => {
    const [y, m, d] = partes(iso);
    return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** «jue 22 oct». */
export function fechaCorta(iso: string): string {
    const [, m, d] = partes(iso);
    return `${DIAS[dow(iso)]} ${d} ${MESES[m - 1]}`;
}

/** Bloque de fecha de la lista: «jue» / 22, y «Hoy» o «Mañana» si toca. */
export function bloqueFecha(iso: string, hoy: string): { dia: string; num: number; relativo: string | null } {
    const [, , d] = partes(iso);
    const dif = Math.round((Date.UTC(...ymd(iso)) - Date.UTC(...ymd(hoy))) / 86_400_000);
    return { dia: DIAS[dow(iso)], num: d, relativo: dif === 0 ? 'Hoy' : dif === 1 ? 'Mañana' : null };
}
function ymd(iso: string): [number, number, number] {
    const [y, m, d] = partes(iso);
    return [y, m - 1, d];
}

/** Día hábil siguiente (salta sábado y domingo; los feriados no se conocen aquí). */
export function habilDesde(iso: string): string {
    const [y, m, d] = partes(iso);
    let t = Date.UTC(y, m - 1, d);
    while ([0, 6].includes(new Date(t).getUTCDay())) t += 86_400_000;
    return new Date(t).toISOString().slice(0, 10);
}

export type TonoEvento = 'info' | 'neutral' | 'success' | 'warning';

/** Rótulo, tono y texto de cada evento de «Próximos 14 días». */
export function describirEvento(e: EventoProximo): { rotulo: string; tono: TonoEvento; texto: string; detalle: string } {
    if (e.tipo === 'feriado') {
        return { rotulo: e.irrenunciable ? 'Feriado irrenunciable' : 'Feriado', tono: 'success', texto: e.nombre, detalle: 'No se marca asistencia' };
    }
    const nombre = `${e.apellido_paterno} ${e.nombres}`;
    const estado = e.estado.toLowerCase();
    if (e.tipo === 'inicio') {
        return {
            rotulo: `Empieza ${estado}`, tono: e.codigo === 'LM' ? 'info' : 'neutral', texto: nombre,
            detalle: [e.obra, `hasta el ${fechaCorta(e.hasta)}`].filter(Boolean).join(' · '),
        };
    }
    return {
        rotulo: `Termina ${estado}`, tono: e.codigo === 'LM' ? 'warning' : 'neutral', texto: nombre,
        detalle: [e.obra, `vuelve el ${fechaCorta(habilDesde(e.vuelve))}`].filter(Boolean).join(' · '),
    };
}

/** «186,5 h» (coma decimal, sin decimales si es entero). */
export const fmtHoras = (h: number) =>
    `${(Math.round(h * 10) / 10).toLocaleString('es-CL', { maximumFractionDigits: 1 })} h`;

/** Ancho de la barra de una obra respecto de la que más horas tiene. */
export const anchoRelativo = (valor: number, maximo: number) =>
    maximo > 0 ? `${Math.max(2, (valor / maximo) * 100).toFixed(1)}%` : '0%';

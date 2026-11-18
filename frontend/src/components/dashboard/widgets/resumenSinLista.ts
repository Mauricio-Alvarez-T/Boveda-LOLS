/**
 * Obras que no pasaron la lista en los días hábiles anteriores (Marcos 2026-11-18: «al jefe de obra se le olvidó
 * mandar; que Daphne lo vea en la tarjeta de Asistencia y al entrar al otro día»). Lógica pura, sin DOM. Los datos
 * llegan de GET /dashboard/asistencia/sin-lista (backend: `asistenciaSinLista.service`).
 */
import { fechaLarga } from './mensajesWhatsApp';

export interface DiaSinLista {
    /** 'YYYY-MM-DD'. */
    fecha: string;
    /** `nadie` = ninguna fila ese día; `solo_periodos` = solo las filas de licencias o vacaciones. */
    motivo: 'nadie' | 'solo_periodos';
    registros: number;
}

export interface ObraSinLista {
    obra_id: number;
    obra: string;
    encargado: string | null;
    dotacion: number;
    /** Del más reciente al más antiguo. */
    dias: DiaSinLista[];
    /** Última lista guardada antes de hoy y quién la guardó. */
    ultima: { fecha: string; por: string | null } | null;
}

export interface SinListaData {
    /** 'YYYY-MM-DD' de hoy en Chile. */
    hoy: string;
    /** Días hábiles revisados, del más reciente al más antiguo. */
    dias: string[];
    obras: ObraSinLista[];
}

const sumarDias = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** «ayer», «anteayer» o «lunes 16». */
export function cuando(fecha: string, hoy: string): string {
    if (fecha === sumarDias(hoy, -1)) return 'ayer';
    if (fecha === sumarDias(hoy, -2)) return 'anteayer';
    return fechaLarga(fecha).replace(/ de \S+$/, '');
}

/** «ayer», «ayer y el lunes 16», «3 días». */
export function cuandoDias(dias: DiaSinLista[], hoy: string): string {
    if (dias.length === 0) return '';
    if (dias.length > 2) return `${dias.length} días`;
    const partes = dias.map(d => cuando(d.fecha, hoy));
    return partes.length === 1 ? partes[0] : `${partes[0]} y ${/^\D+ \d/.test(partes[1]) ? 'el ' : ''}${partes[1]}`;
}

/** Bajada de la casilla de la tarjeta: «ayer · DOMEYKO» (una obra) o «DOMEYKO y GORBEA» (varias). */
export function bajadaCasilla(s: SinListaData, max = 2): string {
    const obras = s.obras;
    if (obras.length === 0) return '';
    if (obras.length === 1) return `${cuandoDias(obras[0].dias, s.hoy)} · ${obras[0].obra}`;
    const nombres = obras.map(o => o.obra);
    return nombres.length <= max
        ? `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
        : `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;
}

/** Qué pasó ese día, en palabras. */
export function queEPaso(d: DiaSinLista): string {
    return d.motivo === 'solo_periodos'
        ? `Nadie pasó la lista: solo estaban ${d.registros === 1 ? 'la licencia o vacaciones de 1 persona' : `las licencias o vacaciones de ${d.registros} personas`}`
        : 'Nadie pasó la lista';
}

/** «La última la guardó Pedro Soto el viernes 13» / «No tiene listas guardadas antes». */
export function textoUltima(o: ObraSinLista, hoy: string): string {
    if (!o.ultima) return 'No tiene listas guardadas antes de hoy.';
    const dia = cuando(o.ultima.fecha, hoy);
    const el = /^\D+ \d/.test(dia) ? `el ${dia}` : dia;
    return o.ultima.por ? `La última la guardó ${o.ultima.por} ${el}.` : `La última es del ${dia}.`;
}

/** Clave para mostrar la ventana una sola vez al día por persona. */
export const claveVisto = (usuarioId: number | string) => `boveda_sin_lista_visto_${usuarioId}`;

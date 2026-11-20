/**
 * Obras que no pasaron la lista en los días hábiles anteriores (Marcos 2026-11-18: «al jefe de obra se le olvidó
 * mandar; que Daphne lo vea en la tarjeta de Asistencia y al entrar al otro día»). Lógica pura, sin DOM. Los datos
 * llegan de GET /dashboard/asistencia/sin-lista (backend: `asistenciaSinLista.service`).
 */
import { fechaLarga, PIE_WHATSAPP } from './mensajesWhatsApp';

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
    /** Desde qué día pasa lista (mig 156): los días anteriores no le correspondían («antes de empezar»). */
    asistencia_desde?: string | null;
    dotacion: number;
    /** Del más reciente al más antiguo. */
    dias: DiaSinLista[];
    /** Días del último mes en que SÍ se guardó la lista (para el calendario); los demás hábiles no le correspondían. */
    guardadas?: string[];
    /** Última lista guardada antes de hoy y quién la guardó. */
    ultima: { fecha: string; por: string | null } | null;
}

export interface SinListaData {
    /** 'YYYY-MM-DD' de hoy en Chile. */
    hoy: string;
    /** Primer día revisado (30 días corridos atrás: el último mes). */
    desde?: string;
    /** Días hábiles revisados, del más reciente al más antiguo. */
    dias: string[];
    obras: ObraSinLista[];
}

/**
 * La ventana al entrar avisa solo lo reciente (los últimos `RECIENTES` días hábiles): lo del último mes queda en la
 * tarjeta y el detalle del Inicio, para controlar sin que la ventana repita todos los días algo de hace semanas.
 */
export const RECIENTES = 5;

/** Los mismos datos, pero solo con los días sin lista de los últimos `n` días hábiles (y las obras que los tengan). */
export function soloRecientes(s: SinListaData, n = RECIENTES): SinListaData {
    const recientes = new Set(s.dias.slice(0, n));
    const obras = s.obras
        .map(o => ({ ...o, dias: o.dias.filter(d => recientes.has(d.fecha)) }))
        .filter(o => o.dias.length > 0);
    return { ...s, dias: s.dias.slice(0, n), obras };
}

export type EstadoDia = 'falta' | 'guardada' | 'feriado' | 'no_aplica' | 'antes' | 'hoy';
export interface CeldaMes { fecha: string; dia: number; estado: EstadoDia; motivo?: DiaSinLista }

/**
 * Calendario del último mes de una obra: semanas de lunes a viernes (fines de semana fuera), de la más antigua a la
 * de hoy. `null` = fuera del mes revisado. Hábil sin lista → `falta`; guardada → `guardada`; día de semana que no
 * está entre los revisados → `feriado`; antes del día desde el que la obra pasa lista → `antes`; revisado pero sin
 * trabajadores → `no_aplica`.
 */
export function calendarioMes(s: SinListaData, o: ObraSinLista): (CeldaMes | null)[][] {
    const desde = s.desde ?? s.dias[s.dias.length - 1];
    if (!desde) return [];
    const habiles = new Set(s.dias);
    const faltas = new Map(o.dias.map(d => [d.fecha, d]));
    const guardadas = new Set(o.guardadas ?? []);
    const inicioLista = (o.asistencia_desde ?? '').slice(0, 10);
    const [y, m, d] = desde.split('-').map(Number);
    const inicio = new Date(Date.UTC(y, m - 1, d));
    inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7)); // lunes de esa semana
    const semanas: (CeldaMes | null)[][] = [];
    for (const dia = new Date(inicio); dia.toISOString().slice(0, 10) <= s.hoy; dia.setUTCDate(dia.getUTCDate() + 7)) {
        const semana: (CeldaMes | null)[] = [];
        for (let i = 0; i < 5; i++) {
            const f = new Date(dia);
            f.setUTCDate(f.getUTCDate() + i);
            const fecha = f.toISOString().slice(0, 10);
            if (fecha < desde || fecha > s.hoy) { semana.push(null); continue; }
            const estado: EstadoDia = fecha === s.hoy ? 'hoy'
                : faltas.has(fecha) ? 'falta'
                : guardadas.has(fecha) ? 'guardada'
                : inicioLista && fecha < inicioLista ? 'antes'
                : habiles.has(fecha) ? 'no_aplica' : 'feriado';
            semana.push({ fecha, dia: f.getUTCDate(), estado, motivo: faltas.get(fecha) });
        }
        if (semana.some(Boolean)) semanas.push(semana);
    }
    return semanas;
}

/** «19 de octubre al 17 de noviembre»: el tramo que muestra el calendario (sin hoy). */
export function tramoMes(s: SinListaData): string {
    const desde = s.desde ?? s.dias[s.dias.length - 1];
    const hasta = s.dias[0];
    if (!desde || !hasta) return '';
    const sinDia = (iso: string) => fechaLarga(iso).replace(/^\S+ /, '');
    return `${sinDia(desde)} al ${sinDia(hasta)}`;
}

const sumarDias = (iso: string, n: number) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/**
 * «ayer», «anteayer», «lunes 16» (dentro de la última semana) o «miércoles 21 de octubre» (más atrás: sin el mes se
 * leía como de este mes, visto en test el 2026-11-18).
 */
export function cuando(fecha: string, hoy: string): string {
    if (fecha === sumarDias(hoy, -1)) return 'ayer';
    if (fecha === sumarDias(hoy, -2)) return 'anteayer';
    const larga = fechaLarga(fecha);
    return fecha >= sumarDias(hoy, -6) ? larga.replace(/ de \S+$/, '') : larga;
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

/**
 * Obra «En preparación» (mig 156: participa pero aún no pasa lista) que ya tiene trabajadores (Marcos 2026-11-20: «que
 * pase un aviso si sigue en preparación… para el jefe que se haya olvidado o no sabe, y que a Daphne también le
 * llegue»). Datos de GET /dashboard/asistencia/en-preparacion (backend: `asistenciaSinLista.getEnPreparacion`).
 */
export interface ObraEnPreparacion {
    obra_id: number;
    obra: string;
    encargado: string | null;
    /** Trabajadores activos que ya ingresaron. */
    dotacion: number;
}

export interface EnPreparacionData {
    hoy: string;
    obras: ObraEnPreparacion[];
}

/** «7 trabajadores» / «1 trabajador». */
export const trabajadores = (n: number) => `${n} ${n === 1 ? 'trabajador' : 'trabajadores'}`;

/** «Preguntarle» por WhatsApp desde la campana de RR.HH. */
export function mensajePreguntarPreparacion(obra: string): string {
    return `Hola, *${obra}* aparece en Bóveda como obra en preparación y todavía no tiene listas guardadas. `
        + `¿Ya empezaron a trabajar? Si es así, por favor pase la lista de hoy en Bóveda. Gracias.${PIE_WHATSAPP}`;
}

/**
 * Tarjeta «Faltas del mes» del Inicio (pedido del dueño 2026-10-20: «era un dato muy usado en versiones
 * anteriores»). Lógica PURA, sin DOM, para poder testearla. Los datos llegan de /dashboard/summary
 * (`faltasMes`, backend `asistenciaService.getFaltasMes`): todos los trabajadores con al menos una falta
 * injustificada (F) en el mes, con más faltas arriba.
 */

export interface AlertaFalta {
    tipo: 'consecutivas' | 'lunes' | 'acumuladas';
    mensaje: string;
}

export interface TrabajadorFaltas {
    trabajador_id: number;
    nombres: string;
    apellido_paterno: string;
    rut: string;
    /** Obra de su falta más reciente. */
    obra_nombre?: string | null;
    total_faltas: number;
    /** 'YYYY-MM-DD' de cada falta del mes, en orden. */
    fechas?: string[];
    /** Reglas del Art. 160 N°3 que gatilla (vacío = falta suelta). */
    alertas: AlertaFalta[];
}

export interface FaltasMesData {
    trabajadores: number;
    faltas: number;
    /** Trabajadores que gatillan alguna regla (2 seguidas, 2 lunes o 3 en el mes). */
    reiteradas: number;
    /** Los primeros 30, ordenados por cantidad de faltas. */
    lista: TrabajadorFaltas[];
}

export type TonoFaltas = 'rojo' | 'ambar' | 'verde';

/** Rojo si alguien ya es reiterado; ámbar si hay faltas sueltas; verde si nadie faltó. */
export function tonoFaltas(d: Pick<FaltasMesData, 'trabajadores' | 'reiteradas'>): TonoFaltas {
    return d.reiteradas > 0 ? 'rojo' : d.trabajadores > 0 ? 'ambar' : 'verde';
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * Días de falta en corto: «6, 7 y 13 oct». Con más de `max` días se corta: «1, 2, 5, 6, 7 … (+2) oct».
 * Sin Date para no correr la fecha por zona horaria.
 */
export function diasFaltas(fechas: string[] | undefined, max = 5): string {
    if (!fechas?.length) return '';
    const dias = fechas.map(f => String(parseInt(f.slice(8, 10), 10)));
    const mes = MESES[parseInt(fechas[0].slice(5, 7), 10) - 1] ?? '';
    if (dias.length > max) return `${dias.slice(0, max).join(', ')} … (+${dias.length - max}) ${mes}`.trim();
    const texto = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
    return `${texto} ${mes}`.trim();
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** «octubre» (para el subtítulo de la tarjeta). */
export const nombreMes = (d: Date) => MESES_LARGOS[d.getMonth()];

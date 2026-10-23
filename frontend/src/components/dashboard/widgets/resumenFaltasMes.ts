/**
 * Tarjeta «Asistencia» del Inicio (pedido del dueño 2026-10-20: «era un dato muy usado en versiones
 * anteriores»). Lógica PURA, sin DOM, para poder testearla. Los datos llegan de /dashboard/summary
 * (`faltasMes`, backend `asistenciaService.getAlertasFaltas`): los trabajadores con faltas injustificadas
 * (F) REITERADAS en el mes calendario —2 lunes, 3 días o 2 días seguidos (Art. 160 N°3)—, con más faltas
 * arriba. El dueño lo precisó así: las faltas sueltas no van.
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
    /** Total real de reiterados (la lista llega cortada en 200). */
    reiterados: number;
    /** Los primeros 200, ordenados por cantidad de faltas. */
    lista: TrabajadorFaltas[];
}

/**
 * Rótulo corto de cada regla, en el orden en que se leen. «2 seguidas» va en rojo (lo más grave); las
 * otras dos en ámbar, como en el aviso del WhatsApp diario.
 */
export const REGLA_FALTA: Record<AlertaFalta['tipo'], { texto: string; grave: boolean }> = {
    consecutivas: { texto: '2 días seguidos', grave: true },
    lunes: { texto: '2 lunes', grave: false },
    acumuladas: { texto: '3 o más días', grave: false },
};

const ORDEN_REGLAS: AlertaFalta['tipo'][] = ['consecutivas', 'lunes', 'acumuladas'];

/** Reglas que gatilla un trabajador, ordenadas y sin repetir. */
export function reglasDe(t: Pick<TrabajadorFaltas, 'alertas'>): AlertaFalta['tipo'][] {
    const tipos = new Set(t.alertas.map(a => a.tipo));
    return ORDEN_REGLAS.filter(r => tipos.has(r));
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

/**
 * Reiterados en orden de urgencia (dueño 2026-10-20, detalle «Por urgencia»): primero quien tiene 2 días
 * seguidos (lo más grave), luego por cantidad de faltas, luego por cuántas reglas gatilla y por apellido.
 */
export function ordenarReiterados<T extends Pick<TrabajadorFaltas, 'alertas' | 'total_faltas' | 'apellido_paterno'>>(lista: T[]): T[] {
    const grave = (t: T) => (t.alertas.some(a => a.tipo === 'consecutivas') ? 1 : 0);
    return [...lista].sort((x, y) =>
        grave(y) - grave(x)
        || y.total_faltas - x.total_faltas
        || y.alertas.length - x.alertas.length
        || String(x.apellido_paterno ?? '').localeCompare(String(y.apellido_paterno ?? ''), 'es'));
}

/** Una celda del mini calendario de lunes a viernes (fichas de «Requiere acción»). */
export interface CeldaCalendario {
    /** null = hueco antes del día 1 o después del último hábil. */
    dia: number | null;
    /** falta = F del trabajador; habil = día pasado sin falta; futuro = después de hoy. */
    tipo: 'falta' | 'habil' | 'futuro' | 'vacio';
    hoy: boolean;
}

/**
 * El mes en semanas de lunes a viernes (dueño 2026-10-20, opción A del lienzo): 4 a 6 filas de 5 celdas.
 * Así «2 lunes» se ve como una columna y «2 días seguidos» como dos celdas juntas. `mes` va de 1 a 12;
 * `hoyDia` es null si el mes ya pasó. En UTC para que el día de la semana no dependa de la zona horaria.
 */
export function semanasDelMes(fechas: string[] | undefined, anio: number, mes: number, hoyDia: number | null): CeldaCalendario[][] {
    const faltas = new Set((fechas ?? [])
        .filter(f => Number(f.slice(0, 4)) === anio && Number(f.slice(5, 7)) === mes)
        .map(f => Number(f.slice(8, 10))));
    const largo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
    const vacia = (): CeldaCalendario => ({ dia: null, tipo: 'vacio', hoy: false });
    const semanas: CeldaCalendario[][] = [];
    let actual: CeldaCalendario[] | null = null;
    for (let dia = 1; dia <= largo; dia++) {
        const col = (new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay() + 6) % 7; // 0 = lunes
        if (col > 4) continue;
        if (!actual || col === 0) {
            actual = Array.from({ length: 5 }, vacia);
            semanas.push(actual);
        }
        actual[col] = {
            dia,
            tipo: faltas.has(dia) ? 'falta' : hoyDia != null && dia > hoyDia ? 'futuro' : 'habil',
            hoy: dia === hoyDia,
        };
    }
    return semanas;
}

const DIA_CORTO = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** «Faltó el lun 5, lun 12, mar 13 y mar 20 (hoy).» */
export function fraseFaltas(fechas: string[] | undefined, hoyIso: string): string {
    if (!fechas?.length) return 'Sin faltas este mes.';
    const dias = fechas.map(f => {
        const [y, m, d] = f.slice(0, 10).split('-').map(Number);
        return `${DIA_CORTO[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}${f.slice(0, 10) === hoyIso ? ' (hoy)' : ''}`;
    });
    const texto = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
    return `Faltó el ${texto}.`;
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Texto del calendario para lector de pantalla: «Faltas: lunes 5, lunes 12 y martes 13». */
export function ariaFaltas(fechas: string[] | undefined): string {
    if (!fechas?.length) return 'Sin faltas este mes';
    const dias = fechas.map(f => {
        const [y, m, d] = f.slice(0, 10).split('-').map(Number);
        return `${DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
    });
    const texto = dias.length === 1 ? dias[0] : `${dias.slice(0, -1).join(', ')} y ${dias[dias.length - 1]}`;
    return `Faltas: ${texto}`;
}

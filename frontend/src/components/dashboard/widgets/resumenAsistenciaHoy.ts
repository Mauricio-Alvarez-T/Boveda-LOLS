/**
 * Asistencia de HOY para la tarjeta y el detalle «Asistencia» del Inicio (dueño 2026-10-20: tarjeta
 * «Pulso del día»). Lógica pura, sin DOM. Los datos llegan de /dashboard/summary → `ausentesHoy`
 * (backend: ausentes del día de Chile, fila vigente, agrupados por código de estado).
 */

export interface AusenteHoy {
    trabajador_id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    /** Código del estado: F, LM, V, PSG, JI… */
    codigo: string;
    estado: string;
    obra?: string | null;
}

export interface GrupoEstado {
    codigo: string;
    nombre: string;
    n: number;
}

export interface AusentesHoy {
    fecha: string;
    total: number;
    /** Ya ordenado: el motivo más numeroso primero. */
    porEstado: GrupoEstado[];
    lista: AusenteHoy[];
}

export interface ObrasHoy {
    total: number;
    guardadas: number;
    /** Nombres en orden alfabético. */
    sinGuardar: string[];
    finDeSemana: boolean;
}

/** Secciones del detalle a las que lleva una cifra de la tarjeta. */
export type SeccionAsistencia = 'reiterados' | 'hoy';

/** id de cada sección del detalle, para que la tarjeta lleve directo a ella. */
export const ID_SECCION: Record<SeccionAsistencia, string> = {
    reiterados: 'inicio-asistencia-reiterados',
    hoy: 'inicio-asistencia-hoy',
};

/** «5 F · 4 LM · 3 otros»: los `max` motivos más numerosos y el resto junto. Vacío si nadie faltó. */
export function desgloseAusentes(porEstado: GrupoEstado[], max = 2): string {
    const grupos = porEstado.filter(g => g.n > 0);
    if (grupos.length === 0) return '';
    // Si el resto es un solo motivo, se nombra en vez de decir «otros».
    const cortar = grupos.length > max + 1 ? max : grupos.length;
    const partes = grupos.slice(0, cortar).map(g => `${g.n} ${g.codigo}`);
    const resto = grupos.slice(cortar).reduce((s, g) => s + g.n, 0);
    if (resto > 0) partes.push(`${resto} ${resto === 1 ? 'otro' : 'otros'}`);
    return partes.join(' · ');
}

/** Cuántos tienen ese código hoy (p. ej. licencias médicas activas = 'LM'). */
export const contarEstado = (a: AusentesHoy | null | undefined, codigo: string) =>
    a?.porEstado.find(g => g.codigo === codigo)?.n ?? 0;

/**
 * Color de cada motivo en la barra y la leyenda del detalle. Se distinguen también por claridad, no solo
 * por tono: rojo (falta, riesgo legal), azul (licencia, informativo), gris (vacaciones, esperado), ámbar
 * (permiso). Clases literales completas para el JIT de Tailwind.
 */
const COLOR_ESTADO: Record<string, string> = {
    F: 'bg-red-600',
    LM: 'bg-blue-600',
    V: 'bg-slate-400',
    PSG: 'bg-amber-500',
};
export const colorEstado = (codigo: string) => COLOR_ESTADO[codigo] ?? 'bg-zinc-400';

export interface GrupoAusentes extends GrupoEstado {
    personas: AusenteHoy[];
    /** Ancho en la barra apilada, en % con dos decimales. */
    ancho: string;
}

/** Ausentes agrupados por motivo, en el orden de `porEstado`, con sus personas por apellido. */
export function gruposAusentes(a: AusentesHoy): GrupoAusentes[] {
    const total = a.porEstado.reduce((s, g) => s + g.n, 0);
    return a.porEstado.filter(g => g.n > 0).map(g => ({
        ...g,
        ancho: total > 0 ? `${((g.n / total) * 100).toFixed(2)}%` : '0%',
        personas: a.lista
            .filter(p => p.codigo === g.codigo)
            .sort((x, y) => x.apellido_paterno.localeCompare(y.apellido_paterno, 'es') || x.nombres.localeCompare(y.nombres, 'es')),
    }));
}

/**
 * Segmentos de la barra «13 de 15 obras guardaron hoy»: uno por obra mientras quepan (hasta `max`); con
 * más obras devuelve null y la tarjeta dibuja una barra continua.
 */
export function segmentosObras(total: number, guardadas: number, max = 24): boolean[] | null {
    if (total <= 0 || total > max) return null;
    return Array.from({ length: total }, (_, i) => i < guardadas);
}

/** «DOMEYKO y GORBEA», «A, B y 3 más». */
export function listaObras(nombres: string[], max = 2): string {
    if (nombres.length === 0) return '';
    if (nombres.length <= max) {
        return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
    }
    return `${nombres.slice(0, max).join(', ')} y ${nombres.length - max} más`;
}

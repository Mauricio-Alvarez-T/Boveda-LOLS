/**
 * Períodos laborales de un trabajador (reingreso, mig 152 — docs/reglas/rrhh-trabajadores.md
 * § Reingreso y períodos laborales). Espejo de backend/src/utils/periodosLaborales.js. Puro, sin DOM.
 *
 *  · Período ACTUAL  = [fecha_ingreso, fecha_desvinculacion | abierto] del trabajador.
 *  · Períodos CERRADOS = bajas tras las que el trabajador volvió. Llegan como texto en
 *    `periodos_cerrados` ('desde|hasta,desde|hasta' — lista/ficha del CRUD) o como objetos en
 *    `periodos_laborales` (GET /trabajadores/:id/resumen, con empresa y cargo).
 *
 * Nombre: «período» a secas ya es la ausencia (PeriodoAusencia, /asistencias/periodos).
 */

export interface PeriodoLaboral {
    desde: string | null;
    /** null = período abierto (el actual de un activo). */
    hasta: string | null;
    empresa_id?: number | null;
    cargo_id?: number | null;
    empresa_nombre?: string | null;
    cargo_nombre?: string | null;
    causal_codigo?: string | null;
    causal_nombre?: string | null;
    /** Cuándo se registró el reingreso que cerró este período (solo en GET /:id/resumen). */
    reingresado_en?: string | null;
}

export type MotivoFuera = 'pre_contrato' | 'finiquitado' | 'entre_periodos' | null;

interface ConPeriodos {
    fecha_ingreso?: string | null;
    fecha_desvinculacion?: string | null;
    periodos_cerrados?: string | null;
    periodos_laborales?: PeriodoLaboral[] | null;
}

const ymd = (v?: string | null): string | null => {
    if (!v) return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/** 'desde|hasta,desde|hasta' → períodos cerrados (null/'' → []). */
export function parseCerrados(texto?: string | null): PeriodoLaboral[] {
    if (!texto) return [];
    return String(texto).split(',').map(par => {
        const [desde, hasta] = par.split('|');
        return { desde: ymd(desde), hasta: ymd(hasta) };
    }).filter(p => p.hasta);
}

/** Períodos CERRADOS del trabajador, en orden (prefiere los objetos del resumen). */
export function periodosCerradosDe(w: ConPeriodos): PeriodoLaboral[] {
    const lista = w.periodos_laborales?.length
        ? w.periodos_laborales.map(p => ({ ...p, desde: ymd(p.desde), hasta: ymd(p.hasta) }))
        : parseCerrados(w.periodos_cerrados);
    return [...lista].sort((a, b) => String(a.desde || '').localeCompare(String(b.desde || '')));
}

/** Cerrados + el actual (último). Sin cerrados = un solo período: el comportamiento de siempre. */
export function periodosDe(w: ConPeriodos): PeriodoLaboral[] {
    return [...periodosCerradosDe(w), { desde: ymd(w.fecha_ingreso), hasta: ymd(w.fecha_desvinculacion) }];
}

const dentro = (f: string, p: PeriodoLaboral) => (!p.desde || f >= p.desde) && (!p.hasta || f <= p.hasta);

/** Motivo por el que `fecha` cae fuera de todo período, o null si está dentro de alguno. */
export function fueraDePeriodo(fecha: string, periodos: PeriodoLaboral[]): MotivoFuera {
    const f = ymd(fecha);
    if (!f || !periodos.length) return null;
    if (periodos.some(p => dentro(f, p))) return null;
    const desdes = periodos.map(p => p.desde).filter((d): d is string => !!d);
    if (desdes.length && f < desdes.reduce((a, b) => (a < b ? a : b))) return 'pre_contrato';
    const ultimo = periodos[periodos.length - 1];
    if (ultimo.hasta && f > ultimo.hasta) return 'finiquitado';
    return 'entre_periodos';
}

/** Título del día bloqueado en calendario / fila diaria. */
export function tituloFuera(motivo: MotivoFuera): string {
    if (motivo === 'pre_contrato') return 'Bloqueado: Aún no contratado';
    if (motivo === 'finiquitado') return 'Bloqueado por Finiquito';
    if (motivo === 'entre_periodos') return 'Bloqueado: entre períodos (no trabajaba)';
    return '';
}

/** Días corridos de [desde, hasta] (ambos incluidos). */
function diasEntre(desde: string, hasta: string): number {
    const [a, b] = [desde, hasta].map(s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); });
    return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

const restarMeses = (f: string, meses: number): string => {
    const [y, m, d] = f.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1 - meses, d));
    return dt.toISOString().slice(0, 10);
};

export interface Art159 {
    /** Contratos con esta empresa contando el reingreso (al menos: las renovaciones dentro de un período no se registran). */
    contratos: number;
    /** Meses trabajados con esta empresa en los 15 meses previos al reingreso. */
    meses: number;
    /** ninguno: <2 contratos · info: 2º contrato · alerta: 3º o más · presuncion: 3º o más y ≥12 meses. */
    nivel: 'ninguno' | 'info' | 'alerta' | 'presuncion';
}

/**
 * Art. 159 N°4 del Código del Trabajo: más de dos contratos a plazo con 12 meses o más de servicios
 * dentro de 15 meses → la ley presume contrato indefinido. Aviso SOLO informativo (decisión del dueño
 * 2026-11-17): cuenta los períodos con la MISMA empresa que terminaron dentro de los 15 meses previos.
 */
export function evaluarArt159(periodos: PeriodoLaboral[], empresaId: number | null | undefined, fechaNueva: string): Art159 {
    const f = ymd(fechaNueva);
    if (!f || !empresaId) return { contratos: 1, meses: 0, nivel: 'ninguno' };
    const inicioVentana = restarMeses(f, 15);
    const previos = periodos.filter(p => p.empresa_id === empresaId && p.hasta && p.hasta >= inicioVentana && p.hasta < f);
    let dias = 0;
    for (const p of previos) {
        const desde = p.desde && p.desde > inicioVentana ? p.desde : inicioVentana;
        dias += diasEntre(desde, p.hasta as string);
    }
    const meses = Math.floor(dias / 30.4);
    const contratos = previos.length + 1;
    const nivel = contratos >= 3 ? (meses >= 12 ? 'presuncion' : 'alerta') : contratos === 2 ? 'info' : 'ninguno';
    return { contratos, meses, nivel };
}

/**
 * Momento desde el cual los documentos son del período ACTUAL: el registro del último reingreso
 * (`reingresado_en` del último período cerrado). null = nunca volvió (todo es del período actual).
 */
export function inicioDocsPeriodoActual(cerrados: PeriodoLaboral[]): string | null {
    const conReingreso = cerrados.filter(p => p.reingresado_en);
    if (!conReingreso.length) return null;
    return conReingreso.map(p => p.reingresado_en as string).reduce((a, b) => (Date.parse(a) >= Date.parse(b) ? a : b));
}

/** Día local 'YYYY-MM-DD' de un instante ISO / 'YYYY-MM-DD HH:MM:SS'. */
const diaLocal = (v: string): string | null => {
    const t = Date.parse(v.includes('T') || v.length <= 10 ? v : v.replace(' ', 'T'));
    if (Number.isNaN(t)) return ymd(v);
    const d = new Date(t);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * ¿El documento es de un período ANTERIOR al contrato en curso? (la ficha lo muestra atenuado).
 * Se compara contra el registro del reingreso y no contra la fecha de ingreso: el kit del contrato nuevo
 * puede emitirse días antes de que empiece, y el finiquito del período anterior después de la baja.
 *  · Generado (`fecha_generacion`, con hora) → instante exacto.
 *  · Subido (`fecha_subida`, solo día) → antes del DÍA del reingreso (el mismo día cuenta como actual).
 */
export function esDocDePeriodoAnterior(
    doc: { fecha_subida?: string | null; fecha_generacion?: string | null }, inicioActual: string | null
): boolean {
    if (!inicioActual) return false;
    if (doc.fecha_generacion) {
        const g = Date.parse(String(doc.fecha_generacion).replace(' ', 'T'));
        const r = Date.parse(inicioActual);
        if (!Number.isNaN(g) && !Number.isNaN(r)) return g < r;
    }
    const f = ymd(doc.fecha_subida) ?? (doc.fecha_generacion ? diaLocal(String(doc.fecha_generacion)) : null);
    const dia = diaLocal(inicioActual);
    return !!f && !!dia && f < dia;
}

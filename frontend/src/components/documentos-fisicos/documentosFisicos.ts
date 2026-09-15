/**
 * Cadena de custodia de documentos físicos (plan Gestiones B6, mig 114) — lógica PURA compartida por el
 * panel, el modal de nuevo lote y el detalle. Sin DOM. Espejo de backend/src/services/documentosLotes.service.js.
 *
 * Flujo: RRHH arma un LOTE de documentos impresos para un portador → el portador confirma en Bóveda que
 * los recibió → firma en obra → RRHH confirma la devolución (firmados / sin firma). Doble llave estricta.
 */

export type LoteEstado = 'pendiente_retiro' | 'en_terreno' | 'cerrado';
export type LoteItemEstado = 'pendiente' | 'retirado' | 'firmado' | 'devuelto_sin_firma' | 'no_entregado';

export interface Portador { id: number; nombre: string; email: string | null }

/** Fila de GET /documentos-lotes/disponibles (documento impreso sin lote). */
export interface DocumentoDisponible {
    id: number;
    nombre_archivo: string;
    fecha_generacion: string | null;
    fecha_descarga: string | null;
    tipo_nombre: string | null;
    tipo_codigo: string | null;
    trabajador_id: number | null;
    trabajador_nombre: string | null;
    rut: string | null;
    trabajador_activo: boolean | null;
    obra_id: number | null;
    obra_nombre: string | null;
}

export interface LoteResumen {
    id: number;
    portador_id: number | null;
    portador_nombre: string | null;
    creado_por: number | null;
    creado_por_nombre: string | null;
    estado: LoteEstado;
    observacion: string | null;
    creado_en: string;
    retirado_en: string | null;
    cerrado_en: string | null;
    total: number;
    pendientes: number;
    en_terreno: number;
    firmados: number;
    sin_firma: number;
    no_entregados: number;
}

export interface LoteItem {
    id: number;
    documento_id: number;
    estado: LoteItemEstado;
    retirado_en: string | null;
    resuelto_en: string | null;
    observacion: string | null;
    nombre_archivo: string;
    documento_estado: string;
    tipo_nombre: string | null;
    tipo_codigo: string | null;
    trabajador_id: number | null;
    trabajador_nombre: string | null;
    rut: string | null;
    obra_nombre: string | null;
}

export interface LoteDetalle extends LoteResumen { items: LoteItem[] }

export interface PendientesLotes { por_confirmar: number; en_terreno: number; alcance: 'todos' | 'propios' }

export const LOTE_ESTADO_LABEL: Record<LoteEstado, string> = {
    pendiente_retiro: 'Por confirmar',
    en_terreno: 'En terreno',
    cerrado: 'Cerrado',
};

export const ITEM_ESTADO_LABEL: Record<LoteItemEstado, string> = {
    pendiente: 'Por confirmar',
    retirado: 'En terreno',
    firmado: 'Firmado',
    devuelto_sin_firma: 'Devuelto sin firma',
    no_entregado: 'No entregado',
};

/** Clave de localStorage: RRHH casi siempre arma lotes para el mismo portador. */
export const PORTADOR_STORAGE_KEY = 'boveda.documentosFisicos.ultimoPortador';

// ── Agrupación obra → trabajador ────────────────────────────────────────────────

type ConTrabajador = { trabajador_id: number | null; trabajador_nombre: string | null; rut: string | null; obra_nombre: string | null };

export interface GrupoTrabajador<T extends ConTrabajador> {
    key: string;
    trabajador_id: number | null;
    trabajador_nombre: string;
    rut: string | null;
    obra_nombre: string;
    docs: T[];
}

export interface GrupoObra<T extends ConTrabajador> { obra_nombre: string; grupos: GrupoTrabajador<T>[] }

const SIN_OBRA = 'Sin obra';
const cmp = (a: string, b: string) => a.localeCompare(b, 'es', { sensitivity: 'base' });

/** Documentos → trabajadores (ordenados por obra y nombre); dentro de cada trabajador se respeta el orden de entrada. */
export function agruparPorTrabajador<T extends ConTrabajador>(docs: T[]): GrupoTrabajador<T>[] {
    const mapa = new Map<string, GrupoTrabajador<T>>();
    for (const d of docs) {
        const key = d.trabajador_id != null ? `t${d.trabajador_id}` : `s${d.rut ?? d.trabajador_nombre ?? 'x'}`;
        let g = mapa.get(key);
        if (!g) {
            g = { key, trabajador_id: d.trabajador_id, trabajador_nombre: d.trabajador_nombre || 'Trabajador sin nombre', rut: d.rut, obra_nombre: d.obra_nombre || SIN_OBRA, docs: [] };
            mapa.set(key, g);
        }
        g.docs.push(d);
    }
    return [...mapa.values()].sort((a, b) => cmp(a.obra_nombre, b.obra_nombre) || cmp(a.trabajador_nombre, b.trabajador_nombre));
}

/** Trabajadores → obras (para las cabeceras de la lista). */
export function agruparPorObra<T extends ConTrabajador>(grupos: GrupoTrabajador<T>[]): GrupoObra<T>[] {
    const out: GrupoObra<T>[] = [];
    for (const g of grupos) {
        const ultimo = out[out.length - 1];
        if (ultimo && ultimo.obra_nombre === g.obra_nombre) ultimo.grupos.push(g);
        else out.push({ obra_nombre: g.obra_nombre, grupos: [g] });
    }
    return out;
}

/** Filtro de texto (nombre, RUT, tipo, obra) sin tildes ni mayúsculas. */
const norm = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export function filtrarDisponibles(docs: DocumentoDisponible[], q: string, obraId?: number | null): DocumentoDisponible[] {
    const t = norm(q).trim();
    return docs.filter(d =>
        (obraId == null || d.obra_id === obraId)
        && (!t || [d.trabajador_nombre, d.rut, d.tipo_nombre, d.obra_nombre].some(v => norm(v).includes(t)))
    );
}

// ── Selección ───────────────────────────────────────────────────────────────────

/** Marca o desmarca un conjunto de ids sobre la selección actual (sin repetidos, orden estable). */
export function toggleIds(seleccion: readonly number[], ids: readonly number[], marcar: boolean): number[] {
    if (marcar) {
        const set = new Set(seleccion);
        const out = [...seleccion];
        for (const id of ids) if (!set.has(id)) { set.add(id); out.push(id); }
        return out;
    }
    const quitar = new Set(ids);
    return seleccion.filter(id => !quitar.has(id));
}

export function estadoSeleccion(seleccion: readonly number[], ids: readonly number[]): 'todos' | 'ninguno' | 'parcial' {
    if (!ids.length) return 'ninguno';
    const set = new Set(seleccion);
    const n = ids.filter(id => set.has(id)).length;
    return n === 0 ? 'ninguno' : n === ids.length ? 'todos' : 'parcial';
}

// ── Payloads ────────────────────────────────────────────────────────────────────

const idsLimpios = (ids: readonly number[]) => [...new Set(ids.map(Number).filter(n => Number.isInteger(n) && n > 0))];

/** Body de POST /documentos-lotes. Sin claves vacías. */
export function buildCrearLotePayload(f: { portadorId: number | string | null; seleccion: readonly number[]; observacion?: string }) {
    const payload: Record<string, unknown> = { portador_id: Number(f.portadorId), documento_ids: idsLimpios(f.seleccion) };
    const obs = (f.observacion || '').trim();
    if (obs) payload.observacion = obs;
    return payload;
}

/** Validación previa del lote (el backend la repite). Mensaje o null. */
export function validarNuevoLote(f: { portadorId: number | string | null; seleccion: readonly number[] }): string | null {
    const p = Number(f.portadorId);
    if (!Number.isInteger(p) || p <= 0) return 'Elige quién retira los documentos';
    if (!idsLimpios(f.seleccion).length) return 'Marca al menos un documento';
    return null;
}

/** Body de PUT /:id/confirmar-retiro: lo que el portador SÍ recibió (vacío = ninguno). */
export function buildConfirmarRetiroPayload(recibidos: readonly number[]) {
    return { documento_ids: idsLimpios(recibidos) };
}

export type Desenlace = 'firmado' | 'sin_firma' | 'en_terreno';

/**
 * Body de PUT /:id/recepcion desde el mapa documento → desenlace. Los que "siguen en terreno" no viajan.
 * Un documento no puede ir en ambas listas: manda `firmado`.
 */
export function buildRecepcionPayload(desenlaces: Readonly<Record<number, Desenlace>>, observacion?: string) {
    const firmados: number[] = [], sinFirma: number[] = [];
    for (const [id, d] of Object.entries(desenlaces)) {
        const n = Number(id);
        if (d === 'firmado') firmados.push(n);
        else if (d === 'sin_firma') sinFirma.push(n);
    }
    const payload: Record<string, unknown> = { firmados: idsLimpios(firmados), sin_firma: idsLimpios(sinFirma).filter(n => !firmados.includes(n)) };
    const obs = (observacion || '').trim();
    if (obs) payload.observacion = obs;
    return payload;
}

// ── Presentación ────────────────────────────────────────────────────────────────

/** Días completos desde una fecha (Date de BD o ISO); 0 si no hay fecha. */
export function diasDesde(fecha: string | null | undefined, hoy: Date = new Date()): number {
    if (!fecha) return 0;
    const d = new Date(String(fecha).includes('T') || String(fecha).includes(' ') ? String(fecha).replace(' ', 'T') : `${fecha}T00:00:00`);
    if (Number.isNaN(d.getTime())) return 0;
    const ms = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.max(0, Math.round(ms / 86400000));
}

/** "3 en terreno · 2 firmados · 1 sin firma" — solo los conteos distintos de cero. */
export function resumenLote(l: Pick<LoteResumen, 'pendientes' | 'en_terreno' | 'firmados' | 'sin_firma' | 'no_entregados'>): string {
    const partes: string[] = [];
    if (l.pendientes) partes.push(`${l.pendientes} por confirmar`);
    if (l.en_terreno) partes.push(`${l.en_terreno} en terreno`);
    if (l.firmados) partes.push(`${l.firmados} firmado${l.firmados === 1 ? '' : 's'}`);
    if (l.sin_firma) partes.push(`${l.sin_firma} sin firma`);
    if (l.no_entregados) partes.push(`${l.no_entregados} no entregado${l.no_entregados === 1 ? '' : 's'}`);
    return partes.join(' · ') || 'Sin documentos';
}

export interface QuienMira { id: number | null | undefined; puedeRegistrar: boolean; puedePortar: boolean }

/** Qué puede hacer quien mira este lote. Doble llave: confirmar el retiro es SOLO del portador asignado. */
export function accionesLote(lote: Pick<LoteResumen, 'estado' | 'portador_id'>, quien: QuienMira) {
    const esPortador = quien.puedePortar && quien.id != null && lote.portador_id === quien.id;
    return {
        confirmarRetiro: esPortador && lote.estado === 'pendiente_retiro',
        recepcion: quien.puedeRegistrar && lote.estado === 'en_terreno',
        anular: quien.puedeRegistrar && lote.estado === 'pendiente_retiro',
    };
}

/** Tablero de custodia: un carril por estado, en el orden del flujo (el backend ya ordena recientes primero). */
export function agruparLotesPorEstado(lotes: readonly LoteResumen[]): Record<LoteEstado, LoteResumen[]> {
    const out: Record<LoteEstado, LoteResumen[]> = { pendiente_retiro: [], en_terreno: [], cerrado: [] };
    for (const l of lotes) if (l.estado in out) out[l.estado].push(l);
    return out;
}

export const LOTE_ESTADOS: readonly LoteEstado[] = ['pendiente_retiro', 'en_terreno', 'cerrado'];

/** Iniciales de un nombre "Apellido Nombre" o "Nombre Apellido" (máx. 2 letras). */
export function inicialesNombre(nombre: string | null | undefined): string {
    const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
    return partes.slice(0, 2).map(x => x[0]).join('').toUpperCase();
}

/** Línea de tiempo del lote según su etapa: qué pasó y hace cuánto. */
export function lineaTiempoLote(l: Pick<LoteResumen, 'estado' | 'creado_en' | 'retirado_en' | 'cerrado_en' | 'creado_por_nombre'>, hoy: Date = new Date()): string {
    const d = (f: string | null | undefined) => { const n = diasDesde(f, hoy); return n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`; };
    if (l.estado === 'pendiente_retiro') return `Armado ${d(l.creado_en)}${l.creado_por_nombre ? ` por ${l.creado_por_nombre}` : ''}`;
    if (l.estado === 'en_terreno') return `Retirado ${d(l.retirado_en ?? l.creado_en)}`;
    return `Cerrado ${d(l.cerrado_en ?? l.retirado_en ?? l.creado_en)}`;
}
/** Texto para la Bandeja / badge según el alcance del contador. */
export function filasBandejaLotes(p: PendientesLotes | null | undefined): { severity: 'warning' | 'info'; title: string; description: string }[] {
    if (!p) return [];
    const out: { severity: 'warning' | 'info'; title: string; description: string }[] = [];
    if (p.por_confirmar > 0) {
        out.push(p.alcance === 'propios'
            ? { severity: 'warning', title: `${p.por_confirmar} lote${p.por_confirmar === 1 ? '' : 's'} de documentos por confirmar`, description: 'RRHH te entregó documentos impresos: confirma que los recibiste' }
            : { severity: 'info', title: `${p.por_confirmar} lote${p.por_confirmar === 1 ? '' : 's'} esperando confirmación del portador`, description: 'Documentos impresos declarados, aún sin confirmar el retiro' });
    }
    if (p.en_terreno > 0) {
        out.push({ severity: 'info', title: `${p.en_terreno} lote${p.en_terreno === 1 ? '' : 's'} de documentos en terreno`, description: p.alcance === 'propios' ? 'Documentos que llevas a firmar; RRHH registra la devolución' : 'Documentos en obra pendientes de volver firmados' });
    }
    return out;
}

/**
 * Documentos laborales generados por Bóveda (plan Gestiones B2) — lógica PURA compartida por
 * EmitirKitModal, EmitirAmonestacionModal, DocumentosGeneradosList y WorkerQuickView. Sin DOM.
 * Espejo de backend/src/plantillas/documentos (códigos) y schemas/documentosLaborales.schema.js.
 */
import type { Documento } from '../../types/entities';

export const KIT_INGRESO = ['CONTRATO', 'ODI_D40', 'DAS', 'PTS_ALTURA', 'EPP_RECEPCION', 'RI_RECEPCION'] as const;
export type CodigoKit = typeof KIT_INGRESO[number];
export type CodigoEmitible = CodigoKit | 'AMONESTACION';

/** Etiquetas de respaldo (el backend manda las suyas en GET /documentos-laborales/catalogo). */
export const TITULOS: Record<CodigoEmitible | 'SOLICITUD_INGRESO' | 'FINIQUITO', string> = {
    CONTRATO: 'Contrato de Trabajo',
    ODI_D40: 'ODI – Obligación de Informar (DS 44)',
    DAS: 'Declaración Derecho a Saber',
    PTS_ALTURA: 'Procedimiento de Trabajo Seguro en Altura',
    EPP_RECEPCION: 'Recepción de Implementos de Seguridad',
    RI_RECEPCION: 'Recepción Reglamento Interno',
    AMONESTACION: 'Carta de Amonestación',
    SOLICITUD_INGRESO: 'Ficha de Solicitud de Ingreso',
    FINIQUITO: 'Finiquito',
};

export const DIAS_PLAZO_DEFAULT = 15;
export const DURACION_CHARLA_DEFAULT = '30 minutos';

/** Motivos predefinidos de la carta (espejo de amonestacion.plantilla.js; el catálogo del backend manda). */
export const AMONESTACION_MOTIVOS = [
    'Atraso reiterado en el ingreso',
    'Inasistencia injustificada',
    'Abandono de funciones durante la jornada',
    'No uso de elementos de protección personal (EPP)',
    'Incumplimiento de normas de seguridad',
    'Incumplimiento de instrucciones de la jefatura',
    'Uso indebido de equipos o herramientas',
    'Conducta inapropiada en el lugar de trabajo',
];
export const AMONESTACION_OTRO = 'Otro (describir en el detalle)';

export interface CatalogoDocumentos {
    kit: { codigo: string; titulo: string; version: string }[];
    emitibles: { codigo: string; titulo: string; version: string }[];
    epp_default: string[];
    amonestacion_motivos: string[];
}

export interface DocumentoEmitido {
    documento_id: number;
    nombre_archivo: string;
    tipo_codigo: string;
    tipo_nombre?: string;
    estado: string;
}

/** Lo mínimo que necesitan estos helpers; `activo` puede faltar en respuestas parciales (quick-view). */
type DocLike = Partial<Pick<Documento, 'activo' | 'origen' | 'tipo_obligatorio' | 'tipo_documento_id'>>;

/** Solo los subidos a mano (los generados van en su propia lista). */
export function docsSubidos<T extends DocLike>(docs: T[]): T[] {
    return docs.filter(d => d.origen !== 'generado');
}

/**
 * Cuántos TIPOS obligatorios distintos cubre el trabajador. Antes se contaban todos los documentos
 * activos: un kit de 6 generados (obligatorio=0) inflaba la completitud. Si la respuesta es legacy
 * (sin `tipo_obligatorio`), cae al conteo antiguo.
 */
export function contarObligatorios(docs: DocLike[]): number {
    const activos = docs.filter(d => d.activo !== false);
    const conFlag = activos.some(d => d.tipo_obligatorio !== undefined && d.tipo_obligatorio !== null);
    if (!conFlag) return activos.length;
    const tipos = new Set<number | string>();
    for (const d of activos) {
        if (d.tipo_obligatorio) tipos.add(d.tipo_documento_id ?? `x${tipos.size}`);
    }
    return tipos.size;
}

/** Textarea "un implemento por línea" → lista limpia (vacío → [] = el backend usa el default). */
export function eppItemsDesdeTexto(texto: string): string[] {
    return String(texto || '').split(/\r?\n|,/).map(s => s.trim()).filter(Boolean);
}

export interface KitForm {
    documentos: string[];
    fecha_documento?: string;
    dias_plazo?: number | string;
    epp_texto?: string;
    duracion_charla?: string;
}

/** Body de POST /documentos-laborales/kit-ingreso/:tid (en el orden del kit; sin vacíos). */
export function buildKitPayload(f: KitForm) {
    const documentos = KIT_INGRESO.filter(c => f.documentos.includes(c));
    const dias = Number(f.dias_plazo);
    const epp = eppItemsDesdeTexto(f.epp_texto || '');
    const payload: Record<string, unknown> = { documentos };
    if (f.fecha_documento) payload.fecha_documento = f.fecha_documento;
    if (documentos.includes('CONTRATO') && Number.isInteger(dias) && dias > 0) payload.dias_plazo = dias;
    if (documentos.includes('EPP_RECEPCION') && epp.length) payload.epp_items = epp;
    if (documentos.includes('ODI_D40') && (f.duracion_charla || '').trim()) payload.duracion_charla = f.duracion_charla!.trim();
    return payload;
}

export interface AmonestacionForm {
    fechaCarta: string;
    fechaInfraccion?: string;
    motivo?: string;
    detalle?: string;
}

/** Body de POST /documentos-laborales/emitir/:tid para la carta. "Otro" no se imprime como motivo. */
export function buildAmonestacionPayload(f: AmonestacionForm) {
    const motivo = (f.motivo || '').trim();
    const detalle = (f.detalle || '').trim();
    const payload: Record<string, unknown> = { codigo: 'AMONESTACION', fecha_carta: f.fechaCarta };
    if (f.fechaInfraccion) payload.fecha_infraccion = f.fechaInfraccion;
    if (motivo && motivo !== AMONESTACION_OTRO) payload.motivo = motivo;
    if (detalle) payload.detalle = detalle;
    return payload;
}

/** Validación previa de la carta (el backend la repite). Mensaje o null. */
export function validarAmonestacion(f: AmonestacionForm): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaCarta || '')) return 'Indica la fecha de la carta';
    if (f.fechaInfraccion && f.fechaInfraccion > f.fechaCarta) return 'La infracción no puede ser posterior a la carta';
    if ((f.motivo || '') === AMONESTACION_OTRO && !(f.detalle || '').trim()) return 'Describe la falta en el detalle';
    return null;
}

/** Lista `faltan` de un 409 DATOS_FALTANTES (o null si el error es otro). */
export function faltanDesdeError(err: unknown): string[] | null {
    const e = err as { response?: { data?: { code?: string; faltan?: unknown } } };
    const d = e?.response?.data;
    if (d?.code === 'DATOS_FALTANTES' && Array.isArray(d.faltan)) return d.faltan.map(String);
    return null;
}

/** Lo mínimo de un trabajador que necesitan los modales de emisión. */
export interface WorkerBasico {
    id: number;
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    rut?: string | null;
    cargo_nombre?: string | null;
    obra_nombre?: string | null;
    empresa_nombre?: string | null;
    activo?: boolean;
    // Datos personales que la primera cláusula del contrato imprime (mig 108). El contrato los EXIGE
    // desde B2b; el resto del kit no los usa.
    nacionalidad?: string | null;
    estado_civil?: string | null;
    fecha_nacimiento?: string | null;
    direccion?: string | null;
    comuna?: string | null;
}

/** Claves de la ficha que el contrato necesita, en el orden en que salen impresas. */
export const CAMPOS_CONTRATO = ['nacionalidad', 'estado_civil', 'fecha_nacimiento', 'direccion', 'comuna'] as const;
export type CampoContrato = typeof CAMPOS_CONTRATO[number];

export const LABEL_CAMPO_CONTRATO: Record<CampoContrato, string> = {
    nacionalidad: 'Nacionalidad',
    estado_civil: 'Estado civil',
    fecha_nacimiento: 'Fecha de nacimiento',
    direccion: 'Dirección',
    comuna: 'Comuna',
};

const vacio = (v: unknown) => v == null || String(v).trim() === '';

/**
 * Qué datos personales le faltan al trabajador para poder emitir su contrato. Espejo de
 * `CAMPOS_PERSONALES` en backend/src/plantillas/documentos/contrato.plantilla.js — el backend
 * responde 409 con la misma lista, así que esto solo evita el viaje de ida y vuelta.
 */
export function faltanDatosContrato(w: Partial<WorkerBasico> | null | undefined): CampoContrato[] {
    if (!w) return [];
    return CAMPOS_CONTRATO.filter(k => vacio(w[k]));
}

/**
 * Body para PUT /trabajadores/:id con SOLO los campos que el usuario completó.
 * ⚠️ Nunca incluir claves vacías: el CRUD genérico descarta `undefined` pero CONSERVA `null`, así
 * que mandar nulls borraría datos ya cargados de la ficha.
 */
export function buildDatosPersonalesPayload(valores: Partial<Record<CampoContrato, string>>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const k of CAMPOS_CONTRATO) {
        const v = valores[k];
        if (v != null && String(v).trim() !== '') out[k] = String(v).trim();
    }
    return out;
}

/** Largos reales de las columnas: sin esto un texto largo llega a MySQL y vuelve como error 500. */
export const MAXLEN_CAMPO_CONTRATO: Record<CampoContrato, number> = {
    nacionalidad: 60,
    estado_civil: 30,
    fecha_nacimiento: 10,
    direccion: 255,
    comuna: 100,
};

/** Errores por campo antes de enviar. Objeto vacío = se puede emitir. */
export function validarDatosContrato(
    faltan: CampoContrato[],
    valores: Partial<Record<CampoContrato, string>>,
    hoy: string = hoyYmd()
): Partial<Record<CampoContrato, string>> {
    const errs: Partial<Record<CampoContrato, string>> = {};
    for (const c of faltan) {
        const v = (valores[c] ?? '').trim();
        if (!v) { errs[c] = 'Completa este dato'; continue; }
        if (c === 'fecha_nacimiento' && v > hoy) errs[c] = 'No puede ser una fecha futura';
        else if (v.length > MAXLEN_CAMPO_CONTRATO[c]) errs[c] = `Máximo ${MAXLEN_CAMPO_CONTRATO[c]} caracteres`;
    }
    return errs;
}

/**
 * Claves de columna que el backend reporta como faltantes en un 409 (`campos_trabajador`). El
 * servidor es la autoridad: si la ficha cambió desde que se abrió el modal, esto reabre el
 * formulario correcto en vez de dejar un error sin salida.
 */
export function camposFaltantesDesdeError(err: unknown): CampoContrato[] | null {
    const e = err as { response?: { data?: { campos_trabajador?: unknown } } };
    const campos = e?.response?.data?.campos_trabajador;
    if (!Array.isArray(campos) || !campos.length) return null;
    const validos = campos.filter((c): c is CampoContrato => (CAMPOS_CONTRATO as readonly string[]).includes(String(c)));
    return validos.length ? validos : null;
}

/** 'Pérez Soto Juan' — el orden con que RRHH lee los nombres. */
export function nombreDe(w: Pick<WorkerBasico, 'nombres' | 'apellido_paterno' | 'apellido_materno'>): string {
    return `${w.apellido_paterno} ${w.apellido_materno || ''} ${w.nombres}`.replace(/\s+/g, ' ').trim();
}

/** Hoy en YYYY-MM-DD (hora local). */
export function hoyYmd(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

import type { CostoCategoria, CostoTipoDocumento, CostoEstadoPago } from '../../types/entities';

/**
 * Textos y reglas chicas de Costos de obra (mig 122, docs/reglas/costos.md). Las
 * cuentas viven en el backend (costos.service.js); acá solo se presentan. Montos y
 * fechas con `utils/format` (fmtMoney, fmtNumber, fmtFecha), como el resto de Bóveda.
 */

export const ETIQUETA_COSTOS = 'Presupuestos';

/**
 * Categorías de gasto en los grupos que usa LOLS (mig 124: nota de Rodrigo + desglose de gastos de
 * obra, 19-10). Mismo orden y claves que el backend (costos.service.js · CATEGORIAS). Sin partida:
 * las de CATEGORIAS_GG se comparan contra los gastos generales presupuestados; las de
 * CATEGORIAS_MANO_OBRA van aparte (la mano de obra va dentro de los precios unitarios del itemizado).
 */
export interface GrupoCategoria {
    clave: string;
    nombre: string;
    /** Cada cuánto se paga: los permisos van por proyecto, no mes a mes. */
    periodicidad: 'mensual' | 'por proyecto';
    categorias: CostoCategoria[];
}

export const GRUPOS_CATEGORIA: GrupoCategoria[] = [
    { clave: 'mano_obra', nombre: 'Mano de obra y administración', periodicidad: 'mensual', categorias: ['sueldos_administracion', 'sueldos', 'anticipos', 'subcontrato'] },
    { clave: 'faenas', nombre: 'Gastos generales de obra', periodicidad: 'mensual', categorias: ['arriendo_equipos', 'servicios_basicos', 'logistica_seguridad', 'combustible', 'herramientas', 'gastos_generales'] },
    { clave: 'materiales', nombre: 'Materiales', periodicidad: 'mensual', categorias: ['hormigon', 'acero', 'materiales'] },
    { clave: 'permisos', nombre: 'Permisos y legal', periodicidad: 'por proyecto', categorias: ['permisos', 'mitigaciones'] },
    { clave: 'otro', nombre: 'Otro', periodicidad: 'mensual', categorias: ['otro'] },
];

export const CATEGORIAS: Record<CostoCategoria, string> = {
    sueldos_administracion: 'Sueldos administración de obra',
    sueldos: 'Sueldos trabajadores',
    anticipos: 'Anticipos de sueldo',
    subcontrato: 'Subcontratistas',
    arriendo_equipos: 'Arriendo de equipos y maquinaria',
    servicios_basicos: 'Servicios básicos de faena',
    logistica_seguridad: 'Escombros y seguridad',
    combustible: 'Combustible (Copec)',
    gastos_generales: 'Otros gastos generales',
    hormigon: 'Hormigón',
    acero: 'Acero, fierro y perfiles',
    materiales: 'Otros materiales',
    herramientas: 'Herramientas',
    permisos: 'Permisos y derechos municipales',
    mitigaciones: 'Mitigaciones (IMIV, ambientales)',
    otro: 'Otro',
};

/** Ejemplos de lo que va en cada categoría (se muestran al elegirla). */
export const AYUDA_CATEGORIA: Record<CostoCategoria, string> = {
    sueldos_administracion: 'Administrador, jefe de obra, supervisores, prevencionista, aseo y guardias.',
    sueldos: 'Planilla mensual de maestros, jornales y ayudantes (un total por obra; en Observación, si incluye bonos o horas extra).',
    anticipos: 'Anticipo de quincena a los trabajadores.',
    subcontrato: 'Pagos a subcontratistas: fierreros, hormigoneros, montajistas de estructuras. Cada pago es un gasto (uno o varios).',
    arriendo_equipos: 'Grúa, excavadora, andamios, alzaprimas, moldajes, generador. Ej.: el arriendo mensual a Dedalius, un monto por obra.',
    servicios_basicos: 'Agua, luz provisoria, internet de obra, baños químicos.',
    logistica_seguridad: 'Retiro de escombros (tolvas), guardias 24/7.',
    combustible: 'Bencina y petróleo para vehículos y maquinaria.',
    gastos_generales: 'Lo de faena que no calza arriba: oficina, insumos de terreno, seguros.',
    hormigon: 'Hormigón premezclado.',
    acero: 'Acero de refuerzo, fierro, perfiles metálicos.',
    materiales: 'Áridos, ladrillos, madera, cerámica, pintura y demás materiales.',
    herramientas: 'Herramientas y equipos menores que se compran para la obra; se van sumando mes a mes.',
    permisos: 'Permiso de edificación, ocupación de vía pública, patentes. Los derechos municipales no llevan IVA: usa el documento «Otro».',
    mitigaciones: 'Estudios y obras de impacto vial (IMIV) o ambientales.',
    otro: 'Lo que no calza en ninguna categoría.',
};

/** Sin partida, se comparan contra los gastos generales presupuestados (igual que el backend). */
export const CATEGORIAS_GG = new Set<CostoCategoria>(['sueldos_administracion', 'arriendo_equipos', 'servicios_basicos', 'logistica_seguridad', 'combustible', 'herramientas', 'gastos_generales', 'permisos', 'mitigaciones']);

/** Proveedores que se sugieren siempre al escribir (además de los ya usados en la obra). */
export const PROVEEDORES_FRECUENTES = ['Dedalius', 'Copec'];
/** Sin partida, van aparte como «mano de obra» (no son «sin asignar»). */
export const CATEGORIAS_MANO_OBRA = new Set<CostoCategoria>(['sueldos', 'anticipos', 'subcontrato']);
/** Se pagan con planilla (sin IVA, sin proveedor). */
export const CATEGORIAS_SUELDO = new Set<CostoCategoria>(['sueldos_administracion', 'sueldos', 'anticipos']);

/** Nombres de categorías antiguas (mig 122) que pueden aparecer en historiales y cierres viejos. */
const CATEGORIAS_ANTIGUAS: Record<string, string> = { mano_obra: 'Mano de obra', maquinaria: 'Maquinaria y equipos', sin_categoria: 'Sin categoría' };
export const nombreCategoria = (k: string | null | undefined): string =>
    !k ? 'Sin categoría' : CATEGORIAS[k as CostoCategoria] || CATEGORIAS_ANTIGUAS[k] || k;
export const grupoDe = (k: string | null | undefined): GrupoCategoria | null =>
    GRUPOS_CATEGORIA.find(g => g.categorias.includes(k as CostoCategoria)) || null;

export const TIPOS_DOC: Record<CostoTipoDocumento, string> = {
    factura: 'Factura',
    boleta: 'Boleta',
    guia: 'Guía de despacho',
    planilla: 'Planilla de sueldos',
    otro: 'Otro',
};

/** Cómo se nombra un gasto en las listas: el proveedor, o la planilla y su categoría. */
export const nombreGasto = (g: { proveedor: string | null; tipo_documento: CostoTipoDocumento; categoria: CostoCategoria | null }): string =>
    g.proveedor || (g.tipo_documento === 'planilla' ? `Planilla · ${g.categoria ? CATEGORIAS[g.categoria] : 'sueldos'}` : 'Sin proveedor');

export const ESTADOS_PAGO: Record<CostoEstadoPago, string> = {
    por_pagar: 'Por pagar',
    pagada: 'Pagada',
};

export const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-sm text-brand-dark resize-none focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70';
export const ETIQUETA = 'block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2';

/** Porcentaje en formato chileno: 15 → "15 %", 2.5 → "2,5 %". */
export const pct = (v: number | string | null | undefined): string => {
    const n = Number(v);
    return Number.isFinite(n) ? `${n.toLocaleString('es-CL', { maximumFractionDigits: 2 })} %` : '—';
};

const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** "2026-10" → "octubre 2026". */
export const nombreMes = (mes: string) => `${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

/** Fecha local de hoy, AAAA-MM-DD (para los <input type="date">). */
export const hoyISO = (): string => {
    const d = new Date();
    const dos = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
};

/** Neto de un gasto para comparar con el presupuesto (mismo criterio que el backend). */
export function netoGasto(g: { monto_neto: number | string | null; monto_total: number | string; tipo_documento: CostoTipoDocumento }): { neto: number; estimado: boolean } {
    if (g.monto_neto !== null && g.monto_neto !== undefined && g.monto_neto !== '') return { neto: Number(g.monto_neto), estimado: false };
    const total = Number(g.monto_total) || 0;
    if (g.tipo_documento === 'factura') return { neto: Math.round(total / 1.19), estimado: true };
    return { neto: total, estimado: false };
}

/** Un gasto queda "por completar" si le falta el proveedor (salvo una planilla) o a qué se imputa. */
export const porCompletar = (g: { proveedor: string | null; partida_id: number | null; categoria: CostoCategoria | null; tipo_documento?: CostoTipoDocumento }) =>
    (!g.proveedor && g.tipo_documento !== 'planilla') || (!g.partida_id && !g.categoria);

export type Semaforo = 'ok' | 'cerca' | 'pasado' | 'sin';

/** Gastado contra presupuestado: bajo 85 % ok, 85–100 % cerca, sobre 100 % pasado. */
export function semaforo(presupuestado: number, gastado: number): Semaforo {
    if (!presupuestado) return gastado > 0 ? 'pasado' : 'sin';
    const r = gastado / presupuestado;
    if (r > 1) return 'pasado';
    if (r >= 0.85) return 'cerca';
    return 'ok';
}

/** Color de la barra según el semáforo (tokens: el color ES el dato). */
export const COLOR_BARRA: Record<Semaforo, string> = {
    ok: 'bg-brand-primary',
    cerca: 'bg-warning',
    pasado: 'bg-destructive',
    sin: 'bg-muted-foreground/30',
};

/** Mensaje de error de la API o uno por defecto. */
export const mensajeError = (e: unknown, porDefecto: string): string => {
    const r = (e as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
    return r?.error || r?.message || porDefecto;
};

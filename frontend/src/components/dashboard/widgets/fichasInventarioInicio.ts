import type { ResumenInventarioApi } from './resumenInventarioInicio';
import type { TonoTarjeta } from './tarjetaActiva';
import { nombreCorto, plural } from './fichasInicio';

/**
 * Detalle «Inventario · fichas por solicitud» del Inicio (2026-10-22, Marcos eligió la opción A del lienzo).
 * Lógica PURA, sin DOM, para poder testearla; el dibujo vive en `DetalleInventario.tsx`. Los datos llegan de
 * GET /api/transferencias/inicio/fichas: `conteos` es lo mismo que la tarjeta (`resumenInicio`, un grupo null
 * si el perfil no puede actuar sobre él) y `fichas` son las solicitudes de esos grupos, una por solicitud.
 */

export type EtapaFicha = 'por_aprobar' | 'por_despachar' | 'por_recibir' | 'discrepancias';
export type AccionFicha = 'aprobar' | 'recibir' | 'resolver';
export type BloqueoFicha = 'sod_solicitante' | 'sod_aprobador' | 'sod_transportista' | 'otra_bodega' | 'sin_permiso';

export interface ItemFichaApi {
    id: number;
    nombre: string;
    unidad: string | null;
    /** Solicitada (en los ítems custom aprobados, la aprobada si existe). */
    cantidad: number;
    /** Solo si ya hubo recepción (p. ej. recepción parcial); si no, null. */
    recibida: number | null;
}

export interface DiferenciaFichaApi {
    id: number;
    nombre: string;
    unidad: string | null;
    enviada: number;
    recibida: number;
    /** enviada − recibida: positiva = faltante, negativa = sobrante. */
    diferencia: number;
}

export interface FichaInventarioApi {
    id: number;
    codigo: string;
    estado: string;
    tipo_flujo: string | null;
    etapa: EtapaFicha;
    /** Obra o bodega de origen; null si aún no hay origen (lo define quien aprueba). */
    origen_nombre: string | null;
    destino_nombre: string | null;
    solicitante_id: number | null;
    solicitante_nombre: string | null;
    /** Días desde que entró a la etapa (>= 0). */
    dias: number;
    /** Solo por aprobar: pasó su plazo (10 días o la prórroga), misma regla que el Resumen Ejecutivo. */
    estancada: boolean;
    /** Lo que ESTE usuario puede hacer ahora; null = solo mirar (el motivo va en `bloqueo`). */
    accion: AccionFicha | null;
    bloqueo: BloqueoFicha | null;
    items: ItemFichaApi[];
    /** Solo en la etapa diferencias: las pendientes con diferencia distinta de 0. */
    diferencias: DiferenciaFichaApi[];
    /** Suma de los faltantes. */
    faltan: number;
    /** Suma de los sobrantes (en positivo). */
    sobran: number;
}

export interface FichasInventarioApi {
    conteos: ResumenInventarioApi;
    /** Máximo de fichas por etapa que mandó el servidor. */
    limite: number;
    fichas: FichaInventarioApi[];
}

export type FiltroFicha = 'todas' | EtapaFicha;

/**
 * Texto y tono de cada etapa. Los textos son los MISMOS de las filas de la tarjeta de Mauricio
 * (`FILAS` de resumenInventarioInicio.ts; el test lo vigila) para que la tarjeta y el detalle digan lo mismo.
 */
export const ETAPAS_FICHA: Record<EtapaFicha, { texto: string; tono: TonoTarjeta }> = {
    por_aprobar: { texto: 'Por aprobar', tono: 'ambar' },
    por_despachar: { texto: 'Por despachar', tono: 'ambar' },
    por_recibir: { texto: 'En tránsito, por recibir', tono: 'azul' },
    discrepancias: { texto: 'Diferencias por resolver', tono: 'rojo' },
};

/** Orden del flujo (el del lienzo): filtro y camino van en este orden. */
export const ORDEN_ETAPAS: EtapaFicha[] = ['por_aprobar', 'por_despachar', 'por_recibir', 'discrepancias'];

/** Filtro con que se abre la pestaña Solicitudes de Inventario (no hay filtro de tránsito: va en «todas»). */
const ESTADO_INVENTARIO: Record<FiltroFicha, string> = {
    todas: 'todas',
    por_aprobar: 'pendiente',
    por_despachar: 'aprobada',
    por_recibir: 'todas',
    discrepancias: 'discrepancias',
};

const NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
/** Cantidad con formato chileno (las cantidades llegan como DECIMAL: 2.5 → «2,5»). */
export const cant = (n: number) => NUMERO.format(n);

/** Antigüedad: hasta 7 días neutro, de 8 a 30 ámbar, más de 30 rojo. */
export const tonoEdad = (dias: number): TonoTarjeta => (dias > 30 ? 'rojo' : dias > 7 ? 'ambar' : 'neutro');

export const tituloFicha = (f: FichaInventarioApi) => f.destino_nombre?.trim() || 'Destino por definir';

export const bajadaFicha = (f: FichaInventarioApi) =>
    (f.origen_nombre?.trim() ? `desde ${f.origen_nombre.trim()} · ${f.codigo}` : f.codigo);

/** Push directo y orden de gerencia nacen en tránsito: nadie los pide ni los aprueba, alguien los envía. */
const nacenEnviadas = (tipo: string | null) => tipo === 'push_directo' || tipo === 'orden_gerencia';

/** Lista corta en castellano: «A y B», «A, B y 3 ítems más». */
function listaCorta(partes: string[], resto: number, uno: string, varios: string): string {
    if (resto > 0) return `${partes.join(', ')} y ${resto} ${plural(resto, uno, varios)} más`;
    if (partes.length <= 1) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Por cada diferencia (hasta 2): «De Taladro llegó 1 de 3.» o, si sobró, «De Nivel llegaron 6 y se enviaron 5.». */
function fraseDiferencias(ds: DiferenciaFichaApi[]): string {
    const partes = ds.slice(0, 2).map(d => {
        const llego = `${plural(d.recibida, 'llegó', 'llegaron')} ${cant(d.recibida)}`;
        return d.diferencia > 0
            ? `De ${d.nombre} ${llego} de ${cant(d.enviada)}.`
            : `De ${d.nombre} ${llego} y se ${plural(d.enviada, 'envió', 'enviaron')} ${cant(d.enviada)}.`;
    });
    if (partes.length === 0) return 'Llegó con diferencias por revisar.';
    const resto = ds.length - partes.length;
    if (resto > 0) partes.push(`Y ${resto} ${plural(resto, 'diferencia', 'diferencias')} más.`);
    return partes.join(' ');
}

/**
 * Frase de la ficha: «Ana pidió Andamio ×4, Carretilla ×7 y 2 ítems más.»; en diferencias, qué llegó de cada
 * ítem. Nunca queda en «.» (sin ítems o sin diferencias dice eso con palabras).
 */
export function fraseFicha(f: FichaInventarioApi): string {
    if (f.etapa === 'discrepancias') return fraseDiferencias(f.diferencias);
    const quien = f.solicitante_nombre?.trim() ? nombreCorto(f.solicitante_nombre) : null;
    const verbo = nacenEnviadas(f.tipo_flujo) ? 'envió' : 'pidió';
    if (f.items.length === 0) return quien ? `Solicitud de ${quien}, sin ítems.` : 'Solicitud sin ítems.';
    const partes = f.items.slice(0, 2).map(i => `${i.nombre} ×${cant(i.cantidad)}`);
    const lista = listaCorta(partes, f.items.length - partes.length, 'ítem', 'ítems');
    const parcial = f.estado === 'recepcion_parcial' ? ' Ya llegó una parte.' : '';
    return `${quien ? `${quien} ${verbo}` : verbo === 'envió' ? 'Envío:' : 'Pedido:'} ${lista}.${parcial}`;
}

const ACCION: Record<AccionFicha, string> = { aprobar: 'Aprobar', recibir: 'Recibir', resolver: 'Resolver' };

/**
 * Enlace verde de la ficha: lo que le toca a quien mira o, si no puede actuar, «Ver solicitud». En diferencias,
 * quien solo las mira (permiso «Ver diferencias», mig 131: sin acción ni bloqueo) lee «Ver diferencia».
 */
export const textoAccion = (f: FichaInventarioApi) =>
    (f.accion ? ACCION[f.accion] : f.etapa === 'discrepancias' ? 'Ver diferencia' : 'Ver solicitud');

/** Por qué no puede actuar (píldora neutra junto a «Ver solicitud»): la segregación de funciones o la bodega. */
const BLOQUEO: Record<BloqueoFicha, string> = {
    sod_solicitante: 'Pedida por ti',
    sod_aprobador: 'Aprobada por ti',
    sod_transportista: 'Despachada por ti',
    otra_bodega: 'Va a otra bodega',
    sin_permiso: 'Sin permiso para recibir',
};

export interface PildoraFicha { texto: string; tono: TonoTarjeta }

/** «UN», «UND», «unidades»… (o sin unidad) se escriben «u.»; lo demás tal como está guardado («SACO», «M3»). */
const unidadCorta = (unidad: string | null | undefined) => {
    const u = unidad?.trim() ?? '';
    return !u || /^(u|un|und|unid|unidad|unidades)\.?$/i.test(u) ? 'u.' : u;
};

/**
 * «Faltan 2 u.» / «Falta 1 SACO» si todas las diferencias de ese signo son de la misma unidad; si se mezclan
 * (sacos con m3), sumarlas no significa nada: «2 ítems con faltante» (el detalle por ítem está en la lista).
 */
function textoDiferencia(f: FichaInventarioApi, faltante: boolean): string | null {
    const total = faltante ? f.faltan : f.sobran;
    if (!(total > 0)) return null;
    const ds = f.diferencias.filter(d => (faltante ? d.diferencia > 0 : d.diferencia < 0));
    const unidades = new Set(ds.map(d => unidadCorta(d.unidad)));
    if (unidades.size > 1) return `${ds.length} ${plural(ds.length, 'ítem', 'ítems')} con ${faltante ? 'faltante' : 'sobrante'}`;
    const [uno, varios] = faltante ? ['Falta', 'Faltan'] : ['Sobra', 'Sobran'];
    return `${plural(total, uno, varios)} ${cant(total)} ${[...unidades][0] ?? 'u.'}`;
}

/** Píldoras: la etapa con su tono, «Estancada», faltantes (rojo), sobrantes (ámbar) y el bloqueo (neutro). */
export function pildorasFicha(f: FichaInventarioApi): PildoraFicha[] {
    const p: PildoraFicha[] = [{ ...ETAPAS_FICHA[f.etapa] }];
    if (f.estancada) p.push({ texto: 'Estancada', tono: 'rojo' });
    const falta = textoDiferencia(f, true);
    if (falta) p.push({ texto: falta, tono: 'rojo' });
    const sobra = textoDiferencia(f, false);
    if (sobra) p.push({ texto: sobra, tono: 'ambar' });
    if (!f.accion && f.bloqueo) p.push({ texto: BLOQUEO[f.bloqueo], tono: 'neutro' });
    return p;
}

/** «Ver 3 ítems» / «Ocultar ítems» (en diferencias, las diferencias); null si no hay nada que desplegar. */
export function textoDesplegar(f: FichaInventarioApi, abierta: boolean): string | null {
    const [n, uno, varios] = f.etapa === 'discrepancias'
        ? [f.diferencias.length, 'diferencia', 'diferencias']
        : [f.items.length, 'ítem', 'ítems'];
    if (n === 0) return null;
    return abierta ? `Ocultar ${varios}` : `Ver ${n} ${plural(n, uno, varios)}`;
}

const conUnidad = (texto: string, unidad: string | null) => (unidad?.trim() ? `${texto} ${unidad.trim()}` : texto);

/** Cantidad de un ítem en la lista desplegada: «×4», «4 UN» o, si ya hubo recepción, «2 de 4 UN». */
export const cantidadItem = (i: ItemFichaApi) => (i.recibida != null
    ? conUnidad(`${cant(i.recibida)} de ${cant(i.cantidad)}`, i.unidad)
    : i.unidad?.trim() ? conUnidad(cant(i.cantidad), i.unidad) : `×${cant(i.cantidad)}`);

/** Diferencia en la lista desplegada: «llegaron 1 de 3 UN». */
export const cantidadDiferencia = (d: DiferenciaFichaApi) => conUnidad(`${cant(d.recibida)} de ${cant(d.enviada)}`, d.unidad);

/** Inventario con la solicitud abierta (Inventario.tsx lee `estado` e `id` al entrar). */
export const rutaFicha = (f: FichaInventarioApi) =>
    `/inventario?tab=transferencias&estado=${ESTADO_INVENTARIO[f.etapa]}&id=${f.id}`;

/** La lista de Inventario que corresponde al filtro (para «Ver todas en Inventario»). */
export const rutaLista = (filtro: FiltroFicha) => `/inventario?tab=transferencias&estado=${ESTADO_INVENTARIO[filtro]}`;

export interface OpcionFiltro { key: FiltroFicha; texto: string; n: number }

/**
 * Pestañas del filtro: «Todas» + solo los grupos que el perfil puede ver (los que no vienen en null), con el
 * total de la tarjeta (que puede ser mayor que las fichas cargadas: el servidor manda un máximo por etapa).
 */
export function opcionesFiltro(conteos: ResumenInventarioApi | null): OpcionFiltro[] {
    const grupos: OpcionFiltro[] = ORDEN_ETAPAS
        .filter(e => conteos?.[e] != null)
        .map(e => ({ key: e, texto: ETAPAS_FICHA[e].texto, n: conteos?.[e]?.total ?? 0 }));
    return [{ key: 'todas', texto: 'Todas', n: grupos.reduce((acc, g) => acc + g.n, 0) }, ...grupos];
}

/** Las fichas del filtro, primero las que llevan más días esperando (a igualdad, la más antigua por id). */
export function filtrarYOrdenar(fichas: FichaInventarioApi[], filtro: FiltroFicha): FichaInventarioApi[] {
    return fichas
        .filter(f => filtro === 'todas' || f.etapa === filtro)
        .sort((a, b) => b.dias - a.dias || a.id - b.id);
}

export type EstadoPaso = 'hecho' | 'en_curso' | 'falta' | 'con_diferencias';

export const PASOS_CAMINO = [
    { texto: 'Pedida', letra: 'P' },
    { texto: 'Aprobada', letra: 'A' },
    { texto: 'Despachada', letra: 'D' },
    { texto: 'Recibida', letra: 'R' },
] as const;

/** Paso en curso de cada etapa (en diferencias los cuatro ya pasaron). */
const PASO_ACTUAL: Record<EtapaFicha, number> = { por_aprobar: 1, por_despachar: 2, por_recibir: 3, discrepancias: 4 };

/**
 * Camino P·A·D·R de la solicitud: lo hecho, el paso en curso y lo que falta. En diferencias el último (R) queda
 * «con diferencias». Push directo y orden de gerencia no se piden ni se aprueban: P y A cuentan hechos.
 */
export function pasosCamino(etapa: EtapaFicha, tipoFlujo: string | null): EstadoPaso[] {
    const actual = PASO_ACTUAL[etapa];
    return PASOS_CAMINO.map((_, i): EstadoPaso => {
        if (etapa === 'discrepancias' && i === 3) return 'con_diferencias';
        if (i < actual || (nacenEnviadas(tipoFlujo) && i < 2)) return 'hecho';
        return i === actual ? 'en_curso' : 'falta';
    });
}

const LEE_PASO: Record<EstadoPaso, string> = { hecho: 'hecho', en_curso: 'en curso', falta: 'falta', con_diferencias: 'con diferencias' };

/** Texto del camino para lectores de pantalla. */
export const ariaCamino = (pasos: EstadoPaso[]) =>
    `Camino de la solicitud. ${PASOS_CAMINO.map((p, i) => `${p.texto}: ${LEE_PASO[pasos[i]]}`).join(', ')}.`;

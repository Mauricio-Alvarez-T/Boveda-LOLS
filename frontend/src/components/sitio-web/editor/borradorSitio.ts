import {
    ANIO_MAX, ANIO_MIN, ESTADOS, ESTADO_SITIO, ETIQUETA_ESTADO, SERVICIOS, cuerpoDesdeForm, erroresForm, faltantes, formatoSuperficie, listaServicios,
    numeroDeCampo, obraParaReglas, recorte, soloCambios, type FormObra,
} from '../reglas';
import type { Almacen } from '../borradorObra';
import type { EstadoObra, Faltante, JsonObraSitio, ObraEditor } from '../tipos';
import { ETIQUETA_REGLA, TMP_RE, type Regla } from './protocolo';

/**
 * El borrador del editor visual (PURO, con test): las obras tal como las dejó el servidor (`GET /editor/borrador`) y,
 * encima, una CAPA con lo que se hizo y todavía no se guarda: lo escrito (por obra y campo), las obras nuevas (A2, slug
 * provisorio `~n1` e id negativo) y la estructura (orden y fuera/dentro del sitio). Deshacer/rehacer guarda capas
 * enteras (una ráfaga de teclas del mismo campo = un paso), la lista de diferencias para «Guardar», el cuerpo de
 * `POST /editor/guardar` y el JSON con la forma del sitio que se le manda al puente. Reusa las reglas del formulario de
 * la Lista (`reglas.ts`): un cambio hecho aquí se guarda igual que allá. Las listas del sitio (qué obras muestra cada
 * una y en qué orden) son espejo de `src/data/selecciones.ts` de lols.cl. Sin JSX ni `import.meta` (jest en node).
 */

/** Lo que el editor visual cambia de una obra con el camino de la edición (el estado, desde A2). */
export const CAMPOS_EDITOR = [
    'nombre', 'titular', 'comuna', 'direccion', 'inicio', 'desafio', 'solucion', 'resultado',
    'tipo', 'superficie_m2', 'anio', 'servicios', 'mandante', 'mandante_autoriza', 'estado',
] as const;
export type CampoEditor = typeof CAMPOS_EDITOR[number];
export type CambiosObra = Partial<Pick<FormObra, CampoEditor>>;
/** Lo escrito sin guardar: id de la obra → sus campos cambiados (solo los distintos de lo cargado). */
export type Cambios = Readonly<Record<number, CambiosObra>>;

/** Los textos de una línea o párrafo que también se escriben en el sitio (mismos nombres que el JSON). */
export const CAMPOS_TEXTO = ['nombre', 'titular', 'comuna', 'direccion', 'inicio', 'desafio', 'solucion', 'resultado'] as const;
export type CampoTexto = typeof CAMPOS_TEXTO[number];
export const esCampoTexto = (c: string): c is CampoTexto => (CAMPOS_TEXTO as readonly string[]).includes(c);

export const ETIQUETA_CAMPO: Record<CampoEditor, string> = {
    nombre: 'Nombre', titular: 'Titular', comuna: 'Comuna', direccion: 'Dirección', inicio: 'Inicio', desafio: 'Desafío',
    solucion: 'Solución', resultado: 'Resultado', tipo: 'Tipo de obra', superficie_m2: 'Superficie', anio: 'Año de término',
    servicios: 'Servicios', mandante: 'Mandante', mandante_autoriza: 'Autoriza publicar el mandante', estado: 'Estado',
};

/** Ráfaga: dos cambios del mismo campo con menos de esto entre sí son UN paso de deshacer. */
export const RAFAGA_MS = 1200;
const MAX_PASOS = 200;

/** Estructura sin guardar (A2). */
export interface Estructura {
    /** `json.orden` en la pantalla de las obras que se movieron o cambiaron de estado (id → orden). */
    orden: Readonly<Record<number, number>>;
    /** Fuera del sitio / vuelve al sitio (id → incluir): solo lo distinto de lo cargado. */
    incluir: Readonly<Record<number, boolean>>;
}
export const ESTRUCTURA_VACIA: Estructura = Object.freeze({ orden: Object.freeze({}), incluir: Object.freeze({}) });

/** Todo lo que se hizo sobre lo cargado: lo que deshacer/rehacer guarda y restaura. */
export interface Capa {
    cambios: Cambios;
    /** Obras creadas en el editor y sin guardar (`meta.nueva`, id negativo, slug `~nN`). */
    nuevas: readonly ObraEditor[];
    estructura: Estructura;
}

export interface EstadoBorrador extends Capa {
    obras: readonly ObraEditor[];
    pasado: readonly Capa[];
    futuro: readonly Capa[];
    /** El último cambio (para agrupar la ráfaga): `grupo` = 'id:campo'; null = el próximo abre un paso nuevo. */
    ultimo: { grupo: string | null; t: number } | null;
}

/** Lo que leen las funciones de abajo (las de A1 reciben solo obras y cambios). */
export type Vista = Pick<EstadoBorrador, 'obras' | 'cambios'> & Partial<Pick<EstadoBorrador, 'nuevas' | 'estructura'>>;

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const capaDe = (e: Capa): Capa => ({ cambios: e.cambios, nuevas: e.nuevas, estructura: e.estructura });

const ESTADO_DESDE_SITIO: Record<string, EstadoObra> = Object.fromEntries(ESTADOS.map(e => [ESTADO_SITIO[e], e]));
const estadoBase = (o: ObraEditor): EstadoObra => ESTADO_DESDE_SITIO[o.json.estado] ?? 'en_construccion';

/** Las obras del servidor y, después, las nuevas sin guardar. */
export const todas = (e: Vista): readonly ObraEditor[] => (e.nuevas?.length ? [...e.obras, ...e.nuevas] : e.obras);

export const crearBorrador = (obras: readonly ObraEditor[], cambios: Cambios = {}, resto: Partial<Pick<Capa, 'nuevas' | 'estructura'>> = {}): EstadoBorrador => ({
    obras,
    ...limpiarCapa(obras, { cambios, nuevas: resto.nuevas ?? [], estructura: resto.estructura ?? ESTRUCTURA_VACIA }),
    pasado: [], futuro: [], ultimo: null,
});

/** La obra del servidor como formulario (el mismo de la Lista): lo que hay hoy. Una nueva parte sin dirección web. */
export function formBase(o: ObraEditor): FormObra {
    const j = o.json;
    return {
        nombre: j.nombre ?? '',
        slug: o.meta.nueva ? '' : j.slug,
        obra_id: null,
        estado: estadoBase(o),
        titular: j.titular ?? '',
        tipo: j.tipo ?? '',
        mandante: o.meta.mandante ?? '',
        mandante_autoriza: !!o.meta.mandante_autoriza,
        comuna: j.comuna ?? '',
        direccion: j.direccion ?? '',
        superficie_m2: j.superficieM2 === null || j.superficieM2 === undefined ? '' : String(j.superficieM2),
        anio: j.anio === null || j.anio === undefined ? '' : String(j.anio),
        inicio: j.inicio ?? '',
        servicios: listaServicios(j.servicios),
        desafio: j.desafio ?? '',
        solucion: j.solucion ?? '',
        resultado: j.resultado ?? '',
    };
}

export const obraPorId = (e: Vista, id: number): ObraEditor | undefined => todas(e).find(o => o.meta.id === id);
export const obraPorSlug = (e: Vista, slug: string): ObraEditor | undefined => todas(e).find(o => o.json.slug === slug);

/** El formulario de la obra con lo escrito encima. */
export function formActual(e: Vista, id: number): FormObra | null {
    const o = obraPorId(e, id);
    return o ? { ...formBase(o), ...(e.cambios[id] || {}) } : null;
}

/* ──────────────── lo que vale en la pantalla (A2) ──────────────── */

export const estadoDe = (e: Vista, o: ObraEditor): EstadoObra => e.cambios[o.meta.id]?.estado ?? estadoBase(o);
export const ordenDe = (e: Vista, o: ObraEditor): number => e.estructura?.orden[o.meta.id] ?? o.json.orden;
export const incluirDe = (e: Vista, o: ObraEditor): boolean => e.estructura?.incluir[o.meta.id] ?? o.meta.incluir;

/** Deja solo lo que de verdad difiere de lo cargado (y solo de obras que existen y campos del editor). */
function limpiarCambios(obras: readonly ObraEditor[], cambios: Cambios): Cambios {
    const out: Record<number, CambiosObra> = {};
    for (const [k, c] of Object.entries(cambios)) {
        const o = obras.find(x => x.meta.id === Number(k));
        if (!o || !c) continue;
        const base = formBase(o);
        const limpio: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITOR) {
            const v = (c as Record<string, unknown>)[campo];
            if (v !== undefined && !igual(v, base[campo])) limpio[campo] = v;
        }
        if (Object.keys(limpio).length) out[o.meta.id] = limpio as CambiosObra;
    }
    return out;
}

function limpiarCapa(obras: readonly ObraEditor[], c: Capa): Capa {
    const lista = c.nuevas.length ? [...obras, ...c.nuevas] : obras;
    const orden: Record<number, number> = {};
    for (const [k, v] of Object.entries(c.estructura.orden)) {
        const o = lista.find(x => x.meta.id === Number(k));
        if (o && v !== o.json.orden) orden[o.meta.id] = v;
    }
    const incluir: Record<number, boolean> = {};
    for (const [k, v] of Object.entries(c.estructura.incluir)) {
        const o = lista.find(x => x.meta.id === Number(k));
        if (o && v !== o.meta.incluir) incluir[o.meta.id] = v;
    }
    const vacia = !Object.keys(orden).length && !Object.keys(incluir).length;
    return { cambios: limpiarCambios(lista, c.cambios), nuevas: c.nuevas, estructura: vacia ? ESTRUCTURA_VACIA : { orden, incluir } };
}

/** ¿Hay algo hecho sobre lo cargado (escrito, nuevas o estructura)? */
export const hayAlgo = (c: Capa): boolean =>
    Object.keys(c.cambios).length > 0 || c.nuevas.length > 0 || Object.keys(c.estructura.orden).length > 0 || Object.keys(c.estructura.incluir).length > 0;

/** ¿Cambió la estructura entre dos estados (nuevas, orden, fuera/dentro)? Entonces el puente necesita el borrador entero. */
export const cambioEstructura = (a: Capa, b: Capa): boolean => a.nuevas !== b.nuevas || !igual(a.estructura, b.estructura);

/**
 * Aplica un cambio a una obra. `grupo` (p. ej. 'id:nombre' al escribir) junta en UN paso de deshacer los cambios del
 * mismo grupo que llegan seguidos (menos de RAFAGA_MS); sin grupo, cada cambio es un paso. Si no cambia nada, devuelve
 * el mismo estado.
 */
export function aplicar(e: EstadoBorrador, id: number, parcial: CambiosObra, { t, grupo = null }: { t: number; grupo?: string | null }): EstadoBorrador {
    if (!obraPorId(e, id)) return e;
    const cambios = limpiarCambios(todas(e), { ...e.cambios, [id]: { ...(e.cambios[id] || {}), ...parcial } });
    if (igual(cambios, e.cambios)) return e;
    const sigue = !!grupo && !!e.ultimo && e.ultimo.grupo === grupo && t - e.ultimo.t < RAFAGA_MS;
    return {
        ...e,
        cambios,
        pasado: sigue ? e.pasado : [...e.pasado, capaDe(e)].slice(-MAX_PASOS),
        futuro: [],
        ultimo: { grupo, t },
    };
}

/** Un paso de estructura: siempre un paso propio de deshacer (nunca se junta con una ráfaga). */
function paso(e: EstadoBorrador, c: Capa): EstadoBorrador {
    const limpia = limpiarCapa(e.obras, c);
    if (igual(limpia, capaDe(e))) return e;
    return { ...e, ...limpia, pasado: [...e.pasado, capaDe(e)].slice(-MAX_PASOS), futuro: [], ultimo: null };
}

export const puedeDeshacer = (e: EstadoBorrador) => e.pasado.length > 0;
export const puedeRehacer = (e: EstadoBorrador) => e.futuro.length > 0;

export function deshacer(e: EstadoBorrador): EstadoBorrador {
    if (!e.pasado.length) return e;
    return { ...e, ...e.pasado[e.pasado.length - 1], pasado: e.pasado.slice(0, -1), futuro: [...e.futuro, capaDe(e)], ultimo: null };
}

export function rehacer(e: EstadoBorrador): EstadoBorrador {
    if (!e.futuro.length) return e;
    return { ...e, ...e.futuro[e.futuro.length - 1], futuro: e.futuro.slice(0, -1), pasado: [...e.pasado, capaDe(e)], ultimo: null };
}

/** Qué campos de qué obras quedaron distintos entre dos estados (para avisarle al puente después de deshacer). */
export function camposTocados(antes: Vista, despues: Vista): { id: number; campo: CampoEditor }[] {
    const ids = new Set([...Object.keys(antes.cambios), ...Object.keys(despues.cambios)].map(Number));
    const out: { id: number; campo: CampoEditor }[] = [];
    for (const id of ids) {
        const a = formActual(antes, id);
        const b = formActual(despues, id);
        if (!a || !b) continue;
        for (const campo of CAMPOS_EDITOR) if (!igual(a[campo], b[campo])) out.push({ id, campo });
    }
    return out;
}

/* ──────────────── las listas del sitio (espejo de src/data/selecciones.ts) ──────────────── */

/** La lista «de la casa» de cada estado (la de /proyectos/): ahí se ordena con ◀ ▶ en el panel. */
export const REGLA_PRINCIPAL: Record<EstadoObra, Regla> = {
    en_construccion: 'proyectos-en-curso',
    contratado: 'proyectos-contratados',
    terminado: 'proyectos-terminados',
};

export interface FilaSitio { o: ObraEditor; json: JsonObraSitio; incluir: boolean; nueva: boolean }

const ORDEN_ESTADOS = ['en-curso', 'contratado', 'terminado'];
/** El orden base del sitio (`compararObras` de vistaObra.ts): estado, orden, nombre (es) y slug. */
const comparar = (a: JsonObraSitio, b: JsonObraSitio): number =>
    ORDEN_ESTADOS.indexOf(a.estado) - ORDEN_ESTADOS.indexOf(b.estado) || a.orden - b.orden
    || a.nombre.localeCompare(b.nombre, 'es') || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0);
/** Foto propia: la primera foto del JSON (una imagen referencial no viene en `fotos`). */
const fotoPropia = (j: JsonObraSitio): number => (j.fotos.length ? 1 : 0);

/** Todas las obras como las ve el puente, en el orden base del sitio. */
export function filasSitio(e: Vista): FilaSitio[] {
    return todas(e).map(o => ({ o, json: jsonConCambios(o, e.cambios[o.meta.id], ordenDe(e, o)), incluir: incluirDe(e, o), nueva: o.meta.nueva }))
        .sort((a, b) => comparar(a.json, b.json));
}

/**
 * Lo que muestra una lista del sitio con el borrador: las incluidas (y las nuevas sin guardar, que el puente muestra
 * mientras se escriben) según la regla de selecciones.ts.
 */
export function listaVisible(e: Vista, regla: Regla): FilaSitio[] {
    const visibles = filasSitio(e).filter(f => f.incluir || f.nueva);
    const de = (s: string) => visibles.filter(f => f.json.estado === s);
    switch (regla) {
        case 'portada-en-obra': return de('en-curso').slice(0, 3);
        case 'portada-proximos': return de('contratado');
        case 'proyectos-en-curso': return de('en-curso');
        case 'proyectos-contratados': return de('contratado');
        case 'proyectos-terminados':
            return [...de('terminado')].sort((a, b) => ((b.json.anio ?? 0) - (a.json.anio ?? 0)) || (fotoPropia(b.json) - fotoPropia(a.json)));
        default: return [];
    }
}

export const idsDeLista = (e: Vista, regla: Regla): number[] => listaVisible(e, regla).map(f => f.o.meta.id);

/* ──────────────── estructura (A2) ──────────────── */

export type ResultadoOp =
    | { ok: true; e: EstadoBorrador; id?: number }
    | { ok: false; motivo: string; faltantes?: Faltante[] };

const desconocida = { ok: false as const, motivo: 'Esa obra ya no está en el borrador.' };

/** El mayor `orden` de un estado en la pantalla (sin contar `menos`): una obra que llega va después (+10), como el servidor. */
function maxOrden(e: Vista, estado: EstadoObra, menos: number | null = null): number {
    let m = 0;
    for (const o of todas(e)) if (o.meta.id !== menos && estadoDe(e, o) === estado) m = Math.max(m, ordenDe(e, o));
    return m;
}

/** Una obra nueva sin guardar: id negativo, slug provisorio `~nN`, fuera del sitio, con «Construcción» marcado. */
export function obraNueva(n: number, estado: EstadoObra, orden: number): ObraEditor {
    return {
        json: {
            slug: `~n${n}`, orden, estado: ESTADO_SITIO[estado], nombre: '', titular: null, tipo: null, mandante: null, comuna: null,
            direccion: null, superficieM2: null, anio: null, inicio: null, servicios: ['construccion'], desafio: null, solucion: null,
            resultado: null, fotos: [],
        },
        meta: {
            id: -n, incluir: false, nueva: true, faltantes: [], estadoDerivado: 'borrador', updated_at: '', slug_congelado: false, foto: null,
            fotos_por_aprobar: 0, mandante: null, mandante_autoriza: false, publicado_at: null, nunca_publicada: true,
        },
    };
}
const numeroTmp = (o: ObraEditor): number => Number(o.json.slug.slice(2));

/** «Nueva obra» (barra o la tarjeta «+ Nueva obra» del puente): al final de su estado; el panel pide el nombre. */
export function crearNueva(e: EstadoBorrador, estado: EstadoObra): ResultadoOp {
    const n = e.nuevas.reduce((m, o) => Math.max(m, numeroTmp(o)), 0) + 1;
    const o = obraNueva(n, estado, maxOrden(e, estado) + 10);
    return { ok: true, e: paso(e, { ...capaDe(e), nuevas: [...e.nuevas, o] }), id: o.meta.id };
}

/** Descarta una obra nueva sin guardar (su «Borrar»: nunca llegó al servidor). */
export function descartarNueva(e: EstadoBorrador, id: number): ResultadoOp {
    const o = e.nuevas.find(x => x.meta.id === id);
    if (!o) return desconocida;
    const sin = <T,>(r: Readonly<Record<number, T>>) => Object.fromEntries(Object.entries(r).filter(([k]) => Number(k) !== id)) as Record<number, T>;
    return { ok: true, e: paso(e, { cambios: sin(e.cambios), nuevas: e.nuevas.filter(x => x !== o), estructura: { orden: sin(e.estructura.orden), incluir: sin(e.estructura.incluir) } }) };
}

/**
 * Cambia el estado (pasa a otra lista del sitio, al final). Terminado exige año de término: el de `anio` (lo que el
 * panel pidió) o el que ya tenía. Volver al estado cargado devuelve también su lugar.
 */
export function cambiarEstado(e: EstadoBorrador, id: number, estado: EstadoObra, anio?: string): ResultadoOp {
    const o = obraPorId(e, id);
    const f = formActual(e, id);
    if (!o || !f) return desconocida;
    if (f.estado === estado && anio === undefined) return { ok: true, e };
    const parcial: CambiosObra = { estado };
    if (estado === 'terminado') {
        const n = numeroDeCampo(anio ?? f.anio);
        if (n === null || Number.isNaN(n) || n < ANIO_MIN || n > ANIO_MAX) {
            return { ok: false, motivo: `Para pasarla a Terminado, escribe el año de término (${ANIO_MIN}–${ANIO_MAX}).` };
        }
        parcial.anio = String(n);
    }
    const orden: Record<number, number> = { ...e.estructura.orden };
    if (f.estado !== estado) {
        if (estado === estadoBase(o)) delete orden[id];
        else orden[id] = maxOrden(e, estado, id) + 10;
    }
    return { ok: true, e: paso(e, { ...capaDe(e), cambios: { ...e.cambios, [id]: { ...(e.cambios[id] || {}), ...parcial } }, estructura: { ...e.estructura, orden } }) };
}

const MOTIVO_ANIO = (anio: number | null) => (anio
    ? `Las terminadas van por año (la más nueva primero): esta solo se puede mover entre las de ${anio}.`
    : 'Las terminadas van por año (la más nueva primero): esta todavía no tiene año de término.');
const MOTIVO_FOTO = 'En el mismo año van primero las que tienen foto propia: esta solo se mueve entre las que son como ella.';

/**
 * El puente soltó una obra en la posición `indice` (0 = primera) de las visibles de `regla`: el orden nuevo de todo su
 * estado (10, 20, 30…, como el servidor), con las obras que esa lista no muestra (fuera del sitio, o después de las 3
 * de la portada) en sus mismos lugares. Las terminadas solo se mueven dentro de su año (y de su grupo con o sin foto
 * propia): el sitio las ordena así y otro lugar no se vería.
 */
export function mover(e: EstadoBorrador, regla: Regla, slug: string, indice: number): ResultadoOp {
    const L = listaVisible(e, regla);
    const i = L.findIndex(f => f.json.slug === slug);
    if (i < 0) return { ok: false, motivo: 'Esa obra no está en esa lista del sitio.' };
    const j = Math.max(0, Math.min(Math.trunc(indice), L.length - 1));
    if (i === j) return { ok: true, e };
    let grupo = L;
    if (regla === 'proyectos-terminados') {
        const a = L[i].json;
        const b = L[j].json;
        if ((a.anio ?? 0) !== (b.anio ?? 0)) return { ok: false, motivo: MOTIVO_ANIO(a.anio) };
        if (fotoPropia(a) !== fotoPropia(b)) return { ok: false, motivo: MOTIVO_FOTO };
        grupo = L.filter(f => (f.json.anio ?? 0) === (a.anio ?? 0) && fotoPropia(f.json) === fotoPropia(a));
    }
    const movida = L[i];
    const desde = grupo.indexOf(movida);
    const hasta = grupo.indexOf(L[j]);
    const nuevoGrupo = [...grupo];
    nuevoGrupo.splice(desde, 1);
    nuevoGrupo.splice(hasta, 0, movida);
    // El estado entero en el orden de la pantalla; los lugares de las del grupo se llenan con el grupo en su orden nuevo.
    const estado = movida.json.estado;
    const completo = filasSitio(e).filter(f => f.json.estado === estado);
    const ids = new Set(grupo.map(f => f.o.meta.id));
    let k = 0;
    const final = completo.map(f => (ids.has(f.o.meta.id) ? nuevoGrupo[k++] : f));
    const orden: Record<number, number> = { ...e.estructura.orden };
    final.forEach((f, n) => { orden[f.o.meta.id] = (n + 1) * 10; });
    return { ok: true, e: paso(e, { ...capaDe(e), estructura: { ...e.estructura, orden } }) };
}

/** ◀ ▶ del panel: un lugar antes (-1) o después (+1) en la lista de su estado en /proyectos/. Sin mover: el porqué. */
export function moverPaso(e: EstadoBorrador, id: number, delta: -1 | 1): ResultadoOp {
    const o = obraPorId(e, id);
    if (!o) return desconocida;
    const regla = REGLA_PRINCIPAL[estadoDe(e, o)];
    const L = listaVisible(e, regla);
    const i = L.findIndex(f => f.o.meta.id === id);
    if (i < 0) return { ok: false, motivo: 'Está fuera del sitio: inclúyela para ordenarla.' };
    const j = i + delta;
    if (j < 0) return { ok: false, motivo: 'Ya es la primera de la lista.' };
    if (j >= L.length) return { ok: false, motivo: 'Ya es la última de la lista.' };
    return mover(e, regla, o.json.slug, j);
}

/** «Quitar del sitio»: sale en la próxima publicación (nunca se bloquea). */
export function quitarDelSitio(e: EstadoBorrador, id: number): ResultadoOp {
    const o = obraPorId(e, id);
    if (!o) return desconocida;
    if (o.meta.nueva) return { ok: false, motivo: 'Todavía no está guardada: si no la quieres, bórrala.' };
    return { ok: true, e: paso(e, { ...capaDe(e), estructura: { ...e.estructura, incluir: { ...e.estructura.incluir, [id]: false } } }) };
}

/** «Incluir en el sitio»: solo si no le falta nada (mismo criterio que el servidor). */
export function incluirEnSitio(e: EstadoBorrador, id: number): ResultadoOp {
    const o = obraPorId(e, id);
    if (!o) return desconocida;
    const f = faltantesDe(e, id);
    if (f.length) return { ok: false, motivo: 'Para salir al sitio le falta completar algunos datos.', faltantes: f };
    return { ok: true, e: paso(e, { ...capaDe(e), estructura: { ...e.estructura, incluir: { ...e.estructura.incluir, [id]: true } } }) };
}

/** Lo que cambió de lugar de cara al visitante, para avisarlo (toast con «Ver»). `regla` = dónde verla ahora. */
export interface AvisoLugar { id: number; texto: string; regla: Regla | null }

export function avisosDeLugar(antes: Vista, despues: Vista): AvisoLugar[] {
    const out: AvisoLugar[] = [];
    const nombre = (o: ObraEditor) => `«${formActual(despues, o.meta.id)?.nombre.trim() || 'Nueva obra'}»`;
    const portadaAntes = idsDeLista(antes, 'portada-en-obra');
    const portadaDespues = new Set(idsDeLista(despues, 'portada-en-obra'));
    for (const o of todas(despues)) {
        const a = obraPorId(antes, o.meta.id);
        if (!a) continue;
        const ea = estadoDe(antes, a);
        const ed = estadoDe(despues, o);
        const visible = incluirDe(despues, o) || o.meta.nueva;
        if (ea !== ed) {
            out.push(visible
                ? { id: o.meta.id, regla: REGLA_PRINCIPAL[ed], texto: `${nombre(o)} pasó a «${ETIQUETA_ESTADO[ed]}»: ahora está en ${ETIQUETA_REGLA[REGLA_PRINCIPAL[ed]]}.` }
                : { id: o.meta.id, regla: null, texto: `${nombre(o)} pasó a «${ETIQUETA_ESTADO[ed]}». Está fuera del sitio: no se ve hasta incluirla.` });
        } else if (visible && portadaAntes.includes(o.meta.id) && !portadaDespues.has(o.meta.id)) {
            out.push({ id: o.meta.id, regla: 'proyectos-en-curso', texto: `${nombre(o)} ya no sale en ${ETIQUETA_REGLA['portada-en-obra']} (solo van las 3 primeras): sigue en ${ETIQUETA_REGLA['proyectos-en-curso']}.` });
        }
    }
    return out;
}

/* ──────────────── guardar ──────────────── */

const OPC = { slugCongelado: true } as const;

/** Lo que de verdad cambia al guardar una obra (el cuerpo del PUT de la Lista: textos recortados, '' → null). */
export function cuerpoCambios(e: Vista, id: number): Record<string, unknown> {
    const o = obraPorId(e, id);
    const c = e.cambios[id];
    if (!o || !c || o.meta.nueva) return {};
    const base = formBase(o);
    return soloCambios(cuerpoDesdeForm({ ...base, ...c }, OPC), cuerpoDesdeForm(base, OPC));
}

/** El cuerpo de crear una obra nueva (el del POST /obras de la Lista; la dirección web la arma el servidor). */
export function cuerpoNueva(e: Vista, id: number): Record<string, unknown> {
    const f = formActual(e, id);
    return f ? cuerpoDesdeForm(f, { nueva: true }) : {};
}

/** Las obras guardadas con algo que guardar, en el orden de la lista. */
export const obrasConCambios = (e: Vista): ObraEditor[] =>
    e.obras.filter(o => Object.keys(cuerpoCambios(e, o.meta.id)).length > 0);

const refDe = (o: ObraEditor): number | string => (o.meta.nueva ? o.json.slug : o.meta.id);

/**
 * Los estados cuyo orden en la pantalla NO es el que el servidor dejaría solo (las que estaban, en su orden; después las
 * nuevas, en el orden en que se crearon; después las que llegaron de otro estado, en el orden del guardado): esos van en
 * `orden` con la lista completa.
 */
export function ordenesCambiados(e: Vista): { estado: EstadoObra; filas: FilaSitio[]; natural: ObraEditor[] }[] {
    const out: { estado: EstadoObra; filas: FilaSitio[]; natural: ObraEditor[] }[] = [];
    const filas = filasSitio(e);
    const enCambios = new Set(Object.keys(e.cambios).map(Number));
    for (const estado of ESTADOS) {
        const efectivo = filas.filter(f => estadoDe(e, f.o) === estado);
        if (!efectivo.length) continue;
        const natural = [
            ...e.obras.filter(o => estadoBase(o) === estado && estadoDe(e, o) === estado).sort((a, b) => comparar(a.json, b.json)),
            ...(e.nuevas ?? []).filter(o => estadoDe(e, o) === estado),
            ...e.obras.filter(o => estadoBase(o) !== estado && estadoDe(e, o) === estado && enCambios.has(o.meta.id)),
        ];
        if (!igual(efectivo.map(f => f.o.meta.id), natural.map(o => o.meta.id))) out.push({ estado, filas: efectivo, natural });
    }
    return out;
}

/** Fuera/dentro del sitio que cambió: las guardadas distintas de lo cargado y las nuevas que se incluyen. */
const incluirCambiados = (e: Vista): { o: ObraEditor; incluir: boolean }[] =>
    todas(e).filter(o => incluirDe(e, o) !== o.meta.incluir).map(o => ({ o, incluir: incluirDe(e, o) }));

/** Cuántas cosas hay por guardar (el número de «Guardar (n)»): campos, obras nuevas, listas reordenadas y fuera/dentro. */
export const contarCambios = (e: Vista): number =>
    e.obras.reduce((n, o) => n + Object.keys(cuerpoCambios(e, o.meta.id)).length, 0)
    + (e.nuevas?.length ?? 0) + ordenesCambiados(e).length + incluirCambiados(e).length;

export interface PayloadGuardar {
    obras: { id: number; updated_at: string; cambios: Record<string, unknown> }[];
    nuevas?: { tmp: string; cambios: Record<string, unknown> }[];
    orden?: { estado: EstadoObra; ids: (number | string)[] }[];
    incluir?: { id: number | string; incluir: boolean }[];
}

/** `POST /editor/guardar`: cada obra con lo que cambió y su versión; las nuevas, el orden y el fuera/dentro (A2). */
export function payloadGuardar(e: Vista): PayloadGuardar {
    const p: PayloadGuardar = {
        obras: obrasConCambios(e).map(o => ({ id: o.meta.id, updated_at: o.meta.updated_at, cambios: cuerpoCambios(e, o.meta.id) })),
    };
    const nuevas = (e.nuevas ?? []).map(o => ({ tmp: o.json.slug, cambios: cuerpoNueva(e, o.meta.id) }));
    if (nuevas.length) p.nuevas = nuevas;
    const orden = ordenesCambiados(e).map(g => ({ estado: g.estado, ids: g.filas.map(f => refDe(f.o)) }));
    if (orden.length) p.orden = orden;
    const incluir = incluirCambiados(e).map(x => ({ id: refDe(x.o), incluir: x.incluir }));
    if (incluir.length) p.incluir = incluir;
    return p;
}

const nombreDe = (e: Vista, o: ObraEditor): string => (o.meta.nueva ? (formActual(e, o.meta.id)?.nombre.trim() || 'Nueva obra') : (o.json.nombre || o.json.slug));

/** Lo que impide guardar (nombre vacío, superficie o año que no son números): [{ id, nombre, mensaje }]. */
export function erroresGuardar(e: Vista): { id: number; nombre: string; mensaje: string }[] {
    const out: { id: number; nombre: string; mensaje: string }[] = [];
    const revisar = (o: ObraEditor, nueva: boolean) => {
        const f = formActual(e, o.meta.id)!;
        for (const m of Object.values(erroresForm(f, { nueva }))) if (m) out.push({ id: o.meta.id, nombre: nueva ? `Nueva obra (${ETIQUETA_ESTADO[f.estado]})` : nombreDe(e, o), mensaje: m });
    };
    for (const o of e.nuevas ?? []) revisar(o, true);
    for (const o of obrasConCambios(e)) revisar(o, false);
    return out;
}

const textoDe = (campo: CampoEditor, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '(vacío)';
    if (campo === 'mandante_autoriza') return v ? 'Sí' : 'No';
    if (campo === 'estado') return ETIQUETA_ESTADO[v as EstadoObra] ?? String(v);
    if (campo === 'servicios') {
        const l = listaServicios(v);
        return l.length ? l.map(s => SERVICIOS.find(x => x.slug === s)?.nombre ?? s).join(', ') : '(ninguno)';
    }
    if (campo === 'superficie_m2' && typeof v === 'number') return formatoSuperficie(v);
    return String(v);
};

/**
 * Una fila del diálogo de guardar. `grupo` junta las filas de una obra (`obra:<id>`) o de una lista reordenada
 * (`orden:<estado>`); `antes` vacío = no hay «antes» (una obra nueva).
 */
export interface Diferencia { grupo: string; id: number | null; obra: string; campo: CampoEditor | 'nueva' | 'incluir' | 'orden'; etiqueta: string; antes: string; despues: string }

/** Para el diálogo de guardar: las nuevas, cada obra con sus campos («antes → después», ya recortado) y las listas reordenadas. */
export function diferencias(e: Vista): Diferencia[] {
    const out: Diferencia[] = [];
    for (const o of e.nuevas ?? []) {
        const f = formActual(e, o.meta.id)!;
        out.push({
            grupo: `obra:${o.meta.id}`, id: o.meta.id, obra: nombreDe(e, o), campo: 'nueva', etiqueta: 'Nueva obra', antes: '',
            despues: `${ETIQUETA_ESTADO[f.estado]} · ${incluirDe(e, o) ? 'sale al sitio en la próxima publicación' : 'fuera del sitio por ahora'}`,
        });
    }
    const conIncluir = new Map(incluirCambiados(e).filter(x => !x.o.meta.nueva).map(x => [x.o.meta.id, x.incluir]));
    for (const o of e.obras) {
        const cuerpo = cuerpoCambios(e, o.meta.id);
        const base = cuerpoDesdeForm(formBase(o), OPC);
        const g = `obra:${o.meta.id}`;
        for (const campo of CAMPOS_EDITOR) {
            if (!(campo in cuerpo)) continue;
            out.push({
                grupo: g, id: o.meta.id, obra: nombreDe(e, o), campo, etiqueta: ETIQUETA_CAMPO[campo],
                antes: textoDe(campo, base[campo]), despues: textoDe(campo, cuerpo[campo]),
            });
        }
        const inc = conIncluir.get(o.meta.id);
        if (inc !== undefined) {
            out.push(inc
                ? { grupo: g, id: o.meta.id, obra: nombreDe(e, o), campo: 'incluir', etiqueta: 'Vuelve al sitio', antes: 'Fuera del sitio', despues: 'Sale en la próxima publicación' }
                : { grupo: g, id: o.meta.id, obra: nombreDe(e, o), campo: 'incluir', etiqueta: 'Fuera del sitio', antes: 'En el sitio', despues: 'Se retira en la próxima publicación' });
        }
    }
    for (const g of ordenesCambiados(e)) {
        const nombres = (l: readonly ObraEditor[]) => l.map(o => nombreDe(e, o)).join(' · ');
        out.push({
            grupo: `orden:${g.estado}`, id: null, obra: `Orden en «${ETIQUETA_REGLA[REGLA_PRINCIPAL[g.estado]]}»`, campo: 'orden', etiqueta: 'Orden',
            antes: nombres(g.natural), despues: nombres(g.filas.map(f => f.o)),
        });
    }
    return out;
}

/**
 * Después de guardar: la base nueva del servidor y, encima, solo lo que se escribió MIENTRAS se guardaba (lo que es
 * distinto de lo que se mandó). Lo escrito en una nueva pasa a su obra creada (`mapa`: slug provisorio → id). La
 * estructura se mandó entera. Deshacer vuelve a empezar (la base cambió).
 */
export function rebasar(e: EstadoBorrador, obrasNuevas: readonly ObraEditor[], enviado: Cambios, mapa: Readonly<Record<string, number>> = {}): EstadoBorrador {
    const quedan: Record<number, CambiosObra> = {};
    for (const [k, c] of Object.entries(e.cambios)) {
        const id = Number(k);
        let destino = id;
        if (id < 0) {
            const o = e.nuevas.find(x => x.meta.id === id);
            const real = o ? mapa[o.json.slug] : undefined;
            if (!real) continue;
            destino = real;
        }
        const env = (enviado[id] || {}) as Record<string, unknown>;
        const resto = Object.fromEntries(Object.entries(c).filter(([campo, v]) => !igual(v, env[campo])));
        if (Object.keys(resto).length) quedan[destino] = { ...(quedan[destino] || {}), ...resto } as CambiosObra;
    }
    return crearBorrador(obrasNuevas, quedan);
}

/** Recargar después de un 409: las obras que chocaron pierden lo escrito; el resto (también nuevas y estructura) queda. */
export function recargarConChoques(e: EstadoBorrador, obrasNuevas: readonly ObraEditor[], idsChocados: readonly number[]): EstadoBorrador {
    const quedan = Object.fromEntries(Object.entries(e.cambios).filter(([k]) => !idsChocados.includes(Number(k))));
    return crearBorrador(obrasNuevas, quedan, { nuevas: e.nuevas, estructura: e.estructura });
}

/* ──────────────── lo que ve el puente ──────────────── */

/** El JSON con la forma del sitio (src/content/obras) con lo escrito encima: lo que el puente pinta. */
export function jsonConCambios(o: ObraEditor, c: CambiosObra | undefined, orden: number = o.json.orden): JsonObraSitio {
    if (!c || !Object.keys(c).length) return orden === o.json.orden ? o.json : { ...o.json, orden };
    const f = { ...formBase(o), ...c };
    const m2 = numeroDeCampo(f.superficie_m2);
    const anio = numeroDeCampo(f.anio);
    return {
        ...o.json,
        orden,
        estado: ESTADO_SITIO[f.estado],
        nombre: recorte(f.nombre) ?? '',
        titular: recorte(f.titular),
        tipo: recorte(f.tipo),
        mandante: f.mandante_autoriza ? recorte(f.mandante) : null,
        comuna: recorte(f.comuna),
        direccion: recorte(f.direccion),
        superficieM2: m2 !== null && !Number.isNaN(m2) && m2 >= 1 ? m2 : null,
        anio: f.estado === 'terminado' && anio !== null && !Number.isNaN(anio) ? anio : null,
        inicio: recorte(f.inicio),
        servicios: listaServicios(f.servicios),
        desafio: recorte(f.desafio),
        solucion: recorte(f.solucion),
        resultado: recorte(f.resultado),
    };
}

/** Las obras para el mensaje `borrador` (estado completo: qué obras hay, su estado, orden e incluir; A2). */
export const obrasParaPuente = (e: Vista): { json: JsonObraSitio; meta: { incluir: boolean; nueva: boolean } }[] =>
    todas(e).map(o => ({ json: jsonConCambios(o, e.cambios[o.meta.id], ordenDe(e, o)), meta: { incluir: incluirDe(e, o), nueva: o.meta.nueva } }));

/** Lo que le falta a la obra para salir al sitio, con lo escrito (espejo del backend: `reglas.faltantes`). */
export function faltantesDe(e: Vista, id: number): Faltante[] {
    const o = obraPorId(e, id);
    const f = formActual(e, id);
    if (!o || !f) return [];
    const portada = o.json.fotos[0];
    return faltantes(obraParaReglas(f, o.json.referencia ?? null), portada ? { alt: portada.alt } : null, { porAprobar: o.meta.fotos_por_aprobar });
}

export const etiquetaEstado = (o: ObraEditor): string => ETIQUETA_ESTADO[estadoBase(o)];

/** «Fuera del sitio»: las guardadas que no salen (con lo hecho en la pantalla). */
export const fueraDelSitio = (e: Vista): ObraEditor[] => e.obras.filter(o => !incluirDe(e, o));

/** «Borrar» (DELETE de siempre): una guardada que nunca salió al sitio y está fuera (también sin guardar); una nueva, siempre. */
export const puedeBorrar = (e: Vista, o: ObraEditor): boolean =>
    o.meta.nueva || (o.meta.nunca_publicada && !o.meta.incluir && !incluirDe(e, o));

/* ──────────────── respaldo en la pestaña (patrón de borradorObra.ts) ──────────────── */

export const CLAVE_RESPALDO = 'sitio-web:editor-visual';

export interface Respaldo {
    cambios: Cambios;
    /** Las nuevas sin guardar: su número (`~nN`), estado con que nacieron y lugar. */
    nuevas: { n: number; estado: EstadoObra; orden: number }[];
    estructura: Estructura;
    /** La versión de cada obra sobre la que se escribió. */
    versiones: Record<number, string>;
    guardado_at: string;
}

const sesion = (): Almacen | null => {
    try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

const objeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
/** Un id de obra válido para el respaldo: uno guardado (≥ 1) o el de una nueva del mismo respaldo. */
const idValido = (k: string, negativos: ReadonlySet<number>): number | null => {
    const id = Number(k);
    return Number.isInteger(id) && (id >= 1 || negativos.has(id)) ? id : null;
};

/** Solo campos del editor con su tipo (lo que dejó una versión vieja de la pantalla, o algo raro, se descarta). */
export function cambiosValidos(x: unknown, negativos: ReadonlySet<number> = new Set()): Cambios {
    const out: Record<number, CambiosObra> = {};
    if (!objeto(x)) return out;
    for (const [k, c] of Object.entries(x)) {
        const id = idValido(k, negativos);
        if (id === null || !objeto(c)) continue;
        const limpio: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITOR) {
            const v = c[campo];
            if (v === undefined) continue;
            const ok = campo === 'servicios' ? Array.isArray(v) && v.every(s => typeof s === 'string')
                : campo === 'mandante_autoriza' ? typeof v === 'boolean'
                    : campo === 'estado' ? (ESTADOS as readonly unknown[]).includes(v) : typeof v === 'string';
            if (ok) limpio[campo] = v;
        }
        if (Object.keys(limpio).length) out[id] = limpio as CambiosObra;
    }
    return out;
}

function nuevasValidas(x: unknown): Respaldo['nuevas'] {
    if (!Array.isArray(x)) return [];
    const vistos = new Set<number>();
    return x.filter((n): n is Respaldo['nuevas'][number] => objeto(n) && Number.isInteger(n.n) && (n.n as number) >= 1 && (n.n as number) <= 999999
        && (ESTADOS as readonly unknown[]).includes(n.estado) && Number.isInteger(n.orden) && !vistos.has(n.n as number) && !!vistos.add(n.n as number))
        .map(n => ({ n: n.n, estado: n.estado, orden: n.orden }));
}

function estructuraValida(x: unknown, negativos: ReadonlySet<number>): Estructura {
    const orden: Record<number, number> = {};
    const incluir: Record<number, boolean> = {};
    if (objeto(x)) {
        if (objeto(x.orden)) for (const [k, v] of Object.entries(x.orden)) { const id = idValido(k, negativos); if (id !== null && Number.isInteger(v)) orden[id] = v as number; }
        if (objeto(x.incluir)) for (const [k, v] of Object.entries(x.incluir)) { const id = idValido(k, negativos); if (id !== null && typeof v === 'boolean') incluir[id] = v; }
    }
    return { orden, incluir };
}

export function guardarRespaldo(e: Capa & Pick<EstadoBorrador, 'obras'>, almacen: Almacen | null = sesion(), ahora = new Date()): void {
    const versiones: Record<number, string> = {};
    for (const k of Object.keys(e.cambios)) { const o = e.obras.find(x => x.meta.id === Number(k)); if (o) versiones[o.meta.id] = o.meta.updated_at; }
    const nuevas = e.nuevas.map(o => ({ n: numeroTmp(o), estado: estadoBase(o), orden: o.json.orden }));
    try {
        almacen?.setItem(CLAVE_RESPALDO, JSON.stringify({ cambios: e.cambios, nuevas, estructura: e.estructura, versiones, guardado_at: ahora.toISOString() }));
    } catch { /* sin espacio o bloqueado: solo se pierde la red */ }
}

export function leerRespaldo(almacen: Almacen | null = sesion()): Respaldo | null {
    try {
        const crudo = almacen?.getItem(CLAVE_RESPALDO);
        if (!crudo) return null;
        const b = JSON.parse(crudo) as Record<string, unknown>;
        if (!objeto(b)) return null;
        const nuevas = nuevasValidas(b.nuevas);
        const negativos = new Set(nuevas.map(n => -n.n));
        const r: Respaldo = {
            cambios: cambiosValidos(b.cambios, negativos),
            nuevas,
            estructura: estructuraValida(b.estructura, negativos),
            versiones: objeto(b.versiones) ? b.versiones as Record<number, string> : {},
            guardado_at: String(b.guardado_at || ''),
        };
        return hayAlgo(capaDeRespaldo(r)) ? r : null;
    } catch {
        return null;
    }
}

export function borrarRespaldo(almacen: Almacen | null = sesion()): void {
    try { almacen?.removeItem(CLAVE_RESPALDO); } catch { /* nada */ }
}

/** El respaldo como capa (las nuevas se rearman: el respaldo no guarda HTML ni nada que no sea su número y estado). */
export const capaDeRespaldo = (r: Respaldo): Capa => ({
    cambios: r.cambios,
    nuevas: r.nuevas.map(n => obraNueva(n.n, n.estado, n.orden)),
    estructura: r.estructura,
});

/** ¿Vale la pena ofrecerlo? Solo si, sobre lo que se acaba de cargar, todavía cambia algo. */
export function ofrecerRespaldo(r: Respaldo | null, obras: readonly ObraEditor[]): r is Respaldo {
    return !!r && hayAlgo(limpiarCapa(obras, capaDeRespaldo(r)));
}

/** Recuperar: lo del respaldo debajo de lo que ya se haya hecho en esta pantalla (un paso de deshacer). */
export function recuperarRespaldo(e: EstadoBorrador, r: Respaldo): EstadoBorrador {
    const c = capaDeRespaldo(r);
    const nuevas = [...c.nuevas.filter(n => !e.nuevas.some(m => m.meta.id === n.meta.id)), ...e.nuevas];
    const base = crearBorrador(e.obras, { ...c.cambios, ...e.cambios }, {
        nuevas,
        estructura: { orden: { ...c.estructura.orden, ...e.estructura.orden }, incluir: { ...c.estructura.incluir, ...e.estructura.incluir } },
    });
    return { ...base, pasado: [...e.pasado, capaDe(e)], futuro: [] };
}

/** Obras del respaldo que alguien guardó después de que se escribió (para avisar al recuperarlo). */
export const respaldoDesactualizado = (r: Respaldo, obras: readonly ObraEditor[]): ObraEditor[] =>
    obras.filter(o => r.cambios[o.meta.id] && r.versiones[o.meta.id] && r.versiones[o.meta.id] !== o.meta.updated_at);

/** Una obra nueva por su slug provisorio (para validar lo que llega del puente). */
export const esNuevaProvisoria = (slug: string): boolean => TMP_RE.test(slug);

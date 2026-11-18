import * as z from 'zod';
import { LARGOS } from '../reglas';
import type { EstadoObra, JsonObraSitio } from '../tipos';

/**
 * Protocolo v1 entre la Bóveda y el puente del editor visual que vive en el sitio (contrato: `docs/editor-visual.md`
 * del repo lols.cl, § 4). Todo mensaje es `{ p: 'lols-editor', v: 1, tipo, ... }`; cualquier otro se ignora.
 *
 * Lo que llega del iframe es una PROPUESTA de una página de otro origen: cada mensaje pasa por zod (forma) y, un
 * `cambio`, además por `validarCambio` (campo permitido, obra conocida, largo del contrato) antes de tocar el borrador.
 * Lo que sale se arma solo con los constructores de abajo. Sin JSX ni `import.meta` (test en node).
 */

export const P = 'lols-editor' as const;
export const V = 1 as const;

/** Los campos que se escriben EN el sitio (`data-ed-campo`); los derivados (`data-ed-derivado`) van por el panel. */
export const CAMPOS_EN_LUGAR = ['/nombre', '/titular', '/comuna', '/direccion', '/inicio', '/desafio', '/solucion', '/resultado'] as const;
export type CampoEnLugar = typeof CAMPOS_EN_LUGAR[number];
/** '/nombre' → 'nombre' (la clave del formulario y del JSON, que en estos campos coinciden). */
export type ClaveEnLugar = CampoEnLugar extends `/${infer K}` ? K : never;
export const claveDe = (c: CampoEnLugar): ClaveEnLugar => c.slice(1) as ClaveEnLugar;
export const esCampoEnLugar = (c: unknown): c is CampoEnLugar => (CAMPOS_EN_LUGAR as readonly unknown[]).includes(c);

/**
 * El slug de una obra en un mensaje: uno real (`maipu-40`) o el provisorio de una obra nueva sin guardar (`~n1`, A2:
 * el `~` no pasa el esquema del sitio, así que nunca choca con uno real).
 */
export const SLUG_ITEM_RE = /^(?:[a-z0-9]+(-[a-z0-9]+)*|~n[1-9]\d{0,5})$/;
const ITEM_RE = /^obras\/(?:[a-z0-9]+(-[a-z0-9]+)*|~n[1-9]\d{0,5})$/;
export const TMP_RE = /^~n[1-9]\d{0,5}$/;
export const esSlugProvisorio = (slug: string): boolean => TMP_RE.test(slug);
export const itemDe = (slug: string): string => `obras/${slug}`;
export const slugDeItem = (item: string): string | null => (ITEM_RE.test(item) ? item.slice('obras/'.length) : null);

/** Lo más largo que puede traer un texto (el mayor de LARGOS); el de cada campo lo revisa `validarCambio`. */
const MAX_TEXTO = Math.max(...CAMPOS_EN_LUGAR.map(c => LARGOS[claveDe(c)]));

const cabecera = { p: z.literal(P), v: z.literal(V) };
const item = z.string().max(120).regex(ITEM_RE);
/** Puntero JSON corto: '/nombre', '/fotos/0', '/superficieM2'. */
const puntero = z.string().max(40).regex(/^(\/[A-Za-z0-9]+)+$/);
const ruta = z.string().min(1).max(300);

const hola = z.object({
    ...cabecera,
    tipo: z.literal('hola'),
    ruta,
    build: z.string().max(80).nullable(),
    listas: z.array(z.object({
        regla: z.string().max(60),
        vista: z.string().max(30),
        items: z.array(z.string().max(100).regex(SLUG_ITEM_RE)).max(500),
    })).max(30),
    limites: z.record(z.string().max(40), z.number().int().nonnegative()),
});
const seleccion = z.object({ ...cabecera, tipo: z.literal('seleccion'), item, campo: puntero.nullable() });
const cambio = z.object({ ...cabecera, tipo: z.literal('cambio'), item, campo: z.enum(CAMPOS_EN_LUGAR), valor: z.string().max(MAX_TEXTO) });
const navegar = z.object({ ...cabecera, tipo: z.literal('navegar'), ruta });
const atajo = z.object({ ...cabecera, tipo: z.literal('atajo'), accion: z.enum(['deshacer', 'rehacer', 'guardar']) });

/* A2: estructura. Las 5 listas con nombre del sitio (`src/data/selecciones.ts` de lols.cl, contrato § 2). */
export const REGLAS = ['portada-en-obra', 'portada-proximos', 'proyectos-en-curso', 'proyectos-contratados', 'proyectos-terminados'] as const;
export type Regla = typeof REGLAS[number];
/** El estado de las obras de cada lista (una obra nueva creada en esa lista nace con él). */
export const ESTADO_DE_REGLA: Record<Regla, EstadoObra> = {
    'portada-en-obra': 'en_construccion',
    'portada-proximos': 'contratado',
    'proyectos-en-curso': 'en_construccion',
    'proyectos-contratados': 'contratado',
    'proyectos-terminados': 'terminado',
};
/** Cómo se nombra cada lista en los avisos (página › sección, como se ve en el sitio). */
export const ETIQUETA_REGLA: Record<Regla, string> = {
    'portada-en-obra': 'Inicio › En obra ahora',
    'portada-proximos': 'Inicio › Próximos proyectos',
    'proyectos-en-curso': 'Proyectos › En construcción',
    'proyectos-contratados': 'Proyectos › En proyecto',
    'proyectos-terminados': 'Proyectos › Terminados',
};
const regla = z.enum(REGLAS);
const nueva = z.object({ ...cabecera, tipo: z.literal('nueva'), lista: regla });
const mover = z.object({ ...cabecera, tipo: z.literal('mover'), lista: regla, item, indice: z.number().int().nonnegative().max(10000) });

const mensajePuente = z.discriminatedUnion('tipo', [hola, seleccion, cambio, navegar, atajo, nueva, mover]);

export type MsgHola = z.infer<typeof hola>;
export type MsgSeleccion = z.infer<typeof seleccion>;
export type MsgCambio = z.infer<typeof cambio>;
export type MsgNavegar = z.infer<typeof navegar>;
export type MsgAtajo = z.infer<typeof atajo>;
export type MsgNueva = z.infer<typeof nueva>;
export type MsgMover = z.infer<typeof mover>;
export type MensajePuente = z.infer<typeof mensajePuente>;

/** Un mensaje del puente con su forma, o null (otro protocolo, otra versión, un campo de más largo, basura). */
export function leerMensaje(data: unknown): MensajePuente | null {
    const r = mensajePuente.safeParse(data);
    return r.success ? r.data : null;
}

/** ¿Este `message` de la ventana es el `hola` del iframe del sitio? (§ 4 Saludo, punto 2.) */
export function esHolaDelSitio(e: { origin: string; source: unknown; data: unknown }, origenSitio: string, ventanaIframe: unknown): MsgHola | null {
    if (!ventanaIframe || e.origin !== origenSitio || e.source !== ventanaIframe) return null;
    const m = leerMensaje(e.data);
    return m && m.tipo === 'hola' ? m : null;
}

export type MotivoRechazo = 'obra_desconocida' | 'muy_largo';

/**
 * Un `cambio` que ya pasó por zod: ¿es de una obra del borrador y cabe en su campo? (LARGOS = content.config.ts del
 * sitio, mismos que el puente recibe en `limites`.)
 */
export function validarCambio(m: MsgCambio, slugsConocidos: ReadonlySet<string>): { ok: true; slug: string; clave: ClaveEnLugar } | { ok: false; motivo: MotivoRechazo } {
    const slug = slugDeItem(m.item);
    if (!slug || !slugsConocidos.has(slug)) return { ok: false, motivo: 'obra_desconocida' };
    const clave = claveDe(m.campo);
    if (m.valor.length > LARGOS[clave]) return { ok: false, motivo: 'muy_largo' };
    return { ok: true, slug, clave };
}

/** Un `mover` que ya pasó por zod: ¿es de una obra del borrador? (El resto —la lista, el año— lo decide el borrador.) */
export function validarMover(m: MsgMover, slugsConocidos: ReadonlySet<string>): { ok: true; slug: string } | { ok: false; motivo: 'obra_desconocida' } {
    const slug = slugDeItem(m.item);
    return slug && slugsConocidos.has(slug) ? { ok: true, slug } : { ok: false, motivo: 'obra_desconocida' };
}

/**
 * Una ruta interna del sitio a la que el puente pide ir (`navegar`): '/proyectos/' sí; 'https://otro', '//otro',
 * 'javascript:' o '/\otro' no. Devuelve la ruta limpia (camino + #ancla, sin query) o null.
 */
export function rutaInterna(r: unknown): string | null {
    if (typeof r !== 'string' || !r.startsWith('/') || r.startsWith('//') || r.includes('\\')) return null;
    const BASE = 'https://sitio.invalid';
    let u: URL;
    try { u = new URL(r, BASE); } catch { return null; }
    if (u.origin !== BASE) return null;
    return `${u.pathname}${u.hash}`;
}

/** La URL del iframe: el sitio real en esa ruta con `?editor` (el puente se carga solo enmarcado y con eso). */
export function urlMarco(urlSitio: string, r: string): string {
    const origen = new URL(urlSitio).origin;
    const limpia = rutaInterna(r) ?? '/';
    const [camino, ancla = ''] = limpia.split('#');
    return `${origen}${camino}?editor${ancla ? `#${ancla}` : ''}`;
}

/* ──────────────── Bóveda → puente ──────────────── */

export type ModoPuente = 'editar' | 'mirar';

export const msgIniciar = (modo: ModoPuente = 'editar') => ({ p: P, v: V, tipo: 'iniciar' as const, modo });
export const msgBorrador = (obras: { json: JsonObraSitio; meta: { incluir: boolean; nueva: boolean } }[]) =>
    ({ p: P, v: V, tipo: 'borrador' as const, obras: obras.map(o => ({ json: o.json, meta: { incluir: o.meta.incluir, nueva: o.meta.nueva } })) });
export const msgCampo = (slug: string, campo: CampoEnLugar, valor: string) => ({ p: P, v: V, tipo: 'campo' as const, item: itemDe(slug), campo, valor });
export const msgModo = (modo: ModoPuente) => ({ p: P, v: V, tipo: 'modo' as const, modo });
export const msgMostrar = (slug: string) => ({ p: P, v: V, tipo: 'mostrar' as const, item: itemDe(slug) });
/** Los bytes van TRANSFERIDOS (el que envía pierde el ArrayBuffer): `port.postMessage(msg, [bytes])`. */
export const msgFoto = (slug: string, bytes: ArrayBuffer) => ({ p: P, v: V, tipo: 'foto' as const, item: itemDe(slug), bytes });

export type MensajeBoveda =
    | ReturnType<typeof msgIniciar> | ReturnType<typeof msgBorrador> | ReturnType<typeof msgCampo>
    | ReturnType<typeof msgModo> | ReturnType<typeof msgMostrar> | ReturnType<typeof msgFoto>;

/** Las páginas que se pueden editar en la etapa A1 (selector de la barra). */
export const PAGINAS: readonly { ruta: string; etiqueta: string }[] = [
    { ruta: '/', etiqueta: 'Inicio' },
    { ruta: '/proyectos/', etiqueta: 'Proyectos' },
];

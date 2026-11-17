import {
    ESTADOS, ESTADO_SITIO, ETIQUETA_ESTADO, SERVICIOS, cuerpoDesdeForm, erroresForm, faltantes, formatoSuperficie, listaServicios,
    numeroDeCampo, obraParaReglas, recorte, soloCambios, type FormObra,
} from '../reglas';
import type { Almacen } from '../borradorObra';
import type { EstadoObra, Faltante, JsonObraSitio, ObraEditor } from '../tipos';

/**
 * El borrador del editor visual (PURO, con test): las obras tal como las dejó el servidor (`GET /editor/borrador`) y,
 * encima, lo que se escribió y todavía no se guarda, por obra y por campo. Deshacer/rehacer agrupando una ráfaga de
 * teclas del mismo campo, la lista de diferencias para «Guardar», el cuerpo de `POST /editor/guardar` y el JSON con la
 * forma del sitio que se le manda al puente. Reusa las reglas del formulario de la Lista (`reglas.ts`: `FormObra`,
 * `cuerpoDesdeForm`, `soloCambios`, `erroresForm`, `faltantes`): un cambio hecho aquí se guarda igual que allá.
 * Sin JSX ni `import.meta` (jest en node).
 */

/** Lo que el editor visual cambia de una obra (A1: ni estado, ni dirección web, ni vínculo, ni orden). */
export const CAMPOS_EDITOR = [
    'nombre', 'titular', 'comuna', 'direccion', 'inicio', 'desafio', 'solucion', 'resultado',
    'tipo', 'superficie_m2', 'anio', 'servicios', 'mandante', 'mandante_autoriza',
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
    servicios: 'Servicios', mandante: 'Mandante', mandante_autoriza: 'Autoriza publicar el mandante',
};

/** Ráfaga: dos cambios del mismo campo con menos de esto entre sí son UN paso de deshacer. */
export const RAFAGA_MS = 1200;
const MAX_PASOS = 200;

export interface EstadoBorrador {
    obras: readonly ObraEditor[];
    cambios: Cambios;
    pasado: readonly Cambios[];
    futuro: readonly Cambios[];
    /** El último cambio (para agrupar la ráfaga): `grupo` = 'id:campo'; null = el próximo abre un paso nuevo. */
    ultimo: { grupo: string | null; t: number } | null;
}

export const crearBorrador = (obras: readonly ObraEditor[], cambios: Cambios = {}): EstadoBorrador => ({
    obras, cambios: limpiarContraBase(obras, cambios), pasado: [], futuro: [], ultimo: null,
});

const ESTADO_DESDE_SITIO: Record<string, EstadoObra> = Object.fromEntries(ESTADOS.map(e => [ESTADO_SITIO[e], e]));

/** La obra del servidor como formulario (el mismo de la Lista): lo que hay hoy. */
export function formBase(o: ObraEditor): FormObra {
    const j = o.json;
    return {
        nombre: j.nombre ?? '',
        slug: j.slug,
        obra_id: null,
        estado: ESTADO_DESDE_SITIO[j.estado] ?? 'en_construccion',
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

export const obraPorId = (e: Pick<EstadoBorrador, 'obras'>, id: number): ObraEditor | undefined => e.obras.find(o => o.meta.id === id);
export const obraPorSlug = (e: Pick<EstadoBorrador, 'obras'>, slug: string): ObraEditor | undefined => e.obras.find(o => o.json.slug === slug);

/** El formulario de la obra con lo escrito encima. */
export function formActual(e: Pick<EstadoBorrador, 'obras' | 'cambios'>, id: number): FormObra | null {
    const o = obraPorId(e, id);
    return o ? { ...formBase(o), ...(e.cambios[id] || {}) } : null;
}

const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Deja solo lo que de verdad difiere de lo cargado (y solo de obras que existen y campos del editor). */
function limpiarContraBase(obras: readonly ObraEditor[], cambios: Cambios): Cambios {
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

/**
 * Aplica un cambio a una obra. `grupo` (p. ej. 'id:nombre' al escribir) junta en UN paso de deshacer los cambios del
 * mismo grupo que llegan seguidos (menos de RAFAGA_MS); sin grupo, cada cambio es un paso. Si no cambia nada, devuelve
 * el mismo estado.
 */
export function aplicar(e: EstadoBorrador, id: number, parcial: CambiosObra, { t, grupo = null }: { t: number; grupo?: string | null }): EstadoBorrador {
    if (!obraPorId(e, id)) return e;
    const cambios = limpiarContraBase(e.obras, { ...e.cambios, [id]: { ...(e.cambios[id] || {}), ...parcial } });
    if (igual(cambios, e.cambios)) return e;
    const sigue = !!grupo && !!e.ultimo && e.ultimo.grupo === grupo && t - e.ultimo.t < RAFAGA_MS;
    return {
        ...e,
        cambios,
        pasado: sigue ? e.pasado : [...e.pasado, e.cambios].slice(-MAX_PASOS),
        futuro: [],
        ultimo: { grupo, t },
    };
}

export const puedeDeshacer = (e: EstadoBorrador) => e.pasado.length > 0;
export const puedeRehacer = (e: EstadoBorrador) => e.futuro.length > 0;

export function deshacer(e: EstadoBorrador): EstadoBorrador {
    if (!e.pasado.length) return e;
    return { ...e, cambios: e.pasado[e.pasado.length - 1], pasado: e.pasado.slice(0, -1), futuro: [...e.futuro, e.cambios], ultimo: null };
}

export function rehacer(e: EstadoBorrador): EstadoBorrador {
    if (!e.futuro.length) return e;
    return { ...e, cambios: e.futuro[e.futuro.length - 1], futuro: e.futuro.slice(0, -1), pasado: [...e.pasado, e.cambios], ultimo: null };
}

/** Qué campos de qué obras quedaron distintos entre dos estados (para avisarle al puente después de deshacer). */
export function camposTocados(antes: Pick<EstadoBorrador, 'obras' | 'cambios'>, despues: Pick<EstadoBorrador, 'obras' | 'cambios'>): { id: number; campo: CampoEditor }[] {
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

/* ──────────────── guardar ──────────────── */

const OPC = { slugCongelado: true } as const;

/** Lo que de verdad cambia al guardar una obra (el cuerpo del PUT de la Lista: textos recortados, '' → null). */
export function cuerpoCambios(e: Pick<EstadoBorrador, 'obras' | 'cambios'>, id: number): Record<string, unknown> {
    const o = obraPorId(e, id);
    const c = e.cambios[id];
    if (!o || !c) return {};
    const base = formBase(o);
    return soloCambios(cuerpoDesdeForm({ ...base, ...c }, OPC), cuerpoDesdeForm(base, OPC));
}

/** Las obras con algo que guardar, en el orden de la lista. */
export const obrasConCambios = (e: Pick<EstadoBorrador, 'obras' | 'cambios'>): ObraEditor[] =>
    e.obras.filter(o => Object.keys(cuerpoCambios(e, o.meta.id)).length > 0);

/** Cuántos campos hay por guardar (el número de «Guardar (n)»). */
export const contarCambios = (e: Pick<EstadoBorrador, 'obras' | 'cambios'>): number =>
    e.obras.reduce((n, o) => n + Object.keys(cuerpoCambios(e, o.meta.id)).length, 0);

/** `POST /editor/guardar`: cada obra con lo que cambió y la versión que se editó. */
export function payloadGuardar(e: Pick<EstadoBorrador, 'obras' | 'cambios'>): { obras: { id: number; updated_at: string; cambios: Record<string, unknown> }[] } {
    return {
        obras: obrasConCambios(e).map(o => ({ id: o.meta.id, updated_at: o.meta.updated_at, cambios: cuerpoCambios(e, o.meta.id) })),
    };
}

/** Lo que impide guardar (nombre vacío, superficie o año que no son números): [{ id, nombre, mensaje }]. */
export function erroresGuardar(e: Pick<EstadoBorrador, 'obras' | 'cambios'>): { id: number; nombre: string; mensaje: string }[] {
    const out: { id: number; nombre: string; mensaje: string }[] = [];
    for (const o of obrasConCambios(e)) {
        const f = formActual(e, o.meta.id)!;
        const errs = erroresForm(f);
        for (const m of Object.values(errs)) if (m) out.push({ id: o.meta.id, nombre: o.json.nombre || o.json.slug, mensaje: m });
    }
    return out;
}

const textoDe = (campo: CampoEditor, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '(vacío)';
    if (campo === 'mandante_autoriza') return v ? 'Sí' : 'No';
    if (campo === 'servicios') {
        const l = listaServicios(v);
        return l.length ? l.map(s => SERVICIOS.find(x => x.slug === s)?.nombre ?? s).join(', ') : '(ninguno)';
    }
    if (campo === 'superficie_m2' && typeof v === 'number') return formatoSuperficie(v);
    return String(v);
};

export interface Diferencia { id: number; obra: string; campo: CampoEditor; etiqueta: string; antes: string; despues: string }

/** Para el diálogo de guardar: por obra y campo, «antes → después» (lo que se guardaría, ya recortado). */
export function diferencias(e: Pick<EstadoBorrador, 'obras' | 'cambios'>): Diferencia[] {
    const out: Diferencia[] = [];
    for (const o of obrasConCambios(e)) {
        const base = cuerpoDesdeForm(formBase(o), OPC);
        const cuerpo = cuerpoCambios(e, o.meta.id);
        for (const campo of CAMPOS_EDITOR) {
            if (!(campo in cuerpo)) continue;
            out.push({
                id: o.meta.id, obra: o.json.nombre || o.json.slug, campo, etiqueta: ETIQUETA_CAMPO[campo],
                antes: textoDe(campo, base[campo]), despues: textoDe(campo, cuerpo[campo]),
            });
        }
    }
    return out;
}

/**
 * Después de guardar: la base nueva del servidor y, encima, solo lo que se escribió MIENTRAS se guardaba (lo que es
 * distinto de lo que se mandó). Deshacer vuelve a empezar (la base cambió).
 */
export function rebasar(e: EstadoBorrador, obrasNuevas: readonly ObraEditor[], enviado: Cambios): EstadoBorrador {
    const quedan: Record<number, CambiosObra> = {};
    for (const [k, c] of Object.entries(e.cambios)) {
        const env = (enviado[Number(k)] || {}) as Record<string, unknown>;
        const resto = Object.fromEntries(Object.entries(c).filter(([campo, v]) => !igual(v, env[campo])));
        if (Object.keys(resto).length) quedan[Number(k)] = resto as CambiosObra;
    }
    return crearBorrador(obrasNuevas, quedan);
}

/** Recargar después de un 409: las obras que chocaron pierden lo escrito; el resto lo conserva sobre la base nueva. */
export function recargarConChoques(e: EstadoBorrador, obrasNuevas: readonly ObraEditor[], idsChocados: readonly number[]): EstadoBorrador {
    const quedan = Object.fromEntries(Object.entries(e.cambios).filter(([k]) => !idsChocados.includes(Number(k))));
    return crearBorrador(obrasNuevas, quedan);
}

/* ──────────────── lo que ve el puente ──────────────── */

/** El JSON con la forma del sitio (src/content/obras) con lo escrito encima: lo que el puente pinta. */
export function jsonConCambios(o: ObraEditor, c: CambiosObra | undefined): JsonObraSitio {
    if (!c || !Object.keys(c).length) return o.json;
    const f = { ...formBase(o), ...c };
    const m2 = numeroDeCampo(f.superficie_m2);
    const anio = numeroDeCampo(f.anio);
    return {
        ...o.json,
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

/** Las obras para el mensaje `borrador` (estado completo). */
export const obrasParaPuente = (e: Pick<EstadoBorrador, 'obras' | 'cambios'>): { json: JsonObraSitio; meta: { incluir: boolean; nueva: boolean } }[] =>
    e.obras.map(o => ({ json: jsonConCambios(o, e.cambios[o.meta.id]), meta: { incluir: o.meta.incluir, nueva: o.meta.nueva } }));

/** Lo que le falta a la obra para salir al sitio, con lo escrito (espejo del backend: `reglas.faltantes`). */
export function faltantesDe(e: Pick<EstadoBorrador, 'obras' | 'cambios'>, id: number): Faltante[] {
    const o = obraPorId(e, id);
    const f = formActual(e, id);
    if (!o || !f) return [];
    const portada = o.json.fotos[0];
    return faltantes(obraParaReglas(f, o.json.referencia ?? null), portada ? { alt: portada.alt } : null, { porAprobar: o.meta.fotos_por_aprobar });
}

export const etiquetaEstado = (o: ObraEditor): string => ETIQUETA_ESTADO[ESTADO_DESDE_SITIO[o.json.estado] ?? 'en_construccion'];

/* ──────────────── respaldo en la pestaña (patrón de borradorObra.ts) ──────────────── */

export const CLAVE_RESPALDO = 'sitio-web:editor-visual';

export interface Respaldo {
    cambios: Cambios;
    /** La versión de cada obra sobre la que se escribió. */
    versiones: Record<number, string>;
    guardado_at: string;
}

const sesion = (): Almacen | null => {
    try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
};

/** Solo campos del editor con su tipo (lo que dejó una versión vieja de la pantalla, o algo raro, se descarta). */
export function cambiosValidos(x: unknown): Cambios {
    const out: Record<number, CambiosObra> = {};
    if (!x || typeof x !== 'object' || Array.isArray(x)) return out;
    for (const [k, c] of Object.entries(x as Record<string, unknown>)) {
        const id = Number(k);
        if (!Number.isInteger(id) || id < 1 || !c || typeof c !== 'object' || Array.isArray(c)) continue;
        const limpio: Record<string, unknown> = {};
        for (const campo of CAMPOS_EDITOR) {
            const v = (c as Record<string, unknown>)[campo];
            if (v === undefined) continue;
            if (campo === 'servicios' ? Array.isArray(v) && v.every(s => typeof s === 'string')
                : campo === 'mandante_autoriza' ? typeof v === 'boolean' : typeof v === 'string') limpio[campo] = v;
        }
        if (Object.keys(limpio).length) out[id] = limpio as CambiosObra;
    }
    return out;
}

export function guardarRespaldo(e: Pick<EstadoBorrador, 'obras' | 'cambios'>, almacen: Almacen | null = sesion(), ahora = new Date()): void {
    const versiones: Record<number, string> = {};
    for (const k of Object.keys(e.cambios)) { const o = obraPorId(e, Number(k)); if (o) versiones[o.meta.id] = o.meta.updated_at; }
    try {
        almacen?.setItem(CLAVE_RESPALDO, JSON.stringify({ cambios: e.cambios, versiones, guardado_at: ahora.toISOString() }));
    } catch { /* sin espacio o bloqueado: solo se pierde la red */ }
}

export function leerRespaldo(almacen: Almacen | null = sesion()): Respaldo | null {
    try {
        const crudo = almacen?.getItem(CLAVE_RESPALDO);
        if (!crudo) return null;
        const b = JSON.parse(crudo) as Partial<Respaldo>;
        const cambios = cambiosValidos(b?.cambios);
        if (!Object.keys(cambios).length) return null;
        const versiones = b.versiones && typeof b.versiones === 'object' ? b.versiones as Record<number, string> : {};
        return { cambios, versiones, guardado_at: String(b.guardado_at || '') };
    } catch {
        return null;
    }
}

export function borrarRespaldo(almacen: Almacen | null = sesion()): void {
    try { almacen?.removeItem(CLAVE_RESPALDO); } catch { /* nada */ }
}

/** ¿Vale la pena ofrecerlo? Solo si, sobre lo que se acaba de cargar, todavía cambia algo. */
export function ofrecerRespaldo(r: Respaldo | null, obras: readonly ObraEditor[]): r is Respaldo {
    return !!r && Object.keys(limpiarContraBase(obras, r.cambios)).length > 0;
}

/** Obras del respaldo que alguien guardó después de que se escribió (para avisar al recuperarlo). */
export const respaldoDesactualizado = (r: Respaldo, obras: readonly ObraEditor[]): ObraEditor[] =>
    obras.filter(o => r.cambios[o.meta.id] && r.versiones[o.meta.id] && r.versiones[o.meta.id] !== o.meta.updated_at);

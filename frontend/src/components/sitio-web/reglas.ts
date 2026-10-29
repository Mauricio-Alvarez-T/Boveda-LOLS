import type {
    ConfigSitio, EstadoDerivado, EstadoObra, Faltante, ObraSitio, ObraSitioLista, PublicacionSitio,
} from './tipos';

/**
 * Reglas PURAS del Sitio web (mig 147, docs/reglas/sitio-web.md), con test (`reglas.test.ts`). Las tres primeras
 * —`slugDesde`, `faltantes` y `estadoDerivado`— son ESPEJO de `backend/src/services/sitioWeb.service.js`: mismas
 * reglas, mismos textos (el test compara los catálogos con `backend/src/config/sitioWeb.config.js`). La pantalla
 * las usa para avisar mientras se escribe; lo que manda es lo que responde el servidor.
 * El resto arma lo que la pantalla muestra: grupos por estado, orden, filtros, avisos, formulario y vista previa.
 * Sin JSX ni `import.meta` (jest corre en node).
 */

/* ──────────────────────── catálogos (espejo de sitioWeb.config.js) ──────────────────────── */

export const ESTADOS: readonly EstadoObra[] = ['en_construccion', 'contratado', 'terminado'];
export const ESTADO_SITIO: Record<EstadoObra, 'en-curso' | 'contratado' | 'terminado'> = {
    en_construccion: 'en-curso',
    contratado: 'contratado',
    terminado: 'terminado',
};
/** Como los nombra el sitio (catalogo.ts → estados). */
export const ETIQUETA_ESTADO: Record<EstadoObra, string> = {
    en_construccion: 'En construcción',
    contratado: 'En proyecto',
    terminado: 'Terminado',
};
export const TIPOS: readonly string[] = [
    'Edificio de oficinas', 'Edificio y oficinas', 'Edificio comercial', 'Bodegaje', 'Centro de bodegas', 'Industrial', 'Habilitación',
];
export const SERVICIOS: readonly { slug: string; nombre: string }[] = [
    { slug: 'construccion', nombre: 'Construcción' },
    { slug: 'montaje-industrial', nombre: 'Montaje industrial' },
    { slug: 'electricidad', nombre: 'Electricidad' },
];
export const SLUGS_SERVICIO: readonly string[] = SERVICIOS.map(s => s.slug);
export const REFERENCIAS: readonly string[] = [
    'rendersEjemplo/escobar-williams-195', 'rendersEjemplo/conferencia-622', 'rendersEjemplo/gorbea-3082',
    'rendersEjemplo/domeyko-2432', 'rendersEjemplo/maipu-40', 'rendersContratados/0', 'rendersContratados/1',
    'rendersContratados/2', 'fotosObrasEjemplo/abate-molina-676', 'fotosObrasEjemplo/abate-molina-80',
    'fotosObrasEjemplo/san-alfonso-607', 'fotosObrasEjemplo/abate-molina-321',
];
export const LARGOS = {
    slug: 80, nombre: 160, titular: 240, mandante: 160, comuna: 80, direccion: 200, inicio: 40,
    desafio: 1200, solucion: 1200, resultado: 1200, alt: 200,
} as const;
export const ALT_MIN = 5;
export const ANIO_MIN = 1995;
export const ANIO_MAX = 2100;
export const MIN_ANCHO_FOTO = 800;
export const MAX_BYTES_FOTO = 10 * 1024 * 1024;

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_RESERVADOS: readonly string[] = ['ejemplo'];
export const SLUG_PATRONES_RESERVADOS: readonly RegExp[] = [
    /^(en-construccion|terminados|han-confiado|contratados|en-obra-ahora|pr-ximos-proyectos)-\d+$/,
    /^muestra(-|$)/,
];

/* ──────────────────────── textos ──────────────────────── */

/** Lo que sale al JSON: recortado ('' → null). */
export const recorte = (v: unknown): string | null => {
    if (v === undefined || v === null) return null;
    return String(v).trim() || null;
};

const enteroONull = (v: unknown): number | null => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
};

/** CSV o lista de servicios → lista, sin vacíos ni repetidos, en el orden dado. */
export const listaServicios = (v: unknown): string[] => {
    const lista = Array.isArray(v) ? v : String(v ?? '').split(',');
    return [...new Set(lista.map(s => String(s).trim()).filter(Boolean))];
};

/* ──────────────────────── slug ──────────────────────── */

/** Nombre → dirección web del sitio: 'Av. España 778' → 'av-espana-778'. Corta en un guion si pasa de 80. */
export function slugDesde(nombre: unknown): string {
    const base = String(nombre ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (base.length <= LARGOS.slug) return base;
    const corto = base.slice(0, LARGOS.slug);
    const corte = corto.lastIndexOf('-');
    return (corte > 0 ? corto.slice(0, corte) : corto).replace(/-+$/, '');
}

export const slugReservado = (slug: string): boolean => SLUG_RESERVADOS.includes(slug) || SLUG_PATRONES_RESERVADOS.some(re => re.test(slug));
export const slugValido = (slug: unknown): boolean =>
    typeof slug === 'string' && slug.length <= LARGOS.slug && SLUG_RE.test(slug) && !slugReservado(slug);

/* ──────────────────────── faltantes y estado (espejo del backend) ──────────────────────── */

/** Lo que `faltantes` necesita de una obra (fila de la BD, detalle o formulario ya normalizado). */
export interface ObraReglas {
    nombre?: unknown;
    slug?: unknown;
    estado?: unknown;
    comuna?: unknown;
    tipo?: unknown;
    servicios?: unknown;
    superficie_m2?: unknown;
    anio?: unknown;
    referencia?: unknown;
}

/** La portada vigente, o null. `heredada_src` solo lo conoce el backend (la pantalla no lo recibe). */
export interface FotoReglas { alt?: string | null; heredada_src?: string | null }

/**
 * Lo que le falta a la obra para que el build de lols.cl la acepte: [{ campo, mensaje }]. Solo las reglas del esquema
 * real (content.config.ts); `titular`, `tipo` y la superficie son opcionales. `porAprobar` = fotos subidas que esperan
 * aprobación (cambia el texto de la portada).
 */
export function faltantes(o: ObraReglas, foto: FotoReglas | null = null, { porAprobar = 0 }: { porAprobar?: number } = {}): Faltante[] {
    const f: Faltante[] = [];
    const falta = (campo: string, mensaje: string) => f.push({ campo, mensaje });
    const estado = o.estado as EstadoObra;
    if (!recorte(o.nombre)) falta('nombre', 'Falta el nombre de la obra.');
    if (!slugValido(o.slug)) falta('slug', 'La dirección web de la obra no es válida o está reservada.');
    if (!ESTADOS.includes(estado)) falta('estado', 'Falta el estado de la obra.');
    if (!recorte(o.comuna)) falta('comuna', 'Falta la comuna.');
    const tipo = recorte(o.tipo);
    if (tipo && !TIPOS.includes(tipo)) falta('tipo', `El tipo «${tipo}» ya no existe en el sitio: elige otro.`);
    const servicios = listaServicios(o.servicios);
    if (!servicios.length) falta('servicios', 'Marca al menos un servicio.');
    else if (servicios.some(s => !SLUGS_SERVICIO.includes(s))) falta('servicios', 'Hay un servicio que ya no existe en el sitio: vuelve a marcarlos.');
    const superficie = o.superficie_m2;
    if (superficie !== null && superficie !== undefined && !((enteroONull(superficie) ?? 0) >= 1)) {
        falta('superficie_m2', 'La superficie tiene que ser un número entero de m².');
    }
    const anio = enteroONull(o.anio);
    if (estado === 'terminado' && (anio === null || anio < ANIO_MIN || anio > ANIO_MAX)) {
        falta('anio', 'Una obra terminada necesita el año de término.');
    }
    const referencia = recorte(o.referencia);
    if (!foto && referencia && !REFERENCIAS.includes(referencia)) {
        falta('portada', 'La imagen referencial que tenía la obra ya no existe en el sitio: sube una foto propia.');
    } else if (!foto && !referencia && estado !== 'contratado' && ESTADOS.includes(estado)) {
        const cual = estado === 'terminado' ? 'terminada' : 'en construcción';
        falta('portada', porAprobar
            ? 'La foto de portada espera aprobación: sin ella, la obra no puede salir al sitio.'
            : `Una obra ${cual} necesita una foto de portada aprobada.`);
    }
    if (foto) {
        const alt = recorte(foto.alt);
        if (!alt || alt.length < ALT_MIN) falta('portada', `La foto de portada necesita una descripción de al menos ${ALT_MIN} letras.`);
        if (foto.heredada_src && !String(foto.heredada_src).startsWith(`/proyectos/${String(o.slug)}/`)) {
            falta('portada', 'La foto heredada del sitio no es de la carpeta de esta obra: sube una portada nueva.');
        }
    }
    return f;
}

/** La última publicación OK, como la resume el backend para el estado de cada obra. */
export interface PublicacionReglas { obras: Record<string, string>; build_estado: string | null; en_linea: boolean }

/**
 * Cómo va la obra (plan 4.7): borrador · listo · cambios · incompleta · publicando · publicada · no_llego ·
 * retiro_pendiente. `hashActual` = sha256 del JSON que se publicaría hoy (null si le falta algo); `pub` = la última
 * publicación OK. Publicada y ahora con faltantes = `incompleta` (el sitio mantiene lo publicado), salvo que su portada
 * publicada esté rechazada (`rechazadaPublicada`): la próxima publicación la retira. «En línea» manda sobre «falló».
 */
export function estadoDerivado(
    { obra, faltantes: f = [], hashActual = null, rechazadaPublicada = false }: {
        obra: { id: number | string; incluir: unknown; publicado_hash?: string | null };
        faltantes?: Faltante[];
        hashActual?: string | null;
        rechazadaPublicada?: boolean;
    },
    pub: PublicacionReglas | null = null,
): EstadoDerivado {
    const publicada = !!obra.publicado_hash;
    if (!obra.incluir) return publicada ? 'retiro_pendiente' : 'borrador';
    if (!publicada) return f.length ? 'borrador' : 'listo';
    if (f.length) return rechazadaPublicada ? 'retiro_pendiente' : 'incompleta';
    if (!hashActual || hashActual !== obra.publicado_hash) return 'cambios';
    const llevo = !!pub && !!pub.obras && pub.obras[String(obra.id)] === obra.publicado_hash;
    if (!llevo || pub!.en_linea) return 'publicada';
    return pub!.build_estado === 'fallo' ? 'no_llego' : 'publicando';
}

/* ──────────────────────── lista: grupos, orden y filtros ──────────────────────── */

export interface GrupoEstado<T> { estado: EstadoObra; etiqueta: string; obras: T[] }

/** Las obras por estado, en el orden del sitio (lo que pasa ahora primero) y dentro por `orden`, nombre e id. */
export function agruparPorEstado<T extends Pick<ObraSitioLista, 'id' | 'estado' | 'orden' | 'nombre'>>(obras: readonly T[]): GrupoEstado<T>[] {
    return ESTADOS.map(estado => ({
        estado,
        etiqueta: ETIQUETA_ESTADO[estado],
        obras: obras.filter(o => o.estado === estado)
            .sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre, 'es') || (a.id - b.id)),
    })).filter(g => g.obras.length > 0);
}

/** Sube (delta -1) o baja (+1) una obra dentro de su lista. null si ya está en el borde o no está. */
export function mover(ids: readonly number[], id: number, delta: -1 | 1): number[] | null {
    const i = ids.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return null;
    const nuevo = [...ids];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    return nuevo;
}

export type FiltroObras = 'todas' | 'pendientes' | 'faltan' | 'fuera';

/**
 * Lo que espera a quien publica: fotos por aprobar o algo que la próxima publicación cambia (= el número del menú).
 * Una `incompleta` no: publicar no la cambia (sale en «Les faltan datos»).
 */
export const esPendiente = (o: Pick<ObraSitioLista, 'fotos_por_aprobar' | 'estadoDerivado'>): boolean =>
    o.fotos_por_aprobar > 0 || ['listo', 'cambios', 'retiro_pendiente'].includes(o.estadoDerivado);

export const CUMPLE_FILTRO: Record<FiltroObras, (o: ObraSitioLista) => boolean> = {
    todas: () => true,
    pendientes: esPendiente,
    faltan: o => o.faltantes.length > 0,
    fuera: o => !o.incluir,
};

/** Minúsculas y sin tildes, para buscar «españa» con «espana». */
export const normalizar = (s: unknown): string => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Filtro + búsqueda por nombre, comuna o dirección web (todas las palabras, en cualquier orden). */
export function filtrarObras(obras: readonly ObraSitioLista[], filtro: FiltroObras, texto: string): ObraSitioLista[] {
    const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
    return obras.filter(o => {
        if (!CUMPLE_FILTRO[filtro](o)) return false;
        if (!palabras.length) return true;
        const donde = normalizar(`${o.nombre} ${o.comuna ?? ''} ${o.slug}`);
        return palabras.every(p => donde.includes(p));
    });
}

export function contarFiltros(obras: readonly ObraSitioLista[]): Record<FiltroObras, number> {
    return {
        todas: obras.length,
        pendientes: obras.filter(CUMPLE_FILTRO.pendientes).length,
        faltan: obras.filter(CUMPLE_FILTRO.faltan).length,
        fuera: obras.filter(CUMPLE_FILTRO.fuera).length,
    };
}

/* ──────────────────────── avisos de la portada ──────────────────────── */

export interface AvisoPantalla { tono: 'aviso' | 'peligro' | 'neutro'; texto: string }

/** Por qué este entorno solo simula (GET /config → motivo). */
export const TEXTO_MOTIVO: Record<string, string> = {
    modo_simulacion: 'Este entorno está configurado para simular.',
    sin_token: 'Este entorno no tiene el permiso de GitHub para publicar.',
    sin_rama: 'Falta configurar la rama del sitio.',
    repo_invalido: 'El repositorio del sitio está mal configurado.',
    entorno_no_produccion: 'Es un entorno de prueba: nunca publica en el sitio real.',
    repo_publico_no_permitido: 'Este servidor no está autorizado para publicar en el sitio real.',
};

/** El permiso de GitHub para publicar vence cada 90 días: aviso desde 30 días antes (o si no se sabe cuándo vence). */
export function avisoToken(cfg: Pick<ConfigSitio, 'modo' | 'tokenVenceEnDias'>): AvisoPantalla | null {
    const d = cfg.tokenVenceEnDias;
    if (d === null || d === undefined) {
        return cfg.modo === 'publicar'
            ? { tono: 'aviso', texto: 'No se sabe cuándo vence el permiso de la Bóveda para publicar en lols.cl. Avisa a Mauricio para que lo anote.' }
            : null;
    }
    if (d < 0) return { tono: 'peligro', texto: `El permiso de la Bóveda para publicar en lols.cl venció hace ${-d} día${d === -1 ? '' : 's'}: no se puede publicar hasta que Mauricio lo renueve.` };
    if (d === 0) return { tono: 'peligro', texto: 'El permiso de la Bóveda para publicar en lols.cl vence hoy: avisa a Mauricio para que lo renueve.' };
    if (d <= 30) return { tono: 'aviso', texto: `El permiso de la Bóveda para publicar en lols.cl vence en ${d} día${d === 1 ? '' : 's'}: avisa a Mauricio para que lo renueve.` };
    return null;
}

/**
 * La última publicación que terminó (sin contar importaciones): si falló o la compilación del sitio falló (y el sitio
 * igual no la muestra: una corrida repetida o un push posterior pudo llevarla), el aviso rojo de la portada. Misma
 * regla que `pendientes()` del backend, pero con la lista que ve cualquiera con `ver`.
 */
export function ultimaConProblema(publicaciones: readonly PublicacionSitio[]): PublicacionSitio | null {
    const u = [...publicaciones].sort((a, b) => b.id - a.id).find(p => ['ok', 'error'].includes(p.estado) && p.modo !== 'importacion');
    if (!u) return null;
    return u.estado === 'error' || (u.build_estado === 'fallo' && !u.en_linea_at) ? u : null;
}

/* ──────────────────────── formulario ──────────────────────── */

/** Lo que se edita de una obra, como texto de los campos (los números también: un campo vacío es ''). */
export interface FormObra {
    nombre: string;
    slug: string;
    obra_id: number | null;
    estado: EstadoObra;
    titular: string;
    tipo: string;
    mandante: string;
    mandante_autoriza: boolean;
    comuna: string;
    direccion: string;
    superficie_m2: string;
    anio: string;
    inicio: string;
    servicios: string[];
    desafio: string;
    solucion: string;
    resultado: string;
}

export const formVacio = (): FormObra => ({
    nombre: '', slug: '', obra_id: null, estado: 'en_construccion', titular: '', tipo: '', mandante: '', mandante_autoriza: false,
    comuna: '', direccion: '', superficie_m2: '', anio: '', inicio: '', servicios: ['construccion'], desafio: '', solucion: '', resultado: '',
});

export const formDesdeObra = (o: ObraSitio): FormObra => ({
    nombre: o.nombre ?? '',
    slug: o.slug ?? '',
    obra_id: o.obra_id ?? null,
    estado: o.estado,
    titular: o.titular ?? '',
    tipo: o.tipo ?? '',
    mandante: o.mandante ?? '',
    mandante_autoriza: !!o.mandante_autoriza,
    comuna: o.comuna ?? '',
    direccion: o.direccion ?? '',
    superficie_m2: o.superficie_m2 === null || o.superficie_m2 === undefined ? '' : String(o.superficie_m2),
    anio: o.anio === null || o.anio === undefined ? '' : String(o.anio),
    inicio: o.inicio ?? '',
    servicios: listaServicios(o.servicios),
    desafio: o.desafio ?? '',
    solucion: o.solucion ?? '',
    resultado: o.resultado ?? '',
});

export const formIguales = (a: FormObra, b: FormObra): boolean => JSON.stringify(a) === JSON.stringify(b);

/** '6800' → 6800; '' → null; '6.800' (punto de miles) → 6800; lo que no es entero → NaN (lo marca `erroresForm`). */
export function numeroDeCampo(v: string): number | null {
    const s = String(v ?? '').trim().replace(/\.(?=\d{3}(\D|$))/g, '');
    if (!s) return null;
    return /^\d+$/.test(s) ? Number(s) : NaN;
}

/** Errores que impiden guardar (no los faltantes para publicar: esos se guardan igual). Clave = campo. */
export function erroresForm(f: FormObra, { nueva = false }: { nueva?: boolean } = {}): Partial<Record<keyof FormObra, string>> {
    const e: Partial<Record<keyof FormObra, string>> = {};
    if (!f.nombre.trim()) e.nombre = 'Escribe el nombre de la obra.';
    const slug = f.slug.trim();
    if (slug && (!SLUG_RE.test(slug) || slug.length > LARGOS.slug)) e.slug = 'Solo minúsculas, números y guiones (sin espacios ni tildes).';
    else if (slug && slugReservado(slug)) e.slug = `«${slug}» está reservada por el sitio: elige otra.`;
    else if (nueva && !slug && !slugDesde(f.nombre)) e.slug = 'No se pudo armar desde el nombre: escríbela.';
    const m2 = numeroDeCampo(f.superficie_m2);
    if (m2 !== null && (Number.isNaN(m2) || m2 < 1 || m2 > 10000000)) e.superficie_m2 = 'Un número entero de m², sin decimales.';
    const anio = numeroDeCampo(f.anio);
    if (anio !== null && (Number.isNaN(anio) || anio < ANIO_MIN || anio > ANIO_MAX)) e.anio = `Un año entre ${ANIO_MIN} y ${ANIO_MAX}.`;
    return e;
}

const textoONull = (v: string): string | null => v.trim() || null;

/**
 * El cuerpo de POST /obras o PUT /obras/:id. '' → null (borrar el dato). En una obra nueva sin dirección web, el
 * servidor la arma del nombre. Con la dirección congelada (ya publicada) no se manda.
 */
export function cuerpoDesdeForm(f: FormObra, { nueva = false, slugCongelado = false }: { nueva?: boolean; slugCongelado?: boolean } = {}): Record<string, unknown> {
    const m2 = numeroDeCampo(f.superficie_m2);
    const anio = numeroDeCampo(f.anio);
    const cuerpo: Record<string, unknown> = {
        nombre: f.nombre.trim(),
        estado: f.estado,
        titular: textoONull(f.titular),
        tipo: f.tipo || null,
        mandante: textoONull(f.mandante),
        mandante_autoriza: f.mandante_autoriza && !!f.mandante.trim(),
        comuna: textoONull(f.comuna),
        direccion: textoONull(f.direccion),
        superficie_m2: m2 === null || Number.isNaN(m2) ? null : m2,
        // El año es solo de las terminadas (el sitio no lo acepta en otro estado).
        anio: f.estado === 'terminado' && anio !== null && !Number.isNaN(anio) ? anio : null,
        inicio: textoONull(f.inicio),
        servicios: listaServicios(f.servicios),
        desafio: textoONull(f.desafio),
        solucion: textoONull(f.solucion),
        resultado: textoONull(f.resultado),
    };
    const slug = f.slug.trim();
    if (!slugCongelado && (slug || !nueva)) cuerpo.slug = slug || null;
    if (!nueva || f.obra_id !== null) cuerpo.obra_id = f.obra_id;
    return cuerpo;
}

/**
 * Para PUT: solo lo que cambió respecto de lo cargado. Así un guardado no reescribe un campo que nadie tocó (el
 * servidor limpia espacios dobles y saltos de línea en los textos de una línea: reenviar uno importado tal cual
 * cambiaría el JSON publicado sin que nadie lo pidiera).
 */
export function soloCambios(nuevo: Record<string, unknown>, base: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(nuevo).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])));
}

/** La obra del formulario como la vería `faltantes` (lo que se guardaría). */
export function obraParaReglas(f: FormObra, referencia: string | null = null): ObraReglas {
    const m2 = numeroDeCampo(f.superficie_m2);
    return {
        nombre: f.nombre,
        slug: f.slug.trim() || slugDesde(f.nombre),
        estado: f.estado,
        comuna: f.comuna,
        tipo: f.tipo || null,
        servicios: f.servicios,
        superficie_m2: m2 === null ? null : Number.isNaN(m2) ? f.superficie_m2 : m2,
        anio: f.estado === 'terminado' ? numeroDeCampo(f.anio) : null,
        referencia,
    };
}

/**
 * La autorización para publicar el mandante es para ESE nombre (backend: cambiar el mandante la anula y, si ya estaba
 * autorizado, marcarla en el mismo guardado no cuenta). Si el nombre cambió respecto de lo guardado y estaba
 * autorizado, la casilla queda apagada hasta guardar el nombre nuevo.
 */
export function autorizacionBloqueada(guardado: { mandante: string | null; mandante_autoriza: boolean } | null, mandanteNuevo: string): boolean {
    if (!guardado || !guardado.mandante_autoriza) return false;
    const limpio = (s: string | null) => (s ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim() || null;
    return limpio(mandanteNuevo) !== limpio(guardado.mandante);
}

/* ──────────────────────── vista previa (aproximada, como FichaObra.astro de lols.cl) ──────────────────────── */

/** '6800' → '6.800 m²' (es-CL, como `formatoSuperficie` del sitio). */
export const formatoSuperficie = (m2: number): string => `${String(Math.trunc(m2)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')} m²`;

export interface FichaVista {
    nombre: string;
    titular: string | null;
    /** [rótulo, dato] en el orden de la ficha; lo que no hay no va (en el sitio, su fila desaparece). */
    datos: [string, string][];
    relato: [string, string][];
    estado: string;
}

/**
 * La ficha como la arma el sitio (FichaObra.astro): solo lo que se publicaría. Mandante solo autorizado; año en las
 * terminadas, inicio en las demás («Inicio previsto» si está en proyecto); un campo vacío no tiene fila.
 */
export function fichaDesdeForm(f: FormObra): FichaVista {
    const t = (v: string) => v.trim() || null;
    const m2 = numeroDeCampo(f.superficie_m2);
    const datos: [string, string | null][] = [
        ['Tipo de obra', f.tipo || null],
        ['Mandante', f.mandante_autoriza ? t(f.mandante) : null],
        ['Comuna', t(f.comuna)],
        ['Dirección', t(f.direccion)],
        ['Superficie construida', m2 !== null && !Number.isNaN(m2) && m2 >= 1 ? formatoSuperficie(m2) : null],
        f.estado === 'terminado'
            ? ['Año de término', t(f.anio)]
            : [f.estado === 'contratado' ? 'Inicio previsto' : 'Inicio', t(f.inicio)],
    ];
    const servicios = listaServicios(f.servicios).map(s => SERVICIOS.find(x => x.slug === s)?.nombre ?? s);
    if (servicios.length) datos.push(['Servicios', servicios.join(', ')]);
    const relato: [string, string | null][] = [['Desafío', t(f.desafio)], ['Solución', t(f.solucion)], ['Resultado', t(f.resultado)]];
    return {
        nombre: f.nombre.trim(),
        titular: t(f.titular),
        datos: datos.filter((d): d is [string, string] => !!d[1]),
        relato: relato.filter((r): r is [string, string] => !!r[1]),
        estado: ETIQUETA_ESTADO[f.estado],
    };
}

/** Número del menú (badge ámbar): fotos por aprobar + obras que la próxima publicación cambia. */
export const totalPendientes = (p: { fotosPorAprobar?: number; obrasConCambios?: number } | null | undefined): number =>
    (Number(p?.fotosPorAprobar) || 0) + (Number(p?.obrasConCambios) || 0);

/** La dirección de la obra en el sitio (sin barra doble). */
export const urlObraEnSitio = (urlSitio: string, slug: string): string => `${String(urlSitio || '').replace(/\/+$/, '')}/proyectos/${slug}/`;

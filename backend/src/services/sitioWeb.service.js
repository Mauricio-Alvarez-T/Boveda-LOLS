const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const logger = require('../utils/logger-structured');
const { hoyChile } = require('../utils/fechaChile');
const cfg = require('../config/sitioWeb.config');
const guarda = require('./sitioWebGuarda');

/**
 * Sitio web (mig 147, docs/reglas/sitio-web.md): las obras de lols.cl se editan en la Bóveda y se publican
 * con un commit en el repo PÚBLICO del sitio. Este service tiene el CRUD de las obras, su orden, la regla de
 * «incluir», la concurrencia, el historial y las funciones PURAS del contrato:
 *
 *   serializarObra → el JSON exacto de src/content/obras/<slug>.json (lista blanca: nada interno sale)
 *   faltantes      → lo que le falta a una obra para pasar el esquema de lols.cl (src/content.config.ts)
 *   estadoDerivado → borrador · listo · publicando · publicada · no_llego · cambios · retiro_pendiente
 *
 * El contrato que manda es el de lols.cl (docs/contenido-obras.md de ese repo), no la tabla 3.2 del plan:
 * `titular`, `tipo` y `superficieM2` pueden ser null; `comuna` es obligatoria; `anio` va solo en obras
 * terminadas; `referencia` solo sin fotos; no existen `rol`, `plazo`, `cifra` ni `video`. El JSON se escribe
 * con 2 espacios, el orden de claves de los archivos actuales y \n final (`textoJson`): importar las obras
 * del sitio y volver a publicarlas sin cambios no produce ninguna diferencia.
 *
 * `updated_at` es la versión de lo EDITADO (PUT /obras/:id compara y responde 409 si otro guardó antes). Lo
 * que no es una edición del contenido (incluir, orden, aprobar una portada, publicar) escribe
 * `updated_at = updated_at` para no invalidar el formulario que alguien tenga abierto.
 */

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

const err = (statusCode, message, extra = {}) => Object.assign(new Error(message), { statusCode, ...extra });
const sinTablas = e => !!e && (e.code === 'ER_NO_SUCH_TABLE' || e.errno === 1146);
const errSinMigrar = () => err(409,
    'El módulo Sitio web todavía no está instalado en esta base (falta la migración 147). Avisa a Mauricio.',
    { code: 'SITIO_WEB_SIN_MIGRAR' });

/* ──────────────────────── textos ──────────────────────── */

/**
 * Lo que sale al JSON: solo recortado ('' → null). Fiel a lo guardado, para que una obra importada del sitio
 * vuelva a salir byte a byte igual; la limpieza de lo que escribe la gente la hacen `linea` y `parrafo`.
 */
const recorte = (v) => {
    if (v === undefined || v === null) return null;
    return String(v).trim() || null;
};
/** Texto de una línea escrito en el formulario: recortado, sin saltos ni tabs ni espacios dobles; '' → null. */
const linea = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).replace(/[\r\n\t]+/g, ' ').replace(/ {2,}/g, ' ').trim();
    return s || null;
};
/** Texto largo (desafío, solución, resultado): recortado, saltos normalizados a \n; '' → null. */
const parrafo = (v) => {
    if (v === undefined || v === null) return null;
    const s = String(v).replace(/\r\n?/g, '\n').trim();
    return s || null;
};
const CAMPOS_LINEA = ['titular', 'mandante', 'comuna', 'direccion', 'inicio'];
const CAMPOS_PARRAFO = ['desafio', 'solucion', 'resultado'];

/** CSV de servicios → lista, sin vacíos ni repetidos, en el orden guardado. */
const listaServicios = (v) => {
    const lista = Array.isArray(v) ? v : String(v || '').split(',');
    return [...new Set(lista.map(s => String(s).trim()).filter(Boolean))];
};

const enteroONull = (v) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CONECTORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);

/** 'BASCUÑAN 661' (así se nombran las obras en la Bóveda) → 'Bascuñan 661'. Lo que ya viene con minúsculas, tal cual. */
function nombreLegible(nombre) {
    const s = linea(nombre);
    if (!s || /\p{Ll}/u.test(s)) return s;
    return s.toLowerCase().split(' ').map((w, i) => (i > 0 && CONECTORES.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

/* ──────────────────────── slug ──────────────────────── */

/** Nombre → slug del sitio: 'Av. España 778' → 'av-espana-778'. Corta en un guion si pasa de 80. */
function slugDesde(nombre) {
    const base = String(nombre || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (base.length <= cfg.LARGOS.slug) return base;
    const corto = base.slice(0, cfg.LARGOS.slug);
    const corte = corto.lastIndexOf('-');
    return (corte > 0 ? corto.slice(0, corte) : corto).replace(/-+$/, '');
}

const slugReservado = (slug) => cfg.SLUG_RESERVADOS.includes(slug) || cfg.SLUG_PATRONES_RESERVADOS.some(re => re.test(slug));
const slugValido = (slug) => typeof slug === 'string' && slug.length <= cfg.LARGOS.slug && cfg.SLUG_RE.test(slug) && !slugReservado(slug);
/** El slug es el nombre del archivo y la URL pública: después de la primera publicación ya no se cambia. */
const slugCongelado = (o) => !!(o && (o.publicado_hash || o.publicado_at));

/* ──────────────────────── fotos (puras) ──────────────────────── */

const ALT_OK = (alt) => !!recorte(alt) && recorte(alt).length >= cfg.ALT_MIN;

/**
 * ¿La foto puede salir al sitio? Las dos llaves atadas a los bytes (plan 4.6): confirmación «no se reconoce a
 * nadie» y aprobación del MISMO hash, sin rechazo, y la confirmación no cambió después de aprobar.
 */
function fotoPublicable(f) {
    if (!f || f.rechazada_at || !f.aprobada_at || !f.hash || f.aprobada_hash !== f.hash) return false;
    if (!f.sin_personas_confirmado || !f.confirmado_at) return false;
    return new Date(f.confirmado_at).getTime() <= new Date(f.aprobada_at).getTime();
}

/** La portada que sale al sitio: la publicable aprobada más recientemente (null si no hay). */
function fotoVigente(fotos) {
    const ok = (fotos || []).filter(f => (f.rol || 'portada') === 'portada' && fotoPublicable(f));
    ok.sort((a, b) => (new Date(b.aprobada_at) - new Date(a.aprobada_at)) || (Number(b.id) - Number(a.id)));
    return ok[0] || null;
}

/** Pendiente = subida, sin aprobar ni rechazar. */
const fotoPorAprobar = (f) => !f.rechazada_at && !(f.aprobada_at && f.aprobada_hash === f.hash);

/** Cómo va una foto, para la pantalla. */
function estadoFoto(f, vigenteId) {
    if (f.rechazada_at) return 'rechazada';
    if (f.id === vigenteId) return 'vigente';
    if (fotoPublicable(f)) return 'aprobada';
    if (!f.sin_personas_confirmado) return 'sin_confirmar';
    return 'por_aprobar';
}

/**
 * La foto tal como va en el JSON. Las de la Bóveda: portada.<hash8>-1600.webp con su srcset (800 y 1600) y
 * las medidas de la de 1600. Las heredadas del sitio (importación, 1.jpg): solo { src, alt }, como están hoy.
 */
function fotoDelSitio(slug, f) {
    const alt = recorte(f.alt);
    if (f.heredada_src) return { src: f.heredada_src, alt };
    const base = `/proyectos/${slug}/portada.${String(f.hash).slice(0, 8)}`;
    const src = `${base}-1600.webp`;
    const ancho = Number(f.ancho);
    const foto = { src, alt };
    // Con 800 px justos la de «1600» mide lo mismo que la de 800: dos anchos iguales en un srcset no valen.
    if (ancho > 800) foto.srcset = `${base}-800.webp 800w, ${src} ${ancho}w`;
    foto.width = ancho;
    foto.height = Number(f.alto);
    return foto;
}

/* ──────────────────────── contrato (puras) ──────────────────────── */

/**
 * El JSON de la obra para lols.cl. LISTA BLANCA y en el orden de los archivos del sitio: nunca sale obra_id,
 * ids, usuarios, fechas de auditoría ni nada interno. El mandante solo con su autorización registrada.
 * `foto` = la portada vigente (fotoVigente) o null.
 */
function serializarObra(o, foto = null) {
    const fotos = foto ? [fotoDelSitio(o.slug, foto)] : [];
    const superficie = enteroONull(o.superficie_m2);
    const anio = enteroONull(o.anio);
    const json = {
        slug: o.slug,
        orden: Math.max(0, Math.trunc(Number(o.orden) || 0)),
        estado: cfg.ESTADO_SITIO[o.estado] || null,
        nombre: recorte(o.nombre),
        titular: recorte(o.titular),
        tipo: recorte(o.tipo),
        mandante: o.mandante_autoriza ? recorte(o.mandante) : null,
        comuna: recorte(o.comuna),
        direccion: recorte(o.direccion),
        superficieM2: superficie !== null && superficie >= 1 ? superficie : null,
        anio: o.estado === 'terminado' ? anio : null,
        inicio: recorte(o.inicio),
        servicios: listaServicios(o.servicios),
        desafio: recorte(o.desafio),
        solucion: recorte(o.solucion),
        resultado: recorte(o.resultado),
        fotos,
    };
    // `referencia` solo existe sin foto propia; null y la ausencia valen lo mismo y así están los archivos de hoy.
    const referencia = recorte(o.referencia);
    if (!fotos.length && referencia) json.referencia = referencia;
    return json;
}

/** El texto exacto del archivo: 2 espacios y \n final (UTF-8 sin BOM). */
const textoJson = (obj) => `${JSON.stringify(obj, null, 2)}\n`;
const hashTexto = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

/** Rutas del repo que lleva una obra serializada: su JSON y los archivos de sus fotos (src y srcset). */
function rutasDeJson(json) {
    const rutas = [`src/content/obras/${json.slug}.json`];
    for (const f of json.fotos || []) {
        const urls = [f.src, ...(f.srcset ? f.srcset.split(',').map(c => c.trim().split(/\s+/)[0]) : [])];
        for (const u of urls) if (!rutas.includes(`public${u}`)) rutas.push(`public${u}`);
    }
    return rutas;
}

/**
 * Lo que le falta a la obra para que el build de lols.cl la acepte: [{ campo, mensaje }]. Solo las reglas del
 * esquema real (content.config.ts); `titular`, `tipo` y la superficie son opcionales en el sitio.
 * `porAprobar` = fotos subidas que esperan aprobación (cambia el texto de la portada).
 */
function faltantes(o, foto = null, { porAprobar = 0 } = {}) {
    const f = [];
    const falta = (campo, mensaje) => f.push({ campo, mensaje });
    if (!recorte(o.nombre)) falta('nombre', 'Falta el nombre de la obra.');
    if (!slugValido(o.slug)) falta('slug', 'La dirección web de la obra no es válida o está reservada.');
    if (!cfg.ESTADOS.includes(o.estado)) falta('estado', 'Falta el estado de la obra.');
    if (!recorte(o.comuna)) falta('comuna', 'Falta la comuna.');
    if (recorte(o.tipo) && !cfg.TIPOS.includes(recorte(o.tipo))) falta('tipo', `El tipo «${recorte(o.tipo)}» ya no existe en el sitio: elige otro.`);
    const servicios = listaServicios(o.servicios);
    if (!servicios.length) falta('servicios', 'Marca al menos un servicio.');
    else if (servicios.some(s => !cfg.SLUGS_SERVICIO.includes(s))) falta('servicios', 'Hay un servicio que ya no existe en el sitio: vuelve a marcarlos.');
    const superficie = o.superficie_m2;
    if (superficie !== null && superficie !== undefined && !(enteroONull(superficie) >= 1)) falta('superficie_m2', 'La superficie tiene que ser un número entero de m².');
    const anio = enteroONull(o.anio);
    if (o.estado === 'terminado' && (anio === null || anio < cfg.ANIO_MIN || anio > cfg.ANIO_MAX)) {
        falta('anio', 'Una obra terminada necesita el año de término.');
    }
    const referencia = recorte(o.referencia);
    if (!foto && referencia && !cfg.REFERENCIAS.includes(referencia)) {
        falta('portada', 'La imagen referencial que tenía la obra ya no existe en el sitio: sube una foto propia.');
    } else if (!foto && !referencia && o.estado !== 'contratado' && cfg.ESTADOS.includes(o.estado)) {
        const cual = o.estado === 'terminado' ? 'terminada' : 'en construcción';
        falta('portada', porAprobar
            ? 'La foto de portada espera aprobación: sin ella, la obra no puede salir al sitio.'
            : `Una obra ${cual} necesita una foto de portada aprobada.`);
    }
    if (foto) {
        if (!ALT_OK(foto.alt)) falta('portada', `La foto de portada necesita una descripción de al menos ${cfg.ALT_MIN} letras.`);
        if (foto.heredada_src && !String(foto.heredada_src).startsWith(`/proyectos/${o.slug}/`)) {
            falta('portada', 'La foto heredada del sitio no es de la carpeta de esta obra: sube una portada nueva.');
        }
    }
    return f;
}

/** URLs de una foto del JSON del sitio (src y las del srcset). */
const urlsDeFoto = (f) => [f && f.src, ...(f && f.srcset ? String(f.srcset).split(',').map(c => c.trim().split(/\s+/)[0]) : [])].filter(u => typeof u === 'string' && u);

/** ¿El JSON del sitio `json` muestra la foto `f`? (portada de la Bóveda por su hash8, heredada por su src) */
function fotoNombradaEn(json, f) {
    const urls = ((json && json.fotos) || []).flatMap(urlsDeFoto);
    return f.heredada_src ? urls.includes(f.heredada_src) : urls.some(u => u.includes(`/portada.${String(f.hash).slice(0, 8)}-`));
}

/**
 * ¿La versión publicada `json` muestra una foto RECHAZADA? Las filas rechazadas no se borran nunca
 * (sitioWebFotos.borrarFoto): el rechazo sobrevive hasta que la foto sale del sitio, y después también.
 */
const fotoRechazadaEn = (json, fotos) => (fotos || []).some(f => f.rechazada_at && fotoNombradaEn(json, f));

/**
 * Estados de una obra en la pantalla (plan 4.7):
 *   borrador         no está incluida (o faltan datos y nunca se publicó)
 *   listo            incluida, completa, todavía no publicada
 *   cambios          publicada, pero lo de la Bóveda es distinto: los cambios salen en la próxima publicación
 *   incompleta       publicada, pero ahora le faltan datos: el sitio MANTIENE la versión publicada (publicar no la
 *                    cambia) hasta que se completen. No cuenta como pendiente (sale en «Les faltan datos»)
 *   publicando       el commit entró, el sitio todavía no la muestra
 *   publicada        el sitio muestra exactamente lo de la Bóveda
 *   no_llego         el build del sitio falló y el sitio no la muestra: «El sitio sigue mostrando la versión anterior»
 *   retiro_pendiente se quitó del sitio en la Bóveda (o su portada publicada fue rechazada y no hay otra, con
 *                    `rechazadaPublicada`); sale en la próxima publicación
 * `pub` = la última publicación OK: { obras: {sitio_obra_id: sha256}, build_estado, en_linea } o null. «En línea»
 * manda sobre una compilación fallida (una corrida repetida o una publicación posterior la llevó). Cuando una
 * publicación retira una obra, publicado_hash/json/at vuelven a null (la publicación lo hace).
 */
function estadoDerivado({ obra, faltantes: f = [], hashActual = null, rechazadaPublicada = false }, pub = null) {
    const publicada = !!obra.publicado_hash;
    if (!obra.incluir) return publicada ? 'retiro_pendiente' : 'borrador';
    if (!publicada) return f.length ? 'borrador' : 'listo';
    if (f.length) return rechazadaPublicada ? 'retiro_pendiente' : 'incompleta';
    if (!hashActual || hashActual !== obra.publicado_hash) return 'cambios';
    const llevo = !!pub && !!pub.obras && pub.obras[String(obra.id)] === obra.publicado_hash;
    if (!llevo || pub.en_linea) return 'publicada';
    return pub.build_estado === 'fallo' ? 'no_llego' : 'publicando';
}

/**
 * Inverso de serializarObra para la importación desde el sitio (plan 4.11): el JSON publicado → fila de
 * sitio_obras y su portada heredada (1.jpg tal cual). El mandante que ya está publicado queda autorizado.
 */
function desdeJsonDelSitio(j) {
    const obra = {
        slug: j.slug,
        orden: j.orden,
        estado: cfg.ESTADO_DESDE_SITIO[j.estado] || null,
        nombre: j.nombre,
        titular: j.titular ?? null,
        tipo: j.tipo ?? null,
        mandante: j.mandante ?? null,
        mandante_autoriza: j.mandante !== null && j.mandante !== undefined,
        comuna: j.comuna ?? null,
        direccion: j.direccion ?? null,
        superficie_m2: j.superficieM2 ?? null,
        anio: j.anio ?? null,
        inicio: j.inicio ?? null,
        servicios: (j.servicios || []).join(','),
        desafio: j.desafio ?? null,
        solucion: j.solucion ?? null,
        resultado: j.resultado ?? null,
        referencia: j.referencia ?? null,
    };
    const f = (j.fotos || [])[0];
    const foto = f ? { heredada_src: f.src, alt: f.alt } : null;
    return { obra, foto };
}

/* ──────────────────────── lectura del body ──────────────────────── */

/**
 * Normaliza lo que llega del formulario (ya pasó validateBody). `parcial` = edición: solo lo que vino.
 * Devuelve las columnas de sitio_obras a escribir.
 */
function leerObra(data, { parcial = false } = {}) {
    const o = {};
    const vino = (k) => data[k] !== undefined;
    if (!parcial || vino('nombre')) {
        o.nombre = linea(data.nombre);
        if (!o.nombre) throw err(400, 'El nombre de la obra no puede quedar vacío.', { code: 'SITIO_WEB_NOMBRE' });
    }
    if (vino('slug')) o.slug = linea(data.slug);
    if (vino('obra_id')) o.obra_id = data.obra_id === null ? null : Number(data.obra_id);
    for (const c of CAMPOS_LINEA) if (vino(c)) o[c] = linea(data[c]);
    for (const c of CAMPOS_PARRAFO) if (vino(c)) o[c] = parrafo(data[c]);
    if (vino('tipo')) o.tipo = linea(data.tipo);
    if (vino('mandante_autoriza')) o.mandante_autoriza = data.mandante_autoriza === true;
    if (vino('superficie_m2')) o.superficie_m2 = enteroONull(data.superficie_m2);
    if (vino('anio')) o.anio = enteroONull(data.anio);
    // validateBody deja pasar null en un campo opcional, pero no hay «sin estado» (columna NOT NULL): null = no se
    // cambia (al crear, el de siempre), como el slug vacío.
    if (vino('estado') && data.estado !== null) {
        if (!cfg.ESTADOS.includes(data.estado)) throw err(400, 'Elige el estado de la obra.', { code: 'SITIO_WEB_ESTADO' });
        o.estado = data.estado;
    }
    if (vino('servicios')) {
        const lista = data.servicios === null ? [] : data.servicios;
        if (!Array.isArray(lista) || lista.some(s => typeof s !== 'string')) {
            throw err(400, 'Los servicios tienen que ser una lista.', { code: 'SITIO_WEB_SERVICIO' });
        }
        const limpia = listaServicios(lista);
        const raro = limpia.find(s => !cfg.SLUGS_SERVICIO.includes(s));
        if (raro) throw err(400, `El servicio «${raro}» no existe en el sitio.`, { code: 'SITIO_WEB_SERVICIO' });
        o.servicios = limpia.join(',');
    }
    return o;
}

/* ──────────────────────── BD ──────────────────────── */

async function registrar(conn, { sitio_obra_id = null, entidad, entidad_id = null, accion, resumen, detalle = null, usuario_id = null }) {
    try {
        await (conn || db).query(
            `INSERT INTO sitio_web_historial (sitio_obra_id, entidad, entidad_id, accion, resumen, detalle, usuario_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [sitio_obra_id, entidad, entidad_id, accion, String(resumen).slice(0, 500), detalle ? JSON.stringify(detalle) : null, usuario_id]
        );
    } catch (e) {
        // El historial no puede tumbar una operación ya hecha, pero tiene que quedar a la vista en el log.
        logger.error('No se pudo registrar el historial del sitio web', { err: e.message, sitio_obra_id, entidad, entidad_id });
    }
}

/** Solo los campos que cambiaron, como { campo: [antes, después] } (DATE/DECIMAL de la BD normalizados). */
function diferencias(antes, despues, campos) {
    const d = {};
    for (const c of campos) {
        if (despues[c] === undefined) continue;
        const a = antes[c] === undefined ? null : antes[c];
        const b = despues[c];
        const iguales = (typeof b === 'number' || typeof b === 'boolean') && a !== null
            ? String(Number(a)) === String(Number(b))
            : String(a ?? '') === String(b ?? '');
        if (!iguales) d[c] = [a, b];
    }
    return d;
}

async function obraOFalla(id) {
    if (!Number.isInteger(id) || id < 1) throw err(404, 'Obra del sitio no encontrada');
    const [[o]] = await db.query('SELECT * FROM sitio_obras WHERE id = ?', [id]);
    if (!o) throw err(404, 'Obra del sitio no encontrada');
    return o;
}

/** Fotos de esas obras (sin nombres de usuario), agrupadas por obra. */
async function fotosPorObra(ids) {
    const mapa = new Map();
    if (!ids.length) return mapa;
    const [rows] = await db.query(
        `SELECT id, sitio_obra_id, rol, orden, alt, hash, ancho, alto, heredada_src, sin_personas_confirmado, confirmado_at,
                aprobada_at, aprobada_hash, rechazada_at, created_at
           FROM sitio_obra_fotos WHERE sitio_obra_id IN (?) ORDER BY created_at DESC, id DESC`, [ids]
    );
    for (const f of rows) {
        if (!mapa.has(f.sitio_obra_id)) mapa.set(f.sitio_obra_id, []);
        mapa.get(f.sitio_obra_id).push(f);
    }
    return mapa;
}

/** La última publicación OK, para el estado de cada obra (null si no hay o la tabla falta). */
async function contextoPublicacion() {
    const [[p]] = await db.query(
        `SELECT id, modo, obras_json, build_estado, en_linea_at, manifiesto
           FROM sitio_publicaciones WHERE estado = 'ok' ORDER BY id DESC LIMIT 1`
    );
    if (!p) return null;
    const leer = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
    return {
        id: p.id,
        obras: leer(p.obras_json) || {},
        manifiesto: leer(p.manifiesto) || {},
        build_estado: p.build_estado || null,
        // Lo importado del sitio ya estaba en línea (es lo que el sitio muestra).
        en_linea: !!p.en_linea_at || p.modo === 'importacion',
    };
}

/** Lo calculado de una obra: faltantes, JSON, hash y estado. */
function calcular(o, fotos, pub) {
    const vigente = fotoVigente(fotos);
    const porAprobar = fotos.filter(f => (f.rol || 'portada') === 'portada' && fotoPorAprobar(f)).length;
    const f = faltantes(o, vigente, { porAprobar });
    const json = f.length ? null : serializarObra(o, vigente);
    const hashActual = json ? hashTexto(textoJson(json)) : null;
    // Publicada, incompleta y con su portada publicada rechazada: la próxima publicación la saca del sitio.
    const rechazadaPublicada = !!f.length && !!o.publicado_json && fotoRechazadaEn(leerJson(o.publicado_json), fotos);
    return {
        vigente, porAprobar, faltantes: f, json, hashActual,
        estado: estadoDerivado({ obra: o, faltantes: f, hashActual, rechazadaPublicada }, pub),
    };
}

const exigirObrasVer = (permisos) => {
    if (!(permisos || []).includes('obras.ver')) {
        throw err(403, 'Para vincular una obra de la Bóveda necesitas «Ver obras».', { details: { required: ['obras.ver'] } });
    }
};

async function obraInternaOFalla(obraId) {
    const [[o]] = await db.query('SELECT id, nombre FROM obras WHERE id = ? AND es_prueba = 0', [obraId]);
    if (!o) throw err(400, 'La obra elegida no existe.', { code: 'SITIO_WEB_OBRA_INTERNA' });
    return o;
}

async function slugLibreOFalla(slug, idPropio = null) {
    if (!slug || !cfg.SLUG_RE.test(slug) || slug.length > cfg.LARGOS.slug) {
        throw err(400, 'La dirección web solo puede tener minúsculas, números y guiones (máx. 80).', { code: 'SITIO_WEB_SLUG' });
    }
    if (slugReservado(slug)) {
        throw err(409, `«${slug}» está reservada por el sitio: elige otra dirección web.`, { code: 'SITIO_WEB_SLUG_RESERVADO' });
    }
    const [[otra]] = await db.query('SELECT id FROM sitio_obras WHERE slug = ? AND id <> ?', [slug, idPropio || 0]);
    if (otra) throw err(409, `Ya hay una obra con la dirección web «${slug}»: elige otra.`, { code: 'SITIO_WEB_SLUG_OCUPADO' });
}

/** Un UNIQUE que saltó en carrera → el 409 que corresponde. */
function traducirDuplicado(e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
        if (/uk_sitio_obras_obra/.test(e.message)) return err(409, 'Esa obra de la Bóveda ya está vinculada a otra obra del sitio.', { code: 'SITIO_WEB_OBRA_YA_VINCULADA' });
        return err(409, 'Ya hay una obra con esa dirección web: elige otra.', { code: 'SITIO_WEB_SLUG_OCUPADO' });
    }
    return e;
}

const siguienteOrden = async (estado) => {
    const [[r]] = await db.query('SELECT COALESCE(MAX(orden), 0) AS m FROM sitio_obras WHERE estado = ?', [estado]);
    return (Number(r?.m) || 0) + 10;
};

const leerJson = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };

/** Una foto para la pantalla (sin ruta ni hash). `publicado` = el JSON que el sitio muestra hoy (o null). */
const fotoParaPantalla = (f, vigenteId, publicado = null) => ({
    id: f.id,
    rol: f.rol,
    alt: f.alt,
    ancho: f.ancho,
    alto: f.alto,
    tamano_bytes: f.tamano_bytes,
    heredada: !!f.heredada_src,
    estado: estadoFoto(f, vigenteId),
    vigente: f.id === vigenteId,
    publicada: !!publicado && fotoNombradaEn(publicado, f),
    publicable: fotoPublicable(f),
    sin_personas_confirmado: !!f.sin_personas_confirmado,
    confirmado_por_nombre: f.confirmado_por_nombre ?? null,
    confirmado_at: f.confirmado_at ?? null,
    subido_por: f.subido_por ?? null,
    subido_por_nombre: f.subido_por_nombre ?? null,
    aprobada_por_nombre: f.aprobada_por_nombre ?? null,
    aprobada_at: fotoPublicable(f) ? f.aprobada_at : null,
    rechazada_por_nombre: f.rechazada_por_nombre ?? null,
    rechazada_at: f.rechazada_at ?? null,
    created_at: f.created_at,
});

/* ──────────────────────── API ──────────────────────── */

const api = {
    /**
     * GET /config: modo efectivo, destino y catálogos. Nunca el token. Es lo primero que pide la pantalla: sin la
     * migración 147 responde 409 SITIO_WEB_SIN_MIGRAR (la pantalla muestra «todavía no está instalado»).
     */
    async config() {
        await db.query('SELECT id FROM sitio_obras LIMIT 1');
        const { modo, motivo } = guarda.explicarModo();
        return {
            modo,
            motivo,
            repo: guarda.repoSitio(),
            rama: guarda.ramaSitio(),
            urlSitio: guarda.urlSitio(process.env, cfg.URL_SITIO),
            tokenVenceEnDias: guarda.tokenVenceEnDias(process.env, hoyChile()),
            catalogos: {
                estados: cfg.ESTADOS.map(e => ({ valor: e, sitio: cfg.ESTADO_SITIO[e], etiqueta: cfg.ETIQUETA_ESTADO[e] })),
                tipos: [...cfg.TIPOS],
                servicios: cfg.SERVICIOS.map(s => ({ ...s })),
                largos: { ...cfg.LARGOS },
                altMin: cfg.ALT_MIN,
                anio: { min: cfg.ANIO_MIN, max: cfg.ANIO_MAX },
                foto: { anchos: [...cfg.ANCHOS], minAncho: cfg.MIN_ANCHO, maxBytes: cfg.MAX_BYTES, mimes: [...cfg.MIMES] },
            },
        };
    },

    /** GET /obras: todas, por estado y orden, con lo que les falta y cómo van. */
    async listarObras() {
        const [obras] = await db.query(
            `SELECT * FROM sitio_obras
              ORDER BY FIELD(estado, 'en_construccion', 'contratado', 'terminado'), orden ASC, nombre ASC, id ASC`
        );
        const fotos = await fotosPorObra(obras.map(o => o.id));
        const pub = obras.some(o => o.publicado_hash) ? await contextoPublicacion() : null;
        return obras.map(o => {
            const c = calcular(o, fotos.get(o.id) || [], pub);
            return {
                id: o.id,
                slug: o.slug,
                nombre: o.nombre,
                estado: o.estado,
                comuna: o.comuna,
                orden: o.orden,
                incluir: !!o.incluir,
                vinculada: o.obra_id !== null && o.obra_id !== undefined,
                tiene_portada: !!c.vigente,
                portada_id: c.vigente ? c.vigente.id : null,
                referencia: o.referencia,
                fotos_por_aprobar: c.porAprobar,
                faltantes: c.faltantes,
                estadoDerivado: c.estado,
                publicado_at: o.publicado_at,
                updated_at: o.updated_at,
            };
        });
    },

    /** GET /obras/:id: la obra, sus fotos (sin rutas), el JSON que se publicaría y su historial. */
    async detalleObra(id, { permisos = [] } = {}) {
        const o = await obraOFalla(id);
        const [fotos] = await db.query(
            `SELECT f.*, us.nombre AS subido_por_nombre, uc.nombre AS confirmado_por_nombre,
                    ua.nombre AS aprobada_por_nombre, ur.nombre AS rechazada_por_nombre
               FROM sitio_obra_fotos f
               LEFT JOIN usuarios us ON us.id = f.subido_por
               LEFT JOIN usuarios uc ON uc.id = f.confirmado_por
               LEFT JOIN usuarios ua ON ua.id = f.aprobada_por
               LEFT JOIN usuarios ur ON ur.id = f.rechazada_por
              WHERE f.sitio_obra_id = ? ORDER BY f.created_at DESC, f.id DESC`, [id]
        );
        const pub = o.publicado_hash ? await contextoPublicacion() : null;
        const c = calcular(o, fotos, pub);
        const [[nombres]] = await db.query(
            `SELECT (SELECT nombre FROM usuarios WHERE id = ?) AS creado_por_nombre,
                    (SELECT nombre FROM usuarios WHERE id = ?) AS actualizado_por_nombre,
                    (SELECT nombre FROM usuarios WHERE id = ?) AS mandante_autoriza_por_nombre`,
            [o.creado_por, o.actualizado_por, o.mandante_autoriza_por]
        );
        // El nombre interno de la obra vinculada solo para quien puede ver obras.
        let obraNombre = null;
        if (o.obra_id && permisos.includes('obras.ver')) {
            const [[interna]] = await db.query('SELECT nombre FROM obras WHERE id = ?', [o.obra_id]);
            obraNombre = interna?.nombre ?? null;
        }
        const [historial] = await db.query(
            `SELECT h.id, h.entidad, h.entidad_id, h.accion, h.resumen, h.detalle, h.created_at, u.nombre AS usuario_nombre
               FROM sitio_web_historial h LEFT JOIN usuarios u ON u.id = h.usuario_id
              WHERE h.sitio_obra_id = ? ORDER BY h.created_at DESC, h.id DESC LIMIT 100`, [id]
        );
        return {
            obra: {
                id: o.id,
                obra_id: o.obra_id,
                obra_nombre: obraNombre,
                slug: o.slug,
                slug_congelado: slugCongelado(o),
                nombre: o.nombre,
                titular: o.titular,
                tipo: o.tipo,
                mandante: o.mandante,
                mandante_autoriza: !!o.mandante_autoriza,
                mandante_autoriza_por_nombre: o.mandante_autoriza ? (nombres?.mandante_autoriza_por_nombre ?? null) : null,
                mandante_autoriza_at: o.mandante_autoriza ? o.mandante_autoriza_at : null,
                comuna: o.comuna,
                direccion: o.direccion,
                superficie_m2: o.superficie_m2,
                estado: o.estado,
                anio: o.anio,
                inicio: o.inicio,
                servicios: listaServicios(o.servicios),
                desafio: o.desafio,
                solucion: o.solucion,
                resultado: o.resultado,
                referencia: o.referencia,
                orden: o.orden,
                incluir: !!o.incluir,
                publicado_at: o.publicado_at,
                creado_por_nombre: nombres?.creado_por_nombre ?? null,
                actualizado_por_nombre: nombres?.actualizado_por_nombre ?? null,
                created_at: o.created_at,
                updated_at: o.updated_at,
            },
            fotos: fotos.map(f => fotoParaPantalla(f, c.vigente ? c.vigente.id : null, leerJson(o.publicado_json))),
            portada_id: c.vigente ? c.vigente.id : null,
            faltantes: c.faltantes,
            estadoDerivado: c.estado,
            json: c.json,
            json_publicado: leerJson(o.publicado_json),
            historial: historial.map(h => ({ ...h, detalle: leerJson(h.detalle) })),
        };
    },

    /** POST /obras. El slug sale del nombre si no viene. Queda fuera del sitio (incluir = 0) hasta que se incluya. */
    async crearObra(data, userId, { permisos = [] } = {}) {
        const o = leerObra(data);
        if (o.obra_id) {
            exigirObrasVer(permisos);
            await obraInternaOFalla(o.obra_id);
        }
        o.slug = o.slug || slugDesde(o.nombre);
        if (!o.slug) throw err(400, 'No se pudo armar la dirección web desde el nombre: escríbela a mano.', { code: 'SITIO_WEB_SLUG' });
        await slugLibreOFalla(o.slug);
        o.estado = o.estado || 'en_construccion';
        o.orden = await siguienteOrden(o.estado);
        if (o.mandante_autoriza) Object.assign(o, { mandante_autoriza_por: userId, mandante_autoriza_at: new Date() });
        const fila = { ...o, incluir: false, creado_por: userId, actualizado_por: userId };
        const cols = Object.keys(fila);
        let r;
        try {
            [r] = await db.query(
                `INSERT INTO sitio_obras (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(fila)
            );
        } catch (e) { throw traducirDuplicado(e); }
        await registrar(null, { sitio_obra_id: r.insertId, entidad: 'obra', entidad_id: r.insertId, accion: 'crear',
            resumen: `Creó la obra «${o.nombre}» del sitio (${o.slug})`, usuario_id: userId });
        return { id: r.insertId, slug: o.slug };
    },

    /**
     * PUT /obras/:id. `updated_at` = la versión que se editó: si otra persona guardó después, 409
     * SITIO_WEB_EDITADA_POR_OTRO (también si guarda justo entremedio: el UPDATE vuelve a comparar).
     */
    async editarObra(id, data, userId, { permisos = [] } = {}) {
        const actual = await obraOFalla(id);
        const version = new Date(data.updated_at);
        if (Number.isNaN(version.getTime())) throw err(400, 'Falta la versión de la obra que se editó (updated_at).', { code: 'SITIO_WEB_VERSION' });
        const editadaPorOtro = () => err(409,
            'Otra persona guardó cambios en esta obra mientras la editabas. Recarga para ver lo último y vuelve a hacer tus cambios.',
            { code: 'SITIO_WEB_EDITADA_POR_OTRO' });
        if (new Date(actual.updated_at).getTime() !== version.getTime()) throw editadaPorOtro();

        const o = leerObra(data, { parcial: true });
        if (o.obra_id !== undefined && o.obra_id !== (actual.obra_id ?? null)) {
            exigirObrasVer(permisos);
            if (o.obra_id !== null) await obraInternaOFalla(o.obra_id);
        }
        if (o.slug === null) delete o.slug;   // vacío = dejar el que tiene
        if (o.slug !== undefined && o.slug !== actual.slug) {
            if (slugCongelado(actual)) {
                throw err(409, 'La dirección web ya está publicada en el sitio: no se puede cambiar.', { code: 'SITIO_WEB_SLUG_CONGELADO' });
            }
            await slugLibreOFalla(o.slug, id);
        }
        if (o.estado !== undefined && o.estado !== actual.estado) o.orden = await siguienteOrden(o.estado);
        // La autorización es para ESE mandante: si cambia el nombre, se pierde. Solo queda si en este mismo guardado
        // se marca de nuevo (venía sin marcar); una casilla que ya estaba marcada no cuenta como autorización nueva.
        const mandanteCambia = o.mandante !== undefined && (o.mandante ?? null) !== (linea(actual.mandante) ?? null);
        if (mandanteCambia && !(o.mandante_autoriza === true && !actual.mandante_autoriza)) o.mandante_autoriza = false;
        if (o.mandante_autoriza !== undefined && o.mandante_autoriza !== !!actual.mandante_autoriza) {
            Object.assign(o, o.mandante_autoriza
                ? { mandante_autoriza_por: userId, mandante_autoriza_at: new Date() }
                : { mandante_autoriza_por: null, mandante_autoriza_at: null });
        }

        const cambios = diferencias(actual, o, Object.keys(o));
        if (!Object.keys(cambios).length) return { id, sin_cambios: true, updated_at: actual.updated_at };
        const sets = Object.keys(o).map(c => `${c} = ?`).join(', ');
        let r;
        try {
            [r] = await db.query(`UPDATE sitio_obras SET ${sets}, actualizado_por = ? WHERE id = ? AND updated_at = ?`,
                [...Object.values(o), userId, id, actual.updated_at]);
        } catch (e) { throw traducirDuplicado(e); }
        if (!r || !r.affectedRows) throw editadaPorOtro();
        await registrar(null, { sitio_obra_id: id, entidad: 'obra', entidad_id: id, accion: 'editar',
            resumen: `Editó la obra «${o.nombre || actual.nombre}»: ${Object.keys(cambios).join(', ')}`,
            detalle: cambios, usuario_id: userId });
        const [[nueva]] = await db.query('SELECT updated_at FROM sitio_obras WHERE id = ?', [id]);
        return { id, updated_at: nueva ? nueva.updated_at : null };
    },

    /**
     * PUT /obras/:id/incluir. Incluir una obra que nunca se publicó exige que no le falte nada (409
     * SITIO_WEB_FALTAN_DATOS con la lista). Quitarla del sitio NUNCA se bloquea.
     */
    async cambiarIncluir(id, incluir, userId) {
        const o = await obraOFalla(id);
        if (!!o.incluir === incluir) return { id, incluir, sin_cambios: true };
        if (incluir && !o.publicado_hash) {
            const { faltantes: f } = calcular(o, (await fotosPorObra([id])).get(id) || [], null);
            if (f.length) {
                throw err(409, `Faltan datos para que la obra salga al sitio: ${f.map(x => x.mensaje).join(' ')}`,
                    { code: 'SITIO_WEB_FALTAN_DATOS', details: { faltantes: f } });
            }
        }
        await db.query('UPDATE sitio_obras SET incluir = ?, actualizado_por = ?, updated_at = updated_at WHERE id = ?', [incluir, userId, id]);
        await registrar(null, { sitio_obra_id: id, entidad: 'obra', entidad_id: id, accion: incluir ? 'incluir' : 'quitar',
            resumen: incluir ? `Incluyó «${o.nombre}» en el sitio (sale en la próxima publicación)`
                : `Quitó «${o.nombre}» del sitio (se retira en la próxima publicación)`,
            usuario_id: userId });
        return { id, incluir, nombre: o.nombre };
    },

    /**
     * PUT /obras/orden: las obras de UN estado en el orden nuevo → orden 10, 20, 30… Las de ese estado que no
     * vinieron en la lista (creadas mientras tanto) quedan al final, en su orden de antes.
     */
    async reordenar(estado, ids, userId) {
        const lista = (ids || []).map(Number);
        if (lista.some(n => !Number.isInteger(n) || n < 1) || new Set(lista).size !== lista.length) {
            throw err(400, 'La lista de obras para ordenar no es válida.', { code: 'SITIO_WEB_ORDEN' });
        }
        const [filas] = await db.query('SELECT id FROM sitio_obras WHERE estado = ? ORDER BY orden ASC, nombre ASC, id ASC', [estado]);
        const delEstado = filas.map(f => f.id);
        if (lista.some(n => !delEstado.includes(n))) {
            throw err(409, 'La lista cambió mientras ordenabas (una obra ya no está en ese estado). Recarga e inténtalo de nuevo.',
                { code: 'SITIO_WEB_ORDEN_DESACTUALIZADO' });
        }
        const final = [...lista, ...delEstado.filter(n => !lista.includes(n))];
        const casos = final.map(() => 'WHEN ? THEN ?').join(' ');
        await db.query(
            `UPDATE sitio_obras SET orden = CASE id ${casos} END, updated_at = updated_at WHERE id IN (?)`,
            [...final.flatMap((n, i) => [n, (i + 1) * 10]), final]
        );
        await registrar(null, { entidad: 'obra', accion: 'orden',
            resumen: `Cambió el orden de «${cfg.ETIQUETA_ESTADO[estado]}»`, detalle: { estado, ids: final }, usuario_id: userId });
        return { estado, ids: final };
    },

    /**
     * DELETE /obras/:id: solo un borrador que no está en el sitio. Si está incluida o sigue publicada (o figura en
     * el último manifiesto OK), 409 SITIO_WEB_OBRA_EN_LINEA: primero se quita y se publica.
     */
    async borrarObra(id, userId) {
        const o = await obraOFalla(id);
        if (o.incluir) {
            throw err(409, 'La obra está incluida en el sitio: primero quítala del sitio y publica; después se puede borrar.', { code: 'SITIO_WEB_OBRA_EN_LINEA' });
        }
        const pub = await contextoPublicacion();
        if (o.publicado_hash || (pub && pub.manifiesto && pub.manifiesto[`src/content/obras/${o.slug}.json`])) {
            throw err(409, 'La obra sigue publicada en el sitio: publica su retiro antes de borrarla.', { code: 'SITIO_WEB_OBRA_EN_LINEA' });
        }
        await db.query('DELETE FROM sitio_obras WHERE id = ?', [id]);   // las fotos caen por CASCADE
        // Su carpeta de uploads es solo suya (sitio-web/<id>): se va entera.
        try { fs.rmSync(path.join(UPLOADS_DIR, 'sitio-web', String(id)), { recursive: true, force: true }); } catch (e) {
            logger.error('No se pudo borrar la carpeta de fotos de una obra del sitio', { err: e.message, id });
        }
        await registrar(null, { sitio_obra_id: id, entidad: 'obra', entidad_id: id, accion: 'borrar',
            resumen: `Borró la obra «${o.nombre}» del sitio (${o.slug})`, detalle: { slug: o.slug, nombre: o.nombre }, usuario_id: userId });
        return { id, nombre: o.nombre };
    },

    /** GET /obras/disponibles: obras reales de la Bóveda (vigentes o finalizadas) que aún no están vinculadas. */
    async obrasDisponibles() {
        const [rows] = await db.query(
            `SELECT o.id, o.nombre, o.finalizada
               FROM obras o
               LEFT JOIN sitio_obras s ON s.obra_id = o.id
              WHERE o.es_prueba = 0 AND (o.activa = 1 OR o.finalizada = 1) AND s.id IS NULL
              ORDER BY o.finalizada ASC, o.nombre ASC`
        );
        return rows.map(r => ({ id: r.id, nombre: r.nombre, finalizada: !!r.finalizada }));
    },

    /**
     * GET /obras/sugerencias/:obraId: lo que la Bóveda ya sabe de una obra, para prellenar. La superficie sale del
     * presupuesto (Costos) y solo va con `costos.gestionar`.
     */
    async sugerencias(obraId, { verCostos = false } = {}) {
        if (!Number.isInteger(obraId) || obraId < 1) throw err(404, 'Obra no encontrada');
        const [[o]] = await db.query(
            `SELECT id, nombre, direccion, activa, finalizada, fecha_inicio, fecha_termino
               FROM obras WHERE id = ? AND es_prueba = 0`, [obraId]
        );
        if (!o) throw err(404, 'Obra no encontrada');
        const fecha = (v) => (v ? (v instanceof Date ? v : new Date(`${String(v).slice(0, 10)}T12:00:00`)) : null);
        const inicio = fecha(o.fecha_inicio);
        const termino = fecha(o.fecha_termino);
        const nombre = nombreLegible(o.nombre);
        const s = {
            obra_id: o.id,
            nombre,
            slug: slugDesde(nombre),
            direccion: linea(o.direccion),
            estado: o.finalizada ? 'terminado' : 'en_construccion',
            anio: o.finalizada && termino && !Number.isNaN(termino.getTime()) ? termino.getFullYear() : null,
            inicio: inicio && !Number.isNaN(inicio.getTime()) ? `${MESES[inicio.getMonth()]} ${inicio.getFullYear()}` : null,
        };
        if (verCostos) {
            const [[p]] = await db.query('SELECT superficie_m2 FROM costo_presupuestos WHERE obra_id = ?', [obraId]);
            const m2 = p && p.superficie_m2 !== null && p.superficie_m2 !== undefined ? Math.round(Number(p.superficie_m2)) : null;
            s.superficie_m2 = m2 && m2 >= 1 ? m2 : null;
        }
        return s;
    },
};

/** Sin la migración 147, cada llamada responde 409 SITIO_WEB_SIN_MIGRAR en vez de un 500 «tabla no existe». */
const conTablas = (fn) => async (...args) => {
    try { return await fn(...args); } catch (e) {
        if (sinTablas(e)) throw errSinMigrar();
        throw e;
    }
};
const envuelto = Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, conTablas(fn)]));

module.exports = {
    ...envuelto,
    // Puras (contrato y estados), también para sitioWebFotos y la publicación.
    slugDesde, slugReservado, slugValido, slugCongelado, nombreLegible,
    serializarObra, textoJson, hashTexto, rutasDeJson, faltantes, estadoDerivado, desdeJsonDelSitio, urlsDeFoto, fotoNombradaEn, fotoRechazadaEn,
    fotoPublicable, fotoVigente, fotoPorAprobar, fotoDelSitio, estadoFoto, listaServicios,
    _h: { err, sinTablas, errSinMigrar, conTablas, linea, leerObra, registrar, obraOFalla, fotosPorObra, contextoPublicacion, UPLOADS_DIR },
};

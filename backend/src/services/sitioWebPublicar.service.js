const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../config/db');
const logger = require('../utils/logger-structured');
const cfg = require('../config/sitioWeb.config');
const guarda = require('./sitioWebGuarda');
const sitio = require('./sitioWeb.service');
const fotosSvc = require('./sitioWebFotos.service');
const github = require('./sitioWebGithub.service');
const enLinea = require('./sitioWebEnLinea');

/**
 * Sitio web — publicar en lols.cl (mig 147, plan 4.7, 4.11 y 7.2, docs/reglas/sitio-web.md).
 *
 * Cada publicación es una FOTO COMPLETA de las obras con `incluir = 1`: su JSON y sus portadas. Lo que estaba en
 * el último manifiesto OK y ya no viene se borra en el MISMO commit (una obra retirada se va con sus fotos). Todo
 * en la misma request (Passenger: nada en segundo plano), con estos pasos:
 *
 *   1. Lock `GET_LOCK('<base>:sitio_web_publicar', 0)` en una conexión propia (se suelta solo si el proceso muere):
 *      una publicación, importación o resincronización a la vez; si no, 409 SITIO_WEB_PUBLICACION_EN_CURSO. El
 *      nombre lleva la base: GET_LOCK es de todo el servidor MySQL y staging y producción comparten instancia.
 *   2. Conciliar lo que quedó `en_curso` (el proceso murió): con `commit_sha` contenido en main → `ok` (adopta su
 *      manifiesto y sus `publicado_*`); si no → `interrumpida`.
 *   3. Armar la foto completa. Una obra incluida a la que le faltan datos y ya se publicó REUSA su `publicado_json`
 *      (una edición a medias nunca bloquea otra publicación ni un retiro), salvo que esa versión muestre una foto
 *      RECHAZADA: entonces la obra sale del sitio. Las portadas cumplen las dos llaves y sus bytes en disco son los
 *      aprobados.
 *   4. Simulación (staging, o sin token): manifiesto en estado `simulada` y un ZIP para probar en un lols.cl local.
 *      Cero llamadas a GitHub. La diferencia se calcula contra el último manifiesto OK (lo que el repo tiene).
 *   5. Publicar: hasta 3 intentos. En cada uno se lee la rama y su árbol; si las rutas de la Bóveda en el repo no son
 *      las del último manifiesto OK → SITIO_WEB_REPO_MODIFICADO (alguien las tocó a mano: no se pisa nada). Se suben
 *      los blobs que falten, tree con base_tree, commit, se guarda `commit_sha` + manifiesto previsto ANTES del PATCH
 *      y PATCH con force:false (un 422 con main movido → otro intento; con main quieto = una regla de GitHub lo
 *      rechazó → SITIO_WEB_GITHUB_RECHAZO, sin reintentar).
 *   6. OK: `publicado_hash` = sha256 del JSON ENVIADO (nunca de la fila releída: alguien pudo editarla mientras).
 *
 * Rutas: solo las de la lista blanca (sitioWebGuarda.rutaPermitida, revisada antes de cualquier escritura). El
 * 1.jpg heredado de una obra importada es de la Bóveda solo si está en el manifiesto; el de una carpeta compartida
 * con «Han confiado en nosotros» (cfg.CARPETAS_COMPARTIDAS) es del repo: se nombra en el JSON pero nunca se borra.
 */

const { err, registrar, conTablas, UPLOADS_DIR } = sitio._h;
const { gitBlobSha } = github;

const LOCK = 'sitio_web_publicar';
/** El nombre del lock con la base delante (`lolscl_boveda:sitio_web_publicar`): staging no frena a producción. */
const NOMBRE_LOCK = `CONCAT(COALESCE(DATABASE(), ''), ':${LOCK}')`;
const INTENTOS = 3;
const PAUSA_BLOBS_MS = 300;
/**
 * GitHub limita las llamadas que CREAN contenido (blobs, árboles, commits, mover la rama) a unas 80 por minuto
 * (límite secundario de la REST API). Se deja margen: a lo más 70 en cualquier ventana de 60 s; si una publicación
 * grande llega al tope, espera dentro de la misma request (el tope de la pantalla es 120 s).
 */
const MAX_CREAR_POR_MINUTO = 70;
const VENTANA_CREAR_MS = 60000;
const SHA_RE = /^[0-9a-f]{40}$/;
const DIR_PAQUETES = path.join(UPLOADS_DIR, 'sitio-web', 'paquetes');
const PAQUETES_A_GUARDAR = 10;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_ENTRADAS_ZIP = 5000;
const MAX_TOTAL_ZIP = 200 * 1024 * 1024;
/** Fecha fija dentro del ZIP: el mismo contenido da el mismo paquete. */
const FECHA_ZIP = new Date('2026-01-01T00:00:00Z');
const BUILD_FINAL = ['ok', 'fallo', 'reemplazada'];

/* archiver, jszip y sharp se cargan al primer uso (mismo patrón que docxExport/sitioWebFotos). */
let archiver;
let JSZip;
let sharp;
function cargarDeps() {
    if (!archiver) archiver = require('archiver');
    if (!JSZip) JSZip = require('jszip');
}
function cargarSharp() {
    if (!sharp) sharp = require('sharp');
}

const esperaReal = (ms) => new Promise(r => setTimeout(r, ms));
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const leer = (t) => { try { return t ? JSON.parse(t) : null; } catch { return null; } };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const corto = (sha) => String(sha || '').slice(0, 7);
const { urlsDeFoto, fotoRechazadaEn } = sitio;
const faltaTexto = (falta) => falta.map(x => x.mensaje.replace(/\.$/, '').toLowerCase()).join('; ');

/** El modo efectivo (publicar | simulacion) con las mismas señales que GET /config. */
function modoDe(o = {}) {
    const env = o.env || process.env;
    return guarda.explicarModo({
        env,
        ...(o.dbName !== undefined ? { dbName: o.dbName } : {}),
        ...(o.dirname !== undefined ? { dirname: o.dirname } : {}),
    });
}
const clienteDe = (o = {}) => github.crearCliente({
    env: o.env || process.env, fetchImpl: o.fetchImpl || globalThis.fetch, ...(o.esperar ? { esperar: o.esperar } : {}),
});

/** Autor de los commits: «Bóveda LOLS <GITHUB_AUTOR_EMAIL_SITIO>». Sin un correo válido, GitHub usa al dueño del token. */
function autorCommit(env = process.env) {
    const email = String(env.GITHUB_AUTOR_EMAIL_SITIO || '').trim();
    return email.length <= 120 && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email) ? { name: 'Bóveda LOLS', email } : null;
}

/** Quita el token de un texto antes de registrarlo (red de seguridad: los errores propios no lo traen). */
function sinToken(texto, env = process.env) {
    const t = guarda.tokenSitio(env);
    return t ? String(texto).split(t).join('[token]') : String(texto);
}

/* ──────────────────────── lock ──────────────────────── */

/** `fn(conn)` con el lock de publicación tomado en una conexión propia. Ocupado → 409. */
async function conLock(fn) {
    const conn = await db.getConnection();
    let tomado = false;
    try {
        const [[r]] = await conn.query(`SELECT GET_LOCK(${NOMBRE_LOCK}, 0) AS ok`);
        if (!r || Number(r.ok) !== 1) {
            throw err(409, 'Ya hay una publicación del sitio en curso (o una importación). Espera a que termine y vuelve a intentar.',
                { code: 'SITIO_WEB_PUBLICACION_EN_CURSO' });
        }
        tomado = true;
        return await fn(conn);
    } finally {
        if (tomado) {
            await conn.query(`SELECT RELEASE_LOCK(${NOMBRE_LOCK})`).catch(e => logger.error('Sitio web: no se pudo soltar el lock', { err: e.message }));
        }
        conn.release();
    }
}

/* ──────────────────────── manifiestos (puras) ──────────────────────── */

/** La última publicación OK (o importación): su manifiesto {ruta: blobSha} y {sitio_obra_id: sha256}. */
async function ultimaOk(q = db) {
    const [[p]] = await q.query(
        `SELECT id, modo, commit_sha, manifiesto, obras_json, created_at FROM sitio_publicaciones
          WHERE estado = 'ok' ORDER BY id DESC LIMIT 1`
    );
    if (!p) return null;
    return { id: p.id, modo: p.modo, commit_sha: p.commit_sha, manifiesto: leer(p.manifiesto) || {}, obras: leer(p.obras_json) || {}, created_at: p.created_at };
}

/**
 * ¿La ruta del repo es de la Bóveda, mirada contra el manifiesto `base`? Los JSON y las portadas siempre; el 1.jpg
 * heredado solo si el manifiesto lo trae (el de «Han confiado en nosotros», o el de una carpeta que la Bóveda nunca
 * importó, no es suyo).
 */
function esDuena(ruta, base) {
    if (!guarda.esRutaDuena(ruta)) return false;
    return cfg.RUTA_JSON_RE.test(ruta) || cfg.RUTA_PORTADA_RE.test(ruta) || hasOwn(base, ruta);
}

/** El manifiesto base sin lo que ya no es de la Bóveda (p. ej. una carpeta que pasó a ser compartida). */
const baseDuena = (base) => Object.fromEntries(Object.entries(base).filter(([r]) => esDuena(r, base)));

/** {ruta: sha} de las rutas de la Bóveda en un árbol (Map ruta → sha). */
function duenasDelArbol(rutas, base) {
    const out = {};
    for (const [r, sha] of rutas) if (esDuena(r, base)) out[r] = sha;
    return out;
}

/** Rutas en las que dos manifiestos no coinciden (faltan, sobran o cambió el contenido). */
function rutasDistintas(a, b) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(r => a[r] !== b[r]).sort();
}

/** Qué escribir y qué borrar para que el repo (`remotas`) quede igual a la foto completa (`archivos`). */
function calcularCambios(archivos, remotas) {
    const escribir = [...archivos].filter(([r, a]) => remotas[r] !== a.sha).map(([r]) => r).sort();
    const borrar = Object.keys(remotas).filter(r => !archivos.has(r)).sort();
    return { escribir, borrar };
}

/* ──────────────────────── la foto completa ──────────────────────── */

const sha256Archivo = async (full) => sha256(await fs.promises.readFile(full));

/** null si la portada se puede publicar tal cual; si no, el aviso de por qué no. */
async function problemaDeFoto(f, o, base) {
    if (f.heredada_src) {
        const ruta = `public${f.heredada_src}`;
        if (!guarda.esRutaDuena(ruta)) return null;   // del repo (carpeta compartida): se revisa contra el árbol al publicar
        return hasOwn(base, ruta) ? null : `La foto heredada de «${o.nombre}» ya no está en el sitio: sube una portada nueva.`;
    }
    const maestra = fotosSvc.rutaAbsoluta(f.ruta, cfg.ARCHIVOS_FOTO.maestra);
    const intacta = !!maestra && await sha256Archivo(maestra).then(h => h === f.hash, () => false);
    const derivadas = cfg.ANCHOS.every(a => { const p = fotosSvc.rutaAbsoluta(f.ruta, cfg.ARCHIVOS_FOTO[a]); return !!p && fs.existsSync(p); });
    return intacta && derivadas ? null
        : `La portada aprobada de «${o.nombre}» no está completa en la Bóveda o cambió desde que se aprobó: súbela de nuevo.`;
}

/** Bytes de /proyectos/<slug>/portada.<hash8>-<ancho>.webp desde las fotos de la obra (null si ya no están). */
async function bytesDePortada(url, fotos) {
    const m = String(url).match(/\/portada\.([0-9a-f]{8})-(800|1600)\.webp$/);
    if (!m) return null;
    const f = fotos.find(x => !x.heredada_src && String(x.hash).startsWith(m[1]));
    const full = f && fotosSvc.rutaAbsoluta(f.ruta, cfg.ARCHIVOS_FOTO[m[2]]);
    if (!full) return null;
    return fs.promises.readFile(full).catch(() => null);
}

/** Suma a la foto completa una obra con su texto JSON exacto y los archivos de sus fotos. */
async function sumarObra(foto, o, texto, json, tipo, fotos, base, falta = []) {
    const bloquear = (m) => { foto.bloqueos.push(m); };
    if (!json || json.slug !== o.slug) return bloquear(`«${o.nombre}»: la versión publicada guardada no corresponde a la obra.`);
    const bytesJson = Buffer.from(texto, 'utf8');
    const entradas = [[`src/content/obras/${o.slug}.json`, { sha: gitBlobSha(bytesJson), bytes: bytesJson, tipo: 'json' }]];
    const ajenas = [];
    for (const u of [...new Set((json.fotos || []).flatMap(urlsDeFoto))]) {
        const ruta = `public${u}`;
        if (!u.startsWith(`/proyectos/${o.slug}/`)) return bloquear(`«${o.nombre}»: una foto no está en la carpeta de la obra (${u}).`);
        if (!guarda.esRutaDuena(ruta)) { ajenas.push(ruta); continue; }
        if (cfg.RUTA_HEREDADA_RE.test(ruta)) {
            if (!hasOwn(base, ruta)) return bloquear(`«${o.nombre}»: la foto ${u} ya no está en el sitio y la Bóveda no puede volver a subirla. Sube una portada nueva.`);
            entradas.push([ruta, { sha: base[ruta], bytes: null, tipo: 'heredada' }]);
            continue;
        }
        if (cfg.RUTA_PORTADA_RE.test(ruta)) {
            const bytes = await bytesDePortada(u, fotos);
            if (bytes) entradas.push([ruta, { sha: gitBlobSha(bytes), bytes, tipo: 'foto' }]);
            else if (hasOwn(base, ruta)) entradas.push([ruta, { sha: base[ruta], bytes: null, tipo: 'conservada' }]);
            else return bloquear(`«${o.nombre}»: falta el archivo ${u} y no está en el sitio. Sube la portada de nuevo.`);
            continue;
        }
        return bloquear(`«${o.nombre}»: la foto ${u} no tiene un nombre que la Bóveda maneje.`);
    }
    for (const [r, a] of entradas) foto.archivos.set(r, a);
    for (const r of ajenas) if (!foto.ajenas.includes(r)) foto.ajenas.push(r);
    foto.obras.push({
        id: o.id, slug: o.slug, nombre: o.nombre, estado: o.estado, tipo, texto, hash: sitio.hashTexto(texto),
        publicado_hash: o.publicado_hash || null, faltantes: falta,
    });
}

/** Una obra incluida → a la foto completa (actual, la publicada que se mantiene, o fuera con su aviso). */
async function agregarObra(foto, o, fotos, base) {
    const portadas = fotos.filter(f => (f.rol || 'portada') === 'portada');
    let candidatas = portadas.filter(sitio.fotoPublicable);
    let vigente = null;
    while (candidatas.length) {
        const v = sitio.fotoVigente(candidatas);
        const problema = await problemaDeFoto(v, o, base);
        if (!problema) { vigente = v; break; }
        foto.avisos.push(problema);
        candidatas = candidatas.filter(f => f !== v);
    }
    const falta = sitio.faltantes(o, vigente, { porAprobar: portadas.filter(sitio.fotoPorAprobar).length });
    if (!falta.length) {
        const json = sitio.serializarObra(o, vigente);
        return sumarObra(foto, o, sitio.textoJson(json), json, 'actual', fotos, base);
    }
    if (o.publicado_json) {
        const previo = leer(o.publicado_json);
        if (previo && fotoRechazadaEn(previo, fotos)) {
            foto.excluidas.push({ id: o.id, slug: o.slug, nombre: o.nombre, motivo: 'foto_rechazada', faltantes: falta });
            foto.avisos.push(`«${o.nombre}» sale del sitio: su portada publicada fue rechazada y le falta ${faltaTexto(falta)}. Vuelve cuando tenga otra portada aprobada.`);
            return null;
        }
        foto.avisos.push(`«${o.nombre}»: se mantiene la versión publicada (le falta ${faltaTexto(falta)}).`);
        return sumarObra(foto, o, o.publicado_json, previo, 'mantiene', fotos, base, falta);
    }
    foto.excluidas.push({ id: o.id, slug: o.slug, nombre: o.nombre, motivo: 'faltan_datos', faltantes: falta });
    foto.avisos.push(`«${o.nombre}» no sale al sitio: le falta ${faltaTexto(falta)}.`);
    return null;
}

/**
 * La foto completa contra el manifiesto `base`:
 *   { obras: [{ id, slug, nombre, tipo: 'actual'|'mantiene', texto, hash }], archivos: Map ruta → { sha, bytes|null },
 *     manifiesto, ajenas: [rutas del repo que se nombran y no son de la Bóveda], excluidas, bloqueos, avisos, filas }
 */
async function armarFoto(base) {
    const [filas] = await db.query(
        `SELECT * FROM sitio_obras WHERE incluir = 1 OR publicado_hash IS NOT NULL
          ORDER BY FIELD(estado, 'en_construccion', 'contratado', 'terminado'), orden ASC, nombre ASC, id ASC`
    );
    const porObra = new Map();
    if (filas.length) {
        const [fotos] = await db.query(
            `SELECT id, sitio_obra_id, rol, orden, alt, ruta, heredada_src, hash, ancho, alto, sin_personas_confirmado, confirmado_at,
                    aprobada_at, aprobada_hash, rechazada_at, created_at
               FROM sitio_obra_fotos WHERE sitio_obra_id IN (?) ORDER BY created_at DESC, id DESC`, [filas.map(o => o.id)]
        );
        for (const f of fotos) {
            if (!porObra.has(f.sitio_obra_id)) porObra.set(f.sitio_obra_id, []);
            porObra.get(f.sitio_obra_id).push(f);
        }
    }
    const foto = { obras: [], archivos: new Map(), ajenas: [], excluidas: [], bloqueos: [], avisos: [], filas };
    for (const o of filas.filter(x => x.incluir)) await agregarObra(foto, o, porObra.get(o.id) || [], base);
    // Una foto RECHAZADA de una carpeta compartida sigue en «Han confiado en nosotros»: ese 1.jpg es del código del
    // sitio y la Bóveda no lo puede sacar. Que quien publica lo sepa (procedimiento de incidente, sitio-web.md).
    for (const o of filas) {
        for (const f of porObra.get(o.id) || []) {
            if (f.rechazada_at && f.heredada_src && !guarda.esRutaDuena(`public${f.heredada_src}`)) {
                foto.avisos.push(`La foto rechazada de «${o.nombre}» (${f.heredada_src}) también la muestra «Han confiado en nosotros» y es del código del sitio: la Bóveda no puede sacarla de ahí. Avisa a Mauricio.`);
            }
        }
    }
    foto.manifiesto = Object.fromEntries([...foto.archivos].sort(([a], [b]) => (a < b ? -1 : 1)).map(([r, a]) => [r, a.sha]));
    return foto;
}

/** Lista blanca ANTES de cualquier escritura: lo que se escribe, escribible; lo que se conserva, de la Bóveda. */
function validarRutas(foto, borrar = []) {
    const malas = [
        ...[...foto.archivos].filter(([r, a]) => (a.bytes ? !guarda.rutaPermitida(r, { accion: 'escribir' }) : !guarda.esRutaDuena(r))).map(([r]) => r),
        ...borrar.filter(r => !guarda.rutaPermitida(r, { accion: 'borrar' })),
    ];
    if (malas.length) {
        logger.error('Sitio web: ruta fuera de la lista blanca', { rutas: malas.slice(0, 5) });
        throw err(500, 'La publicación intentó tocar un archivo del sitio que no es de la Bóveda. No se publicó nada. Avisa a Mauricio.',
            { code: 'SITIO_WEB_RUTA_NO_PERMITIDA', seguro: true });
    }
}

/** Obras nuevas, cambiadas, retiradas, que mantienen lo publicado y que quedan fuera, contra el manifiesto `base`. */
function clasificar(foto, base) {
    const item = (o) => ({ id: o.id, slug: o.slug, nombre: o.nombre });
    const nuevas = []; const cambiadas = []; const mantienen = [];
    let iguales = 0;
    for (const o of foto.obras) {
        const r = `src/content/obras/${o.slug}.json`;
        if (o.tipo === 'mantiene') mantienen.push({ ...item(o), faltantes: o.faltantes });
        if (!hasOwn(base, r)) nuevas.push(item(o));
        else if (base[r] !== foto.archivos.get(r).sha) cambiadas.push(item(o));
        else iguales += 1;
    }
    const enFoto = new Set(foto.obras.map(o => o.slug));
    const porSlug = new Map(foto.filas.map(o => [o.slug, o]));
    const retiradas = Object.keys(base).map(r => (r.match(cfg.RUTA_JSON_RE) || [])[1]).filter(s => s && !enFoto.has(s)).sort()
        .map(s => { const f = porSlug.get(s); return { id: f ? f.id : null, slug: s, nombre: f ? f.nombre : null }; });
    const excluidas = foto.excluidas.map(x => ({ ...item(x), motivo: x.motivo, faltantes: x.faltantes }));
    return { nuevas, cambiadas, retiradas, mantienen, excluidas, iguales };
}

function resumir(c, escribir, borrar) {
    const n = (k, s, p) => `${k} ${k === 1 ? s : p}`;
    const partes = [];
    if (c.nuevas.length) partes.push(n(c.nuevas.length, 'nueva', 'nuevas'));
    if (c.cambiadas.length) partes.push(n(c.cambiadas.length, 'cambiada', 'cambiadas'));
    if (c.retiradas.length) partes.push(n(c.retiradas.length, 'retirada', 'retiradas'));
    if (c.mantienen.length) partes.push(`${c.mantienen.length} con la versión publicada`);
    if (c.excluidas.length) partes.push(`${c.excluidas.length} fuera por datos o foto`);
    const archivos = escribir.length + borrar.length;
    return `${partes.length ? `Obras: ${partes.join(', ')}` : 'Obras sin cambios'} · ${n(archivos, 'archivo', 'archivos')}`.slice(0, 500);
}

/* ──────────────────────── después del commit ──────────────────────── */

/**
 * Deja `publicado_*` de cada obra igual a lo que el commit llevó: `textos` = Map sitio_obra_id → texto ENVIADO.
 * Las que tenían algo publicado y no vienen → null (retiradas). `updated_at = updated_at`: no es una edición.
 */
async function sincronizarPublicado(conn, { textos, pubId, userId, ahora }) {
    const ids = [...textos.keys()];
    const [filas] = await conn.query(
        'SELECT id, nombre, slug, publicado_hash FROM sitio_obras WHERE publicado_hash IS NOT NULL OR id IN (?)', [ids.length ? ids : [0]]
    );
    const publicadas = []; const retiradas = [];
    for (const f of filas) {
        const texto = textos.get(f.id);
        if (texto !== undefined) {
            const hash = sitio.hashTexto(texto);
            if (f.publicado_hash === hash) continue;
            await conn.query('UPDATE sitio_obras SET publicado_hash = ?, publicado_json = ?, publicado_at = ?, updated_at = updated_at WHERE id = ?',
                [hash, texto, ahora, f.id]);
            await registrar(conn, { sitio_obra_id: f.id, entidad: 'obra', entidad_id: f.id, accion: 'publicar',
                resumen: `«${f.nombre}» publicada en el sitio (pub #${pubId})`, usuario_id: userId });
            publicadas.push(f.id);
        } else if (f.publicado_hash) {
            await conn.query('UPDATE sitio_obras SET publicado_hash = NULL, publicado_json = NULL, publicado_at = NULL, updated_at = updated_at WHERE id = ?', [f.id]);
            await registrar(conn, { sitio_obra_id: f.id, entidad: 'obra', entidad_id: f.id, accion: 'retirar',
                resumen: `«${f.nombre}» retirada del sitio (pub #${pubId})`, usuario_id: userId });
            retiradas.push(f.id);
        }
    }
    return { publicadas, retiradas };
}

/**
 * El 1.jpg heredado que el commit borró ya no se puede volver a publicar (la Bóveda no escribe 1.jpg):
 *   · portada nueva aprobada (la obra sigue en el sitio): su fila se va, y su maestra después del COMMIT de la BD;
 *   · obra retirada: la foto NO se pierde (retirar se deshace). Después del COMMIT se vuelve a codificar como una
 *     portada de la Bóveda (portada.<hash8>, sin aprobar: se aprueba de nuevo cuando la obra vuelva). Si no se puede
 *     (está dañada o falta su archivo), su fila y su maestra se van, como en el otro caso. Una RECHAZADA queda como está.
 * `manifiesto` = el del commit: la obra «sigue» si su JSON está en él.
 */
async function quitarHeredadasBorradas(conn, { borradas, manifiesto, pubId, userId }) {
    const srcs = borradas.filter(r => cfg.RUTA_HEREDADA_RE.test(r)).map(r => r.slice('public'.length));
    const nada = { maestras: [], convertir: [] };
    if (!srcs.length) return nada;
    const [filas] = await conn.query('SELECT id, sitio_obra_id, ruta, heredada_src, rechazada_at FROM sitio_obra_fotos WHERE heredada_src IN (?)', [srcs]);
    if (!filas.length) return nada;
    const sigue = (f) => hasOwn(manifiesto, `src/content/obras/${String(f.heredada_src).split('/')[2]}.json`);
    const quitar = filas.filter(sigue);
    const convertir = filas.filter(f => !sigue(f) && !f.rechazada_at);
    if (quitar.length) await conn.query('DELETE FROM sitio_obra_fotos WHERE id IN (?)', [quitar.map(f => f.id)]);
    for (const f of quitar) {
        await registrar(conn, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: f.id, accion: 'borrar',
            resumen: `La foto heredada ${f.heredada_src} se borró del sitio (pub #${pubId}): la reemplazó la portada nueva`,
            usuario_id: userId });
    }
    return { maestras: quitar.map(f => f.ruta), convertir };
}

async function borrarArchivosHeredados(rutas) {
    for (const ruta of rutas) {
        const full = fotosSvc.rutaAbsoluta(ruta, cfg.ARCHIVOS_FOTO.maestra);
        if (full) await fs.promises.unlink(full).catch(() => { /* ya no estaba */ });
    }
}

/**
 * La foto heredada de una obra RETIRADA → portada de la Bóveda sin aprobar (mismo pipeline que una subida: sharp,
 * sin metadatos, 800/1600). Después del commit: si algo falla aquí, la publicación ya entró y no se deshace; la
 * fila se va como antes y queda anotado.
 */
async function convertirHeredadas(conn, filas, { pubId, userId }) {
    for (const f of filas) {
        const vieja = fotosSvc.rutaAbsoluta(f.ruta, cfg.ARCHIVOS_FOTO.maestra);
        try {
            // Ya estaba publicada: se guarda con el ancho que tenga (9 de las 25 de hoy miden menos de 800 px).
            const img = await fotosSvc.procesarImagen(await fs.promises.readFile(vieja), { minAncho: 1 });
            const ruta = `sitio-web/${f.sitio_obra_id}/${img.hash}`;
            const salidas = [[cfg.ARCHIVOS_FOTO.maestra, img.maestra], [cfg.ARCHIVOS_FOTO[800], img.v800], [cfg.ARCHIVOS_FOTO[1600], img.v1600]];
            for (const [suf, salida] of salidas) await fs.promises.writeFile(fotosSvc.rutaAbsoluta(ruta, suf), salida.data);
            await conn.query(
                `UPDATE sitio_obra_fotos SET ruta = ?, hash = ?, heredada_src = NULL, ancho = ?, alto = ?, tamano_bytes = ?,
                        aprobada_por = NULL, aprobada_at = NULL, aprobada_hash = NULL WHERE id = ? AND heredada_src = ?`,
                [ruta, img.hash, img.v1600.info.width, img.v1600.info.height, img.v1600.info.size, f.id, f.heredada_src]
            );
            if (ruta !== f.ruta) await fs.promises.unlink(vieja).catch(() => { /* ya no estaba */ });
            await registrar(conn, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: f.id, accion: 'convertir',
                resumen: `La obra salió del sitio (pub #${pubId}) y con ella ${f.heredada_src}: la foto se guardó como portada de la Bóveda; si la obra vuelve, apruébala de nuevo`,
                usuario_id: userId });
        } catch (e) {
            logger.warn('Sitio web: no se pudo guardar la foto heredada de una obra retirada', { id: f.id, codigo: e.code || null });
            await conn.query('DELETE FROM sitio_obra_fotos WHERE id = ? AND heredada_src IS NOT NULL', [f.id]).catch(() => {});
            if (vieja) await fs.promises.unlink(vieja).catch(() => { /* ya no estaba */ });
            await registrar(conn, { sitio_obra_id: f.sitio_obra_id, entidad: 'foto', entidad_id: f.id, accion: 'borrar',
                resumen: `La foto heredada ${f.heredada_src} se borró del sitio (pub #${pubId}) y no se pudo guardar como portada; para volver a mostrar la obra, sube una nueva`,
                usuario_id: userId });
        }
    }
}

/**
 * Marca la publicación como OK con su manifiesto y deja las obras al día, en una transacción. Si algo falla aquí,
 * el commit YA está en el sitio: el error sale con `trasCommit` (la fila queda en_curso y la próxima publicación
 * la concilia).
 */
async function aplicarPublicacion(conn, { pubId, textos, manifiesto, borradas, commitSha, parentSha, resumen, detalle, userId }) {
    const ahora = new Date();
    let heredadas = { maestras: [], convertir: [] };
    let sync;
    try {
        await conn.beginTransaction();
        try {
            const obrasJson = Object.fromEntries([...textos].map(([id, t]) => [String(id), sitio.hashTexto(t)]));
            await conn.query(
                `UPDATE sitio_publicaciones SET estado = 'ok', commit_sha = ?, parent_sha = ?, manifiesto = ?, manifiesto_previsto = ?,
                        obras_json = ?, obras_incluidas = ?, resumen = ?, error_codigo = NULL, error_mensaje = NULL, finalizado_at = ? WHERE id = ?`,
                [commitSha, parentSha, JSON.stringify(manifiesto), JSON.stringify(manifiesto), JSON.stringify(obrasJson), textos.size, resumen, ahora, pubId]
            );
            sync = await sincronizarPublicado(conn, { textos, pubId, userId, ahora });
            heredadas = await quitarHeredadasBorradas(conn, { borradas, manifiesto, pubId, userId });
            await registrar(conn, { entidad: 'publicacion', entidad_id: pubId, accion: 'publicar',
                resumen: `Publicó en el sitio (pub #${pubId}, commit ${corto(commitSha)}): ${resumen}`, detalle, usuario_id: userId });
            await conn.commit();
        } catch (e) {
            await conn.rollback().catch(() => {});
            throw e;
        }
    } catch (e) {
        throw Object.assign(e, { trasCommit: true });
    }
    // Ya está en el sitio y anotado: lo que sigue nunca hace fallar la publicación.
    await borrarArchivosHeredados(heredadas.maestras);
    await convertirHeredadas(conn, heredadas.convertir, { pubId, userId })
        .catch(e => logger.error('Sitio web: falló guardar las fotos heredadas de obras retiradas', { err: e.message }));
    return sync;
}

/* ──────────────────────── conciliación ──────────────────────── */

/**
 * Textos de los JSON que llevó un commit, por obra (para `publicado_json`). Los que la fila ya tiene se usan tal
 * cual; los demás se leen del repo (primero los que cambiaron) y se reconocen por su sha256.
 */
async function textosDelCommit(conn, gh, { manifiesto, obras, anterior }) {
    const ids = Object.keys(obras).map(Number);
    const [filas] = await conn.query('SELECT id, publicado_hash, publicado_json FROM sitio_obras WHERE id IN (?)', [ids.length ? ids : [0]]);
    const textos = new Map();
    const faltan = new Map();   // sha256 → id
    for (const f of filas) {
        const h = obras[String(f.id)];
        if (f.publicado_hash === h && f.publicado_json) textos.set(f.id, f.publicado_json);
        else faltan.set(h, f.id);
    }
    const rutas = Object.keys(manifiesto).filter(r => cfg.RUTA_JSON_RE.test(r))
        .sort((a, b) => Number(anterior[a] === manifiesto[a]) - Number(anterior[b] === manifiesto[b]) || (a < b ? -1 : 1));
    for (const r of rutas) {
        if (!faltan.size) break;
        const texto = (await gh.leerBlob(manifiesto[r])).toString('utf8');
        const h = sitio.hashTexto(texto);
        if (faltan.has(h)) { textos.set(faltan.get(h), texto); faltan.delete(h); }
    }
    if (faltan.size) {
        throw err(502, 'No se pudo confirmar una publicación anterior que quedó a medias (falta el texto de una obra). Avisa a Mauricio.',
            { code: 'SITIO_WEB_CONCILIACION', seguro: true });
    }
    return textos;
}

/**
 * Publicaciones que quedaron `en_curso` (el proceso murió): sin commit, o en simulación → interrumpida; con commit
 * y GitHub a mano → ok si main lo contiene (adopta su manifiesto y sus obras), si no → interrumpida. Sin GitHub
 * (modo simulación) una con commit queda como está, para la próxima publicación real.
 */
async function conciliar(conn, { gh, userId }) {
    const [huerfanas] = await conn.query(
        `SELECT id, modo, commit_sha, parent_sha, manifiesto_previsto, obras_json FROM sitio_publicaciones
          WHERE estado = 'en_curso' ORDER BY id ASC`
    );
    const hechas = [];
    let head = null;
    const interrumpir = async (p) => {
        await conn.query(`UPDATE sitio_publicaciones SET estado = 'interrumpida', finalizado_at = ? WHERE id = ?`, [new Date(), p.id]);
        hechas.push({ id: p.id, estado: 'interrumpida' });
    };
    for (const p of huerfanas) {
        if (p.modo !== 'publicar' || !SHA_RE.test(String(p.commit_sha || ''))) { await interrumpir(p); continue; }
        if (!gh) continue;
        head = head || await gh.leerRef();
        if (!(await gh.contiene(p.commit_sha, head))) { await interrumpir(p); continue; }
        const manifiesto = leer(p.manifiesto_previsto) || {};
        const obras = leer(p.obras_json) || {};
        const anterior = await ultimaOk(conn);
        if (anterior && anterior.id > p.id) {
            // Después de ella hubo una importación o resincronización, que leyó el repo con este commit adentro: esa es
            // la base. Aplicarla contra esa base borraría como «retirado» lo que solo esa base conoce.
            await conn.query(`UPDATE sitio_publicaciones SET estado = 'ok', manifiesto = ?, resumen = ?, finalizado_at = ? WHERE id = ?`,
                [p.manifiesto_previsto, 'Confirmada después: el commit ya estaba en el sitio (una importación o resincronización posterior ya lo tomó como base)', new Date(), p.id]);
            hechas.push({ id: p.id, estado: 'ok' });
            continue;
        }
        const manifiestoAnterior = anterior ? baseDuena(anterior.manifiesto) : {};
        const textos = await textosDelCommit(conn, gh, { manifiesto, obras, anterior: manifiestoAnterior });
        const borradas = Object.keys(manifiestoAnterior).filter(r => !hasOwn(manifiesto, r));
        try {
            await aplicarPublicacion(conn, {
                pubId: p.id, textos, manifiesto, borradas, commitSha: p.commit_sha, parentSha: p.parent_sha,
                resumen: 'Confirmada al volver a publicar: el commit ya estaba en el sitio', detalle: { conciliada: true }, userId,
            });
        } catch (e) { delete e.trasCommit; throw e; }
        hechas.push({ id: p.id, estado: 'ok' });
    }
    return hechas;
}

/* ──────────────────────── simulación: ZIP ──────────────────────── */

const LEEME = (pubId, resumen) => [
    `Simulación #${pubId} de la Bóveda LOLS: NO se publicó nada.`,
    resumen,
    '',
    'Para probarla en un clon LOCAL de lols.cl (nunca en el repo):',
    '1. Copiar las carpetas src/ y public/ de este ZIP sobre el clon (reemplazar).',
    '2. Borrar los archivos que lista BORRAR.txt.',
    '3. npm run build && node scripts/verificar-obras-reales.mjs   (los dos tienen que pasar)',
    '4. Descartar la prueba: git checkout -- . && git clean -fd src/content/obras public/proyectos',
    '',
    'manifiesto.json: cada archivo de la Bóveda con su SHA de git (las fotos 1.jpg heredadas ya están en el repo).',
    '',
].join('\n');

/** Guarda los últimos PAQUETES_A_GUARDAR ZIP de simulación; los más viejos se borran. */
function podarPaquetes(dir = DIR_PAQUETES) {
    let nombres = [];
    try { nombres = fs.readdirSync(dir).filter(n => /^\d+\.zip$/.test(n)); } catch { return 0; }
    const viejos = nombres.sort((a, b) => parseInt(b, 10) - parseInt(a, 10)).slice(PAQUETES_A_GUARDAR);
    for (const n of viejos) { try { fs.unlinkSync(path.join(dir, n)); } catch { /* ya no estaba */ } }
    return viejos.length;
}

/** uploads/sitio-web/paquetes/<id>.zip: los archivos de la Bóveda con sus rutas del repo + BORRAR.txt + LEEME.txt. */
async function armarPaquete(pubId, { foto, borrar, resumen }) {
    cargarDeps();
    await fs.promises.mkdir(DIR_PAQUETES, { recursive: true });
    const destino = path.join(DIR_PAQUETES, `${pubId}.zip`);
    await new Promise((resolve, reject) => {
        const salida = fs.createWriteStream(destino);
        const zip = archiver('zip', { zlib: { level: 6 } });
        salida.on('close', resolve);
        salida.on('error', reject);
        zip.on('error', reject);
        zip.pipe(salida);
        for (const [r, a] of [...foto.archivos].sort(([x], [y]) => (x < y ? -1 : 1))) {
            if (a.bytes) zip.append(a.bytes, { name: r, date: FECHA_ZIP });
        }
        zip.append(borrar.length ? `${borrar.join('\n')}\n` : '', { name: 'BORRAR.txt', date: FECHA_ZIP });
        zip.append(`${JSON.stringify(foto.manifiesto, null, 2)}\n`, { name: 'manifiesto.json', date: FECHA_ZIP });
        zip.append(LEEME(pubId, resumen), { name: 'LEEME.txt', date: FECHA_ZIP });
        zip.finalize();
    });
    podarPaquetes();
    return destino;
}

/* ──────────────────────── publicar ──────────────────────── */

function vacioCambios() {
    return { nuevas: [], cambiadas: [], retiradas: [], mantienen: [], excluidas: [], iguales: 0 };
}

function resultado({ pubId, modo, estado, repo, commitSha = null, foto = null, cambios = null, escribir = [], borrar = [], paquete = false,
    error = null, conciliadas = [] }) {
    return {
        id: pubId,
        modo,
        estado,
        commit_sha: commitSha,
        url_commit: commitSha ? `https://github.com/${repo}/commit/${commitSha}` : null,
        obras_incluidas: foto ? foto.obras.length : 0,
        cambios: cambios || vacioCambios(),
        archivos: { escribir: escribir.length, borrar: borrar.length },
        avisos: foto ? foto.avisos : [],
        paquete,
        error_codigo: error ? error.codigo : null,
        error_mensaje: error ? error.mensaje : null,
        conciliadas,
    };
}

const detalleDe = (c, escribir, borrar) => ({
    nuevas: c.nuevas, cambiadas: c.cambiadas, retiradas: c.retiradas,
    mantienen: c.mantienen.map(({ faltantes: _f, ...x }) => x), excluidas: c.excluidas.map(({ faltantes: _f, ...x }) => x),
    escribir, borrar,
});

async function simular(conn, { pubId, foto, base, cambios, userId, repo }) {
    const remotas = baseDuena(base ? base.manifiesto : {});
    const { escribir, borrar } = calcularCambios(foto.archivos, remotas);
    validarRutas(foto, borrar);
    const obrasJson = JSON.stringify(Object.fromEntries(foto.obras.map(o => [String(o.id), o.hash])));
    const resumen = resumir(cambios, escribir, borrar);
    const ahora = new Date();
    if (!escribir.length && !borrar.length) {
        await conn.query(
            `UPDATE sitio_publicaciones SET estado = 'sin_cambios', obras_json = ?, obras_incluidas = ?, resumen = ?, finalizado_at = ? WHERE id = ?`,
            [obrasJson, foto.obras.length, `Simulación: ${resumen}`, ahora, pubId]
        );
        return resultado({ pubId, modo: 'simulacion', estado: 'sin_cambios', repo, foto, cambios });
    }
    await armarPaquete(pubId, { foto, borrar, resumen });
    await conn.query(
        `UPDATE sitio_publicaciones SET estado = 'simulada', manifiesto = ?, manifiesto_previsto = ?, obras_json = ?, obras_incluidas = ?,
                resumen = ?, finalizado_at = ? WHERE id = ?`,
        [JSON.stringify(foto.manifiesto), JSON.stringify(foto.manifiesto), obrasJson, foto.obras.length, `Simulación: ${resumen}`, ahora, pubId]
    );
    await registrar(conn, { entidad: 'publicacion', entidad_id: pubId, accion: 'simular',
        resumen: `Simuló una publicación del sitio (pub #${pubId}, no se publicó nada): ${resumen}`,
        detalle: detalleDe(cambios, escribir, borrar), usuario_id: userId });
    return resultado({ pubId, modo: 'simulacion', estado: 'simulada', repo, foto, cambios, escribir, borrar, paquete: true });
}

function errRepoModificado(rutas, { sinBase = false, faltanAjenas = false } = {}) {
    const lista = rutas.slice(0, 5).join(', ') + (rutas.length > 5 ? ` y ${rutas.length - 5} más` : '');
    let mensaje;
    if (faltanAjenas) mensaje = `Faltan en el repo del sitio fotos que no son de la Bóveda y que las obras nombran (${lista}). No se publicó nada. Avisa a Mauricio.`;
    else if (sinBase) mensaje = `El repo del sitio ya tiene obras que la Bóveda no conoce (${lista}). Primero «Importar obras del sitio»; no se publicó nada.`;
    else mensaje = `Alguien cambió a mano archivos de las obras en el repo del sitio (${lista}). No se publicó nada para no pisarlos: pide a Mauricio revisar y «Resincronizar».`;
    return err(409, mensaje, { code: 'SITIO_WEB_REPO_MODIFICADO', details: { rutas: rutas.slice(0, 50) }, seguro: true });
}

/** Paso 5 del flujo: hasta 3 intentos contra GitHub. Devuelve { sinCambios } o { sha, head, escribir, borrar }. */
async function enviarAGithub(conn, { pubId, gh, foto, base, env, esperar }) {
    const manifiestoBase = base ? base.manifiesto : {};
    const esperado = baseDuena(manifiestoBase);
    const obrasJson = JSON.stringify(Object.fromEntries(foto.obras.map(o => [String(o.id), o.hash])));
    const autor = autorCommit(env);
    const subidos = new Set();
    const marcas = [];   // cuándo se hizo cada llamada que crea contenido (ventana de 60 s)
    const antesDeCrear = async () => {
        while (marcas.length >= MAX_CREAR_POR_MINUTO) {
            const espera = marcas[0] + VENTANA_CREAR_MS - Date.now();
            if (espera > 0) await esperar(espera);
            marcas.shift();
        }
        marcas.push(Date.now());
    };
    for (let intento = 1; intento <= INTENTOS; intento++) {
        const head = await gh.leerRef();
        const commit = await gh.leerCommit(head);
        const arbol = await gh.leerArbol(commit.arbol);
        const enArbol = new Map([...arbol].map(([r, e]) => [r, e.sha]));
        // Las rutas de la Bóveda en el repo tienen que ser EXACTAMENTE las del último manifiesto OK.
        const remotas = duenasDelArbol(enArbol, manifiestoBase);
        const distintas = rutasDistintas(remotas, esperado);
        if (distintas.length) throw errRepoModificado(distintas, { sinBase: !base });
        const faltanAjenas = foto.ajenas.filter(r => !enArbol.has(r));
        if (faltanAjenas.length) throw errRepoModificado(faltanAjenas, { faltanAjenas: true });

        const { escribir, borrar } = calcularCambios(foto.archivos, remotas);
        validarRutas(foto, borrar);
        if (escribir.some(r => !foto.archivos.get(r).bytes)) {
            throw err(409, 'Una foto que debía seguir en el sitio no está en el repo y la Bóveda no tiene sus bytes. No se publicó nada. Avisa a Mauricio.',
                { code: 'SITIO_WEB_BLOQUEADA', seguro: true });
        }
        if (!escribir.length && !borrar.length) return { sinCambios: true, head };

        const yaEnRepo = new Set(enArbol.values());
        for (const r of escribir) {
            const a = foto.archivos.get(r);
            if (yaEnRepo.has(a.sha) || subidos.has(a.sha)) continue;
            if (subidos.size) await esperar(PAUSA_BLOBS_MS);
            await antesDeCrear();
            await gh.crearBlob(a.bytes);
            subidos.add(a.sha);
        }
        await antesDeCrear();
        const arbolNuevo = await gh.crearArbol(commit.arbol, { escribir: escribir.map(r => ({ ruta: r, sha: foto.archivos.get(r).sha })), borrar });
        await antesDeCrear();
        const sha = await gh.crearCommit({ mensaje: `sitio: publicar obras (pub #${pubId})`, arbol: arbolNuevo, padre: head, autor });
        // ANTES del PATCH: si el proceso muere después, la próxima publicación lo concilia con esto.
        await conn.query(
            'UPDATE sitio_publicaciones SET commit_sha = ?, parent_sha = ?, manifiesto_previsto = ?, obras_json = ? WHERE id = ?',
            [sha, head, JSON.stringify(foto.manifiesto), obrasJson, pubId]
        );
        try {
            await antesDeCrear();
            await gh.moverRef(sha);
        } catch (e) {
            if (e.code === 'SITIO_WEB_REF_AVANZO') {
                // GitHub responde 422 también cuando una regla o protección de la rama rechaza el cambio: si main no se
                // movió, reintentar no sirve (y el aviso de «alguien está subiendo cambios» mandaría a esperar en vano).
                let actual = null;
                try { actual = await gh.leerRef(); } catch { actual = null; }
                if (actual === head) {
                    throw err(409, 'GitHub no dejó mover la rama del sitio (¿una regla o protección de la rama?). No se publicó nada. Avisa a Mauricio.',
                        { code: 'SITIO_WEB_GITHUB_RECHAZO', seguro: true });
                }
                if (intento < INTENTOS) continue;
                throw err(409, 'La rama del sitio cambió tres veces seguidas mientras se publicaba (alguien más está subiendo cambios). No se publicó nada: vuelve a intentar en unos minutos.',
                    { code: 'SITIO_WEB_REPO_OCUPADO', seguro: true });
            }
            // ¿Llegó igual? (GitHub movió la rama y la respuesta se perdió.) null = no se pudo saber.
            let llego = null;
            try { llego = await gh.contiene(sha, await gh.leerRef()); } catch { llego = null; }
            if (llego === null) throw Object.assign(e, { incierto: true });
            if (!llego) throw e;
        }
        return { sha, head, escribir, borrar };
    }
    /* istanbul ignore next — el bucle siempre devuelve o lanza */
    throw err(409, 'No se pudo publicar.', { code: 'SITIO_WEB_REPO_OCUPADO', seguro: true });
}

/** El error de una publicación queda en su fila y vuelve en el 200 { data } (plan 4.4). */
async function registrarError(conn, { pubId, e, modo, repo, foto, cambios, conciliadas, env }) {
    const codigo = typeof e.code === 'string' && e.code.startsWith('SITIO_WEB_') ? e.code : 'SITIO_WEB_ERROR';
    let mensaje = e.seguro || (codigo !== 'SITIO_WEB_ERROR' && e.statusCode < 500) ? String(e.message)
        : 'Error interno al publicar. No se publicó nada; avisa a Mauricio.';
    let estado = 'error';
    if (e.incierto) {
        estado = 'en_curso';
        mensaje = `No se pudo confirmar si GitHub recibió la publicación (${mensaje}). La próxima publicación lo revisa sola.`;
    } else if (e.trasCommit) {
        estado = 'en_curso';
        mensaje = 'La publicación entró al sitio, pero la Bóveda no alcanzó a anotarla. La próxima publicación la confirma sola.';
    }
    if (!e.seguro) logger.error('Sitio web: error al publicar', { pubId, codigo, err: sinToken(String(e.message), env).slice(0, 300) });
    const valores = estado === 'error'
        ? ["estado = 'error', error_codigo = ?, error_mensaje = ?, finalizado_at = ?", [codigo, mensaje.slice(0, 500), new Date()]]
        : ['error_codigo = ?, error_mensaje = ?', [codigo, mensaje.slice(0, 500)]];
    await conn.query(`UPDATE sitio_publicaciones SET ${valores[0]} WHERE id = ?`, [...valores[1], pubId])
        .catch(x => logger.error('Sitio web: no se pudo anotar el error de la publicación', { pubId, err: x.message }));
    return resultado({ pubId, modo, estado, repo, foto, cambios, error: { codigo, mensaje: mensaje.slice(0, 500) }, conciliadas });
}

/**
 * POST /publicar (`sitio_web.publicar`, confirmo_revision = true). Síncrono. Devuelve el resultado en 200 aunque
 * haya fallado (estado 'error' con su código); 409 si hay otra en curso.
 */
async function publicar({ userId, ...opciones } = {}) {
    const env = opciones.env || process.env;
    const esperar = opciones.esperar || esperaReal;
    return conLock(async (conn) => {
        const { modo } = modoDe(opciones);
        const gh = modo === 'publicar' ? clienteDe(opciones) : null;
        const repo = gh ? gh.repo : guarda.repoSitio(env);
        const rama = gh ? gh.rama : guarda.ramaSitio(env);
        const conciliadas = await conciliar(conn, { gh, userId });
        const base = await ultimaOk(conn);
        const [ins] = await conn.query(
            `INSERT INTO sitio_publicaciones (usuario_id, modo, repo, rama, estado) VALUES (?, ?, ?, ?, 'en_curso')`,
            [userId, modo, String(repo).slice(0, 120), String(rama).slice(0, 100)]
        );
        const pubId = ins.insertId;
        let foto = null;
        let cambios = null;
        try {
            const manifiestoBase = base ? base.manifiesto : {};
            foto = await armarFoto(manifiestoBase);
            cambios = clasificar(foto, manifiestoBase);
            if (foto.bloqueos.length) {
                throw err(409, `No se publicó nada: ${foto.bloqueos.join(' ')}`.slice(0, 500), { code: 'SITIO_WEB_BLOQUEADA', seguro: true });
            }
            validarRutas(foto);
            if (modo !== 'publicar') return { ...(await simular(conn, { pubId, foto, base, cambios, userId, repo })), conciliadas };

            const r = await enviarAGithub(conn, { pubId, gh, foto, base, env, esperar });
            const textos = new Map(foto.obras.map(o => [o.id, o.texto]));
            if (r.sinCambios) {
                // El repo ya es la foto completa: solo se ponen al día las filas (si alguna quedó atrás).
                const ahora = new Date();
                await sincronizarPublicado(conn, { textos, pubId, userId, ahora });
                await conn.query(
                    `UPDATE sitio_publicaciones SET estado = 'sin_cambios', commit_sha = NULL, parent_sha = ?, obras_json = ?, obras_incluidas = ?, resumen = ?,
                            finalizado_at = ? WHERE id = ?`,
                    [r.head, JSON.stringify(Object.fromEntries(foto.obras.map(o => [String(o.id), o.hash]))), foto.obras.length,
                        resumir(cambios, [], []), ahora, pubId]
                );
                return resultado({ pubId, modo, estado: 'sin_cambios', repo, foto, cambios, conciliadas });
            }
            const resumen = resumir(cambios, r.escribir, r.borrar);
            await aplicarPublicacion(conn, {
                pubId, textos, manifiesto: foto.manifiesto, borradas: r.borrar, commitSha: r.sha, parentSha: r.head,
                resumen, detalle: detalleDe(cambios, r.escribir, r.borrar), userId,
            });
            return resultado({ pubId, modo, estado: 'ok', repo, commitSha: r.sha, foto, cambios, escribir: r.escribir, borrar: r.borrar, conciliadas });
        } catch (e) {
            return registrarError(conn, { pubId, e, modo, repo, foto, cambios, conciliadas, env });
        }
    });
}

/* ──────────────────────── previa ──────────────────────── */

/**
 * GET /publicacion/previa: lo que haría Publicar, calculado SOLO con la Bóveda (sin GitHub) contra el último
 * manifiesto OK: obras nuevas, cambiadas, retiradas, las que mantienen su versión publicada y las que quedan fuera;
 * archivos a escribir y borrar; lo que bloquea.
 */
async function previa(opciones = {}) {
    const { modo, motivo } = modoDe(opciones);
    const base = await ultimaOk();
    const manifiestoBase = base ? base.manifiesto : {};
    const foto = await armarFoto(manifiestoBase);
    const cambios = clasificar(foto, manifiestoBase);
    const { escribir, borrar } = calcularCambios(foto.archivos, baseDuena(manifiestoBase));
    const avisos = [...foto.avisos];
    if (!base) avisos.unshift('Todavía no hay una publicación ni una importación: si el sitio ya tiene obras, primero «Importar obras del sitio».');
    return {
        modo,
        motivo,
        base: base ? { id: base.id, modo: base.modo, commit_sha: base.commit_sha, created_at: base.created_at } : null,
        cambios,
        archivos: { escribir, borrar },
        obras_incluidas: foto.obras.length,
        bloqueos: foto.bloqueos,
        avisos,
        hay_cambios: escribir.length + borrar.length > 0,
    };
}

/* ──────────────────────── importar (plan 4.11) ──────────────────────── */

/** De dónde se importa: el árbol de main por la API (publicar) o un ZIP del repo (simulación). */
async function fuenteGithub(gh) {
    const head = await gh.leerRef();
    const commit = await gh.leerCommit(head);
    const arbol = await gh.leerArbol(commit.arbol);
    const rutas = new Map([...arbol].map(([r, e]) => [r, e.sha]));
    const cache = new Map();
    return {
        origen: 'github',
        commit: head,
        rutas,
        async leer(r) {
            if (!rutas.has(r)) throw err(409, `No está en el repo: ${r}`, { code: 'SITIO_WEB_IMPORTACION_INVALIDA', seguro: true });
            if (!cache.has(r)) cache.set(r, await gh.leerBlob(rutas.get(r)));
            return cache.get(r);
        },
    };
}

/** 'lols.cl-main/src/content/obras/x.json' → 'src/content/obras/x.json'. Solo lo que importa: los JSON y public/proyectos/<slug>/<archivo>. */
function rutaEnRepo(nombre) {
    const n = String(nombre || '').replace(/\\/g, '/');
    if (n.split('/').some(s => s === '..')) return null;
    const m = n.match(/(?:^|\/)((?:src\/content\/obras|public\/proyectos)\/.+)$/);
    if (!m) return null;
    const r = m[1];
    return cfg.RUTA_JSON_RE.test(r) || /^public\/proyectos\/[a-z0-9]+(?:-[a-z0-9]+)*\/[^/]+$/.test(r) ? r : null;
}

/** CRC-32 (el del ZIP), por partes: se calcula mientras se descomprime. */
const TABLA_CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
const crc32 = (buf, crc = -1) => {
    let c = crc;
    for (let i = 0; i < buf.length; i++) c = TABLA_CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return c;
};

/**
 * Descomprime UNA entrada del ZIP de a poco, con tope de bytes (`tope`): se corta apenas lo pasa, diga lo que diga el
 * ZIP de su tamaño (un ZIP puede mentir). Verifica el CRC al final. Rechaza con { grande } o { danado }.
 */
function descomprimir(f, tope) {
    return new Promise((resolve, reject) => {
        const partes = [];
        let total = 0;
        let crc = -1;
        let listo = false;
        const terminar = (e, b) => { if (listo) return; listo = true; if (e) reject(e); else resolve(b); };
        let s;
        try { s = f.internalStream('uint8array'); } catch { terminar({ danado: true }); return; }
        s.on('data', (chunk) => {
            if (listo) return;
            const b = Buffer.from(chunk);
            total += b.length;
            if (total > tope) { s.pause(); terminar({ grande: true }); return; }
            crc = crc32(b, crc);
            partes.push(b);
        });
        s.on('error', () => terminar({ danado: true }));
        s.on('end', () => {
            const esperado = f._data && Number.isFinite(Number(f._data.crc32)) ? Number(f._data.crc32) >>> 0 : null;
            if (esperado !== null && ((crc ^ -1) >>> 0) !== esperado) terminar({ danado: true });
            else terminar(null, Buffer.concat(partes));
        });
        s.resume();
    });
}

/**
 * La fuente de la importación desde un ZIP del repo. Contra un ZIP armado para colgar el servidor:
 *   · se lee el índice SIN descomprimir nada (sin checkCRC32, que descomprime todo de entrada);
 *   · tope de entradas y de tamaño declarado ANTES de descomprimir;
 *   · se descomprimen solo los JSON y las fotos que esos JSON nombran (más las portadas de la Bóveda), cada una con
 *     su tope que corta en el camino, y el total con el suyo.
 * Los JSON con CRLF (un clon de Windows con core.autocrlf=true) pasan a LF, que es lo que git guarda en el repo con
 * `* text=auto` (así el hash y el manifiesto son los del repo y publicar sin tocar nada no reescribe 27 archivos).
 */
async function fuenteZip(rutaArchivo) {
    cargarDeps();
    const invalido = (m = 'El archivo no es un ZIP del repo lols.cl.') => err(400, m, { code: 'SITIO_WEB_PAQUETE_INVALIDO', seguro: true });
    const buf = await fs.promises.readFile(rutaArchivo);
    if (buf.length < 4 || buf.readUInt32LE(0) !== 0x04034b50) throw invalido();
    let zip;
    try { zip = await JSZip.loadAsync(buf, { checkCRC32: false }); } catch { throw invalido(); }
    const archivos = Object.values(zip.files).filter(f => !f.dir);
    if (archivos.length > MAX_ENTRADAS_ZIP) throw invalido('El ZIP trae demasiados archivos: comprime solo src/content/obras y public/proyectos de lols.cl.');
    const entradas = new Map();   // ruta del repo → entrada del ZIP (todavía sin descomprimir)
    for (const f of archivos) {
        const r = rutaEnRepo(f.name);
        if (!r) continue;
        if (entradas.has(r)) throw invalido(`El ZIP trae dos veces ${r}: comprime una sola copia del repo.`);
        entradas.set(r, f);
    }
    const bytes = new Map();
    let total = 0;
    const leerEntrada = async (r) => {
        const maximo = cfg.RUTA_JSON_RE.test(r) ? MAX_JSON_BYTES : cfg.MAX_BYTES;
        const f = entradas.get(r);
        // Lo que el ZIP DICE que mide, antes de descomprimir (y después, el tope que corta en el camino).
        const declarado = Number(f._data && f._data.uncompressedSize);
        if (!Number.isFinite(declarado) || declarado > maximo) throw invalido(`${r} pasa de ${maximo === MAX_JSON_BYTES ? '64 KB' : '10 MB'}.`);
        let b;
        try {
            b = await descomprimir(f, Math.min(maximo, MAX_TOTAL_ZIP - total));
        } catch (e) {
            if (e && e.grande) throw invalido(total + maximo > MAX_TOTAL_ZIP ? 'El ZIP es demasiado grande.' : `${r} pasa de ${maximo === MAX_JSON_BYTES ? '64 KB' : '10 MB'}.`);
            throw invalido(`${r} está dañado dentro del ZIP.`);
        }
        total += b.length;
        bytes.set(r, b);
    };
    // 1. Los JSON (con su salto de línea como lo guarda git).
    for (const r of [...entradas.keys()].filter(x => cfg.RUTA_JSON_RE.test(x)).sort()) {
        await leerEntrada(r);
        const b = bytes.get(r);
        if (b.includes(0x0d)) bytes.set(r, Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
    }
    if (!bytes.size) throw invalido('El ZIP no trae src/content/obras/*.json de lols.cl.');
    // 2. Solo las fotos que esos JSON nombran y las portadas de la Bóveda: el resto ni se descomprime.
    const nombradas = new Set();
    for (const b of bytes.values()) {
        let j = null;
        try { j = JSON.parse(b.toString('utf8')); } catch { j = null; }   // un JSON roto lo informa leerJsonDelSitio
        for (const foto of (j && Array.isArray(j.fotos) ? j.fotos : [])) for (const u of urlsDeFoto(foto)) nombradas.add(`public${u}`);
    }
    for (const r of [...entradas.keys()].sort()) {
        if (!bytes.has(r) && (nombradas.has(r) || cfg.RUTA_PORTADA_RE.test(r))) await leerEntrada(r);
    }
    return {
        origen: 'zip',
        commit: null,
        rutas: new Map([...bytes].map(([r, b]) => [r, gitBlobSha(b)])),
        async leer(r) {
            if (!bytes.has(r)) throw err(409, `No está en el ZIP: ${r}`, { code: 'SITIO_WEB_IMPORTACION_INVALIDA', seguro: true });
            return bytes.get(r);
        },
    };
}

/** Problemas de un JSON del sitio para importarlo (el build de lols.cl ya lo valida: esto es la red mínima). */
function problemasDelJson(j, slug) {
    const p = [];
    if (!j || typeof j !== 'object' || Array.isArray(j)) return ['no es un objeto JSON'];
    const texto = (k, max, opcional = true) => {
        const v = j[k];
        if (v === null || v === undefined) { if (!opcional) p.push(`falta ${k}`); return; }
        if (typeof v !== 'string' || !v.trim() || v.length > max) p.push(`${k} no es válido`);
    };
    if (j.slug !== slug) p.push('el slug no es el nombre del archivo');
    if (!sitio.slugValido(slug)) p.push('slug no válido o reservado');
    if (!cfg.ESTADO_DESDE_SITIO[j.estado]) p.push('estado desconocido');
    if (!Number.isInteger(j.orden) || j.orden < 0) p.push('orden no válido');
    texto('nombre', cfg.LARGOS.nombre, false);
    texto('titular', cfg.LARGOS.titular);
    texto('mandante', cfg.LARGOS.mandante);
    texto('comuna', cfg.LARGOS.comuna);
    texto('direccion', cfg.LARGOS.direccion);
    texto('inicio', cfg.LARGOS.inicio);
    texto('desafio', cfg.LARGOS.desafio);
    texto('solucion', cfg.LARGOS.solucion);
    texto('resultado', cfg.LARGOS.resultado);
    texto('tipo', 40);
    texto('referencia', 80);
    for (const k of ['superficieM2', 'anio']) if (j[k] !== null && j[k] !== undefined && !Number.isInteger(j[k])) p.push(`${k} no es un entero`);
    if (!Array.isArray(j.servicios) || j.servicios.some(s => typeof s !== 'string') || j.servicios.join(',').length > 200) p.push('servicios no válidos');
    if (!Array.isArray(j.fotos)) p.push('fotos no es una lista');
    else {
        for (const f of j.fotos) {
            if (!f || typeof f.src !== 'string' || !f.src.startsWith(`/proyectos/${slug}/`) || f.src.length > 255) p.push('una foto no está en la carpeta de la obra');
            else if (typeof f.alt !== 'string' || f.alt.length > cfg.LARGOS.alt) p.push('una foto no tiene una descripción válida');
        }
    }
    return p;
}

/** Lee y valida TODOS los JSON de la fuente (antes de escribir nada). */
async function leerJsonDelSitio(fuente) {
    const entradas = [];
    const problemas = [];
    for (const r of [...fuente.rutas.keys()].filter(x => cfg.RUTA_JSON_RE.test(x)).sort()) {
        const slug = r.match(cfg.RUTA_JSON_RE)[1];
        const buf = await fuente.leer(r);
        if (buf.length > MAX_JSON_BYTES) { problemas.push(`${slug}.json: pasa de 64 KB`); continue; }
        if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) { problemas.push(`${slug}.json: trae BOM`); continue; }
        const texto = buf.toString('utf8');
        let json;
        try { json = JSON.parse(texto); } catch { problemas.push(`${slug}.json: no es JSON válido`); continue; }
        const p = problemasDelJson(json, slug);
        if (p.length) { problemas.push(`${slug}.json: ${p.join(', ')}`); continue; }
        entradas.push({ ruta: r, slug, texto, json });
    }
    return { entradas, problemas };
}

/**
 * El manifiesto base que deja una importación o una resincronización: las rutas de la Bóveda que HOY están en el
 * repo. JSON y portadas siempre; el 1.jpg heredado solo si un JSON lo nombra y no es de una carpeta compartida.
 */
function manifiestoDelRepo(fuente, entradas) {
    const nombradas = new Set(entradas.flatMap(e => sitio.rutasDeJson(e.json).slice(1)));
    const manifiesto = {};
    for (const [r, sha] of [...fuente.rutas].sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (!guarda.esRutaDuena(r)) continue;
        if (cfg.RUTA_JSON_RE.test(r) || cfg.RUTA_PORTADA_RE.test(r) || (cfg.RUTA_HEREDADA_RE.test(r) && nombradas.has(r))) manifiesto[r] = sha;
    }
    return manifiesto;
}

/** Ancho y alto de una foto heredada (solo para la pantalla); 0 si sharp no la entiende. */
async function medidas(bytes) {
    try {
        cargarSharp();
        const m = await sharp(bytes, { limitInputPixels: cfg.LIMIT_INPUT_PIXELS }).metadata();
        return { ancho: Number(m.width) || 0, alto: Number(m.height) || 0 };
    } catch {
        return { ancho: 0, alto: 0 };
    }
}

/**
 * Lo de las obras NUEVAS (sin fila en la Bóveda), leído y revisado ANTES de escribir: su fila (desdeJsonDelSitio),
 * los bytes de su portada y los avisos. Devuelve las fotos que faltan (si hay alguna, no se escribe nada).
 */
async function prepararNuevas(fuente, nuevas, avisos) {
    const faltanFotos = [];
    for (const e of nuevas) {
        const { obra, foto } = sitio.desdeJsonDelSitio(e.json);
        Object.assign(e, { obra, foto });
        if (foto) {
            const ruta = `public${foto.heredada_src}`;
            if (!fuente.rutas.has(ruta)) { faltanFotos.push(`${e.slug}: falta ${foto.heredada_src}`); continue; }
            e.bytes = await fuente.leer(ruta);
            if (!e.bytes.length || e.bytes.length > cfg.MAX_BYTES) faltanFotos.push(`${e.slug}: ${foto.heredada_src} vacía o de más de 10 MB`);
        }
        if (sitio.textoJson(sitio.serializarObra(obra, foto)) !== e.texto) {
            avisos.push(`«${e.json.nombre}»: el archivo del sitio no está exactamente en el formato de la Bóveda; la próxima publicación lo reescribe.`);
        }
        if (e.json.fotos.length > 1) avisos.push(`«${e.json.nombre}»: se importó solo la portada (la galería llega en la Fase 2).`);
        const falta = sitio.faltantes(obra, foto);
        if (falta.length) avisos.push(`«${e.json.nombre}» quedó con datos por completar (${faltaTexto(falta)}): se mantiene la versión publicada hasta completarlos.`);
    }
    return faltanFotos;
}

/**
 * Inserta las obras nuevas como YA publicadas (publicado_* = su JSON del repo) con su portada heredada (el 1.jpg tal
 * cual, aprobada: ya estaba en el sitio). Dentro de la transacción de quien llama; `carpetas` junta lo escrito en
 * uploads para borrarlo si algo falla.
 */
async function insertarNuevas(conn, nuevas, { userId, ahora, carpetas, como = 'Importó' }) {
    const importadas = [];
    for (const e of nuevas) {
        const o = e.obra;
        const fila = {
            slug: o.slug, nombre: o.nombre, titular: o.titular, tipo: o.tipo, mandante: o.mandante,
            mandante_autoriza: !!o.mandante_autoriza, mandante_autoriza_por: o.mandante_autoriza ? userId : null,
            mandante_autoriza_at: o.mandante_autoriza ? ahora : null, comuna: o.comuna, direccion: o.direccion,
            superficie_m2: o.superficie_m2, estado: o.estado, anio: o.anio, inicio: o.inicio, servicios: o.servicios,
            desafio: o.desafio, solucion: o.solucion, resultado: o.resultado, referencia: o.referencia, orden: o.orden,
            incluir: true, publicado_hash: sitio.hashTexto(e.texto), publicado_json: e.texto, publicado_at: ahora,
            creado_por: userId, actualizado_por: userId,
        };
        const cols = Object.keys(fila);
        const [r] = await conn.query(`INSERT INTO sitio_obras (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, Object.values(fila));
        const id = r.insertId;
        await registrar(conn, { sitio_obra_id: id, entidad: 'obra', entidad_id: id, accion: 'importar',
            resumen: `${como} «${o.nombre}» desde el sitio (ya estaba publicada)${o.mandante_autoriza ? '; el mandante ya figuraba en el sitio' : ''}`,
            usuario_id: userId });
        if (e.foto) {
            const hash = sha256(e.bytes);
            const ruta = `sitio-web/${id}/${hash}`;
            const destino = fotosSvc.rutaAbsoluta(ruta, cfg.ARCHIVOS_FOTO.maestra);
            if (!destino) throw err(500, 'Ruta de foto inválida.');
            await fs.promises.mkdir(path.dirname(destino), { recursive: true });
            carpetas.push(path.dirname(destino));
            await fs.promises.writeFile(destino, e.bytes);
            const { ancho, alto } = await medidas(e.bytes);
            const [rf] = await conn.query(
                `INSERT INTO sitio_obra_fotos (sitio_obra_id, rol, orden, alt, ruta, heredada_src, hash, ancho, alto, tamano_bytes, subido_por,
                                               sin_personas_confirmado, confirmado_por, confirmado_at, aprobada_por, aprobada_at, aprobada_hash)
                 VALUES (?, 'portada', 0, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
                [id, e.foto.alt, ruta, e.foto.heredada_src, hash, ancho, alto, e.bytes.length, userId, userId, ahora, userId, ahora, hash]
            );
            await registrar(conn, { sitio_obra_id: id, entidad: 'foto', entidad_id: rf.insertId, accion: 'importar',
                resumen: `Portada importada del sitio (ya estaba publicada): revisar que nadie sea reconocible`,
                detalle: { src: e.foto.heredada_src }, usuario_id: userId });
        }
        importadas.push({ id, slug: o.slug, nombre: o.nombre });
    }
    return importadas;
}

const ordenarManifiesto = (m) => Object.fromEntries(Object.entries(m).sort(([a], [b]) => (a < b ? -1 : 1)));

async function importarDesde(conn, fuente, { userId, modo, repo, rama }) {
    const { entradas, problemas } = await leerJsonDelSitio(fuente);
    if (problemas.length) {
        throw err(409, `No se importó nada: ${problemas.slice(0, 5).join('; ')}${problemas.length > 5 ? ` (y ${problemas.length - 5} más)` : ''}.`,
            { code: 'SITIO_WEB_IMPORTACION_INVALIDA', details: { problemas: problemas.slice(0, 50) }, seguro: true });
    }
    const slugs = entradas.map(e => e.slug);
    const [ya] = slugs.length ? await conn.query('SELECT id, slug, nombre, publicado_hash FROM sitio_obras WHERE slug IN (?)', [slugs]) : [[]];
    const existentes = new Map(ya.map(x => [x.slug, x]));
    const nuevas = entradas.filter(e => !existentes.has(e.slug));
    const avisos = [];
    for (const e of entradas.filter(x => existentes.has(x.slug) && !existentes.get(x.slug).publicado_hash)) {
        avisos.push(`«${e.slug}» ya existía en la Bóveda (creada a mano): no se importó. La próxima publicación reemplaza (o retira) el archivo del sitio con lo de la Bóveda.`);
    }
    const base = await ultimaOk(conn);
    if (!nuevas.length && base) {
        return { publicacion_id: null, importadas: [], ya_estaban: entradas.length, avisos, commit_sha: fuente.commit };
    }

    const faltanFotos = await prepararNuevas(fuente, nuevas, avisos);
    if (faltanFotos.length) {
        throw err(409, `No se importó nada: ${faltanFotos.slice(0, 5).join('; ')}.`, { code: 'SITIO_WEB_IMPORTACION_INVALIDA', details: { problemas: faltanFotos }, seguro: true });
    }

    // La base que queda. Si ya había una (otra importación), solo se SUMAN las rutas de las obras nuevas: lo de las que
    // ya estaban tiene que seguir igual a esa base. Reemplazarla entera taparía un cambio a mano en el repo (la guarda
    // REPO_MODIFICADO dejaría de verlo y la próxima publicación lo pisaría con la versión vieja de la Bóveda).
    const delRepo = manifiestoDelRepo(fuente, entradas);
    let manifiesto = delRepo;
    if (base) {
        const deNuevas = new Set(nuevas.flatMap(e => sitio.rutasDeJson(e.json)).filter(r => hasOwn(delRepo, r)));
        const previo = baseDuena(base.manifiesto);
        const distintas = rutasDistintas(Object.fromEntries(Object.entries(delRepo).filter(([r]) => !deNuevas.has(r))), previo);
        if (distintas.length && modo === 'publicar') throw errRepoModificado(distintas);
        if (distintas.length) {
            avisos.push(`El ZIP no coincide con lo importado antes en ${distintas.length} archivo(s) de obras que ya estaban (${distintas.slice(0, 3).join(', ')}${distintas.length > 3 ? '…' : ''}): se mantiene lo importado antes y solo se suman las obras nuevas.`);
        }
        manifiesto = ordenarManifiesto({ ...previo, ...Object.fromEntries([...deNuevas].map(r => [r, delRepo[r]])) });
    }

    const ahora = new Date();
    const carpetas = [];
    await conn.beginTransaction();
    try {
        const importadas = await insertarNuevas(conn, nuevas, { userId, ahora, carpetas });
        const [pubs] = await conn.query('SELECT id, publicado_hash FROM sitio_obras WHERE publicado_hash IS NOT NULL');
        const obrasJson = Object.fromEntries(pubs.map(p => [String(p.id), p.publicado_hash]));
        const resumen = `Importación desde el sitio${fuente.commit ? ` (main ${corto(fuente.commit)})` : ' (ZIP)'}: ${importadas.length} obra(s) nuevas, ${entradas.length - nuevas.length} ya estaban`;
        const [rp] = await conn.query(
            `INSERT INTO sitio_publicaciones (usuario_id, modo, repo, rama, estado, commit_sha, manifiesto, manifiesto_previsto, obras_json,
                                              obras_incluidas, resumen, en_linea_at, finalizado_at)
             VALUES (?, 'importacion', ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, String(repo).slice(0, 120), String(rama).slice(0, 100), fuente.commit, JSON.stringify(manifiesto), JSON.stringify(manifiesto),
                JSON.stringify(obrasJson), pubs.length, resumen.slice(0, 500), ahora, ahora]
        );
        await registrar(conn, { entidad: 'publicacion', entidad_id: rp.insertId, accion: 'importar',
            resumen: `${resumen} (modo ${modo})`, detalle: { importadas: importadas.map(x => x.slug), archivos: Object.keys(manifiesto).length }, usuario_id: userId });
        await conn.commit();
        return { publicacion_id: rp.insertId, importadas, ya_estaban: entradas.length - nuevas.length, avisos, commit_sha: fuente.commit };
    } catch (e) {
        await conn.rollback().catch(() => {});
        for (const c of carpetas) fs.rmSync(c, { recursive: true, force: true });
        throw e;
    }
}

/**
 * POST /publicaciones/importar (`sitio_web.publicar`): las obras que hoy tiene lols.cl pasan a la Bóveda, una vez e
 * idempotente por slug. Publicar → desde main por la API; simulación → desde un ZIP del repo (leído ANTES del lock:
 * uno pesado no frena a nadie). Antes que nada se concilia una publicación real que quedó a medias (si su commit
 * entró, ESA es la base). Después de la primera publicación real ya no se importa (409): el camino es Resincronizar.
 */
async function importar({ userId, archivo = null, ...opciones } = {}) {
    const env = opciones.env || process.env;
    try {
        const { modo } = modoDe(opciones);
        let zip = null;
        if (modo === 'publicar') {
            if (archivo) throw err(400, 'Con el sitio real conectado, las obras se importan directo del repo (sin ZIP).', { code: 'SITIO_WEB_PAQUETE_NO_VA' });
        } else {
            if (!archivo || !archivo.path) {
                throw err(400, 'En simulación las obras se importan desde un ZIP del repo lols.cl (con src/content/obras y public/proyectos).',
                    { code: 'SITIO_WEB_SIN_PAQUETE' });
            }
            zip = await fuenteZip(archivo.path);
        }
        return await conLock(async (conn) => {
            const gh = modo === 'publicar' ? clienteDe(opciones) : null;
            await conciliar(conn, { gh, userId });
            const [[real]] = await conn.query(
                `SELECT id, estado FROM sitio_publicaciones
                  WHERE modo = 'publicar' AND estado IN ('ok', 'en_curso') AND commit_sha IS NOT NULL ORDER BY id DESC LIMIT 1`
            );
            if (real && real.estado === 'ok') {
                throw err(409, 'La Bóveda ya publicó en el sitio: importar de nuevo pisaría lo publicado. Si el repo cambió a mano, usa «Resincronizar».',
                    { code: 'SITIO_WEB_YA_PUBLICADO' });
            }
            if (real) {
                // Su commit pudo haber entrado: importar ahora dejaría una base que no lo cuenta y la próxima publicación,
                // al confirmarlo, borraría lo importado. Sin GitHub (simulación) no hay cómo confirmarlo aquí.
                throw err(409, 'Hay una publicación real al sitio que quedó a medias y no se pudo confirmar: no se importó nada. Publica de nuevo con el sitio conectado (la confirma sola) o avisa a Mauricio.',
                    { code: 'SITIO_WEB_YA_PUBLICADO' });
            }
            const fuente = zip || await fuenteGithub(gh);
            return importarDesde(conn, fuente, { userId, modo, repo: guarda.repoSitio(env), rama: guarda.ramaSitio(env) });
        });
    } finally {
        if (archivo && archivo.path) await fs.promises.unlink(archivo.path).catch(() => { /* ya no estaba */ });
    }
}

/* ──────────────────────── resincronizar (plan 7.2) ──────────────────────── */

/**
 * POST /publicaciones/resincronizar (`sitio_web.publicar`, confirmo = true), tras un cambio a mano en el repo (un
 * `git revert` de emergencia): el repo pasa a ser el manifiesto base.
 *   · cada obra con su JSON en el repo: `publicado_*` = ese JSON (si es distinto de lo de la Bóveda, queda «cambios»);
 *   · una obra publicada cuyo JSON ya no está: `incluir = 0` y `publicado_*` en null, con aviso;
 *   · una obra del repo que la Bóveda no tiene (agregada a mano): se importa como en «Importar», con aviso;
 *   · las fotos que estaban publicadas y ya no están en el repo quedan RECHAZADAS (no vuelven a salir solas).
 * Solo con el sitio real (en simulación no hay repo que leer).
 */
async function resincronizar({ userId, ...opciones } = {}) {
    const env = opciones.env || process.env;
    return conLock(async (conn) => {
        const { modo } = modoDe(opciones);
        if (modo !== 'publicar') {
            throw err(409, 'Resincronizar lee el repo real del sitio: en simulación no hay repo que leer.', { code: 'SITIO_WEB_SOLO_PUBLICAR' });
        }
        const gh = clienteDe(opciones);
        const conciliadas = await conciliar(conn, { gh, userId });
        const fuente = await fuenteGithub(gh);
        const { entradas, problemas } = await leerJsonDelSitio(fuente);
        const porSlug = new Map(entradas.map(e => [e.slug, e]));
        const avisos = problemas.map(p => `En el repo hay un archivo que la Bóveda no entiende (${p}): la próxima publicación lo reemplaza o lo borra.`);
        const [filas] = await conn.query('SELECT id, slug, nombre, incluir, publicado_hash, publicado_json FROM sitio_obras ORDER BY id ASC');
        const ids = filas.map(f => f.id);
        const [fotos] = ids.length
            ? await conn.query('SELECT id, sitio_obra_id, hash, heredada_src, rechazada_at FROM sitio_obra_fotos WHERE sitio_obra_id IN (?)', [ids])
            : [[]];
        // Una obra que está en el repo y la Bóveda nunca tuvo (la agregaron a mano): se IMPORTA. Si solo quedara en el
        // manifiesto base, la próxima publicación la retiraría con su foto (una publicación de la Bóveda nunca retira
        // una obra que la Bóveda no tuvo).
        const conFila = new Set(filas.map(f => f.slug));
        const sinFila = entradas.filter(e => !conFila.has(e.slug));
        const faltanFotos = await prepararNuevas(fuente, sinFila, avisos);
        if (faltanFotos.length) {
            throw err(409, `No se resincronizó nada: en el repo hay obras que la Bóveda no tiene y nombran una foto que no está (${faltanFotos.slice(0, 5).join('; ')}). Avisa a Mauricio.`,
                { code: 'SITIO_WEB_IMPORTACION_INVALIDA', details: { problemas: faltanFotos }, seguro: true });
        }
        const ahora = new Date();
        const actualizadas = []; const quitadas = []; const rechazadas = [];
        const carpetas = [];
        let importadas = [];
        await conn.beginTransaction();
        try {
            for (const f of filas) {
                const e = porSlug.get(f.slug);
                // Fotos que estaban publicadas y ya no están en el repo: quedan rechazadas.
                const previas = (((leer(f.publicado_json) || {}).fotos) || []).flatMap(urlsDeFoto);
                const idas = previas.filter(u => !fuente.rutas.has(`public${u}`));
                for (const ft of fotos.filter(x => x.sitio_obra_id === f.id && !x.rechazada_at)) {
                    const coincide = ft.heredada_src ? idas.includes(ft.heredada_src) : idas.some(u => u.includes(`/portada.${String(ft.hash).slice(0, 8)}-`));
                    if (!coincide) continue;
                    await conn.query(
                        'UPDATE sitio_obra_fotos SET rechazada_por = ?, rechazada_at = ?, aprobada_por = NULL, aprobada_at = NULL, aprobada_hash = NULL WHERE id = ?',
                        [userId, ahora, ft.id]
                    );
                    await registrar(conn, { sitio_obra_id: f.id, entidad: 'foto', entidad_id: ft.id, accion: 'rechazar',
                        resumen: `Resincronizar: la foto ya no está en el sitio (cambio a mano en el repo); queda rechazada`, usuario_id: userId });
                    rechazadas.push({ id: ft.id, sitio_obra_id: f.id });
                }
                if (e) {
                    const h = sitio.hashTexto(e.texto);
                    if (f.publicado_hash === h) continue;
                    await conn.query('UPDATE sitio_obras SET publicado_hash = ?, publicado_json = ?, publicado_at = ?, updated_at = updated_at WHERE id = ?',
                        [h, e.texto, ahora, f.id]);
                    await registrar(conn, { sitio_obra_id: f.id, entidad: 'obra', entidad_id: f.id, accion: 'resincronizar',
                        resumen: `Resincronizar: el sitio tiene otra versión de «${f.nombre}»; queda como la publicada`, usuario_id: userId });
                    actualizadas.push({ id: f.id, slug: f.slug, nombre: f.nombre });
                } else if (f.publicado_hash) {
                    await conn.query(
                        'UPDATE sitio_obras SET incluir = 0, publicado_hash = NULL, publicado_json = NULL, publicado_at = NULL, updated_at = updated_at WHERE id = ?',
                        [f.id]
                    );
                    await registrar(conn, { sitio_obra_id: f.id, entidad: 'obra', entidad_id: f.id, accion: 'resincronizar',
                        resumen: `Resincronizar: «${f.nombre}» ya no está en el sitio; quedó fuera (revisarla antes de volver a incluirla)`, usuario_id: userId });
                    quitadas.push({ id: f.id, slug: f.slug, nombre: f.nombre });
                    avisos.push(`«${f.nombre}» ya no está en el sitio: quedó fuera. Revísala antes de volver a incluirla.`);
                }
            }
            importadas = await insertarNuevas(conn, sinFila, { userId, ahora, carpetas, como: 'Resincronizar: importó' });
            for (const x of importadas) avisos.push(`«${x.nombre}» estaba en el sitio y no en la Bóveda (la agregaron a mano): quedó importada. Revísala.`);
            const manifiesto = manifiestoDelRepo(fuente, entradas);
            const [pubs] = await conn.query('SELECT id, publicado_hash FROM sitio_obras WHERE publicado_hash IS NOT NULL');
            const resumen = `Resincronizada con el repo (main ${corto(fuente.commit)}): ${actualizadas.length} obra(s) al día, ${importadas.length} importadas, ${quitadas.length} quitadas, ${rechazadas.length} foto(s) rechazadas`;
            const [rp] = await conn.query(
                `INSERT INTO sitio_publicaciones (usuario_id, modo, repo, rama, estado, commit_sha, manifiesto, manifiesto_previsto, obras_json,
                                                  obras_incluidas, resumen, en_linea_at, finalizado_at)
                 VALUES (?, 'importacion', ?, ?, 'ok', ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, gh.repo.slice(0, 120), gh.rama.slice(0, 100), fuente.commit, JSON.stringify(manifiesto), JSON.stringify(manifiesto),
                    JSON.stringify(Object.fromEntries(pubs.map(p => [String(p.id), p.publicado_hash]))), pubs.length, resumen.slice(0, 500), ahora, ahora]
            );
            await registrar(conn, { entidad: 'publicacion', entidad_id: rp.insertId, accion: 'resincronizar', resumen,
                detalle: { actualizadas, importadas, quitadas, rechazadas }, usuario_id: userId });
            await conn.commit();
            return { publicacion_id: rp.insertId, commit_sha: fuente.commit, actualizadas, importadas, quitadas, fotos_rechazadas: rechazadas, avisos, conciliadas };
        } catch (e) {
            await conn.rollback().catch(() => {});
            for (const c of carpetas) fs.rmSync(c, { recursive: true, force: true });
            throw e;
        }
    });
}

/* ──────────────────────── lecturas ──────────────────────── */

/** GET /pendientes (badge de quien publica): fotos por aprobar, obras con algo por publicar y el último error. */
async function pendientes() {
    const obras = await sitio.listarObras();
    const [[u]] = await db.query(
        `SELECT id, modo, estado, error_codigo, error_mensaje, build_estado, en_linea_at, created_at FROM sitio_publicaciones
          WHERE estado IN ('ok', 'error') AND modo <> 'importacion' ORDER BY id DESC LIMIT 1`
    );
    // Una compilación que falló deja de ser problema si el sitio igual la muestra (corrida repetida o push posterior).
    const conError = u && (u.estado === 'error' || (u.build_estado === 'fallo' && !u.en_linea_at));
    return {
        fotosPorAprobar: obras.reduce((n, o) => n + (Number(o.fotos_por_aprobar) || 0), 0),
        obrasConCambios: obras.filter(o => ['listo', 'cambios', 'retiro_pendiente'].includes(o.estadoDerivado)).length,
        ultimaConError: conError ? {
            id: u.id, modo: u.modo, estado: u.estado, error_codigo: u.error_codigo, error_mensaje: u.error_mensaje,
            build_estado: u.build_estado, created_at: u.created_at,
        } : null,
    };
}

const paqueteExiste = (id) => fs.existsSync(path.join(DIR_PAQUETES, `${id}.zip`));

function publicacionParaPantalla(p, nombres) {
    return {
        id: p.id,
        modo: p.modo,
        estado: p.estado,
        usuario_nombre: nombres.get(p.usuario_id) ?? null,
        commit_sha: p.commit_sha,
        // Solo el commit que entró (uno de un intento fallido nunca llegó a main).
        url_commit: p.commit_sha && p.modo === 'publicar' && ['ok', 'en_curso'].includes(p.estado) ? `https://github.com/${p.repo}/commit/${p.commit_sha}` : null,
        obras_incluidas: p.obras_incluidas,
        resumen: p.resumen,
        error_codigo: p.error_codigo,
        error_mensaje: p.error_mensaje,
        build_estado: p.build_estado,
        build_url: p.build_url,
        en_linea_at: p.en_linea_at,
        created_at: p.created_at,
        finalizado_at: p.finalizado_at,
        tiene_paquete: p.estado === 'simulada' && paqueteExiste(p.id),
    };
}

async function nombresDe(ids) {
    const unicos = [...new Set(ids.filter(Boolean))];
    if (!unicos.length) return new Map();
    const [us] = await db.query('SELECT id, nombre FROM usuarios WHERE id IN (?)', [unicos]);
    return new Map(us.map(u => [u.id, u.nombre]));
}

/** GET /publicaciones: las últimas 20 (sin llamar a GitHub). */
async function listarPublicaciones() {
    const [filas] = await db.query(
        `SELECT id, usuario_id, modo, repo, estado, commit_sha, obras_incluidas, resumen, error_codigo, error_mensaje, build_estado, build_url,
                en_linea_at, created_at, finalizado_at
           FROM sitio_publicaciones ORDER BY id DESC LIMIT 20`
    );
    const nombres = await nombresDe(filas.map(f => f.usuario_id));
    return filas.map(f => publicacionParaPantalla(f, nombres));
}

/** ¿Ya no hay nada que preguntar de esta publicación? En línea con la compilación terminada, o no es una real OK. */
const buildTerminado = (p) => p.modo !== 'publicar' || p.estado !== 'ok' || (!!p.en_linea_at && BUILD_FINAL.includes(p.build_estado));

/**
 * Pone al día la compilación y el «en línea» de una publicación real (plan 4.7.9). Solo mientras no terminó y
 * con el sitio real conectado. Nunca hace fallar la lectura: si GitHub o el sitio no responden, queda como estaba.
 *   · Mientras el sitio no la muestre, la compilación se vuelve a preguntar aunque haya fallado (una corrida repetida
 *     con «Re-run» puede terminar bien) — «en línea» manda sobre «falló».
 *   · «reemplazada» (otro push a main canceló su corrida): lo que decide es la compilación del head actual, que la
 *     contiene. Si esa falló, el sitio no la muestra → «fallo» (no llegó); si sigue andando, se espera.
 */
async function actualizarBuild(p, opciones) {
    if (p.modo !== 'publicar' || p.estado !== 'ok' || !SHA_RE.test(String(p.commit_sha || ''))) return { cambio: false };
    if (buildTerminado(p)) return { cambio: false };
    if (modoDe(opciones).modo !== 'publicar') return { cambio: false, aviso: 'Sin conexión con GitHub en este entorno: el estado de la compilación no se actualiza.' };
    try {
        const gh = clienteDe(opciones);
        let build = p.build_estado;
        let url = p.build_url;
        if (!p.en_linea_at || !BUILD_FINAL.includes(build)) {
            ({ estado: build, url } = await gh.estadoBuild(p.commit_sha));
            if (build === 'reemplazada') {
                const head = await gh.leerRef();
                if (head !== p.commit_sha && await gh.contiene(p.commit_sha, head)) {
                    const siguiente = await gh.estadoBuild(head);
                    if (siguiente.estado === 'fallo') ({ estado: build, url } = siguiente);
                }
            }
        }
        let enLineaAt = p.en_linea_at;
        if (!enLineaAt) {
            const sitioAhora = await enLinea.leerEnLinea({ env: opciones.env || process.env, fetchImpl: opciones.fetchImpl || globalThis.fetch });
            const sha = sitioAhora.build;
            // Con build.txt desconocido no se pregunta nada más. Igual al padre = el sitio sigue en la versión anterior.
            if (sha && (sha === p.commit_sha || (sha !== p.parent_sha && await gh.contiene(p.commit_sha, sha)))) enLineaAt = new Date();
        }
        if (build === p.build_estado && url === p.build_url && enLineaAt === p.en_linea_at) return { cambio: false };
        await db.query('UPDATE sitio_publicaciones SET build_estado = ?, build_url = ?, en_linea_at = ? WHERE id = ?', [build, url, enLineaAt, p.id]);
        Object.assign(p, { build_estado: build, build_url: url, en_linea_at: enLineaAt });
        return { cambio: true };
    } catch (e) {
        logger.warn('Sitio web: no se pudo actualizar la compilación', { id: p.id, codigo: e.code || null });
        return { cambio: false, aviso: e.seguro ? e.message : 'No se pudo consultar el estado de la compilación.' };
    }
}

/** Cuándo se preguntó por última vez por cada publicación (por proceso): las listas no consultan GitHub a cada rato. */
const REFRESCO_MS = 20000;
let ultimoRefresco = new Map();   // `${id}:${commit_sha}` → ms

/**
 * Antes de servir GET /obras, /publicaciones o /pendientes: pone al día la compilación y el «en línea» de la última
 * publicación real, si todavía no terminó (a lo más cada 20 s). Así una compilación fallida se ve en la lista, el
 * aviso rojo y el número del menú aunque nadie abra esa publicación. Nunca falla ni demora la lectura más que lo que
 * tarde GitHub; en simulación no hace nada (ni toca la base).
 */
async function refrescarCompilacion(opciones = {}) {
    try {
        if (modoDe(opciones).modo !== 'publicar') return { refrescada: false };
        const [[p]] = await db.query(
            `SELECT id, modo, estado, commit_sha, parent_sha, build_estado, build_url, en_linea_at FROM sitio_publicaciones
              WHERE estado = 'ok' ORDER BY id DESC LIMIT 1`
        );
        if (!p || buildTerminado(p)) return { refrescada: false };
        const clave = `${p.id}:${p.commit_sha}`;
        const ahora = Date.now();
        if (ahora - (ultimoRefresco.get(clave) || 0) < REFRESCO_MS) return { refrescada: false };
        ultimoRefresco.set(clave, ahora);
        const { cambio } = await actualizarBuild(p, opciones);
        return { refrescada: true, cambio };
    } catch (e) {
        logger.warn('Sitio web: no se pudo refrescar la compilación', { codigo: e.code || null });
        return { refrescada: false };
    }
}
const limpiarRefresco = () => { ultimoRefresco = new Map(); };

/** GET /publicaciones/:id: la publicación, sus pasos y sus cambios; actualiza la compilación y el «en línea». */
async function detallePublicacion(id, opciones = {}) {
    if (!Number.isInteger(id) || id < 1) throw err(404, 'Publicación no encontrada');
    const [[p]] = await db.query('SELECT * FROM sitio_publicaciones WHERE id = ?', [id]);
    if (!p) throw err(404, 'Publicación no encontrada');
    const { aviso = null } = await actualizarBuild(p, opciones);
    const [[h]] = await db.query(
        `SELECT id, detalle FROM sitio_web_historial WHERE entidad = 'publicacion' AND entidad_id = ? ORDER BY id DESC LIMIT 1`, [id]
    );
    const nombres = await nombresDe([p.usuario_id]);
    const real = p.modo === 'publicar';
    const pasos = real && ['ok', 'en_curso'].includes(p.estado) ? [
        { clave: 'commit', estado: p.estado === 'ok' ? 'ok' : 'pendiente' },
        { clave: 'compilacion', estado: p.build_estado || 'pendiente' },
        { clave: 'en_linea', estado: p.en_linea_at ? 'ok' : (p.build_estado === 'fallo' ? 'no_llego' : 'pendiente') },
    ] : [];
    return {
        ...publicacionParaPantalla(p, nombres),
        repo: p.repo,
        rama: p.rama,
        parent_sha: p.parent_sha,
        pasos,
        // La pantalla deja de consultar en línea o con la falla confirmada (las listas la siguen poniendo al día:
        // una corrida repetida que sale bien la lleva a «en línea»).
        terminada: buildTerminado(p) || p.build_estado === 'fallo',
        detalle: h ? leer(h.detalle) : null,
        aviso,
    };
}

/** GET /publicaciones/:id/paquete: el ZIP de una simulación (los últimos 10 se guardan). */
async function paquete(id) {
    if (!Number.isInteger(id) || id < 1) throw err(404, 'Publicación no encontrada');
    const [[p]] = await db.query('SELECT id, modo, estado FROM sitio_publicaciones WHERE id = ?', [id]);
    if (!p) throw err(404, 'Publicación no encontrada');
    if (p.estado !== 'simulada') throw err(404, 'Esta publicación no tiene paquete: solo lo tienen las simulaciones con cambios.');
    if (!paqueteExiste(id)) throw err(404, 'El paquete ya no está (se guardan los últimos 10): vuelve a simular.');
    return { rel: `${id}.zip`, root: DIR_PAQUETES, nombre: `lols-cl-simulacion-${id}.zip` };
}

const api = { publicar, previa, importar, resincronizar, pendientes, listarPublicaciones, detallePublicacion, paquete };
const envuelto = { ...Object.fromEntries(Object.entries(api).map(([k, fn]) => [k, conTablas(fn)])), refrescarCompilacion };

module.exports = {
    ...envuelto,
    // Puras, para los tests.
    esDuena, duenasDelArbol, rutasDistintas, calcularCambios, fotoRechazadaEn, rutaEnRepo, problemasDelJson, manifiestoDelRepo,
    autorCommit, podarPaquetes,
    _interno: {
        armarFoto, clasificar, conciliar, ultimaOk, fuenteZip, importarDesde, limpiarRefresco,
        LOCK, INTENTOS, DIR_PAQUETES, PAQUETES_A_GUARDAR, REFRESCO_MS,
    },
};

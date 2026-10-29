const crypto = require('crypto');
const logger = require('../utils/logger-structured');
const guarda = require('./sitioWebGuarda');

/**
 * Sitio web — cliente mínimo de la API de GitHub para el repo de lols.cl (mig 147, plan 4.4 y 4.7,
 * docs/reglas/sitio-web.md). Solo la Git Data API (blobs → tree con base_tree → commit → PATCH de la rama con
 * force:false: UN commit atómico por publicación), `compare` y las corridas de Actions (lectura).
 *
 * Seguridad:
 *   · el token (GITHUB_TOKEN_SITIO) se lee al hacer cada llamada (sitioWebGuarda.tokenSitio) y va SOLO en el
 *     header Authorization: nunca en una URL, un log, una respuesta ni un mensaje de error. Si tiene caracteres
 *     raros ni se intenta (un header inválido haría que fetch lo repitiera en su error);
 *   · los errores son textos fijos en castellano con su `code`: nunca llevan headers ni la respuesta cruda;
 *   · cada ruta que se escribe o se borra pasa por sitioWebGuarda.rutaPermitida ANTES de llamar (crearArbol);
 *   · redirect:'manual' (un 3xx es un error: el token no viaja a otra parte) y 30 s de tope por llamada.
 *
 * `fetchImpl` y `esperar` se inyectan (patrón de feriados.service): los tests no tocan la red ni esperan.
 */

const API = 'https://api.github.com';
// Versión de la REST API. REVISAR cuando GitHub anuncie su retiro (avisa con 24 meses).
const API_VERSION = '2022-11-28';
const USER_AGENT = 'BovedaLOLS-SitioWeb/1.0';
const TIMEOUT_MS = 30000;
/** Lo más que se espera a GitHub cuando pide `retry-after` (la publicación tiene 120 s en total). */
const ESPERA_MAX_MS = 10000;
const SHA_RE = /^[0-9a-f]{40}$/;
const TOKEN_RE = /^[A-Za-z0-9_]{20,255}$/;
const RAMA_RE = /^[A-Za-z0-9._/-]{1,100}$/;
const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
/** El workflow del sitio que compila y publica (lols.cl/.github/workflows/deploy.yml). */
const WORKFLOW = '.github/workflows/deploy.yml';

/** Error con `code` y texto seguro (sin token, headers ni respuesta). `seguro` = el mensaje se puede mostrar. */
const err = (statusCode, message, code, extra = {}) => Object.assign(new Error(message), { statusCode, code, seguro: true, ...extra });

const esperaReal = (ms) => new Promise(r => setTimeout(r, ms));

/** SHA-1 de git para un blob: sha1("blob <bytes>\0" + contenido). Es el que GitHub le da al archivo. */
function gitBlobSha(contenido) {
    const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), 'utf8');
    return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
}

const shaOFalla = (sha, que) => {
    if (!SHA_RE.test(String(sha || ''))) throw err(502, `GitHub devolvió un ${que} que no se entiende.`, 'SITIO_WEB_GITHUB_ERROR');
    return sha;
};

/** Segundos de espera que pide GitHub (retry-after, o el reset del límite), en ms; null si no pidió nada. */
function esperaPedida(res, ahora = Date.now()) {
    const h = (k) => (res.headers && typeof res.headers.get === 'function' ? res.headers.get(k) : null);
    const retry = h('retry-after');
    const ra = retry === null || retry === '' ? NaN : Number(retry);
    if (Number.isFinite(ra) && ra >= 0) return ra * 1000;
    if (h('x-ratelimit-remaining') === '0') {
        const reset = Number(h('x-ratelimit-reset'));
        return Number.isFinite(reset) ? Math.max(0, reset * 1000 - ahora) : ESPERA_MAX_MS + 1;
    }
    return null;
}

/**
 * Cliente para el repo y la rama configurados (GITHUB_REPO_SITIO / GITHUB_BRANCH_SITIO). Quien lo crea ya
 * pasó por sitioWebGuarda.modoEfectivo: aquí solo se revisa que el destino tenga una forma válida.
 */
function crearCliente({ env = process.env, fetchImpl = globalThis.fetch, esperar = esperaReal } = {}) {
    const repo = guarda.repoSitio(env).replace(/\.git$/i, '');
    const rama = guarda.ramaSitio(env);
    if (!REPO_RE.test(repo) || !RAMA_RE.test(rama) || rama.includes('..')) {
        throw err(424, 'El repo o la rama del sitio están mal configurados (GITHUB_REPO_SITIO / GITHUB_BRANCH_SITIO). Avisa a Mauricio.', 'SITIO_WEB_SIN_ACCESO');
    }

    /**
     * Una llamada a la API. `permitir404` = un 404 devuelve null (un commit que GitHub no conoce en compare).
     * Errores: 401 → 424 TOKEN_INVALIDO; 403/404/3xx → 424 SIN_ACCESO; 429 o límite → espera una vez (≤ 10 s) o
     * 503 GITHUB_LIMITE; 422 → 409 GITHUB_RECHAZO (moverRef lo traduce); 5xx → 502; timeout → 504.
     */
    async function gh(metodo, ruta, body, { permitir404 = false } = {}) {
        const token = guarda.tokenSitio(env);
        if (!token || !TOKEN_RE.test(token)) {
            throw err(424, 'El token del sitio falta o no tiene la forma de un token de GitHub. Avisa a Mauricio para renovarlo.', 'SITIO_WEB_TOKEN_INVALIDO');
        }
        const url = `${API}/repos/${repo}${ruta}`;
        for (let intento = 0; ; intento++) {
            let res;
            try {
                res = await fetchImpl(url, {
                    method: metodo,
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/vnd.github+json',
                        'X-GitHub-Api-Version': API_VERSION,
                        'User-Agent': USER_AGENT,
                        ...(body ? { 'Content-Type': 'application/json' } : {}),
                    },
                    body: body ? JSON.stringify(body) : undefined,
                    redirect: 'manual',
                    signal: AbortSignal.timeout(TIMEOUT_MS),
                });
            } catch (e) {
                if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) {
                    throw err(504, 'GitHub no respondió a tiempo (30 s). Vuelve a intentar en unos minutos.', 'SITIO_WEB_GITHUB_TIMEOUT');
                }
                // Solo el tipo: el mensaje de un error de red podría traer los headers.
                logger.warn('Sitio web: no se pudo conectar con GitHub', { metodo, tipo: (e && e.name) || 'desconocido' });
                throw err(502, 'No se pudo conectar con GitHub. Vuelve a intentar en unos minutos.', 'SITIO_WEB_GITHUB_ERROR');
            }
            const s = res.status;
            if (s >= 200 && s < 300) {
                if (s === 204) return null;
                try { return await res.json(); } catch {
                    throw err(502, 'GitHub respondió algo que no se entiende.', 'SITIO_WEB_GITHUB_ERROR');
                }
            }
            const espera = (s === 403 || s === 429) ? esperaPedida(res) : null;
            if (espera !== null) {
                if (intento === 0 && espera <= ESPERA_MAX_MS) { await esperar(espera); continue; }
                throw err(503, 'GitHub pidió esperar antes de seguir (límite de uso). Vuelve a intentar en unos minutos.', 'SITIO_WEB_GITHUB_LIMITE');
            }
            logger.warn('Sitio web: GitHub respondió con error', { metodo, status: s });
            if (s === 401) {
                throw err(424, 'GitHub rechazó el token del sitio (vencido o revocado). Avisa a Mauricio para renovarlo.', 'SITIO_WEB_TOKEN_INVALIDO');
            }
            if (s === 404 && permitir404) return null;
            if (s === 403 || s === 404 || (s >= 300 && s < 400)) {
                throw err(424, 'El token no tiene acceso al repo o a la rama del sitio (se necesita Contents: escritura y Actions: lectura). Avisa a Mauricio.', 'SITIO_WEB_SIN_ACCESO');
            }
            if (s === 409) throw err(424, 'GitHub dice que el repo del sitio está vacío o bloqueado. Avisa a Mauricio.', 'SITIO_WEB_SIN_ACCESO');
            if (s === 422) throw err(409, 'GitHub rechazó el cambio.', 'SITIO_WEB_GITHUB_RECHAZO', { status422: true });
            throw err(502, `GitHub tuvo un problema (HTTP ${s}). Vuelve a intentar en unos minutos.`, 'SITIO_WEB_GITHUB_ERROR');
        }
    }

    const cliente = {
        repo,
        rama,

        /** SHA del último commit de la rama. */
        async leerRef() {
            const r = await gh('GET', `/git/ref/heads/${rama}`);
            return shaOFalla(r && r.object && r.object.sha, 'commit');
        },

        /** { sha, arbol, padres } de un commit. */
        async leerCommit(sha) {
            const r = await gh('GET', `/git/commits/${shaOFalla(sha, 'commit')}`);
            return { sha, arbol: shaOFalla(r && r.tree && r.tree.sha, 'árbol'), padres: ((r && r.parents) || []).map(p => p.sha) };
        },

        /**
         * Todos los archivos del árbol (recursivo): Map ruta → { sha, mode }. Si GitHub lo trunca (repo enorme),
         * falla: comparar contra un árbol a medias podría borrar o pisar lo que no se vio.
         */
        async leerArbol(treeSha) {
            const r = await gh('GET', `/git/trees/${shaOFalla(treeSha, 'árbol')}?recursive=1`);
            if (!r || r.truncated) {
                throw err(502, 'GitHub entregó el árbol del repo incompleto (demasiado grande para leerlo de una vez). No se publicó nada. Avisa a Mauricio.', 'SITIO_WEB_ARBOL_TRUNCADO');
            }
            const arbol = new Map();
            for (const e of r.tree || []) {
                if (e && e.type === 'blob' && typeof e.path === 'string' && SHA_RE.test(String(e.sha))) arbol.set(e.path, { sha: e.sha, mode: e.mode });
            }
            return arbol;
        },

        /** Bytes de un blob, verificados contra su SHA. */
        async leerBlob(sha) {
            const r = await gh('GET', `/git/blobs/${shaOFalla(sha, 'archivo')}`);
            if (!r || r.encoding !== 'base64' || typeof r.content !== 'string') throw err(502, 'GitHub entregó un archivo que no se entiende.', 'SITIO_WEB_GITHUB_ERROR');
            const buf = Buffer.from(r.content.replace(/\s+/g, ''), 'base64');
            if (gitBlobSha(buf) !== sha) throw err(502, 'Un archivo del repo llegó dañado desde GitHub. Vuelve a intentar.', 'SITIO_WEB_GITHUB_ERROR');
            return buf;
        },

        /** Sube un archivo y verifica que GitHub le dio el SHA esperado. */
        async crearBlob(contenido) {
            const buf = Buffer.isBuffer(contenido) ? contenido : Buffer.from(String(contenido), 'utf8');
            const r = await gh('POST', '/git/blobs', { content: buf.toString('base64'), encoding: 'base64' });
            const sha = shaOFalla(r && r.sha, 'archivo');
            if (sha !== gitBlobSha(buf)) throw err(502, 'GitHub guardó un archivo distinto al enviado. No se publicó nada.', 'SITIO_WEB_GITHUB_ERROR');
            return sha;
        },

        /**
         * Árbol nuevo SOBRE `baseTree` (lo que no se nombra queda igual): `escribir` [{ ruta, sha }] y `borrar`
         * [ruta]. Cada ruta pasa por la lista blanca ANTES de llamar a GitHub; una sola que no pase y no se llama.
         */
        async crearArbol(baseTree, { escribir = [], borrar = [] }) {
            const malas = [
                ...escribir.filter(e => !guarda.rutaPermitida(e.ruta, { accion: 'escribir' }) || !SHA_RE.test(String(e.sha))).map(e => e.ruta),
                ...borrar.filter(r => !guarda.rutaPermitida(r, { accion: 'borrar' })),
            ];
            if (malas.length) {
                logger.error('Sitio web: ruta fuera de la lista blanca, no se llamó a GitHub', { rutas: malas.slice(0, 5).map(String) });
                throw err(500, 'La publicación intentó tocar un archivo del sitio que no es de la Bóveda. No se publicó nada. Avisa a Mauricio.', 'SITIO_WEB_RUTA_NO_PERMITIDA');
            }
            if (new Set([...escribir.map(e => e.ruta), ...borrar]).size !== escribir.length + borrar.length) {
                throw err(500, 'La publicación nombró dos veces el mismo archivo. No se publicó nada.', 'SITIO_WEB_RUTA_NO_PERMITIDA');
            }
            const tree = [
                ...escribir.map(e => ({ path: e.ruta, mode: '100644', type: 'blob', sha: e.sha })),
                ...borrar.map(r => ({ path: r, mode: '100644', type: 'blob', sha: null })),
            ];
            const r = await gh('POST', '/git/trees', { base_tree: shaOFalla(baseTree, 'árbol'), tree });
            return shaOFalla(r && r.sha, 'árbol');
        },

        /** Commit con un padre. Sin `autor` (correo sin configurar) GitHub usa la identidad del dueño del token. */
        async crearCommit({ mensaje, arbol, padre, autor = null }) {
            const body = { message: String(mensaje), tree: shaOFalla(arbol, 'árbol'), parents: [shaOFalla(padre, 'commit')] };
            if (autor) body.author = { name: autor.name, email: autor.email };
            const r = await gh('POST', '/git/commits', body);
            return shaOFalla(r && r.sha, 'commit');
        },

        /**
         * Mueve la rama al commit, SIN forzar: si main avanzó mientras tanto, GitHub responde 422 y aquí sale
         * 409 SITIO_WEB_REF_AVANZO (la publicación vuelve a leer y lo intenta de nuevo; nunca pisa lo ajeno).
         */
        async moverRef(sha) {
            try {
                await gh('PATCH', `/git/refs/heads/${rama}`, { sha: shaOFalla(sha, 'commit'), force: false });
            } catch (e) {
                if (e.status422) throw err(409, 'La rama del sitio avanzó mientras se publicaba.', 'SITIO_WEB_REF_AVANZO');
                throw e;
            }
            return sha;
        },

        /** compare base...head → 'identical' | 'ahead' | 'behind' | 'diverged' (null si GitHub no conoce alguno). */
        async comparar(base, head) {
            const r = await gh('GET', `/compare/${shaOFalla(base, 'commit')}...${shaOFalla(head, 'commit')}`, null, { permitir404: true });
            return r && typeof r.status === 'string' ? r.status : null;
        },

        /** ¿`head` contiene a `base`? (mismo commit o head adelante de base). */
        async contiene(base, head) {
            if (base === head) return true;
            const st = await cliente.comparar(base, head);
            return st === 'identical' || st === 'ahead';
        },

        /**
         * Cómo va la compilación del sitio para ese commit (Actions, solo lectura):
         *   en_cola · compilando · ok · fallo · reemplazada (cancelada porque entró otra publicación: no es error)
         * con `url` = la corrida en github.com. Sin corrida todavía → en_cola.
         */
        async estadoBuild(sha) {
            const r = await gh('GET', `/actions/runs?head_sha=${shaOFalla(sha, 'commit')}&per_page=10`);
            const corridas = ((r && r.workflow_runs) || []).filter(c => c && (!c.path || c.path === WORKFLOW));
            corridas.sort((a, b) => (Number(b.run_number) || 0) - (Number(a.run_number) || 0) || (Number(b.id) || 0) - (Number(a.id) || 0));
            const c = corridas[0];
            if (!c) return { estado: 'en_cola', url: null };
            const url = typeof c.html_url === 'string' && c.html_url.startsWith('https://github.com/') ? c.html_url.slice(0, 255) : null;
            if (c.status !== 'completed') return { estado: c.status === 'in_progress' ? 'compilando' : 'en_cola', url };
            if (c.conclusion === 'success') return { estado: 'ok', url };
            if (c.conclusion === 'cancelled' || c.conclusion === 'skipped') return { estado: 'reemplazada', url };
            return { estado: 'fallo', url };
        },
    };
    return cliente;
}

module.exports = { crearCliente, gitBlobSha, esperaPedida, _interno: { API, API_VERSION, USER_AGENT, TIMEOUT_MS, ESPERA_MAX_MS, WORKFLOW, SHA_RE } };

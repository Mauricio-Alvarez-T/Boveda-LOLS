const cfg = require('../config/sitioWeb.config');
const guarda = require('./sitioWebGuarda');

/**
 * Sitio web — ¿qué versión está en línea? (mig 147, plan 4.4 y 4.7.9, docs/reglas/sitio-web.md).
 *
 * El workflow de lols.cl deja en el sitio dos archivos públicos:
 *   /build.txt          el SHA completo del commit de main que se compiló (solo 40 hex; lo demás = «desconocido»)
 *   /deploy-status.txt  `<fecha> · OK · <sha7>` o `<fecha> · FALLO · filtro · <sha7>` (copia del cron de cPanel)
 * Se leen SIN token (son públicos), sin seguir redirecciones, con 10 s de tope y a lo más 1 KB cada uno: un
 * sitio caído o raro nunca cuelga la Bóveda ni le hace leer basura. 15 s de caché (la pantalla consulta cada 10).
 */

const SHA_RE = /^[0-9a-f]{40}$/;
const TIMEOUT_MS = 10000;
const TOPE_BYTES = 1024;
const CACHE_MS = 15000;
const DEPLOY_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) · (OK|FALLO)(?: · ([a-z]+))?/;

let cache = new Map();   // urlSitio → { at, valor }

/** El cuerpo como texto si no pasa de `tope` bytes; null si pasa (o si el servidor lo anuncia más grande). */
async function cuerpoConTope(res, tope = TOPE_BYTES) {
    const largo = Number(res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : NaN);
    if (Number.isFinite(largo) && largo > tope) return null;
    if (res.body && typeof res.body.getReader === 'function') {
        const lector = res.body.getReader();
        const partes = [];
        let total = 0;
        for (;;) {
            const { done, value } = await lector.read();
            if (done) break;
            total += value.length;
            if (total > tope) { await lector.cancel().catch(() => {}); return null; }
            partes.push(Buffer.from(value));
        }
        return Buffer.concat(partes).toString('utf8');
    }
    const t = await res.text();
    return Buffer.byteLength(t, 'utf8') > tope ? null : t;
}

/** Un archivo chico del sitio, o null si no se pudo leer bien (nunca lanza). */
async function leerChico(url, fetchImpl) {
    try {
        const res = await fetchImpl(url, {
            method: 'GET',
            headers: { 'User-Agent': 'BovedaLOLS-SitioWeb/1.0', 'Cache-Control': 'no-cache' },
            redirect: 'error',
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res || res.status !== 200) return null;
        return await cuerpoConTope(res);
    } catch {
        return null;
    }
}

/** build.txt → el SHA (40 hex) o null. Cualquier otra cosa (una página de error, un SHA corto) = desconocido. */
function shaDeBuild(texto) {
    const t = String(texto ?? '').trim();
    return SHA_RE.test(t) ? t : null;
}

/** deploy-status.txt → { estado: 'ok'|'fallo'|'desconocido', fecha, motivo }. */
function leerDeployStatus(texto) {
    const m = String(texto ?? '').trim().match(DEPLOY_RE);
    if (!m) return { estado: 'desconocido', fecha: null, motivo: null };
    return { estado: m[2] === 'OK' ? 'ok' : 'fallo', fecha: m[1], motivo: m[2] === 'FALLO' ? (m[3] || null) : null };
}

/**
 * Lo que el sitio dice que tiene en línea:
 *   { build: sha|null, estado: 'ok'|'desconocido', deploy: { estado, fecha, motivo }, url }
 */
async function leerEnLinea({ env = process.env, fetchImpl = globalThis.fetch, ahora = Date.now() } = {}) {
    const url = guarda.urlSitio(env, cfg.URL_SITIO);
    const guardado = cache.get(url);
    if (guardado && ahora - guardado.at < CACHE_MS) return guardado.valor;
    const [build, deploy] = await Promise.all([leerChico(`${url}/build.txt`, fetchImpl), leerChico(`${url}/deploy-status.txt`, fetchImpl)]);
    const sha = shaDeBuild(build);
    const valor = { build: sha, estado: sha ? 'ok' : 'desconocido', deploy: leerDeployStatus(deploy), url };
    cache.set(url, { at: ahora, valor });
    return valor;
}

const limpiarCache = () => { cache = new Map(); };

module.exports = { leerEnLinea, shaDeBuild, leerDeployStatus, cuerpoConTope, limpiarCache, _interno: { TIMEOUT_MS, TOPE_BYTES, CACHE_MS } };

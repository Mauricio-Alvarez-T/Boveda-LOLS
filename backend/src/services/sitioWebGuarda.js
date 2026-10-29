/**
 * Sitio web — guardas de entorno y de rutas (mig 147, docs/reglas/sitio-web.md). Funciones PURAS: no leen la
 * base ni la red, así se prueban sin nada alrededor (tests/sitio_web_guarda.test.js).
 *
 * 1. `modoEfectivo`: staging NUNCA publica en el repo público de lols.cl. No hay una variable que diga en qué
 *    entorno corre el backend, pero sí señales confiables: el nombre de la BD (`BD_PRODUCCION`, la misma que
 *    protege el saneo de staging), la carpeta de la app (`test-boveda` en staging) y una variable que solo
 *    existe en el .env de producción. Copiar las líneas del .env de producción a staging no alcanza.
 * 2. `rutaPermitida`: lista blanca de lo que la Bóveda puede escribir o borrar en el repo. Se revisa ANTES de
 *    cualquier llamada a GitHub: quien tiene el token puede alterar lo que se ve en el sitio, pero la Bóveda
 *    nunca toca un archivo que no sea suyo (un .php, un workflow, el .htaccess).
 *
 * El token (GITHUB_TOKEN_SITIO) se lee recién cuando se usa y nunca se registra, se devuelve ni va dentro de
 * un error: aquí solo se pregunta si existe.
 */
const { BD_PRODUCCION } = require('./saneoStaging.service');
const {
    REPO_PUBLICO, CARPETAS_COMPARTIDAS, RUTA_JSON_RE, RUTA_PORTADA_RE, RUTA_HEREDADA_RE, LARGOS,
} = require('../config/sitioWeb.config');

const REPO_RE = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/;
const ENTORNO_PRUEBAS_RE = /test|staging|dev/i;

/** owner/repo en minúsculas y sin «.git»: GitHub no distingue mayúsculas (otra grafía no esquiva la guarda). */
const normalizarRepo = (repo) => String(repo || '').trim().replace(/\.git$/i, '').toLowerCase();

/** El repo configurado (o el público por defecto), tal como se muestra. */
const repoSitio = (env = process.env) => String(env.GITHUB_REPO_SITIO || '').trim() || REPO_PUBLICO;
const ramaSitio = (env = process.env) => String(env.GITHUB_BRANCH_SITIO || '').trim() || 'main';

/** ¿Hay token? Nunca devuelve el token. */
const hayToken = (env = process.env) => typeof env.GITHUB_TOKEN_SITIO === 'string' && env.GITHUB_TOKEN_SITIO.trim() !== '';

/**
 * El token, para el cliente de GitHub (sitioWebGithub.service). Solo se lee aquí, al momento de usarlo.
 * Quien lo recibe no lo registra ni lo pone en un error.
 */
const tokenSitio = (env = process.env) => (hayToken(env) ? env.GITHUB_TOKEN_SITIO.trim() : null);

/**
 * Por qué el backend publica o simula. `motivo` (null si publica) lo muestra la pantalla:
 *   modo_simulacion · sin_token · sin_rama · repo_invalido · entorno_no_produccion · repo_publico_no_permitido
 * Publica SOLO si se cumple todo; en cualquier otro caso, simulación.
 */
function explicarModo({ env = process.env, dbName = env.DB_NAME, dirname = __dirname } = {}) {
    const simula = motivo => ({ modo: 'simulacion', motivo });
    if (String(env.SITIO_WEB_MODO || '').trim() !== 'publicar') return simula('modo_simulacion');
    if (!hayToken(env)) return simula('sin_token');
    if (!String(env.GITHUB_BRANCH_SITIO || '').trim()) return simula('sin_rama');
    const repo = repoSitio(env);
    if (!REPO_RE.test(repo.replace(/\.git$/i, ''))) return simula('repo_invalido');

    // El repo PÚBLICO exige además el entorno de producción, por tres señales independientes y una variable que
    // solo vive en el .env de producción. Un repo privado de prueba sí se permite desde staging (plan 4.10).
    if (normalizarRepo(repo) === normalizarRepo(REPO_PUBLICO)) {
        const bd = String(dbName || '').trim();
        if (bd !== BD_PRODUCCION || ENTORNO_PRUEBAS_RE.test(bd)) return simula('entorno_no_produccion');
        if (String(dirname || '').toLowerCase().includes('test-boveda')) return simula('entorno_no_produccion');
        if (String(env.SITIO_WEB_PERMITIR_REPO_PUBLICO || '').trim() !== '1') return simula('repo_publico_no_permitido');
    }
    return { modo: 'publicar', motivo: null };
}

/** 'publicar' | 'simulacion' (plan 4.3). */
const modoEfectivo = (opciones) => explicarModo(opciones).modo;

/**
 * Días que le quedan al token según GITHUB_TOKEN_SITIO_VENCE (AAAA-MM-DD; negativo = ya venció). null si no
 * hay token o la fecha no se entiende. `hoy` = 'AAAA-MM-DD' de Chile.
 */
function tokenVenceEnDias(env = process.env, hoy) {
    if (!hayToken(env)) return null;
    const vence = String(env.GITHUB_TOKEN_SITIO_VENCE || '').trim();
    const m = vence.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const h = String(hoy || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || !h) return null;
    const dia = (y, mes, d) => Date.UTC(Number(y), Number(mes) - 1, Number(d));
    const fin = dia(m[1], m[2], m[3]);
    if (!Number.isFinite(fin) || new Date(fin).toISOString().slice(0, 10) !== vence) return null;
    return Math.round((fin - dia(h[1], h[2], h[3])) / 86400000);
}

/** La URL pública del sitio (SITIO_WEB_URL), solo si es https:// sin usuario ni contraseña; si no, la de siempre. */
function urlSitio(env = process.env, porDefecto) {
    const v = String(env.SITIO_WEB_URL || '').trim().replace(/\/+$/, '');
    try {
        const u = new URL(v);
        if (u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash) return v;
    } catch { /* no es una URL */ }
    return porDefecto;
}

/**
 * ¿La ruta del repo es de la Bóveda? (sin mirar si se escribe o se borra). Las del 1.jpg de una carpeta
 * compartida con «Han confiado en nosotros» NO lo son: ese archivo es del repo.
 */
function esRutaDuena(ruta) {
    if (typeof ruta !== 'string' || !ruta || ruta.length > 200) return false;
    // Sin trucos de ruta: ni «..», ni «\», ni dobles barras, ni absolutas, ni caracteres de control.
    if (ruta.includes('..') || ruta.includes('\\') || ruta.includes('//') || ruta.startsWith('/') || /[\0-\x1f\x7f]/.test(ruta)) return false;
    const slugDe = (m) => (m && m[1].length <= LARGOS.slug ? m[1] : null);
    if (slugDe(ruta.match(RUTA_JSON_RE)) || slugDe(ruta.match(RUTA_PORTADA_RE))) return true;
    const heredada = slugDe(ruta.match(RUTA_HEREDADA_RE));
    return !!heredada && !CARPETAS_COMPARTIDAS.includes(heredada);
}

/**
 * ¿La Bóveda puede `accion` ('escribir' | 'borrar') esa ruta del repo? El 1.jpg heredado solo se BORRA (cuando
 * se aprueba una portada nueva o se retira la obra); la Bóveda nunca lo escribe ni lo reemplaza.
 */
function rutaPermitida(ruta, { accion = 'escribir' } = {}) {
    if (accion !== 'escribir' && accion !== 'borrar') return false;
    if (!esRutaDuena(ruta)) return false;
    if (accion === 'escribir' && RUTA_HEREDADA_RE.test(ruta)) return false;
    return true;
}

module.exports = {
    explicarModo, modoEfectivo, tokenVenceEnDias, urlSitio, repoSitio, ramaSitio, hayToken, tokenSitio,
    normalizarRepo, esRutaDuena, rutaPermitida,
};

/**
 * Rate limiting de Bóveda LOLS.
 *
 * Contexto: el server corre en cPanel + Apache + Phusion Passenger (Apache es
 * un reverse proxy delante de Node). Sin `trust proxy`, Express ve la IP del
 * proxy (loopback) para TODAS las peticiones, así que un único limiter por IP
 * reparte el cupo entre todos los usuarios → 429 espurios en uso normal.
 *
 * Estrategia:
 *  - `applyTrustProxy`: confiar en 1 hop (Apache) para que `req.ip` sea la IP
 *    real del cliente. Tunable por env; NUNCA `true` (express-rate-limit@8
 *    lanza ERR_ERL_PERMISSIVE_TRUST_PROXY si el limiter usa IP).
 *  - `generalLimiter`: cupo POR USUARIO autenticado (no por IP), así varios
 *    usuarios de una misma oficina/NAT no comparten cupo. La identidad se saca
 *    decodificando el JWT SIN verificar firma (solo para bucketing; la
 *    verificación real la hace src/middleware/auth.js). Sin token → cae a IP.
 *  - `loginLimiter`: estricto por IP para /auth/login (anti fuerza bruta).
 *
 * Todo es tunable por .env sin redeploy (ver .env.example).
 */
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Helper oficial para normalizar IPs (IPv6-safe). Obligatorio cuando un
// keyGenerator custom devuelve una IP, o v8 dispara una validación.
const ipKeyGenerator = rateLimit.ipKeyGenerator;

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000;
const MAX = Number(process.env.RATE_LIMIT_MAX) || 1000;
const LOGIN_WINDOW_MS = Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MS) || 15 * 60 * 1000;
const LOGIN_MAX = Number(process.env.RATE_LIMIT_LOGIN_MAX) || 10;

/**
 * Parsea TRUST_PROXY del entorno a un valor válido para Express.
 * Default 1 (un hop = Apache). Acepta nº de hops, 'loopback', CIDR/lista, etc.
 * 'true' permisivo se permite solo si alguien lo fuerza explícitamente (no recomendado).
 */
function parseTrustProxy(raw) {
    if (raw === undefined || raw === '') return 1;
    if (raw === 'true') return true;   // permisivo — NO recomendado (rompe v8 con IP)
    if (raw === 'false') return false;
    if (/^\d+$/.test(raw)) return parseInt(raw, 10);
    return raw; // 'loopback' | 'uniquelocal' | CIDR/lista separada por comas
}

function applyTrustProxy(app) {
    app.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
}

/** IP normalizada (IPv6-safe) como clave de fallback. */
function ipKey(req) {
    return ipKeyGenerator(req.ip);
}

/**
 * Clave por usuario autenticado. Decodifica el JWT del header Authorization
 * SIN verificar firma (solo bucketing). Token válido con claim `id` → "u:<id>";
 * si no hay token → IP normalizada.
 */
function userOrIpKey(req) {
    const header = req.headers.authorization;
    if (header && header.startsWith('Bearer ')) {
        try {
            const decoded = jwt.decode(header.slice(7));
            if (decoded && decoded.id != null) return `u:${decoded.id}`;
        } catch (_) { /* token corrupto → cae a IP */ }
    }
    return ipKey(req);
}

/**
 * No contar contra el cupo: healthcheck y assets estáticos (imágenes de
 * inventario). `req.originalUrl` es robusto ante el stripping del mount path.
 */
function skipNoCount(req) {
    const url = req.originalUrl || req.url || '';
    return url.startsWith('/api/health') || url.startsWith('/api/uploads/inventario');
}

const generalLimiter = rateLimit({
    windowMs: WINDOW_MS,
    max: MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
    skip: skipNoCount,
    message: { error: 'Demasiadas peticiones, por favor intente de nuevo más tarde.' },
});

const loginLimiter = rateLimit({
    windowMs: LOGIN_WINDOW_MS,
    max: LOGIN_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKey, // en login aún no hay token → por IP
    message: { error: 'Demasiados intentos de inicio de sesión. Intente nuevamente más tarde.' },
});

module.exports = { applyTrustProxy, generalLimiter, loginLimiter };

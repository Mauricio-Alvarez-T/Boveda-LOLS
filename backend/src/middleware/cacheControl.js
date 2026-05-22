const crypto = require('crypto');

/**
 * Middleware ETag + Cache-Control para endpoints GET de inventario.
 *
 * Estrategia:
 *   1) Wrap res.json para interceptar el body antes de send.
 *   2) Calcular hash MD5 del body → ETag.
 *   3) Comparar contra If-None-Match del request:
 *      - Match → res.status(304).end()  (sin body, browser usa cache)
 *      - Miss  → setear Cache-Control + ETag y mandar body normal
 *
 * Política:
 *   - `private`: solo browser del usuario cachea (no proxies/CDN).
 *   - `max-age` configurable por endpoint (30s default).
 *   - Vary: Authorization → cada usuario tiene su propio cache key.
 *
 * Importante:
 *   Las mutaciones (PUT/POST/DELETE) ignoran este middleware (no se aplica).
 *   Tras una mutación, el frontend dispara refetch que NO envía
 *   If-None-Match (request fresca) → respuesta nueva con ETag actualizado.
 *   Así el bug de "stale después de editar" se evita.
 *
 * @param {number} maxAgeSec  Segundos que el browser puede usar cache sin revalidar (default 30).
 * @returns {import('express').RequestHandler}
 */
function cacheControl(maxAgeSec = 30) {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            try {
                const payload = JSON.stringify(body);
                const etag = '"' + crypto.createHash('md5').update(payload).digest('hex') + '"';

                res.set('Cache-Control', `private, max-age=${maxAgeSec}`);
                res.set('ETag', etag);
                res.set('Vary', 'Authorization');

                if (req.headers['if-none-match'] === etag) {
                    return res.status(304).end();
                }
                return originalJson(body);
            } catch (err) {
                // Si el body no es JSON-stringificable (Map, BigInt, etc.), fallback al envío normal.
                return originalJson(body);
            }
        };
        next();
    };
}

module.exports = cacheControl;

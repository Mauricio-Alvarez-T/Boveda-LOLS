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
 *   - `Cache-Control: private, no-cache`: el browser PUEDE almacenar pero
 *     SIEMPRE debe revalidar con If-None-Match antes de reusar. Esto evita
 *     el bug de "edit → refetch dentro de max-age → axios devuelve stale".
 *     Con `no-cache` cada fetch dispara un round-trip al servidor pero la
 *     respuesta es 304 (sin body) si nada cambió → ahorra bandwidth +
 *     parseo JSON + computación downstream, sin riesgo de staleness.
 *   - `Vary: Authorization` → cache key per-usuario.
 *
 * Ahorros con 304:
 *   - Sin body en wire (vs ~20-200KB en dashboard ejecutivo).
 *   - Sin re-serialización JSON ni re-render del frontend si data igual.
 *   - El servidor SÍ corre las queries para calcular el hash, así que el
 *     ahorro está en bandwidth + frontend. Para ahorrar queries también
 *     habría que agregar un cache layer en memoria (Redis/LRU) — fuera
 *     del alcance de Sprint 1.
 *
 * Mutaciones (PUT/POST/DELETE) NO usan este middleware → responden 200
 * normal. El frontend post-mutación dispara refetch → ETag nuevo se computa
 * sobre el dato fresco → no hay desincronización.
 *
 * @param {number} _maxAgeSec  Mantenido por compat de firma (ignorado: usamos no-cache).
 * @returns {import('express').RequestHandler}
 */
function cacheControl(_maxAgeSec = 30) {
    return (req, res, next) => {
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            try {
                const payload = JSON.stringify(body);
                const etag = '"' + crypto.createHash('md5').update(payload).digest('hex') + '"';

                res.set('Cache-Control', 'private, no-cache');
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

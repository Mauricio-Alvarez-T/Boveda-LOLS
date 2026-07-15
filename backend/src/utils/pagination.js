/**
 * Helper de paginación para listados con `LIMIT ? OFFSET ?`.
 *
 * PROBLEMA que resuelve: `page`/`limit` llegan de `req.query` como STRING.
 * mysql2 bindea el placeholder literal (`LIMIT '20'`) y MariaDB lo rechaza con
 * `You have an error in your SQL syntax ... near ''20' OFFSET 0'`. El bug es
 * invisible con los defaults numéricos del destructuring (page=1, limit=20),
 * por eso la UI —que no manda page/limit— no lo dispara; cualquier cliente que
 * los pase por query rompe la lista entera. Ver RUNBOOK.md §6.
 *
 * Castea a entero ANTES de tocar el SQL, clampa limit a [1, maxLimit] y page a
 * >= 1, e ignora basura (NaN, negativos, no-numérico) cayendo al default.
 *
 * @param {object} [query={}]      típicamente req.query (values string).
 * @param {number} [defaultLimit=20] limit cuando no viene o es inválido.
 * @param {number} [maxLimit=200]   techo del limit (anti abuso / OOM).
 * @returns {{ page: number, limit: number, offset: number }} enteros seguros.
 */
function normalizePagination(query = {}, defaultLimit = 20, maxLimit = 200) {
    const rawPage = Number(query.page);
    const rawLimit = Number(query.limit);
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.trunc(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
        ? Math.min(Math.max(Math.trunc(rawLimit), 1), maxLimit)
        : defaultLimit;
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

module.exports = { normalizePagination };

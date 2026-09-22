/**
 * Introspección de esquema con cache por proceso.
 *
 * Por qué existe: las migraciones se aplican SOLAS en el deploy (cron cPanel) y el
 * backend se reinicia aunque el auto-migrate haya FALLADO (ver RUNBOOK §6). Todo
 * código que lea una columna/tabla NUEVA debe poder degradar al comportamiento
 * anterior si aún no existe. `existingCols(tabla)` responde "¿qué columnas hay hoy?"
 * consultando INFORMATION_SCHEMA una sola vez por tabla (el restart del deploy
 * invalida la cache, que es justo cuando el esquema puede haber cambiado).
 *
 * Extraído de vehiculos.service.js (patrón original, migs 100-107) para compartirlo
 * con documentos / trabajadores (plan Gestiones, D-I).
 */
const db = require('../config/db');

const _cache = {};

/** @returns {Promise<Set<string>>} nombres de columnas existentes en `table`. */
async function existingCols(table) {
    if (_cache[table]) return _cache[table];
    const [rows] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    _cache[table] = new Set(rows.map(r => r.COLUMN_NAME));
    return _cache[table];
}

/** true si la tabla tiene TODAS las columnas pedidas (atajo para ramas de degradación). */
async function hasCols(table, ...cols) {
    const set = await existingCols(table);
    return cols.every(c => set.has(c));
}

/** Solo para tests (y para forzar relectura tras una migración en caliente). */
function resetSchemaCache(table) {
    if (table) delete _cache[table];
    else Object.keys(_cache).forEach(k => delete _cache[k]);
}

module.exports = { existingCols, hasCols, resetSchemaCache };

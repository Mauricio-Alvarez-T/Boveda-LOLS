/**
 * Feriados activos entre dos fechas como Set de 'YYYY-MM-DD' (para contar días hábiles, p. ej. la tenencia
 * en terreno). Sin la tabla o ante un error: Set vacío (cuentan solo los fines de semana) y un warn.
 */
const db = require('../config/db');
const logger = require('./logger-structured');

async function feriadosEntre(desde, hasta) {
    try {
        const [rows] = await db.query("SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS f FROM feriados WHERE activo = 1 AND fecha BETWEEN ? AND ?", [desde, hasta]);
        return new Set((rows || []).map(r => r.f));
    } catch (err) {
        logger.warn('No se pudieron leer los feriados', { err: err.message });
        return new Set();
    }
}

module.exports = { feriadosEntre };

const db = require('../config/db');

/**
 * Progreso de tutoriales del Centro de ayuda, por usuario (tabla tutorial_progreso,
 * migración 085). Datos propios del usuario autenticado.
 */

async function getProgreso(usuarioId) {
    const [rows] = await db.query(
        'SELECT tutorial_id, completado_at FROM tutorial_progreso WHERE usuario_id = ? ORDER BY completado_at DESC',
        [usuarioId]
    );
    return rows;
}

async function marcarCompletado(usuarioId, tutorialId) {
    await db.query(
        `INSERT INTO tutorial_progreso (usuario_id, tutorial_id) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE completado_at = NOW()`,
        [usuarioId, tutorialId]
    );
    const [rows] = await db.query(
        'SELECT tutorial_id, completado_at FROM tutorial_progreso WHERE usuario_id = ? AND tutorial_id = ?',
        [usuarioId, tutorialId]
    );
    return rows[0] || { tutorial_id: tutorialId, completado_at: new Date() };
}

async function reiniciar(usuarioId) {
    await db.query('DELETE FROM tutorial_progreso WHERE usuario_id = ?', [usuarioId]);
}

module.exports = { getProgreso, marcarCompletado, reiniciar };

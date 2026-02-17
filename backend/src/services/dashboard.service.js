const pool = require('../config/db');

/**
 * Service to aggregate KPIs for the main dashboard
 */
const getSummary = async () => {
    // 1. Total Workers
    const [workers] = await pool.query('SELECT COUNT(*) as count FROM trabajadores WHERE activo = 1');

    // 2. Total Documents
    const [docs] = await pool.query('SELECT COUNT(*) as count FROM documentos WHERE activo = 1');

    // 3. Expired Documents (or expiring soon)
    const [expired] = await pool.query('SELECT COUNT(*) as count FROM documentos WHERE activo = 1 AND fecha_vencimiento < CURDATE()');

    // 4. Attendance % for Today
    const today = new Date().toISOString().split('T')[0];
    const [attendanceToday] = await pool.query(
        'SELECT estado, COUNT(*) as count FROM asistencias WHERE fecha = ? GROUP BY estado',
        [today]
    );

    const stats = attendanceToday.reduce((acc, curr) => {
        acc[curr.estado] = curr.count;
        acc.total += curr.count;
        return acc;
    }, { total: 0 });

    const attendanceRate = stats.total > 0
        ? Math.round(((stats.Presente || 0) + (stats.Atraso || 0)) / stats.total * 100)
        : 100;

    // 5. Recent Activity (Latest 5 documents uploaded)
    const [recentDocs] = await pool.query(`
        SELECT d.*, t.nombre as tipo_nombre, tr.nombres, tr.apellido_paterno
        FROM documentos d
        JOIN tipos_documento t ON d.tipo_documento_id = t.id
        JOIN trabajadores tr ON d.trabajador_id = tr.id
        ORDER BY d.fecha_subida DESC
        LIMIT 5
    `);

    // 6. Distribution of workers by Obra
    const [obraDistribution] = await pool.query(`
        SELECT o.nombre, COUNT(t.id) as count
        FROM obras o
        LEFT JOIN trabajadores t ON o.id = t.obra_id AND t.activo = 1
        WHERE o.activa = 1
        GROUP BY o.id, o.nombre
    `);

    return {
        counters: {
            trabajadores: workers[0].count,
            documentos: docs[0].count,
            vencidos: expired[0].count,
            asistencia_hoy: attendanceRate
        },
        recentActivity: recentDocs,
        obraDistribution
    };
};

module.exports = {
    getSummary
};

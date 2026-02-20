const pool = require('../config/db');

/**
 * Service to aggregate KPIs for the main dashboard
 */
const getSummary = async (obraId = null) => {
    const params = obraId ? [obraId] : [];
    const obraFilter = obraId ? 'AND t.obra_id = ?' : '';
    const obraFilterWhere = obraId ? 'WHERE t.obra_id = ?' : '';
    const docObraFilter = obraId ? 'AND tr.obra_id = ?' : '';
    const asistFilter = obraId ? 'AND obra_id = ?' : '';

    // 1. Total Workers
    const [workers] = await pool.query(
        `SELECT COUNT(*) as count FROM trabajadores t WHERE t.activo = 1 ${obraFilter}`,
        params
    );

    // 2. Total Documents
    const [docs] = await pool.query(
        `SELECT COUNT(d.id) as count 
         FROM documentos d 
         JOIN trabajadores tr ON d.trabajador_id = tr.id 
         WHERE d.activo = 1 ${docObraFilter}`,
        params
    );

    // 3. Expired Documents
    const [expired] = await pool.query(
        `SELECT COUNT(d.id) as count 
         FROM documentos d 
         JOIN trabajadores tr ON d.trabajador_id = tr.id 
         WHERE d.activo = 1 AND d.fecha_vencimiento < CURDATE() ${docObraFilter}`,
        params
    );

    // 4. Attendance %
    const today = new Date().toISOString().split('T')[0];
    const [attendanceToday] = await pool.query(
        `SELECT ea.nombre as estado, ea.es_presente, COUNT(*) as count
         FROM asistencias a
         JOIN estados_asistencia ea ON a.estado_id = ea.id
         WHERE a.fecha = ? ${asistFilter}
         GROUP BY ea.id, ea.nombre, ea.es_presente`,
        [today, ...params]
    );

    const stats = attendanceToday.reduce((acc, curr) => {
        acc[curr.estado] = curr.count;
        acc.total += curr.count;
        return acc;
    }, { total: 0 });

    const presentCount = attendanceToday
        .filter(r => r.es_presente)
        .reduce((sum, r) => sum + r.count, 0);

    const attendanceRate = stats.total > 0
        ? Math.round((presentCount / stats.total) * 100)
        : 0;

    // 5. Recent Activity
    const [recentDocs] = await pool.query(`
        SELECT d.*, t.nombre as tipo_nombre, tr.nombres, tr.apellido_paterno
        FROM documentos d
        JOIN tipos_documento t ON d.tipo_documento_id = t.id
        JOIN trabajadores tr ON d.trabajador_id = tr.id
        WHERE 1=1 ${docObraFilter}
        ORDER BY d.fecha_subida DESC
        LIMIT 5
    `, params);

    // 6. Distribution
    // If obraId is present, we only show that Obra's distribution (it will be a single bar)
    const distParams = obraId ? [obraId] : [];
    const distFilter = obraId ? 'AND o.id = ?' : '';

    const [obraDistribution] = await pool.query(`
        SELECT o.nombre, COUNT(t.id) as count
        FROM obras o
        LEFT JOIN trabajadores t ON o.id = t.obra_id AND t.activo = 1
        WHERE o.activa = 1 ${distFilter}
        GROUP BY o.id, o.nombre
    `, distParams);

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

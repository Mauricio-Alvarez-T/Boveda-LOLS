const pool = require('../config/db');

/**
 * Helper: check if user can see a module
 */
const canSee = (permisos, modulo) =>
    Array.isArray(permisos) && permisos.some(p => p.modulo === modulo && p.puede_ver);

/**
 * Service to aggregate KPIs for the main dashboard.
 * Only executes queries for modules the user has permission to view.
 */
const getSummary = async (obraId = null, permisos = [], userName = '') => {
    const params = obraId ? [obraId] : [];
    const obraFilter = obraId ? 'AND t.obra_id = ?' : '';
    const obraFilterWhere = obraId ? 'WHERE t.obra_id = ?' : '';
    const docObraFilter = obraId ? 'AND tr.obra_id = ?' : '';
    const asistFilter = obraId ? 'AND a.obra_id = ?' : '';

    const result = {
        counters: {},
        recentActivity: [],
        obraDistribution: [],
        attendanceTrend: [],
        alerts: [],
        saludo: { nombre: userName, resumen: '', totalAlertas: 0 }
    };

    const alertas = [];

    // ── 1. TRABAJADORES (si tiene permiso) ──
    if (canSee(permisos, 'trabajadores')) {
        const [workers] = await pool.query(
            `SELECT COUNT(*) as count FROM trabajadores t WHERE t.activo = 1 ${obraFilter}`,
            params
        );
        result.counters.trabajadores = workers[0].count;

        // Distribución por Obra
        const distParams = obraId ? [obraId] : [];
        const distFilter = obraId ? 'AND o.id = ?' : '';
        const [obraDistribution] = await pool.query(`
            SELECT o.nombre, COUNT(t.id) as count
            FROM obras o
            LEFT JOIN trabajadores t ON o.id = t.obra_id AND t.activo = 1
            WHERE o.activa = 1 ${distFilter}
            GROUP BY o.id, o.nombre
        `, distParams);
        result.obraDistribution = obraDistribution;
    }

    // ── 2. DOCUMENTOS (si tiene permiso) ──
    if (canSee(permisos, 'documentos')) {
        const [docs] = await pool.query(
            `SELECT COUNT(d.id) as count 
             FROM documentos d 
             JOIN trabajadores tr ON d.trabajador_id = tr.id 
             WHERE d.activo = 1 ${docObraFilter}`,
            params
        );

        const [expired] = await pool.query(
            `SELECT COUNT(d.id) as count 
             FROM documentos d 
             JOIN trabajadores tr ON d.trabajador_id = tr.id 
             WHERE d.activo = 1 AND d.fecha_vencimiento < CURDATE() ${docObraFilter}`,
            params
        );

        // Docs por vencer en 7 días
        const [expiringSoon] = await pool.query(
            `SELECT COUNT(d.id) as count 
             FROM documentos d 
             JOIN trabajadores tr ON d.trabajador_id = tr.id 
             WHERE d.activo = 1 
             AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY)
             ${docObraFilter}`,
            params
        );

        // Trabajadores sin documentos
        const [noDocWorkers] = await pool.query(
            `SELECT COUNT(t.id) as count 
             FROM trabajadores t 
             LEFT JOIN documentos d ON t.id = d.trabajador_id AND d.activo = 1
             WHERE t.activo = 1 AND d.id IS NULL ${obraFilter}`,
            params
        );

        result.counters.documentos = docs[0].count;
        result.counters.vencidos = expired[0].count;
        result.counters.porVencer7d = expiringSoon[0].count;
        result.counters.trabajadoresSinDocs = noDocWorkers[0].count;

        // Actividad reciente (últimos 5 docs subidos)
        const [recentDocs] = await pool.query(`
            SELECT d.*, t.nombre as tipo_nombre, tr.nombres, tr.apellido_paterno
            FROM documentos d
            JOIN tipos_documento t ON d.tipo_documento_id = t.id
            JOIN trabajadores tr ON d.trabajador_id = tr.id
            WHERE 1=1 ${docObraFilter}
            ORDER BY d.fecha_subida DESC
            LIMIT 5
        `, params);
        result.recentActivity = recentDocs;

        // Alertas de documentos
        if (expired[0].count > 0) {
            alertas.push({
                tipo: 'critical',
                titulo: 'Documentos Vencidos',
                mensaje: `Hay ${expired[0].count} documentos caducados que requieren atención inmediata.`,
                count: expired[0].count,
                ruta: '/trabajadores'
            });
        }
        if (expiringSoon[0].count > 0) {
            alertas.push({
                tipo: 'warning',
                titulo: 'Documentos por Vencer',
                mensaje: `${expiringSoon[0].count} documentos vencen en los próximos 7 días.`,
                count: expiringSoon[0].count,
                ruta: '/trabajadores'
            });
        }
        if (noDocWorkers[0].count > 0) {
            alertas.push({
                tipo: 'info',
                titulo: 'Trabajadores sin Documentos',
                mensaje: `${noDocWorkers[0].count} trabajadores activos no tienen documentos registrados.`,
                count: noDocWorkers[0].count,
                ruta: '/trabajadores'
            });
        }
    }

    // ── 3. ASISTENCIA (si tiene permiso) ──
    if (canSee(permisos, 'asistencia')) {
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

        result.counters.asistencia_hoy = attendanceRate;
        result.counters.ausentes_hoy = stats.total - presentCount;

        // Detalle de ausentes del día
        const [ausentesDetalle] = await pool.query(`
            SELECT t.nombres, t.apellido_paterno, ea.nombre as estado, o.nombre as obra
            FROM asistencias a
            JOIN trabajadores t ON a.trabajador_id = t.id
            JOIN estados_asistencia ea ON a.estado_id = ea.id
            LEFT JOIN obras o ON a.obra_id = o.id
            WHERE a.fecha = ? AND ea.es_presente = 0 ${asistFilter}
            ORDER BY t.apellido_paterno ASC
            LIMIT 20
        `, [today, ...params]);
        result.ausentesDetalle = ausentesDetalle;

        // Tendencia 7 días
        const [trendData] = await pool.query(`
            SELECT a.fecha, 
                   SUM(CASE WHEN ea.es_presente = 1 THEN 1 ELSE 0 END) as presentes,
                   COUNT(a.id) as total
            FROM asistencias a
            JOIN estados_asistencia ea ON a.estado_id = ea.id
            WHERE a.fecha >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
            ${asistFilter ? 'AND a.obra_id = ?' : ''}
            GROUP BY a.fecha
            ORDER BY a.fecha ASC
        `, params);

        result.attendanceTrend = trendData.map(d => ({
            fecha: d.fecha.toISOString().split('T')[0],
            tasa: d.total > 0 ? Math.round((d.presentes / d.total) * 100) : 0
        }));

        // Alerta de asistencia baja
        if (attendanceRate > 0 && attendanceRate < 80) {
            alertas.push({
                tipo: 'warning',
                titulo: 'Asistencia Baja',
                mensaje: `La asistencia de hoy es del ${attendanceRate}%, por debajo del 80% esperado.`,
                count: stats.total - presentCount,
                ruta: '/asistencia'
            });
        }
    }

    // ── 4. SALUDO CONTEXTUAL ──
    result.alerts = alertas;
    result.saludo.totalAlertas = alertas.length;

    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    if (alertas.length === 0) {
        result.saludo.resumen = `${greeting}, ${userName}. Todo operativo hoy.`;
    } else {
        const parts = [];
        if (result.counters.vencidos > 0) parts.push(`${result.counters.vencidos} docs vencidos`);
        if (result.counters.ausentes_hoy > 0) parts.push(`${result.counters.ausentes_hoy} ausentes`);
        if (result.counters.porVencer7d > 0) parts.push(`${result.counters.porVencer7d} docs por vencer`);

        if (parts.length > 0) {
            result.saludo.resumen = `${greeting}, ${userName}. Tienes ${parts.join(' y ')}.`;
        } else {
            result.saludo.resumen = `${greeting}, ${userName}. Revisa las alertas pendientes.`;
        }
    }

    return result;
};

module.exports = {
    getSummary
};

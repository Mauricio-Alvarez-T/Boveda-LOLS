const pool = require('../config/db');
const asistenciaService = require('./asistencia.service');

/**
 * Helper: check if user can see a module
 */
const canSee = (permisos, modulo) =>
    Array.isArray(permisos) && permisos.includes(`${modulo}.ver`);

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
        deltas: {},
        recentActivity: [],
        obraDistribution: [],
        attendanceTrend: [],
        alerts: [],
        pendingTasks: [],
        docExpiryTimeline: [],
        obraRanking: [],
        attendanceStatus: {},
        saludo: { nombre: userName, resumen: '', totalAlertas: 0 }
    };

    const alertas = [];
    const pendingTasks = [];

    // ── 1. TRABAJADORES (si tiene permiso) ──
    if (canSee(permisos, 'trabajadores')) {
        const [workers] = await pool.query(
            `SELECT COUNT(*) as count FROM trabajadores t WHERE t.activo = 1 ${obraFilter}`,
            params
        );
        result.counters.trabajadores = workers[0].count;

        // Delta: trabajadores nuevos esta semana
        const [workersLastWeek] = await pool.query(
            `SELECT COUNT(*) as count FROM trabajadores t 
             WHERE t.activo = 1 AND t.fecha_ingreso >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) ${obraFilter}`,
            params
        );
        result.deltas.trabajadores_nuevos_semana = workersLastWeek[0].count;
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

        // Docs vencidos hoy (delta)
        const [expiredToday] = await pool.query(
            `SELECT COUNT(d.id) as count 
             FROM documentos d 
             JOIN trabajadores tr ON d.trabajador_id = tr.id 
             WHERE d.activo = 1 AND d.fecha_vencimiento = CURDATE() ${docObraFilter}`,
            params
        );
        result.deltas.docs_vencidos_hoy = expiredToday[0].count;

        // Alertas de documentos
        if (expired[0].count > 0) {
            alertas.push({
                tipo: 'critical',
                titulo: 'Documentos Vencidos',
                mensaje: `Hay ${expired[0].count} documentos caducados que requieren atención inmediata.`,
                count: expired[0].count,
                ruta: '/consultas?completitud=faltantes'
            });
        }
        if (expiringSoon[0].count > 0) {
            alertas.push({
                tipo: 'warning',
                titulo: 'Documentos por Vencer',
                mensaje: `${expiringSoon[0].count} documentos vencen en los próximos 7 días.`,
                count: expiringSoon[0].count,
                ruta: '/consultas'
            });
        }
        if (noDocWorkers[0].count > 0) {
            alertas.push({
                tipo: 'info',
                titulo: 'Trabajadores sin Documentos',
                mensaje: `${noDocWorkers[0].count} trabajadores activos no tienen documentos registrados.`,
                count: noDocWorkers[0].count,
                ruta: '/consultas?completitud=faltantes'
            });
        }

        // ── DOC EXPIRY TIMELINE (próximos 14 días) ──
        const [expiryTimeline] = await pool.query(`
            SELECT 
                d.fecha_vencimiento as fecha,
                td.nombre as tipo_documento,
                tr.nombres, tr.apellido_paterno, tr.rut,
                tr.id as trabajador_id,
                o.nombre as obra_nombre
            FROM documentos d
            JOIN tipos_documento td ON d.tipo_documento_id = td.id
            JOIN trabajadores tr ON d.trabajador_id = tr.id
            LEFT JOIN obras o ON tr.obra_id = o.id
            WHERE d.activo = 1 
              AND tr.activo = 1
              AND d.fecha_vencimiento BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 14 DAY)
              ${docObraFilter}
            ORDER BY d.fecha_vencimiento ASC
            LIMIT 30
        `, params);

        result.docExpiryTimeline = expiryTimeline.map(d => ({
            fecha: d.fecha.toISOString().split('T')[0],
            tipo_documento: d.tipo_documento,
            trabajador: `${d.nombres} ${d.apellido_paterno}`,
            trabajador_id: d.trabajador_id,
            rut: d.rut,
            obra: d.obra_nombre || 'Sin obra'
        }));

        // Pending tasks from docs
        expiryTimeline.forEach(d => {
            const fechaVenc = d.fecha.toISOString().split('T')[0];
            const today = new Date().toISOString().split('T')[0];
            const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
            
            let severity = 'info';
            let label = '';
            if (fechaVenc === today) { severity = 'critical'; label = 'vence HOY'; }
            else if (fechaVenc === tomorrow) { severity = 'critical'; label = 'vence MAÑANA'; }
            else {
                const daysLeft = Math.ceil((new Date(fechaVenc) - new Date(today)) / 86400000);
                if (daysLeft <= 3) { severity = 'warning'; label = `vence en ${daysLeft} días`; }
                else { severity = 'info'; label = `vence en ${daysLeft} días`; }
            }

            pendingTasks.push({
                severity,
                category: 'documentos',
                title: `${d.tipo_documento} de ${d.nombres} ${d.apellido_paterno}`,
                description: label,
                action: { label: 'Ver trabajador', ruta: `/consultas?q=${d.rut}` },
                meta: { fecha: fechaVenc, rut: d.rut }
            });
        });
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

        // Delta: comparar con ayer
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const [attendanceYesterday] = await pool.query(
            `SELECT ea.es_presente, COUNT(*) as count
             FROM asistencias a
             JOIN estados_asistencia ea ON a.estado_id = ea.id
             WHERE a.fecha = ? ${asistFilter}
             GROUP BY ea.es_presente`,
            [yesterday, ...params]
        );
        const yesterdayTotal = attendanceYesterday.reduce((sum, r) => sum + r.count, 0);
        const yesterdayPresent = attendanceYesterday.filter(r => r.es_presente).reduce((sum, r) => sum + r.count, 0);
        const yesterdayRate = yesterdayTotal > 0 ? Math.round((yesterdayPresent / yesterdayTotal) * 100) : 0;
        const yesterdayAbsent = yesterdayTotal - yesterdayPresent;

        result.deltas.asistencia_delta = yesterdayRate > 0 ? attendanceRate - yesterdayRate : 0;
        result.deltas.ausentes_delta = stats.total > 0 ? (stats.total - presentCount) - yesterdayAbsent : 0;

        // Detalle de ausentes del día
        const [ausentesDetalle] = await pool.query(`
            SELECT t.nombres, t.apellido_paterno, ea.nombre as estado, o.nombre as obra
            FROM asistencias a
            JOIN trabajadores t ON a.trabajador_id = t.id
            JOIN estados_asistencia ea ON a.estado_id = ea.id
            LEFT JOIN obras o ON a.obra_id = o.id
            WHERE a.fecha = ? AND ea.es_presente = 0 ${asistFilter}
            ORDER BY t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC
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
                ruta: '/consultas?ausentes=true'
            });
        }

        // Attendance status per obra
        const [attendanceStatusRows] = await pool.query(`
            SELECT o.id as obra_id, o.nombre as obra_nombre,
                   COUNT(a.id) as registros
            FROM obras o
            LEFT JOIN asistencias a ON a.obra_id = o.id AND a.fecha = ?
            WHERE o.activa = 1
            GROUP BY o.id, o.nombre
        `, [today]);

        const attendanceStatusMap = {};
        attendanceStatusRows.forEach(r => {
            attendanceStatusMap[r.obra_id] = {
                nombre: r.obra_nombre,
                guardada: r.registros > 0
            };
        });
        result.attendanceStatus = attendanceStatusMap;

        // Pending task: attendance not saved
        const obrasSinAsistencia = attendanceStatusRows.filter(r => r.registros === 0);
        if (obrasSinAsistencia.length > 0) {
            obrasSinAsistencia.forEach(o => {
                pendingTasks.push({
                    severity: 'warning',
                    category: 'asistencia',
                    title: `Asistencia de hoy sin guardar`,
                    description: `Obra: ${o.obra_nombre}`,
                    action: { label: 'Ir a Asistencia', ruta: '/asistencia' },
                    meta: { obra_id: o.obra_id }
                });
            });
        }
    }

    // ── 4. OBRA RANKING ──
    if (canSee(permisos, 'trabajadores')) {
        const today = new Date().toISOString().split('T')[0];
        const [obraRankingRows] = await pool.query(`
            SELECT 
                o.id, o.nombre,
                COUNT(DISTINCT t.id) as total_trabajadores,
                (
                    SELECT COUNT(DISTINCT d2.trabajador_id)
                    FROM documentos d2
                    JOIN trabajadores t2 ON d2.trabajador_id = t2.id
                    WHERE t2.obra_id = o.id AND t2.activo = 1 AND d2.activo = 1
                      AND (d2.fecha_vencimiento IS NULL OR d2.fecha_vencimiento >= CURDATE())
                ) as trabajadores_docs_ok
            FROM obras o
            LEFT JOIN trabajadores t ON o.id = t.obra_id AND t.activo = 1
            WHERE o.activa = 1
            GROUP BY o.id, o.nombre
            HAVING total_trabajadores > 0
            ORDER BY total_trabajadores DESC
        `);

        // Get attendance for each obra today
        const [obraAttendanceRows] = await pool.query(`
            SELECT a.obra_id,
                   SUM(CASE WHEN ea.es_presente = 1 THEN 1 ELSE 0 END) as presentes,
                   COUNT(a.id) as total
            FROM asistencias a
            JOIN estados_asistencia ea ON a.estado_id = ea.id
            WHERE a.fecha = ?
            GROUP BY a.obra_id
        `, [today]);

        const attendanceMap = {};
        obraAttendanceRows.forEach(r => {
            attendanceMap[r.obra_id] = {
                presentes: r.presentes,
                total: r.total,
                tasa: r.total > 0 ? Math.round((r.presentes / r.total) * 100) : 0
            };
        });

        result.obraRanking = obraRankingRows.map(o => {
            const att = attendanceMap[o.id] || { presentes: 0, total: 0, tasa: 0 };
            const docsRate = o.total_trabajadores > 0
                ? Math.round((o.trabajadores_docs_ok / o.total_trabajadores) * 100)
                : 100;
            return {
                id: o.id,
                nombre: o.nombre,
                trabajadores: o.total_trabajadores,
                asistencia_tasa: att.tasa,
                docs_completos_pct: docsRate,
                asistencia_guardada: att.total > 0
            };
        }).sort((a, b) => b.asistencia_tasa - a.asistencia_tasa);
    }

    // ── 5. ALERTA 10 MESES DE CONTRATO ──
    // Solo se muestra la última semana del mes
    const now = new Date();
    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const daysRemaining = lastDayOfMonth - now.getDate();

    if (daysRemaining <= 6) {
        // Calcular el mes siguiente
        const nextMonth = now.getMonth() + 2; // +2 porque getMonth() es 0-based y necesitamos el mes real +1
        const nextYear = now.getFullYear() + (nextMonth > 12 ? 1 : 0);
        const realNextMonth = nextMonth > 12 ? nextMonth - 12 : nextMonth;
        const nextMonthStr = String(realNextMonth).padStart(2, '0');

        const [workers10m] = await pool.query(`
            SELECT t.id, t.rut, t.nombres, t.apellido_paterno, t.fecha_ingreso,
                   e.razon_social as empresa_nombre,
                   DATE_ADD(t.fecha_ingreso, INTERVAL 10 MONTH) as fecha_cumple_10m
            FROM trabajadores t
            LEFT JOIN empresas e ON t.empresa_id = e.id
            WHERE t.activo = 1
              AND t.fecha_ingreso IS NOT NULL
              AND MONTH(DATE_ADD(t.fecha_ingreso, INTERVAL 10 MONTH)) = ?
              AND YEAR(DATE_ADD(t.fecha_ingreso, INTERVAL 10 MONTH)) = ?
            ORDER BY DATE_ADD(t.fecha_ingreso, INTERVAL 10 MONTH) ASC, t.apellido_paterno ASC, t.apellido_materno ASC, t.nombres ASC
        `, [realNextMonth, nextYear]);

        if (workers10m.length > 0) {
            alertas.push({
                tipo: 'info',
                titulo: '10 Meses de Contrato',
                mensaje: `${workers10m.length} trabajador(es) cumplen 10 meses de contratado en ${nextMonthStr}/${nextYear}.`,
                count: workers10m.length,
                ruta: '/consultas',
                detalle10meses: workers10m.map(w => ({
                    id: w.id,
                    rut: w.rut,
                    nombre: `${w.nombres} ${w.apellido_paterno}`,
                    empresa: w.empresa_nombre || '-',
                    fecha_ingreso: w.fecha_ingreso,
                    fecha_10m: w.fecha_cumple_10m
                }))
            });

            // Add to pending tasks
            workers10m.forEach(w => {
                pendingTasks.push({
                    severity: 'info',
                    category: 'contratos',
                    title: `${w.nombres} ${w.apellido_paterno} cumple 10 meses`,
                    description: `En ${nextMonthStr}/${nextYear} — revisar renovación`,
                    action: { label: 'Ver trabajador', ruta: `/consultas?q=${w.rut}` },
                    meta: { rut: w.rut }
                });
            });
        }
    }

    // ── ALERTAS DE INASISTENCIA DEL MES ──
    if (canSee(permisos, 'asistencia')) {
        try {
            const now = new Date();
            const obraIdParam = obraId ? obraId : 'ALL';
            const alertasFaltas = await asistenciaService.getAlertasFaltas(obraIdParam, now.getMonth() + 1, now.getFullYear());
            result.trabajadoresConAlertas = alertasFaltas.slice(0, 20);
        } catch (e) {
            console.error('[Dashboard] Error fetching alertas de faltas:', e.message);
            result.trabajadoresConAlertas = [];
        }
    }

    // ── SORT PENDING TASKS BY SEVERITY ──
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    pendingTasks.sort((a, b) => (severityOrder[a.severity] ?? 3) - (severityOrder[b.severity] ?? 3));
    result.pendingTasks = pendingTasks.slice(0, 15); // Max 15 tasks

    // ── SALUDO CONTEXTUAL ──
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

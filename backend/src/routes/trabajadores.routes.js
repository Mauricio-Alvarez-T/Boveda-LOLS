const router = require('express').Router();
const auth = require('../middleware/auth');
const db = require('../config/db');

// Worker Quick-View (combines worker info + doc completion + recent attendance)
router.get('/:id/quick-view', auth, async (req, res, next) => {
    try {
        const { id } = req.params;

        // 1. Worker basic info
        const [workers] = await db.query(
            `SELECT t.*, e.razon_social as empresa_nombre, o.nombre as obra_nombre, c.nombre as cargo_nombre
             FROM trabajadores t
             LEFT JOIN empresas e ON t.empresa_id = e.id
             LEFT JOIN obras o ON t.obra_id = o.id
             LEFT JOIN cargos c ON t.cargo_id = c.id
             WHERE t.id = ?`, [id]
        );
        if (!workers.length) return res.status(404).json({ error: 'Trabajador no encontrado' });

        // 2. Document completion
        const [totalDocs] = await db.query(`SELECT COUNT(*) as total FROM tipos_documento WHERE activo = TRUE AND obligatorio = TRUE`);
        const [completedDocs] = await db.query(
            `SELECT COUNT(DISTINCT d.tipo_documento_id) as completed
             FROM documentos d
             JOIN tipos_documento td ON d.tipo_documento_id = td.id
             WHERE d.trabajador_id = ? AND d.activo = TRUE AND td.obligatorio = TRUE
               AND (td.dias_vigencia IS NULL OR d.fecha_vencimiento IS NULL OR d.fecha_vencimiento >= CURDATE())`,
            [id]
        );

        // 3. Last 5 attendance records
        const [attendance] = await db.query(
            `SELECT a.fecha, a.hora_entrada, a.hora_salida, a.horas_extra, a.observacion,
                    ea.nombre as estado_nombre, ea.codigo as estado_codigo, ea.color as estado_color, ea.es_presente,
                    ta.nombre as tipo_ausencia_nombre
             FROM asistencia a
             LEFT JOIN estados_asistencia ea ON a.estado_id = ea.id
             LEFT JOIN tipos_ausencia ta ON a.tipo_ausencia_id = ta.id
             WHERE a.trabajador_id = ?
             ORDER BY a.fecha DESC
             LIMIT 5`, [id]
        );

        res.json({
            worker: workers[0],
            docs: {
                total: totalDocs[0].total,
                completed: completedDocs[0].completed
            },
            recentAttendance: attendance
        });
    } catch (err) { next(err); }
});

module.exports = router;

const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const asistenciaService = require('../services/asistencia.service');

/**
 * RUTAS DE EXPORTACIÓN (Poner arriba para evitar conflictos)
 */

// Genera un token para descarga pública (Requiere Auth)
router.get('/public-report-token', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const token = asistenciaService.generatePublicReportToken(req.query);
        res.json({ data: { token } });
    } catch (err) { next(err); }
});

// Descarga pública de Excel
router.get('/publico/excel', async (req, res, next) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token es requerido' });

        const params = asistenciaService.validatePublicReportToken(token);
        const buffer = await asistenciaService.generarExcel(params);
        const fileName = `asistencia_${params.obra_id || 'todas'}_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (err) {
        res.status(401).json({ error: 'Link inválido' });
    }
});
router.get('/estados', auth, async (req, res, next) => {
    try {
        const result = await asistenciaService.getEstados();
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Bulk create/update
router.post('/bulk/:obra_id', auth, checkPermission('asistencia', 'puede_crear'), async (req, res, next) => {
    try {
        const { obra_id } = req.params;
        const { registros } = req.body;
        if (!obra_id || !registros || !Array.isArray(registros)) {
            return res.status(400).json({ error: 'obra_id y registros[] son requeridos' });
        }
        const result = await asistenciaService.bulkCreate(obra_id, registros, req.user.id, req);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// Get by obra and date
router.get('/obra/:obraId', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const { obraId } = req.params;
        const { fecha } = req.query;
        if (!fecha) {
            return res.status(400).json({ error: 'Parámetro fecha es requerido (?fecha=YYYY-MM-DD)' });
        }
        const result = await asistenciaService.getByObraAndFecha(obraId, fecha);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Daily summary/KPIs for an obra
router.get('/resumen/:obraId', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const { obraId } = req.params;
        const { fecha } = req.query;
        if (!fecha) {
            return res.status(400).json({ error: 'Parámetro fecha es requerido (?fecha=YYYY-MM-DD)' });
        }
        const result = await asistenciaService.getResumenDiario(obraId, fecha);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Update with audit log
router.put('/:id', auth, checkPermission('asistencia', 'puede_editar'), async (req, res, next) => {
    try {
        const result = await asistenciaService.update(req.params.id, req.body, req.user.id);
        res.json(result);
    } catch (err) { next(err); }
});

// Report
router.get('/reporte', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await asistenciaService.getReporte(req.query);
        res.json(result);
    } catch (err) { next(err); }
});

// Audit log for a specific attendance record
router.get('/log/:asistenciaId', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await asistenciaService.getLog(req.params.asistenciaId);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Schedule configuration
router.get('/horarios/:obraId', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await asistenciaService.getHorarios(req.params.obraId);
        res.json({ data: result });
    } catch (err) { next(err); }
});

router.post('/horarios/:obraId', auth, checkPermission('asistencia', 'puede_editar'), async (req, res, next) => {
    try {
        const { horarios } = req.body;
        if (!horarios || !Array.isArray(horarios)) {
            return res.status(400).json({ error: 'horarios[] es requerido' });
        }
        const result = await asistenciaService.saveHorarios(req.params.obraId, horarios);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Export Excel (Authenticated)
router.get('/exportar/excel', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const buffer = await asistenciaService.generarExcel(req.query);
        const fileName = `asistencia_${req.query.obra_id || 'todas'}_${new Date().toISOString().split('T')[0]}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(buffer);
    } catch (err) {
        console.error('[CRITICAL ERROR] Fallo en /exportar/excel:', err.message);
        console.error(err.stack);
        next(err);
    }
});

// ═══ PERÍODOS DE AUSENCIA ═══

// ═══ PERÍODOS DE AUSENCIA ═══

// Create period
router.post('/periodos', auth, checkPermission('asistencia', 'puede_crear'), async (req, res, next) => {
    try {
        const result = await asistenciaService.crearPeriodo(req.body, req.user.id, req);
        res.status(201).json({ data: result });
    } catch (err) { next(err); }
});

// Get periods
router.get('/periodos', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await asistenciaService.getPeriodos(req.query);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Cancel period
router.delete('/periodos/:id', auth, checkPermission('asistencia', 'puede_editar'), async (req, res, next) => {
    try {
        const result = await asistenciaService.cancelarPeriodo(req.params.id, req.user.id, req);
        res.json({ data: result });
    } catch (err) { next(err); }
});

module.exports = router;


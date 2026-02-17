const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const asistenciaService = require('../services/asistencia.service');

// Bulk create
router.post('/bulk', auth, checkPermission('asistencia', 'puede_crear'), async (req, res, next) => {
    try {
        const { obra_id, registros } = req.body;
        if (!obra_id || !registros || !Array.isArray(registros)) {
            return res.status(400).json({ error: 'obra_id y registros[] son requeridos' });
        }
        const result = await asistenciaService.bulkCreate(obra_id, registros, req.user.id);
        res.status(201).json(result);
    } catch (err) { next(err); }
});

// Get by obra and date
router.get('/obra/:obraId/fecha/:fecha', auth, checkPermission('asistencia', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await asistenciaService.getByObraAndFecha(req.params.obraId, req.params.fecha);
        res.json(result);
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

module.exports = router;

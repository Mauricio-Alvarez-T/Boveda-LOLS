const express = require('express');
const router = express.Router();
const configHorariosService = require('../services/config-horarios.service');
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

// Get weekly config for a specific obra
router.get('/obra/:obraId', auth, checkPermission('asistencia', 'puede_ver'), async (req, res) => {
    try {
        const data = await configHorariosService.getByObraId(req.params.obraId);
        res.json({ data });
    } catch (error) {
        console.error('Error fetching config horarios:', error);
        res.status(500).json({ error: 'Error del servidor al obtener la configuración de horarios.' });
    }
});

// Update weekly config for a specific obra
router.put('/obra/:obraId/bulk', auth, checkPermission('asistencia', 'puede_editar'), async (req, res) => {
    try {
        const { schedules } = req.body;
        if (!Array.isArray(schedules)) {
            return res.status(400).json({ error: 'El formato de horarios es inválido.' });
        }

        const result = await configHorariosService.updateWeeklyConfig(req.params.obraId, schedules);
        res.json(result);
    } catch (error) {
        console.error('Error updating config horarios:', error);
        res.status(500).json({ error: 'Error del servidor al actualizar la configuración de horarios.' });
    }
});

module.exports = router;

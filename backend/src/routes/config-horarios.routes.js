const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const configHorariosService = require('../services/config-horarios.service');

// Obtener configuración global de horarios
router.get('/', auth, checkPermission('asistencia.horarios.ver'), async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT * FROM configuracion_asistencia LIMIT 1');
        res.json(rows[0] || {});
    } catch (err) { next(err); }
});

// Guardar configuración global
router.post('/', auth, checkPermission('asistencia.horarios.editar'), async (req, res, next) => {
    try {
        const { tolerancia_atraso, tolerancia_salida_temprana, hora_inicio_jornada, hora_fin_jornada } = req.body;
        
        await db.query(
            `INSERT INTO configuracion_asistencia (id, tolerancia_atraso, tolerancia_salida_temprana, hora_inicio_jornada, hora_fin_jornada)
             VALUES (1, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
                tolerancia_atraso = VALUES(tolerancia_atraso),
                tolerancia_salida_temprana = VALUES(tolerancia_salida_temprana),
                hora_inicio_jornada = VALUES(hora_inicio_jornada),
                hora_fin_jornada = VALUES(hora_fin_jornada)`,
            [tolerancia_atraso, tolerancia_salida_temprana, hora_inicio_jornada, hora_fin_jornada]
        );
        
        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (err) { next(err); }
});

// Obtener horarios por obra
router.get('/obra/:obraId', auth, checkPermission('asistencia.horarios.ver'), async (req, res, next) => {
    try {
        const { obraId } = req.params;
        const rows = await configHorariosService.getByObraId(obraId);
        res.json({ data: rows });
    } catch (err) { next(err); }
});

// Guardar horarios por obra (bulk)
router.put('/obra/:obraId/bulk', auth, checkPermission('asistencia.horarios.editar'), async (req, res, next) => {
    try {
        const { obraId } = req.params;
        const { schedules } = req.body;

        if (!schedules || !Array.isArray(schedules)) {
            return res.status(400).json({ error: 'schedules[] es requerido' });
        }

        const result = await configHorariosService.updateWeeklyConfig(obraId, schedules);
        res.json(result);
    } catch (err) { next(err); }
});

module.exports = router;


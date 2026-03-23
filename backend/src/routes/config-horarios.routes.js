const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');

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

module.exports = router;

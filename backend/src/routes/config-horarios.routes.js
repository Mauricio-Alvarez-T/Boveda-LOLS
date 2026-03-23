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

// Obtener horarios por obra
router.get('/obra/:obraId', auth, checkPermission('asistencia.horarios.ver'), async (req, res, next) => {
    try {
        const { obraId } = req.params;
        
        // Try to get obra-specific schedules
        const [rows] = await db.query(
            `SELECT * FROM horarios_obra WHERE obra_id = ? ORDER BY dia_semana ASC`,
            [obraId]
        );

        // If no obra-specific schedules, return defaults
        if (rows.length === 0) {
            const defaultDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            const defaults = defaultDays.map((dia, i) => ({
                dia_semana: i,
                dia_nombre: dia,
                entrada: '08:00',
                salida: '18:00',
                inicio_colacion: '13:00',
                fin_colacion: '14:00',
                obra_id: parseInt(obraId)
            }));
            return res.json({ data: defaults, isDefault: true });
        }

        res.json({ data: rows, isDefault: false });
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

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            
            // Delete existing schedules for this obra
            await conn.query('DELETE FROM horarios_obra WHERE obra_id = ?', [obraId]);
            
            // Insert new schedules
            for (const s of schedules) {
                await conn.query(
                    `INSERT INTO horarios_obra (obra_id, dia_semana, entrada, salida, inicio_colacion, fin_colacion)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [obraId, s.dia_semana, s.entrada, s.salida, s.inicio_colacion || null, s.fin_colacion || null]
                );
            }
            
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }

        res.json({ message: 'Horarios guardados exitosamente' });
    } catch (err) { next(err); }
});

module.exports = router;


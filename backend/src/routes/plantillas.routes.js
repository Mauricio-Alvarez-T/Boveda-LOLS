const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');

/**
 * Plantillas de correo por usuario.
 * Montado en: /api/usuarios/me/plantillas
 */

// GET all plantillas for the logged-in user
router.get('/', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM plantillas_correo WHERE usuario_id = ? ORDER BY predeterminada DESC, id ASC',
            [req.user.id]
        );
        res.json({ data: rows });
    } catch (err) {
        // If table doesn't exist, return empty gracefully
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.json({ data: [] });
        }
        next(err);
    }
});

// POST create a new plantilla
router.post('/', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        const { nombre, asunto, cuerpo } = req.body;
        if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

        const [result] = await db.query(
            'INSERT INTO plantillas_correo (usuario_id, nombre, asunto, cuerpo) VALUES (?, ?, ?, ?)',
            [req.user.id, nombre, asunto || '', cuerpo || '']
        );
        res.status(201).json({ id: result.insertId, nombre, asunto, cuerpo });
    } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
            return res.status(503).json({ error: 'Tabla plantillas_correo no existe. Contacte al administrador.' });
        }
        next(err);
    }
});

// PUT update a plantilla
router.put('/:id', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        const { nombre, asunto, cuerpo } = req.body;
        const [result] = await db.query(
            'UPDATE plantillas_correo SET nombre = ?, asunto = ?, cuerpo = ? WHERE id = ? AND usuario_id = ?',
            [nombre, asunto || '', cuerpo || '', req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }
        res.json({ id: req.params.id, nombre, asunto, cuerpo });
    } catch (err) { next(err); }
});

// PUT set as default
router.put('/:id/predeterminar', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        // Unset all others for this user
        await db.query('UPDATE plantillas_correo SET predeterminada = 0 WHERE usuario_id = ?', [req.user.id]);
        // Set the selected one
        await db.query('UPDATE plantillas_correo SET predeterminada = 1 WHERE id = ? AND usuario_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Plantilla predeterminada actualizada' });
    } catch (err) { next(err); }
});

// DELETE a plantilla
router.delete('/:id', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        const [result] = await db.query(
            'DELETE FROM plantillas_correo WHERE id = ? AND usuario_id = ?',
            [req.params.id, req.user.id]
        );
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Plantilla no encontrada' });
        }
        res.json({ message: 'Plantilla eliminada' });
    } catch (err) { next(err); }
});

module.exports = router;

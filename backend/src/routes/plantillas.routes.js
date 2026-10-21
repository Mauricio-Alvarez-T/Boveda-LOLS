const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');

/**
 * Plantillas de correo por usuario.
 * Montado en: /api/usuarios/me/plantillas
 *
 * La columna de «predeterminada» se llama `es_predeterminada` (migración 009 y production_schema.sql),
 * pero estas rutas pedían `predeterminada` —el nombre del viejo scripts/migrations/migrate_missing_tables.js—
 * y el GET caía en 500: «Error al cargar plantillas» al abrir «Enviar reporte» (Marcos 2026-10-21). Se
 * aceptan los dos nombres, y la respuesta siempre trae `es_predeterminada`, que es lo que lee el frontend.
 */
const COLUMNAS_PREDETERMINADA = ['es_predeterminada', 'predeterminada'];
const esPredeterminada = (fila) => Boolean(Number(fila.es_predeterminada ?? fila.predeterminada ?? 0));

// GET all plantillas for the logged-in user (la predeterminada primero; el resto por id)
router.get('/', auth, checkPermission('sistema.plantillas.gestionar'), async (req, res, next) => {
    try {
        const [rows] = await db.query(
            'SELECT * FROM plantillas_correo WHERE usuario_id = ? ORDER BY id ASC',
            [req.user.id]
        );
        const data = rows
            .map(fila => ({ ...fila, es_predeterminada: esPredeterminada(fila) }))
            .sort((x, y) => Number(y.es_predeterminada) - Number(x.es_predeterminada));
        res.json({ data });
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
        // Una sola sentencia: la elegida queda en 1 y las demás del usuario en 0. Prueba los dos nombres de columna.
        for (const columna of COLUMNAS_PREDETERMINADA) {
            try {
                await db.query(
                    `UPDATE plantillas_correo SET ${columna} = (id = ?) WHERE usuario_id = ?`,
                    [req.params.id, req.user.id]
                );
                return res.json({ message: 'Plantilla predeterminada actualizada' });
            } catch (err) {
                if (err.code !== 'ER_BAD_FIELD_ERROR') throw err;
            }
        }
        res.status(500).json({ error: 'La tabla plantillas_correo no tiene columna de predeterminada' });
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

const router = require('express').Router();
const auth = require('../middleware/auth');
const service = require('../services/tutoriales.service');

/**
 * Progreso de tutoriales del Centro de ayuda. Datos PROPIOS del usuario (solo
 * `auth`, sin permiso especial): cada quien ve/edita su propio progreso vía
 * req.user.id.
 */

const ID_RE = /^[a-z0-9-]{1,64}$/;

// Lista los tutoriales completados por el usuario actual.
router.get('/', auth, async (req, res, next) => {
    try {
        res.json(await service.getProgreso(req.user.id));
    } catch (err) { next(err); }
});

// Marca un tutorial como completado (idempotente).
router.put('/:tutorialId', auth, async (req, res, next) => {
    try {
        const { tutorialId } = req.params;
        if (!ID_RE.test(tutorialId)) {
            return res.status(400).json({ error: 'tutorial_id inválido' });
        }
        res.json(await service.marcarCompletado(req.user.id, tutorialId));
    } catch (err) { next(err); }
});

// Reinicia (borra) todo el progreso del usuario actual.
router.delete('/', auth, async (req, res, next) => {
    try {
        await service.reiniciar(req.user.id);
        res.json({ ok: true });
    } catch (err) { next(err); }
});

module.exports = router;

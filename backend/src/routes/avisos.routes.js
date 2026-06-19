const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const avisosService = require('../services/avisosDiarios.service');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');

const PERMISO = 'sistema.avisos.gestionar';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/avisos/enviar-prueba
 * Envía el resumen del día previo a un destinatario (valida SMTP/diseño). Si no se
 * pasa `to`, usa el email del usuario logueado. forzar=true → manda aunque no haya
 * novedades (para que el test no quede en silencio).
 */
router.post('/enviar-prueba', auth, checkPermission(PERMISO), async (req, res, next) => {
    try {
        const to = (req.body && req.body.to ? String(req.body.to) : req.user?.email || '').trim();
        if (!to || !EMAIL_RE.test(to)) {
            return res.status(400).json({ error: 'Email de prueba inválido.' });
        }
        const result = await avisosService.enviarResumen({
            db, to: [to], fecha: req.body?.fecha || undefined, forzar: true, dry: false,
        });
        res.json({ ok: true, to, total: result.total, subject: result.subject, messageId: result.messageId });
    } catch (err) {
        next(err);
    }
});

// CRUD de REGLAS (categorías): solo LISTAR y EDITAR (activo/umbral/etiqueta).
// Las categorías son fijas (seed en mig 084) → no se crean ni borran desde la UI.
const reglasService = createCrudService('avisos_reglas', {
    searchFields: ['categoria', 'etiqueta'],
    orderBy: 'orden ASC, id ASC',
    allowedFields: ['etiqueta', 'activo', 'umbral'],
});
router.use('/reglas', createCrudRoutes(createCrudController(reglasService), {
    ver: PERMISO,
    editar: PERMISO,
}));

// CRUD de SUSCRIPTORES (destinatarios): completo. Mismo patrón que reportes_suscriptores.
const suscriptoresService = createCrudService('avisos_suscriptores', {
    searchFields: ['email', 'nombre'],
    orderBy: 'email ASC',
    allowedFields: ['email', 'nombre', 'activo'],
});
router.use('/suscriptores', createCrudRoutes(createCrudController(suscriptoresService), {
    ver: PERMISO,
    crear: PERMISO,
    editar: PERMISO,
    eliminar: PERMISO,
}));

module.exports = router;

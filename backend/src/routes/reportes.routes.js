const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const db = require('../config/db');
const reporteService = require('../services/reporteSemanal.service');
const { isSmtpError, smtpErrorPayload } = require('../utils/mailError');
const createCrudService = require('../services/crud.service');
const createCrudController = require('../controllers/crud.controller');
const createCrudRoutes = require('./crud.routes');

const PERMISO = 'sistema.reportes.gestionar';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/reportes/enviar-prueba
 * Envía el reporte real de la semana previa a un único destinatario (para validar
 * SMTP/diseño). Si no se pasa `to`, usa el email del usuario logueado. Resolver el
 * destinatario en servidor evita enviar a direcciones arbitrarias sin control.
 */
router.post('/enviar-prueba', auth, checkPermission(PERMISO), async (req, res, next) => {
    // `to` se declara fuera del try para poder nombrarlo en el mensaje de error SMTP.
    const to = (req.body && req.body.to ? String(req.body.to) : req.user?.email || '').trim();
    try {
        if (!to || !EMAIL_RE.test(to)) {
            return res.status(400).json({ error: 'Email de prueba inválido.' });
        }
        const result = await reporteService.enviarReporteSemanal({ db, to: [to], dry: false });
        res.json({ ok: true, to, messageId: result.messageId, subject: result.subject });
    } catch (err) {
        // Rechazo SMTP (buzón inexistente / conexión) → 502 con mensaje accionable que nombra
        // la dirección, en vez del 500 genérico con el string crudo de nodemailer.
        if (isSmtpError(err)) {
            return res.status(502).json(smtpErrorPayload(err, to));
        }
        next(err);
    }
});

// CRUD de suscriptores (factory genérico, igual patrón que feriados.routes.js).
const service = createCrudService('reportes_suscriptores', {
    searchFields: ['email', 'nombre'],
    orderBy: 'email ASC',
    allowedFields: ['email', 'nombre', 'activo'],
});
const controller = createCrudController(service);

router.use('/suscriptores', createCrudRoutes(controller, {
    ver: PERMISO,
    crear: PERMISO,
    editar: PERMISO,
    eliminar: PERMISO,
}));

module.exports = router;

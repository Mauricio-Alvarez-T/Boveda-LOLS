const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');

let emailService;
try {
    emailService = require('../services/email.service');
} catch (e) {
    console.warn('[EMAIL-CONFIG] email.service no disponible:', e.message);
}

router.get('/', auth, checkPermission('sistema.email.configurar'), async (req, res, next) => {
    try {
        if (!emailService || typeof emailService.getConfig !== 'function') {
            return res.json({ configured: false, message: 'Servicio de email no disponible' });
        }
        const config = await emailService.getConfig();
        res.json(config);
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('sistema.email.configurar'), async (req, res, next) => {
    try {
        if (!emailService || typeof emailService.saveConfig !== 'function') {
            return res.status(501).json({ error: 'Servicio de email no implementado' });
        }
        await emailService.saveConfig(req.body);
        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (err) { next(err); }
});

module.exports = router;


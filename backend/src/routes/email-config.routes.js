const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const emailService = require('../services/email.service');

router.get('/', auth, checkPermission('sistema.email.configurar'), async (req, res, next) => {
    try {
        const config = await emailService.getConfig();
        res.json(config);
    } catch (err) { next(err); }
});

router.post('/', auth, checkPermission('sistema.email.configurar'), async (req, res, next) => {
    try {
        await emailService.saveConfig(req.body);
        res.json({ message: 'Configuración guardada exitosamente' });
    } catch (err) { next(err); }
});

module.exports = router;

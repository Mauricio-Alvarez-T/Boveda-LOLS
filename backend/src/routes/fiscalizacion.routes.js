const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const zipService = require('../services/zip.service');
const emailService = require('../services/email.service');
const fs = require('fs');

// Export ZIP
router.post('/exportar', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajador_ids } = req.body;
        if (!trabajador_ids || !Array.isArray(trabajador_ids)) {
            return res.status(400).json({ error: 'trabajador_ids[] es requerido' });
        }
        const zipPath = await zipService.createZip(trabajador_ids);
        res.download(zipPath, 'fiscalizacion.zip', () => {
            // Clean up temp file after download
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        });
    } catch (err) { next(err); }
});

// Export + Send via email
router.post('/enviar', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajador_ids, destinatario_email, asunto, mensaje, email_password } = req.body;

        if (!trabajador_ids || !destinatario_email || !email_password) {
            return res.status(400).json({ error: 'trabajador_ids[], destinatario_email y email_password son requeridos' });
        }

        // Create ZIP
        const zipPath = await zipService.createZip(trabajador_ids);

        // Send email from current user's corporate email
        const db = require('../config/db');
        const [users] = await db.query('SELECT email_corporativo FROM usuarios WHERE id = ?', [req.user.id]);
        const fromEmail = users[0]?.email_corporativo;

        if (!fromEmail) {
            return res.status(400).json({ error: 'El usuario no tiene configurado un email corporativo' });
        }

        const result = await emailService.sendWithAttachment({
            from: fromEmail,
            fromPassword: email_password,
            to: destinatario_email,
            subject: asunto || 'Documentación Laboral - Fiscalización',
            body: mensaje || 'Adjunto la documentación solicitada para la fiscalización.',
            attachmentPath: zipPath
        });

        // Clean up temp file
        if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        res.json({ message: 'Email enviado exitosamente', ...result });
    } catch (err) { next(err); }
});

module.exports = router;

const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const zipService = require('../services/zip.service');
const fiscalizacionService = require('../services/fiscalizacion.service');
const emailService = require('../services/email.service');
const fs = require('fs');

// Advanced Search Endpoint
router.get('/trabajadores-avanzado', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const result = await fiscalizacionService.searchTrabajadores(req.query);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Export Excel Endpoint
router.post('/exportar-excel', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajadores } = req.body;
        if (!trabajadores || !Array.isArray(trabajadores)) {
            return res.status(400).json({ error: 'Lista de trabajadores es requerida' });
        }

        const excelPath = await fiscalizacionService.generarExcel(trabajadores);
        res.download(excelPath, 'Fiscalizacion.xlsx', () => {
            if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
        });
    } catch (err) { next(err); }
});

// Export + Send Excel via email
router.post('/enviar-excel', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajadores, destinatario_email, asunto, mensaje, email_password } = req.body;

        if (!trabajadores || !destinatario_email || !email_password) {
            return res.status(400).json({ error: 'trabajadores, destinatario_email y email_password son requeridos' });
        }

        const excelPath = await fiscalizacionService.generarExcel(trabajadores);

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
            subject: asunto || 'Reporte de Fiscalización - Bóveda LOLS',
            body: mensaje || 'Adjunto la nómina solicitada para la fiscalización.',
            attachmentPath: excelPath
        });

        if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);

        res.json({ message: 'Email enviado exitosamente', ...result });
    } catch (err) { next(err); }
});

// Legacy Export ZIP (Keep for backwards compatibility if needed)
router.post('/exportar', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajador_ids } = req.body;
        if (!trabajador_ids || !Array.isArray(trabajador_ids)) {
            return res.status(400).json({ error: 'trabajador_ids[] es requerido' });
        }
        const zipPath = await zipService.createZip(trabajador_ids);
        res.download(zipPath, 'fiscalizacion.zip', () => {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        });
    } catch (err) { next(err); }
});

module.exports = router;

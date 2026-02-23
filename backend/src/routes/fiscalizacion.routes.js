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
        console.log(`[EXPORT EXCEL] Recibida petición con ${trabajadores ? trabajadores.length : 'undefined'} trabajadores`);
        if (!trabajadores || !Array.isArray(trabajadores)) {
            return res.status(400).json({ error: 'Lista de trabajadores es requerida' });
        }

        const excelPath = await fiscalizacionService.generarExcel(trabajadores);
        res.download(excelPath, 'Fiscalizacion.xlsx', () => {
            if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
        });
    } catch (err) { next(err); }
});

// Export + Send Excel via email (uses saved credentials from the user's profile)
router.post('/enviar-excel', auth, checkPermission('documentos', 'puede_ver'), async (req, res, next) => {
    try {
        const { trabajadores, destinatario_email, asunto, cuerpo } = req.body;

        if (!trabajadores || !destinatario_email) {
            return res.status(400).json({ error: 'trabajadores y destinatario_email son requeridos' });
        }

        // Retrieve saved credentials from the user's profile
        const db = require('../config/db');
        const emailConfigRoutes = require('./email-config.routes');
        const credentials = await emailConfigRoutes.getDecryptedPassword(req.user.id);

        if (!credentials || !credentials.email || !credentials.password) {
            console.error('[EMAIL ERROR] No credentials found for user', req.user.id);
            return res.status(400).json({
                error: 'El usuario no tiene credenciales de correo configuradas. Ve a Configuración > Mi Correo para guardarlas.',
                code: 'NO_EMAIL_CREDENTIALS'
            });
        }

        console.log(`[EMAIL DEBUG] Autenticando con: ${credentials.email}`);
        const trabajadorIds = trabajadores.map(t => t.id);

        const excelPath = await fiscalizacionService.generarExcel(trabajadores);
        let zipPath = null;
        try {
            zipPath = await zipService.createZip(trabajadorIds);
        } catch (e) {
            console.error('Error generando ZIP de documentos:', e);
        }

        const attachmentPaths = [excelPath];
        if (zipPath && fs.existsSync(zipPath)) {
            attachmentPaths.push(zipPath);
        }
        console.log(`[EMAIL DEBUG] Adjuntos preparados: ${attachmentPaths.length} archivos`);

        const result = await emailService.sendWithAttachment({
            from: credentials.email,
            fromPassword: credentials.password,
            to: destinatario_email,
            subject: asunto || 'Reporte de Nómina y Documentación - Bóveda LOLS',
            body: cuerpo || 'Adjunto la nómina y la documentación respaldatoria solicitada.',
            attachmentPaths
        });

        // Cleanup temp files
        if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
        if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        res.json({ message: 'Email con Excel y Documentación enviado exitosamente', ...result });
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

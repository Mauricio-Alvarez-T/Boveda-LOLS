const router = require('express').Router();
const auth = require('../middleware/auth');
const { checkPermission } = require('../middleware/rbac');
const zipService = require('../services/zip.service');
const fiscalizacionService = require('../services/fiscalizacion.service');
const asistenciaService = require('../services/asistencia.service');
const emailService = require('../services/email.service');
const fs = require('fs');
const path = require('path');

// Advanced Search Endpoint
router.get('/trabajadores-avanzado', auth, checkPermission('documentos.ver'), async (req, res, next) => {
    try {
        const result = await fiscalizacionService.searchTrabajadores(req.query);
        res.json({ data: result });
    } catch (err) { next(err); }
});

// Export Excel Endpoint - DEPRECATED (Moved to asistencia service)

// Export + Send Excel via email (uses saved credentials from the user's profile)
router.post('/enviar-excel', auth, checkPermission('reportes.enviar_email'), async (req, res, next) => {
    try {
        const { filters, trabajador_ids, destinatario_email, asunto, cuerpo } = req.body;

        if (!destinatario_email) {
            return res.status(400).json({ error: 'destinatario_email es requerido' });
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
        
        // Generar Excel usando el servicio de asistencia (nuevo formato unificado)
        const buffer = await asistenciaService.generarExcel({
            ...filters,
            trabajador_ids
        });

        const excelPath = path.join(__dirname, '..', '..', 'tmp', `Reporte_Asistencia_${Date.now()}.xlsx`);
        if (!fs.existsSync(path.dirname(excelPath))) {
            fs.mkdirSync(path.dirname(excelPath), { recursive: true });
        }
        fs.writeFileSync(excelPath, buffer);

        let zipPath = null;
        const workerIds = trabajador_ids || (filters.trabajador_id ? [filters.trabajador_id] : []);
        if (workerIds.length > 0) {
            try {
                zipPath = await zipService.createZip(workerIds);
            } catch (e) {
                console.error('Error generando ZIP de documentos:', e);
            }
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
            subject: asunto || 'Reporte de Personal y Documentación - Bóveda LOLS',
            body: cuerpo || 'Adjunto el reporte y la documentación respaldatoria solicitada.',
            attachmentPaths
        });

        // Cleanup temp files
        if (fs.existsSync(excelPath)) fs.unlinkSync(excelPath);
        if (zipPath && fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

        res.json({ message: 'Email con Excel y Documentación enviado exitosamente', ...result });
    } catch (err) { next(err); }
});


module.exports = router;

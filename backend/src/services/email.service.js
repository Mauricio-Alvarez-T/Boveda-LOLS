const nodemailer = require('nodemailer');
const path = require('path');

const emailService = {
    /**
     * Envía un email con múltiples archivos adjuntos (Excel y ZIP).
     * @param {object} options
     * @param {string} options.from - Email del remitente (corporativo del supervisor)
     * @param {string} options.fromPassword - Contraseña o app password del remitente
     * @param {string} options.to - Email del destinatario (inspector)
     * @param {string} options.subject - Asunto del correo
     * @param {string} options.body - Cuerpo del correo
     * @param {string[]} options.attachmentPaths - Rutas de los archivos a adjuntar
     */
    async sendWithAttachment({ from, fromPassword, to, subject, body, attachmentPaths = [] }) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: from,
                pass: fromPassword
            }
        });

        // Convert array of string paths to Nodemailer attachment objects
        const attachments = attachmentPaths.map(filePath => ({
            filename: path.basename(filePath),
            path: filePath
        }));

        const info = await transporter.sendMail({
            from: `"SGDL - Fiscalización" <${from}>`,
            to,
            subject: subject || 'Documentación Laboral - Fiscalización',
            text: body || 'Adjunto la documentación solicitada.',
            attachments
        });

        return { messageId: info.messageId, accepted: info.accepted };
    }
};

module.exports = emailService;

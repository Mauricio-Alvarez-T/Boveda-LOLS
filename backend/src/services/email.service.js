const nodemailer = require('nodemailer');

const emailService = {
    /**
     * Envía un email con archivo adjunto (ZIP de fiscalización).
     * @param {object} options
     * @param {string} options.from - Email del remitente (corporativo del supervisor)
     * @param {string} options.fromPassword - Contraseña o app password del remitente
     * @param {string} options.to - Email del destinatario (inspector)
     * @param {string} options.subject - Asunto del correo
     * @param {string} options.body - Cuerpo del correo
     * @param {string} options.attachmentPath - Ruta del archivo ZIP
     */
    async sendWithAttachment({ from, fromPassword, to, subject, body, attachmentPath }) {
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: from,
                pass: fromPassword
            }
        });

        const path = require('path');
        const info = await transporter.sendMail({
            from: `"SGDL - Fiscalización" <${from}>`,
            to,
            subject: subject || 'Documentación Laboral - Fiscalización',
            text: body || 'Adjunto la documentación solicitada.',
            attachments: [
                {
                    filename: path.basename(attachmentPath),
                    path: attachmentPath
                }
            ]
        });

        return { messageId: info.messageId, accepted: info.accepted };
    }
};

module.exports = emailService;

const nodemailer = require('nodemailer');
const path = require('path');
const logger = require('../utils/logger-structured');

/**
 * Construye el transporter de la cuenta de SISTEMA a partir del entorno
 * (MAIL_HOST / MAIL_PORT / MAIL_SECURE / MAIL_USER / MAIL_PASS). Lanza si faltan
 * las requeridas. Compartido por sendSystemEmail() y verifyTransport().
 * @returns {{ transporter: import('nodemailer').Transporter, host: string, port: number, secure: boolean, user: string }}
 */
function buildSystemTransport() {
    const host = process.env.MAIL_HOST;
    const user = process.env.MAIL_USER;
    const pass = process.env.MAIL_PASS;
    if (!host || !user || !pass) {
        throw new Error('Faltan variables de entorno MAIL_HOST / MAIL_USER / MAIL_PASS para el envío de sistema.');
    }
    const port = Number(process.env.MAIL_PORT) || 465;
    // Si MAIL_SECURE no está definido, inferir: 465 → SSL directo (true), otro → STARTTLS (false).
    const secure = process.env.MAIL_SECURE != null
        ? String(process.env.MAIL_SECURE) === 'true'
        : port === 465;
    const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        tls: { rejectUnauthorized: false }
    });
    return { transporter, host, port, secure, user };
}

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
        const smtpConfig = {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: Number(process.env.SMTP_PORT) || 587,
            secure: String(process.env.SMTP_SECURE) === 'true',
            auth: {
                user: from,
                pass: fromPassword ? '***' + fromPassword.slice(-4) : 'MISSING'
            }
        };
        logger.debug('[EMAIL] Nodemailer Config', { smtpConfig });

        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure,
            auth: {
                user: from,
                pass: fromPassword
            },
            tls: {
                rejectUnauthorized: false
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
    },

    /**
     * Envía un correo desde la cuenta de SISTEMA (no de un usuario logueado).
     * Usado por automatizaciones/cron (ej. reporte semanal). Las credenciales
     * vienen del entorno: MAIL_HOST / MAIL_PORT / MAIL_SECURE / MAIL_USER / MAIL_PASS.
     *
     * @param {object} options
     * @param {string|string[]} options.to - Destinatario(s).
     * @param {string} options.subject
     * @param {string} [options.html] - Cuerpo HTML.
     * @param {string} [options.text] - Cuerpo texto plano (fallback).
     * @param {Array} [options.attachments] - Adjuntos nodemailer (incl. logo CID).
     * @param {string} [options.fromName] - Nombre visible del remitente.
     */
    async sendSystemEmail({ to, subject, html, text, attachments = [], fromName = 'Bóveda LOLS — Reportes' }) {
        const { transporter, user } = buildSystemTransport();

        const recipients = Array.isArray(to) ? to.filter(Boolean).join(', ') : to;
        if (!recipients) throw new Error('sendSystemEmail: lista de destinatarios vacía.');

        const info = await transporter.sendMail({
            from: `"${fromName}" <${user}>`,
            to: recipients,
            subject: subject || 'Reporte — Bóveda LOLS',
            text: text || undefined,
            html: html || undefined,
            attachments
        });

        // Rechazo PARCIAL: nodemailer solo LANZA si TODOS son rechazados; si algunos pasan
        // y otros no, resuelve OK con `rejected` poblado → lo dejamos visible en el log.
        if (info.rejected && info.rejected.length) {
            logger.warn('sendSystemEmail: el servidor rechazó destinatarios', {
                rejected: info.rejected,
                response: info.response,
            });
        }

        return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
    },

    /**
     * Verifica la conexión SMTP de la cuenta de SISTEMA sin enviar correo.
     * Diagnóstico (usado por el script `reporte-doctor`). Lanza si faltan las
     * variables MAIL_* requeridas o si el handshake SMTP falla.
     * @returns {Promise<{ host: string, port: number, secure: boolean, user: string }>}
     */
    async verifyTransport() {
        const { transporter, host, port, secure, user } = buildSystemTransport();
        await transporter.verify();
        return { host, port, secure, user };
    }
};

module.exports = emailService;

/**
 * Helpers para interpretar errores de nodemailer/SMTP y devolver mensajes accionables.
 *
 * nodemailer lanza cuando TODOS los destinatarios son rechazados; el error trae
 * `responseCode` (ej. 550), `response` (texto del servidor) y `rejected` (array de
 * direcciones). Estos helpers detectan ese caso y arman un payload claro para el cliente,
 * en vez de filtrar el string crudo con un 500 genérico.
 */

/** ¿El error es un rechazo SMTP (destinatario/conexión) y no un error genérico? */
function isSmtpError(err) {
    if (!err) return false;
    if (err.responseCode || err.code) return true;
    if (Array.isArray(err.rejected) && err.rejected.length) return true;
    return /rejected|550|no such user|mailbox|relay/i.test(err.message || '');
}

/**
 * Payload accionable para el cliente a partir de un error SMTP.
 * @param {Error} err  error de nodemailer.
 * @param {string} to  dirección a la que se intentó enviar.
 */
function smtpErrorPayload(err, to) {
    const code = (err && (err.responseCode || err.code)) || null;
    const rejected = err && Array.isArray(err.rejected) ? err.rejected : [];
    const motivo = (err && (err.response || err.message)) || 'rechazo del servidor de correo';
    return {
        error: `El servidor de correo rechazó el envío a ${to}. Motivo: ${motivo}. `
            + 'Si es un buzón @lols.cl probablemente no existe — revisá la dirección.',
        to,
        code,
        rejected,
    };
}

module.exports = { isSmtpError, smtpErrorPayload };

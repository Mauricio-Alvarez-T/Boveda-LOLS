/**
 * Tests del helper de errores SMTP (usado por /reportes/enviar-prueba para dar un
 * mensaje accionable en vez del 500 genérico con el string crudo de nodemailer).
 */
const { isSmtpError, smtpErrorPayload } = require('../src/utils/mailError');

describe('isSmtpError', () => {
    test('detecta rechazo por responseCode + rejected', () => {
        const err = Object.assign(
            new Error("Can't send mail - all recipients were rejected: 550 No Such User Here"),
            { responseCode: 550, rejected: ['mauricioalvarez@lols.cl'] }
        );
        expect(isSmtpError(err)).toBe(true);
    });

    test('detecta por mensaje aunque no haya responseCode', () => {
        expect(isSmtpError(new Error('550 No Such User Here'))).toBe(true);
        expect(isSmtpError(new Error('all recipients were rejected'))).toBe(true);
    });

    test('NO marca errores genéricos ni null', () => {
        expect(isSmtpError(new Error('fallo genérico de la app'))).toBe(false);
        expect(isSmtpError(null)).toBe(false);
        expect(isSmtpError(undefined)).toBe(false);
    });
});

describe('smtpErrorPayload', () => {
    test('nombra el destinatario, el motivo y arrastra code/rejected', () => {
        const err = Object.assign(new Error('rejected'), {
            responseCode: 550,
            response: '550 No Such User Here',
            rejected: ['mauricioalvarez@lols.cl'],
        });
        const p = smtpErrorPayload(err, 'mauricioalvarez@lols.cl');
        expect(p.to).toBe('mauricioalvarez@lols.cl');
        expect(p.code).toBe(550);
        expect(p.rejected).toEqual(['mauricioalvarez@lols.cl']);
        expect(p.error).toMatch(/rechazó el envío a mauricioalvarez@lols\.cl/);
        expect(p.error).toMatch(/No Such User Here/);
        expect(p.error).toMatch(/probablemente no existe/);
    });

    test('tolera error sin campos SMTP (code null, rejected vacío)', () => {
        const p = smtpErrorPayload(new Error('boom'), 'x@y.cl');
        expect(p.code).toBeNull();
        expect(p.rejected).toEqual([]);
        expect(p.error).toMatch(/boom/);
    });
});

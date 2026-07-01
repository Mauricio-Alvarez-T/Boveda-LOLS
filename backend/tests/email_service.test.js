/**
 * Tests de emailService.verifyTransport() — diagnóstico SMTP usado por reporte-doctor.
 * nodemailer mockeado: NO abre conexiones reales.
 */
jest.mock('nodemailer', () => ({
    createTransport: jest.fn(() => ({
        verify: jest.fn().mockResolvedValue(true),
        sendMail: jest.fn().mockResolvedValue({ messageId: 'x', accepted: ['a'], rejected: [] }),
    })),
}));
const nodemailer = require('nodemailer');
const emailService = require('../src/services/email.service');

describe('emailService.verifyTransport', () => {
    const ENV = { ...process.env };
    afterEach(() => { process.env = { ...ENV }; jest.clearAllMocks(); });

    test('lanza si faltan MAIL_* requeridas (no construye transporter)', async () => {
        delete process.env.MAIL_HOST;
        delete process.env.MAIL_USER;
        delete process.env.MAIL_PASS;
        await expect(emailService.verifyTransport()).rejects.toThrow(/MAIL_HOST/);
        expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });

    test('con MAIL_* presentes: crea transporter, verifica y devuelve la config (secure inferido del puerto)', async () => {
        process.env.MAIL_HOST = 'localhost';
        process.env.MAIL_USER = 'reportes@lols.cl';
        process.env.MAIL_PASS = 'secret';
        process.env.MAIL_PORT = '465';
        delete process.env.MAIL_SECURE;
        const r = await emailService.verifyTransport();
        expect(nodemailer.createTransport).toHaveBeenCalledTimes(1);
        expect(r).toEqual({ host: 'localhost', port: 465, secure: true, user: 'reportes@lols.cl' });
    });
});

describe('emailService.sendSystemEmail — rechazos de destinatario', () => {
    const ENV = { ...process.env };
    beforeEach(() => {
        process.env.MAIL_HOST = 'localhost';
        process.env.MAIL_USER = 'reportes@lols.cl';
        process.env.MAIL_PASS = 'secret';
    });
    afterEach(() => { process.env = { ...ENV }; jest.clearAllMocks(); });

    test('surface: devuelve `rejected` cuando el servidor rechaza parte de los destinatarios', async () => {
        nodemailer.createTransport.mockReturnValueOnce({
            sendMail: jest.fn().mockResolvedValue({
                messageId: 'z', accepted: ['ok@x.cl'], rejected: ['bad@x.cl'], response: '250 partial',
            }),
        });
        const r = await emailService.sendSystemEmail({ to: ['ok@x.cl', 'bad@x.cl'], subject: 's', text: 't' });
        expect(r.accepted).toEqual(['ok@x.cl']);
        expect(r.rejected).toEqual(['bad@x.cl']);
    });
});

/**
 * Enlace de WhatsApp con y sin número (mig 132: «Avisar a {conductor}» le escribe directo al conductor).
 * Sin número (o con uno que no sirve) se hace lo de siempre: WhatsApp con el texto y la persona elige el contacto.
 */
jest.mock('sonner', () => ({ toast: { info: jest.fn(), success: jest.fn(), error: jest.fn() } }));

import { avisarPorWhatsApp, enlaceWhatsApp } from './whatsappShare';

const TEXTO = 'Hola Juan, al KRPD-17 se le venció la revisión de gases hace 3 días. Coordinemos para dejarlo al día.';

describe('enlaceWhatsApp', () => {
    test('con celular abre el chat de ese número (569…, sin «+») con el texto codificado', () => {
        expect(enlaceWhatsApp(TEXTO, '+56912345678'))
            .toBe(`https://api.whatsapp.com/send?phone=56912345678&text=${encodeURIComponent(TEXTO)}`);
        expect(enlaceWhatsApp('a&b', '9 1234 5678')).toBe('https://api.whatsapp.com/send?phone=56912345678&text=a%26b');
    });

    test('sin número, o con uno inválido, es el enlace de siempre (sin phone)', () => {
        const sinNumero = `https://api.whatsapp.com/send?text=${encodeURIComponent(TEXTO)}`;
        expect(enlaceWhatsApp(TEXTO)).toBe(sinNumero);
        expect(enlaceWhatsApp(TEXTO, null)).toBe(sinNumero);
        expect(enlaceWhatsApp(TEXTO, '')).toBe(sinNumero);
        expect(enlaceWhatsApp(TEXTO, '22345678')).toBe(sinNumero);
    });
});

describe('avisarPorWhatsApp', () => {
    const open = jest.fn();
    const share = jest.fn();
    // Jest corre en node: se arman un `window` y un `navigator` mínimos (solo lo que usa whatsappShare).
    const global = globalThis as unknown as { window?: { open: typeof open } };
    const conNavegador = (userAgent: string) => {
        global.window = { open };
        Object.defineProperty(globalThis, 'navigator', { value: { userAgent, share }, configurable: true });
    };

    beforeEach(() => { open.mockReset(); share.mockReset().mockResolvedValue(undefined); });
    afterAll(() => { delete global.window; });

    test('con celular abre su chat al tiro, también en el celular (no la hoja de compartir)', async () => {
        conNavegador('Mozilla/5.0 (Linux; Android 10)');
        await expect(avisarPorWhatsApp('+56912345678', TEXTO)).resolves.toBe(true);
        expect(open).toHaveBeenCalledWith(`https://api.whatsapp.com/send?phone=56912345678&text=${encodeURIComponent(TEXTO)}`, '_blank');
        expect(share).not.toHaveBeenCalled();
    });

    test('sin celular, en el computador: WhatsApp sin número (como antes)', async () => {
        conNavegador('Mozilla/5.0 (Windows NT 10.0)');
        await avisarPorWhatsApp(null, TEXTO);
        expect(open).toHaveBeenCalledWith(`https://api.whatsapp.com/send?text=${encodeURIComponent(TEXTO)}`, '_blank');
    });

    test('sin celular, en el teléfono: la hoja de compartir (la persona elige el contacto)', async () => {
        conNavegador('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)');
        await avisarPorWhatsApp('', TEXTO, 'Papeles');
        expect(share).toHaveBeenCalledWith({ text: TEXTO, title: 'Papeles' });
        expect(open).not.toHaveBeenCalled();
    });
});

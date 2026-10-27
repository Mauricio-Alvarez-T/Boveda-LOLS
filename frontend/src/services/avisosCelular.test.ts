jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

import { claveABytes, estadoAvisos, type Entorno } from './avisosCelular';

const base: Entorno = {
    tieneServiceWorker: true, tienePush: true, tieneNotificaciones: true,
    permiso: 'default', esIos: false, instalada: false, suscrito: false,
};

describe('estadoAvisos: qué mostrar en este celular', () => {
    it('Android con todo y sin activar → se puede activar', () => {
        expect(estadoAvisos(base)).toBe('inactivo');
    });
    it('ya suscrito y con permiso → activo', () => {
        expect(estadoAvisos({ ...base, suscrito: true, permiso: 'granted' })).toBe('activo');
    });
    it('suscrito pero el permiso volvió a preguntar → hay que activar de nuevo', () => {
        expect(estadoAvisos({ ...base, suscrito: true, permiso: 'default' })).toBe('inactivo');
    });
    it('dijo que no → bloqueado (se cambia en el navegador)', () => {
        expect(estadoAvisos({ ...base, permiso: 'denied' })).toBe('bloqueado');
    });
    it('iPhone sin agregar a la pantalla de inicio → primero instalar (aunque falte el resto)', () => {
        expect(estadoAvisos({ ...base, esIos: true, instalada: false, tienePush: false })).toBe('iphone_instalar');
        expect(estadoAvisos({ ...base, esIos: true, instalada: true })).toBe('inactivo');
    });
    it('un navegador sin avisos → no soportado', () => {
        expect(estadoAvisos({ ...base, tienePush: false })).toBe('no_soportado');
        expect(estadoAvisos({ ...base, tieneServiceWorker: false })).toBe('no_soportado');
    });
});

describe('claveABytes', () => {
    it('convierte base64url (sin relleno, con - y _) a bytes', () => {
        expect(Array.from(claveABytes('-_8'))).toEqual([0xFB, 0xFF]);
        expect(Array.from(claveABytes('AQID'))).toEqual([1, 2, 3]);
    });
});

/**
 * reporteErrores: cuándo se manda un aviso y cuándo se le avisa a la persona (mig 141). Sin DOM: se arma un `window`
 * mínimo (ubicación, almacenamiento y eventos). La foto se simula (modern-screenshot no corre en node).
 */
const post = jest.fn();
jest.mock('./api', () => ({ __esModule: true, default: { post: (...a: unknown[]) => post(...a) } }));
jest.mock('modern-screenshot', () => ({ domToCanvas: jest.fn().mockRejectedValue(new Error('sin DOM')) }));
jest.mock('../components/ideas/ideasConfig', () => ({ nombrePantalla: () => 'Inventario' }));

import { EVENTO_AVISO_SOPORTE, _olvidarAvisos, reportarError } from './reporteErrores';
import type { AvisoError } from './clasificarError';

const almacen = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};
let local: ReturnType<typeof almacen>;
let sesion: ReturnType<typeof almacen>;
let eventos: { type: string; detail: unknown }[];

beforeEach(() => {
    jest.useFakeTimers();
    post.mockReset();
    _olvidarAvisos();
    local = almacen();
    sesion = almacen();
    eventos = [];
    local.setItem('sgdl_token', 'mi-token');
    local.setItem('sgdl_obra_id', '4');
    Object.assign(globalThis, {
        localStorage: local,
        window: {
            location: { pathname: '/inventario', search: '?tab=transferencias' },
            sessionStorage: sesion,
            matchMedia: () => ({ matches: true }),
            dispatchEvent: (e: { type: string; detail: unknown }) => { eventos.push(e); return true; },
            innerWidth: 400, innerHeight: 800,
        },
        CustomEvent: class { type: string; detail: unknown; constructor(t: string, o: { detail: unknown }) { this.type = t; this.detail = o.detail; } },
    });
});
afterEach(() => { jest.useRealTimers(); });

/** Deja correr las promesas y los timers del envío. */
const terminar = async () => {
    for (let i = 0; i < 10; i++) { await Promise.resolve(); jest.runOnlyPendingTimers(); }
    await new Promise(r => jest.requireActual<typeof import('timers')>('timers').setImmediate(r));
    for (let i = 0; i < 10; i++) { await Promise.resolve(); jest.runOnlyPendingTimers(); }
};

const falla: AvisoError = { categoria: 'falla', mensaje: 'No se pudo guardar', accion: 'POST /api/x/:id', codigo: 500 };

describe('reportarError', () => {
    it('manda el aviso con la pantalla, la obra y el dispositivo (sin campos vacíos)', async () => {
        post.mockResolvedValue({ data: { data: { id: 7, repetido: false, pedir_foto: false } } });
        reportarError({ ...falla, duracion_ms: undefined });
        await terminar();
        expect(post).toHaveBeenCalledTimes(1);
        const [url, body] = post.mock.calls[0];
        expect(url).toBe('/soporte/errores');
        expect(body).toEqual({
            categoria: 'falla', mensaje: 'No se pudo guardar', accion: 'POST /api/x/:id', codigo: 500,
            pantalla: '/inventario?tab=transferencias', pantalla_nombre: 'Inventario', obra_id: 4, dispositivo: 'movil',
        });
    });

    it('sin sesión propia, o con «ver como» en la pestaña, no manda nada', async () => {
        local.removeItem('sgdl_token');
        reportarError(falla);
        local.setItem('sgdl_token', 'mi-token');
        sesion.setItem('sgdl_ver_como', JSON.stringify({ token: 'prestado' }));
        reportarError({ ...falla, mensaje: 'otro' });
        await terminar();
        expect(post).not.toHaveBeenCalled();
    });

    it('el mismo aviso en la misma pantalla, una vez por minuto', async () => {
        post.mockResolvedValue({ data: { data: { id: 7, repetido: false, pedir_foto: false } } });
        reportarError(falla);
        reportarError(falla);
        reportarError({ ...falla, mensaje: 'distinto' });
        await terminar();
        expect(post).toHaveBeenCalledTimes(2);
    });

    it('falla sin foto pedida → le avisa a la persona sin foto', async () => {
        post.mockResolvedValue({ data: { data: { id: 7, repetido: false, pedir_foto: false } } });
        reportarError(falla);
        await terminar();
        expect(eventos).toEqual([{ type: EVENTO_AVISO_SOPORTE, detail: { id: 7, categoria: 'falla', foto: null } }]);
    });

    it('foto pedida pero no se pudo sacar → el aviso a la persona va sin foto (y no sube nada)', async () => {
        post.mockResolvedValue({ data: { data: { id: 8, repetido: false, pedir_foto: true } } });
        reportarError(falla);
        await terminar();
        expect(post).toHaveBeenCalledTimes(1);
        expect(eventos[0]?.detail).toEqual({ id: 8, categoria: 'falla', foto: null });
    });

    it('lento, sin señal y datos solo se cuentan: no le avisan a la persona', async () => {
        post.mockResolvedValue({ data: { data: { id: 9, repetido: false, pedir_foto: false } } });
        reportarError({ categoria: 'lento', mensaje: 'tardó' });
        reportarError({ categoria: 'sin_senal', mensaje: 'sin internet' });
        reportarError({ categoria: 'dato', mensaje: 'falta la fecha' });
        await terminar();
        expect(post).toHaveBeenCalledTimes(3);
        expect(eventos).toEqual([]);
    });

    it('un repetido (el servidor ya lo tenía) no vuelve a avisarle a la persona', async () => {
        post.mockResolvedValue({ data: { data: { id: 7, repetido: true, pedir_foto: false } } });
        reportarError(falla);
        await terminar();
        expect(eventos).toEqual([]);
    });

    it('si el servidor no contesta, no pasa nada (ni error)', async () => {
        post.mockRejectedValue(new Error('caído'));
        expect(() => reportarError(falla)).not.toThrow();
        await terminar();
        expect(eventos).toEqual([]);
    });

    it('null o undefined → nada', async () => {
        reportarError(null);
        reportarError(undefined);
        await terminar();
        expect(post).not.toHaveBeenCalled();
    });
});

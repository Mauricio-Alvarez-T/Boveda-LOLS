jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

import api from './api';
import {
    FalloActivar, TOPE_PASO_MS, activarAvisos, claveABytes, estadoAvisos, estadoDelAviso, motivoFalloActivar, pedidoAvisos,
    type Entorno,
} from './avisosCelular';

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

describe('pedidoAvisos: qué pedirle al abrir Bóveda (sin opción de saltarlo)', () => {
    const base = { debeActivar: true, esCelular: true, mirando: false, estado: 'inactivo' as const, celularesServidor: 0 };
    it('en el horario, en el celular y sin activar → pantalla para activar', () => {
        expect(pedidoAvisos(base)).toBe('activar');
    });
    it('fuera del horario o con «ver como» → nada', () => {
        expect(pedidoAvisos({ ...base, debeActivar: false })).toBe('nada');
        expect(pedidoAvisos({ ...base, mirando: true })).toBe('nada');
        expect(pedidoAvisos({ ...base, esCelular: false, mirando: true })).toBe('nada');
    });
    it('en el computador: solo se exige a quien trabaja ahí; a los demás, nada si ya tienen el celular', () => {
        expect(pedidoAvisos({ ...base, esCelular: false, celularesServidor: 1 })).toBe('nada');
        expect(pedidoAvisos({ ...base, esCelular: false, debeActivarComputador: true, celularesServidor: 1 })).toBe('activar');
        expect(pedidoAvisos({ ...base, esCelular: false, debeActivarComputador: true, estado: 'bloqueado', celularesServidor: 1 })).toBe('bloqueado');
        expect(pedidoAvisos({ ...base, esCelular: false, debeActivarComputador: true, estado: 'activo', celularesServidor: 1, computadoresServidor: 0 })).toBe('resincronizar');
        // El celular del servidor no cuenta como este computador.
        expect(pedidoAvisos({ ...base, esCelular: true, estado: 'activo', celularesServidor: 0, computadoresServidor: 1 })).toBe('resincronizar');
    });
    it('en el computador sin ningún celular activo → franja para activarlos en el celular (los recordatorios van ahí)', () => {
        expect(pedidoAvisos({ ...base, esCelular: false, celularesServidor: 0 })).toBe('falta_celular');
        expect(pedidoAvisos({ ...base, esCelular: false, debeActivarComputador: true, estado: 'activo', celularesServidor: 0, computadoresServidor: 1 })).toBe('falta_celular');
        // Primero activar el computador (pantalla obligatoria); la franja del celular viene después.
        expect(pedidoAvisos({ ...base, esCelular: false, debeActivarComputador: true, celularesServidor: 0 })).toBe('activar');
    });
    it('dijo que no → franja con los pasos; iPhone sin instalar → franja para instalar', () => {
        expect(pedidoAvisos({ ...base, estado: 'bloqueado' })).toBe('bloqueado');
        expect(pedidoAvisos({ ...base, estado: 'iphone_instalar' })).toBe('iphone');
    });
    it('activo en el celular pero el servidor no lo tiene → se vuelve a mandar solo', () => {
        expect(pedidoAvisos({ ...base, estado: 'activo', celularesServidor: 0 })).toBe('resincronizar');
        expect(pedidoAvisos({ ...base, estado: 'activo', celularesServidor: 1 })).toBe('nada');
    });
    it('un navegador sin avisos → nada (no se traba a nadie)', () => {
        expect(pedidoAvisos({ ...base, estado: 'no_soportado' })).toBe('nada');
    });
});

describe('estadoDelAviso: qué pasó con el aviso en ese equipo (centro de avisos)', () => {
    const base = { estado_envio: 'entregado' as const, error: null, mostrado_en: null, abierto_en: null, descartado_en: null, en_pantalla_en: null };
    const h = (hh: number, mm: number) => new Date(2026, 9, 27, hh, mm).toISOString();
    it('lo abrió → dice cuándo le llegó y cuándo lo abrió', () => {
        expect(estadoDelAviso({ ...base, mostrado_en: h(12, 1), abierto_en: h(12, 15) })).toEqual({ texto: 'Le llegó 12:01 · lo abrió 12:15', tono: 'ok' });
    });
    it('le apareció y no lo abre todavía; lo cerró sin abrirlo', () => {
        expect(estadoDelAviso({ ...base, mostrado_en: h(8, 0) }).texto).toBe('Le llegó 08:00 · todavía no lo abre');
        expect(estadoDelAviso({ ...base, mostrado_en: h(8, 0), descartado_en: h(8, 3) }).texto).toBe('Le llegó 08:00 · lo cerró sin abrirlo');
    });
    it('computador con Bóveda al frente → no se mostró (ya estaba ahí)', () => {
        const e = estadoDelAviso({ ...base, en_pantalla_en: h(12, 0) });
        expect(e.tono).toBe('aviso');
        expect(e.texto).toMatch(/tenía Bóveda abierto en el computador/);
    });
    it('salió pero el equipo no confirma; no salió', () => {
        expect(estadoDelAviso(base).tono).toBe('espera');
        expect(estadoDelAviso({ ...base, estado_envio: 'fallo', error: '403' })).toEqual({ texto: 'No salió: 403', tono: 'error' });
    });
});

describe('activarAvisos: la pregunta primero y nunca se queda pegado (27-10)', () => {
    const orden: string[] = [];
    let permisoActual: NotificationPermission;
    let respuesta: NotificationPermission;
    let listo: Promise<unknown>;
    let suscribir: jest.Mock;
    let registrar: jest.Mock;
    const reg = {
        pushManager: {
            getSubscription: jest.fn(async () => null),
            subscribe: (...a: unknown[]) => suscribir(...a),
        },
    };
    const g = globalThis as unknown as { Notification?: unknown };

    beforeEach(() => {
        orden.length = 0;
        permisoActual = 'default';
        respuesta = 'granted';
        listo = Promise.resolve(reg);
        suscribir = jest.fn(async () => ({ toJSON: () => ({ endpoint: 'https://push.example/x', keys: { p256dh: 'p', auth: 'a' } }) }));
        registrar = jest.fn(async () => { orden.push('archivo'); return reg; });
        g.Notification = {
            get permission() { return permisoActual; },
            requestPermission: jest.fn(async () => { orden.push('permiso'); return respuesta; }),
        };
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { userAgent: 'jest', serviceWorker: { register: registrar, get ready() { return listo; } } },
        });
        (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { data: { clave: 'AQID' } } });
        (api.post as jest.Mock).mockReset().mockResolvedValue({ data: {} });
    });
    afterEach(() => {
        jest.useRealTimers();
        delete g.Notification;
    });

    it('pregunta «¿Permitir?» ANTES de preparar el equipo (en el mismo toque) y queda activo', async () => {
        await expect(activarAvisos()).resolves.toBe('activo');
        expect(orden).toEqual(['permiso', 'archivo']);
        expect(api.post).toHaveBeenCalledWith('/avisos-celular/suscribir', expect.objectContaining({ endpoint: 'https://push.example/x' }));
    });

    it('si ya tenía el permiso no vuelve a preguntar', async () => {
        permisoActual = 'granted';
        await expect(activarAvisos()).resolves.toBe('activo');
        expect(orden).toEqual(['archivo']);
    });

    it('dice que no → bloqueado; cierra la pregunta sin elegir → inactivo; en los dos no prepara nada', async () => {
        respuesta = 'denied';
        await expect(activarAvisos()).resolves.toBe('bloqueado');
        respuesta = 'default';
        await expect(activarAvisos()).resolves.toBe('inactivo');
        expect(registrar).not.toHaveBeenCalled();
    });

    it('si el equipo nunca queda listo, a los 20 s falla en «archivo» (el botón no gira para siempre)', async () => {
        jest.useFakeTimers();
        listo = new Promise(() => { /* nunca */ });
        const p = activarAvisos();
        const espera = expect(p).rejects.toMatchObject({ paso: 'archivo', message: 'archivo: tardó demasiado' });
        await jest.advanceTimersByTimeAsync(TOPE_PASO_MS);
        await espera;
    });

    it('si el servicio de avisos del celular falla, dice el paso y la causa', async () => {
        suscribir = jest.fn(async () => { throw Object.assign(new Error('Registration failed - push service error'), { name: 'AbortError' }); });
        const e = await activarAvisos().catch(x => x);
        expect(e).toBeInstanceOf(FalloActivar);
        expect(e.message).toBe('suscripcion: AbortError: Registration failed - push service error');
        expect(api.post).not.toHaveBeenCalled();
    });

    it('un navegador sin avisos falla al tiro, sin preguntar', async () => {
        delete g.Notification;
        await expect(activarAvisos()).rejects.toMatchObject({ paso: 'permiso' });
    });

    it('el motivo en palabras', () => {
        expect(motivoFalloActivar('suscripcion', 'celular')).toBe('el servicio de avisos de este celular no respondió');
        expect(motivoFalloActivar('archivo', 'computador')).toBe('este computador no pudo prepararse para recibir avisos');
        expect(motivoFalloActivar('servidor', 'celular')).toMatch(/conexión con Bóveda/);
    });
});

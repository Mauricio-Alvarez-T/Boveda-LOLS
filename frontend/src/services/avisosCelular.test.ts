jest.mock('./api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), delete: jest.fn() } }));

import { claveABytes, estadoAvisos, estadoDelAviso, pedidoAvisos, type Entorno } from './avisosCelular';

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

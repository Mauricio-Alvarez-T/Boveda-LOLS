import { accionDe, clasificarDemora, clasificarPantallaRota, clasificarRespuesta, LENTO_MS } from './clasificarError';

const post = (status: number | undefined, data?: unknown, extra = {}) =>
    clasificarRespuesta({ metodo: 'post', url: '/transferencias/41/recibir', status, data, enLinea: true, ...extra });
const get = (status: number | undefined, data?: unknown, extra = {}) =>
    clasificarRespuesta({ metodo: 'get', url: '/transferencias?estado=pendiente', status, data, enLinea: true, ...extra });

describe('clasificarRespuesta: por el código, no por el cartel rojo', () => {
    it('500 → falla real (también en una lectura), con el mensaje del servidor', () => {
        expect(post(500, { error: 'Error interno' })).toMatchObject({ categoria: 'falla', codigo: 500, mensaje: 'Error interno', accion: 'POST /api/transferencias/:id/recibir' });
        expect(get(500)).toMatchObject({ categoria: 'falla', mensaje: 'Falla del servidor' });
    });

    it('502/503/504 (el reinicio de un deploy) → lento, nunca falla', () => {
        for (const s of [502, 503, 504]) expect(post(s)).toMatchObject({ categoria: 'lento', codigo: s });
    });

    it('403 con el permiso que falta → permiso, con las claves (no falla)', () => {
        const a = post(403, { error: 'No tienes permisos para esta acción', required: ['trabajadores.editar'] });
        expect(a).toMatchObject({ categoria: 'permiso', permisos_faltantes: ['trabajadores.editar'] });
    });

    it('403 sin permiso que falte → una regla de la app (dato)', () => {
        expect(post(403, { error: 'No puedes aprobar tu propia solicitud' })).toMatchObject({ categoria: 'dato', mensaje: 'No puedes aprobar tu propia solicitud' });
    });

    it('400/404/409/413/422 al guardar → dato (algo mal ingresado); en una lectura → nada', () => {
        for (const s of [400, 404, 409, 413, 422]) {
            expect(post(s, { error: 'Falta la fecha' })?.categoria).toBe('dato');
            expect(get(s)).toBeNull();
        }
    });

    it('403 en una lectura (de fondo) → nada', () => {
        expect(get(403, { required: ['asistencia.ver'] })).toBeNull();
    });

    it('401 (sesión vencida), cancelado y «ver como» → nada', () => {
        expect(post(401)).toBeNull();
        expect(post(undefined, undefined, { cancelado: true })).toBeNull();
        expect(post(403, { code: 'SOLO_LECTURA' }, { soloLectura: true })).toBeNull();
    });

    it('sin respuesta: sin internet → sin_senal; con internet → lento', () => {
        expect(post(undefined, undefined, { enLinea: false })).toMatchObject({ categoria: 'sin_senal' });
        expect(post(undefined, undefined, { enLinea: true, duracionMs: 21_400 })).toMatchObject({ categoria: 'lento', mensaje: 'No llegó respuesta del servidor (21 s)' });
    });

    it('408 y 429 → lento', () => {
        expect(post(408)?.categoria).toBe('lento');
        expect(get(429)?.categoria).toBe('lento');
    });

    it('los propios avisos y el inicio de sesión no se avisan (sin bucles)', () => {
        expect(clasificarRespuesta({ metodo: 'post', url: '/soporte/errores', status: 500 })).toBeNull();
        expect(clasificarRespuesta({ metodo: 'post', url: '/soporte/errores/9/foto', status: 500 })).toBeNull();
        expect(clasificarRespuesta({ metodo: 'post', url: '/auth/login', status: 500 })).toBeNull();
    });
});

describe('clasificarDemora', () => {
    it('solo desde 15 s', () => {
        expect(clasificarDemora('get', '/obras', LENTO_MS - 1)).toBeNull();
        expect(clasificarDemora('get', '/obras', 18_200)).toMatchObject({ categoria: 'lento', mensaje: 'Respondió, pero tardó 18 s', duracion_ms: 18200 });
        expect(clasificarDemora('post', '/soporte/errores', 30_000)).toBeNull();
    });
});

describe('clasificarPantallaRota', () => {
    it('un error del código → app, con el detalle técnico', () => {
        const a = clasificarPantallaRota(new TypeError("Cannot read properties of undefined (reading 'nombre')"), '\n    at Ficha');
        expect(a.categoria).toBe('app');
        expect(a.mensaje).toMatch(/^La pantalla se rompió: Cannot read properties/);
        expect(a.detalle_tecnico).toMatch(/TypeError/);
        expect(a.detalle_tecnico).toMatch(/at Ficha/);
    });

    it('no alcanzó a bajar una parte de la app (deploy nuevo o señal) → lento, no falla', () => {
        expect(clasificarPantallaRota(new TypeError('Failed to fetch dynamically imported module: /assets/Soporte-x.js')).categoria).toBe('lento');
    });
});

describe('accionDe', () => {
    it('sin consulta, con :id y con /api', () => {
        expect(accionDe('patch', '/soporte/errores/12?x=1')).toBe('PATCH /api/soporte/errores/:id');
        expect(accionDe(undefined, 'https://boveda.lols.cl/api/obras/3')).toBe('GET /api/obras/:id');
        expect(accionDe('get', undefined)).toBeUndefined();
    });
});

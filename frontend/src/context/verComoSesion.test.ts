import {
    CLAVE_AVISO_VER_COMO, CLAVE_VER_COMO, borrarSesionVerComo, esErrorSoloLectura, fichaVerComoValida, guardarAvisoVerComo,
    guardarSesionVerComo, leerSesionVerComo, minutosRestantes, rutaAlSalir, sesionDesdeRespuesta, textoVence, tokenVerComoGuardado,
    tomarAvisoVerComo, type Almacen, type FichaVerComo, type RespuestaVerComo,
} from './verComoSesion';

/** Un sessionStorage falso. */
function almacenFalso(inicial: Record<string, string> = {}): Almacen & { datos: Record<string, string> } {
    const datos = { ...inicial };
    return {
        datos,
        getItem: (k: string) => (k in datos ? datos[k] : null),
        setItem: (k: string, v: string) => { datos[k] = String(v); },
        removeItem: (k: string) => { delete datos[k]; },
    };
}

const AHORA = Date.parse('2026-10-23T15:00:00.000Z');
const RESPUESTA: RespuestaVerComo = {
    token: 'tok.prestado',
    user: { id: 7, nombre: 'Leonardo López', email: 'leonardo@lols.cl', rol: 'Administrador', rol_id: 3, obra_id: null, bodega_id: null, permisos: ['inventario.ver'] },
    vence: '2026-10-23T15:30:00.000Z',
    minutos: 30,
    quien: { id: 1, nombre: 'Marcos Uribe' },
};

describe('sesión prestada', () => {
    test('se guarda, se lee mientras dura y vence', () => {
        const a = almacenFalso();
        const s = sesionDesdeRespuesta(RESPUESTA);
        expect(s).toMatchObject({ token: 'tok.prestado', vence: Date.parse(RESPUESTA.vence), quien: { id: 1 } });
        expect(guardarSesionVerComo(a, s!)).toBe(true);
        expect(leerSesionVerComo(a, AHORA)?.user.nombre).toBe('Leonardo López');
        // Vencida: no sirve y se borra (la próxima carga entra a la cuenta propia).
        expect(leerSesionVerComo(a, Date.parse(RESPUESTA.vence))).toBeNull();
        expect(a.datos[CLAVE_VER_COMO]).toBeUndefined();
    });

    test('el token prestado se sigue mandando aunque haya vencido (el 401 devuelve a la cuenta propia)', () => {
        const a = almacenFalso();
        guardarSesionVerComo(a, sesionDesdeRespuesta(RESPUESTA)!);
        expect(tokenVerComoGuardado(a)).toBe('tok.prestado');
        borrarSesionVerComo(a);
        expect(tokenVerComoGuardado(a)).toBeNull();
        expect(tokenVerComoGuardado(null)).toBeNull();
    });

    test('lo guardado roto o incompleto no se usa y se borra', () => {
        const a = almacenFalso({ [CLAVE_VER_COMO]: '{no es json' });
        expect(leerSesionVerComo(a, AHORA)).toBeNull();
        const b = almacenFalso({ [CLAVE_VER_COMO]: JSON.stringify({ token: 'x', vence: AHORA + 1000 }) });
        expect(leerSesionVerComo(b, AHORA)).toBeNull();
        expect(b.datos[CLAVE_VER_COMO]).toBeUndefined();
        expect(sesionDesdeRespuesta({ ...RESPUESTA, vence: 'no es fecha' })).toBeNull();
        expect(sesionDesdeRespuesta({ ...RESPUESTA, token: '' })).toBeNull();
        expect(sesionDesdeRespuesta(null)).toBeNull();
    });

    test('sin almacenamiento: no se entra (guardar devuelve false) y leer no falla', () => {
        expect(guardarSesionVerComo(null, sesionDesdeRespuesta(RESPUESTA)!)).toBe(false);
        const roto: Almacen = { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); }, removeItem: () => { throw new Error('bloqueado'); } };
        expect(guardarSesionVerComo(roto, sesionDesdeRespuesta(RESPUESTA)!)).toBe(false);
        expect(leerSesionVerComo(roto, AHORA)).toBeNull();
        expect(() => borrarSesionVerComo(roto)).not.toThrow();
    });

    test('al salir vuelve a la ficha de quien se miraba (aunque haya vencido)', () => {
        const a = almacenFalso();
        expect(rutaAlSalir(a)).toBe('/soporte');
        guardarSesionVerComo(a, { ...sesionDesdeRespuesta(RESPUESTA)!, vence: AHORA - 1 });
        expect(rutaAlSalir(a)).toBe('/soporte?u=7');
    });

    test('el aviso se lee una vez', () => {
        const a = almacenFalso();
        guardarAvisoVerComo(a, 'Volviste a tu cuenta.');
        expect(a.datos[CLAVE_AVISO_VER_COMO]).toBe('Volviste a tu cuenta.');
        expect(tomarAvisoVerComo(a)).toBe('Volviste a tu cuenta.');
        expect(tomarAvisoVerComo(a)).toBeNull();
    });
});

describe('la ficha de Soporte guardada con la sesión (recuadro «Lo que puede usar…» del Inicio)', () => {
    const FICHA: FichaVerComo = {
        usuarioId: 7, nombre: 'Leonardo López', rol: 'Administrador',
        permisos: [
            { clave: 'inventario.ver', modulo: 'Inventario', nombre: 'Ver Inventario', descripcion: null, orden: 1, origen: 'rol' },
            { clave: 'inventario.transferencias.aprobar', modulo: 'Inventario', nombre: 'Aprobar Transferencia', orden: 15, origen: 'propio' },
        ],
    };

    test('se guarda y se lee con la sesión, y se borra con ella', () => {
        const a = almacenFalso();
        guardarSesionVerComo(a, sesionDesdeRespuesta(RESPUESTA, FICHA)!);
        expect(leerSesionVerComo(a, AHORA)?.ficha).toEqual(FICHA);
        borrarSesionVerComo(a);
        expect(a.datos[CLAVE_VER_COMO]).toBeUndefined();
    });

    test('sin ficha, o con la de otra persona, la sesión vale igual (sin ficha)', () => {
        expect(sesionDesdeRespuesta(RESPUESTA)?.ficha).toBeUndefined();
        expect(sesionDesdeRespuesta(RESPUESTA, null)?.ficha).toBeUndefined();
        const otra = sesionDesdeRespuesta(RESPUESTA, { ...FICHA, usuarioId: 8 });
        expect(otra).not.toBeNull();
        expect(otra?.ficha).toBeUndefined();
    });

    test('una ficha guardada rota no tumba la sesión: se lee sin ella; los permisos incompletos se descartan', () => {
        const s = sesionDesdeRespuesta(RESPUESTA)!;
        const a = almacenFalso({ [CLAVE_VER_COMO]: JSON.stringify({ ...s, ficha: { usuarioId: 7, permisos: 'no' } }) });
        const leida = leerSesionVerComo(a, AHORA);
        expect(leida?.token).toBe('tok.prestado');
        expect(leida?.ficha).toBeUndefined();
        const mezcla = fichaVerComoValida({ ...FICHA, permisos: [...FICHA.permisos, { clave: 'x' }, { clave: 'y', modulo: 'M', nombre: 'Y', origen: 'otro' }] }, 7);
        expect(mezcla?.permisos.map(p => p.clave)).toEqual(['inventario.ver', 'inventario.transferencias.aprobar']);
        expect(fichaVerComoValida(null, 7)).toBeNull();
        expect(fichaVerComoValida({ usuarioId: 7, permisos: [] }, 7)).toEqual({ usuarioId: 7, nombre: '', rol: '', permisos: [] });
    });
});

describe('tiempo y errores', () => {
    test('minutos que quedan (hacia arriba) y su texto', () => {
        const vence = AHORA + 30 * 60_000;
        expect(minutosRestantes(vence, AHORA)).toBe(30);
        expect(minutosRestantes(vence, vence - 61_000)).toBe(2);
        expect(minutosRestantes(vence, vence - 1_000)).toBe(1);
        expect(minutosRestantes(vence, vence)).toBe(0);
        expect(textoVence(vence, AHORA)).toBe('vence en 30 min');
        expect(textoVence(vence, vence + 5)).toBe('venció');
    });

    test('el 403 de solo lectura se reconoce por su código', () => {
        expect(esErrorSoloLectura({ error: 'Modo «ver como»: solo lectura', code: 'VER_COMO_SOLO_LECTURA' })).toBe(true);
        expect(esErrorSoloLectura({ error: 'No tienes permisos para esta acción' })).toBe(false);
        expect(esErrorSoloLectura(undefined)).toBe(false);
    });
});

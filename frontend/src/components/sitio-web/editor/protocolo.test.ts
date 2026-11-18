import {
    CAMPOS_EN_LUGAR, P, V, esHolaDelSitio, itemDe, leerMensaje, msgBorrador, msgCampo, msgFoto, msgIniciar, msgModo, msgMostrar,
    rutaInterna, slugDeItem, urlMarco, validarCambio, validarMover, ESTADO_DE_REGLA, REGLAS, type MsgCambio, type MsgMover,
} from './protocolo';
import { LARGOS } from '../reglas';

const hola = {
    p: 'lols-editor', v: 1, tipo: 'hola', ruta: '/proyectos/', build: 'b22d9a5',
    listas: [{ regla: 'proyectos-en-curso', vista: 'carrusel', items: ['maipu-40', 'gorbea-3082'] }],
    limites: { nombre: 160, titular: 240 },
};
const cambio = (o: Partial<MsgCambio> = {}): MsgCambio => ({ p: P, v: V, tipo: 'cambio', item: 'obras/maipu-40', campo: '/nombre', valor: 'Maipú 40', ...o });

describe('mensajes del puente (zod)', () => {
    test('los cinco tipos válidos pasan; las claves de más se descartan', () => {
        expect(leerMensaje(hola)).toMatchObject({ tipo: 'hola', ruta: '/proyectos/' });
        expect(leerMensaje({ ...hola, build: null })).not.toBeNull();
        expect(leerMensaje({ p: P, v: V, tipo: 'seleccion', item: 'obras/maipu-40', campo: '/nombre' })).toMatchObject({ tipo: 'seleccion' });
        expect(leerMensaje({ p: P, v: V, tipo: 'seleccion', item: 'obras/maipu-40', campo: null })).toMatchObject({ campo: null });
        expect(leerMensaje({ p: P, v: V, tipo: 'seleccion', item: 'obras/maipu-40', campo: '/fotos/0' })).not.toBeNull();
        expect(leerMensaje({ ...cambio(), extra: '<img onerror>' })).toEqual(cambio());
        expect(leerMensaje({ p: P, v: V, tipo: 'navegar', ruta: '/proyectos/' })).toMatchObject({ tipo: 'navegar' });
        for (const accion of ['deshacer', 'rehacer', 'guardar']) expect(leerMensaje({ p: P, v: V, tipo: 'atajo', accion })).not.toBeNull();
    });

    test('otro protocolo, otra versión, un tipo desconocido o un mensaje de salida → null', () => {
        expect(leerMensaje(null)).toBeNull();
        expect(leerMensaje('hola')).toBeNull();
        expect(leerMensaje({ ...hola, p: 'otro' })).toBeNull();
        expect(leerMensaje({ ...hola, v: 2 })).toBeNull();
        expect(leerMensaje({ p: P, v: V, tipo: 'iniciar', modo: 'editar' })).toBeNull();   // eso lo manda la Bóveda
        expect(leerMensaje({ p: P, v: V, tipo: 'borrar-todo' })).toBeNull();
        expect(leerMensaje({ p: P, v: V, tipo: 'atajo', accion: 'publicar' })).toBeNull();
    });

    test('cambio: solo los 8 campos de texto, item con forma obras/<slug> y valor de texto', () => {
        for (const campo of CAMPOS_EN_LUGAR) expect(leerMensaje(cambio({ campo }))).not.toBeNull();
        for (const campo of ['/superficieM2', '/tipo', '/estado', '/mandante', '/slug', '/fotos/0', 'nombre', '/__proto__']) {
            expect(leerMensaje({ ...cambio(), campo })).toBeNull();
        }
        for (const item of ['maipu-40', 'obras/', 'obras/Maipu', 'obras/../x', 'obras/a b', 'https://x/obras/a']) {
            expect(leerMensaje({ ...cambio(), item })).toBeNull();
        }
        expect(leerMensaje({ ...cambio(), valor: 40 })).toBeNull();
        expect(leerMensaje({ ...cambio(), valor: { toString: 'x' } })).toBeNull();
        expect(leerMensaje({ ...cambio(), valor: 'x'.repeat(5000) })).toBeNull();
    });

    test('hola con formas raras → null (listas sin slugs válidos, límites no numéricos)', () => {
        expect(leerMensaje({ ...hola, listas: [{ regla: 'x', vista: 'carrusel', items: ['<script>'] }] })).toBeNull();
        expect(leerMensaje({ ...hola, limites: { nombre: 'mucho' } })).toBeNull();
        expect(leerMensaje({ ...hola, ruta: 42 })).toBeNull();
    });
});

describe('validarCambio: obra conocida y largo del contrato', () => {
    const conocidos = new Set(['maipu-40']);
    test('obra del borrador y dentro del largo → ok con su slug y clave', () => {
        expect(validarCambio(cambio(), conocidos)).toEqual({ ok: true, slug: 'maipu-40', clave: 'nombre' });
        expect(validarCambio(cambio({ campo: '/desafio', valor: 'x'.repeat(LARGOS.desafio) }), conocidos)).toMatchObject({ ok: true, clave: 'desafio' });
    });
    test('obra que no está en el borrador → obra_desconocida', () => {
        expect(validarCambio(cambio({ item: 'obras/otra-obra' }), conocidos)).toEqual({ ok: false, motivo: 'obra_desconocida' });
    });
    test('pasa el largo de SU campo (aunque quepa en otro) → muy_largo', () => {
        expect(validarCambio(cambio({ valor: 'x'.repeat(LARGOS.nombre + 1) }), conocidos)).toEqual({ ok: false, motivo: 'muy_largo' });
        expect(validarCambio(cambio({ campo: '/inicio', valor: 'x'.repeat(LARGOS.inicio + 1) }), conocidos)).toEqual({ ok: false, motivo: 'muy_largo' });
    });
});

describe('saludo: solo del origen del sitio y del iframe propio', () => {
    const ventana = { soy: 'iframe' };
    test('origen y ventana correctos → el hola', () => {
        expect(esHolaDelSitio({ origin: 'https://nuevo.lols.cl', source: ventana, data: hola }, 'https://nuevo.lols.cl', ventana)).toMatchObject({ tipo: 'hola' });
    });
    test('otro origen, otra ventana, sin iframe o algo que no es hola → null', () => {
        expect(esHolaDelSitio({ origin: 'https://evil.example', source: ventana, data: hola }, 'https://nuevo.lols.cl', ventana)).toBeNull();
        expect(esHolaDelSitio({ origin: 'https://nuevo.lols.cl', source: {}, data: hola }, 'https://nuevo.lols.cl', ventana)).toBeNull();
        expect(esHolaDelSitio({ origin: 'https://nuevo.lols.cl', source: ventana, data: hola }, 'https://nuevo.lols.cl', null)).toBeNull();
        expect(esHolaDelSitio({ origin: 'https://nuevo.lols.cl', source: ventana, data: cambio() }, 'https://nuevo.lols.cl', ventana)).toBeNull();
        expect(esHolaDelSitio({ origin: 'http://nuevo.lols.cl', source: ventana, data: hola }, 'https://nuevo.lols.cl', ventana)).toBeNull();
    });
});

describe('rutas', () => {
    test('rutaInterna: caminos del sitio sí; otros orígenes, protocolos o barras raras no', () => {
        expect(rutaInterna('/')).toBe('/');
        expect(rutaInterna('/proyectos/')).toBe('/proyectos/');
        expect(rutaInterna('/proyectos/maipu-40/#ficha')).toBe('/proyectos/maipu-40/#ficha');
        expect(rutaInterna('/proyectos/?x=1')).toBe('/proyectos/');
        expect(rutaInterna('/a/../b/')).toBe('/b/');
        for (const r of ['https://evil.example/', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)', 'proyectos/', '', 42, null]) {
            expect(rutaInterna(r)).toBeNull();
        }
    });
    test('urlMarco: el sitio en esa ruta con ?editor (la ancla al final)', () => {
        expect(urlMarco('https://nuevo.lols.cl', '/')).toBe('https://nuevo.lols.cl/?editor');
        expect(urlMarco('https://nuevo.lols.cl/', '/proyectos/')).toBe('https://nuevo.lols.cl/proyectos/?editor');
        expect(urlMarco('http://localhost:4321', '/proyectos/#maipu-40')).toBe('http://localhost:4321/proyectos/?editor#maipu-40');
        expect(urlMarco('https://nuevo.lols.cl', '//evil.example')).toBe('https://nuevo.lols.cl/?editor');
    });
    test('item ↔ slug', () => {
        expect(itemDe('maipu-40')).toBe('obras/maipu-40');
        expect(slugDeItem('obras/maipu-40')).toBe('maipu-40');
        expect(slugDeItem('maipu-40')).toBeNull();
    });
});

describe('mensajes de la Bóveda', () => {
    test('todos llevan p y v; borrador manda solo incluir y nueva en meta', () => {
        expect(msgIniciar()).toEqual({ p: P, v: V, tipo: 'iniciar', modo: 'editar' });
        expect(msgModo('mirar')).toEqual({ p: P, v: V, tipo: 'modo', modo: 'mirar' });
        expect(msgMostrar('maipu-40')).toEqual({ p: P, v: V, tipo: 'mostrar', item: 'obras/maipu-40' });
        expect(msgCampo('maipu-40', '/titular', 'Hola')).toEqual({ p: P, v: V, tipo: 'campo', item: 'obras/maipu-40', campo: '/titular', valor: 'Hola' });
        const json = { slug: 'a' } as never;
        const b = msgBorrador([{ json, meta: { incluir: true, nueva: false, id: 3, mandante: 'secreto' } as never }]);
        expect(b).toEqual({ p: P, v: V, tipo: 'borrador', obras: [{ json, meta: { incluir: true, nueva: false } }] });
        const bytes = new ArrayBuffer(4);
        expect(msgFoto('a', bytes)).toEqual({ p: P, v: V, tipo: 'foto', item: 'obras/a', bytes });
    });
});

describe('A2: nueva y mover', () => {
    const base = { p: P, v: V };
    test('nueva: solo con una de las 5 listas del sitio; cada lista dice el estado de la obra nueva', () => {
        for (const lista of REGLAS) expect(leerMensaje({ ...base, tipo: 'nueva', lista })).toEqual({ ...base, tipo: 'nueva', lista });
        expect(leerMensaje({ ...base, tipo: 'nueva', lista: 'han-confiado' })).toBeNull();
        expect(leerMensaje({ ...base, tipo: 'nueva' })).toBeNull();
        expect(ESTADO_DE_REGLA['portada-en-obra']).toBe('en_construccion');
        expect(ESTADO_DE_REGLA['proyectos-contratados']).toBe('contratado');
        expect(ESTADO_DE_REGLA['proyectos-terminados']).toBe('terminado');
    });

    test('mover: lista válida, item obras/<slug> (también ~n1) e índice entero ≥ 0', () => {
        const m = { ...base, tipo: 'mover', lista: 'proyectos-en-curso', item: 'obras/maipu-40', indice: 2 };
        expect(leerMensaje(m)).toEqual(m);
        expect(leerMensaje({ ...m, item: 'obras/~n1' })).toEqual({ ...m, item: 'obras/~n1' });
        for (const malo of [{ indice: -1 }, { indice: 1.5 }, { indice: '2' }, { lista: 'otra' }, { item: 'maipu-40' }, { item: 'obras/~x1' }, { item: 'obras/~n0' }]) {
            expect(leerMensaje({ ...m, ...malo })).toBeNull();
        }
    });

    test('validarMover: la obra tiene que estar en el borrador; ~n1 y los slugs reales se reconocen', () => {
        const m = (item: string): MsgMover => ({ p: P, v: V, tipo: 'mover', lista: 'proyectos-en-curso', item, indice: 0 });
        expect(validarMover(m('obras/maipu-40'), new Set(['maipu-40']))).toEqual({ ok: true, slug: 'maipu-40' });
        expect(validarMover(m('obras/~n1'), new Set(['~n1']))).toEqual({ ok: true, slug: '~n1' });
        expect(validarMover(m('obras/gorbea-3082'), new Set(['maipu-40']))).toEqual({ ok: false, motivo: 'obra_desconocida' });
        expect(slugDeItem('obras/~n12')).toBe('~n12');
        expect(validarCambio(cambio({ item: 'obras/~n1' }), new Set(['~n1']))).toEqual({ ok: true, slug: '~n1', clave: 'nombre' });
    });
});

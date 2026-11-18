/**
 * Sitio web — editor visual (docs/reglas/sitio-web.md § Editor visual; contrato en docs/editor-visual.md de lols.cl).
 *
 * Con la BD en memoria (tests/helpers/sitioWebFalsos.js) y las 27 obras reales de lols.cl (fixtures):
 *   · GET /editor/borrador devuelve, por obra, EXACTAMENTE el JSON que publicaría serializarObra (las 27 importadas
 *     dan su archivo del sitio) y `meta` (id, incluir, faltantes, estado, versión, slug congelado, foto nueva);
 *   · POST /editor/guardar guarda varias obras en UNA transacción: con todo al día, cada una con su versión nueva e
 *     historial; si una la guardó otra persona → 409 con la lista y NADA cambia (ni las otras ni el historial);
 *   · validación (400), permisos (403, «ver como») y el slug reservado `molde` (la página de moldes del sitio).
 */
jest.mock('../src/config/db', () => require('./helpers/sitioWebFalsos').crearBd());
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    requestLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const svc = require('../src/services/sitioWeb.service');

const app = require('../index');
const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p, extra = {}) => jwt.sign({ id: 5, email: 'ana@lols.cl', rol_id: 2, rv: 1, p, ...extra }, SECRET);
const VER = token(['sitio_web.ver']);
const EDITAR = token(['sitio_web.editar']);
const PUBLICAR = token(['sitio_web.publicar']);

const DIR_FIX = path.join(__dirname, 'fixtures/sitio-web/obras');
const FIXTURES = Object.fromEntries(fs.readdirSync(DIR_FIX).filter(f => f.endsWith('.json'))
    .map(f => [f.replace(/\.json$/, ''), fs.readFileSync(path.join(DIR_FIX, f), 'utf8').replace(/\r\n/g, '\n')]));
const VERSION = new Date('2026-11-10T12:00:00.123Z');
const ANTES = new Date('2026-11-01T10:00:00Z');

let fotoSeq = 996000;
/** Las 27 obras del sitio como quedan al importarlas: publicadas, incluidas y con su foto heredada aprobada. */
function cargarObrasDelSitio() {
    let id = 990100;
    for (const [slug, texto] of Object.entries(FIXTURES)) {
        const { obra, foto } = svc.desdeJsonDelSitio(JSON.parse(texto));
        const fila = {
            ...obra, id: ++id, incluir: true, publicado_json: texto, publicado_hash: svc.hashTexto(texto), publicado_at: ANTES,
            mandante_autoriza: !!obra.mandante_autoriza, created_at: ANTES, updated_at: VERSION,
        };
        db.tablas.sitio_obras.push(fila);
        if (foto) {
            const hash = `${slug}-hash`;
            db.tablas.sitio_obra_fotos.push({
                id: ++fotoSeq, sitio_obra_id: fila.id, rol: 'portada', orden: 0, alt: foto.alt, heredada_src: foto.heredada_src, hash,
                ancho: 1200, alto: 800, sin_personas_confirmado: true, confirmado_at: ANTES, aprobada_at: ANTES, aprobada_hash: hash,
                rechazada_at: null, created_at: ANTES, updated_at: ANTES,
            });
        }
    }
}
const obra = (slug) => db.tablas.sitio_obras.find(o => o.slug === slug);
const historial = () => db.tablas.sitio_web_historial;

const guardar = (tk, body) => request(app).post('/api/sitio-web/editor/guardar').set('Authorization', `Bearer ${tk}`).send(body);
const item = (o, cambios) => ({ id: o.id, updated_at: o.updated_at.toISOString(), cambios });

beforeEach(() => {
    db.reiniciar();
    jest.clearAllMocks();
    cargarObrasDelSitio();
});

describe('GET /editor/borrador', () => {
    test('las 27 obras: el JSON es EXACTAMENTE el archivo del sitio y meta trae lo que la pantalla necesita', async () => {
        const r = await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${VER}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toHaveLength(Object.keys(FIXTURES).length);
        for (const { json, meta } of r.body.data) {
            expect(svc.textoJson(json)).toBe(FIXTURES[json.slug]);
            const fila = obra(json.slug);
            expect(meta).toMatchObject({
                id: fila.id, incluir: true, nueva: false, faltantes: [], estadoDerivado: 'publicada', slug_congelado: true, foto: null,
                updated_at: VERSION.toISOString(), mandante_autoriza: !!fila.mandante_autoriza,
            });
            // Nada interno en el JSON (lista blanca de serializarObra).
            expect(json).not.toHaveProperty('id');
            expect(json).not.toHaveProperty('publicado_hash');
        }
        // Orden de la lista: en curso, contratadas, terminadas.
        const estados = r.body.data.map(x => x.json.estado);
        const rango = { 'en-curso': 0, contratado: 1, terminado: 2 };
        expect(estados.map(e => rango[e])).toEqual([...estados.map(e => rango[e])].sort((a, b) => a - b));
    });

    test('meta.foto = la portada vigente que el sitio todavía no muestra; null si es la publicada', async () => {
        const o = obra('maipu-40') || db.tablas.sitio_obras[0];
        db.tablas.sitio_obra_fotos = db.tablas.sitio_obra_fotos.filter(f => f.sitio_obra_id !== o.id);
        const cuando = new Date('2026-11-12T10:00:00Z');
        db.tablas.sitio_obra_fotos.push({
            id: 997001, sitio_obra_id: o.id, rol: 'portada', orden: 0, alt: 'Fachada de la obra vista desde la calle', heredada_src: null,
            hash: 'abcdef12'.repeat(8), ancho: 1600, alto: 900, sin_personas_confirmado: true, confirmado_at: cuando, aprobada_at: cuando,
            aprobada_hash: 'abcdef12'.repeat(8), rechazada_at: null, created_at: cuando, updated_at: cuando,
        });
        const r = await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${VER}`);
        const x = r.body.data.find(d => d.meta.id === o.id);
        expect(x.meta.foto).toBe(997001);
        expect(x.json.fotos[0].src).toBe(`/proyectos/${o.slug}/portada.abcdef12-1600.webp`);
        expect(x.meta.estadoDerivado).toBe('cambios');
        expect(r.body.data.filter(d => d.meta.foto !== null)).toHaveLength(1);
    });

    test('también la obra con faltantes trae su JSON (lo escrito), con los faltantes en meta', async () => {
        const o = db.tablas.sitio_obras[0];
        o.comuna = null;
        const r = await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${VER}`);
        const x = r.body.data.find(d => d.meta.id === o.id);
        expect(x.json.comuna).toBeNull();
        expect(x.meta.faltantes.map(f => f.campo)).toContain('comuna');
        expect(x.meta.estadoDerivado).toBe('incompleta');
    });

    test('sin ninguna clave del sitio → 403; con editar o publicar → 200', async () => {
        expect((await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${token(['obras.ver'])}`)).status).toBe(403);
        expect((await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${EDITAR}`)).status).toBe(200);
        expect((await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${PUBLICAR}`)).status).toBe(200);
    });
});

describe('POST /editor/guardar', () => {
    test('varias obras al día: se guardan todas, cada una con su versión nueva e historial', async () => {
        const [a, b] = db.tablas.sitio_obras;
        const r = await guardar(EDITAR, { obras: [
            item(a, { nombre: 'Nombre nuevo de la obra', titular: '  Un titular  ' }),
            item(b, { desafio: 'El desafío\r\nen dos líneas', superficie_m2: 1234 }),
        ] });
        expect(r.status).toBe(200);
        expect(r.body.data.obras).toHaveLength(2);
        for (const x of r.body.data.obras) {
            expect(new Date(x.updated_at).getTime()).not.toBe(VERSION.getTime());
            expect(x.updated_at).toBe(db.tablas.sitio_obras.find(o => o.id === x.id).updated_at.toISOString());
        }
        expect(a).toMatchObject({ nombre: 'Nombre nuevo de la obra', titular: 'Un titular', actualizado_por: 5 });
        expect(b).toMatchObject({ desafio: 'El desafío\nen dos líneas', superficie_m2: 1234 });
        expect(historial()).toHaveLength(2);
        expect(historial().every(h => h.accion === 'editar' && /\(editor visual\)/.test(h.resumen))).toBe(true);
        // El JSON que se publicaría ya trae lo guardado.
        const borr = await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${VER}`);
        expect(borr.body.data.find(d => d.meta.id === a.id).json.nombre).toBe('Nombre nuevo de la obra');
    });

    test('sin cambios reales: responde la misma versión (sin_cambios) y no escribe', async () => {
        const a = db.tablas.sitio_obras[0];
        const r = await guardar(EDITAR, { obras: [item(a, { nombre: a.nombre })] });
        expect(r.status).toBe(200);
        expect(r.body.data.obras[0]).toMatchObject({ id: a.id, sin_cambios: true, updated_at: VERSION.toISOString() });
        expect(historial()).toHaveLength(0);
    });

    test('una obra que otra persona guardó entremedio → 409 con la lista y NADA cambia (todo o nada)', async () => {
        const [a, b, c] = db.tablas.sitio_obras;
        const viejaB = item(b, { nombre: 'Esto no entra' });
        b.updated_at = new Date('2026-11-15T09:00:00Z');   // otra persona guardó b
        const foto = JSON.stringify(db.tablas.sitio_obras);
        const r = await guardar(EDITAR, { obras: [item(a, { nombre: 'Primera, que sí estaba al día' }), viejaB, item(c, { comuna: 'Ñuñoa' })] });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_EDITADA_POR_OTRO');
        expect(r.body.obras).toEqual([{ id: b.id, nombre: b.nombre }]);
        expect(r.body.error).toMatch(/No se guardó nada/);
        expect(JSON.stringify(db.tablas.sitio_obras)).toBe(foto);
        expect(historial()).toHaveLength(0);
    });

    test('un error de otra clase en la segunda obra deshace la primera (slug reservado «molde» → 409)', async () => {
        const [a, b] = db.tablas.sitio_obras;
        b.publicado_hash = null; b.publicado_at = null;   // sin publicar: su slug todavía se puede cambiar
        const foto = JSON.stringify(db.tablas.sitio_obras);
        const r = await guardar(EDITAR, { obras: [item(a, { nombre: 'Cambio que se deshace' }), item(b, { slug: 'molde' })] });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_SLUG_RESERVADO');
        expect(r.body.obra_id).toBe(b.id);
        expect(JSON.stringify(db.tablas.sitio_obras)).toBe(foto);
        expect(historial()).toHaveLength(0);
    });

    test('validación: 400 sin tocar la BD', async () => {
        const a = db.tablas.sitio_obras[0];
        const casos = [
            {},
            { obras: [] },
            { obras: 'x' },
            { obras: [{ id: a.id, cambios: {} }] },                                         // sin versión
            { obras: [{ id: 'abc', updated_at: VERSION.toISOString(), cambios: {} }] },
            { obras: [{ id: a.id, updated_at: VERSION.toISOString() }] },                    // sin cambios
            { obras: [{ id: a.id, updated_at: VERSION.toISOString(), cambios: [] }] },
            { obras: [item(a, { nombre: 'x'.repeat(161) })] },
            { obras: [item(a, { nombre: '' })] },
            { obras: [item(a, { superficie_m2: 'mucho' })] },
            { obras: [item(a, { mandante_autoriza: 'true' })] },
            { obras: [item(a, { tipo: 'Castillo' })] },
            { obras: [item(a, { nombre: 'Uno' }), item(a, { nombre: 'Dos' })] },             // repetida
            { obras: Array.from({ length: 101 }, (_, i) => ({ id: i + 1, updated_at: VERSION.toISOString(), cambios: {} })) },
        ];
        for (const body of casos) {
            const r = await guardar(EDITAR, body);
            expect({ body: JSON.stringify(body).slice(0, 80), status: r.status }).toEqual({ body: JSON.stringify(body).slice(0, 80), status: 400 });
            expect(r.body.error).toEqual(expect.any(String));
        }
        expect(historial()).toHaveLength(0);
        expect(db.sentencias.some(s => /^UPDATE/.test(s))).toBe(false);
    });

    test('las claves de más dentro de cambios se descartan (no se escribe nada interno)', async () => {
        const a = db.tablas.sitio_obras[0];
        const hash = a.publicado_hash;
        const r = await guardar(EDITAR, { obras: [item(a, { comuna: 'Providencia', publicado_hash: 'x', incluir: false, orden: 1 })] });
        expect(r.status).toBe(200);
        expect(a).toMatchObject({ comuna: 'Providencia', publicado_hash: hash, incluir: true });
    });

    test('una obra que no existe → 404 y nada cambia', async () => {
        const a = db.tablas.sitio_obras[0];
        const r = await guardar(EDITAR, { obras: [item(a, { comuna: 'Comuna de prueba' }), { id: 1, updated_at: VERSION.toISOString(), cambios: { comuna: 'X' } }] });
        expect(r.status).toBe(404);
        // El rollback restaura las filas (la BD falsa las reemplaza): se vuelve a buscar.
        expect(db.tablas.sitio_obras.find(o => o.id === a.id).comuna).not.toBe('Comuna de prueba');
    });

    test('permisos: ver no alcanza (403); editar y publicar sí; «ver como» no escribe', async () => {
        const a = db.tablas.sitio_obras[0];
        expect((await guardar(VER, { obras: [item(a, { comuna: 'A' })] })).status).toBe(403);
        expect((await guardar(token([]), { obras: [item(a, { comuna: 'A' })] })).status).toBe(403);
        const prestado = token(['sitio_web.editar'], { imp: 1, ro: true });
        const vc = await guardar(prestado, { obras: [item(a, { comuna: 'A' })] });
        expect(vc.status).toBe(403);
        expect(vc.body.code).toBe('VER_COMO_SOLO_LECTURA');
        expect(historial()).toHaveLength(0);
        expect((await guardar(PUBLICAR, { obras: [item(a, { comuna: 'B' })] })).status).toBe(200);
        expect(a.comuna).toBe('B');
    });
});

describe('slug reservado «molde»', () => {
    test('el sitio lo usa para su página de moldes: reservado, inválido para una obra y 409 al crear', async () => {
        expect(svc.slugReservado('molde')).toBe(true);
        expect(svc.slugValido('molde')).toBe(false);
        expect(svc.slugValido('molde-2')).toBe(true);
        const r = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${EDITAR}`).send({ nombre: 'Molde' });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_SLUG_RESERVADO');
    });
});

/* ──────────────── A2: estructura (crear, cambiar de estado, ordenar, quitar e incluir) ──────────────── */

describe('POST /editor/guardar — estructura (A2)', () => {
    const { logManualActivity } = require('../src/middleware/logger');
    const delEstado = (estado) => db.tablas.sitio_obras.filter(o => o.estado === estado)
        .sort((a, b) => (a.orden - b.orden) || a.nombre.localeCompare(b.nombre) || (a.id - b.id));
    const nuevaContratada = (extra = {}) => ({
        tmp: '~n1', cambios: { nombre: 'Edificio Nueva Prueba 123', estado: 'contratado', comuna: 'Santiago', servicios: ['construccion'], ...extra },
    });

    test('obra nueva + orden con su tmp + incluirla, en una transacción: mapa tmp → id/slug y todo el historial', async () => {
        const contratadas = delEstado('contratado').map(o => o.id);
        const r = await guardar(EDITAR, {
            obras: [],
            nuevas: [nuevaContratada()],
            orden: [{ estado: 'contratado', ids: ['~n1', ...contratadas] }],
            incluir: [{ id: '~n1', incluir: true }],
        });
        expect(r.status).toBe(200);
        const fila = obra('edificio-nueva-prueba-123');
        expect(fila).toMatchObject({ estado: 'contratado', incluir: true, orden: 10, comuna: 'Santiago', creado_por: 5 });
        expect(r.body.data.nuevas).toEqual({ '~n1': { id: fila.id, slug: 'edificio-nueva-prueba-123', updated_at: fila.updated_at.toISOString() } });
        expect(r.body.data.orden).toEqual([{ estado: 'contratado', ids: [fila.id, ...contratadas] }]);
        expect(r.body.data.incluir).toEqual([{ id: fila.id, incluir: true }]);
        expect(r.body.data).not.toHaveProperty('registro');
        // Las que estaban corren un lugar (20, 30…).
        expect(delEstado('contratado').map(o => o.id)).toEqual([fila.id, ...contratadas]);
        expect(delEstado('contratado').map(o => o.orden)).toEqual([fila.id, ...contratadas].map((_, i) => (i + 1) * 10));
        expect(historial().map(h => h.accion)).toEqual(['crear', 'orden', 'incluir']);
        expect(historial().every(h => /\(editor visual\)/.test(h.resumen))).toBe(true);
        expect(logManualActivity.mock.calls.map(c => c[2])).toEqual(['CREATE', 'UPDATE']);
        // El borrador la trae como nunca publicada (se puede borrar) y las importadas no.
        const borr = await request(app).get('/api/sitio-web/editor/borrador').set('Authorization', `Bearer ${VER}`);
        const x = borr.body.data.find(d => d.meta.id === fila.id);
        expect(x.meta).toMatchObject({ incluir: true, nunca_publicada: true, publicado_at: null });
        expect(x.json.orden).toBe(10);
        expect(borr.body.data.filter(d => d.meta.nunca_publicada)).toHaveLength(1);
    });

    test('cambiar de estado por el camino de la edición: pasa al final de su estado nuevo; con orden, donde se pidió', async () => {
        const a = delEstado('en_construccion')[0];
        const terminadas = delEstado('terminado').map(o => o.id);
        const maxAntes = Math.max(...delEstado('terminado').map(o => o.orden));
        const r1 = await guardar(EDITAR, { obras: [item(a, { estado: 'terminado', anio: 2025 })] });
        expect(r1.status).toBe(200);
        expect(a).toMatchObject({ estado: 'terminado', anio: 2025, orden: maxAntes + 10 });

        const b = delEstado('en_construccion')[0];
        const r2 = await guardar(EDITAR, {
            obras: [item(b, { estado: 'terminado', anio: 2024 })],
            orden: [{ estado: 'terminado', ids: [b.id, ...terminadas, a.id] }],
        });
        expect(r2.status).toBe(200);
        expect(delEstado('terminado').map(o => o.id)).toEqual([b.id, ...terminadas, a.id]);
        expect(r2.body.data.obras[0]).toMatchObject({ id: b.id });
    });

    test('incluir una obra a la que le falta algo → 409 FALTAN_DATOS con la lista y NADA cambia (ni la nueva ni las otras)', async () => {
        const a = db.tablas.sitio_obras[0];
        const filas = JSON.stringify(db.tablas.sitio_obras);
        const r = await guardar(EDITAR, {
            obras: [item(a, { comuna: 'Esto se deshace' })],
            nuevas: [{ tmp: '~n1', cambios: { nombre: 'En obra sin portada', estado: 'en_construccion', comuna: 'Santiago', servicios: ['construccion'] } }],
            incluir: [{ id: '~n1', incluir: true }],
        });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_FALTAN_DATOS');
        expect(r.body.tmp).toBe('~n1');
        expect(r.body.faltantes.map(f => f.campo)).toContain('portada');
        expect(JSON.stringify(db.tablas.sitio_obras)).toBe(filas);
        expect(historial()).toHaveLength(0);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('quitar del sitio nunca se bloquea (también con faltantes)', async () => {
        const a = db.tablas.sitio_obras[0];
        a.comuna = null;
        const r = await guardar(EDITAR, { obras: [], incluir: [{ id: a.id, incluir: false }] });
        expect(r.status).toBe(200);
        expect(a.incluir).toBe(false);
        expect(historial().map(h => h.accion)).toEqual(['quitar']);
    });

    test('orden que no calza con las obras de ese estado → 409 ORDEN_DESACTUALIZADO y rollback', async () => {
        const a = db.tablas.sitio_obras[0];
        const contratadas = delEstado('contratado').map(o => o.id);
        const otraEnCurso = delEstado('en_construccion')[0].id;
        const filas = JSON.stringify(db.tablas.sitio_obras);
        for (const ids of [contratadas.slice(1), [...contratadas, otraEnCurso]]) {
            // El rollback restaura copias de las filas: la obra se vuelve a buscar en cada vuelta.
            const fresca = db.tablas.sitio_obras.find(o => o.id === a.id);
            const r = await guardar(EDITAR, { obras: [item(fresca, { comuna: 'Se deshace' })], orden: [{ estado: 'contratado', ids }] });
            expect(r.status).toBe(409);
            expect(r.body.code).toBe('SITIO_WEB_ORDEN_DESACTUALIZADO');
            expect(r.body.estado).toBe('contratado');
            expect(JSON.stringify(db.tablas.sitio_obras)).toBe(filas);
        }
        // La nueva del mismo guardado TIENE que venir en la lista de su estado.
        const r = await guardar(EDITAR, { obras: [], nuevas: [nuevaContratada()], orden: [{ estado: 'contratado', ids: contratadas }] });
        expect(r.status).toBe(409);
        expect(db.tablas.sitio_obras.some(o => o.nombre === 'Edificio Nueva Prueba 123')).toBe(false);
        expect(historial()).toHaveLength(0);
    });

    test('nombre que da un slug reservado u ocupado → 409 con el tmp y nada creado', async () => {
        const total = db.tablas.sitio_obras.length;
        const r1 = await guardar(EDITAR, { obras: [], nuevas: [{ tmp: '~n1', cambios: { nombre: 'Molde' } }] });
        expect(r1.status).toBe(409);
        expect(r1.body).toMatchObject({ code: 'SITIO_WEB_SLUG_RESERVADO', tmp: '~n1' });
        const existente = db.tablas.sitio_obras[0];
        const r2 = await guardar(EDITAR, { obras: [], nuevas: [{ tmp: '~n1', cambios: { nombre: 'Una sola' } }, { tmp: '~n2', cambios: { nombre: existente.slug } }] });
        expect(r2.status).toBe(409);
        expect(r2.body).toMatchObject({ code: 'SITIO_WEB_SLUG_OCUPADO', tmp: '~n2' });
        expect(db.tablas.sitio_obras).toHaveLength(total);
        expect(historial()).toHaveLength(0);
    });

    test('validación de las partes nuevas: 400 sin tocar la BD', async () => {
        const a = db.tablas.sitio_obras[0];
        const casos = [
            { obras: [] },                                                                           // nada que guardar
            { obras: [], nuevas: [{ tmp: 'n1', cambios: { nombre: 'X' } }] },                        // tmp sin ~
            { obras: [], nuevas: [{ tmp: '~n1', cambios: {} }] },                                    // sin nombre
            { obras: [], nuevas: [{ tmp: '~n1', cambios: { nombre: 'X' } }, { tmp: '~n1', cambios: { nombre: 'Y' } }] },
            { obras: [], nuevas: [{ tmp: '~n1', cambios: { nombre: 'X', estado: 'demolida' } }] },
            { obras: [], orden: [{ estado: 'contratado', ids: ['~n9'] }] },                          // tmp que no viene
            { obras: [], orden: [{ estado: 'contratado', ids: [a.id, a.id] }] },
            { obras: [], orden: [{ estado: 'otro', ids: [a.id] }] },
            { obras: [], orden: [{ estado: 'contratado', ids: [] }] },
            { obras: [], orden: [{ estado: 'contratado', ids: [a.id] }, { estado: 'contratado', ids: [a.id] }] },
            { obras: [], incluir: [{ id: a.id, incluir: 'si' }] },
            { obras: [], incluir: [{ id: 'x', incluir: true }] },
            { obras: [], incluir: [{ id: a.id, incluir: true }, { id: a.id, incluir: false }] },
            { obras: [], nuevas: 'x' },
            { obras: [], orden: [3] },
        ];
        for (const body of casos) {
            const r = await guardar(EDITAR, body);
            expect({ body: JSON.stringify(body).slice(0, 90), status: r.status }).toEqual({ body: JSON.stringify(body).slice(0, 90), status: 400 });
            expect(r.body.error).toEqual(expect.any(String));
        }
        expect(historial()).toHaveLength(0);
        expect(db.sentencias.some(s => /^(UPDATE|INSERT)/.test(s))).toBe(false);
    });

    test('las claves de más en una nueva se descartan (no se puede crear incluida ni con orden propio)', async () => {
        const r = await guardar(EDITAR, { obras: [], nuevas: [nuevaContratada({ incluir: true, orden: 1, publicado_hash: 'x' })] });
        expect(r.status).toBe(200);
        const fila = obra('edificio-nueva-prueba-123');
        expect(fila).toMatchObject({ incluir: false, publicado_hash: null });
        expect(fila.orden).toBe(Math.max(...delEstado('contratado').filter(o => o.id !== fila.id).map(o => o.orden)) + 10);
    });
});

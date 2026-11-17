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

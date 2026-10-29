/**
 * Sitio web — publicar, importar y resincronizar (mig 147, plan 4.7, 4.11, 6 y 7.2).
 *
 * Con una BD en memoria y un repo de GitHub en memoria (tests/helpers/sitioWebFalsos.js), sin red:
 *   · IMPORTAR las 27 obras reales de lols.cl (tests/fixtures/sitio-web/obras, blobs de main en edab831) desde el
 *     repo (publicar) o desde un ZIP (simulación): cada JSON vuelve byte a byte, las fotos quedan aprobadas con la
 *     nota «revisar que nadie sea reconocible», y PUBLICAR enseguida da `sin_cambios` sin un solo blob ni commit;
 *   · simulación sin token: cero llamadas a fetch, ZIP con los archivos y BORRAR.txt;
 *   · un commit atómico (base_tree, force:false, sin [skip ci]); portada nueva en una carpeta propia borra el 1.jpg
 *     heredado; en una compartida con «Han confiado en nosotros», nunca; .gitkeep intacto;
 *   · repo tocado a mano → SITIO_WEB_REPO_MODIFICADO; 422 + head nuevo con una ruta de la Bóveda cambiada → aborta
 *     sin pisar; 422 por un cambio ajeno → entra sobre el head nuevo;
 *   · interrupción después del PATCH → la próxima publicación la concilia como ok; sin el commit en main →
 *     interrumpida; lock ocupado → 409;
 *   · faltan datos → se mantiene lo publicado; foto rechazada → la obra sale; publicado_hash = JSON ENVIADO;
 *   · resincronizar tras un revert; detalle con compilación y «en línea»; rutas y permisos.
 */
jest.mock('../src/config/db', () => require('./helpers/sitioWebFalsos').crearBd());
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    requestLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const { crearGithub, gitBlobSha } = require('./helpers/sitioWebFalsos');
const sitio = require('../src/services/sitioWeb.service');
const pub = require('../src/services/sitioWebPublicar.service');
const fotosSvc = require('../src/services/sitioWebFotos.service');
const enLinea = require('../src/services/sitioWebEnLinea');
const { logManualActivity } = require('../src/middleware/logger');

const TOKEN = 'github_pat_PRUEBA_publicar_1234567890';
const REPO = 'Mauricio-Alvarez-T/lols-cl-prueba';   // repo privado de prueba: publica sin la guarda de producción
const ENV = {
    SITIO_WEB_MODO: 'publicar', GITHUB_TOKEN_SITIO: TOKEN, GITHUB_REPO_SITIO: REPO, GITHUB_BRANCH_SITIO: 'main',
    GITHUB_AUTOR_EMAIL_SITIO: 'boveda@lols.cl', SITIO_WEB_URL: 'https://nuevo.lols.cl',
};
const UPLOADS = sitio._h.UPLOADS_DIR;
const DIR_PAQUETES = pub._interno.DIR_PAQUETES;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sitio-web-publicar-'));
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');

/* ─────────── las obras de hoy de lols.cl ─────────── */

const DIR_FIX = path.join(__dirname, 'fixtures/sitio-web/obras');
const FIXTURES = Object.fromEntries(fs.readdirSync(DIR_FIX).filter(f => f.endsWith('.json'))
    .map(f => [f.replace(/\.json$/, ''), fs.readFileSync(path.join(DIR_FIX, f), 'utf8').replace(/\r\n/g, '\n')]));
const COMPARTIDAS = ['abate-molina-211', 'abate-molina-221', 'bascunan-guerrero-818', 'enfermera-lucia-vidal-arias-6679'];
const SOLO_CONFIANZA = ['claudio-gay-2970', 'av-providencia-1132', 'grajales-2751', 'bascunan-guerrero-239', 'gorbea-2635',
    'tucapel-jimenez-84', 'conferencia-442', 'san-alfonso-580'];
const jpg = (slug) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`foto de ${slug}`)]);

/** El repo lols.cl de hoy: los 27 JSON, sus 1.jpg, los de «Han confiado en nosotros» y archivos que no son de la Bóveda. */
function repoDeHoy() {
    const a = {
        'src/content/obras/.gitkeep': '',
        'src/pages/index.astro': '<Base />',
        'scripts/cpanel-deploy.sh': '#!/bin/sh\n',
        'public/.htaccess': 'Options -Indexes\n',
        'public/api/contacto.php': '<?php ?>',
        'public/proyectos/foto-por-recibir.svg': '<svg/>',
    };
    for (const [slug, texto] of Object.entries(FIXTURES)) {
        a[`src/content/obras/${slug}.json`] = texto;
        for (const f of JSON.parse(texto).fotos) a[`public${f.src}`] = jpg(slug);
    }
    for (const slug of SOLO_CONFIANZA) a[`public/proyectos/${slug}/1.jpg`] = jpg(slug);
    return a;
}

const nuevoGithub = (archivos = repoDeHoy()) => crearGithub({ repo: REPO, token: TOKEN, archivos });
const op = (gh, extra = {}) => ({ env: ENV, fetchImpl: gh.fetch, esperar: jest.fn().mockResolvedValue(undefined), ...extra });
const obra = (slug) => db.tablas.sitio_obras.find(o => o.slug === slug);
const fotosDe = (o) => db.tablas.sitio_obra_fotos.filter(f => f.sitio_obra_id === o.id);
const pubs = () => db.tablas.sitio_publicaciones;
const textoActual = (o) => sitio.textoJson(sitio.serializarObra(o, sitio.fotoVigente(fotosDe(o))));

let fotoSeq = 995000;
/** Una portada de la Bóveda ya aprobada (archivos en uploads/sitio-web/<obra>/). */
function fotoBoveda(o, { ancho = 1600, alto = 900 } = {}) {
    const maestra = crypto.randomBytes(64);
    const hash = sha256(maestra);
    const ruta = `sitio-web/${o.id}/${hash}`;
    fs.mkdirSync(path.join(UPLOADS, 'sitio-web', String(o.id)), { recursive: true });
    fs.writeFileSync(path.join(UPLOADS, `${ruta}-maestra.jpg`), maestra);
    fs.writeFileSync(path.join(UPLOADS, `${ruta}-800.webp`), Buffer.concat([Buffer.from('RIFF800 WEBP'), crypto.randomBytes(16)]));
    fs.writeFileSync(path.join(UPLOADS, `${ruta}-1600.webp`), Buffer.concat([Buffer.from('RIFF1600WEBP'), crypto.randomBytes(16)]));
    const cuando = new Date(Date.now() + 60000);
    const f = {
        id: ++fotoSeq, sitio_obra_id: o.id, rol: 'portada', orden: 0, alt: 'Fachada de la obra vista desde la calle', ruta, heredada_src: null,
        hash, ancho, alto, tamano_bytes: 1000, subido_por: 5, sin_personas_confirmado: true, confirmado_por: 5, confirmado_at: cuando,
        aprobada_por: 5, aprobada_at: cuando, aprobada_hash: hash, rechazada_por: null, rechazada_at: null, created_at: cuando, updated_at: cuando,
    };
    db.tablas.sitio_obra_fotos.push(f);
    return f;
}
/** Como aprobarFoto: la portada anterior (la heredada) se va y la imagen referencial pasa a null. */
function nuevaPortada(slug) {
    const o = obra(slug);
    db.tablas.sitio_obra_fotos = db.tablas.sitio_obra_fotos.filter(f => f.sitio_obra_id !== o.id);
    o.referencia = null;
    return fotoBoveda(o);
}
/** Una obra nueva de la Bóveda, completa e incluida (contratada: puede ir sin foto). */
const obraContratada = (id) => ({
    id, obra_id: null, slug: 'bodegas-norte', nombre: 'Bodegas Norte', titular: null, tipo: null, mandante: null, mandante_autoriza: false,
    comuna: 'Quilicura', direccion: null, superficie_m2: null, estado: 'contratado', anio: null, inicio: null, servicios: 'construccion',
    desafio: null, solucion: null, resultado: null, referencia: null, orden: 10, incluir: true, publicado_hash: null, publicado_json: null,
    publicado_at: null, created_at: new Date(), updated_at: new Date(),
});
const archivoUpload = (f, suf) => fs.readFileSync(path.join(UPLOADS, `${f.ruta}${suf}`));

async function zipDelRepo(archivos, prefijo = 'lols.cl-main/') {
    const z = new JSZip();
    for (const [r, c] of Object.entries(archivos)) z.file(`${prefijo}${r}`, c);
    const p = path.join(TMP, `${crypto.randomUUID()}.bin`);
    fs.writeFileSync(p, await z.generateAsync({ type: 'nodebuffer' }));
    return p;
}

function limpiarUploads() {
    for (const dir of [path.join(UPLOADS, 'sitio-web')]) {
        let nombres = [];
        try { nombres = fs.readdirSync(dir); } catch { continue; }
        // Solo las carpetas de ESTE archivo (ids 990xxx de la BD falsa): sitio_web_fotos.test.js usa la 999001 en paralelo.
        for (const n of nombres) if (/^990\d{3}$/.test(n)) fs.rmSync(path.join(dir, n), { recursive: true, force: true });
    }
    let zips = [];
    try { zips = fs.readdirSync(DIR_PAQUETES); } catch { /* sin paquetes */ }
    for (const n of zips) if (/^990\d{3}\.zip$/.test(n)) fs.rmSync(path.join(DIR_PAQUETES, n), { force: true });
}

const fetchProhibido = jest.fn(async () => { throw new Error('no debía llamar a la red'); });

beforeEach(() => {
    db.reiniciar();
    limpiarUploads();
    enLinea.limpiarCache();
    jest.clearAllMocks();
});
afterAll(() => {
    limpiarUploads();
    fs.rmSync(TMP, { recursive: true, force: true });
});

/* ═══════════════════════ puras ═══════════════════════ */

describe('funciones puras de la publicación', () => {
    test('esDuena: JSON y portadas siempre; el 1.jpg solo si el manifiesto lo trae y nunca el de una carpeta compartida', () => {
        const base = { 'public/proyectos/toesca-2770/1.jpg': 'x', 'public/proyectos/abate-molina-211/1.jpg': 'y' };
        expect(pub.esDuena('src/content/obras/a.json', {})).toBe(true);
        expect(pub.esDuena('public/proyectos/a/portada.0123abcd-800.webp', {})).toBe(true);
        expect(pub.esDuena('public/proyectos/toesca-2770/1.jpg', {})).toBe(false);
        expect(pub.esDuena('public/proyectos/toesca-2770/1.jpg', base)).toBe(true);
        expect(pub.esDuena('public/proyectos/abate-molina-211/1.jpg', base)).toBe(false);
        for (const r of ['src/content/obras/.gitkeep', 'public/.htaccess', 'public/proyectos/foto-por-recibir.svg', 'scripts/x.sh', 'public/proyectos/a/2.jpg']) {
            expect(pub.esDuena(r, { [r]: 'z' })).toBe(false);
        }
    });

    test('calcularCambios y rutasDistintas', () => {
        const archivos = new Map([['a', { sha: '1' }], ['b', { sha: '2' }]]);
        expect(pub.calcularCambios(archivos, { a: '1', b: '9', c: '3' })).toEqual({ escribir: ['b'], borrar: ['c'] });
        expect(pub.rutasDistintas({ a: '1', b: '2' }, { a: '1', c: '3' })).toEqual(['b', 'c']);
    });

    test('fotoRechazadaEn: por el hash8 de la portada o por el src de la heredada', () => {
        const json = { fotos: [{ src: '/proyectos/a/portada.0123abcd-1600.webp', srcset: '/proyectos/a/portada.0123abcd-800.webp 800w' }] };
        expect(pub.fotoRechazadaEn(json, [{ hash: `0123abcd${'0'.repeat(56)}`, rechazada_at: new Date() }])).toBe(true);
        expect(pub.fotoRechazadaEn(json, [{ hash: `0123abcd${'0'.repeat(56)}`, rechazada_at: null }])).toBe(false);
        expect(pub.fotoRechazadaEn({ fotos: [{ src: '/proyectos/a/1.jpg' }] }, [{ heredada_src: '/proyectos/a/1.jpg', rechazada_at: new Date() }])).toBe(true);
    });

    test('rutaEnRepo: quita la carpeta del ZIP y deja solo los JSON y public/proyectos/<slug>/<archivo>', () => {
        expect(pub.rutaEnRepo('lols.cl-main/src/content/obras/a.json')).toBe('src/content/obras/a.json');
        expect(pub.rutaEnRepo('src/content/obras/a.json')).toBe('src/content/obras/a.json');
        expect(pub.rutaEnRepo('lols.cl-main/public/proyectos/a/1.jpg')).toBe('public/proyectos/a/1.jpg');
        expect(pub.rutaEnRepo('x\\public\\proyectos\\a\\1.jpg')).toBe('public/proyectos/a/1.jpg');
        for (const n of ['lols.cl-main/public/proyectos/foto-por-recibir.svg', 'src/content/obras/.gitkeep', 'a/../src/content/obras/a.json',
            'src/pages/index.astro', 'public/proyectos/a/b/1.jpg']) expect(pub.rutaEnRepo(n)).toBeNull();
    });

    test('autorCommit: «Bóveda LOLS <correo>» solo con un correo válido', () => {
        expect(pub.autorCommit({ GITHUB_AUTOR_EMAIL_SITIO: 'boveda@lols.cl' })).toEqual({ name: 'Bóveda LOLS', email: 'boveda@lols.cl' });
        for (const malo of ['', 'sin-arroba', 'a@b', 'x@y.cl\nBcc: z@w.cl']) expect(pub.autorCommit({ GITHUB_AUTOR_EMAIL_SITIO: malo })).toBeNull();
    });

    test('podarPaquetes: deja los últimos 10', () => {
        const dir = fs.mkdtempSync(path.join(TMP, 'paq-'));
        for (let i = 1; i <= 13; i++) fs.writeFileSync(path.join(dir, `${i}.zip`), 'x');
        expect(pub.podarPaquetes(dir)).toBe(3);
        expect(fs.readdirSync(dir).map(n => parseInt(n, 10)).sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    });
});

/* ═══════════════════════ importar ═══════════════════════ */

describe('importar las obras del sitio (plan 4.11)', () => {
    test('desde el repo: 27 obras, cada JSON vuelve BYTE A BYTE y publicar enseguida = sin_cambios, sin blobs ni commit', async () => {
        const gh = nuevoGithub();
        const r = await pub.importar({ userId: 5, ...op(gh) });
        expect(r.importadas).toHaveLength(27);
        expect(r.avisos).toEqual([]);
        expect(r.commit_sha).toBe(gh.ref);
        expect(db.tablas.sitio_obras).toHaveLength(27);
        expect(db.tablas.sitio_obra_fotos).toHaveLength(17);

        for (const [slug, texto] of Object.entries(FIXTURES)) {
            const o = obra(slug);
            expect(o.incluir).toBe(true);
            expect(o.publicado_json).toBe(texto);
            expect(o.publicado_hash).toBe(sitio.hashTexto(texto));
            expect(textoActual(o)).toBe(texto);                    // serializar de vuelta = el archivo del sitio
        }
        // Fotos heredadas: aprobadas y confirmadas, con los bytes del 1.jpg tal cual y su nota en el historial.
        const h = obra('toesca-2770');
        const [f] = fotosDe(h);
        expect(f).toMatchObject({ heredada_src: '/proyectos/toesca-2770/1.jpg', sin_personas_confirmado: 1, aprobada_hash: f.hash });
        expect(sitio.fotoPublicable(f)).toBe(true);
        expect(archivoUpload(f, '-maestra.jpg')).toEqual(jpg('toesca-2770'));
        expect(db.tablas.sitio_web_historial.filter(x => x.entidad === 'foto' && x.accion === 'importar')).toHaveLength(17);
        expect(db.tablas.sitio_web_historial.find(x => x.entidad === 'foto').resumen).toMatch(/revisar que nadie sea reconocible/);
        // El mandante que ya estaba publicado queda autorizado (por quien importó).
        expect(obra('abate-molina-211')).toMatchObject({ mandante: 'Electrónica Kolm Ltda.', mandante_autoriza: true, mandante_autoriza_por: 5 });

        // Manifiesto base: los 27 JSON y los 1.jpg heredados de carpetas PROPIAS (no los compartidos ni los ajenos).
        const [base] = pubs();
        expect(base).toMatchObject({ modo: 'importacion', estado: 'ok', commit_sha: gh.ref });
        const m = JSON.parse(base.manifiesto);
        expect(Object.keys(m).filter(x => x.endsWith('.json'))).toHaveLength(27);
        expect(Object.keys(m).filter(x => x.endsWith('/1.jpg'))).toHaveLength(13);
        for (const slug of [...COMPARTIDAS, ...SOLO_CONFIANZA]) expect(m).not.toHaveProperty(`public/proyectos/${slug}/1.jpg`);
        expect(m).not.toHaveProperty('src/content/obras/.gitkeep');
        expect(m['src/content/obras/gorbea-3082.json']).toBe(gitBlobSha(Buffer.from(FIXTURES['gorbea-3082'])));

        // Publicar enseguida: nada que hacer.
        const p = await pub.publicar({ userId: 5, ...op(gh) });
        expect(p).toMatchObject({ estado: 'sin_cambios', obras_incluidas: 27, archivos: { escribir: 0, borrar: 0 }, error_codigo: null });
        expect(gh.cuenta('POST', /^\/git\/blobs$/)).toBe(0);
        expect(gh.cuenta('POST', /^\/git\/commits$/)).toBe(0);
        expect(gh.cuenta('PATCH', /refs/)).toBe(0);
        const lista = await sitio.listarObras();
        expect(lista.map(o => o.estadoDerivado)).toEqual(Array(27).fill('publicada'));
    });

    test('desde un ZIP (simulación): sin ninguna llamada a la red, borra el ZIP y simular enseguida = sin_cambios', async () => {
        const zip = await zipDelRepo(repoDeHoy());
        const globalFetch = jest.spyOn(globalThis, 'fetch');
        const r = await pub.importar({ userId: 5, archivo: { path: zip }, env: {}, fetchImpl: fetchProhibido });
        expect(r.importadas).toHaveLength(27);
        expect(r.commit_sha).toBeNull();
        expect(fs.existsSync(zip)).toBe(false);
        for (const [slug, texto] of Object.entries(FIXTURES)) expect(textoActual(obra(slug))).toBe(texto);
        expect(pubs()[0]).toMatchObject({ modo: 'importacion', estado: 'ok', commit_sha: null });

        const p = await pub.publicar({ userId: 5, env: {}, fetchImpl: fetchProhibido });
        expect(p).toMatchObject({ modo: 'simulacion', estado: 'sin_cambios', paquete: false });
        const previa = await pub.previa({ env: {} });
        expect(previa).toMatchObject({ modo: 'simulacion', hay_cambios: false, bloqueos: [] });
        expect(previa.cambios.iguales).toBe(27);
        expect(fetchProhibido).not.toHaveBeenCalled();
        expect(globalFetch).not.toHaveBeenCalled();
        globalFetch.mockRestore();
    });

    test('idempotente por slug: la segunda vez no importa nada; después de publicar de verdad → 409', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const r2 = await pub.importar({ userId: 5, ...op(gh) });
        expect(r2).toMatchObject({ publicacion_id: null, importadas: [], ya_estaban: 27 });
        expect(db.tablas.sitio_obras).toHaveLength(27);
        expect(pubs()).toHaveLength(1);

        obra('maipu-40').titular = 'Otro titular';
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('ok');
        await expect(pub.importar({ userId: 5, ...op(gh) })).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_YA_PUBLICADO' });
    });

    test('un JSON roto en el repo: no se importa NADA (409 con la lista)', async () => {
        const gh = nuevoGithub({ ...repoDeHoy(), 'src/content/obras/rota.json': '{"slug": "otra"}' });
        await expect(pub.importar({ userId: 5, ...op(gh) })).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_IMPORTACION_INVALIDA' });
        expect(db.tablas.sitio_obras).toHaveLength(0);
        expect(pubs()).toHaveLength(0);
    });

    test('ZIP en modo publicar → 400; sin ZIP en simulación → 400; un archivo que no es ZIP → 400', async () => {
        const zip = await zipDelRepo(repoDeHoy());
        await expect(pub.importar({ userId: 5, archivo: { path: zip }, ...op(nuevoGithub()) })).rejects.toMatchObject({ code: 'SITIO_WEB_PAQUETE_NO_VA' });
        await expect(pub.importar({ userId: 5, env: {} })).rejects.toMatchObject({ code: 'SITIO_WEB_SIN_PAQUETE' });
        const falso = path.join(TMP, 'falso.bin');
        fs.writeFileSync(falso, '<svg/>');
        await expect(pub.importar({ userId: 5, archivo: { path: falso }, env: {} })).rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_PAQUETE_INVALIDO' });
    });
});

/* ═══════════════════════ simulación ═══════════════════════ */

describe('simulación (staging o sin token)', () => {
    test('cero llamadas a fetch; ZIP con los JSON y las portadas, BORRAR.txt y sin los 1.jpg; nada queda «publicado»', async () => {
        await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(repoDeHoy()) }, env: {} });
        const nueva = nuevaPortada('toesca-2770');
        obra('esperanza-27').incluir = false;
        const antes = obra('toesca-2770').publicado_hash;

        const r = await pub.publicar({ userId: 5, env: {}, fetchImpl: fetchProhibido });
        expect(r).toMatchObject({ modo: 'simulacion', estado: 'simulada', paquete: true, archivos: { escribir: 3, borrar: 3 } });
        expect(r.cambios.cambiadas.map(o => o.slug)).toEqual(['toesca-2770']);
        expect(r.cambios.retiradas.map(o => o.slug)).toEqual(['esperanza-27']);
        expect(fetchProhibido).not.toHaveBeenCalled();
        expect(obra('toesca-2770').publicado_hash).toBe(antes);         // simular no publica

        const zip = await JSZip.loadAsync(fs.readFileSync(path.join(DIR_PAQUETES, `${r.id}.zip`)));
        const nombres = Object.keys(zip.files);
        expect(nombres.filter(n => n.endsWith('.json') && n.startsWith('src/'))).toHaveLength(26);
        expect(nombres.some(n => n.endsWith('/1.jpg'))).toBe(false);
        const h8 = nueva.hash.slice(0, 8);
        expect(await zip.file(`public/proyectos/toesca-2770/portada.${h8}-1600.webp`).async('nodebuffer')).toEqual(archivoUpload(nueva, '-1600.webp'));
        expect(await zip.file('src/content/obras/toesca-2770.json').async('string')).toBe(textoActual(obra('toesca-2770')));
        expect((await zip.file('BORRAR.txt').async('string')).trim().split('\n')).toEqual([
            'public/proyectos/esperanza-27/1.jpg', 'public/proyectos/toesca-2770/1.jpg', 'src/content/obras/esperanza-27.json',
        ]);
        expect(await zip.file('LEEME.txt').async('string')).toMatch(/NO se publicó nada/);
        expect(pubs().find(p => p.id === r.id)).toMatchObject({ estado: 'simulada', modo: 'simulacion' });
    });
});

/* ═══════════════════════ publicar ═══════════════════════ */

describe('publicar en el repo (un commit atómico)', () => {
    test('portada nueva: borra el 1.jpg heredado en su carpeta; en una compartida, NUNCA; retirar una compartida deja su 1.jpg', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const propia = nuevaPortada('toesca-2770');
        const compartida = nuevaPortada('abate-molina-211');
        obra('esperanza-27').incluir = false;
        obra('bascunan-guerrero-818').incluir = false;
        const opciones = op(gh);

        const r = await pub.publicar({ userId: 5, ...opciones });
        expect(r).toMatchObject({ estado: 'ok', modo: 'publicar', error_codigo: null, obras_incluidas: 25 });
        expect(r.commit_sha).toBe(gh.ref);
        expect(r.url_commit).toBe(`https://github.com/${REPO}/commit/${gh.ref}`);

        const repo = gh.archivos();
        const p8 = propia.hash.slice(0, 8); const c8 = compartida.hash.slice(0, 8);
        expect(repo.get(`public/proyectos/toesca-2770/portada.${p8}-1600.webp`)).toEqual(archivoUpload(propia, '-1600.webp'));
        expect(repo.get(`public/proyectos/toesca-2770/portada.${p8}-800.webp`)).toEqual(archivoUpload(propia, '-800.webp'));
        expect(repo.has('public/proyectos/toesca-2770/1.jpg')).toBe(false);              // heredada propia: se va
        expect(repo.has(`public/proyectos/abate-molina-211/portada.${c8}-1600.webp`)).toBe(true);
        expect(repo.get('public/proyectos/abate-molina-211/1.jpg')).toEqual(jpg('abate-molina-211'));   // compartida: queda
        expect(repo.has('src/content/obras/bascunan-guerrero-818.json')).toBe(false);
        expect(repo.get('public/proyectos/bascunan-guerrero-818/1.jpg')).toEqual(jpg('bascunan-guerrero-818'));
        expect(repo.has('src/content/obras/esperanza-27.json')).toBe(false);
        expect(repo.has('public/proyectos/esperanza-27/1.jpg')).toBe(false);
        expect(repo.has('src/content/obras/.gitkeep')).toBe(true);
        for (const ajeno of ['public/.htaccess', 'public/api/contacto.php', 'scripts/cpanel-deploy.sh', ...SOLO_CONFIANZA.map(s => `public/proyectos/${s}/1.jpg`)]) {
            expect(repo.has(ajeno)).toBe(true);
        }
        expect(repo.get('src/content/obras/toesca-2770.json').toString('utf8')).toBe(textoActual(obra('toesca-2770')));
        expect(repo.get('src/content/obras/maipu-40.json').toString('utf8')).toBe(FIXTURES['maipu-40']);   // lo demás, intacto

        // Un commit: leer rama y árbol → blobs que faltan → tree con base_tree → commit → PATCH sin forzar.
        const escrituras = gh.llamadas.map(l => `${l.metodo} ${l.ruta.replace(/[0-9a-f]{40}/, '<sha>')}`).filter(l => !l.startsWith('GET /git/blobs'));
        const desde = escrituras.lastIndexOf('GET /git/ref/heads/main');
        expect(escrituras.slice(desde)).toEqual(['GET /git/ref/heads/main', 'GET /git/commits/<sha>', 'GET /git/trees/<sha>',
            ...Array(6).fill('POST /git/blobs'), 'POST /git/trees', 'POST /git/commits', 'PATCH /git/refs/heads/main']);
        expect(gh.cuenta('POST', /^\/git\/commits$/)).toBe(1);
        expect(gh.cuenta('PATCH', /^\/git\/refs\/heads\/main$/)).toBe(1);
        expect(gh.cuenta('POST', /^\/git\/blobs$/)).toBe(6);            // 2 JSON + 4 WebP
        expect(opciones.esperar.mock.calls.every(([ms]) => ms === 300)).toBe(true);
        expect(opciones.esperar).toHaveBeenCalledTimes(5);              // 300 ms entre blobs
        const arbol = gh.llamadas.find(l => l.metodo === 'POST' && l.ruta === '/git/trees').body;
        expect(arbol.base_tree).toMatch(/^[0-9a-f]{40}$/);
        expect(arbol.tree.filter(e => e.sha === null).map(e => e.path).sort()).toEqual([
            'public/proyectos/esperanza-27/1.jpg', 'public/proyectos/toesca-2770/1.jpg',
            'src/content/obras/bascunan-guerrero-818.json', 'src/content/obras/esperanza-27.json',
        ]);
        const commit = gh.commit(gh.ref);
        expect(commit.message).toBe(`sitio: publicar obras (pub #${r.id})`);
        expect(commit.message).not.toMatch(/skip ci/i);
        expect(commit.author).toEqual({ name: 'Bóveda LOLS', email: 'boveda@lols.cl' });
        expect(gh.llamadas.find(l => l.metodo === 'PATCH').body).toEqual({ sha: gh.ref, force: false });
        for (const l of gh.llamadas) expect(l.url).not.toContain(TOKEN);

        // La BD: publicada con el JSON enviado, retiradas en null, la heredada propia se fue, la compartida no.
        const fila = pubs().find(p => p.id === r.id);
        expect(fila).toMatchObject({ estado: 'ok', commit_sha: gh.ref });
        expect(JSON.parse(fila.manifiesto)).toEqual(JSON.parse(fila.manifiesto_previsto));
        expect(obra('toesca-2770').publicado_hash).toBe(sitio.hashTexto(repo.get('src/content/obras/toesca-2770.json').toString('utf8')));
        expect(obra('esperanza-27')).toMatchObject({ publicado_hash: null, publicado_json: null, publicado_at: null });
        expect(obra('bascunan-guerrero-818').publicado_hash).toBeNull();
        expect(fotosDe(obra('esperanza-27'))).toHaveLength(0);
        expect(fotosDe(obra('bascunan-guerrero-818'))).toHaveLength(1);

        // Otra vez: nada que hacer.
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('sin_cambios');
    });

    test('repo tocado a mano en una ruta de la Bóveda → SITIO_WEB_REPO_MODIFICADO sin subir nada; un cambio ajeno no molesta', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        gh.empujar({ 'src/pages/index.astro': '<Base nueva />' });
        gh.empujar({ 'src/content/obras/gorbea-3082.json': '{}' });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_REPO_MODIFICADO' });
        expect(r.error_mensaje).toMatch(/Resincronizar/);
        expect(gh.cuenta('POST', /^\/git\/(blobs|trees|commits)$/)).toBe(0);
        expect(gh.cuenta('PATCH', /refs/)).toBe(0);
        expect(pubs().find(p => p.id === r.id)).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_REPO_MODIFICADO' });
    });

    test('una obra nueva agregada a mano en el repo también cuenta como cambio a mano', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        gh.empujar({ 'src/content/obras/nueva-a-mano.json': '{}' });
        expect((await pub.publicar({ userId: 5, ...op(gh) })).error_codigo).toBe('SITIO_WEB_REPO_MODIFICADO');
    });

    test('un 422 seguido de un head nuevo con una ruta de la Bóveda cambiada: aborta y NO sobrescribe', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        let deMarcos;
        gh.antesDelPatch(() => { deMarcos = gh.empujar({ 'src/content/obras/maipu-40.json': '{"a mano": true}' }); });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_REPO_MODIFICADO' });
        expect(gh.cuenta('PATCH', /refs/)).toBe(1);
        expect(gh.ref).toBe(deMarcos);
        expect(gh.archivos().get('src/content/obras/maipu-40.json').toString()).toBe('{"a mano": true}');
    });

    test('un 422 por un cambio ajeno: el segundo intento entra sobre el head nuevo y conserva ese cambio', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        let deMarcos;
        gh.antesDelPatch(() => { deMarcos = gh.empujar({ 'src/pages/index.astro': '<Base nueva />' }); });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(gh.cuenta('PATCH', /refs/)).toBe(2);
        expect(gh.commit(gh.ref).parents).toEqual([deMarcos]);
        expect(gh.archivos().get('src/pages/index.astro').toString()).toBe('<Base nueva />');
        expect(gh.archivos().get('src/content/obras/maipu-40.json').toString()).toBe(textoActual(obra('maipu-40')));
        expect(pubs().find(p => p.id === r.id)).toMatchObject({ commit_sha: gh.ref, parent_sha: deMarcos });
    });

    test('tres 422 seguidos con main moviéndose (cambios ajenos) → SITIO_WEB_REPO_OCUPADO', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        // Cada PATCH llega tarde: alguien empujó otra cosa a main justo antes.
        let n = 0;
        const fetchImpl = async (url, o = {}) => {
            if (o.method === 'PATCH') {
                gh.empujar({ 'src/pages/index.astro': `<Base v${++n} />` });
                return new Response(JSON.stringify({ message: 'Update is not a fast forward' }), { status: 422 });
            }
            return gh.fetch(url, o);
        };
        const r = await pub.publicar({ userId: 5, ...op(gh, { fetchImpl }) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_REPO_OCUPADO' });
        expect(n).toBe(3);
        expect(obra('maipu-40').publicado_json).toBe(FIXTURES['maipu-40']);
    });

    test('un 422 con main QUIETO (regla o protección de la rama) → SITIO_WEB_GITHUB_RECHAZO sin reintentar', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const antes = gh.ref;
        gh.fallar({ metodo: 'PATCH', re: /refs/, status: 422, cuerpo: { message: 'Repository rule violations found' }, veces: 3 });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_GITHUB_RECHAZO' });
        expect(r.error_mensaje).toMatch(/regla o protección/);
        expect(gh.cuenta('PATCH', /refs/)).toBe(1);
        expect(gh.cuenta('POST', /^\/git\/commits$/)).toBe(1);
        expect(gh.ref).toBe(antes);
        expect(obra('maipu-40').publicado_json).toBe(FIXTURES['maipu-40']);
        expect(pubs().find(p => p.id === r.id)).toMatchObject({ estado: 'error' });
    });

    test('una publicación grande no pasa de 70 llamadas que crean contenido por minuto (límite secundario de GitHub)', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        // 27 portadas nuevas = 27 JSON + 54 WebP + árbol + commit + PATCH: más de 70.
        for (const slug of Object.keys(FIXTURES)) nuevaPortada(slug);
        const esperas = [];
        const r = await pub.publicar({ userId: 5, ...op(gh, { esperar: jest.fn(async (ms) => { esperas.push(ms); }) }) });
        expect(r.estado).toBe('ok');
        const creadas = gh.cuenta('POST', /^\/git\/(blobs|trees|commits)$/) + gh.cuenta('PATCH', /refs/);
        expect(creadas).toBeGreaterThan(70);
        // Esperó una ventana de casi un minuto antes de la llamada 71 (además de las pausas de 300 ms entre blobs).
        expect(esperas.some(ms => ms > 50000 && ms <= 60000)).toBe(true);
    });

    test('primera publicación sin importar y el repo ya tiene obras → REPO_MODIFICADO («Importar» primero)', async () => {
        const gh = nuevoGithub();
        db.tablas.sitio_obras.push(obraContratada(990500));
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_REPO_MODIFICADO' });
        expect(r.error_mensaje).toMatch(/Importar obras del sitio/);
    });

    test('token rechazado (401) → 200 con estado error y su código; el token no aparece en ninguna parte', async () => {
        const gh = crearGithub({ repo: REPO, token: 'otro_token_distinto_1234567890', archivos: repoDeHoy() });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r).toMatchObject({ estado: 'error', error_codigo: 'SITIO_WEB_TOKEN_INVALIDO' });
        expect(JSON.stringify(r)).not.toContain(TOKEN);
        expect(JSON.stringify(pubs())).not.toContain(TOKEN);
    });

    test('lock ocupado → 409 SITIO_WEB_PUBLICACION_EN_CURSO, sin tocar nada', async () => {
        db.ocuparLock();
        await expect(pub.publicar({ userId: 5, env: {} })).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_PUBLICACION_EN_CURSO' });
        await expect(pub.importar({ userId: 5, ...op(nuevoGithub()) })).rejects.toMatchObject({ code: 'SITIO_WEB_PUBLICACION_EN_CURSO' });
        expect(pubs()).toHaveLength(0);
    });

    test('el lock se suelta siempre (también si la publicación falla)', async () => {
        const gh = crearGithub({ repo: REPO, token: 'otro_token_distinto_1234567890', archivos: repoDeHoy() });
        await pub.publicar({ userId: 5, ...op(gh) });
        expect(db.lockOcupado).toBe(false);
    });
});

describe('obras con datos a medias, fotos rechazadas y ediciones durante la publicación', () => {
    test('una obra publicada a la que le faltan datos MANTIENE su versión publicada (no bloquea a las demás)', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('gorbea-3082').comuna = null;
        obra('maipu-40').titular = 'Locales y oficinas';
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(r.cambios.mantienen.map(o => o.slug)).toEqual(['gorbea-3082']);
        expect(r.cambios.cambiadas.map(o => o.slug)).toEqual(['maipu-40']);
        expect(r.avisos.join(' ')).toMatch(/Gorbea 3082.*se mantiene la versión publicada/);
        expect(gh.archivos().get('src/content/obras/gorbea-3082.json').toString()).toBe(FIXTURES['gorbea-3082']);
        expect(obra('gorbea-3082').publicado_json).toBe(FIXTURES['gorbea-3082']);
    });

    test('portada publicada RECHAZADA y sin otra: la obra sale del sitio (JSON y 1.jpg) aunque esté incluida', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const [f] = fotosDe(obra('union-americana-325'));
        Object.assign(f, { rechazada_at: new Date(), rechazada_por: 5, aprobada_at: null, aprobada_hash: null });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(r.cambios.excluidas).toEqual([expect.objectContaining({ slug: 'union-americana-325', motivo: 'foto_rechazada' })]);
        expect(r.cambios.retiradas.map(o => o.slug)).toEqual(['union-americana-325']);
        expect(gh.archivos().has('src/content/obras/union-americana-325.json')).toBe(false);
        expect(gh.archivos().has('public/proyectos/union-americana-325/1.jpg')).toBe(false);
        expect(obra('union-americana-325')).toMatchObject({ incluir: true, publicado_hash: null });
    });

    test('rechazar la foto de una carpeta compartida: la obra sale, el 1.jpg queda (es del sitio) y se avisa', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const [f] = fotosDe(obra('abate-molina-211'));
        Object.assign(f, { rechazada_at: new Date(), rechazada_por: 5, aprobada_at: null, aprobada_hash: null });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(gh.archivos().has('src/content/obras/abate-molina-211.json')).toBe(false);
        expect(gh.archivos().has('public/proyectos/abate-molina-211/1.jpg')).toBe(true);
        expect(r.avisos.join(' ')).toMatch(/Han confiado en nosotros.*no puede sacarla de ahí/);
    });

    test('publicado_hash sale del JSON ENVIADO aunque la fila se edite durante la publicación', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        gh.antesDelPatch(async () => { obra('maipu-40').titular = 'Editado mientras se publicaba'; });
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        const enviado = gh.archivos().get('src/content/obras/maipu-40.json').toString('utf8');
        expect(enviado).toContain('Locales y oficinas');
        expect(obra('maipu-40').publicado_hash).toBe(sitio.hashTexto(enviado));
        expect(obra('maipu-40').publicado_json).toBe(enviado);
        const lista = await sitio.listarObras();
        expect(lista.find(o => o.slug === 'maipu-40').estadoDerivado).toBe('cambios');
    });

    test('una portada cuyo archivo cambió en el disco no sale: aviso y se mantiene lo publicado', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const f = nuevaPortada('toesca-2770');
        fs.writeFileSync(path.join(UPLOADS, `${f.ruta}-maestra.jpg`), 'otra cosa');
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.avisos.join(' ')).toMatch(/Toesca 2770.*no está completa en la Bóveda o cambió/);
        expect(r.cambios.mantienen.map(o => o.slug)).toEqual(['toesca-2770']);
        expect(gh.archivos().get('src/content/obras/toesca-2770.json').toString()).toBe(FIXTURES['toesca-2770']);
    });
});

/* ═══════════════════════ conciliación ═══════════════════════ */

describe('el proceso muere a mitad (conciliación)', () => {
    test('después del PATCH: la fila queda en_curso con su commit y la próxima publicación la concilia como ok', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        db.fallarEn(/^UPDATE sitio_publicaciones SET estado = 'ok'/, new Error('se cortó la conexión'));
        const r1 = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r1.estado).toBe('en_curso');
        expect(r1.error_mensaje).toMatch(/entró al sitio/);
        const fila = pubs().find(p => p.id === r1.id);
        expect(fila).toMatchObject({ estado: 'en_curso', commit_sha: gh.ref });
        expect(obra('maipu-40').publicado_json).toBe(FIXTURES['maipu-40']);        // la transacción se deshizo

        const enviado = gh.archivos().get('src/content/obras/maipu-40.json').toString('utf8');
        const r2 = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r2.conciliadas).toEqual([{ id: r1.id, estado: 'ok' }]);
        expect(r2.estado).toBe('sin_cambios');
        expect(pubs().find(p => p.id === r1.id)).toMatchObject({ estado: 'ok', commit_sha: fila.commit_sha });
        expect(obra('maipu-40').publicado_json).toBe(enviado);
        expect(obra('maipu-40').publicado_hash).toBe(sitio.hashTexto(enviado));
    });

    test('una huérfana cuyo commit NO está en main → interrumpida; una sin commit → interrumpida', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        db.tablas.sitio_publicaciones.push(
            { id: 990800, usuario_id: 5, modo: 'publicar', repo: REPO, rama: 'main', estado: 'en_curso', commit_sha: 'f'.repeat(40), manifiesto_previsto: '{}', obras_json: '{}' },
            { id: 990801, usuario_id: 5, modo: 'simulacion', repo: REPO, rama: 'main', estado: 'en_curso', commit_sha: null },
        );
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.conciliadas).toEqual([{ id: 990800, estado: 'interrumpida' }, { id: 990801, estado: 'interrumpida' }]);
        expect(pubs().find(p => p.id === 990800).estado).toBe('interrumpida');
    });

    test('PATCH que se corta pero llegó (la rama ya apunta al commit) → ok', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const opciones = op(gh);
        const fetchConCorte = jest.fn(async (url, o) => {
            const res = await gh.fetch(url, o);
            if (o && o.method === 'PATCH') throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
            return res;
        });
        const r = await pub.publicar({ userId: 5, ...opciones, fetchImpl: fetchConCorte });
        expect(r.estado).toBe('ok');
        expect(r.commit_sha).toBe(gh.ref);
    });
});

/* ═══════════════════════ resincronizar ═══════════════════════ */

describe('resincronizar (plan 7.2)', () => {
    test('tras un revert: la versión del repo queda como publicada, la foto que se fue queda rechazada y publicar = sin_cambios', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const antes = gh.ref;
        const nueva = nuevaPortada('toesca-2770');
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('ok');
        gh.revertirA(antes, 'Revert "sitio: publicar obras"');

        // Sin resincronizar, la Bóveda no pisa el revert.
        expect((await pub.publicar({ userId: 5, ...op(gh) })).error_codigo).toBe('SITIO_WEB_REPO_MODIFICADO');

        const r = await pub.resincronizar({ userId: 5, ...op(gh) });
        expect(r.actualizadas.map(o => o.slug)).toEqual(['toesca-2770']);
        expect(r.fotos_rechazadas).toEqual([{ id: nueva.id, sitio_obra_id: obra('toesca-2770').id }]);
        expect(obra('toesca-2770')).toMatchObject({ incluir: true, publicado_json: FIXTURES['toesca-2770'] });
        expect(fotosDe(obra('toesca-2770'))[0].rechazada_at).toBeInstanceOf(Date);
        expect(pubs().at(-1)).toMatchObject({ modo: 'importacion', estado: 'ok', commit_sha: gh.ref });

        const p = await pub.publicar({ userId: 5, ...op(gh) });
        expect(p.estado).toBe('sin_cambios');
        expect(p.cambios.mantienen.map(o => o.slug)).toEqual(['toesca-2770']);     // sin portada: se mantiene la del repo
    });

    test('una obra publicada cuyo JSON ya no está: queda fuera (incluir = 0), con aviso y su foto rechazada', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        gh.empujar({ 'src/content/obras/esperanza-27.json': null, 'public/proyectos/esperanza-27/1.jpg': null });
        const r = await pub.resincronizar({ userId: 5, ...op(gh) });
        expect(r.quitadas.map(o => o.slug)).toEqual(['esperanza-27']);
        expect(r.avisos.join(' ')).toMatch(/Esperanza 27.*quedó fuera/);
        expect(obra('esperanza-27')).toMatchObject({ publicado_hash: null, publicado_json: null });
        expect(obra('esperanza-27').incluir).toBeFalsy();
        expect(fotosDe(obra('esperanza-27'))[0].rechazada_at).toBeInstanceOf(Date);
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('sin_cambios');
    });

    test('en simulación no hay repo que leer → 409', async () => {
        await expect(pub.resincronizar({ userId: 5, env: {} })).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SOLO_PUBLICAR' });
    });
});

/* ═══════════════════════ lecturas ═══════════════════════ */

describe('detalle, previa y pendientes', () => {
    const conSitio = (gh, buildTxt) => jest.fn(async (url, o) => (String(url).startsWith('https://nuevo.lols.cl/')
        ? new Response(String(url).endsWith('/build.txt') ? buildTxt : '2026-10-29 10:00:00 · OK · abc1234\n', { status: 200 })
        : gh.fetch(url, o)));

    test('detalle: compilación OK y build.txt con el commit → en línea; queda guardado y ya no se vuelve a preguntar', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        gh.corrida({ id: 9, run_number: 3, head_sha: r.commit_sha, status: 'completed', conclusion: 'success', path: '.github/workflows/deploy.yml',
            html_url: 'https://github.com/x/y/actions/runs/9' });
        const d = await pub.detallePublicacion(r.id, op(gh, { fetchImpl: conSitio(gh, `${r.commit_sha}\n`) }));
        expect(d).toMatchObject({ estado: 'ok', build_estado: 'ok', build_url: 'https://github.com/x/y/actions/runs/9', terminada: true });
        expect(d.en_linea_at).toBeInstanceOf(Date);
        expect(d.pasos.map(p => p.estado)).toEqual(['ok', 'ok', 'ok']);
        expect(d.detalle.cambiadas.map(o => o.slug)).toEqual(['maipu-40']);
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('publicada');

        const n = gh.llamadas.length;
        await pub.detallePublicacion(r.id, op(gh, { fetchImpl: conSitio(gh, 'x') }));
        expect(gh.llamadas.length).toBe(n);
    });

    test('build.txt que no es un SHA → no en línea y SIN preguntar a compare; compilación que falló → «no llegó»', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        gh.corrida({ id: 9, run_number: 3, head_sha: r.commit_sha, status: 'completed', conclusion: 'failure', path: '.github/workflows/deploy.yml' });
        const d = await pub.detallePublicacion(r.id, op(gh, { fetchImpl: conSitio(gh, '<html>error</html>') }));
        expect(d).toMatchObject({ build_estado: 'fallo', en_linea_at: null });
        expect(d.pasos[2].estado).toBe('no_llego');
        expect(gh.cuenta('GET', /^\/compare\//)).toBe(0);
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('no_llego');
        const pend = await pub.pendientes();
        expect(pend.ultimaConError).toMatchObject({ id: r.id, build_estado: 'fallo' });
    });

    test('previa: obras nuevas, cambiadas, retiradas, archivos y avisos, sin GitHub', async () => {
        await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(repoDeHoy()) }, env: {} });
        nuevaPortada('toesca-2770');
        obra('esperanza-27').incluir = false;
        obra('gorbea-3082').comuna = null;
        const v = await pub.previa({ env: {}, fetchImpl: fetchProhibido });
        expect(v.hay_cambios).toBe(true);
        expect(v.cambios.cambiadas.map(o => o.slug)).toEqual(['toesca-2770']);
        expect(v.cambios.retiradas.map(o => o.slug)).toEqual(['esperanza-27']);
        expect(v.cambios.mantienen.map(o => o.slug)).toEqual(['gorbea-3082']);
        expect(v.archivos.borrar).toEqual(['public/proyectos/esperanza-27/1.jpg', 'public/proyectos/toesca-2770/1.jpg', 'src/content/obras/esperanza-27.json']);
        expect(v.archivos.escribir).toHaveLength(3);
        expect(fetchProhibido).not.toHaveBeenCalled();
    });

    test('pendientes: fotos por aprobar y obras con algo por publicar', async () => {
        await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(repoDeHoy()) }, env: {} });
        const f = fotoBoveda(obra('maipu-40'));
        Object.assign(f, { aprobada_at: null, aprobada_hash: null });
        obra('esperanza-27').incluir = false;
        obra('alameda-2740').titular = 'Otro';
        expect(await pub.pendientes()).toEqual({ fotosPorAprobar: 1, obrasConCambios: 2, ultimaConError: null });
    });
});

/* ═══════════════════════ revisión: nada se pierde ni vuelve sin querer ═══════════════════════ */

let sharpReal = null;
try { sharpReal = require('sharp'); } catch { /* sin sharp: se salta el de la foto real */ }

/** Una obra «a mano» en el repo (como las de Marcos): en construcción, con la foto que se le pase. */
const jsonAMano = (slug, src = `/proyectos/${slug}/1.jpg`) => `${JSON.stringify({
    slug, orden: 99, estado: 'en-curso', nombre: `Obra a mano ${slug}`, titular: null, tipo: null, mandante: null, comuna: 'Santiago',
    direccion: null, superficieM2: null, anio: null, inicio: null, servicios: ['construccion'], desafio: null, solucion: null,
    resultado: null, fotos: [{ src, alt: 'Fachada de la obra' }],
}, null, 2)}\n`;

/** ZIP cuya entrada `nombre` se infla a `mb` MB pero DECLARA `declara` bytes (local y central). */
async function zipQueMiente(archivos, nombre, mb, declara = 100) {
    const z = new JSZip();
    for (const [r, c] of Object.entries(archivos)) z.file(`lols.cl-main/${r}`, c);
    z.file(`lols.cl-main/${nombre}`, Buffer.alloc(mb * 1024 * 1024));
    const buf = await z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
    const n = Buffer.from(`lols.cl-main/${nombre}`);
    for (let i = 0; i < buf.length - 4; i++) {
        const sig = buf.readUInt32LE(i);
        if (sig === 0x04034b50 && buf.slice(i + 30, i + 30 + n.length).equals(n)) buf.writeUInt32LE(declara, i + 22);
        if (sig === 0x02014b50 && buf.slice(i + 46, i + 46 + n.length).equals(n)) buf.writeUInt32LE(declara, i + 24);
    }
    const p = path.join(TMP, `${crypto.randomUUID()}.bin`);
    fs.writeFileSync(p, buf);
    return p;
}

describe('revisión: el rechazo sobrevive, importar y resincronizar no borran lo ajeno', () => {
    test('rechazar la portada publicada y querer BORRARLA → 409; publicar igual la saca del sitio', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const o = obra('union-americana-325');
        const f = fotosDe(o)[0];
        await fotosSvc.rechazarFoto(f.id, 5);
        await expect(fotosSvc.borrarFoto(f.id, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_RECHAZADA_QUEDA' });
        expect(fotosDe(o)).toHaveLength(1);
        expect((await sitio.listarObras()).find(x => x.slug === 'union-americana-325').estadoDerivado).toBe('retiro_pendiente');
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(r.cambios.retiradas.map(x => x.slug)).toEqual(['union-americana-325']);
        expect(gh.archivos().has('public/proyectos/union-americana-325/1.jpg')).toBe(false);
        expect(gh.archivos().has('src/content/obras/union-americana-325.json')).toBe(false);
    });

    test('la portada vigente y publicada tampoco se borra (409): borrarla la dejaría en el sitio', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const nueva = nuevaPortada('toesca-2770');
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('ok');
        await expect(fotosSvc.borrarFoto(nueva.id, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_PUBLICADA' });
        // La heredada de otra obra, igual.
        const heredada = fotosDe(obra('esperanza-27'))[0];
        await expect(fotosSvc.borrarFoto(heredada.id, 5)).rejects.toMatchObject({ code: 'SITIO_WEB_FOTO_PUBLICADA' });
    });

    test('una publicación real que quedó a medias: importar la concilia primero y no deja borrar lo que llegó a mano', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        db.fallarEn(/^UPDATE sitio_publicaciones SET estado = 'ok'/, new Error('se cortó la conexión'));
        const p1 = await pub.publicar({ userId: 5, ...op(gh) });
        expect(p1.estado).toBe('en_curso');
        gh.empujar({ 'src/content/obras/obra-a-mano.json': jsonAMano('obra-a-mano'), 'public/proyectos/obra-a-mano/1.jpg': jpg('obra-a-mano') });

        // En simulación (sin GitHub) no se puede confirmar: no importa nada.
        await expect(pub.importar({ userId: 5, archivo: { path: await zipDelRepo(repoDeHoy()) }, env: {} }))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_YA_PUBLICADO' });
        // Con GitHub: la concilia (su commit entró) y entonces ya hubo una publicación real → 409, sin importar.
        await expect(pub.importar({ userId: 5, ...op(gh) })).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_YA_PUBLICADO' });
        expect(pubs().find(p => p.id === p1.id).estado).toBe('ok');
        expect(obra('obra-a-mano')).toBeUndefined();

        // El camino es resincronizar: la obra a mano queda IMPORTADA (no retirada) y publicar no borra nada.
        expect((await pub.publicar({ userId: 5, ...op(gh) })).error_codigo).toBe('SITIO_WEB_REPO_MODIFICADO');
        const rs = await pub.resincronizar({ userId: 5, ...op(gh) });
        expect(rs.importadas.map(x => x.slug)).toEqual(['obra-a-mano']);
        expect(rs.avisos.join(' ')).toMatch(/agregaron a mano/);
        expect(fotosDe(obra('obra-a-mano'))).toHaveLength(1);
        const v = await pub.previa(op(gh));
        expect(v.archivos.borrar).toEqual([]);
        expect(v.cambios.retiradas).toEqual([]);
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('sin_cambios');
        expect(gh.archivos().has('src/content/obras/obra-a-mano.json')).toBe(true);
        expect(gh.archivos().has('public/proyectos/obra-a-mano/1.jpg')).toBe(true);
    });

    test('una huérfana más vieja que la última importación se confirma SIN aplicarse contra esa base', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const base = pubs().at(-1);
        db.tablas.sitio_publicaciones.push({ id: base.id - 1, usuario_id: 5, modo: 'publicar', repo: REPO, rama: 'main', estado: 'en_curso',
            commit_sha: gh.ref, manifiesto_previsto: '{}', obras_json: '{}', created_at: new Date() });
        const antes = JSON.stringify(db.tablas.sitio_obras);
        const fotos = db.tablas.sitio_obra_fotos.length;
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.conciliadas).toEqual([{ id: base.id - 1, estado: 'ok' }]);
        expect(r.estado).toBe('sin_cambios');
        expect(JSON.stringify(db.tablas.sitio_obras.map(({ updated_at: _u, ...x }) => x)))
            .toBe(JSON.stringify(JSON.parse(antes).map(({ updated_at: _u, ...x }) => x)));
        expect(db.tablas.sitio_obra_fotos).toHaveLength(fotos);
    });

    test('segunda importación con una obra nueva y otra tocada a mano: por la API → REPO_MODIFICADO; desde un ZIP → suma solo la nueva', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const maipuEnBase = pubs().at(-1).manifiesto;
        gh.empujar({
            'src/content/obras/maipu-40.json': FIXTURES['maipu-40'].replace('"comuna": "Santiago"', '"comuna": "Providencia"'),
            'src/content/obras/obra-a-mano.json': jsonAMano('obra-a-mano'), 'public/proyectos/obra-a-mano/1.jpg': jpg('obra-a-mano'),
        });
        const e = await pub.importar({ userId: 5, ...op(gh) }).catch(x => x);
        expect(e).toMatchObject({ statusCode: 409, code: 'SITIO_WEB_REPO_MODIFICADO' });
        expect(e.details.rutas).toEqual(['src/content/obras/maipu-40.json']);
        expect(obra('obra-a-mano')).toBeUndefined();
        // Publicar sigue protegido (la base no se reemplazó).
        expect((await pub.publicar({ userId: 5, ...op(gh) })).error_codigo).toBe('SITIO_WEB_REPO_MODIFICADO');

        // Simulación: desde ZIP, la base de las que ya estaban queda como estaba y se avisa.
        db.reiniciar();
        await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(repoDeHoy()) }, env: {} });
        const archivos = {
            ...repoDeHoy(),
            'src/content/obras/maipu-40.json': FIXTURES['maipu-40'].replace('"comuna": "Santiago"', '"comuna": "Providencia"'),
            'src/content/obras/obra-a-mano.json': jsonAMano('obra-a-mano'), 'public/proyectos/obra-a-mano/1.jpg': jpg('obra-a-mano'),
        };
        const r = await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(archivos) }, env: {} });
        expect(r.importadas.map(x => x.slug)).toEqual(['obra-a-mano']);
        expect(r.avisos.join(' ')).toMatch(/no coincide con lo importado antes en 1 archivo/);
        const m = JSON.parse(pubs().at(-1).manifiesto);
        expect(m['src/content/obras/maipu-40.json']).toBe(JSON.parse(maipuEnBase)['src/content/obras/maipu-40.json']);
        expect(m['src/content/obras/obra-a-mano.json']).toBe(gitBlobSha(Buffer.from(jsonAMano('obra-a-mano'))));
        expect(m).toHaveProperty(['public/proyectos/obra-a-mano/1.jpg']);
    });

    test('resincronizar con una obra a mano en una carpeta de «Han confiado» (claudio-gay-2970): se importa y su 1.jpg nunca se borra', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('ok');
        gh.empujar({ 'src/content/obras/claudio-gay-2970.json': jsonAMano('claudio-gay-2970') });
        expect((await pub.publicar({ userId: 5, ...op(gh) })).error_codigo).toBe('SITIO_WEB_REPO_MODIFICADO');
        await expect(pub.importar({ userId: 5, ...op(gh) })).rejects.toMatchObject({ code: 'SITIO_WEB_YA_PUBLICADO' });

        const rs = await pub.resincronizar({ userId: 5, ...op(gh) });
        expect(rs.importadas.map(x => x.slug)).toEqual(['claudio-gay-2970']);
        expect(JSON.parse(pubs().at(-1).manifiesto)).not.toHaveProperty(['public/proyectos/claudio-gay-2970/1.jpg']);
        expect((await pub.previa(op(gh))).archivos.borrar).toEqual([]);
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('sin_cambios');

        // Ni retirándola: se va su JSON, el 1.jpg del carrusel queda.
        obra('claudio-gay-2970').incluir = false;
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(gh.archivos().has('src/content/obras/claudio-gay-2970.json')).toBe(false);
        expect(gh.archivos().has('public/proyectos/claudio-gay-2970/1.jpg')).toBe(true);
    });

    (sharpReal ? test : test.skip)('retirar una obra importada NO pierde su foto: queda como portada de la Bóveda por aprobar', async () => {
        // 640 px: como 9 de las 25 fotos de hoy, más angosta que el mínimo de una subida (ya estaba publicada: se guarda igual).
        const real = await sharpReal({ create: { width: 640, height: 480, channels: 3, background: '#58a' } }).jpeg().toBuffer();
        const gh = nuevoGithub({ ...repoDeHoy(), 'public/proyectos/esperanza-27/1.jpg': real });
        await pub.importar({ userId: 5, ...op(gh) });
        const o = obra('esperanza-27');
        const heredada = { ...fotosDe(o)[0] };
        o.incluir = false;
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r.estado).toBe('ok');
        expect(gh.archivos().has('public/proyectos/esperanza-27/1.jpg')).toBe(false);
        const [f] = fotosDe(o);
        expect(f).toMatchObject({ id: heredada.id, heredada_src: null, aprobada_at: null, aprobada_hash: null, ancho: 640, alto: 480 });
        expect(f.hash).not.toBe(heredada.hash);
        for (const suf of ['-maestra.jpg', '-800.webp', '-1600.webp']) expect(fs.existsSync(path.join(UPLOADS, `${f.ruta}${suf}`))).toBe(true);
        expect(fs.existsSync(path.join(UPLOADS, `${heredada.ruta}-maestra.jpg`))).toBe(false);
        // Vuelve: se aprueba otra vez y sale como portada.<hash8> (la Bóveda nunca escribe 1.jpg).
        o.incluir = true;
        Object.assign(f, { aprobada_por: 5, aprobada_at: new Date(Date.now() + 120000), aprobada_hash: f.hash });
        const r2 = await pub.publicar({ userId: 5, ...op(gh) });
        expect(r2.estado).toBe('ok');
        const json = JSON.parse(gh.archivos().get('src/content/obras/esperanza-27.json').toString('utf8'));
        expect(json.fotos[0].src).toBe(`/proyectos/esperanza-27/portada.${f.hash.slice(0, 8)}-1600.webp`);
    });

    test('portada nueva aprobada (la obra sigue en el sitio): el 1.jpg heredado y su fila sí se van', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        const o = obra('toesca-2770');
        const heredada = fotosDe(o)[0];
        fotoBoveda(o);   // la nueva, aprobada; la heredada sigue en la tabla hasta publicar
        expect((await pub.publicar({ userId: 5, ...op(gh) })).estado).toBe('ok');
        expect(fotosDe(o).some(f => f.id === heredada.id)).toBe(false);
        expect(fs.existsSync(path.join(UPLOADS, `${heredada.ruta}-maestra.jpg`))).toBe(false);
    });
});

describe('revisión: ZIP de un clon de Windows y ZIP armado para colgar el servidor', () => {
    test('JSON con CRLF (core.autocrlf=true): se importan como LF (lo que guarda git), sin avisos y simular = sin_cambios', async () => {
        const crlf = Object.fromEntries(Object.entries(repoDeHoy()).map(([r, c]) => [r, r.endsWith('.json') ? String(c).replace(/\n/g, '\r\n') : c]));
        const r = await pub.importar({ userId: 5, archivo: { path: await zipDelRepo(crlf) }, env: {} });
        expect(r.importadas).toHaveLength(27);
        expect(r.avisos.filter(a => /formato de la Bóveda/.test(a))).toEqual([]);
        expect(obra('maipu-40').publicado_json).toBe(FIXTURES['maipu-40']);
        expect(JSON.parse(pubs().at(-1).manifiesto)['src/content/obras/maipu-40.json']).toBe(gitBlobSha(Buffer.from(FIXTURES['maipu-40'])));
        expect((await pub.publicar({ userId: 5, env: {} })).estado).toBe('sin_cambios');
    });

    test('una entrada que nadie nombra no se descomprime (aunque mienta su tamaño); una foto nombrada que miente se corta en 10 MB', async () => {
        // Qué entradas se descomprimen y cuánto se llega a leer de cada una (sin medir tiempos: la suite corre en paralelo).
        const protoEntrada = Object.getPrototypeOf(new JSZip().file('a', 'b').file('a'));
        const original = protoEntrada.internalStream;
        const leidas = new Map();
        const espia = jest.spyOn(protoEntrada, 'internalStream').mockImplementation(function espiar(tipo) {
            const s = original.call(this, tipo);
            const nombre = this.name;
            leidas.set(nombre, leidas.get(nombre) || 0);
            s.on('data', (c) => { leidas.set(nombre, leidas.get(nombre) + c.length); });
            return s;
        });
        try {
            const una = { 'src/content/obras/esperanza-27.json': FIXTURES['esperanza-27'], 'public/proyectos/esperanza-27/1.jpg': jpg('esperanza-27') };
            const fuente = await pub._interno.fuenteZip(await zipQueMiente(una, 'public/proyectos/otra/enorme.bin', 100));
            expect([...fuente.rutas.keys()].sort()).toEqual(['public/proyectos/esperanza-27/1.jpg', 'src/content/obras/esperanza-27.json']);
            expect([...leidas.keys()].some(n => n.endsWith('enorme.bin'))).toBe(false);   // ni se tocó

            leidas.clear();
            const nombrada = await zipQueMiente({ 'src/content/obras/union-americana-325.json': FIXTURES['union-americana-325'] }, 'public/proyectos/union-americana-325/1.jpg', 100);
            await expect(pub._interno.fuenteZip(nombrada))
                .rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_PAQUETE_INVALIDO', message: expect.stringMatching(/pasa de 10 MB/) });
            // Dice medir 100 bytes y se infla a 100 MB: se cortó apenas pasó los 10 MB (más un pedazo), no al final.
            const leidos = [...leidas].find(([n]) => n.endsWith('union-americana-325/1.jpg'))[1];
            expect(leidos).toBeGreaterThan(10 * 1024 * 1024);
            expect(leidos).toBeLessThan(40 * 1024 * 1024);
        } finally {
            espia.mockRestore();
        }
    }, 30000);   // arma ZIPs de 100 MB con DEFLATE: tarda 4–5 s y en paralelo pasa los 5 s por defecto

    test('un tamaño declarado de más → 400 sin descomprimir; un ZIP dañado (CRC) → 400', async () => {
        const grande = await zipQueMiente({ 'src/content/obras/esperanza-27.json': FIXTURES['esperanza-27'] }, 'public/proyectos/esperanza-27/1.jpg', 1, 11 * 1024 * 1024);
        await expect(pub._interno.fuenteZip(grande)).rejects.toMatchObject({ code: 'SITIO_WEB_PAQUETE_INVALIDO', message: expect.stringMatching(/pasa de 10 MB/) });
        const z = new JSZip();
        z.file('src/content/obras/maipu-40.json', FIXTURES['maipu-40']);
        const buf = await z.generateAsync({ type: 'nodebuffer', compression: 'STORE' });
        const i = buf.indexOf(Buffer.from('"slug"'));
        buf[i + 2] = 'X'.charCodeAt(0);   // un byte cambiado en los datos: el CRC ya no calza
        const p = path.join(TMP, `${crypto.randomUUID()}.bin`);
        fs.writeFileSync(p, buf);
        await expect(pub._interno.fuenteZip(p)).rejects.toMatchObject({ code: 'SITIO_WEB_PAQUETE_INVALIDO', message: expect.stringMatching(/dañado/) });
    });
});

describe('revisión: la compilación se pone al día sin abrir la publicación', () => {
    const conSitio = (gh, buildTxt) => async (url, o) => (String(url).startsWith('https://nuevo.lols.cl/')
        ? new Response(String(url).endsWith('/build.txt') ? buildTxt() : '2026-10-29 10:00:00 · OK · abc1234\n', { status: 200 })
        : gh.fetch(url, o));
    beforeEach(() => pub._interno.limpiarRefresco());

    test('falla → las listas lo muestran sin abrir el detalle; «Re-run» que sale bien → en línea gana y el aviso rojo se va', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        const corrida = { id: 9, run_number: 3, head_sha: r.commit_sha, status: 'completed', conclusion: 'failure', path: '.github/workflows/deploy.yml' };
        gh.corrida(corrida);
        let build = gh.commit(r.commit_sha).parents[0];   // el sitio sigue en la versión anterior
        const opciones = op(gh, { fetchImpl: conSitio(gh, () => `${build}\n`) });

        expect(await pub.refrescarCompilacion(opciones)).toMatchObject({ refrescada: true, cambio: true });
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('no_llego');
        expect((await pub.pendientes()).ultimaConError).toMatchObject({ id: r.id, build_estado: 'fallo' });
        // A los pocos segundos no vuelve a preguntar (a lo más cada 20 s por proceso).
        const n = gh.llamadas.length;
        expect(await pub.refrescarCompilacion(opciones)).toEqual({ refrescada: false });
        expect(gh.llamadas.length).toBe(n);

        // Re-run en GitHub: la misma corrida termina bien y el sitio ya muestra el commit.
        corrida.conclusion = 'success';
        build = r.commit_sha;
        pub._interno.limpiarRefresco();
        enLinea.limpiarCache();
        await pub.refrescarCompilacion(opciones);
        expect(pubs().find(p => p.id === r.id)).toMatchObject({ build_estado: 'ok' });
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('publicada');
        expect((await pub.pendientes()).ultimaConError).toBeNull();
        const d = await pub.detallePublicacion(r.id, opciones);
        expect(d.terminada).toBe(true);
    });

    test('«reemplazada» (otro push canceló su corrida) y la compilación del head nuevo falla → no llegó', async () => {
        const gh = nuevoGithub();
        await pub.importar({ userId: 5, ...op(gh) });
        obra('maipu-40').titular = 'Locales y oficinas';
        const r = await pub.publicar({ userId: 5, ...op(gh) });
        const deMarcos = gh.empujar({ 'src/pages/index.astro': '<Base nueva />' });
        gh.corrida({ id: 9, run_number: 3, head_sha: r.commit_sha, status: 'completed', conclusion: 'cancelled', path: '.github/workflows/deploy.yml' });
        const opciones = op(gh, { fetchImpl: conSitio(gh, () => `${gh.commit(r.commit_sha).parents[0]}\n`) });
        let d = await pub.detallePublicacion(r.id, opciones);
        expect(d).toMatchObject({ build_estado: 'reemplazada', terminada: false });
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('publicando');

        gh.corrida({ id: 10, run_number: 4, head_sha: deMarcos, status: 'completed', conclusion: 'failure', path: '.github/workflows/deploy.yml' });
        enLinea.limpiarCache();
        d = await pub.detallePublicacion(r.id, opciones);
        expect(d).toMatchObject({ build_estado: 'fallo', terminada: true });
        expect(d.pasos[2].estado).toBe('no_llego');
        expect((await sitio.listarObras()).find(o => o.slug === 'maipu-40').estadoDerivado).toBe('no_llego');
    });

    test('en simulación refrescar no toca la base ni la red', async () => {
        const antes = db.sentencias.length;
        expect(await pub.refrescarCompilacion({ env: {}, fetchImpl: fetchProhibido })).toEqual({ refrescada: false });
        expect(db.sentencias.length).toBe(antes);
        expect(fetchProhibido).not.toHaveBeenCalled();
    });
});

/* ═══════════════════════ rutas ═══════════════════════ */

describe('rutas — permisos y respuestas', () => {
    const app = require('../index');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const token = (p) => jwt.sign({ id: 5, email: 'ana@lols.cl', rol_id: 2, rv: 1, p }, SECRET);
    const VER = token(['sitio_web.ver']);
    const EDITAR = token(['sitio_web.editar']);
    const PUBLICAR = token(['sitio_web.publicar']);
    const guardado = {};
    beforeAll(() => {
        for (const k of Object.keys(ENV)) { guardado[k] = process.env[k]; delete process.env[k]; }
    });
    afterAll(() => {
        for (const [k, v] of Object.entries(guardado)) if (v !== undefined) process.env[k] = v;
    });
    const contratada = () => db.tablas.sitio_obras.push(obraContratada(990600));

    test('publicar pide sitio_web.publicar; editar no alcanza (403)', async () => {
        const r = await request(app).post('/api/sitio-web/publicar').set('Authorization', `Bearer ${EDITAR}`).send({ confirmo_revision: true });
        expect(r.status).toBe(403);
        for (const ruta of ['/api/sitio-web/pendientes', '/api/sitio-web/publicacion/previa']) {
            expect((await request(app).get(ruta).set('Authorization', `Bearer ${EDITAR}`)).status).toBe(403);
        }
        expect((await request(app).post('/api/sitio-web/publicaciones/importar').set('Authorization', `Bearer ${EDITAR}`)).status).toBe(403);
        expect((await request(app).post('/api/sitio-web/publicaciones/resincronizar').set('Authorization', `Bearer ${VER}`).send({ confirmo: true })).status).toBe(403);
    });

    test('sin «Revisé los textos y las fotos» → 400; texto en vez de booleano → 400', async () => {
        const r = await request(app).post('/api/sitio-web/publicar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo_revision: false });
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('SITIO_WEB_SIN_REVISION');
        expect((await request(app).post('/api/sitio-web/publicar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo_revision: 'true' })).status).toBe(400);
    });

    test('publicar en simulación: 200 con el resultado, ZIP descargable, historial general y sin red', async () => {
        const globalFetch = jest.spyOn(globalThis, 'fetch');
        contratada();
        const r = await request(app).post('/api/sitio-web/publicar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo_revision: true });
        expect(r.status).toBe(200);
        expect(r.body.data).toMatchObject({ modo: 'simulacion', estado: 'simulada', paquete: true, archivos: { escribir: 1, borrar: 0 } });
        expect(logManualActivity).toHaveBeenCalledWith(5, 'sitio_web', 'UPDATE', r.body.data.id, expect.any(String), expect.anything(), expect.anything());
        const z = await request(app).get(`/api/sitio-web/publicaciones/${r.body.data.id}/paquete`).set('Authorization', `Bearer ${PUBLICAR}`)
            .buffer(true).parse((res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); });
        expect(z.status).toBe(200);
        expect(z.headers['content-disposition']).toMatch(/attachment; filename="lols-cl-simulacion-\d+\.zip"/);
        expect(z.body.slice(0, 2).toString()).toBe('PK');
        expect(globalFetch).not.toHaveBeenCalled();
        globalFetch.mockRestore();

        const l = await request(app).get('/api/sitio-web/publicaciones').set('Authorization', `Bearer ${VER}`);
        expect(l.status).toBe(200);
        expect(l.body.data[0]).toMatchObject({ id: r.body.data.id, estado: 'simulada', usuario_nombre: 'Ana Pérez', tiene_paquete: true });
        const d = await request(app).get(`/api/sitio-web/publicaciones/${r.body.data.id}`).set('Authorization', `Bearer ${VER}`);
        expect(d.status).toBe(200);
        expect(d.body.data).toMatchObject({ estado: 'simulada', pasos: [], terminada: true });
        expect(d.body.data).not.toHaveProperty('manifiesto');
    });

    test('paquete de algo que no es una simulación → 404; publicación inexistente → 404', async () => {
        db.tablas.sitio_publicaciones.push({ id: 990700, usuario_id: 5, modo: 'publicar', repo: REPO, rama: 'main', estado: 'ok' });
        expect((await request(app).get('/api/sitio-web/publicaciones/990700/paquete').set('Authorization', `Bearer ${PUBLICAR}`)).status).toBe(404);
        expect((await request(app).get('/api/sitio-web/publicaciones/1/paquete').set('Authorization', `Bearer ${PUBLICAR}`)).status).toBe(404);
        expect((await request(app).get('/api/sitio-web/publicaciones/abc').set('Authorization', `Bearer ${VER}`)).status).toBe(404);
    });

    test('lock ocupado → 409 con code; importar sin ZIP en simulación → 400; resincronizar en simulación → 409', async () => {
        db.ocuparLock();
        const r = await request(app).post('/api/sitio-web/publicar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo_revision: true });
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_PUBLICACION_EN_CURSO');
        db.reiniciar();
        const i = await request(app).post('/api/sitio-web/publicaciones/importar').set('Authorization', `Bearer ${PUBLICAR}`);
        expect(i.status).toBe(400);
        expect(i.body.code).toBe('SITIO_WEB_SIN_PAQUETE');
        const s = await request(app).post('/api/sitio-web/publicaciones/resincronizar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo: true });
        expect(s.status).toBe(409);
        expect(s.body.code).toBe('SITIO_WEB_SOLO_PUBLICAR');
        const s2 = await request(app).post('/api/sitio-web/publicaciones/resincronizar').set('Authorization', `Bearer ${PUBLICAR}`).send({ confirmo: false });
        expect(s2.status).toBe(400);
    });

    test('importar con un ZIP por la ruta (simulación) y pendientes para el badge', async () => {
        const zip = fs.readFileSync(await zipDelRepo(repoDeHoy()));
        const r = await request(app).post('/api/sitio-web/publicaciones/importar').set('Authorization', `Bearer ${PUBLICAR}`)
            .attach('paquete', zip, { filename: 'lols.cl-main.zip', contentType: 'application/zip' });
        expect(r.status).toBe(200);
        expect(r.body.data.importadas).toHaveLength(27);
        const p = await request(app).get('/api/sitio-web/pendientes').set('Authorization', `Bearer ${PUBLICAR}`);
        expect(p.status).toBe(200);
        expect(p.body.data).toEqual({ fotosPorAprobar: 0, obrasConCambios: 0, ultimaConError: null });
        const v = await request(app).get('/api/sitio-web/publicacion/previa').set('Authorization', `Bearer ${PUBLICAR}`);
        expect(v.status).toBe(200);
        expect(v.body.data).toMatchObject({ modo: 'simulacion', hay_cambios: false });
    });
});

/**
 * Sitio web — portadas (mig 147, plan 4.6): «nadie reconocible» con dos llaves atadas a los bytes.
 *
 *   · con sharp REAL: una foto con EXIF (orientación + GPS) y XMP sale sin exif/xmp/iptc en la maestra y en las
 *     dos WebP, con la orientación aplicada; SVG, TIFF, PDF o una foto chica → 400;
 *   · sin la confirmación «no se reconoce a nadie» la subida no entra (400) y el .bin se borra igual;
 *   · aprobar sin confirmación → 409; la MISMA persona que subió puede aprobar (D4, 28-10); si los bytes del
 *     disco no son los del hash → 409; aprobar reemplaza la portada anterior y apaga la imagen referencial;
 *   · cambiar la confirmación anula la aprobación; una foto rechazada o con hash ≠ aprobada_hash no se publica.
 *
 * BD simulada; los archivos van a uploads/sitio-web/<id de prueba>/ y se borran al terminar.
 */
jest.mock('../src/config/db', () => ({ query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn() }));
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
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const svc = require('../src/services/sitioWeb.service');
const fotos = require('../src/services/sitioWebFotos.service');
const upload = require('../src/middleware/upload-sitio-web');

let sharp = null;
try { sharp = require('sharp'); } catch { /* sin sharp en este entorno: se saltan los de imagen real */ }
const conSharp = sharp ? describe : describe.skip;

const OBRA_ID = 999001;   // carpeta de prueba en uploads/sitio-web/, se borra al final
const UPLOADS = svc._h.UPLOADS_DIR;
const DIR_OBRA = path.join(UPLOADS, 'sitio-web', String(OBRA_ID));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sitio-web-test-'));

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const obra = (o = {}) => ({ id: OBRA_ID, slug: 'bodegas-norte', nombre: 'Bodegas Norte', estado: 'en_construccion', updated_at: new Date(), ...o });
const sinMeta = (m) => m.exif === undefined && m.xmp === undefined && m.iptc === undefined;

/** Un .bin como el que deja multer en tmp/. */
const binCon = (buffer) => {
    const p = path.join(TMP, `${crypto.randomUUID()}.bin`);
    fs.writeFileSync(p, buffer);
    return { path: p, size: buffer.length, mimetype: 'image/jpeg' };
};

/** JPEG sintético de `w`×`h` con EXIF (orientación 6 = girar 90°, autor, GPS) y XMP con un nombre. */
async function jpegConMetadatos(w = 3000, h = 2000) {
    const base = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 180, g: 40, b: 40 } } }).jpeg().toBuffer();
    return sharp(base)
        .withMetadata({ orientation: 6 })
        .withExif({ IFD0: { Artist: 'Juan Pérez', Copyright: 'Juan Pérez' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '33/1 26/1 0/1' } })
        .withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
            + '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>Juan Pérez</dc:creator>'
            + '</rdf:Description></rdf:RDF></x:xmpmeta>')
        .jpeg()
        .toBuffer();
}

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.query.mockResolvedValue([[]]);
});
afterAll(() => {
    fs.rmSync(DIR_OBRA, { recursive: true, force: true });
    fs.rmSync(TMP, { recursive: true, force: true });
});

conSharp('procesarImagen — sharp real', () => {
    test('una foto con EXIF/GPS/XMP sale sin metadatos, con la orientación aplicada y en tres tamaños', async () => {
        const entrada = await jpegConMetadatos(3000, 2000);
        const m0 = await sharp(entrada).metadata();
        expect(m0.exif).toBeDefined();
        expect(m0.xmp).toBeDefined();
        expect(m0.orientation).toBe(6);

        const img = await fotos.procesarImagen(entrada);
        // Girada: 3000×2000 con orientación 6 se ve vertical → 2000×3000 → la maestra cabe en 2400.
        expect([img.maestra.info.width, img.maestra.info.height]).toEqual([1600, 2400]);
        expect([img.v1600.info.width, img.v1600.info.height]).toEqual([1600, 2400]);
        expect([img.v800.info.width, img.v800.info.height]).toEqual([800, 1200]);
        for (const salida of [img.maestra, img.v800, img.v1600]) {
            const m = await sharp(salida.data).metadata();
            expect(sinMeta(m)).toBe(true);
            expect(m.orientation).toBeUndefined();
            expect(salida.data.includes(Buffer.from('Juan'))).toBe(false);
        }
        expect((await sharp(img.maestra.data).metadata()).format).toBe('jpeg');
        expect((await sharp(img.v800.data).metadata()).format).toBe('webp');
        expect(img.hash).toBe(sha(img.maestra.data));
    });

    test('PNG con transparencia: se aplana sobre blanco', async () => {
        const png = await sharp({ create: { width: 1000, height: 600, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
        const img = await fotos.procesarImagen(png);
        const { data } = await sharp(img.maestra.data).raw().toBuffer({ resolveWithObject: true });
        expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
    });

    test('SVG, TIFF, PDF o basura → 400 SITIO_WEB_FOTO_FORMATO', async () => {
        const tiff = await sharp({ create: { width: 900, height: 900, channels: 3, background: '#888' } }).tiff().toBuffer();
        const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><rect width="900" height="900"/></svg>');
        const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
        for (const b of [tiff, svg, pdf, Buffer.from('no es una foto'), Buffer.alloc(0)]) {
            await expect(fotos.procesarImagen(b)).rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_FOTO_FORMATO' });
        }
        // Una cabecera de JPEG con el resto roto tampoco pasa.
        await expect(fotos.procesarImagen(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)])))
            .rejects.toMatchObject({ statusCode: 400 });
    });

    test('menos de 800 px de ancho → 400 SITIO_WEB_FOTO_CHICA', async () => {
        const chica = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#357' } }).jpeg().toBuffer();
        await expect(fotos.procesarImagen(chica)).rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_FOTO_CHICA' });
    });
});

describe('subir la portada', () => {
    test('sin la confirmación (o sin descripción) → 400 y el .bin se borra igual, sin tocar la BD', async () => {
        for (const campos of [{ alt: 'Nave central desde el acceso' }, { sin_personas: 'false', alt: 'Nave central' }, { sin_personas: 'true' }]) {
            const file = binCon(Buffer.from('lo que sea'));
            await expect(fotos.subirPortada(OBRA_ID, file, campos, 5)).rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_FOTO_SIN_CONFIRMAR' });
            expect(fs.existsSync(file.path)).toBe(false);
        }
        const corta = binCon(Buffer.from('x'));
        await expect(fotos.subirPortada(OBRA_ID, corta, { sin_personas: 'true', alt: 'Nave' }, 5)).rejects.toMatchObject({ code: 'SITIO_WEB_FOTO_ALT' });
        expect(fs.existsSync(corta.path)).toBe(false);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('una foto que no es foto → 400 y el .bin se borra', async () => {
        db.query.mockResolvedValueOnce([[obra()]]);
        const file = binCon(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'));
        await expect(fotos.subirPortada(OBRA_ID, file, { sin_personas: 'true', alt: 'Nave central desde el acceso' }, 5))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(fs.existsSync(file.path)).toBe(false);
    });

    (sharp ? test : test.skip)('con todo: guarda las tres versiones sin metadatos, una fila NUEVA sin aprobar y confirma quién subió', async () => {
        db.query.mockResolvedValueOnce([[obra()]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 50 }]).mockResolvedValueOnce([{}]);
        const file = binCon(await jpegConMetadatos(2400, 1600));
        const r = await fotos.subirPortada(OBRA_ID, file, { sin_personas: 'true', alt: '  Nave central desde el acceso  ' }, 5);
        // 2400×1600 con orientación 6 se ve vertical: 1600×2400.
        expect(r).toMatchObject({ id: 50, estado: 'por_aprobar', ancho: 1600, alto: 2400, alt: 'Nave central desde el acceso' });
        expect(fs.existsSync(file.path)).toBe(false);

        // Antes de escribir nada: ¿esa misma imagen ya fue rechazada (en cualquier obra)?
        expect(db.query.mock.calls[1][0]).toBe('SELECT id FROM sitio_obra_fotos WHERE hash = ? AND rechazada_at IS NOT NULL LIMIT 1');
        const [sql, params] = db.query.mock.calls[2];
        expect(sql).toMatch(/INSERT INTO sitio_obra_fotos/);
        const [obraId, alt, ruta, hash, ancho, , , subidoPor, confirmadoPor, confirmadoAt] = params;
        expect([obraId, alt, subidoPor, confirmadoPor]).toEqual([OBRA_ID, 'Nave central desde el acceso', 5, 5]);
        expect(ruta).toBe(`sitio-web/${OBRA_ID}/${hash}`);
        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(ancho).toBe(1600);
        expect(confirmadoAt).toBeInstanceOf(Date);
        expect(sql).not.toMatch(/aprobada/);   // nunca entra aprobada

        const maestra = fs.readFileSync(path.join(UPLOADS, `${ruta}-maestra.jpg`));
        expect(sha(maestra)).toBe(hash);

        for (const suf of ['-maestra.jpg', '-800.webp', '-1600.webp']) {
            // Desde un buffer: sharp con una RUTA deja el archivo abierto en su caché (en Windows no se puede borrar).
            expect(sinMeta(await sharp(fs.readFileSync(path.join(UPLOADS, `${ruta}${suf}`))).metadata())).toBe(true);
        }

        // La MISMA foto otra vez, ya rechazada: sharp es determinista (mismo hash) → 409 y no se escribe nada nuevo.
        for (const suf of ['-maestra.jpg', '-800.webp', '-1600.webp']) fs.rmSync(path.join(UPLOADS, `${ruta}${suf}`), { force: true });
        db.query.mockReset();
        db.query.mockResolvedValueOnce([[obra()]]).mockResolvedValueOnce([[{ id: 50 }]]);
        const otraVez = binCon(await jpegConMetadatos(2400, 1600));
        await expect(fotos.subirPortada(OBRA_ID, otraVez, { sin_personas: 'true', alt: 'Nave central desde el acceso' }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_RECHAZADA' });
        expect(db.query.mock.calls[1][1]).toEqual([hash]);
        expect(db.query).toHaveBeenCalledTimes(2);
        expect(fs.existsSync(path.join(UPLOADS, `${ruta}-maestra.jpg`))).toBe(false);
        expect(fs.existsSync(otraVez.path)).toBe(false);
    });
});

describe('aprobar, confirmar y rechazar', () => {
    let hash;
    let ruta;
    beforeAll(() => {
        const maestra = Buffer.from(`maestra de prueba ${Date.now()}`);
        hash = sha(maestra);
        ruta = `sitio-web/${OBRA_ID}/${hash}`;
        fs.mkdirSync(DIR_OBRA, { recursive: true });
        fs.writeFileSync(path.join(UPLOADS, `${ruta}-maestra.jpg`), maestra);
        fs.writeFileSync(path.join(UPLOADS, `${ruta}-800.webp`), 'w800');
        fs.writeFileSync(path.join(UPLOADS, `${ruta}-1600.webp`), 'w1600');
    });
    const fila = (o = {}) => ({
        id: 31, sitio_obra_id: OBRA_ID, rol: 'portada', alt: 'Nave central desde el acceso', ruta, hash, ancho: 1600, alto: 900,
        heredada_src: null, subido_por: 5, sin_personas_confirmado: true, confirmado_por: 5, confirmado_at: new Date('2026-10-29T10:00:00Z'),
        aprobada_por: null, aprobada_at: null, aprobada_hash: null, rechazada_at: null, obra_nombre: 'Bodegas Norte', obra_slug: 'bodegas-norte', ...o,
    });

    test('sin la confirmación «no se reconoce a nadie» → 409; rechazada → 409', async () => {
        db.query.mockResolvedValueOnce([[fila({ sin_personas_confirmado: false, confirmado_at: null })]]);
        await expect(fotos.aprobarFoto(31, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_SIN_CONFIRMAR' });
        db.query.mockResolvedValueOnce([[fila({ rechazada_at: new Date() })]]);
        await expect(fotos.aprobarFoto(31, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_RECHAZADA' });
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('la MISMA persona que subió aprueba (D4): ata el hash, apaga la referencial y reemplaza la portada anterior', async () => {
        const otraRuta = `sitio-web/${OBRA_ID}/${'e'.repeat(64)}`;
        fs.writeFileSync(path.join(UPLOADS, `${otraRuta}-maestra.jpg`), 'vieja');
        db.query
            .mockResolvedValueOnce([[fila()]])                              // la foto (subida por 5)
            .mockResolvedValueOnce([[]])                                    // esa imagen no fue rechazada
            .mockResolvedValueOnce([{ affectedRows: 1 }])                   // aprobar
            .mockResolvedValueOnce([{}])                                    // referencia = NULL
            .mockResolvedValueOnce([[{ id: 20, ruta: otraRuta }]])          // la portada anterior
            .mockResolvedValueOnce([{}])                                    // DELETE
            .mockResolvedValueOnce([[]])                                    // nadie más usa esa ruta
            .mockResolvedValueOnce([{}]);                                   // historial
        const r = await fotos.aprobarFoto(31, 5);
        expect(r).toMatchObject({ id: 31, estado: 'vigente', reemplazadas: [20] });
        const [sql, params] = db.query.mock.calls[2];
        expect(sql).toMatch(/SET aprobada_por = \?, aprobada_at = \?, aprobada_hash = hash/);
        expect(sql).toMatch(/WHERE id = \? AND hash = \? AND rechazada_at IS NULL AND sin_personas_confirmado = 1/);
        expect(params[0]).toBe(5);
        expect(params[3]).toBe(hash);
        expect(db.query.mock.calls[3][0]).toMatch(/UPDATE sitio_obras SET referencia = NULL, updated_at = updated_at/);
        expect(db.query.mock.calls[5]).toEqual(['DELETE FROM sitio_obra_fotos WHERE id IN (?)', [[20]]]);
        expect(fs.existsSync(path.join(UPLOADS, `${otraRuta}-maestra.jpg`))).toBe(false);
        expect(fs.existsSync(path.join(UPLOADS, `${ruta}-maestra.jpg`))).toBe(true);
    });

    test('si los bytes del disco ya no son los del hash → 409, sin aprobar', async () => {
        db.query.mockResolvedValueOnce([[fila({ hash: 'f'.repeat(64), ruta: `sitio-web/${OBRA_ID}/${'f'.repeat(64)}` })]]);
        await expect(fotos.aprobarFoto(31, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_ALTERADA' });
        expect(db.query).toHaveBeenCalledTimes(2);   // la foto y la revisión del hash rechazado; ningún UPDATE
    });

    test('cambiar la confirmación ANULA la aprobación (quitarla y volver a darla)', async () => {
        const aprobada = { aprobada_por: 2, aprobada_at: new Date('2026-10-29T11:00:00Z'), aprobada_hash: hash };
        db.query.mockResolvedValueOnce([[fila(aprobada)]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await fotos.editarFoto(31, { sin_personas_confirmado: false }, 7)).toEqual({ id: 31, aprobacion_anulada: true });
        let [sql, params] = db.query.mock.calls[1];
        expect(sql).toBe('UPDATE sitio_obra_fotos SET sin_personas_confirmado = ?, confirmado_por = ?, confirmado_at = ?, aprobada_por = ?, aprobada_at = ?, aprobada_hash = ? WHERE id = ?');
        expect(params).toEqual([false, null, null, null, null, null, 31]);

        db.query.mockReset();
        db.query.mockResolvedValueOnce([[fila({ ...aprobada, sin_personas_confirmado: false, confirmado_at: null })]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        await fotos.editarFoto(31, { sin_personas_confirmado: true }, 7);
        [sql, params] = db.query.mock.calls[1];
        expect(params.slice(0, 2)).toEqual([true, 7]);
        expect(params.slice(3, 6)).toEqual([null, null, null]);
    });

    test('cambiar solo la descripción no toca la aprobación', async () => {
        db.query.mockResolvedValueOnce([[fila({ aprobada_at: new Date(), aprobada_hash: hash })]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        await fotos.editarFoto(31, { alt: 'Nave central vista desde el patio' }, 7);
        expect(db.query.mock.calls[1]).toEqual(['UPDATE sitio_obra_fotos SET alt = ? WHERE id = ?', ['Nave central vista desde el patio', 31]]);
    });

    test('rechazar: anula la aprobación para siempre; la foto deja de ser publicable', async () => {
        const aprobada = fila({ aprobada_por: 2, aprobada_at: new Date('2026-10-29T11:00:00Z'), aprobada_hash: hash });
        expect(svc.fotoPublicable(aprobada)).toBe(true);
        db.query.mockResolvedValueOnce([[aprobada]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await fotos.rechazarFoto(31, 2)).toMatchObject({ id: 31, estado: 'rechazada', estaba_aprobada: true });
        expect(db.query.mock.calls[1][0]).toMatch(/SET rechazada_por = \?, rechazada_at = \?, aprobada_por = NULL, aprobada_at = NULL, aprobada_hash = NULL/);
    });

    test('el rechazo es de la IMAGEN: otra fila con el mismo hash ya rechazado no se aprueba (409)', async () => {
        db.query.mockResolvedValueOnce([[fila({ id: 32 })]]).mockResolvedValueOnce([[{ id: 31 }]]);
        await expect(fotos.aprobarFoto(32, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_RECHAZADA' });
        expect(db.query.mock.calls[1]).toEqual(['SELECT id FROM sitio_obra_fotos WHERE hash = ? AND rechazada_at IS NOT NULL LIMIT 1', [hash]]);
        expect(db.query).toHaveBeenCalledTimes(2);   // nada se aprobó
    });

    test('borrar: una rechazada NUNCA (el rechazo tiene que sobrevivir); una que el sitio muestra, tampoco; las demás sí', async () => {
        db.query.mockResolvedValueOnce([[fila({ rechazada_at: new Date() })]]);
        await expect(fotos.borrarFoto(31, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_RECHAZADA_QUEDA' });
        expect(db.query).toHaveBeenCalledTimes(1);

        // La portada vigente que ya está publicada (su hash8 en publicado_json): borrarla no la sacaría del sitio.
        const publicado = JSON.stringify({ slug: 'bodegas-norte', fotos: [{ src: `/proyectos/bodegas-norte/portada.${hash.slice(0, 8)}-1600.webp`, alt: 'x' }] });
        db.query.mockReset();
        db.query.mockResolvedValueOnce([[fila({ aprobada_at: new Date(), aprobada_hash: hash })]]).mockResolvedValueOnce([[{ publicado_json: publicado }]]);
        await expect(fotos.borrarFoto(31, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FOTO_PUBLICADA' });
        expect(db.query.mock.calls.some(c => /^DELETE/.test(c[0]))).toBe(false);
        // La heredada publicada (por su src), igual.
        db.query.mockReset();
        db.query.mockResolvedValueOnce([[fila({ heredada_src: '/proyectos/bodegas-norte/1.jpg' })]])
            .mockResolvedValueOnce([[{ publicado_json: JSON.stringify({ fotos: [{ src: '/proyectos/bodegas-norte/1.jpg', alt: 'x' }] }) }]]);
        await expect(fotos.borrarFoto(31, 5)).rejects.toMatchObject({ code: 'SITIO_WEB_FOTO_PUBLICADA' });

        // Una por aprobar (el sitio muestra otra) sí se borra.
        db.query.mockReset();
        db.query.mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[fila({ id: 33, ruta: `sitio-web/${OBRA_ID}/${'d'.repeat(64)}` })]]).mockResolvedValueOnce([[{ publicado_json: publicado.replace(hash.slice(0, 8), '0badc0de') }]]);
        expect(await fotos.borrarFoto(33, 5)).toEqual({ id: 33 });
        expect(db.query.mock.calls[2]).toEqual(['DELETE FROM sitio_obra_fotos WHERE id = ?', [33]]);
    });

    test('lo que no se publica: hash ≠ aprobada_hash, rechazada o sin confirmar → la obra queda sin portada', () => {
        const o = { slug: 'bodegas-norte', nombre: 'Bodegas Norte', estado: 'en_construccion', comuna: 'Renca', servicios: 'construccion', orden: 10 };
        const base = { ...fila(), aprobada_at: new Date('2026-10-29T11:00:00Z'), aprobada_hash: hash };
        for (const f of [{ ...base, aprobada_hash: 'f'.repeat(64) }, { ...base, rechazada_at: new Date() }, { ...base, sin_personas_confirmado: false }]) {
            const vigente = svc.fotoVigente([f]);
            expect(vigente).toBeNull();
            expect(svc.serializarObra(o, vigente).fotos).toEqual([]);
            expect(svc.faltantes(o, vigente).map(x => x.campo)).toEqual(['portada']);
        }
        expect(svc.serializarObra(o, svc.fotoVigente([base])).fotos[0].src).toBe(`/proyectos/bodegas-norte/portada.${hash.slice(0, 8)}-1600.webp`);
    });

    test('archivo: sale de la ruta de la BD; la ruta rara o el archivo que falta → 404', async () => {
        db.query.mockResolvedValueOnce([[{ id: 31, ruta }]]);
        const r = await fotos.archivoFoto(31, '800');
        expect(path.join(r.root, r.rel)).toBe(path.join(UPLOADS, `${ruta}-800.webp`));
        db.query.mockResolvedValueOnce([[{ id: 31, ruta: `sitio-web/${OBRA_ID}/${'9'.repeat(64)}` }]]);
        await expect(fotos.archivoFoto(31, '1600')).rejects.toMatchObject({ statusCode: 404 });
        db.query.mockResolvedValueOnce([[{ id: 31, ruta: 'sitio-web/1/../../../.env' }]]);
        await expect(fotos.archivoFoto(31, 'maestra')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('ruta HTTP del archivo: 200 con la imagen y sin caché pública', async () => {
        const app = require('../index');
        const token = jwt.sign({ id: 5, email: 'ana@lols.cl', rol_id: 2, rv: 1, p: ['sitio_web.ver'] }, process.env.JWT_SECRET || 'secret');
        db.query.mockResolvedValueOnce([[{ id: 31, ruta }]]);
        const r = await request(app).get('/api/sitio-web/fotos/31/archivo?ancho=1600').set('Authorization', `Bearer ${token}`);
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toMatch(/image\/webp/);
        expect(r.headers['cache-control']).toMatch(/private/);
    });
});

describe('ruta de subida (multipart)', () => {
    const app = require('../index');
    const tk = (p) => jwt.sign({ id: 5, email: 'ana@lols.cl', rol_id: 2, rv: 1, p }, process.env.JWT_SECRET || 'secret');
    const enTmp = () => (fs.existsSync(upload.TMP_DIR) ? fs.readdirSync(upload.TMP_DIR) : []);

    test('sin sesión o sin editar no se guarda nada (auth y permiso van antes que multer)', async () => {
        const antes = enTmp().length;
        const sin = await request(app).post(`/api/sitio-web/obras/${OBRA_ID}/fotos`).attach('foto', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });
        expect(sin.status).toBe(401);
        const soloVer = await request(app).post(`/api/sitio-web/obras/${OBRA_ID}/fotos`).set('Authorization', `Bearer ${tk(['sitio_web.ver'])}`)
            .attach('foto', Buffer.from('x'), { filename: 'a.jpg', contentType: 'image/jpeg' });
        expect(soloVer.status).toBe(403);
        expect(enTmp().length).toBe(antes);
    });

    test('SVG, TIFF o PDF por tipo → 400 «Formato no permitido»', async () => {
        for (const [filename, contentType] of [['x.svg', 'image/svg+xml'], ['x.tif', 'image/tiff'], ['x.pdf', 'application/pdf']]) {
            const r = await request(app).post(`/api/sitio-web/obras/${OBRA_ID}/fotos`).set('Authorization', `Bearer ${tk(['sitio_web.editar'])}`)
                .field('sin_personas', 'true').field('alt', 'Nave central desde el acceso')
                .attach('foto', Buffer.from('<svg/>'), { filename, contentType });
            expect(r.status).toBe(400);
            expect(r.body.error).toMatch(/Formato no permitido/);
        }
    });

    (sharp ? test : test.skip)('con todo: 201 con la foto por aprobar y el .bin de tmp/ borrado', async () => {
        db.query.mockResolvedValueOnce([[obra()]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ insertId: 51 }]).mockResolvedValueOnce([{}]);
        const antes = enTmp().length;
        const jpg = await sharp({ create: { width: 1000, height: 700, channels: 3, background: '#468' } }).jpeg().toBuffer();
        const r = await request(app).post(`/api/sitio-web/obras/${OBRA_ID}/fotos`).set('Authorization', `Bearer ${tk(['sitio_web.editar'])}`)
            .field('sin_personas', 'true').field('alt', 'Fachada de la nave desde la calle')
            .attach('foto', jpg, { filename: 'IMG_Juan_Perez.jpg', contentType: 'image/jpeg' });
        expect(r.status).toBe(201);
        expect(r.body.data).toMatchObject({ id: 51, estado: 'por_aprobar', ancho: 1000, alto: 700 });
        expect(enTmp().length).toBe(antes);
        expect(JSON.stringify(db.query.mock.calls)).not.toContain('Juan_Perez');   // el nombre del archivo no se guarda
    });
});

describe('tmp/ de subidas', () => {
    test('limpiarTmp borra solo lo de más de una hora', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sitio-tmp-'));
        const viejo = path.join(dir, 'viejo.bin');
        const nuevo = path.join(dir, 'nuevo.bin');
        fs.writeFileSync(viejo, 'x');
        fs.writeFileSync(nuevo, 'x');
        const hace2h = (Date.now() - 2 * 3600 * 1000) / 1000;
        fs.utimesSync(viejo, hace2h, hace2h);
        expect(upload.limpiarTmp(3600 * 1000, Date.now(), dir)).toBe(1);
        expect(fs.existsSync(viejo)).toBe(false);
        expect(fs.existsSync(nuevo)).toBe(true);
        fs.rmSync(dir, { recursive: true, force: true });
        expect(upload.limpiarTmp(3600 * 1000, Date.now(), path.join(dir, 'no-existe'))).toBe(0);
    });
});

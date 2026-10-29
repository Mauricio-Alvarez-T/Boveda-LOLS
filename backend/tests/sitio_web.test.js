/**
 * Sitio web (mig 147, docs/reglas/sitio-web.md) — contrato del JSON, reglas de las obras y permisos de las rutas.
 *
 * Lo que fijan:
 *   · serializarObra es una LISTA BLANCA con el orden de claves de lols.cl: nada interno sale, el mandante solo
 *     con autorización, '' → null, en_construccion → en-curso, fotos bajo /proyectos/<slug>/;
 *   · CERO diferencias: las 27 obras que hoy tiene lols.cl (tests/fixtures/sitio-web/obras, copia de los blobs
 *     de main en edab831) importadas y vueltas a serializar dan el mismo archivo, byte a byte;
 *   · faltantes sigue el esquema REAL (content.config.ts): titular, tipo y superficie son opcionales;
 *   · estadoDerivado, slug reservado o congelado (409), incluir con faltantes (409) y quitar siempre,
 *     updated_at viejo (409), ER_NO_SUCH_TABLE → 409 SITIO_WEB_SIN_MIGRAR;
 *   · gates por ruta (ver / editar / publicar, y obras.ver para vincular), «ver como» sin escrituras,
 *     archivo?ancho=../x → 400 y los 5xx solo con `error`.
 *
 * Mocks de BD y logger; sin conexión real ni red.
 */

jest.mock('../src/config/db', () => {
    const conn = { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    return { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn), __conn: conn };
});
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
const app = require('../index');
const db = require('../src/config/db');
const svc = require('../src/services/sitioWeb.service');
const fotos = require('../src/services/sitioWebFotos.service');
const { logManualActivity } = require('../src/middleware/logger');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p, extra = {}) => jwt.sign({ id: 5, email: 'ana@lols.cl', rol_id: 2, rv: 1, p, ...extra }, SECRET);
const VER = ['sitio_web.ver'];
const EDITAR = ['sitio_web.editar'];
const PUBLICAR = ['sitio_web.publicar'];

const VERSION = new Date('2026-10-29T13:00:00.123Z');
const HASH = 'a1b2c3d4'.repeat(8);
const fila = (o = {}) => ({
    id: 7, obra_id: null, slug: 'bodegas-norte', nombre: 'Bodegas Norte', titular: null, tipo: 'Centro de bodegas',
    mandante: null, mandante_autoriza: false, mandante_autoriza_por: null, mandante_autoriza_at: null,
    comuna: 'Quilicura', direccion: 'Calle Ejemplo 123', superficie_m2: 6800, estado: 'contratado', anio: null, inicio: 'Marzo 2027',
    servicios: 'construccion', desafio: null, solucion: null, resultado: null, referencia: null, orden: 10, incluir: false,
    publicado_hash: null, publicado_json: null, publicado_at: null, creado_por: 5, actualizado_por: 5,
    created_at: new Date('2026-10-28T12:00:00Z'), updated_at: VERSION, ...o,
});
const foto = (o = {}) => ({
    id: 31, sitio_obra_id: 7, rol: 'portada', alt: 'Nave central vista desde el acceso', hash: HASH, ancho: 1600, alto: 900,
    tamano_bytes: 210000, heredada_src: null, sin_personas_confirmado: true, confirmado_at: new Date('2026-10-29T10:00:00Z'),
    aprobada_at: new Date('2026-10-29T11:00:00Z'), aprobada_hash: HASH, rechazada_at: null, created_at: new Date('2026-10-29T10:00:00Z'), ...o,
});
const sinTabla = () => Object.assign(new Error("Table 'x.sitio_obras' doesn't exist"), { code: 'ER_NO_SUCH_TABLE', errno: 1146 });

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.query.mockResolvedValue([[]]);
});

/* ═══════════════════════ contrato (puras) ═══════════════════════ */

describe('serializarObra — lista blanca y forma del JSON', () => {
    const CLAVES = ['slug', 'orden', 'estado', 'nombre', 'titular', 'tipo', 'mandante', 'comuna', 'direccion', 'superficieM2',
        'anio', 'inicio', 'servicios', 'desafio', 'solucion', 'resultado', 'fotos'];

    test('solo las claves del contrato, en su orden: nada interno (ids, usuarios, fechas, obra_id)', () => {
        const j = svc.serializarObra(fila({ obra_id: 4, publicado_hash: HASH, publicado_json: '{}', creado_por: 9 }), foto());
        expect(Object.keys(j)).toEqual(CLAVES);
        const texto = svc.textoJson(j);
        for (const interno of ['obra_id', '"id"', 'creado_por', 'actualizado_por', 'created_at', 'updated_at', 'publicado', 'incluir', 'ruta', 'hash"']) {
            expect(texto).not.toContain(interno);
        }
    });

    test('mandante null sin autorización; con ella, sale', () => {
        expect(svc.serializarObra(fila({ mandante: 'Inmobiliaria Ejemplo SpA' })).mandante).toBeNull();
        expect(svc.serializarObra(fila({ mandante: 'Inmobiliaria Ejemplo SpA', mandante_autoriza: true })).mandante).toBe('Inmobiliaria Ejemplo SpA');
    });

    test("'' y espacios pasan a null; los textos se recortan", () => {
        const j = svc.serializarObra(fila({ titular: '   ', direccion: '', desafio: '  Un desafío  ', inicio: ' Marzo 2027 ' }));
        expect(j.titular).toBeNull();
        expect(j.direccion).toBeNull();
        expect(j.desafio).toBe('Un desafío');
        expect(j.inicio).toBe('Marzo 2027');
        expect(svc.textoJson(j)).not.toMatch(/: ""/);
    });

    test('en_construccion → en-curso; anio solo en terminado; superficie entera ≥ 1 o null', () => {
        expect(svc.serializarObra(fila({ estado: 'en_construccion', anio: 2026 }))).toMatchObject({ estado: 'en-curso', anio: null });
        expect(svc.serializarObra(fila({ estado: 'terminado', anio: 2026 }))).toMatchObject({ estado: 'terminado', anio: 2026 });
        expect(svc.serializarObra(fila({ superficie_m2: 0 })).superficieM2).toBeNull();
        expect(svc.serializarObra(fila({ superficie_m2: null })).superficieM2).toBeNull();
    });

    test('la portada de la Bóveda va bajo /proyectos/<slug>/ con srcset 800/1600 y medidas', () => {
        const j = svc.serializarObra(fila(), foto());
        expect(j.fotos).toEqual([{
            src: '/proyectos/bodegas-norte/portada.a1b2c3d4-1600.webp',
            alt: 'Nave central vista desde el acceso',
            srcset: '/proyectos/bodegas-norte/portada.a1b2c3d4-800.webp 800w, /proyectos/bodegas-norte/portada.a1b2c3d4-1600.webp 1600w',
            width: 1600,
            height: 900,
        }]);
        expect(svc.rutasDeJson(j)).toEqual([
            'src/content/obras/bodegas-norte.json',
            'public/proyectos/bodegas-norte/portada.a1b2c3d4-1600.webp',
            'public/proyectos/bodegas-norte/portada.a1b2c3d4-800.webp',
        ]);
    });

    test('una foto de 800 px justos no repite el ancho en el srcset; una de 1200 declara 1200w', () => {
        expect(svc.serializarObra(fila(), foto({ ancho: 800, alto: 600 })).fotos[0]).not.toHaveProperty('srcset');
        expect(svc.serializarObra(fila(), foto({ ancho: 1200, alto: 800 })).fotos[0].srcset).toMatch(/-1600\.webp 1200w$/);
    });

    test('referencia solo sin foto propia (y omitida si es null)', () => {
        expect(svc.serializarObra(fila({ referencia: 'rendersEjemplo/maipu-40' })).referencia).toBe('rendersEjemplo/maipu-40');
        expect(svc.serializarObra(fila({ referencia: 'rendersEjemplo/maipu-40' }), foto())).not.toHaveProperty('referencia');
        expect(svc.serializarObra(fila())).not.toHaveProperty('referencia');
    });

    test('textoJson: 2 espacios, \\n final y hash estable', () => {
        const t = svc.textoJson({ a: [1] });
        expect(t).toBe('{\n  "a": [\n    1\n  ]\n}\n');
        expect(svc.hashTexto(t)).toMatch(/^[0-9a-f]{64}$/);
        expect(svc.hashTexto(t)).toBe(svc.hashTexto(svc.textoJson({ a: [1] })));
    });
});

describe('cero diferencias con las obras que hoy tiene lols.cl', () => {
    const DIR = path.join(__dirname, 'fixtures/sitio-web/obras');
    const archivos = fs.readdirSync(DIR).filter(f => f.endsWith('.json'));

    test('están las 27 obras del sitio', () => {
        expect(archivos).toHaveLength(27);
    });

    test.each(archivos)('%s: importar y volver a serializar da el mismo archivo, y no le falta nada', (archivo) => {
        // El blob de git es LF; en Windows el checkout puede traerlo con CRLF.
        const original = fs.readFileSync(path.join(DIR, archivo), 'utf8').replace(/\r\n/g, '\n');
        const json = JSON.parse(original);
        const { obra, foto: heredada } = svc.desdeJsonDelSitio(json);
        expect(svc.faltantes(obra, heredada)).toEqual([]);
        expect(svc.textoJson(svc.serializarObra(obra, heredada))).toBe(original);
        expect(`${obra.slug}.json`).toBe(archivo);
    });
});

describe('faltantes — las reglas del esquema real de lols.cl', () => {
    const campos = (o, f = null, extra) => svc.faltantes(o, f, extra).map(x => x.campo);

    test('una contratada completa sin foto, sin titular ni tipo ni superficie: no le falta nada', () => {
        expect(svc.faltantes(fila({ titular: null, tipo: null, superficie_m2: null }))).toEqual([]);
    });

    test('una regla por campo', () => {
        expect(campos(fila({ nombre: '  ' }))).toEqual(['nombre']);
        expect(campos(fila({ slug: 'ejemplo' }))).toEqual(['slug']);
        expect(campos(fila({ slug: 'terminados-1' }))).toEqual(['slug']);
        expect(campos(fila({ comuna: null }))).toEqual(['comuna']);
        expect(campos(fila({ servicios: '' }))).toEqual(['servicios']);
        expect(campos(fila({ servicios: 'construccion,mantencion' }))).toEqual(['servicios']);
        expect(campos(fila({ tipo: 'Galpón' }))).toEqual(['tipo']);
        expect(campos(fila({ estado: 'terminado', anio: null }), foto())).toEqual(['anio']);
        expect(campos(fila({ estado: 'otro' }))).toEqual(['estado']);
    });

    test('en construcción y terminada exigen portada (o la imagen referencial); contratada no', () => {
        expect(campos(fila({ estado: 'en_construccion' }))).toEqual(['portada']);
        expect(campos(fila({ estado: 'terminado', anio: 2026 }))).toEqual(['portada']);
        expect(campos(fila({ estado: 'en_construccion' }), foto())).toEqual([]);
        expect(campos(fila({ estado: 'en_construccion', referencia: 'rendersEjemplo/maipu-40' }))).toEqual([]);
        expect(campos(fila({ estado: 'en_construccion', referencia: 'rendersEjemplo/no-existe' }))).toEqual(['portada']);
        expect(svc.faltantes(fila({ estado: 'en_construccion' }), null, { porAprobar: 1 })[0].mensaje).toMatch(/espera aprobación/);
    });

    test('la portada necesita su descripción; la heredada tiene que ser de su carpeta', () => {
        expect(campos(fila(), foto({ alt: 'Foto' }))).toEqual(['portada']);
        expect(campos(fila(), { heredada_src: '/proyectos/otra-obra/1.jpg', alt: 'Edificio de otra obra' })).toEqual(['portada']);
    });
});

describe('estadoDerivado', () => {
    const e = (obra, extra = {}, pub = null) => svc.estadoDerivado({ obra, faltantes: [], hashActual: HASH, ...extra }, pub);
    const pub = (o = {}) => ({ obras: { 7: HASH }, build_estado: 'ok', en_linea: true, ...o });

    test('borrador, listo y retiro pendiente', () => {
        expect(e({ id: 7, incluir: false, publicado_hash: null })).toBe('borrador');
        expect(e({ id: 7, incluir: true, publicado_hash: null }, { faltantes: [{ campo: 'comuna' }] })).toBe('borrador');
        expect(e({ id: 7, incluir: true, publicado_hash: null })).toBe('listo');
        expect(e({ id: 7, incluir: false, publicado_hash: HASH })).toBe('retiro_pendiente');
    });

    test('publicada, publicando, no llegó al sitio y cambios sin publicar', () => {
        const o = { id: 7, incluir: true, publicado_hash: HASH };
        expect(e(o, {}, pub())).toBe('publicada');
        expect(e(o, {}, pub({ build_estado: 'compilando', en_linea: false }))).toBe('publicando');
        expect(e(o, {}, pub({ build_estado: 'ok', en_linea: false }))).toBe('publicando');
        expect(e(o, {}, pub({ build_estado: 'fallo', en_linea: false }))).toBe('no_llego');
        // «En línea» manda sobre una compilación fallida (corrida repetida o push posterior que la llevó).
        expect(e(o, {}, pub({ build_estado: 'fallo', en_linea: true }))).toBe('publicada');
        expect(e(o, { hashActual: 'f'.repeat(64) }, pub())).toBe('cambios');
        // Le faltan datos: el sitio MANTIENE la versión publicada (publicar no la cambia) → incompleta, no «cambios».
        expect(e(o, { faltantes: [{ campo: 'comuna' }], hashActual: null }, pub())).toBe('incompleta');
        // …salvo que su portada publicada esté rechazada: la próxima publicación la saca del sitio.
        expect(e(o, { faltantes: [{ campo: 'portada' }], hashActual: null, rechazadaPublicada: true }, pub())).toBe('retiro_pendiente');
    });
});

describe('slug', () => {
    test('slugDesde: sin tildes ni eñes, minúsculas y guiones; corta en un guion', () => {
        expect(svc.slugDesde('Av. España 778')).toBe('av-espana-778');
        expect(svc.slugDesde('Enfermera Lucía Vidal Arias 6679')).toBe('enfermera-lucia-vidal-arias-6679');
        expect(svc.slugDesde('  BODEGAS ÑUÑOA / Norte  ')).toBe('bodegas-nunoa-norte');
        const largo = svc.slugDesde('palabra '.repeat(20));
        expect(largo.length).toBeLessThanOrEqual(80);
        expect(largo.endsWith('-')).toBe(false);
    });

    test('reservados: ejemplo, muestras de carrusel y muestra-*', () => {
        for (const s of ['ejemplo', 'terminados-3', 'en-construccion-1', 'han-confiado-2', 'muestra-1', 'muestra']) {
            expect(svc.slugReservado(s)).toBe(true);
        }
        for (const s of ['abate-molina-211', 'terminados-del-norte', 'ejemplo-real']) expect(svc.slugReservado(s)).toBe(false);
    });

    test('nombreLegible: el nombre en mayúsculas de la Bóveda se vuelve legible', () => {
        expect(svc.nombreLegible('BASCUÑAN 661')).toBe('Bascuñan 661');
        expect(svc.nombreLegible('EDIFICIO DE LA REINA')).toBe('Edificio de la Reina');
        expect(svc.nombreLegible('Maipú 40')).toBe('Maipú 40');
    });
});

describe('fotos — las dos llaves atadas a los bytes', () => {
    test('publicable solo con confirmación, aprobación del MISMO hash y sin rechazo', () => {
        expect(svc.fotoPublicable(foto())).toBe(true);
        expect(svc.fotoPublicable(foto({ aprobada_hash: 'f'.repeat(64) }))).toBe(false);
        expect(svc.fotoPublicable(foto({ rechazada_at: new Date() }))).toBe(false);
        expect(svc.fotoPublicable(foto({ sin_personas_confirmado: false }))).toBe(false);
        expect(svc.fotoPublicable(foto({ aprobada_at: null }))).toBe(false);
        // La confirmación cambió DESPUÉS de aprobar: no sale.
        expect(svc.fotoPublicable(foto({ confirmado_at: new Date('2026-10-29T12:00:00Z') }))).toBe(false);
    });

    test('la vigente es la aprobada más reciente; las pendientes y rechazadas no cuentan', () => {
        const confirmada = new Date('2026-09-30T00:00:00Z');
        const vieja = foto({ id: 1, confirmado_at: confirmada, aprobada_at: new Date('2026-10-01T00:00:00Z') });
        const nueva = foto({ id: 2, confirmado_at: confirmada, aprobada_at: new Date('2026-10-20T00:00:00Z') });
        const pendiente = foto({ id: 3, aprobada_at: null, aprobada_hash: null });
        const rechazada = foto({ id: 4, rechazada_at: new Date(), aprobada_at: new Date('2026-10-28T00:00:00Z') });
        expect(svc.fotoVigente([vieja, pendiente, nueva, rechazada]).id).toBe(2);
        expect(svc.fotoVigente([pendiente, rechazada])).toBeNull();
    });
});

/* ═══════════════════════ service (BD simulada) ═══════════════════════ */

describe('crear y editar', () => {
    test('crear: el slug sale del nombre, queda fuera del sitio y al final de su estado; deja historial', async () => {
        db.query
            .mockResolvedValueOnce([[]])                        // slug libre
            .mockResolvedValueOnce([[{ m: 20 }]])               // orden máx del estado
            .mockResolvedValueOnce([{ insertId: 9 }])           // INSERT
            .mockResolvedValueOnce([{}]);                       // historial
        const r = await svc.crearObra({ nombre: ' Bodegas Ñuñoa  Norte ', comuna: 'Ñuñoa', servicios: ['construccion', 'construccion'] }, 5);
        expect(r).toEqual({ id: 9, slug: 'bodegas-nunoa-norte' });
        const [sql, params] = db.query.mock.calls[2];
        expect(sql).toMatch(/INSERT INTO sitio_obras \(nombre, comuna, servicios, slug, estado, orden, incluir, creado_por, actualizado_por\)/);
        expect(params).toEqual(['Bodegas Ñuñoa Norte', 'Ñuñoa', 'construccion', 'bodegas-nunoa-norte', 'en_construccion', 30, false, 5, 5]);
        expect(db.query.mock.calls[3][0]).toMatch(/INSERT INTO sitio_web_historial/);
    });

    test('slug reservado → 409; ocupado → 409; servicio fuera del catálogo → 400', async () => {
        await expect(svc.crearObra({ nombre: 'Ejemplo' }, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SLUG_RESERVADO' });
        db.query.mockResolvedValueOnce([[{ id: 3 }]]);
        await expect(svc.crearObra({ nombre: 'Maipú 40' }, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SLUG_OCUPADO' });
        await expect(svc.crearObra({ nombre: 'X', servicios: ['mantencion'] }, 5)).rejects.toMatchObject({ statusCode: 400, code: 'SITIO_WEB_SERVICIO' });
    });

    test('vincular una obra de la Bóveda exige obras.ver (403)', async () => {
        await expect(svc.crearObra({ nombre: 'Bodegas', obra_id: 4 }, 5, { permisos: EDITAR }))
            .rejects.toMatchObject({ statusCode: 403, details: { required: ['obras.ver'] } });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('editar con una versión vieja → 409 SITIO_WEB_EDITADA_POR_OTRO, sin escribir', async () => {
        db.query.mockResolvedValueOnce([[fila({ updated_at: new Date('2026-10-29T13:05:00.456Z') })]]);
        await expect(svc.editarObra(7, { comuna: 'Renca', updated_at: VERSION.toISOString() }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_EDITADA_POR_OTRO' });
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    test('editar: si otro guardó justo entremedio (UPDATE sin filas) → 409', async () => {
        db.query.mockResolvedValueOnce([[fila()]]).mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(svc.editarObra(7, { comuna: 'Renca', updated_at: VERSION.toISOString() }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_EDITADA_POR_OTRO' });
        expect(db.query.mock.calls[1][0]).toMatch(/WHERE id = \? AND updated_at = \?$/);
    });

    test('estado: null no se escribe (la columna es NOT NULL): al editar queda el de antes, al crear el de siempre', async () => {
        db.query.mockResolvedValueOnce([[fila()]]);
        // Solo vino estado: null → nada que cambiar (sin UPDATE con NULL).
        expect(await svc.editarObra(7, { estado: null, updated_at: VERSION.toISOString() }, 5)).toMatchObject({ id: 7, sin_cambios: true });
        expect(db.query.mock.calls.some(c => /^UPDATE/.test(c[0]))).toBe(false);
        expect(db.query.mock.calls.some(c => /WHERE estado = \?/.test(c[0]) && c[1][0] === null)).toBe(false);
        db.query.mockReset();
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ m: 0 }]]).mockResolvedValueOnce([{ insertId: 9 }]).mockResolvedValue([{}]);
        await svc.crearObra({ nombre: 'Bodegas Sur', estado: null }, 5);
        expect(db.query.mock.calls[1][1]).toEqual(['en_construccion']);
        // Un valor que no es un estado (si llegara sin validateBody) → 400, nunca un 500 de la BD.
        expect(() => svc._h.leerObra({ nombre: 'X', estado: 'cualquiera' })).toThrow(expect.objectContaining({ statusCode: 400, code: 'SITIO_WEB_ESTADO' }));
    });

    test('editar: guarda solo con la versión al día y devuelve la nueva', async () => {
        const nueva = new Date('2026-10-29T13:10:00.789Z');
        db.query.mockResolvedValueOnce([[fila()]]).mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ updated_at: nueva }]]);
        const r = await svc.editarObra(7, { comuna: ' Renca ', direccion: '', updated_at: VERSION.toISOString() }, 5);
        expect(r).toEqual({ id: 7, updated_at: nueva });
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/^UPDATE sitio_obras SET comuna = \?, direccion = \?, actualizado_por = \? WHERE id = \? AND updated_at = \?$/);
        expect(params).toEqual(['Renca', null, 5, 7, VERSION]);
        expect(JSON.parse(db.query.mock.calls[2][1][5])).toEqual({ comuna: ['Quilicura', 'Renca'], direccion: ['Calle Ejemplo 123', null] });
    });

    test('el slug publicado está congelado (409); sin publicar se puede cambiar', async () => {
        db.query.mockResolvedValueOnce([[fila({ publicado_hash: HASH, publicado_at: new Date() })]]);
        await expect(svc.editarObra(7, { slug: 'otra-direccion', updated_at: VERSION.toISOString() }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SLUG_CONGELADO' });
        db.query.mockResolvedValueOnce([[fila()]]);
        await expect(svc.editarObra(7, { slug: 'en-construccion-2', updated_at: VERSION.toISOString() }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SLUG_RESERVADO' });
    });

    test('cambiar el mandante anula su autorización (era para el otro nombre)', async () => {
        db.query.mockResolvedValueOnce([[fila({ mandante: 'Inmobiliaria Uno', mandante_autoriza: true, mandante_autoriza_por: 2 })]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ updated_at: VERSION }]]);
        // El formulario manda la casilla como estaba (marcada): no es una autorización nueva.
        await svc.editarObra(7, { mandante: 'Inmobiliaria Dos', mandante_autoriza: true, updated_at: VERSION.toISOString() }, 5);
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/mandante = \?, mandante_autoriza = \?, mandante_autoriza_por = \?, mandante_autoriza_at = \?/);
        expect(params.slice(0, 4)).toEqual(['Inmobiliaria Dos', false, null, null]);
    });

    test('mandante nuevo marcado en el mismo guardado (venía sin autorizar): queda autorizado por quien guarda', async () => {
        db.query.mockResolvedValueOnce([[fila({ mandante: null, mandante_autoriza: false })]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([[{ updated_at: VERSION }]]);
        await svc.editarObra(7, { mandante: 'Inmobiliaria Dos', mandante_autoriza: true, updated_at: VERSION.toISOString() }, 5);
        const params = db.query.mock.calls[1][1];
        expect(params.slice(0, 3)).toEqual(['Inmobiliaria Dos', true, 5]);
        expect(params[3]).toBeInstanceOf(Date);
    });
});

describe('incluir, orden y borrar', () => {
    test('incluir una obra que nunca se publicó y le faltan datos → 409 con la lista', async () => {
        db.query.mockResolvedValueOnce([[fila({ estado: 'en_construccion' })]]).mockResolvedValueOnce([[]]);
        const e = await svc.cambiarIncluir(7, true, 5).catch(x => x);
        expect(e).toMatchObject({ statusCode: 409, code: 'SITIO_WEB_FALTAN_DATOS' });
        expect(e.details.faltantes.map(f => f.campo)).toEqual(['portada']);
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('incluir una obra completa: sin tocar updated_at y con historial', async () => {
        db.query.mockResolvedValueOnce([[fila()]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await svc.cambiarIncluir(7, true, 5)).toMatchObject({ id: 7, incluir: true });
        expect(db.query.mock.calls[2][0]).toMatch(/SET incluir = \?, actualizado_por = \?, updated_at = updated_at WHERE id = \?/);
    });

    test('una obra ya publicada se puede volver a incluir aunque le falten datos (se reusa lo publicado)', async () => {
        db.query.mockResolvedValueOnce([[fila({ estado: 'en_construccion', publicado_hash: HASH })]])
            .mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await svc.cambiarIncluir(7, true, 5)).toMatchObject({ incluir: true });
    });

    test('quitar del sitio NUNCA se bloquea, aunque le falte todo', async () => {
        db.query.mockResolvedValueOnce([[fila({ incluir: true, comuna: null, servicios: '', estado: 'terminado' })]])
            .mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await svc.cambiarIncluir(7, false, 5)).toMatchObject({ incluir: false });
    });

    test('orden: 10, 20, 30… en el orden pedido; las que no vinieron quedan al final', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }, { id: 3 }]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
        expect(await svc.reordenar('contratado', [3, 1], 5)).toEqual({ estado: 'contratado', ids: [3, 1, 2] });
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/SET orden = CASE id WHEN \? THEN \? WHEN \? THEN \? WHEN \? THEN \? END, updated_at = updated_at WHERE id IN \(\?\)/);
        expect(params).toEqual([3, 10, 1, 20, 2, 30, [3, 1, 2]]);
    });

    test('orden con una obra de otro estado → 409; con ids repetidos → 400', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
        await expect(svc.reordenar('contratado', [1, 9], 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_ORDEN_DESACTUALIZADO' });
        await expect(svc.reordenar('contratado', [1, 1], 5)).rejects.toMatchObject({ statusCode: 400 });
    });

    test('borrar: incluida o todavía publicada → 409 SITIO_WEB_OBRA_EN_LINEA', async () => {
        db.query.mockResolvedValueOnce([[fila({ incluir: true })]]);
        await expect(svc.borrarObra(7, 5)).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_OBRA_EN_LINEA' });
        db.query.mockResolvedValueOnce([[fila({ publicado_hash: HASH })]]).mockResolvedValueOnce([[]]);
        await expect(svc.borrarObra(7, 5)).rejects.toMatchObject({ code: 'SITIO_WEB_OBRA_EN_LINEA' });
        db.query.mockResolvedValueOnce([[fila()]]).mockResolvedValueOnce([[{
            id: 3, modo: 'publicar', obras_json: '{}', build_estado: 'ok', en_linea_at: new Date(),
            manifiesto: JSON.stringify({ 'src/content/obras/bodegas-norte.json': 'b'.repeat(40) }),
        }]]);
        await expect(svc.borrarObra(7, 5)).rejects.toMatchObject({ code: 'SITIO_WEB_OBRA_EN_LINEA' });
    });

    test('borrar un borrador: DELETE (las fotos caen por CASCADE), su carpeta de fotos e historial', async () => {
        // Id reservado de prueba y rmSync falso: el test nunca toca la carpeta uploads/ real del checkout.
        const rm = jest.spyOn(fs, 'rmSync').mockImplementation(() => {});
        try {
            db.query.mockResolvedValueOnce([[fila({ id: 999007 })]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]).mockResolvedValueOnce([{}]);
            expect(await svc.borrarObra(999007, 5)).toEqual({ id: 999007, nombre: 'Bodegas Norte' });
            expect(db.query.mock.calls[2]).toEqual(['DELETE FROM sitio_obras WHERE id = ?', [999007]]);
            expect(rm).toHaveBeenCalledWith(path.join(svc._h.UPLOADS_DIR, 'sitio-web', '999007'), { recursive: true, force: true });
        } finally {
            rm.mockRestore();
        }
    });
});

describe('lectura', () => {
    test('detalle: fotos SIN ruta, el JSON que se publicaría y el nombre interno solo con obras.ver', async () => {
        const conRuta = foto({ ruta: `sitio-web/7/${HASH}`, subido_por: 5, subido_por_nombre: 'Ana' });
        const preparar = (conObrasVer) => {
            db.query.mockResolvedValueOnce([[fila({ obra_id: 4 })]]).mockResolvedValueOnce([[conRuta]])
                .mockResolvedValueOnce([[{ creado_por_nombre: 'Ana', actualizado_por_nombre: 'Ana', mandante_autoriza_por_nombre: null }]]);
            if (conObrasVer) db.query.mockResolvedValueOnce([[{ nombre: 'BODEGAS NORTE' }]]);
            db.query.mockResolvedValueOnce([[{ id: 1, entidad: 'obra', accion: 'crear', resumen: 'Creó', detalle: '{"comuna":[null,"Quilicura"]}' }]]);
        };
        preparar(true);
        const r = await svc.detalleObra(7, { permisos: ['sitio_web.ver', 'obras.ver'] });
        expect(r.obra.obra_nombre).toBe('BODEGAS NORTE');
        expect(r.fotos[0]).not.toHaveProperty('ruta');
        expect(r.fotos[0]).not.toHaveProperty('hash');
        expect(JSON.stringify(r.fotos)).not.toContain('sitio-web/');
        expect(r.fotos[0]).toMatchObject({ id: 31, estado: 'vigente', vigente: true, publicable: true });
        expect(r.json.fotos[0].src).toBe('/proyectos/bodegas-norte/portada.a1b2c3d4-1600.webp');
        expect(r.historial[0].detalle).toEqual({ comuna: [null, 'Quilicura'] });
        expect(r.estadoDerivado).toBe('borrador');

        preparar(false);
        expect((await svc.detalleObra(7, { permisos: VER })).obra.obra_nombre).toBeNull();
    });

    test('lista: estado, faltantes y portada de cada obra', async () => {
        db.query
            .mockResolvedValueOnce([[fila(), fila({ id: 8, slug: 'gorbea-3082', estado: 'en_construccion', incluir: true })]])
            .mockResolvedValueOnce([[foto({ id: 40, sitio_obra_id: 8, aprobada_at: null, aprobada_hash: null })]]);
        const [a, b] = await svc.listarObras();
        expect(a).toMatchObject({ id: 7, estadoDerivado: 'borrador', faltantes: [], tiene_portada: false, fotos_por_aprobar: 0 });
        expect(b).toMatchObject({ id: 8, estadoDerivado: 'borrador', tiene_portada: false, fotos_por_aprobar: 1 });
        expect(b.faltantes[0]).toMatchObject({ campo: 'portada', mensaje: expect.stringMatching(/espera aprobación/) });
        expect(a).not.toHaveProperty('publicado_json');
    });

    test('sugerencias: la superficie del presupuesto solo con costos.gestionar', async () => {
        const interna = [[{ id: 4, nombre: 'BASCUÑAN 661', direccion: 'Bascuñán Guerrero 661', activa: true, finalizada: false,
            fecha_inicio: new Date(2026, 2, 15), fecha_termino: null }]];
        db.query.mockResolvedValueOnce(interna);
        const sin = await svc.sugerencias(4);
        expect(sin).toEqual({ obra_id: 4, nombre: 'Bascuñan 661', slug: 'bascunan-661', direccion: 'Bascuñán Guerrero 661',
            estado: 'en_construccion', anio: null, inicio: 'Marzo 2026' });
        db.query.mockResolvedValueOnce(interna).mockResolvedValueOnce([[{ superficie_m2: '6220.40' }]]);
        expect((await svc.sugerencias(4, { verCostos: true })).superficie_m2).toBe(6220);
    });

    test('sin la migración 147 → 409 SITIO_WEB_SIN_MIGRAR (no un 500)', async () => {
        db.query.mockRejectedValueOnce(sinTabla());
        await expect(svc.listarObras()).rejects.toMatchObject({ statusCode: 409, code: 'SITIO_WEB_SIN_MIGRAR' });
    });
});

/* ═══════════════════════ rutas: permisos y errores ═══════════════════════ */

describe('rutas — permisos', () => {
    afterEach(() => jest.restoreAllMocks());

    test('sin ninguna clave del sitio → 403; con ver, editar o publicar → 200', async () => {
        jest.spyOn(svc, 'listarObras').mockResolvedValue([]);
        const sin = await request(app).get('/api/sitio-web/obras').set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
        expect(sin.status).toBe(403);
        expect(sin.body.required).toEqual(['sitio_web.ver', 'sitio_web.editar', 'sitio_web.publicar']);
        for (const p of [VER, EDITAR, PUBLICAR]) {
            const r = await request(app).get('/api/sitio-web/obras').set('Authorization', `Bearer ${token(p)}`);
            expect(r.status).toBe(200);
            expect(r.body).toEqual({ data: [] });
        }
    });

    test('crear pide editar (o publicar); el body se valida y se limpia de claves de más', async () => {
        const crear = jest.spyOn(svc, 'crearObra').mockResolvedValue({ id: 9, slug: 'bodegas' });
        const soloVer = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(VER)}`).send({ nombre: 'Bodegas' });
        expect(soloVer.status).toBe(403);
        const sinNombre = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(EDITAR)}`).send({ comuna: 'Renca' });
        expect(sinNombre.status).toBe(400);
        const malo = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(EDITAR)}`).send({ nombre: 'B', slug: 'Con Mayúsculas' });
        expect(malo.status).toBe(400);
        const ok = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(EDITAR)}`)
            .send({ nombre: 'Bodegas', incluir: true, publicado_hash: HASH, creado_por: 1, mandante_autoriza: true });
        expect(ok.status).toBe(201);
        expect(ok.body).toEqual({ data: { id: 9, slug: 'bodegas' } });
        expect(crear.mock.calls[0][0]).toEqual({ nombre: 'Bodegas', mandante_autoriza: true });
        expect(logManualActivity).toHaveBeenCalledWith(5, 'sitio_web', 'CREATE', 9, expect.any(String), expect.anything(), expect.any(Object));
        const conPublicar = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(PUBLICAR)}`).send({ nombre: 'Bodegas' });
        expect(conPublicar.status).toBe(201);
    });

    test('booleanos reales: incluir "true" (texto) → 400', async () => {
        const r = await request(app).put('/api/sitio-web/obras/7/incluir').set('Authorization', `Bearer ${token(EDITAR)}`).send({ incluir: 'true' });
        expect(r.status).toBe(400);
    });

    test('PUT /obras/orden no cae en /obras/:id', async () => {
        const reordenar = jest.spyOn(svc, 'reordenar').mockResolvedValue({ estado: 'contratado', ids: [2, 1] });
        const editar = jest.spyOn(svc, 'editarObra');
        const r = await request(app).put('/api/sitio-web/obras/orden').set('Authorization', `Bearer ${token(EDITAR)}`)
            .send({ estado: 'contratado', ids: [2, 1] });
        expect(r.status).toBe(200);
        expect(reordenar).toHaveBeenCalledWith('contratado', [2, 1], 5);
        expect(editar).not.toHaveBeenCalled();
    });

    test('disponibles y sugerencias: editar + obras.ver (403 si falta cualquiera)', async () => {
        jest.spyOn(svc, 'obrasDisponibles').mockResolvedValue([{ id: 4, nombre: 'BASCUÑAN 661', finalizada: false }]);
        const sinObras = await request(app).get('/api/sitio-web/obras/disponibles').set('Authorization', `Bearer ${token(EDITAR)}`);
        expect(sinObras.status).toBe(403);
        expect(sinObras.body.required).toEqual(['obras.ver']);
        const soloVer = await request(app).get('/api/sitio-web/obras/disponibles').set('Authorization', `Bearer ${token([...VER, 'obras.ver'])}`);
        expect(soloVer.status).toBe(403);
        const ok = await request(app).get('/api/sitio-web/obras/disponibles').set('Authorization', `Bearer ${token([...EDITAR, 'obras.ver'])}`);
        expect(ok.status).toBe(200);
        const sug = jest.spyOn(svc, 'sugerencias').mockResolvedValue({});
        await request(app).get('/api/sitio-web/obras/sugerencias/4').set('Authorization', `Bearer ${token([...EDITAR, 'obras.ver', 'costos.gestionar'])}`);
        expect(sug).toHaveBeenCalledWith(4, { verCostos: true });
        const sugSin = await request(app).get('/api/sitio-web/obras/sugerencias/4').set('Authorization', `Bearer ${token(EDITAR)}`);
        expect(sugSin.status).toBe(403);
    });

    test('aprobar y rechazar fotos piden publicar; editar no alcanza', async () => {
        const aprobar = jest.spyOn(fotos, 'aprobarFoto').mockResolvedValue({ id: 31, estado: 'vigente', reemplazadas: [], obra_nombre: 'Bodegas' });
        jest.spyOn(fotos, 'rechazarFoto').mockResolvedValue({ id: 31, estado: 'rechazada', estaba_aprobada: true, obra_nombre: 'Bodegas' });
        for (const accion of ['aprobar', 'rechazar']) {
            const r = await request(app).post(`/api/sitio-web/fotos/31/${accion}`).set('Authorization', `Bearer ${token(EDITAR)}`);
            expect(r.status).toBe(403);
            expect(r.body.required).toEqual(['sitio_web.publicar']);
        }
        const ok = await request(app).post('/api/sitio-web/fotos/31/aprobar').set('Authorization', `Bearer ${token(PUBLICAR)}`);
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ data: { id: 31, estado: 'vigente', reemplazadas: [] } });
        expect(aprobar).toHaveBeenCalledWith(31, 5);
        const rech = await request(app).post('/api/sitio-web/fotos/31/rechazar').set('Authorization', `Bearer ${token(PUBLICAR)}`);
        expect(rech.body).toEqual({ data: { id: 31, estado: 'rechazada', estaba_aprobada: true } });
    });

    test('«ver como» (token prestado) no escribe nada', async () => {
        const crear = jest.spyOn(svc, 'crearObra');
        const r = await request(app).post('/api/sitio-web/obras').set('Authorization', `Bearer ${token(EDITAR, { imp: 1, ro: true })}`).send({ nombre: 'X' });
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('VER_COMO_SOLO_LECTURA');
        expect(crear).not.toHaveBeenCalled();
    });
});

describe('rutas — errores y archivos', () => {
    afterEach(() => jest.restoreAllMocks());

    test('archivo?ancho=../x, constructor o una lista → 400 sin tocar la BD', async () => {
        for (const q of ['ancho=../x', 'ancho=constructor', 'ancho=800&ancho=1600', 'ancho=']) {
            const r = await request(app).get(`/api/sitio-web/fotos/31/archivo?${q}`).set('Authorization', `Bearer ${token(VER)}`);
            expect(r.status).toBe(400);
            expect(r.body.code).toBe('SITIO_WEB_ANCHO');
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('archivo: la ruta sale de la BD y se revisa su forma (una ruta rara → 404)', async () => {
        db.query.mockResolvedValueOnce([[{ id: 31, ruta: '../../.env' }]]);
        const r = await request(app).get('/api/sitio-web/fotos/31/archivo?ancho=800').set('Authorization', `Bearer ${token(VER)}`);
        expect(r.status).toBe(404);
    });

    test('sin la migración → 409 con code SITIO_WEB_SIN_MIGRAR (también /config, lo primero que pide la pantalla)', async () => {
        db.query.mockRejectedValueOnce(sinTabla());
        const r = await request(app).get('/api/sitio-web/obras').set('Authorization', `Bearer ${token(VER)}`);
        expect(r.status).toBe(409);
        expect(r.body.code).toBe('SITIO_WEB_SIN_MIGRAR');
        db.query.mockRejectedValueOnce(sinTabla());
        const c = await request(app).get('/api/sitio-web/config').set('Authorization', `Bearer ${token(VER)}`);
        expect(c.status).toBe(409);
        expect(c.body.code).toBe('SITIO_WEB_SIN_MIGRAR');
    });

    test('un 5xx trae solo `error` (sin code ni detalles)', async () => {
        jest.spyOn(svc, 'listarObras').mockRejectedValue(Object.assign(new Error('falló algo'), { code: 'SITIO_WEB_X', details: { a: 1 } }));
        const r = await request(app).get('/api/sitio-web/obras').set('Authorization', `Bearer ${token(VER)}`);
        expect(r.status).toBe(500);
        expect(r.body.error).toBeTruthy();
        expect(r.body).not.toHaveProperty('code');
        expect(r.body).not.toHaveProperty('a');
    });

    test('config: modo y catálogos, nunca el token', async () => {
        const antes = { ...process.env };
        Object.assign(process.env, {
            SITIO_WEB_MODO: 'publicar', GITHUB_TOKEN_SITIO: 'github_pat_NO_DEBE_SALIR', GITHUB_BRANCH_SITIO: 'main',
            SITIO_WEB_PERMITIR_REPO_PUBLICO: '1', GITHUB_TOKEN_SITIO_VENCE: '2099-01-01',
        });
        try {
            const r = await request(app).get('/api/sitio-web/config').set('Authorization', `Bearer ${token(VER)}`);
            expect(r.status).toBe(200);
            expect(JSON.stringify(r.body)).not.toContain('github_pat_NO_DEBE_SALIR');
            // La BD de los tests no es la de producción: simulación.
            expect(r.body.data).toMatchObject({ modo: 'simulacion', motivo: 'entorno_no_produccion', repo: 'Mauricio-Alvarez-T/lols.cl', rama: 'main' });
            expect(r.body.data.tokenVenceEnDias).toBeGreaterThan(0);
            expect(r.body.data.catalogos.estados.map(e => e.sitio)).toEqual(['en-curso', 'contratado', 'terminado']);
            expect(r.body.data.catalogos.servicios.map(s => s.slug)).toEqual(['construccion', 'montaje-industrial', 'electricidad']);
        } finally {
            for (const k of Object.keys(process.env)) if (!(k in antes)) delete process.env[k];
            Object.assign(process.env, antes);
        }
    });
});

/**
 * «Errores» de Soporte (mig 141, docs/reglas/seguridad-rbac.md § Errores).
 *
 * Cubre lo que pidió Marcos («que sepas discernir un problema real y no me mandes 100 pantallazos»):
 *   - cualquier persona con sesión manda avisos; sin sesión 401; un token de «ver como» no (auth lo frena);
 *   - el mismo error de la misma persona en 10 minutos suma `veces` en la misma fila (no crea otra ni pide foto);
 *   - foto SOLO para falla/app y con topes: 5 por persona al día, 40 al día, 40 MB guardados;
 *   - más de 40 avisos de una persona en 10 minutos → se ignoran (sin tocar la BD);
 *   - la foto: solo la dueña, una vez, imagen de verdad y ≤ 200 KB;
 *   - la bandeja, la foto y «revisado»: solo el rol 1;
 *   - nada de esto entra al historial (logs_actividad).
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const db = require('../src/config/db');
const app = require('../index');
const svc = require('../src/services/soporteErrores.service');

const SECRETO = process.env.JWT_SECRET || 'secret';
const USUARIOS = {
    1: { id: 1, nombre: 'Marcos Uribe', email: 'marcos@lols.cl', rol_id: 1, activo: 1 },
    20: { id: 20, nombre: 'Tomás Vera', email: 'tomas@lols.cl', rol_id: 7, activo: 1 },
    21: { id: 21, nombre: 'Camila Rojas', email: 'camila@lols.cl', rol_id: 7, activo: 1 },
};
const sesion = (u, extra = {}) => jwt.sign(
    { typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, p: ['inventario.ver'], rv: 1, ...extra },
    SECRETO, { expiresIn: '8h' },
);

/** Estado de la BD simulada que cambia cada prueba. */
let REPETIDO = null;        // id de la fila que ya existe con la misma firma (o null)
let CUPO = { persona_hoy: 0, hoy: 0, bytes: 0 };
let FILAS_AFECTADAS = 1;
let LISTA = [];

function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = USUARIOS[params[0]];
            return [u ? [u] : []];
        }
        if (s.includes('FROM soporte_errores') && s.includes('firma = ?')) return [REPETIDO ? [{ id: REPETIDO }] : []];
        if (s.startsWith('UPDATE soporte_errores SET veces = veces + 1')) return [{ affectedRows: 1 }];
        if (s.includes('AS persona_hoy')) return [[CUPO]];
        if (s.startsWith('INSERT INTO soporte_errores')) return [{ insertId: 99 }];
        if (s.includes('UPDATE soporte_errores') || s.includes('DELETE FROM soporte_errores')) return [{ affectedRows: FILAS_AFECTADAS }];
        if (s.includes('FROM soporte_errores e')) return [LISTA];
        if (s.includes('FROM permisos_catalogo WHERE clave IN')) return [[{ clave: 'trabajadores.editar', nombre: 'Editar Trabajadores' }]];
        if (s.includes("COUNT(*) AS n FROM soporte_errores")) return [[{ n: 3 }]];
        if (s.includes('COUNT(DISTINCT usuario_id) AS personas')) return [[{ personas: 4, veces: 9, desde: null, hasta: null }]];
        if (s.startsWith('SELECT foto, foto_mime FROM soporte_errores')) return [[{ foto: Buffer.from([0xFF, 0xD8, 0xFF]), foto_mime: 'image/jpeg' }]];
        return [[]];
    });
}

const consultas = () => db.query.mock.calls.map(([sql]) => String(sql));
const insercion = () => db.query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO soporte_errores'));
const falla = (extra = {}) => ({
    categoria: 'falla', mensaje: 'No se pudo guardar la recepción', accion: 'POST /api/transferencias/:id/recibir', codigo: 500,
    pantalla: '/inventario?tab=transferencias', pantalla_nombre: 'Inventario', dispositivo: 'movil', duracion_ms: 830, ...extra,
});
const reportar = (body, u = USUARIOS[20]) => request(app).post('/api/soporte/errores').set('Authorization', `Bearer ${sesion(u)}`).send(body);

/** Un JPEG mínimo como data URL (los bytes empiezan como JPEG de verdad). */
const jpeg = (bytes = 64) => `data:image/jpeg;base64,${Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(bytes)]).toString('base64')}`;

beforeEach(() => {
    jest.clearAllMocks();
    svc._reiniciar();
    REPETIDO = null;
    CUPO = { persona_hoy: 0, hoy: 0, bytes: 0 };
    FILAS_AFECTADAS = 1;
    LISTA = [];
    bd();
});

describe('POST /api/soporte/errores — mandar un aviso', () => {
    test('sin sesión → 401; con un token de «ver como» → no entra (auth frena todo lo que no es GET)', async () => {
        expect((await request(app).post('/api/soporte/errores').send(falla())).status).toBe(401);
        const prestado = sesion(USUARIOS[20], { imp: 1, ro: true });
        const r = await request(app).post('/api/soporte/errores').set('Authorization', `Bearer ${prestado}`).send(falla());
        expect(r.status).toBe(403);
        expect(insercion()).toBeUndefined();
    });

    test('una falla nueva con cupo → fila nueva y el servidor pide la foto', async () => {
        const r = await reportar(falla());
        expect(r.status).toBe(201);
        expect(r.body.data).toEqual({ id: 99, repetido: false, pedir_foto: true });
        const [, params] = insercion();
        expect(params[0]).toBe(20);
        expect(params[1]).toBe('falla');
        expect(params[params.length - 1]).toBe(1); // foto_pedida
    });

    test('el mismo error en 10 minutos → suma «veces» en la misma fila, sin fila nueva ni foto', async () => {
        REPETIDO = 55;
        const r = await reportar(falla());
        expect(r.body.data).toEqual({ id: 55, repetido: true, pedir_foto: false });
        expect(insercion()).toBeUndefined();
        expect(consultas().some(s => s.startsWith('UPDATE soporte_errores SET veces = veces + 1'))).toBe(true);
    });

    test.each(['permiso', 'lento', 'sin_senal', 'dato'])('«%s» nunca pide foto (ni pregunta por el cupo)', async (categoria) => {
        const r = await reportar(falla({ categoria, codigo: categoria === 'permiso' ? 403 : undefined }));
        expect(r.body.data.pedir_foto).toBe(false);
        expect(consultas().some(s => s.includes('AS persona_hoy'))).toBe(false);
        const [, params] = insercion();
        expect(params[params.length - 1]).toBe(0);
    });

    test('la «app» (pantalla rota) sí pide foto', async () => {
        const r = await reportar(falla({ categoria: 'app', codigo: undefined, detalle_tecnico: 'TypeError: x is undefined' }));
        expect(r.body.data.pedir_foto).toBe(true);
    });

    test.each([
        ['5 fotos de esa persona hoy', { persona_hoy: 5, hoy: 5, bytes: 0 }],
        ['40 fotos hoy entre todos', { persona_hoy: 0, hoy: 40, bytes: 0 }],
        ['40 MB guardados', { persona_hoy: 0, hoy: 0, bytes: 40 * 1024 * 1024 }],
    ])('sin cupo (%s) → el aviso se guarda, pero sin pedir foto', async (_, cupo) => {
        CUPO = cupo;
        const r = await reportar(falla());
        expect(r.body.data).toEqual({ id: 99, repetido: false, pedir_foto: false });
    });

    test('permiso: guarda las claves que faltaban (máximo 10)', async () => {
        const permisos = Array.from({ length: 12 }, (_, i) => `permiso.${i}`);
        await reportar(falla({ categoria: 'permiso', codigo: 403, permisos_faltantes: permisos }));
        const [, params] = insercion();
        expect(params[6]).toBe(permisos.slice(0, 10).join(','));
    });

    test('más de 40 avisos de una persona en 10 minutos → se ignoran sin tocar la BD', async () => {
        for (let i = 0; i < 40; i++) await svc.reportar(USUARIOS[20], falla({ mensaje: `error ${i}` }), {});
        db.query.mockClear();
        const r = await reportar(falla({ mensaje: 'uno más' }));
        expect(r.body.data).toEqual({ ignorado: true, pedir_foto: false });
        expect(consultas().filter(s => s.includes('soporte_errores'))).toHaveLength(0);
        // Otra persona no se ve afectada.
        expect((await reportar(falla(), USUARIOS[21])).body.data.pedir_foto).toBe(true);
    });

    test('categoría desconocida → 400', async () => {
        expect((await reportar(falla({ categoria: 'otra' }))).status).toBe(400);
    });

    test('la firma agrupa por pantalla sin la consulta (?u=7) y separa por acción', () => {
        const a = svc._firmaDe('falla', 'm', 'POST /api/x', '/soporte?u=7');
        expect(svc._firmaDe('falla', 'm', 'POST /api/x', '/soporte?u=9')).toBe(a);
        expect(svc._firmaDe('falla', 'm', 'POST /api/y', '/soporte')).not.toBe(a);
    });

    test('no entra al historial (logs_actividad)', async () => {
        await reportar(falla());
        await new Promise(r => setImmediate(r));
        expect(consultas().some(s => s.startsWith('INSERT INTO logs_actividad'))).toBe(false);
    });
});

describe('La foto', () => {
    const subir = (foto, u = USUARIOS[20]) => request(app).post('/api/soporte/errores/99/foto').set('Authorization', `Bearer ${sesion(u)}`).send({ foto });

    test('una imagen de verdad, de la dueña → se guarda', async () => {
        const r = await subir(jpeg());
        expect(r.status).toBe(200);
        const llamada = db.query.mock.calls.find(([sql]) => String(sql).includes('SET foto = ?, foto_mime = ?'));
        expect(llamada[1][3]).toBe(99);
        expect(llamada[1][4]).toBe(20);
        expect(String(llamada[0])).toMatch(/foto_pedida = 1 AND foto IS NULL AND foto_borrada_en IS NULL/);
    });

    test('formato raro, bytes que no son la imagen o más de 200 KB → 400', async () => {
        expect((await subir('data:text/plain;base64,aG9sYQ==')).status).toBe(400);
        expect((await subir(`data:image/png;base64,${Buffer.from('no soy png').toString('base64')}`)).status).toBe(400);
        const r = await subir(jpeg(201 * 1024));
        expect(r.status).toBe(400);
        expect(r.body.code || r.body.error).toBeTruthy();
    });

    test('si no la pidió el servidor, ya tiene foto o es de otra persona → 409', async () => {
        FILAS_AFECTADAS = 0;
        expect((await subir(jpeg())).status).toBe(409);
    });

    test('«Quitar» la borra (solo la dueña)', async () => {
        const r = await request(app).delete('/api/soporte/errores/99/foto').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`);
        expect(r.status).toBe(200);
        const llamada = db.query.mock.calls.find(([sql]) => String(sql).includes('foto_borrada_en = NOW()') && String(sql).includes('usuario_id = ?'));
        expect(llamada[1]).toEqual([99, 20]);
    });
});

describe('La bandeja: solo el Super Administrador', () => {
    test.each([
        ['GET', '/api/soporte/errores'],
        ['GET', '/api/soporte/errores/resumen'],
        ['GET', '/api/soporte/errores/5/foto'],
        ['PATCH', '/api/soporte/errores/5'],
    ])('%s %s con otra persona → 403', async (metodo, ruta) => {
        const r = await request(app)[metodo.toLowerCase()](ruta).set('Authorization', `Bearer ${sesion(USUARIOS[20])}`).send({ estado: 'revisado' });
        expect(r.status).toBe(403);
    });

    test('rol 1 → la lista, con el nombre de los permisos que faltaban', async () => {
        LISTA = [{ id: 5, usuario_id: 20, usuario_nombre: 'Tomás Vera', categoria: 'permiso', mensaje: 'No tienes permisos para esta acción', permisos_faltantes: 'trabajadores.editar', veces: 1, tiene_foto: 0, foto_pedida: 0 }];
        const r = await request(app).get('/api/soporte/errores?vista=revisar').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        expect(r.status).toBe(200);
        expect(r.headers['cache-control']).toBe('no-store');
        expect(r.body.data[0].permisos_faltantes).toEqual([{ clave: 'trabajadores.editar', nombre: 'Editar Trabajadores' }]);
        expect(r.body.data[0].tiene_foto).toBe(false);
        const sql = consultas().find(s => s.includes('FROM soporte_errores e'));
        expect(sql).toMatch(/e\.categoria IN \('falla', 'app', 'permiso'\) AND e\.estado = 'pendiente'/);
        expect(sql).not.toMatch(/(^|[\s,])e\.foto\s*,/); // la foto (blob) no viaja en la lista
    });

    test('resumen → pendientes y lentitud de la última hora', async () => {
        const r = await request(app).get('/api/soporte/errores/resumen').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        expect(r.body.data).toEqual({ pendientes: 3, lentos: { personas: 4, veces: 9, desde: null, hasta: null } });
    });

    test('marcar revisado guarda quién y la nota; estado raro → 400', async () => {
        const ok = await request(app).patch('/api/soporte/errores/5').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send({ estado: 'revisado', nota: 'Arreglado' });
        expect(ok.status).toBe(200);
        const llamada = db.query.mock.calls.find(([sql]) => String(sql).includes('SET estado = ?'));
        expect(llamada[1]).toEqual(['revisado', 'Arreglado', 1, 5]);
        const malo = await request(app).patch('/api/soporte/errores/5').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send({ estado: 'borrado' });
        expect(malo.status).toBe(400);
    });

    test('la limpieza de los 30 días corre al abrir la bandeja (a lo más una vez por hora)', async () => {
        await request(app).get('/api/soporte/errores').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        await request(app).get('/api/soporte/errores').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        const fotos = consultas().filter(s => s.includes('SET foto = NULL') && s.includes('INTERVAL 30 DAY'));
        expect(fotos).toHaveLength(1);
        expect(consultas().some(s => /DELETE FROM soporte_errores\s+WHERE categoria IN \('lento', 'sin_senal', 'dato'\)/.test(s))).toBe(true);
    });
});

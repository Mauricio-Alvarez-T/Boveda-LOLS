/**
 * Tests de Ideas para Bóveda (mig 120, docs/reglas/ideas.md).
 *
 * Lo que fijan:
 *   · sin mínimo de caracteres (15-10), pero nada vacío; una idea sin frecuencia /
 *     alcance / beneficio NO entra; una falla sin "qué esperabas" tampoco,
 *   · proponer no pide permiso (basta estar logueado); la bandeja y revisar sí
 *     (`ideas.revisar`) → 403 sin él,
 *   · "Mis ideas" nunca expone la nota interna ni el navegador,
 *   · transiciones: desechar exige motivo; una transición inválida es 400;
 *     cada cambio de estado deja una novedad para el autor (visto_por_autor = 0),
 *   · la falla avisa por correo a los revisores y un SMTP caído no rompe el alta,
 *   · el crédito público de lo hecho usa nombre de pila + inicial.
 *
 * Mocks de BD, logger y correo; sin conexión real.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    requestLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
jest.mock('../src/services/email.service', () => ({
    sendSystemEmail: jest.fn().mockResolvedValue({ messageId: 'x' }),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const emailService = require('../src/services/email.service');
const svc = require('../src/services/ideas.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (permisos = []) => jwt.sign({ id: 7, email: 'paula@lols.cl', rol_id: 3, rv: 1, p: permisos }, SECRET);

const IDEA_OK = {
    tipo: 'idea',
    resumen: 'Que el botón Guardar quede siempre visible',
    detalle: 'En el celular el botón Guardar queda abajo y no se ve; dos veces creí que había guardado la asistencia.',
    frecuencia: 'diaria',
    alcance: 'obra',
    beneficio: 'errores',
    pantalla: '/asistencia',
    pantalla_nombre: 'Asistencia',
    dispositivo: 'movil',
};

const flush = () => new Promise(r => setImmediate(r));

describe('ideasService.crear — mejoras, no mañas', () => {
    beforeEach(() => jest.clearAllMocks());
    const usuario = { id: 7 };

    test('una idea bien justificada entra como pendiente', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 41 }]);
        const r = await svc.crear(IDEA_OK, usuario, { headers: { 'user-agent': 'Mozilla/5.0' } });
        expect(r).toEqual({ id: 41, tipo: 'idea', estado: 'pendiente', tiene_foto: false });
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO ideas/);
        expect(params[0]).toBe(7);                  // con nombre: siempre el usuario logueado
        expect(params).toContain('diaria');
        expect(params[params.length - 1]).toBe('Mozilla/5.0');
        expect(emailService.sendSystemEmail).not.toHaveBeenCalled();   // una idea no manda correo
    });

    test('sin mínimo de caracteres: un texto corto entra; vacío (o solo espacios) no', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 44 }]);
        await expect(svc.crear({ ...IDEA_OK, resumen: 'Colores', detalle: 'me cuesta leer' }, usuario, {}))
            .resolves.toMatchObject({ id: 44 });
        await expect(svc.crear({ ...IDEA_OK, detalle: '   ' }, usuario, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_DETALLE_VACIO' });
    });

    test('sin frecuencia, alcance o beneficio no entra', async () => {
        for (const falta of ['frecuencia', 'alcance', 'beneficio']) {
            await expect(svc.crear({ ...IDEA_OK, [falta]: undefined }, usuario, {}))
                .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FALTAN_SENALES' });
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('resumen vacío no entra', async () => {
        await expect(svc.crear({ ...IDEA_OK, resumen: '  ' }, usuario, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_RESUMEN_VACIO' });
    });

    test('"Tengo una idea" guarda cómo lo hace hoy; "Algo me cuesta" no usa ese campo', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 45 }]);
        await svc.crear({ ...IDEA_OK, tipo: 'idea', esperado: 'Reviso el Excel a mano cada lunes' }, usuario, {});
        expect(db.query.mock.calls[0][1][4]).toBe('Reviso el Excel a mano cada lunes');

        db.query.mockResolvedValueOnce([{ insertId: 46 }]);
        await svc.crear({ ...IDEA_OK, tipo: 'cuesta', esperado: 'no aplica' }, usuario, {});
        expect(db.query.mock.calls[1][1][4]).toBeNull();
    });

    test('una falla exige "qué esperabas" y no guarda las señales de idea', async () => {
        const falla = {
            tipo: 'falla',
            resumen: 'Estaba guardando la asistencia de la obra',
            detalle: 'Toqué Guardar y salió un error rojo, después la lista quedó vacía y tuve que marcar de nuevo.',
            frecuencia: 'diaria',
        };
        await expect(svc.crear(falla, usuario, {})).rejects.toMatchObject({ code: 'IDEA_FALTA_ESPERADO' });

        db.query.mockResolvedValueOnce([{ insertId: 42 }]);
        await svc.crear({ ...falla, esperado: 'Que se guardara y quedara marcado en verde.' }, usuario, {});
        const params = db.query.mock.calls[0][1];
        expect(params[4]).toBe('Que se guardara y quedara marcado en verde.');
        expect(params[5]).toBeNull();               // frecuencia no aplica a falla
    });

    test('una falla avisa por correo a los revisores; si el SMTP falla, el alta igual queda', async () => {
        db.query
            .mockResolvedValueOnce([{ insertId: 43 }])                                   // INSERT
            .mockResolvedValueOnce([[{ id: 43, autor_nombre: 'Paula Rojas', autor_rol: 'RRHH', resumen: 'Guardando asistencia', detalle: 'x'.repeat(50), esperado: 'que guarde', pantalla_nombre: 'Asistencia', dispositivo: 'movil' }]])
            .mockResolvedValueOnce([[{ email: 'marcos@lols.cl' }, { email: 'mauricio@lols.cl' }]]);
        emailService.sendSystemEmail.mockRejectedValueOnce(new Error('SMTP caído'));

        const r = await svc.crear({
            tipo: 'falla', resumen: 'Guardando la asistencia', detalle: 'x'.repeat(50), esperado: 'que guarde',
        }, usuario, {});
        await flush(); await flush();

        expect(r.id).toBe(43);
        expect(emailService.sendSystemEmail).toHaveBeenCalledTimes(1);
        expect(emailService.sendSystemEmail.mock.calls[0][0].to).toEqual(['marcos@lols.cl', 'mauricio@lols.cl']);
    });
});

describe('ideasService — Mis ideas y crédito', () => {
    beforeEach(() => jest.clearAllMocks());

    test('Mis ideas no expone nota interna, navegador ni email, y marca novedades', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, usuario_id: 7, estado: 'desechada', motivo: 'ya_existe', respuesta: 'Ya existe en Ayuda', nota_interna: 'repetida de la #3', navegador: 'UA', revisado_por: 2, autor_email: 'p@l.cl', visto_por_autor: 0 },
            { id: 2, usuario_id: 7, estado: 'pendiente', nota_interna: null, navegador: 'UA', revisado_por: null, autor_email: 'p@l.cl', visto_por_autor: 1 },
        ]]);
        const rows = await svc.misIdeas(7);
        expect(rows[0]).not.toHaveProperty('nota_interna');
        expect(rows[0]).not.toHaveProperty('navegador');
        expect(rows[0]).not.toHaveProperty('autor_email');
        expect(rows[0].novedad).toBe(true);
        expect(rows[1].novedad).toBe(false);
        expect(db.query.mock.calls[0][1]).toEqual([7]);   // solo las del usuario
    });

    test('hechas recientes da crédito con nombre de pila + inicial', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 9, resumen: 'Guardar siempre visible', autor_nombre: 'Paula Andrea Rojas', hecha_en: '2026-10-10' },
            { id: 8, resumen: 'Otra', autor_nombre: 'Daphne', hecha_en: '2026-10-09' },
        ]]);
        const r = await svc.hechasRecientes();
        expect(r[0].autor).toBe('Paula A.');
        expect(r[1].autor).toBe('Daphne');
        expect(r[0]).not.toHaveProperty('autor_nombre');
    });
});

describe('ideasService.revisar — transiciones', () => {
    beforeEach(() => jest.clearAllMocks());
    const fila = (estado) => [[{ id: 5, estado, respuesta: null }]];

    test('desechar sin motivo → 400', async () => {
        db.query.mockResolvedValueOnce(fila('pendiente'));
        await expect(svc.revisar(5, { estado: 'desechada' }, 2, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FALTA_MOTIVO' });
    });

    test('transición inválida (pendiente → hecha) → 400', async () => {
        db.query.mockResolvedValueOnce(fila('pendiente'));
        await expect(svc.revisar(5, { estado: 'hecha' }, 2, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_TRANSICION' });
    });

    test('aceptar registra revisor y deja novedad para el autor', async () => {
        db.query
            .mockResolvedValueOnce(fila('pendiente'))
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 5, estado: 'aceptada' }]]);
        const r = await svc.revisar(5, { estado: 'aceptada', respuesta: 'Buena idea, la hacemos.' }, 2, {});
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/estado = \?/);
        expect(sql).toMatch(/visto_por_autor = 0/);
        expect(params).toContain('aceptada');
        expect(params).toContain(2);
        expect(params).toContain('Buena idea, la hacemos.');
        expect(r.estado).toBe('aceptada');
    });

    test('editar solo la nota interna NO deja novedad para el autor', async () => {
        db.query
            .mockResolvedValueOnce(fila('aceptada'))
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 5 }]]);
        await svc.revisar(5, { nota_interna: 'Esto lo hace Mauricio' }, 2, {});
        expect(db.query.mock.calls[1][0]).not.toMatch(/visto_por_autor/);
    });

    test('idea inexistente → 404', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(svc.revisar(99, { estado: 'aceptada' }, 2, {})).rejects.toMatchObject({ statusCode: 404 });
    });
});

describe('Rutas /api/ideas — gates', () => {
    beforeEach(() => jest.clearAllMocks());

    test('proponer NO pide permiso: basta estar logueado', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 50 }]);
        const r = await request(app).post('/api/ideas').set('Authorization', `Bearer ${token([])}`).send(IDEA_OK);
        expect(r.status).toBe(201);
        expect(r.body.data.id).toBe(50);
    });

    test('sin sesión → 401', async () => {
        const r = await request(app).post('/api/ideas').send(IDEA_OK);
        expect(r.status).toBe(401);
    });

    test('tipo fuera de la lista → 400 del schema', async () => {
        const r = await request(app).post('/api/ideas').set('Authorization', `Bearer ${token([])}`).send({ ...IDEA_OK, tipo: 'queja' });
        expect(r.status).toBe(400);
    });

    test('la bandeja exige ideas.revisar', async () => {
        const sin = await request(app).get('/api/ideas').set('Authorization', `Bearer ${token([])}`);
        expect(sin.status).toBe(403);
        const count = await request(app).get('/api/ideas/pendientes/count').set('Authorization', `Bearer ${token([])}`);
        expect(count.status).toBe(403);
        const patch = await request(app).patch('/api/ideas/5').set('Authorization', `Bearer ${token([])}`).send({ estado: 'aceptada' });
        expect(patch.status).toBe(403);
    });

    test('con ideas.revisar la bandeja responde con ideas y resumen', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ estado: 'pendiente', n: 1, mas_antigua: '2026-10-01' }]]);
        const r = await request(app).get('/api/ideas').set('Authorization', `Bearer ${token(['ideas.revisar'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data.resumen.pendiente).toBe(1);
        expect(r.body.data.ideas).toHaveLength(1);
    });

    test('Mis ideas no pide permiso', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const r = await request(app).get('/api/ideas/mias').set('Authorization', `Bearer ${token([])}`);
        expect(r.status).toBe(200);
    });
});

describe('Ideas — foto opcional (mig 121)', () => {
    beforeEach(() => jest.clearAllMocks());

    // Bytes mínimos con la firma real de cada formato.
    const JPEG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(200, 7)]);
    const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), Buffer.alloc(100, 1)]);
    const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

    test('una foto WEBP válida se guarda en la fila con su tipo y su peso', async () => {
        db.query.mockResolvedValueOnce([{ insertId: 60 }]);
        const r = await svc.crear({ ...IDEA_OK, foto: dataUrl('image/webp', WEBP) }, { id: 7 }, {});
        expect(r.tiene_foto).toBe(true);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/foto, foto_mime, foto_bytes/);
        const buf = params.find(x => Buffer.isBuffer(x));
        expect(buf.equals(WEBP)).toBe(true);
        expect(params).toContain('image/webp');
        expect(params).toContain(WEBP.length);
    });

    test('un data URL que miente sobre el formato → 400 y no se guarda nada', async () => {
        await expect(svc.crear({ ...IDEA_OK, foto: dataUrl('image/png', JPEG) }, { id: 7 }, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FOTO_FORMATO' });
        await expect(svc.crear({ ...IDEA_OK, foto: 'data:application/pdf;base64,AAAA' }, { id: 7 }, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FOTO_FORMATO' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('más de 12 KB → 400 (red de seguridad si alguien se salta la compresión)', async () => {
        const grande = Buffer.concat([Buffer.from([0xFF, 0xD8]), Buffer.alloc(svc.MAX_FOTO_BYTES, 1)]);
        await expect(svc.crear({ ...IDEA_OK, foto: dataUrl('image/jpeg', grande) }, { id: 7 }, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FOTO_PESADA' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('getFoto: el autor y un revisor la ven; otro usuario no; sin foto → 404', async () => {
        const fila = [[{ usuario_id: 7, foto: JPEG, foto_mime: 'image/jpeg' }]];
        db.query.mockResolvedValueOnce(fila);
        await expect(svc.getFoto(60, { id: 7, p: [] })).resolves.toMatchObject({ mime: 'image/jpeg' });
        db.query.mockResolvedValueOnce(fila);
        await expect(svc.getFoto(60, { id: 2, p: ['ideas.revisar'] })).resolves.toMatchObject({ mime: 'image/jpeg' });
        db.query.mockResolvedValueOnce(fila);
        await expect(svc.getFoto(60, { id: 9, p: [] })).rejects.toMatchObject({ statusCode: 403 });
        db.query.mockResolvedValueOnce([[{ usuario_id: 7, foto: null, foto_mime: null }]]);
        await expect(svc.getFoto(60, { id: 7, p: [] })).rejects.toMatchObject({ statusCode: 404 });
    });

    test('la bandeja nunca trae el BLOB: solo tiene_foto como booleano', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, estado: 'pendiente', tiene_foto: 1 }, { id: 2, estado: 'pendiente', tiene_foto: 0 }]])
            .mockResolvedValueOnce([[]]);
        const r = await svc.bandeja({});
        expect(db.query.mock.calls[0][0]).not.toMatch(/i\.\*/);
        expect(db.query.mock.calls[0][0]).toMatch(/\(i\.foto IS NOT NULL\) AS tiene_foto/);
        expect(r.ideas.map(i => i.tiene_foto)).toEqual([true, false]);
    });

    test('GET /api/ideas/:id/foto responde la imagen con su tipo', async () => {
        db.query.mockResolvedValueOnce([[{ usuario_id: 7, foto: JPEG, foto_mime: 'image/jpeg' }]]);
        const r = await request(app).get('/api/ideas/60/foto').set('Authorization', `Bearer ${token([])}`);
        expect(r.status).toBe(200);
        expect(r.headers['content-type']).toMatch(/image\/jpeg/);
        expect(Buffer.from(r.body).equals(JPEG)).toBe(true);
    });
});

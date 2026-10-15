/**
 * Tests de Ideas para Bóveda (mig 120, docs/reglas/ideas.md).
 *
 * Lo que fijan:
 *   · "mejoras, no mañas": una idea sin el problema contado, o sin frecuencia /
 *     alcance / beneficio, NO entra; una falla sin "qué esperabas" tampoco,
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
        expect(r).toEqual({ id: 41, tipo: 'idea', estado: 'pendiente' });
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/INSERT INTO ideas/);
        expect(params[0]).toBe(7);                  // con nombre: siempre el usuario logueado
        expect(params).toContain('diaria');
        expect(params[params.length - 1]).toBe('Mozilla/5.0');
        expect(emailService.sendSystemEmail).not.toHaveBeenCalled();   // una idea no manda correo
    });

    test('sin el problema contado (< 40) no entra', async () => {
        await expect(svc.crear({ ...IDEA_OK, detalle: 'Porque me gusta más' }, usuario, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_DETALLE_CORTO' });
        expect(db.query).not.toHaveBeenCalled();
    });

    test('sin frecuencia, alcance o beneficio no entra', async () => {
        for (const falta of ['frecuencia', 'alcance', 'beneficio']) {
            await expect(svc.crear({ ...IDEA_OK, [falta]: undefined }, usuario, {}))
                .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_FALTAN_SENALES' });
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('resumen demasiado corto no entra', async () => {
        await expect(svc.crear({ ...IDEA_OK, resumen: 'Color' }, usuario, {}))
            .rejects.toMatchObject({ statusCode: 400, code: 'IDEA_RESUMEN_CORTO' });
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

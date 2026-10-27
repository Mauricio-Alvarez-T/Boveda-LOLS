/**
 * Avisos al celular (mig 143, piloto solo Super Administrador; docs/reglas/seguridad-rbac.md § Avisos al celular).
 *   - las rutas son solo del rol 1 (en el token y en la BD), nunca con «ver como»;
 *   - la suscripción se valida (https, claves) y se guarda por celular (sha1 del endpoint), de esa persona;
 *   - las claves: se crean una vez y se reutilizan;
 *   - un celular que ya no existe (404/410) se borra; otro error queda anotado; enviar nunca lanza;
 *   - una falla real NUEVA en Soporte avisa a los Super Administradores; un repetido o un «lento» no.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('web-push', () => ({
    generateVAPIDKeys: jest.fn(() => ({ publicKey: 'BPUBLICA', privateKey: 'privada' })),
    sendNotification: jest.fn().mockResolvedValue({ statusCode: 201 }),
}));
jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const webpush = require('web-push');
const db = require('../src/config/db');
const app = require('../index');
const svc = require('../src/services/avisosCelular.service');
const soporteErrores = require('../src/services/soporteErrores.service');

const SECRETO = process.env.JWT_SECRET || 'secret';
const USUARIOS = {
    1: { id: 1, nombre: 'Marcos Uribe', email: 'marcos@lols.cl', rol_id: 1, activo: 1 },
    20: { id: 20, nombre: 'Tomás Vera', email: 'tomas@lols.cl', rol_id: 7, activo: 1 },
};
const sesion = (u, extra = {}) => jwt.sign({ typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, p: [], rv: 1, ...extra }, SECRETO, { expiresIn: '8h' });
const SUB = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };

let CLAVES = null;
let SUBS = [];
function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = USUARIOS[params[0]];
            return [u ? [u] : []];
        }
        if (s.startsWith('SELECT publica, privada FROM avisos_celular_claves')) return [CLAVES ? [CLAVES] : []];
        if (s.startsWith('INSERT IGNORE INTO avisos_celular_claves')) { CLAVES = { publica: params[0], privada: params[1] }; return [{ affectedRows: 1 }]; }
        if (s.startsWith('SELECT id, endpoint, p256dh, auth FROM avisos_celular_suscripciones')) return [SUBS];
        if (s.startsWith('SELECT endpoint_hash, dispositivo, ultimo_envio, ultimo_error, created_at')) {
            return [SUBS.map(x => ({ endpoint_hash: 'abcdef0123456789', dispositivo: 'Chrome Android', ultimo_envio: x.ultimo_envio ?? null, ultimo_error: x.ultimo_error ?? null, created_at: '2026-10-27T12:00:00.000Z' }))];
        }
        if (s.startsWith('SELECT id FROM usuarios WHERE rol_id = 1')) return [[{ id: 1 }]];
        if (s.startsWith('SELECT nombre FROM usuarios WHERE id = ?')) return [[{ nombre: USUARIOS[params[0]]?.nombre }]];
        if (s.includes('FROM soporte_errores') && s.includes('firma = ?')) return [[]];
        if (s.includes('AS persona_hoy')) return [[{ persona_hoy: 0, hoy: 0, bytes: 0 }]];
        if (s.startsWith('INSERT INTO soporte_errores')) return [{ insertId: 99 }];
        return [{ affectedRows: 1 }];
    });
}
const consultas = () => db.query.mock.calls.map(([sql]) => String(sql));
const esperar = () => new Promise(r => setImmediate(r));

beforeEach(() => {
    jest.clearAllMocks();
    svc._olvidarClaves();
    soporteErrores._reiniciar();
    CLAVES = null;
    SUBS = [];
    bd();
});

describe('rutas: cada persona maneja SUS celulares; el resumen es del Super Administrador', () => {
    test.each([
        ['get', '/api/avisos-celular/clave'],
        ['get', '/api/avisos-celular/estado'],
        ['post', '/api/avisos-celular/suscribir'],
    ])('%s %s: cualquier persona con sesión → 200; sin sesión → 401', async (m, ruta) => {
        expect((await request(app)[m](ruta).set('Authorization', `Bearer ${sesion(USUARIOS[20])}`).send(SUB)).status).toBe(200);
        expect((await request(app)[m](ruta).send(SUB)).status).toBe(401);
    });

    test('la suscripción queda a nombre de quien la hizo (no de otro)', async () => {
        await request(app).post('/api/avisos-celular/suscribir').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`).send(SUB);
        const llamada = db.query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO avisos_celular_suscripciones'));
        expect(llamada[1][0]).toBe(20);
    });

    test('/resumen: otra persona → 403', async () => {
        expect((await request(app).get('/api/avisos-celular/resumen').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`)).status).toBe(403);
    });

    test('estado: debe_activar si está en el horario de recordatorios; con «ver como», nunca', async () => {
        const leo = { id: 30, email: 'leonardolopez@lols.cl', rol_id: 2 };
        USUARIOS[30] = { ...leo, nombre: 'Leonardo López', activo: 1 };
        const r = await request(app).get('/api/avisos-celular/estado').set('Authorization', `Bearer ${sesion(leo)}`);
        expect(r.body.data.debe_activar).toBe(true);
        const otro = await request(app).get('/api/avisos-celular/estado').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`);
        expect(otro.body.data.debe_activar).toBe(false);
        const mirando = await request(app).get('/api/avisos-celular/estado').set('Authorization', `Bearer ${sesion(leo, { imp: 1, ro: true })}`);
        expect(mirando.body.data.debe_activar).toBe(false);
    });

    test('con «ver como» no se suscribe (auth frena lo que no es GET)', async () => {
        const r = await request(app).post('/api/avisos-celular/suscribir').set('Authorization', `Bearer ${sesion(USUARIOS[1], { imp: 1, ro: true })}`).send(SUB);
        expect(r.status).toBe(403);
    });
});

describe('claves', () => {
    test('se crean una vez y después se reutilizan', async () => {
        const r1 = await request(app).get('/api/avisos-celular/clave').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        expect(r1.body.data.clave).toBe('BPUBLICA');
        expect(webpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
        svc._olvidarClaves();
        await request(app).get('/api/avisos-celular/clave').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        expect(webpush.generateVAPIDKeys).toHaveBeenCalledTimes(1);
    });
});

describe('suscribir', () => {
    test('guarda el celular de esa persona, por sha1 del endpoint (sin el número de teléfono)', async () => {
        const r = await request(app).post('/api/avisos-celular/suscribir').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send(SUB);
        expect(r.status).toBe(200);
        const llamada = db.query.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO avisos_celular_suscripciones'));
        expect(llamada[1][0]).toBe(1);
        expect(llamada[1][1]).toBe(SUB.endpoint);
        expect(llamada[1][2]).toMatch(/^[0-9a-f]{40}$/);
        expect(String(llamada[0])).toMatch(/ON DUPLICATE KEY UPDATE usuario_id = VALUES\(usuario_id\)/);
    });

    test.each([
        ['sin https', { ...SUB, endpoint: 'http://fcm.googleapis.com/x' }],
        ['claves raras', { ...SUB, keys: { p256dh: 'no válida!', auth: 'x' } }],
        ['sin claves', { endpoint: SUB.endpoint }],
    ])('inválida (%s) → 400', async (_, body) => {
        const r = await request(app).post('/api/avisos-celular/suscribir').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`).send(body);
        expect(r.status).toBe(400);
    });
});

describe('enviar', () => {
    test('a todos los celulares de esas personas, con la carga corta', async () => {
        SUBS = [{ id: 5, ...SUB, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth }];
        const r = await svc.enviarA([1, 1], { titulo: 'Hola', cuerpo: 'x'.repeat(300), url: '/soporte' });
        expect(r).toEqual({ enviados: 1, fallidos: 0 });
        const [sub, carga, opciones] = webpush.sendNotification.mock.calls[0];
        expect(sub.endpoint).toBe(SUB.endpoint);
        const c = JSON.parse(carga);
        expect(c.cuerpo.length).toBeLessThanOrEqual(180);
        expect(c.url).toBe('/soporte');
        expect(opciones.vapidDetails.publicKey).toBe('BPUBLICA');
        // Urgente: Android no lo retiene con la pantalla apagada.
        expect(opciones.urgency).toBe('high');
    });

    test('una url de afuera no se acepta (lleva al inicio)', async () => {
        SUBS = [{ id: 5, endpoint: SUB.endpoint, p256dh: SUB.keys.p256dh, auth: SUB.keys.auth }];
        await svc.enviarA([1], { cuerpo: 'x', url: 'https://otro.sitio' });
        expect(JSON.parse(webpush.sendNotification.mock.calls[0][1]).url).toBe('/');
    });

    test('un celular que ya no existe (410) se borra; otro error queda anotado; nunca lanza', async () => {
        SUBS = [{ id: 5, endpoint: SUB.endpoint, p256dh: 'p', auth: 'a' }, { id: 6, endpoint: `${SUB.endpoint}2`, p256dh: 'p', auth: 'a' }];
        webpush.sendNotification
            .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }))
            .mockRejectedValueOnce(Object.assign(new Error('Server'), { statusCode: 500 }));
        const r = await svc.enviarA([1], { cuerpo: 'x' });
        expect(r).toEqual({ enviados: 0, fallidos: 2 });
        expect(db.query.mock.calls.some(([sql, p]) => String(sql).startsWith('DELETE FROM avisos_celular_suscripciones WHERE id = ?') && p[0] === 5)).toBe(true);
        expect(db.query.mock.calls.some(([sql, p]) => String(sql).includes('SET ultimo_error = ?') && p[0] === '500' && p[1] === 6)).toBe(true);
    });

    test('sin celulares activos, «probar» responde 409 con un mensaje claro', async () => {
        const r = await request(app).post('/api/avisos-celular/probar').set('Authorization', `Bearer ${sesion(USUARIOS[20])}`);
        expect(r.status).toBe(409);
        expect(r.body.error).toMatch(/activados en este celular/);
    });

    test('si web-push no estuviera instalado, enviar no rompe', async () => {
        SUBS = [{ id: 5, endpoint: SUB.endpoint, p256dh: 'p', auth: 'a' }];
        db.query.mockImplementationOnce(async () => { throw new Error('caído'); });
        await expect(svc.enviarA([1], { cuerpo: 'x' })).resolves.toMatchObject({ enviados: 0 });
    });
});

describe('estado', () => {
    test('cuenta los celulares y dice cuándo salió el último aviso y si lo rechazaron', async () => {
        SUBS = [{ id: 5, ultimo_envio: '2026-10-27T12:21:00.000Z', ultimo_error: null }, { id: 6, ultimo_error: '403' }];
        const r = await request(app).get('/api/avisos-celular/estado').set('Authorization', `Bearer ${sesion(USUARIOS[1])}`);
        expect(r.status).toBe(200);
        expect(r.body.data.celulares).toBe(2);
        expect(r.body.data.lista[0]).toMatchObject({ id: 'abcdef01', dispositivo: 'Chrome Android', ultimo_envio: '2026-10-27T12:21:00.000Z', ultimo_error: null });
        expect(r.body.data.lista[1].ultimo_error).toBe('403');
        expect(JSON.stringify(r.body)).not.toMatch(/fcm.googleapis|p256dh|auth"/);
    });
});

describe('«Nueva falla en Soporte»', () => {
    const falla = { categoria: 'falla', mensaje: 'No se pudo guardar', pantalla: '/inventario', pantalla_nombre: 'Inventario' };

    test('una falla real nueva avisa a los Super Administradores, con el nombre y la pantalla', async () => {
        SUBS = [{ id: 5, endpoint: SUB.endpoint, p256dh: 'p', auth: 'a' }];
        await soporteErrores.reportar(USUARIOS[20], falla, {});
        await esperar(); await esperar(); await esperar();
        expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
        const c = JSON.parse(webpush.sendNotification.mock.calls[0][1]);
        expect(c).toMatchObject({ titulo: 'Nueva falla en Soporte', url: '/soporte?vista=errores' });
        expect(c.cuerpo).toBe('A Tomás Vera le falló Inventario. Toca para verla.');
    });

    test('un «lento», un permiso o un repetido no avisan', async () => {
        SUBS = [{ id: 5, endpoint: SUB.endpoint, p256dh: 'p', auth: 'a' }];
        await soporteErrores.reportar(USUARIOS[20], { ...falla, categoria: 'lento' }, {});
        await soporteErrores.reportar(USUARIOS[20], { ...falla, categoria: 'permiso', mensaje: 'otro' }, {});
        db.query.mockImplementation(async (sql) => {
            const s = String(sql);
            if (s.includes('FROM soporte_errores') && s.includes('firma = ?')) return [[{ id: 55 }]];
            return [{ affectedRows: 1 }];
        });
        await soporteErrores.reportar(USUARIOS[20], falla, {});
        await esperar(); await esperar();
        expect(webpush.sendNotification).not.toHaveBeenCalled();
        expect(consultas().some(s => s.startsWith('SELECT id FROM usuarios WHERE rol_id = 1'))).toBe(false);
    });
});

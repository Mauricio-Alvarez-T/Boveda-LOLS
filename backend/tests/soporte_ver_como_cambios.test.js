/**
 * «Ver como» en MODO CAMBIOS (Marcos 2026-10-26, docs/reglas/seguridad-rbac.md § Ver como usuario).
 *
 * Cubre:
 *   - POST /api/soporte/ver-como/escritura SOLO acepta un token de «ver como» en solo lectura vigente (`imp` + `ro`):
 *     rechaza el token normal (aunque sea del Super Admin), el de modo cambios, un Super Admin degradado o inactivo,
 *     y una persona inactiva, inexistente o que ahora es rol 1;
 *   - el token nuevo: misma persona, permisos RE-LEÍDOS de la BD, `imp`, `ro: false`, `rw: true` y el MISMO `exp`
 *     (nunca más de 30 min desde ahora);
 *   - middleware de auth: con `rw` se escribe, salvo la lista bloqueada (contraseña, usuarios/roles/permisos, Soporte,
 *     correo desde su casilla), sin que mayúsculas, `%xx` o `//` la salten; sin `rw`, todo sigue en solo lectura;
 *   - historial: el paso a modo cambios y CADA escritura con `rw` quedan a nombre del Super Admin, marcadas
 *     «(como <persona> #id)», sin el body; también los intentos bloqueados; una sola fila por petición.
 */
const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn().mockResolvedValue({
        beginTransaction: jest.fn(), query: jest.fn().mockResolvedValue([[]]),
        commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    }),
}));

const db = require('../src/config/db');
const app = require('../index');
const auth = require('../src/middleware/auth');
const { activityLogger, atribuirVerComo } = require('../src/middleware/logger');

const SECRETO = process.env.JWT_SECRET || 'secret';

const USUARIOS = {
    1: { id: 1, nombre: 'Marcos Uribe', email: 'marcos@lols.cl', rol_id: 1, rol_nombre: 'Super Administrador', activo: 1, obra_id: null, bodega_id: null },
    2: { id: 2, nombre: 'Mauricio Torres', email: 'torres@lols.cl', rol_id: 1, rol_nombre: 'Super Administrador', activo: 1, obra_id: null, bodega_id: null },
    7: { id: 7, nombre: 'Leonardo López', email: 'leonardo@lols.cl', email_corporativo: null, rol_id: 3, rol_nombre: 'Administrador', activo: 1, obra_id: 4, bodega_id: 2, password_hash: 'NO-DEBE-SALIR' },
    8: { id: 8, nombre: 'Persona Inactiva', email: 'inactiva@lols.cl', rol_id: 4, rol_nombre: 'Jefe de Obra', activo: 0, obra_id: null, bodega_id: null },
};

/** Lo que cambia en la BD entre el «ver como» y el paso a modo cambios. */
let cambiosBd = {};
let permisosRol3 = [];

function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        const fila = (id) => (USUARIOS[id] ? { ...USUARIOS[id], ...(cambiosBd[id] || {}) } : null);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = fila(params[0]);
            return [u ? [u] : []];
        }
        if (s.startsWith('SELECT nombre AS label FROM usuarios WHERE id = ?')) {
            const u = fila(params[0]);
            return [u ? [{ label: u.nombre }] : []];
        }
        if (s.includes('FROM usuarios u') && s.includes('WHERE u.id = ?')) {
            const u = fila(params[0]);
            return [u ? [u] : []];
        }
        if (s.includes('FROM permisos_rol_v2')) return [permisosRol3.map(permiso_clave => ({ permiso_clave }))];
        if (s.includes('FROM permisos_usuario_override')) return [[]];
        if (s.startsWith('INSERT INTO logs_actividad')) return [{ insertId: 1 }];
        return [[]];
    });
}

/** Token de sesión como el del login (rv 1 = versionService sin inicializar). `vida` en segundos. */
function sesion(u, claims = {}, vida = 8 * 3600) {
    return jwt.sign({
        typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, obra_id: u.obra_id ?? null,
        bodega_id: u.bodega_id ?? null, p: ['inventario.ver'], rv: 1, ...claims,
    }, SECRETO, { expiresIn: vida });
}
const SUPER = () => sesion(USUARIOS[1]);
const lectura = (claims = {}, u = USUARIOS[7]) => sesion(u, { imp: 1, ro: true, ...claims }, 30 * 60);
const cambios = (claims = {}) => sesion(USUARIOS[7], { imp: 1, ro: false, rw: true, ...claims }, 20 * 60);

const insertsLog = () => db.query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO logs_actividad'));
/** Los logs de modo cambios se guardan al terminar la respuesta: esperar a que la cola se vacíe. */
const esperarLogs = () => new Promise(r => setTimeout(r, 30));

beforeEach(() => {
    jest.clearAllMocks();
    cambiosBd = {};
    permisosRol3 = ['inventario.ver', 'inventario.tab.transferencias', 'asistencia.ver'];
    bd();
});

describe('POST /api/soporte/ver-como/escritura', () => {
    // Con la sesión propia del Super Admin en `X-Sesion-Propia` (la que el frontend guarda en localStorage); `null` = sin él.
    const activar = (token, propio = SUPER()) => {
        const r = request(app).post('/api/soporte/ver-como/escritura').set('Authorization', `Bearer ${token}`);
        return propio === null ? r : r.set('X-Sesion-Propia', `Bearer ${propio}`);
    };

    test('desde «ver como» en solo lectura: token de la misma persona con rw, el MISMO exp, permisos re-leídos y al historial', async () => {
        const vc = await request(app).post('/api/soporte/usuarios/7/ver-como').set('Authorization', `Bearer ${SUPER()}`);
        expect(vc.status).toBe(200);
        const ro = vc.body.data.token;
        const expRo = jwt.decode(ro).exp;

        // Mientras miraba, a su rol le quitaron la asistencia: el token de cambios ya no la trae.
        permisosRol3 = ['inventario.ver', 'inventario.tab.transferencias'];
        jest.clearAllMocks();
        bd();

        const res = await activar(ro);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const { token, vence, modo, quien } = res.body.data;
        const t = jwt.verify(token, SECRETO);
        expect(t).toMatchObject({ typ: 'session', id: 7, email: 'leonardo@lols.cl', rol_id: 3, obra_id: 4, bodega_id: 2, rv: 1, imp: 1, ro: false, rw: true });
        expect([...t.p].sort()).toEqual(['inventario.tab.transferencias', 'inventario.ver']);
        expect(t.exp).toBe(expRo);
        expect(new Date(vence).getTime()).toBe(expRo * 1000);
        expect(modo).toBe('cambios');
        expect(quien).toEqual({ id: 1, nombre: 'Marcos Uribe' });
        expect(JSON.stringify(res.body)).not.toContain('NO-DEBE-SALIR');

        // Historial: UNA fila, a nombre del Super Admin, «Marcos activó cambios como Leonardo».
        const logs = insertsLog();
        expect(logs).toHaveLength(1);
        const [usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle] = logs[0][1];
        expect([usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label]).toEqual([1, 'soporte', 'LOGIN', '7', 'usuario', 'Leonardo López']);
        const d = JSON.parse(detalle);
        expect(d).toMatchObject({ evento: 'ver_como_cambios', usuario_id: 7, ver_como_modo: 'cambios' });
        expect(d.resumen).toBe('Marcos Uribe activó cambios como Leonardo López (Administrador)');
    });

    test.each([
        ['sin el encabezado', () => null],
        ['con el token propio de otra persona (otro Super Admin)', () => sesion(USUARIOS[2])],
        ['con el token propio de una persona que no es rol 1', () => sesion(USUARIOS[7])],
        ['con un token de id 1 pero que no dice rol 1', () => sesion({ ...USUARIOS[1], rol_id: 3 })],
        ['con un token de «ver como» en vez del propio', () => lectura()],
        ['con un token de modo cambios en vez del propio', () => cambios()],
        ['con un token propio que trae `ro: false`', () => sesion(USUARIOS[1], { ro: false })],
        ['con un rv viejo (cambiaron los permisos de su rol)', () => sesion(USUARIOS[1], { rv: 0 })],
        ['con un token propio vencido', () => jwt.sign({ typ: 'session', id: 1, rol_id: 1, p: [], rv: 1, exp: Math.floor(Date.now() / 1000) - 5 }, SECRETO)],
        ['con un token propio firmado con otra clave', () => jwt.sign({ typ: 'session', id: 1, rol_id: 1, p: [], rv: 1 }, 'otra-clave', { expiresIn: 600 })],
        ['con un token propio sin typ (legado)', () => jwt.sign({ id: 1, rol_id: 1, p: [], rv: 1 }, SECRETO, { expiresIn: 600 })],
        ['con basura', () => 'no-es-un-jwt'],
    ])('exige la sesión propia del Super Admin: rechaza %s', async (_q, propio) => {
        const res = await activar(lectura(), propio());
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Para activar cambios vuelve a entrar a tu cuenta.', code: 'SESION_PROPIA_REQUERIDA' });
        expect(insertsLog()).toHaveLength(0);
    });

    test('el encabezado sin «Bearer » tampoco sirve; con el correcto → 200 y el token propio no queda en el historial', async () => {
        const propio = SUPER();
        let res = await request(app).post('/api/soporte/ver-como/escritura').set('Authorization', `Bearer ${lectura()}`).set('X-Sesion-Propia', propio);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SESION_PROPIA_REQUERIDA');
        res = await activar(lectura(), propio);
        expect(res.status).toBe(200);
        expect(JSON.stringify(insertsLog())).not.toContain(propio);
    });

    test('nunca alarga: un token de solo lectura que durara más igual queda en 30 min desde ahora', async () => {
        const largo = sesion(USUARIOS[7], { imp: 1, ro: true }, 2 * 3600);
        const res = await activar(largo);
        expect(res.status).toBe(200);
        const t = jwt.decode(res.body.data.token);
        expect(t.exp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000) + 30 * 60);
        expect(t.exp).toBeLessThan(jwt.decode(largo).exp);
    });

    test.each([
        ['el token normal del Super Admin', () => SUPER(), 403, 'VER_COMO_REQUERIDO'],
        ['el token normal de la persona', () => sesion(USUARIOS[7]), 403, 'VER_COMO_REQUERIDO'],
        ['un token de modo cambios', () => cambios(), 409, 'VER_COMO_YA_EN_CAMBIOS'],
        ['un token con imp pero sin ro', () => sesion(USUARIOS[7], { imp: 1 }, 1800), 403, 'VER_COMO_REQUERIDO'],
        ['un token con imp = la misma persona', () => lectura({ imp: 7 }), 403, 'VER_COMO_REQUERIDO'],
        ['un token sin typ (legado)', () => jwt.sign({ id: 7, rol_id: 3, p: [], rv: 1, imp: 1, ro: true }, SECRETO, { expiresIn: 600 }), 403, 'VER_COMO_REQUERIDO'],
        ['una persona inactiva', () => lectura({}, USUARIOS[8]), 409, 'USUARIO_INACTIVO'],
        ['una persona que no existe', () => lectura({}, { id: 999, email: 'x@x', rol_id: 3 }), 404, 'USUARIO_NO_EXISTE'],
    ])('rechaza %s', async (_q, token, status, code) => {
        const res = await activar(token());
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(res.body.data).toBeUndefined();
        await esperarLogs();
        // Nunca queda «activó cambios». Con el token de cambios, sí queda el INTENTO (toda escritura con rw se registra).
        const eventos = insertsLog().map(c => JSON.parse(c[1][6]).evento);
        expect(eventos).toEqual(code === 'VER_COMO_YA_EN_CAMBIOS' ? ['cambio_como'] : []);
    });

    test.each([
        ['el Super Admin ya no es rol 1', { 1: { rol_id: 3 } }, 403, 'SOLO_SUPER_ADMIN'],
        ['el Super Admin está inactivo', { 1: { activo: 0 } }, 403, 'SOLO_SUPER_ADMIN'],
        ['la persona quedó inactiva', { 7: { activo: 0 } }, 409, 'USUARIO_INACTIVO'],
        ['la persona ahora es rol 1', { 7: { rol_id: 1 } }, 403, 'VER_COMO_SUPER_ADMIN'],
    ])('re-verifica en la BD: rechaza si %s', async (_q, bdNueva, status, code) => {
        cambiosBd = bdNueva;
        const res = await activar(lectura());
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(insertsLog()).toHaveLength(0);
    });

    test('vencido → 401 (la app vuelve a la cuenta propia)', async () => {
        const t = jwt.sign({ typ: 'session', id: 7, rol_id: 3, p: [], rv: 1, imp: 1, ro: true, exp: Math.floor(Date.now() / 1000) - 5 }, SECRETO);
        const res = await activar(t);
        expect(res.status).toBe(401);
        expect(insertsLog()).toHaveLength(0);
    });

    test('con el token de cambios, Soporte sigue cerrado (no se encadena)', async () => {
        let r = await request(app).get('/api/soporte/usuarios').set('Authorization', `Bearer ${cambios()}`);
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('VER_COMO_NO_ENCADENA');
        r = await request(app).post('/api/soporte/usuarios/10/ver-como').set('Authorization', `Bearer ${cambios()}`);
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('VER_COMO_CAMBIOS_BLOQUEADO');
    });
});

describe('middleware de auth en modo cambios', () => {
    const mini = express();
    mini.use(express.json());
    mini.use(auth, (req, res) => res.json({ ok: true, id: req.user.id }));

    test.each(['post', 'put', 'patch', 'delete'])('%s pasa con rw', async (m) => {
        const res = await request(mini)[m]('/api/prueba/5').set('Authorization', `Bearer ${cambios()}`).send({ x: 1 });
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(7);
    });

    test('las lecturas siguen pasando (también las de usuarios: ahí decide su permiso)', async () => {
        let res = await request(mini).get('/api/prueba').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(200);
        res = await request(mini).get('/api/usuarios').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(200);
    });

    test.each([
        ['PUT', '/api/auth/me/password', /contraseña/],
        ['POST', '/api/usuarios', /usuarios, roles ni permisos/],
        ['PUT', '/api/usuarios/5', /usuarios, roles ni permisos/],
        ['DELETE', '/api/usuarios/5', /usuarios, roles ni permisos/],
        ['POST', '/api/usuarios/roles', /usuarios, roles ni permisos/],
        ['PUT', '/api/usuarios/roles/3', /usuarios, roles ni permisos/],
        ['DELETE', '/api/usuarios/roles/3', /usuarios, roles ni permisos/],
        ['POST', '/api/usuarios/roles/3/permisos', /usuarios, roles ni permisos/],
        ['POST', '/api/usuarios/user-overrides/5', /usuarios, roles ni permisos/],
        ['POST', '/api/usuarios/me/email-config', /correo/],
        ['PUT', '/api/usuarios/me/plantillas/2', /correo/],
        ['POST', '/api/soporte/usuarios/7/ver-como', /Soporte/],
        ['POST', '/api/fiscalizacion/enviar-excel', /correos/],
        ['PUT', '/API/Usuarios/5', /usuarios, roles ni permisos/],
        ['PUT', '/api/%75suarios/5', /usuarios, roles ni permisos/],
        ['PUT', '/api//usuarios/5', /usuarios, roles ni permisos/],
        ['PUT', '/api/usuarios/5/', /usuarios, roles ni permisos/],
        ['PUT', '/api/usuarios/5?a=1', /usuarios, roles ni permisos/],
        ['PUT', '/api/auth/me/password/', /contraseña/],
    ])('%s %s → 403 claro, antes de la ruta', async (metodo, ruta, msg) => {
        const res = await request(mini)[metodo.toLowerCase()](ruta).set('Authorization', `Bearer ${cambios()}`).send({ password: 'x' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('VER_COMO_CAMBIOS_BLOQUEADO');
        expect(res.body.error).toMatch(/^En modo cambios no se /);
        expect(res.body.error).toMatch(msg);
    });

    test.each([
        ['el Super Admin pierde el rol 1', { 1: { rol_id: 3 } }, /ya no es Super Administrador/],
        ['el Super Admin queda inactivo', { 1: { activo: 0 } }, /ya no es Super Administrador/],
        ['la persona queda inactiva', { 7: { activo: 0 } }, /ya no está activa/],
        ['la persona pasa a rol 1', { 7: { rol_id: 1 } }, /cambió de rol/],
    ])('con el token ya emitido, si %s, las escrituras se cortan (las lecturas no)', async (_q, bdNueva, msg) => {
        cambiosBd = bdNueva;
        let res = await request(mini).put('/api/prueba/5').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('VER_COMO_CAMBIOS_INVALIDO');
        expect(res.body.error).toMatch(msg);
        res = await request(mini).get('/api/prueba/5').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(200);
    });

    test('si la BD no responde al verificar, no escribe (503)', async () => {
        db.query.mockImplementation(async (sql) => {
            if (String(sql).startsWith('SELECT id, nombre, rol_id, activo FROM usuarios')) throw new Error('BD caída');
            return [[]];
        });
        const res = await request(mini).post('/api/prueba').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('VER_COMO_CAMBIOS_INVALIDO');
    });

    test('una ruta parecida que no es de la lista no se bloquea', async () => {
        const res = await request(mini).post('/api/usuarios-extra/1').set('Authorization', `Bearer ${cambios()}`);
        expect(res.status).toBe(200);
    });

    test.each([
        ['ro + imp', () => lectura()],
        ['solo imp', () => sesion(USUARIOS[7], { imp: 1 }, 1800)],
        ['rw pero también ro', () => sesion(USUARIOS[7], { imp: 1, ro: true, rw: true }, 1800)],
        ['rw como texto', () => sesion(USUARIOS[7], { imp: 1, rw: 'true' }, 1800)],
    ])('sin rw de verdad (%s), todo sigue en solo lectura', async (_q, token) => {
        for (const m of ['post', 'put', 'patch', 'delete']) {
            const res = await request(mini)[m]('/api/prueba').set('Authorization', `Bearer ${token()}`);
            expect(res.status).toBe(403);
            expect(res.body.code).toBe('VER_COMO_SOLO_LECTURA');
        }
        await esperarLogs();
        expect(insertsLog()).toHaveLength(0);
    });

    test('con el token de solo lectura, solo el cambio de modo y los POST que leen pasan (lista exacta)', async () => {
        let res = await request(mini).post('/api/soporte/ver-como/escritura').set('Authorization', `Bearer ${lectura()}`);
        expect(res.status).toBe(200);
        res = await request(mini).post('/api/soporte/ver-como/escritura/otra').set('Authorization', `Bearer ${lectura()}`);
        expect(res.status).toBe(403);
        res = await request(mini).post('/api/soporte/ver-como/lectura').set('Authorization', `Bearer ${lectura()}`);
        expect(res.status).toBe(403);
    });

    test('en la app real: un POST de terreno llega a la ruta (no es el 403 de solo lectura) y queda registrado', async () => {
        const t = cambios({ p: ['inventario.transferencias.solicitar'] });
        const res = await request(app).post('/api/transferencias').set('Authorization', `Bearer ${t}`).send({});
        expect(res.body.code).not.toBe('VER_COMO_SOLO_LECTURA');
        expect(res.body.code).not.toBe('VER_COMO_CAMBIOS_BLOQUEADO');
        await esperarLogs();
        const cambio = insertsLog().map(c => c[1]).find(p => p[1] === 'soporte');
        expect(cambio).toBeDefined();
        expect(cambio[0]).toBe(1);
        expect(JSON.parse(cambio[6])).toMatchObject({ evento: 'cambio_como', metodo: 'POST', ruta: '/api/transferencias', estado: res.status });
    });

    test('en la app real: cambiar la contraseña de la persona → 403 y queda el intento', async () => {
        const res = await request(app).put('/api/auth/me/password').set('Authorization', `Bearer ${cambios()}`).send({ actual: 'a', nueva: 'b' });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('VER_COMO_CAMBIOS_BLOQUEADO');
        await esperarLogs();
        const [fila] = insertsLog().map(c => c[1]);
        expect(fila[0]).toBe(1);
        expect(JSON.parse(fila[6])).toMatchObject({ metodo: 'PUT', ruta: '/api/auth/me/password', estado: 403 });
    });
});

describe('historial en modo cambios', () => {
    test('cada escritura: a nombre del Super Admin, «(como <persona> #id)», sin el body ni la query', async () => {
        const mini = express();
        mini.use(express.json());
        mini.post('/api/prueba', auth, (req, res) => res.json({ ok: true }));
        const res = await request(mini).post('/api/prueba?token=SECRETO-URL').set('Authorization', `Bearer ${cambios()}`)
            .send({ password: 'clave-secreta', rut: '11.111.111-1', monto: 987654 });
        expect(res.status).toBe(200);
        await esperarLogs();
        const logs = insertsLog();
        expect(logs).toHaveLength(1);
        const params = logs[0][1];
        const [usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle] = params;
        expect([usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label]).toEqual([1, 'soporte', 'CREATE', '7', 'usuario', 'Leonardo López']);
        expect(JSON.parse(detalle)).toEqual({
            evento: 'cambio_como', metodo: 'POST', ruta: '/api/prueba', estado: 200,
            usuario_id: 7, usuario: 'Leonardo López', ver_como_usuario_id: 7, ver_como_modo: 'cambios',
            resumen: 'POST /api/prueba → 200 (como Leonardo López #7)',
        });
        const todo = JSON.stringify(params);
        for (const secreto of ['clave-secreta', '11.111.111-1', '987654', 'SECRETO-URL']) expect(todo).not.toContain(secreto);
    });

    test.each([['put', 'UPDATE'], ['patch', 'UPDATE'], ['delete', 'DELETE']])('%s → %s', async (m, accion) => {
        const mini = express();
        mini.use(auth, (req, res) => res.json({ ok: true }));
        await request(mini)[m]('/api/prueba/3').set('Authorization', `Bearer ${cambios()}`);
        await esperarLogs();
        expect(insertsLog().map(c => c[1][2])).toEqual([accion]);
    });

    test('auth dos veces en la misma petición (guarda + CRUD) → una sola fila; las lecturas no dejan fila', async () => {
        const mini = express();
        mini.post('/api/doble', auth, auth, (req, res) => res.json({ ok: true }));
        mini.get('/api/doble', auth, (req, res) => res.json({ ok: true }));
        await request(mini).post('/api/doble').set('Authorization', `Bearer ${cambios()}`);
        await request(mini).get('/api/doble').set('Authorization', `Bearer ${cambios()}`);
        await esperarLogs();
        expect(insertsLog()).toHaveLength(1);
    });

    test('con el log genérico: también queda a nombre del Super Admin, con «(cambios como usuario #7)»', async () => {
        const mini = express();
        mini.use(express.json());
        mini.use(activityLogger);
        mini.post('/api/prueba', auth, (req, res) => res.json({ ok: true }));
        await request(mini).post('/api/prueba').set('Authorization', `Bearer ${cambios()}`).send({ nombre: 'Algo' });
        await esperarLogs();
        const logs = insertsLog().map(c => c[1]);
        expect(logs.map(p => p[1]).sort()).toEqual(['prueba', 'soporte']);
        const generico = logs.find(p => p[1] === 'prueba');
        expect(generico[0]).toBe(1);
        const d = JSON.parse(generico[6]);
        expect(d).toMatchObject({ ver_como_usuario_id: 7, ver_como_modo: 'cambios' });
        expect(d.resumen).toMatch(/\(cambios como usuario #7\)$/);
    });

    test('atribuirVerComo: modo cambios marca «cambios como»; un detalle que ya dice como quién no se toca', () => {
        const req = { user: { id: 7, imp: 1, ro: false, rw: true } };
        const [uid, det] = atribuirVerComo(7, JSON.stringify({ resumen: 'Aprobó TRF-12' }), req);
        expect(uid).toBe(1);
        expect(JSON.parse(det)).toMatchObject({ ver_como_usuario_id: 7, ver_como_modo: 'cambios', resumen: 'Aprobó TRF-12 (cambios como usuario #7)' });
        const yaDice = JSON.stringify({ ver_como_usuario_id: 7, resumen: 'Marcos activó cambios como Leonardo' });
        expect(atribuirVerComo(1, yaDice, req)).toEqual([1, yaDice]);
        expect(atribuirVerComo(7, 'Texto', req)).toEqual([1, 'Texto (cambios como usuario #7)']);
    });
});

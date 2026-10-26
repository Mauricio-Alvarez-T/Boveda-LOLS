/**
 * «Soporte · usuarios» y «Ver como» (2026-10-23, docs/reglas/seguridad-rbac.md § Ver como usuario).
 *
 * Cubre las reglas de seguridad:
 *   - solo el rol 1 (en el token Y en la BD): 403 a todo el resto, incluido un Administrador con todos los permisos;
 *   - no se encadena (un token `imp` no entra a Soporte, aunque dijera rol 1);
 *   - no se emite para otro rol 1, ni para un inactivo, ni para uno que no existe, ni para uno mismo;
 *   - el token: del usuario mirado (sus permisos efectivos, obra, bodega, rv), `imp` + `ro`, 30 min;
 *   - el middleware de auth bloquea POST/PUT/PATCH/DELETE con `ro`/`imp` y deja GET/HEAD;
 *   - el «ver como» queda en el historial a nombre del Super Administrador; lo que se registre durante la sesión
 *     prestada, también (nunca a nombre del usuario mirado);
 *   - la ficha: permisos efectivos con su origen (rol / propio / quitado), del MISMO cálculo que el login.
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
const { atribuirVerComo, logManualActivity } = require('../src/middleware/logger');
const permisosService = require('../src/services/permisos.service');

const SECRETO = process.env.JWT_SECRET || 'secret';

/** Personas en la BD simulada. */
const USUARIOS = {
    1: { id: 1, nombre: 'Marcos Uribe', email: 'marcos@lols.cl', rol_id: 1, rol_nombre: 'Super Administrador', activo: 1, obra_id: null, bodega_id: null },
    2: { id: 2, nombre: 'Mauricio Torres', email: 'torres@lols.cl', rol_id: 1, rol_nombre: 'Super Administrador', activo: 1, obra_id: null, bodega_id: null },
    7: { id: 7, nombre: 'Leonardo López', email: 'leonardo@lols.cl', email_corporativo: null, rol_id: 3, rol_nombre: 'Administrador', activo: 1, obra_id: 4, obra_nombre: 'Gorbea 3082', obra_activa: 1, obra_finalizada: 0, bodega_id: 2, bodega_nombre: 'Bodega Cerrillos', password_hash: 'NO-DEBE-SALIR' },
    8: { id: 8, nombre: 'Persona Inactiva', email: 'inactiva@lols.cl', rol_id: 4, rol_nombre: 'Jefe de Obra', activo: 0, obra_id: null, bodega_id: null },
    10: { id: 10, nombre: 'Paula Martínez', email: 'paula@lols.cl', rol_id: 3, rol_nombre: 'Administrador', activo: 1, obra_id: null, bodega_id: null },
};
const PERMISOS_ROL_3 = ['inventario.ver', 'inventario.tab.transferencias', 'asistencia.ver'];
const OVERRIDES_7 = [
    { permiso_clave: 'inventario.transferencias.aprobar', tipo: 'grant' },
    { permiso_clave: 'asistencia.ver', tipo: 'deny' },
];
const CATALOGO = [
    { clave: 'asistencia.ver', modulo: 'Asistencia', nombre: 'Ver asistencia', descripcion: null, orden: 1 },
    { clave: 'inventario.ver', modulo: 'Inventario', nombre: 'Ver inventario', descripcion: null, orden: 1 },
    { clave: 'inventario.tab.transferencias', modulo: 'Inventario', nombre: 'Pestaña Solicitudes', descripcion: null, orden: 5 },
    { clave: 'inventario.transferencias.aprobar', modulo: 'Inventario', nombre: 'Aprobar solicitudes', descripcion: null, orden: 9 },
    { clave: 'usuarios.ver', modulo: 'Usuarios', nombre: 'Ver usuarios', descripcion: null, orden: 1 },
];

/** Cambia lo que devuelve la BD para el que pide (Super Admin degradado / inactivo). */
let quienPide = {};

function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = USUARIOS[params[0]];
            return [u ? [{ ...u, ...(quienPide[params[0]] || {}) }] : []];
        }
        if (s.includes('WHERE u.activo = 1')) {
            return [Object.values(USUARIOS).filter(u => u.activo === 1)];
        }
        if (s.includes('FROM usuarios u') && s.includes('WHERE u.id = ?')) {
            const u = USUARIOS[params[0]];
            return [u ? [u] : []];
        }
        if (s.includes('FROM permisos_rol_v2')) return [PERMISOS_ROL_3.map(permiso_clave => ({ permiso_clave }))];
        if (s.includes('FROM permisos_usuario_override')) return [Number(params[0]) === 7 ? OVERRIDES_7 : []];
        if (s.includes('FROM permisos_catalogo')) return [CATALOGO];
        if (s.includes("accion = 'LOGIN'") && s.includes('MAX(created_at)')) return [[{ t: '2026-10-20T12:00:00.000Z' }]];
        if (s.includes('FROM logs_actividad') && s.includes("accion = 'UPDATE'")) {
            return [[{ t: '2026-10-22T09:30:00.000Z', modulo: 'roles', entidad_tipo: 'usuario' }]];
        }
        if (s.startsWith('INSERT INTO logs_actividad')) return [{ insertId: 1 }];
        return [[]];
    });
}

/** Token de sesión como el del login (rv 1 = la versión que da versionService sin inicializar). */
const sesion = (u, extra = {}) => jwt.sign(
    { typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, obra_id: u.obra_id ?? null, bodega_id: u.bodega_id ?? null, p: extra.p || ['usuarios.ver'], rv: 1, ...extra },
    SECRETO, { expiresIn: extra.expiresIn || '8h' },
);
const SUPER = () => sesion(USUARIOS[1]);
// Un Administrador con TODO lo de usuarios y permisos: igual no entra (no es un permiso, es el rol 1).
const ADMIN = () => sesion(USUARIOS[10], { p: ['usuarios.ver', 'usuarios.editar', 'usuarios.permisos.gestionar', 'sistema.logs.ver', 'usuarios.roles.ver'] });

const insertsLog = () => db.query.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO logs_actividad'));

beforeEach(() => {
    jest.clearAllMocks();
    quienPide = {};
    bd();
});

describe('Solo el Super Administrador (rol 1)', () => {
    test('rol 1 → lista de usuarios activos, sin datos sensibles', async () => {
        const res = await request(app).get('/api/soporte/usuarios').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(200);
        expect(res.body.data.map(u => u.id)).toEqual([1, 2, 7, 10]);
        expect(JSON.stringify(res.body)).not.toContain('NO-DEBE-SALIR');
        expect(res.body.data.find(u => u.id === 7)).toMatchObject({ rol_nombre: 'Administrador', obra_nombre: 'Gorbea 3082', bodega_nombre: 'Bodega Cerrillos' });
        expect(res.headers['cache-control']).toBe('no-store');
    });

    test.each([
        ['GET', '/api/soporte/usuarios'],
        ['GET', '/api/soporte/usuarios/7'],
        ['POST', '/api/soporte/usuarios/7/ver-como'],
    ])('un Administrador con todos los permisos de usuarios → 403 en %s %s', async (metodo, ruta) => {
        const res = await request(app)[metodo.toLowerCase()](ruta).set('Authorization', `Bearer ${ADMIN()}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SOLO_SUPER_ADMIN');
        expect(insertsLog()).toHaveLength(0);
    });

    test('sin token → 401', async () => {
        const res = await request(app).get('/api/soporte/usuarios');
        expect(res.status).toBe(401);
    });

    test('token de rol 1 pero en la BD ya no es rol 1 (o está inactivo) → 403', async () => {
        quienPide = { 1: { rol_id: 3 } };
        let res = await request(app).get('/api/soporte/usuarios').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(403);
        quienPide = { 1: { activo: 0 } };
        res = await request(app).post('/api/soporte/usuarios/7/ver-como').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(403);
        expect(insertsLog()).toHaveLength(0);
    });
});

describe('Ficha: permisos efectivos con su origen', () => {
    test('rol / propio / quitado, del mismo cálculo que el login', async () => {
        const spy = jest.spyOn(permisosService, 'detallePermisos');
        const res = await request(app).get('/api/soporte/usuarios/7').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith(7, 3);
        const { data } = res.body;
        expect(data.usuario).toMatchObject({ id: 7, rol_id: 3, activo: true, obra_id: 4, bodega_id: 2 });
        expect(data.obra).toEqual({ id: 4, nombre: 'Gorbea 3082', activa: true, finalizada: false });
        expect([...data.efectivos].sort()).toEqual(['inventario.tab.transferencias', 'inventario.transferencias.aprobar', 'inventario.ver']);
        const origen = Object.fromEntries(data.permisos.map(p => [p.clave, p.origen]));
        expect(origen).toEqual({
            'inventario.ver': 'rol',
            'inventario.tab.transferencias': 'rol',
            'inventario.transferencias.aprobar': 'propio',
            'asistencia.ver': 'quitado',
        });
        expect(data.permisos.find(p => p.clave === 'inventario.transferencias.aprobar')).toMatchObject({ modulo: 'Inventario', nombre: 'Aprobar solicitudes' });
        expect(data.sesion).toEqual({ ultimo_ingreso: '2026-10-20T12:00:00.000Z', ultimo_cambio: '2026-10-22T09:30:00.000Z', ultimo_cambio_de: 'propios' });
        expect(JSON.stringify(res.body)).not.toContain('NO-DEBE-SALIR');
        spy.mockRestore();
    });

    test('getPermisosEfectivos (login) = detallePermisos().efectivos', async () => {
        const efectivos = await permisosService.getPermisosEfectivos(7, 3);
        const det = await permisosService.detallePermisos(7, 3);
        expect(efectivos).toEqual(det.efectivos);
        expect(det.propios).toEqual(['inventario.transferencias.aprobar']);
        expect(det.quitados).toEqual(['asistencia.ver']);
    });

    test('id inválido → 400; inexistente → 404', async () => {
        let res = await request(app).get('/api/soporte/usuarios/abc').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(400);
        res = await request(app).get('/api/soporte/usuarios/999').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(404);
    });
});

describe('POST /usuarios/:id/ver-como', () => {
    test('emite un token de 30 min DEL usuario mirado, con imp y ro, y lo registra a nombre del Super Admin', async () => {
        const res = await request(app).post('/api/soporte/usuarios/7/ver-como').set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(200);
        const { token, user, vence, minutos, quien } = res.body.data;
        const t = jwt.verify(token, SECRETO);
        expect(t).toMatchObject({ typ: 'session', id: 7, email: 'leonardo@lols.cl', rol_id: 3, obra_id: 4, bodega_id: 2, rv: 1, imp: 1, ro: true });
        expect([...t.p].sort()).toEqual(['inventario.tab.transferencias', 'inventario.transferencias.aprobar', 'inventario.ver']);
        expect(t.exp - t.iat).toBe(30 * 60);
        expect(minutos).toBe(30);
        expect(new Date(vence).getTime()).toBe(t.exp * 1000);
        expect(user).toMatchObject({ id: 7, nombre: 'Leonardo López', rol: 'Administrador', rol_id: 3, obra_id: 4, bodega_id: 2 });
        expect(user.permisos).toEqual(t.p);
        expect(quien).toEqual({ id: 1, nombre: 'Marcos Uribe' });
        expect(JSON.stringify(res.body)).not.toContain('NO-DEBE-SALIR');
        expect(res.headers['cache-control']).toBe('no-store');

        // Historial: UNA fila, a nombre del Super Admin, «Marcos vio como Leonardo».
        const logs = insertsLog();
        expect(logs).toHaveLength(1);
        const [usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label, detalle] = logs[0][1];
        expect([usuario_id, modulo, accion, item_id, entidad_tipo, entidad_label]).toEqual([1, 'soporte', 'LOGIN', '7', 'usuario', 'Leonardo López']);
        expect(JSON.parse(detalle).resumen).toMatch(/^Marcos Uribe vio como Leonardo López/);
    });

    test.each([
        ['otro Super Administrador', 2, 403, 'VER_COMO_SUPER_ADMIN'],
        ['un usuario inactivo', 8, 409, 'USUARIO_INACTIVO'],
        ['un usuario que no existe', 999, 404, 'USUARIO_NO_EXISTE'],
        ['su propia cuenta', 1, 400, 'VER_COMO_PROPIA'],
    ])('no se emite para %s', async (_q, id, status, code) => {
        const res = await request(app).post(`/api/soporte/usuarios/${id}/ver-como`).set('Authorization', `Bearer ${SUPER()}`);
        expect(res.status).toBe(status);
        expect(res.body.code).toBe(code);
        expect(res.body.data).toBeUndefined();
        expect(insertsLog()).toHaveLength(0);
    });

    test('no se encadena: con el token de «ver como» no se pide otro (ni se entra a Soporte)', async () => {
        const res = await request(app).post('/api/soporte/usuarios/7/ver-como').set('Authorization', `Bearer ${SUPER()}`);
        const prestado = res.body.data.token;
        jest.clearAllMocks();
        bd();

        let r = await request(app).post('/api/soporte/usuarios/10/ver-como').set('Authorization', `Bearer ${prestado}`);
        expect(r.status).toBe(403);
        r = await request(app).get('/api/soporte/usuarios').set('Authorization', `Bearer ${prestado}`);
        expect(r.status).toBe(403);
        // Aunque alguien armara un token `imp` con rol 1, Soporte no lo acepta.
        const forjado = sesion(USUARIOS[1], { imp: 2, ro: true });
        r = await request(app).get('/api/soporte/usuarios').set('Authorization', `Bearer ${forjado}`);
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('VER_COMO_NO_ENCADENA');
        r = await request(app).post('/api/soporte/usuarios/7/ver-como').set('Authorization', `Bearer ${forjado}`);
        expect(r.status).toBe(403);
        expect(insertsLog()).toHaveLength(0);
    });
});

describe('middleware de auth: «ver como» es solo lectura', () => {
    const mini = express();
    mini.use(express.json());
    mini.all('/api/prueba', auth, (req, res) => res.json({ ok: true, id: req.user.id }));
    mini.post('/api/inventario/stock-por-items', auth, (req, res) => res.json({ ok: true }));
    mini.post('/api/inventario/stock-por-items/otra', auth, (req, res) => res.json({ ok: true }));

    const prestado = (extra = {}) => sesion(USUARIOS[7], { p: ['inventario.ver'], imp: 1, ro: true, expiresIn: '30m', ...extra });

    test.each(['get', 'head'])('%s pasa', async (m) => {
        const res = await request(mini)[m]('/api/prueba').set('Authorization', `Bearer ${prestado()}`);
        expect(res.status).toBe(200);
    });

    test.each(['post', 'put', 'patch', 'delete'])('%s → 403 «solo lectura» antes de la ruta', async (m) => {
        const res = await request(mini)[m]('/api/prueba').set('Authorization', `Bearer ${prestado()}`).send({ x: 1 });
        expect(res.status).toBe(403);
        expect(res.body).toEqual({ error: 'Modo «ver como»: solo lectura', code: 'VER_COMO_SOLO_LECTURA' });
    });

    test('un token con `imp` cuenta como solo lectura aunque le falte `ro`', async () => {
        const t = jwt.sign({ typ: 'session', id: 7, rol_id: 3, p: [], rv: 1, imp: 1 }, SECRETO, { expiresIn: '30m' });
        const res = await request(mini).post('/api/prueba').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(403);
    });

    test('la sesión normal sigue escribiendo', async () => {
        const res = await request(mini).post('/api/prueba').set('Authorization', `Bearer ${sesion(USUARIOS[7])}`);
        expect(res.status).toBe(200);
    });

    test('los POST que solo leen (lista exacta) pasan; una ruta parecida no', async () => {
        let res = await request(mini).post('/api/inventario/stock-por-items').set('Authorization', `Bearer ${prestado()}`).send({ item_ids: [1] });
        expect(res.status).toBe(200);
        res = await request(mini).post('/api/inventario/stock-por-items/otra').set('Authorization', `Bearer ${prestado()}`);
        expect(res.status).toBe(403);
    });

    test('vencido → 401 (la app vuelve a la cuenta propia)', async () => {
        const t = jwt.sign({ typ: 'session', id: 7, rol_id: 3, p: [], rv: 1, imp: 1, ro: true, exp: Math.floor(Date.now() / 1000) - 10 }, SECRETO);
        const res = await request(mini).get('/api/prueba').set('Authorization', `Bearer ${t}`);
        expect(res.status).toBe(401);
    });

    test('en la app real: GET pasa y un POST de terreno se corta con el 403 de solo lectura', async () => {
        const res = await request(app).post('/api/transferencias').set('Authorization', `Bearer ${prestado({ p: ['inventario.transferencias.solicitar'] })}`).send({});
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('VER_COMO_SOLO_LECTURA');
        expect(insertsLog()).toHaveLength(0);
    });
});

describe('historial: lo hecho con «ver como» nunca queda a nombre del usuario mirado', () => {
    test('atribuirVerComo: JSON → a nombre de quien mira, con la marca', () => {
        const req = { user: { id: 7, imp: 1, ro: true } };
        const [uid, det] = atribuirVerComo(7, JSON.stringify({ evento: 'documento_descargado', resumen: 'Descarga de Contrato' }), req);
        expect(uid).toBe(1);
        expect(JSON.parse(det)).toMatchObject({ ver_como_usuario_id: 7, resumen: 'Descarga de Contrato (viendo como usuario #7)' });
    });

    test('atribuirVerComo: texto plano y sesión normal', () => {
        expect(atribuirVerComo(7, 'Abrió algo', { user: { id: 7, imp: 2 } })).toEqual([2, 'Abrió algo (viendo como usuario #7)']);
        expect(atribuirVerComo(7, 'Abrió algo', { user: { id: 7 } })).toEqual([7, 'Abrió algo']);
        expect(atribuirVerComo(7, 'x', null)).toEqual([7, 'x']);
    });

    test('logManualActivity con un req de «ver como» inserta a nombre del Super Admin', async () => {
        const req = { user: { id: 7, imp: 1, ro: true }, ip: '1.2.3.4', get: () => 'jest' };
        await logManualActivity(7, 'documentos', 'UPDATE', '55', JSON.stringify({ resumen: 'Impresión de Contrato' }), req, { entidad_tipo: 'documento', entidad_label: 'Contrato' });
        const [params] = insertsLog().map(c => c[1]);
        expect(params[0]).toBe(1);
        expect(JSON.parse(params[6]).ver_como_usuario_id).toBe(7);
    });
});

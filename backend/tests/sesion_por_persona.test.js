/**
 * Cierre de sesión por PERSONA (mig 146, 2026-10-28; docs/reglas/seguridad-rbac.md § JWT y sesión).
 *
 * Antes, guardar los permisos propios de UNA persona (POST /usuarios/user-overrides/:id) subía `roles.version` de su
 * rol y sacaba a todas las personas de ese rol (p. ej. las tres de RR.HH). Ahora:
 *   (a) version.service guarda en memoria `usuarios.permisos_cambiados_en` (UTC; init tolera SOLO que la columna no
 *       exista, errno 1054; cualquier otro fallo lo hace lanzar como con los roles); `cerrarSesionDe(id)` escribe ese
 *       segundo; `sesionCerradaPara(decoded)` = iat ausente o iat <= ese segundo, para `id` y para `imp` («ver como»).
 *   (b) el middleware de auth rechaza con el MISMO 401 expired_by_version los tokens de esa persona emitidos antes,
 *       y deja pasar los nuevos y los de otras personas del mismo rol.
 *   (c) POST /usuarios/user-overrides/:id valida el payload (400, también claves que no están en el catálogo),
 *       deduplica claves sin distinguir mayúsculas, cierra solo esa sesión y, si no puede (mig 146 sin correr), vuelve
 *       a subir la versión del rol que la persona tiene en la BD (no el rol_id del body).
 */
const express = require('express');
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
const logger = require('../src/utils/logger-structured');
const versionService = require('../src/services/version.service');
const permisosService = require('../src/services/permisos.service');
const auth = require('../src/middleware/auth');

const SECRETO = process.env.JWT_SECRET;
const MENSAJE_PERMISOS = 'Tu sesión ha expirado debido a una actualización de permisos. Por favor, ingresa de nuevo.';
const errorColumna = () => Object.assign(new Error("Unknown column 'permisos_cambiados_en' in 'field list'"), { errno: 1054 });
const SQL_CERRAR = "UPDATE usuarios SET permisos_cambiados_en = DATE_ADD('1970-01-01 00:00:00', INTERVAL ? SECOND) WHERE id = ?";
const SQL_CARGAR = "SELECT id, TIMESTAMPDIFF(SECOND, '1970-01-01 00:00:00', permisos_cambiados_en) AS t FROM usuarios WHERE permisos_cambiados_en IS NOT NULL";

/** Instancia NUEVA del servicio (el módulo exporta un singleton; así cada caso parte limpio). */
const nuevoServicio = () => new versionService.constructor();

/** Token de sesión como el del login, con `iat` a elección (rv 1 = versión de un rol que el Map no conoce). */
const token = (id, rol_id, iat, extra = {}) => jwt.sign(
    { typ: 'session', id, email: `p${id}@lols.cl`, rol_id, obra_id: null, bodega_id: null, p: extra.p || ['usuarios.ver'], rv: 1, iat, ...extra },
    SECRETO, { expiresIn: '8h' },
);

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset();
    db.query.mockResolvedValue([[]]);
});

afterEach(() => {
    jest.restoreAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('(a) version.service — mapa de cierres por persona', () => {
    test('init carga las versiones de los roles Y los cierres por persona', async () => {
        db.query.mockImplementation(async (sql) => {
            const s = String(sql);
            if (s.startsWith('SELECT id, version FROM roles')) return [[{ id: 1, version: 4 }, { id: 3, version: 2 }]];
            if (s.includes('permisos_cambiados_en IS NOT NULL')) return [[{ id: 7, t: 1730000000 }, { id: 9, t: '1730000500' }]];
            return [[]];
        });
        const svc = nuevoServicio();
        await svc.init();

        expect(svc.initialized).toBe(true);
        expect(svc.get(3)).toBe(2);
        expect(svc.cerradasEn.get(7)).toBe(1730000000);
        expect(svc.cerradasEn.get(9)).toBe(1730000500); // TIMESTAMPDIFF puede llegar como texto
        expect(svc.sesionCerradaPara({ id: 7, iat: 1729999999 })).toBe(true);
        expect(svc.sesionCerradaPara({ id: 8, iat: 1729999999 })).toBe(false);
        const sqls = db.query.mock.calls.map(([sql]) => String(sql));
        expect(sqls).toContain(SQL_CARGAR);
    });

    test('lee y escribe el segundo SIN la zona horaria de la sesión (nada de FROM_UNIXTIME / UNIX_TIMESTAMP)', async () => {
        // Esas dos funciones usan el time_zone de la sesión y en el cambio de horario la hora repetida es ambigua →
        // el cierre recargado se correría ±3600 s. DATE_ADD / TIMESTAMPDIFF desde 1970-01-01 es aritmética pura (UTC).
        const svc = nuevoServicio();
        await svc.init();
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await svc.cerrarSesionDe(7);

        const sqls = db.query.mock.calls.map(([sql]) => String(sql));
        expect(sqls).toEqual(expect.arrayContaining([SQL_CARGAR, SQL_CERRAR]));
        sqls.filter(s => s.includes('permisos_cambiados_en')).forEach(s => {
            expect(s).not.toMatch(/FROM_UNIXTIME|UNIX_TIMESTAMP|CONVERT_TZ|NOW\(\)/i);
        });
    });

    test('init tolera que la columna aún no exista (errno 1054): avisa y sigue, sin lanzar', async () => {
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        db.query.mockImplementation(async (sql) => {
            if (String(sql).startsWith('SELECT id, version FROM roles')) return [[{ id: 3, version: 5 }]];
            throw errorColumna();
        });
        const svc = nuevoServicio();
        await expect(svc.init()).resolves.toBeUndefined();

        expect(svc.initialized).toBe(true);
        expect(svc.get(3)).toBe(5);               // las versiones de rol sí quedaron
        expect(svc.cerradasEn.size).toBe(0);
        expect(svc.sesionCerradaPara({ id: 7, iat: 1 })).toBe(false);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('cierres de sesión por persona'), expect.objectContaining({ errno: 1054 }));
    });

    test('init LANZA si esa consulta falla por otra cosa (no arranca con el mapa vacío) y permite reintentar', async () => {
        // Sin el mapa, el token viejo de quien cambió de rol volvería a valer (el cierre por persona ya no sube
        // roles.version). Igual que con los roles: index.js no levanta el servidor y Passenger reintenta.
        const error = jest.spyOn(logger, 'error').mockImplementation(() => {});
        const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
        db.query.mockImplementation(async (sql) => {
            if (String(sql).startsWith('SELECT id, version FROM roles')) return [[{ id: 1, version: 3 }]];
            throw Object.assign(new Error('Lost connection to MySQL server during query'), { errno: 2013 });
        });
        const svc = nuevoServicio();
        await expect(svc.init()).rejects.toThrow('Lost connection');
        expect(svc.initialized).toBe(false);
        expect(svc.initPromise).toBeNull();
        expect(error).toHaveBeenCalledWith(expect.stringContaining('cierres de sesión por persona'), expect.objectContaining({ errno: 2013 }));
        expect(warn).not.toHaveBeenCalled();

        // Reintento con la BD de vuelta: queda todo cargado.
        db.query.mockImplementation(async (sql) => {
            if (String(sql).startsWith('SELECT id, version FROM roles')) return [[{ id: 1, version: 3 }]];
            return [[{ id: 7, t: 1730000000 }]];
        });
        await expect(svc.init()).resolves.toBeUndefined();
        expect(svc.initialized).toBe(true);
        expect(svc.cerradasEn.get(7)).toBe(1730000000);
        expect(svc.sesionCerradaPara({ id: 7, iat: 1729999999 })).toBe(true);
    });

    test('init LANZA también si el error no trae errno (solo el 1054 se tolera)', async () => {
        jest.spyOn(logger, 'error').mockImplementation(() => {});
        db.query.mockImplementation(async (sql) => {
            if (String(sql).startsWith('SELECT id, version FROM roles')) return [[]];
            throw new Error('timeout');
        });
        const svc = nuevoServicio();
        await expect(svc.init()).rejects.toThrow('timeout');
        expect(svc.initialized).toBe(false);
    });

    test('si falla la carga de ROLES, init sigue lanzando como antes (y permite reintentar)', async () => {
        jest.spyOn(logger, 'error').mockImplementation(() => {});
        db.query.mockRejectedValueOnce(new Error('BD caída'));
        const svc = nuevoServicio();
        await expect(svc.init()).rejects.toThrow('BD caída');
        expect(svc.initialized).toBe(false);
        expect(svc.initPromise).toBeNull();
    });

    test('cerrarSesionDe hace el UPDATE con ese id y ese segundo, y deja el mapa listo', async () => {
        jest.spyOn(Date, 'now').mockReturnValue(1730000000999);
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const svc = nuevoServicio();

        const t = await svc.cerrarSesionDe('7');

        expect(t).toBe(1730000000);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(SQL_CERRAR, [1730000000, 7]);
        expect(svc.cerradasEn.get(7)).toBe(1730000000);
        expect(svc.sesionCerradaPara({ id: 7, iat: 1730000000 })).toBe(true);
        expect(svc.sesionCerradaPara({ id: '7', iat: 1730000001 })).toBe(false);
    });

    test('cerrarSesionDe LANZA si el UPDATE falla y no toca el mapa (el llamador hace el respaldo)', async () => {
        jest.spyOn(logger, 'error').mockImplementation(() => {});
        db.query.mockRejectedValueOnce(errorColumna());
        const svc = nuevoServicio();
        await expect(svc.cerrarSesionDe(7)).rejects.toMatchObject({ errno: 1054 });
        expect(svc.cerradasEn.has(7)).toBe(false);
    });

    test('sesionCerradaPara: iat menor o IGUAL → cerrada; mayor → vigente; sin iat → cerrada; otra persona → vigente', () => {
        const svc = nuevoServicio();
        svc.cerradasEn.set(7, 1000);

        expect(svc.sesionCerradaPara({ id: 7, iat: 999 })).toBe(true);
        expect(svc.sesionCerradaPara({ id: 7, iat: 1000 })).toBe(true);   // mismo segundo: muere a propósito
        expect(svc.sesionCerradaPara({ id: 7, iat: 1001 })).toBe(false);
        expect(svc.sesionCerradaPara({ id: 7 })).toBe(true);
        expect(svc.sesionCerradaPara({ id: 7, iat: 'basura' })).toBe(true);
        expect(svc.sesionCerradaPara({ id: 8, iat: 1 })).toBe(false);
        expect(svc.sesionCerradaPara({ iat: 1 })).toBe(false);
        expect(svc.sesionCerradaPara(null)).toBe(false);
    });

    test('«ver como»: también cuenta quien MIRA (imp) contra el mismo iat', () => {
        const svc = nuevoServicio();
        svc.cerradasEn.set(1, 1000); // al Super Administrador 1 le cambiaron el rol en el segundo 1000

        expect(svc.sesionCerradaPara({ id: 20, imp: 1, iat: 999 })).toBe(true);   // prestado antes del cierre
        expect(svc.sesionCerradaPara({ id: 20, imp: '1', iat: 1000 })).toBe(true); // mismo segundo
        expect(svc.sesionCerradaPara({ id: 20, imp: 1 })).toBe(true);             // sin iat
        expect(svc.sesionCerradaPara({ id: 20, imp: 1, iat: 1001 })).toBe(false); // abierto después
        expect(svc.sesionCerradaPara({ id: 20, imp: 2, iat: 999 })).toBe(false);  // mira otra persona
        expect(svc.sesionCerradaPara({ id: 20, imp: null, iat: 999 })).toBe(false);
        expect(svc.sesionCerradaPara({ id: 20, iat: 999 })).toBe(false);          // token propio de la persona 20
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('(b) middleware de auth — solo la persona vuelve a entrar', () => {
    let app;
    let t;

    beforeAll(() => {
        app = express();
        app.get('/probe', auth, (req, res) => res.json({ ok: true, id: req.user.id }));
        app.post('/probe', auth, (req, res) => res.json({ ok: true }));
    });

    beforeEach(async () => {
        versionService.cerradasEn.clear();
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        t = await versionService.cerrarSesionDe(7); // a la persona 7 (rol 3) le cambiaron sus permisos
    });

    afterAll(() => versionService.cerradasEn.clear());

    test('token de esa persona emitido ANTES → 401 expired_by_version (mismo cuerpo que el de versión de rol)', async () => {
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${token(7, 3, t - 60)}`);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: MENSAJE_PERMISOS, expired_by_version: true });
    });

    test('token de esa persona emitido en el MISMO segundo → 401 (preferible a dejar vivo uno viejo)', async () => {
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${token(7, 3, t)}`);
        expect(res.status).toBe(401);
        expect(res.body.expired_by_version).toBe(true);
    });

    test('token de esa persona emitido DESPUÉS (volvió a entrar) → pasa', async () => {
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${token(7, 3, t + 2)}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ok: true, id: 7 });
    });

    test('otra persona del MISMO rol, con token viejo → pasa (ya no sale todo el rol)', async () => {
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${token(10, 3, t - 60)}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(10);
    });

    test('«ver como» de esa persona emitido antes → también 401 (su id es el de la persona mirada)', async () => {
        const verComo = token(7, 3, t - 30, { imp: 1, ro: true });
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${verComo}`);
        expect(res.status).toBe(401);
        expect(res.body.expired_by_version).toBe(true);
    });

    test('«ver como» abierto por quien MIRA antes de que le cambiaran el rol → 401; abierto después → pasa', async () => {
        versionService.cerradasEn.set(1, t); // a Marcos (Super Administrador 1) le cambiaron el rol
        const prestado = token(20, 3, t - 30, { imp: 1, ro: true }); // Marcos mirando como la persona 20
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${prestado}`);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error: MENSAJE_PERMISOS, expired_by_version: true });

        const nuevo = token(20, 3, t + 2, { imp: 1, ro: true });
        const ok = await request(app).get('/probe').set('Authorization', `Bearer ${nuevo}`);
        expect(ok.status).toBe(200);
        expect(ok.body.id).toBe(20);
    });

    test('sin cierres en el mapa (servicio sin inicializar) → nada cambia', async () => {
        versionService.cerradasEn.clear();
        const res = await request(app).get('/probe').set('Authorization', `Bearer ${token(7, 3, t - 60)}`);
        expect(res.status).toBe(200);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('(c) POST /usuarios/user-overrides/:id', () => {
    let app;
    // permisos_catalogo de mentira. El IN de la BD real no distingue mayúsculas (utf8mb4_general_ci) y devuelve la
    // clave tal como está en el catálogo: el mock hace lo mismo.
    const CATALOGO = ['asistencia.ver', 'inventario.ver', 'inventario.transferencias.aprobar'];
    const bd = (extra = {}) => async (sql, params) => {
        const s = String(sql);
        if (s.startsWith('SELECT clave FROM permisos_catalogo WHERE clave IN (?)')) {
            const pedidas = new Set(params[0].map(c => String(c).toLowerCase()));
            return [CATALOGO.filter(c => pedidas.has(c)).map(clave => ({ clave }))];
        }
        const prefijo = Object.keys(extra).find(p => s.startsWith(p));
        return prefijo ? extra[prefijo] : [[]];
    };
    const ADMIN = () => token(1, 1, Math.floor(Date.now() / 1000) - 5, { p: ['usuarios.permisos.gestionar', 'usuarios.ver'] });
    const post = (id, body) => request(app).post(`/usuarios/user-overrides/${id}`)
        .set('Authorization', `Bearer ${ADMIN()}`).send(body);

    beforeAll(() => {
        const router = require('../src/routes/usuarios.routes');
        app = express();
        app.use(express.json());
        app.use('/usuarios', router);
        app.get('/probe', auth, (req, res) => res.json({ ok: true, id: req.user.id }));
        // eslint-disable-next-line no-unused-vars
        app.use((err, req, res, next) => res.status(err.statusCode || 500).json({ error: err.message }));
    });

    beforeEach(() => {
        versionService.cerradasEn.clear();
        db.query.mockImplementation(bd());
        jest.spyOn(permisosService, 'setOverrides').mockResolvedValue(undefined);
        jest.spyOn(versionService, 'increment').mockResolvedValue(2);
    });

    afterAll(() => versionService.cerradasEn.clear());

    test('200: guarda los overrides y cierra la sesión SOLO de esa persona (no sube la versión del rol)', async () => {
        const cerrar = jest.spyOn(versionService, 'cerrarSesionDe').mockResolvedValue(1730000000);
        const overrides = [
            { permiso_clave: 'inventario.transferencias.aprobar', tipo: 'grant' },
            { permiso_clave: 'asistencia.ver', tipo: 'deny' },
        ];

        const res = await post(20, { overrides, rol_id: 3 });

        expect(res.status).toBe(200);
        expect(permisosService.setOverrides).toHaveBeenCalledWith('20', overrides);
        expect(cerrar).toHaveBeenCalledTimes(1);
        expect(cerrar).toHaveBeenCalledWith('20');
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('lista vacía = quitarle todos sus permisos propios → 200 (y rol_id ya no hace falta)', async () => {
        const cerrar = jest.spyOn(versionService, 'cerrarSesionDe').mockResolvedValue(1730000000);
        const res = await post(20, { overrides: [] });
        expect(res.status).toBe(200);
        expect(permisosService.setOverrides).toHaveBeenCalledWith('20', []);
        expect(cerrar).toHaveBeenCalledWith('20');
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('de punta a punta: la persona editada sale; otra persona de su rol sigue dentro', async () => {
        const antes = Math.floor(Date.now() / 1000) - 60;
        const res = await post(20, { overrides: [{ permiso_clave: 'asistencia.ver', tipo: 'deny' }] });
        expect(res.status).toBe(200);
        expect(db.query).toHaveBeenCalledWith(SQL_CERRAR, [expect.any(Number), 20]);

        const editada = await request(app).get('/probe').set('Authorization', `Bearer ${token(20, 3, antes)}`);
        expect(editada.status).toBe(401);
        expect(editada.body.expired_by_version).toBe(true);
        const companera = await request(app).get('/probe').set('Authorization', `Bearer ${token(21, 3, antes)}`);
        expect(companera.status).toBe(200);
        expect(versionService.increment).not.toHaveBeenCalled();
    });

    test('respaldo: si no se puede cerrar la sesión de la persona (mig 146 sin correr) → sube la versión del rol que tiene en la BD, NO el rol_id del body', async () => {
        // Pestaña vieja: el body dice rol 3, pero a la persona ya la pasaron al rol 5 (y volvió a entrar con el 5).
        jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(versionService, 'cerrarSesionDe').mockRejectedValue(errorColumna());
        db.query.mockImplementation(bd({ 'SELECT rol_id FROM usuarios WHERE id = ?': [[{ rol_id: 5 }]] }));

        const res = await post(20, { overrides: [{ permiso_clave: 'asistencia.ver', tipo: 'deny' }], rol_id: 3 });

        expect(res.status).toBe(200);
        expect(db.query).toHaveBeenCalledWith('SELECT rol_id FROM usuarios WHERE id = ?', ['20']);
        expect(versionService.increment).toHaveBeenCalledTimes(1);
        expect(versionService.increment).toHaveBeenCalledWith(5);
        expect(logger.warn).toHaveBeenCalled();
    });

    test('respaldo sin rol_id en el body → lee el rol de la persona y sube ESE', async () => {
        jest.spyOn(logger, 'warn').mockImplementation(() => {});
        jest.spyOn(versionService, 'cerrarSesionDe').mockRejectedValue(errorColumna());
        db.query.mockImplementation(bd({ 'SELECT rol_id FROM usuarios WHERE id = ?': [[{ rol_id: 4 }]] }));

        const res = await post(20, { overrides: [] });

        expect(res.status).toBe(200);
        expect(db.query).toHaveBeenCalledWith('SELECT rol_id FROM usuarios WHERE id = ?', ['20']);
        expect(versionService.increment).toHaveBeenCalledTimes(1);
        expect(versionService.increment).toHaveBeenCalledWith(4);
    });

    test('una clave repetida se queda con la ÚLTIMA (no revienta por duplicado)', async () => {
        jest.spyOn(versionService, 'cerrarSesionDe').mockResolvedValue(1730000000);
        const res = await post(20, {
            overrides: [
                { permiso_clave: 'asistencia.ver', tipo: 'grant' },
                { permiso_clave: 'inventario.ver', tipo: 'grant' },
                { permiso_clave: 'asistencia.ver', tipo: 'deny' },
            ],
        });
        expect(res.status).toBe(200);
        expect(permisosService.setOverrides).toHaveBeenCalledWith('20', [
            { permiso_clave: 'asistencia.ver', tipo: 'deny' },
            { permiso_clave: 'inventario.ver', tipo: 'grant' },
        ]);
    });

    test('mayúsculas: «ASISTENCIA.VER» es la misma clave que «asistencia.ver» (queda la última, escrita como en el catálogo)', async () => {
        // La PK (usuario_id, permiso_clave) no distingue mayúsculas: dos filas así reventaban con errno 1062 → 500.
        jest.spyOn(versionService, 'cerrarSesionDe').mockResolvedValue(1730000000);
        const res = await post(20, {
            overrides: [
                { permiso_clave: 'asistencia.ver', tipo: 'grant' },
                { permiso_clave: 'ASISTENCIA.VER', tipo: 'deny' },
                { permiso_clave: 'Inventario.Ver', tipo: 'grant' },
            ],
        });
        expect(res.status).toBe(200);
        expect(permisosService.setOverrides).toHaveBeenCalledWith('20', [
            { permiso_clave: 'asistencia.ver', tipo: 'deny' },
            { permiso_clave: 'inventario.ver', tipo: 'grant' },
        ]);
    });

    test('400 si una clave no está en el catálogo: solo LEE el catálogo, no escribe ni cierra sesiones', async () => {
        // Antes llegaba al INSERT y la FK a permisos_catalogo reventaba con errno 1452 → 500.
        const cerrar = jest.spyOn(versionService, 'cerrarSesionDe');

        const res = await post(20, {
            overrides: [
                { permiso_clave: 'asistencia.ver', tipo: 'grant' },
                { permiso_clave: 'no.existe', tipo: 'grant' },
            ],
        });

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Este permiso no existe en el catálogo: «no\.existe»/);
        expect(permisosService.setOverrides).not.toHaveBeenCalled();
        expect(cerrar).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(
            'SELECT clave FROM permisos_catalogo WHERE clave IN (?)', [['asistencia.ver', 'no.existe']],
        );
    });

    test('400 con varias claves fuera del catálogo: las nombra (hasta 5 y «N más»)', async () => {
        const overrides = Array.from({ length: 7 }, (_, i) => ({ permiso_clave: `basura.${i}`, tipo: 'deny' }));
        const res = await post(20, { overrides });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/^Estos permisos no existen en el catálogo: «basura\.0», .*«basura\.4» y 2 más\./);
        expect(permisosService.setOverrides).not.toHaveBeenCalled();
    });

    test('solo pasan permiso_clave y tipo (campos de más se ignoran; la clave se recorta)', async () => {
        jest.spyOn(versionService, 'cerrarSesionDe').mockResolvedValue(1730000000);
        const res = await post(20, { overrides: [{ permiso_clave: '  asistencia.ver ', tipo: 'grant', usuario_id: 999, hack: 1 }] });
        expect(res.status).toBe(200);
        expect(permisosService.setOverrides).toHaveBeenCalledWith('20', [{ permiso_clave: 'asistencia.ver', tipo: 'grant' }]);
    });

    test.each([
        ['tipo raro', { overrides: [{ permiso_clave: 'asistencia.ver', tipo: 'allow' }] }, /tipo no válido/],
        ['tipo «default»', { overrides: [{ permiso_clave: 'asistencia.ver', tipo: 'default' }] }, /tipo no válido/],
        ['overrides no es lista', { overrides: { permiso_clave: 'asistencia.ver', tipo: 'grant' } }, /debe ser una lista/],
        ['sin overrides', { rol_id: 3 }, /debe ser una lista/],
        ['clave vacía', { overrides: [{ permiso_clave: '', tipo: 'grant' }] }, /no trae su clave/],
        ['clave solo espacios', { overrides: [{ permiso_clave: '   ', tipo: 'deny' }] }, /no trae su clave/],
        ['clave que no es texto', { overrides: [{ permiso_clave: 12, tipo: 'deny' }] }, /no trae su clave/],
        ['clave de más de 100 caracteres', { overrides: [{ permiso_clave: `a.${'x'.repeat(99)}`, tipo: 'grant' }] }, /demasiado larga/],
        ['elemento nulo', { overrides: [null] }, /no es válido/],
    ])('400 con payload inválido (%s): no toca la BD ni cierra sesiones', async (_caso, body, mensaje) => {
        const cerrar = jest.spyOn(versionService, 'cerrarSesionDe');

        const res = await post(20, body);

        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(mensaje);
        expect(permisosService.setOverrides).not.toHaveBeenCalled();
        expect(cerrar).not.toHaveBeenCalled();
        expect(versionService.increment).not.toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
    });

    test('sin usuarios.permisos.gestionar → 403 (sin cambios)', async () => {
        const sinPermiso = token(5, 3, Math.floor(Date.now() / 1000) - 5, { p: ['usuarios.ver'] });
        const res = await request(app).post('/usuarios/user-overrides/20')
            .set('Authorization', `Bearer ${sinPermiso}`).send({ overrides: [] });
        expect(res.status).toBe(403);
        expect(permisosService.setOverrides).not.toHaveBeenCalled();
    });
});

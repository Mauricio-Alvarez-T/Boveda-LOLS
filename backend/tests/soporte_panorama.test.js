/**
 * «Soporte · Panorama» (Marcos 2026-10-26, docs/reglas/seguridad-rbac.md § Ver como usuario):
 * GET /api/soporte/panorama — los usuarios activos con sus permisos efectivos, para la tabla de qué secciones del
 * menú ve cada uno.
 *
 * Cubre:
 *   - solo el rol 1 (en el token Y en la BD): 403 a un Administrador con todos los permisos de usuarios, 403 a un
 *     token de «ver como» (aunque diga rol 1), 401 sin token;
 *   - nada sensible (password_hash) ni inactivos; Cache-Control: no-store;
 *   - los efectivos son EXACTAMENTE los de `permisosService.detallePermisos` (el cálculo del login) con los mismos
 *     datos, incluido el rol 1 (todo el catálogo menos sus deny, salvo las claves de seguridad);
 *   - un número FIJO de consultas, sin una por persona.
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
const permisosService = require('../src/services/permisos.service');
const soporteService = require('../src/services/soporte.service');

const SECRETO = process.env.JWT_SECRET || 'secret';

const persona = (id, nombre, rol_id, rol_nombre, extra = {}) => ({
    id, nombre, email: `${nombre.split(' ')[0].toLowerCase()}@lols.cl`, rol_id, rol_nombre, activo: 1,
    obra_id: null, obra_nombre: null, bodega_id: null, bodega_nombre: null, password_hash: 'NO-DEBE-SALIR', ...extra,
});

/** La BD simulada (se puede agrandar en un test). */
let USUARIOS;
let PERMISOS_ROL;
let OVERRIDES;
const CATALOGO = [
    'asistencia.ver', 'inventario.ver', 'inventario.tab.transferencias', 'inventario.transferencias.aprobar',
    'inventario.costos.ver', 'usuarios.ver', 'ideas.revisar', 'costos.gestionar', 'trabajadores.ver', 'vehiculos.ver',
];

function datosBase() {
    USUARIOS = [
        persona(1, 'Marcos Uribe', 1, 'Super Administrador'),
        persona(2, 'Mauricio Torres', 1, 'Super Administrador'),
        persona(7, 'Leonardo López', 3, 'Administrador', { obra_id: 4, obra_nombre: 'Gorbea 3082', bodega_id: 2, bodega_nombre: 'Bodega Cerrillos' }),
        persona(10, 'Paula Martínez', 3, 'Administrador'),
        persona(20, 'Tomás Vera', 4, 'Jefe de Obra', { obra_id: 4, obra_nombre: 'Gorbea 3082' }),
        // Un rol sin ningún permiso: solo lo que le dieron a mano.
        persona(31, 'Héctor Gómez', 8, 'Bodeguero', { bodega_id: 1, bodega_nombre: 'Bodega Cerrillos' }),
        persona(8, 'Persona Inactiva', 4, 'Jefe de Obra', { activo: 0 }),
    ];
    PERMISOS_ROL = {
        3: ['inventario.ver', 'inventario.tab.transferencias', 'asistencia.ver', 'trabajadores.ver'],
        4: ['asistencia.ver', 'inventario.ver', 'trabajadores.ver', 'vehiculos.ver'],
        8: [],
    };
    OVERRIDES = {
        // Rol 1: un deny normal sí quita; uno sobre una clave de seguridad no; un grant no aplica.
        1: [
            { permiso_clave: 'inventario.costos.ver', tipo: 'deny' },
            { permiso_clave: 'usuarios.ver', tipo: 'deny' },
            { permiso_clave: 'no.existe', tipo: 'grant' },
        ],
        7: [
            { permiso_clave: 'inventario.transferencias.aprobar', tipo: 'grant' },
            { permiso_clave: 'asistencia.ver', tipo: 'deny' },
        ],
        20: [{ permiso_clave: 'vehiculos.ver', tipo: 'deny' }],
        31: [{ permiso_clave: 'inventario.ver', tipo: 'grant' }],
    };
}

let INGRESOS = {};
const activos = () => USUARIOS.filter(u => u.activo === 1).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
const porId = (id) => USUARIOS.find(u => u.id === Number(id));

function bd() {
    db.query.mockImplementation(async (sql, params = []) => {
        const s = String(sql);
        if (s.startsWith('SELECT id, nombre, rol_id, activo FROM usuarios WHERE id = ?')) {
            const u = porId(params[0]);
            return [u ? [u] : []];
        }
        if (s.includes('WHERE u.activo = 1')) return [activos()];
        // En lote (Panorama)
        if (s.includes('FROM permisos_rol_v2 WHERE rol_id IN (?)')) {
            return [params[0].flatMap(rol => (PERMISOS_ROL[rol] || []).map(permiso_clave => ({ rol_id: rol, permiso_clave })))];
        }
        if (s.includes('FROM permisos_usuario_override WHERE usuario_id IN (?)')) {
            return [params[0].flatMap(id => (OVERRIDES[id] || []).map(o => ({ usuario_id: id, ...o })))];
        }
        // De a una persona (detallePermisos: login y ficha)
        if (s.includes('FROM permisos_rol_v2 WHERE rol_id = ?')) {
            return [(PERMISOS_ROL[params[0]] || []).map(permiso_clave => ({ permiso_clave }))];
        }
        if (s.includes('FROM permisos_usuario_override WHERE usuario_id = ?')) return [OVERRIDES[params[0]] || []];
        if (s.startsWith('SELECT clave FROM permisos_catalogo')) return [CATALOGO.map(clave => ({ clave }))];
        // Último ingreso, en lote (el LOGIN de «acceso» más reciente de cada persona).
        if (s.includes('FROM logs_actividad') && s.includes('GROUP BY usuario_id')) {
            return [Object.entries(INGRESOS).map(([usuario_id, t]) => ({ usuario_id: Number(usuario_id), t }))];
        }
        return [[]];
    });
}

/** Token de sesión como el del login. */
const sesion = (u, extra = {}) => jwt.sign(
    { typ: 'session', id: u.id, email: u.email, rol_id: u.rol_id, obra_id: u.obra_id ?? null, bodega_id: u.bodega_id ?? null, p: extra.p || ['usuarios.ver'], rv: 1, ...extra },
    SECRETO, { expiresIn: '8h' },
);
const consultas = () => db.query.mock.calls.map(([sql]) => String(sql));

beforeEach(() => {
    jest.clearAllMocks();
    datosBase();
    INGRESOS = { 2: '2026-10-26T17:32:00.000Z', 7: '2026-10-20T12:00:00.000Z' };
    bd();
});

describe('último ingreso (lista y Panorama)', () => {
    test('si el historial falla, la lista y el Panorama siguen, con ingreso null', async () => {
        const normal = db.query.getMockImplementation();
        db.query.mockImplementation(async (sql, params) => {
            if (String(sql).includes('GROUP BY usuario_id')) throw new Error('logs caído');
            return normal(sql, params);
        });
        const lista = await soporteService.listarUsuarios();
        expect(lista.map(u => u.id)).toEqual(activos().map(u => u.id));
        expect(lista.every(u => u.ultimo_ingreso === null)).toBe(true);
        const filas = await soporteService.panorama();
        expect(filas.every(u => u.ultimo_ingreso === null)).toBe(true);
    });

    test('el «ver como» (modulo soporte) no cuenta: solo LOGIN de «acceso»', async () => {
        await soporteService.listarUsuarios();
        const sql = consultas().find(s => s.includes('GROUP BY usuario_id'));
        expect(sql).toMatch(/accion = 'LOGIN' AND modulo = 'acceso'/);
    });
});

describe('GET /api/soporte/panorama: solo el Super Administrador (rol 1)', () => {
    test('rol 1 → una fila por usuario activo, con sus permisos efectivos y sin nada sensible', async () => {
        const res = await request(app).get('/api/soporte/panorama').set('Authorization', `Bearer ${sesion(porId(1))}`);
        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const filas = res.body.data;
        expect(filas.map(u => u.id)).toEqual(activos().map(u => u.id));
        expect(filas.some(u => u.id === 8)).toBe(false);
        expect(JSON.stringify(res.body)).not.toContain('NO-DEBE-SALIR');
        // Solo lo que hace falta: identificación, rol, obra, bodega y los efectivos.
        for (const f of filas) {
            expect(Object.keys(f).sort()).toEqual([
                'bodega_id', 'bodega_nombre', 'efectivos', 'email', 'id', 'nombre', 'obra_id', 'obra_nombre', 'rol_id', 'rol_nombre',
                'ultimo_ingreso',
            ]);
        }
        // Último ingreso: el del historial; quien no tiene ninguno, null.
        expect(filas.find(u => u.id === 2).ultimo_ingreso).toBe('2026-10-26T17:32:00.000Z');
        expect(filas.find(u => u.id === 7).ultimo_ingreso).toBe('2026-10-20T12:00:00.000Z');
        expect(filas.find(u => u.id === 10).ultimo_ingreso).toBeNull();
        expect(filas.find(u => u.id === 7)).toMatchObject({ rol_id: 3, rol_nombre: 'Administrador', obra_id: 4, bodega_id: 2 });
    });

    test('un Administrador con todos los permisos de usuarios → 403', async () => {
        const admin = sesion(porId(10), { p: ['usuarios.ver', 'usuarios.editar', 'usuarios.permisos.gestionar', 'sistema.logs.ver', 'usuarios.roles.ver'] });
        const res = await request(app).get('/api/soporte/panorama').set('Authorization', `Bearer ${admin}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('SOLO_SUPER_ADMIN');
        expect(consultas().some(s => s.includes('permisos_usuario_override'))).toBe(false);
    });

    test('un token de «ver como» no entra, aunque diga rol 1', async () => {
        const forjado = sesion(porId(1), { imp: 2, ro: true });
        const res = await request(app).get('/api/soporte/panorama').set('Authorization', `Bearer ${forjado}`);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('VER_COMO_NO_ENCADENA');
    });

    test('token de rol 1 pero en la BD ya no es rol 1 → 403; sin token → 401', async () => {
        USUARIOS.find(u => u.id === 1).rol_id = 3;
        const token = sesion({ ...porId(1), rol_id: 1 });
        let res = await request(app).get('/api/soporte/panorama').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        res = await request(app).get('/api/soporte/panorama');
        expect(res.status).toBe(401);
    });
});

describe('Panorama: el mismo cálculo que el login, en lote', () => {
    const ordenado = (l) => [...l].sort();

    test('los efectivos de cada persona = detallePermisos(id, rol) con los mismos datos', async () => {
        const filas = await soporteService.panorama();
        expect(filas).toHaveLength(activos().length);
        for (const f of filas) {
            const det = await permisosService.detallePermisos(f.id, f.rol_id);
            expect(ordenado(f.efectivos)).toEqual(ordenado(det.efectivos));
        }
    });

    test('rol 1 = todo el catálogo menos sus deny (las claves de seguridad no se quitan); el resto, rol + grant − deny', async () => {
        const filas = await soporteService.panorama();
        const de = (id) => filas.find(f => f.id === id).efectivos;
        expect(ordenado(de(1))).toEqual(ordenado(CATALOGO.filter(k => k !== 'inventario.costos.ver')));
        expect(de(1)).toContain('usuarios.ver');
        expect(de(1)).not.toContain('no.existe');
        expect(ordenado(de(2))).toEqual(ordenado(CATALOGO));
        expect(ordenado(de(7))).toEqual(ordenado(['inventario.ver', 'inventario.tab.transferencias', 'trabajadores.ver', 'inventario.transferencias.aprobar']));
        expect(ordenado(de(10))).toEqual(ordenado(PERMISOS_ROL[3]));
        expect(ordenado(de(20))).toEqual(ordenado(['asistencia.ver', 'inventario.ver', 'trabajadores.ver']));
        expect(de(31)).toEqual(['inventario.ver']);
    });

    test('un número fijo de consultas (5), tenga 6 personas o 60; ninguna por persona', async () => {
        await soporteService.panorama();
        const pocas = consultas();
        expect(pocas).toHaveLength(5);

        jest.clearAllMocks();
        for (let i = 0; i < 54; i++) {
            const rol = [3, 4, 8, 1][i % 4];
            USUARIOS.push(persona(100 + i, `Persona ${String(i).padStart(2, '0')}`, rol, `Rol ${rol}`));
            if (i % 3 === 0) OVERRIDES[100 + i] = [{ permiso_clave: 'vehiculos.ver', tipo: 'grant' }];
        }
        const filas = await soporteService.panorama();
        expect(filas).toHaveLength(60);
        const muchas = consultas();
        expect(muchas).toHaveLength(5);
        expect(muchas.some(s => s.includes('WHERE usuario_id = ?') || s.includes('WHERE rol_id = ?'))).toBe(false);
        // Los roles presentes van una sola vez (sin el 1: su base es el catálogo).
        const llamadaRoles = db.query.mock.calls.find(([sql]) => String(sql).includes('WHERE rol_id IN (?)'));
        expect(ordenado(llamadaRoles[1][0])).toEqual([3, 4, 8]);
    });

    test('sin ningún rol 1 no lee el catálogo; sin nadie activo, una sola consulta', async () => {
        USUARIOS = USUARIOS.filter(u => u.rol_id !== 1);
        await soporteService.panorama();
        expect(consultas().some(s => s.includes('permisos_catalogo'))).toBe(false);
        expect(consultas()).toHaveLength(4);

        jest.clearAllMocks();
        USUARIOS = [];
        expect(await soporteService.panorama()).toEqual([]);
        expect(consultas()).toHaveLength(1);
    });
});

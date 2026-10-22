/**
 * «Solo Leonardo aprueba» + permiso «Ver diferencias» (decisión del dueño 2026-10-22, mig 131).
 *   · VER diferencias (GET /discrepancias) = `aprobar` O `diferencias_ver` (patrón OR).
 *   · Resolver, rehacer, foto y borrar una diferencia NO se abren con `diferencias_ver`.
 *   · La migración: catálogo primero, el rol «Administrador» deja de aprobar, los permisos propios van por correo y
 *     fuerza el re-login (roles.version + 1) sin tocar al Super Administrador.
 * El conteo del Inicio con `diferencias_ver` se prueba en transferencias_inicio.test.js.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
jest.mock('../src/services/transferencia.service', () => ({
    getDiscrepancias: jest.fn(),
    resolverDiscrepancia: jest.fn(),
    rehacerDiscrepancia: jest.fn(),
    setFotoDiscrepancia: jest.fn(),
    eliminarDiscrepancia: jest.fn(),
    getPendientes: jest.fn(),
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const service = require('../src/services/transferencia.service');
const MAESTRO = require('../src/config/permisos.config');

const SECRET = process.env.JWT_SECRET || 'secret';
const APROBAR = 'inventario.transferencias.aprobar';
const VER_DIF = 'inventario.transferencias.diferencias_ver';
const token = (p, rol_id = 3) => jwt.sign({ id: 14, email: 'daphnelazcano@lols.cl', rol_id, rv: 1, p }, SECRET);
const conToken = (req, p, rol_id) => req.set('Authorization', `Bearer ${token(p, rol_id)}`);

beforeEach(() => {
    jest.clearAllMocks();
    service.getDiscrepancias.mockResolvedValue({ data: [], total: 0, page: 1, limit: 50 });
    service.resolverDiscrepancia.mockResolvedValue({ id: 31, estado: 'resuelta', ajustes: [], aviso: null, simulado: true });
    service.rehacerDiscrepancia.mockResolvedValue({ id: 31, ajustes: [], aviso: null, simulado: true });
    service.setFotoDiscrepancia.mockResolvedValue({ id: 31 });
    service.eliminarDiscrepancia.mockResolvedValue({ id: 31 });
    service.getPendientes.mockResolvedValue({ data: [], total: 0 });
});

describe('GET /api/transferencias/discrepancias: aprobar O diferencias_ver', () => {
    test('sin ninguno de los dos → 403 y no consulta', async () => {
        const res = await conToken(request(app).get('/api/transferencias/discrepancias?estado=pendiente'),
            ['inventario.ver', 'inventario.transferencias.ver_todas', 'inventario.transferencias.cancelar']);
        expect(res.status).toBe(403);
        expect(res.body.required).toEqual([APROBAR, VER_DIF]);
        expect(service.getDiscrepancias).not.toHaveBeenCalled();
    });

    test('con solo diferencias_ver → 200 con la lista', async () => {
        const res = await conToken(request(app).get('/api/transferencias/discrepancias?estado=pendiente'), ['inventario.ver', VER_DIF]);
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ data: [], total: 0 });
        expect(service.getDiscrepancias).toHaveBeenCalledWith(expect.objectContaining({ estado: 'pendiente' }));
    });

    test('con aprobar (sin diferencias_ver) sigue igual → 200', async () => {
        const res = await conToken(request(app).get('/api/transferencias/discrepancias'), [APROBAR]);
        expect(res.status).toBe(200);
    });
});

describe('con solo diferencias_ver no se resuelve, ni se rehace, ni se sube foto, ni se borra', () => {
    const SOLO_VER = ['inventario.ver', VER_DIF, 'inventario.transferencias.ver_todas'];

    test.each(['', '?simular=1'])('PUT /discrepancias/:id/resolver%s → 403', async (qs) => {
        const res = await conToken(request(app).put(`/api/transferencias/discrepancias/31/resolver${qs}`), SOLO_VER)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(403);
        expect(res.body.required).toEqual([APROBAR]);
        expect(service.resolverDiscrepancia).not.toHaveBeenCalled();
    });

    test('POST /discrepancias/:id/rehacer → 403 (aunque fuera Super Administrador sin aprobar en el token)', async () => {
        const res = await conToken(request(app).post('/api/transferencias/discrepancias/31/rehacer?simular=1'), SOLO_VER, 1);
        expect(res.status).toBe(403);
        expect(service.rehacerDiscrepancia).not.toHaveBeenCalled();
    });

    test('POST /discrepancias/:id/foto → 403 antes de recibir el archivo', async () => {
        const res = await conToken(request(app).post('/api/transferencias/discrepancias/31/foto'), SOLO_VER)
            .attach('foto', Buffer.from([0xff, 0xd8, 0xff]), 'foto.jpg');
        expect(res.status).toBe(403);
        expect(res.body.required).toEqual([APROBAR]);
        expect(service.setFotoDiscrepancia).not.toHaveBeenCalled();
    });

    test('DELETE /discrepancias/:id → 403', async () => {
        const res = await conToken(request(app).delete('/api/transferencias/discrepancias/31'), SOLO_VER);
        expect(res.status).toBe(403);
        expect(service.eliminarDiscrepancia).not.toHaveBeenCalled();
    });

    test('GET /pendientes (lo que se aprueba) → 403', async () => {
        const res = await conToken(request(app).get('/api/transferencias/pendientes'), SOLO_VER);
        expect(res.status).toBe(403);
    });

    test('con aprobar, resolver sigue respondiendo 200', async () => {
        const res = await conToken(request(app).put('/api/transferencias/discrepancias/31/resolver?simular=1'), [APROBAR])
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(200);
        expect(service.resolverDiscrepancia).toHaveBeenCalledTimes(1);
    });
});

describe('catálogo: «Ver diferencias»', () => {
    test('está en Inventario, con nombre y descripción en español, y no reemplaza a aprobar', () => {
        const fila = MAESTRO.find(([clave]) => clave === VER_DIF);
        expect(fila).toBeTruthy();
        const [, modulo, nombre, descripcion, orden] = fila;
        expect(modulo).toBe('Inventario');
        expect(nombre).toBe('Ver diferencias');
        expect(descripcion).toMatch(/sin poder resolverlas/);
        expect(Number.isInteger(orden)).toBe(true);
        expect(MAESTRO.some(([clave]) => clave === APROBAR)).toBe(true);
    });
});

describe('migración 131_solo_leonardo_aprueba.sql', () => {
    const SQL = fs.readFileSync(path.resolve(__dirname, '../db/migrations/131_solo_leonardo_aprueba.sql'), 'utf8');
    // Solo las sentencias (los comentarios nombran tablas y correos).
    const sentencias = SQL.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

    test('el catálogo va PRIMERO (FK) y con el mismo nombre y descripción que permisos.config.js', () => {
        const iCat = sentencias.indexOf('INSERT IGNORE INTO permisos_catalogo');
        const iOvr = sentencias.indexOf('INSERT INTO permisos_usuario_override');
        const iRol = sentencias.indexOf('INSERT IGNORE INTO permisos_rol_v2');
        expect(iCat).toBeGreaterThan(-1);
        expect(iOvr).toBeGreaterThan(iCat);
        expect(iRol).toBeGreaterThan(iCat);
        const [, , nombre, descripcion, orden] = MAESTRO.find(([clave]) => clave === VER_DIF);
        expect(sentencias).toContain(`'${nombre}'`);
        expect(sentencias).toContain(`'${descripcion}'`);
        expect(sentencias).toMatch(new RegExp(`\\b${orden}\\);`));
    });

    test('quita aprobar del rol «Administrador» (solo de ese rol) y del permiso propio de los demás del rol', () => {
        expect(sentencias).toMatch(/DELETE pr\s+FROM permisos_rol_v2 pr\s+JOIN roles r ON r\.id = pr\.rol_id\s+WHERE r\.nombre = 'Administrador'\s+AND pr\.permiso_clave = 'inventario\.transferencias\.aprobar';/);
        expect(sentencias).toMatch(/DELETE o\s+FROM permisos_usuario_override o[\s\S]*WHERE r\.nombre = 'Administrador'[\s\S]*AND o\.tipo = 'grant'\s+AND u\.email <> 'leonardolopez@lols\.cl';/);
        // Nunca se borra nada del catálogo ni de otro rol.
        expect(sentencias).not.toMatch(/DELETE[\s\S]*FROM permisos_catalogo/);
    });

    test('permisos propios por correo: Leonardo aprueba y cancela; Daphne ve diferencias y cancela', () => {
        const bloques = sentencias.split(';').filter(s => /INSERT INTO permisos_usuario_override/.test(s));
        expect(bloques).toHaveLength(2);
        const leo = bloques.find(b => b.includes("u.email = 'leonardolopez@lols.cl'"));
        const daphne = bloques.find(b => b.includes("u.email = 'daphnelazcano@lols.cl'"));
        expect(leo).toMatch(/p\.clave IN \('inventario\.transferencias\.aprobar', 'inventario\.transferencias\.cancelar'\)/);
        expect(daphne).toMatch(/p\.clave IN \('inventario\.transferencias\.diferencias_ver', 'inventario\.transferencias\.cancelar'\)/);
        for (const b of [leo, daphne]) {
            expect(b).toMatch(/SELECT u\.id, p\.clave, 'grant'/);
            expect(b).toMatch(/JOIN permisos_catalogo p/);
            expect(b).toMatch(/ON DUPLICATE KEY UPDATE tipo = 'grant'/);
        }
        // Nadie recibe cancelar en tránsito ni otro permiso crítico.
        expect(sentencias).not.toMatch(/cancelar_en_transito|sod_bypass|eliminar'/);
    });

    test('re-login: roles.version + 1 del rol «Administrador» y del rol de Leonardo/Daphne, nunca del rol 1', () => {
        const iVer = sentencias.indexOf('UPDATE roles');
        expect(iVer).toBeGreaterThan(sentencias.lastIndexOf('INSERT INTO permisos_usuario_override'));
        const upd = sentencias.slice(iVer);
        expect(upd).toMatch(/SET version = version \+ 1/);
        expect(upd).toMatch(/WHERE nombre = 'Administrador'/);
        expect(upd).toMatch(/u\.email IN \('leonardolopez@lols\.cl', 'daphnelazcano@lols\.cl'\)/);
        expect(upd).toMatch(/u\.rol_id <> 1/);
    });
});

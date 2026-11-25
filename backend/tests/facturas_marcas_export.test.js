/**
 * Facturas — filtros, marcas de color compartidas, nombres de colores y export de líneas (mig 158).
 *  · construirFiltros: fechas inclusivas, búsqueda, color/«marcadas», estado; basura se ignora.
 *  · getAll: el COUNT usa los MISMOS filtros; sin la mig 158 lista sin el filtro de marca.
 *  · marcar: color válido o null; no es UPDATE de la factura (módulo propio en el log); 404/409.
 *  · rutas: gates ver/gestionar, color inválido → 400, '/colores' y '/export-lineas' antes de '/:id'.
 *  · exportLineas: solo registradas, categoría o 'SIN CATEGORÍA', total = cantidad × precio.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    activityLogger: (req, res, next) => next(),
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    resolveEntidad: jest.fn().mockResolvedValue({ tipo: null, label: null }),
}));

const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const facturaService = require('../src/services/factura-inventario.service');
const { construirFiltros } = facturaService._interno;

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 5, email: 'daphne@lols.cl', rol_id: 2, rv: 1, p }, SECRET);
const tVer = token(['inventario.facturas.ver']);
const tGestionar = token(['inventario.facturas.ver', 'inventario.facturas.gestionar']);

beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset().mockResolvedValue([[]]);
});

describe('construirFiltros', () => {
    test('sin filtros: solo activas', () => {
        expect(construirFiltros({})).toEqual({ sql: 'f.activo = 1', params: [] });
    });

    test('fechas inclusivas, búsqueda, color y estado — en ese orden de params', () => {
        const f = construirFiltros({ fecha_desde: '2025-01-01', fecha_hasta: '2025-12-31', q: 'acme', color: 'azul', estado: 'registrada' });
        expect(f.sql).toContain('f.fecha_factura >= ?');
        expect(f.sql).toContain('f.fecha_factura < DATE_ADD(?, INTERVAL 1 DAY)');
        expect(f.sql).toContain('(f.numero_factura LIKE ? OR f.proveedor LIKE ?)');
        expect(f.sql).toContain('f.color_marca = ?');
        expect(f.sql).toContain('f.estado = ?');
        expect(f.params).toEqual(['2025-01-01', '2025-12-31', '%acme%', '%acme%', 'azul', 'registrada']);
    });

    test("'marcadas' = cualquier color; valores inválidos se ignoran; sin marca (pre mig 158) no filtra color", () => {
        expect(construirFiltros({ color: 'marcadas' }).sql).toContain('f.color_marca IS NOT NULL');
        expect(construirFiltros({ color: 'rojo', fecha_desde: '1/1/2025', estado: 'anulada' })).toEqual({ sql: 'f.activo = 1', params: [] });
        expect(construirFiltros({ color: 'azul' }, { conMarca: false }).sql).not.toContain('color_marca');
    });
});

describe('GET /api/facturas-inventario (lista filtrada)', () => {
    test('el COUNT usa los mismos filtros que la lista; limit/page viajan', async () => {
        db.query.mockResolvedValueOnce([[{ id: 1, archivo_path: null }]]).mockResolvedValueOnce([[{ total: 1 }]]);
        const res = await request(app).get('/api/facturas-inventario?fecha_desde=2025-01-01&color=marcadas&limit=50&page=2').set('Authorization', `Bearer ${tVer}`);
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        const [lista, cuenta] = db.query.mock.calls;
        expect(lista[0]).toContain('f.color_marca IS NOT NULL');
        expect(lista[1]).toEqual(['2025-01-01', 50, 50]);
        expect(cuenta[0]).toMatch(/SELECT COUNT\(\*\) as total FROM facturas_inventario f WHERE f\.activo = 1 AND f\.fecha_factura >= \? AND f\.color_marca IS NOT NULL/);
        expect(cuenta[1]).toEqual(['2025-01-01']);
    });

    test('mig 158 pendiente (1054): lista sin el filtro de marca en vez de 500', async () => {
        db.query
            .mockRejectedValueOnce(Object.assign(new Error("Unknown column 'f.color_marca'"), { errno: 1054 }))
            .mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ total: 0 }]]);
        const res = await request(app).get('/api/facturas-inventario?color=azul').set('Authorization', `Bearer ${tVer}`);
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[1][0]).not.toContain('color_marca');
    });
});

describe('PUT /api/facturas-inventario/:id/marca', () => {
    test('marca con un color: solo actualiza color_marca y loguea en módulo propio (no en el historial)', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await request(app).put('/api/facturas-inventario/7/marca').set('Authorization', `Bearer ${tGestionar}`).send({ color: 'naranjo' });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ id: 7, color_marca: 'naranjo' });
        expect(db.query.mock.calls[0][0]).toMatch(/UPDATE facturas_inventario SET color_marca = \? WHERE id = \? AND activo = 1/);
        expect(db.query.mock.calls[0][1]).toEqual(['naranjo', 7]);
        expect(logManualActivity.mock.calls[0][1]).toBe('facturas-marcas');
    });

    test('color null quita la marca', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await request(app).put('/api/facturas-inventario/7/marca').set('Authorization', `Bearer ${tGestionar}`).send({ color: null });
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[0][1]).toEqual([null, 7]);
    });

    test('color fuera de la paleta → 400; solo con ver → 403; factura inexistente → 404; sin mig → 409', async () => {
        const r400 = await request(app).put('/api/facturas-inventario/7/marca').set('Authorization', `Bearer ${tGestionar}`).send({ color: 'rojo' });
        expect(r400.status).toBe(400);
        const r403 = await request(app).put('/api/facturas-inventario/7/marca').set('Authorization', `Bearer ${tVer}`).send({ color: 'azul' });
        expect(r403.status).toBe(403);
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        const r404 = await request(app).put('/api/facturas-inventario/99/marca').set('Authorization', `Bearer ${tGestionar}`).send({ color: 'azul' });
        expect(r404.status).toBe(404);
        db.query.mockRejectedValueOnce(Object.assign(new Error('Unknown column'), { errno: 1054 }));
        const r409 = await request(app).put('/api/facturas-inventario/7/marca').set('Authorization', `Bearer ${tGestionar}`).send({ color: 'azul' });
        expect(r409.status).toBe(409);
        expect(r409.body.code).toBe('MIGRACION_PENDIENTE');
    });
});

describe('colores', () => {
    test('GET /colores: paleta completa en orden fijo con su nombre', async () => {
        db.query.mockResolvedValueOnce([[{ color: 'azul', nombre: 'Maquinaria nueva' }]]);
        const res = await request(app).get('/api/facturas-inventario/colores').set('Authorization', `Bearer ${tVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data.map(c => c.color)).toEqual(['naranjo', 'azul', 'verde', 'amarillo', 'morado']);
        expect(res.body.data[1]).toEqual({ color: 'azul', nombre: 'Maquinaria nueva' });
    });

    test('GET /colores sin la mig 158: paleta sin nombres, no 500', async () => {
        db.query.mockRejectedValueOnce(Object.assign(new Error("Table doesn't exist"), { errno: 1146 }));
        const res = await request(app).get('/api/facturas-inventario/colores').set('Authorization', `Bearer ${tVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data.every(c => c.nombre === null)).toBe(true);
    });

    test('PUT /colores/:color guarda el nombre (vacío = sin nombre); color inválido 400; solo ver 403', async () => {
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        const ok = await request(app).put('/api/facturas-inventario/colores/verde').set('Authorization', `Bearer ${tGestionar}`).send({ nombre: '  Arriendo  ' });
        expect(ok.status).toBe(200);
        expect(ok.body.data).toEqual({ color: 'verde', nombre: 'Arriendo' });
        expect(db.query.mock.calls[0][1]).toEqual(['verde', 'Arriendo', 5]);
        const vacio = await request(app).put('/api/facturas-inventario/colores/verde').set('Authorization', `Bearer ${tGestionar}`).send({ nombre: '' });
        expect(vacio.body.data.nombre).toBeNull();
        expect((await request(app).put('/api/facturas-inventario/colores/rojo').set('Authorization', `Bearer ${tGestionar}`).send({ nombre: 'x' })).status).toBe(400);
        expect((await request(app).put('/api/facturas-inventario/colores/verde').set('Authorization', `Bearer ${tVer}`).send({ nombre: 'x' })).status).toBe(403);
    });
});

describe('GET /export-lineas', () => {
    test('solo registradas, con filtros; categoría o SIN CATEGORÍA; total redondeado', async () => {
        db.query.mockResolvedValueOnce([[
            { factura_id: 1, numero_factura: '225967', fecha_factura: new Date(2025, 0, 24), color_marca: 'naranjo', cantidad: '1.0000', precio_unitario: '3000000.00', categoria: 'MAQUINARIA', categoria_orden: 4, medidas: null },
            { factura_id: 2, numero_factura: '449', fecha_factura: new Date(2025, 7, 4), color_marca: null, cantidad: '2.5000', precio_unitario: '1001.00', categoria: 'SIN CATEGORÍA', categoria_orden: 9999, medidas: '15 x 60' },
        ]]);
        const res = await request(app).get('/api/facturas-inventario/export-lineas?fecha_desde=2025-01-01&fecha_hasta=2025-12-31').set('Authorization', `Bearer ${tVer}`);
        expect(res.status).toBe(200);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain("COALESCE(c.nombre, 'SIN CATEGORÍA')");
        expect(sql).toContain('f.estado = ?');
        expect(params).toEqual(['2025-01-01', '2025-12-31', 'registrada']);
        expect(res.body.data[0]).toMatchObject({ fecha_factura: '2025-01-24', cantidad: 1, precio_unitario: 3000000, total: 3000000 });
        expect(res.body.data[1]).toMatchObject({ total: 2503, medidas: '15 x 60' });
    });

    test('sin permiso de ver → 403', async () => {
        const t = token(['inventario.ver']);
        expect((await request(app).get('/api/facturas-inventario/export-lineas').set('Authorization', `Bearer ${t}`)).status).toBe(403);
    });
});

describe('migración 158_facturas_marcas_medidas.sql', () => {
    const sql = fs.readFileSync(path.join(__dirname, '../db/migrations/158_facturas_marcas_medidas.sql'), 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
    test('idempotente: marca, medidas y tabla de colores con las 5 filas', () => {
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS color_marca ENUM\('naranjo', 'azul', 'verde', 'amarillo', 'morado'\) NULL/);
        expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS medidas VARCHAR\(60\) NULL/);
        expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS facturas_colores/);
        expect(sql).toMatch(/INSERT IGNORE INTO facturas_colores \(color\) VALUES \('naranjo'\), \('azul'\), \('verde'\), \('amarillo'\), \('morado'\)/);
        // («ON DELETE SET NULL» de la FK es válido; lo que no puede haber es borrar datos.)
        expect(sql).not.toMatch(/DELETE FROM|\bDROP\b|permisos_/i);
    });
});

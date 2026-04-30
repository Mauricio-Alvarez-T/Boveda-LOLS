/**
 * Tests endpoint /api/logs (filtros + paginación) + /filtros + /export.
 *
 * Mockea db.query para verificar SQL emitida y poder forzar respuestas.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn().mockResolvedValue({
        query: jest.fn(),
        release: jest.fn(),
    }),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const jwt = require('jsonwebtoken');

const tokenAllowed = () => jwt.sign(
    { id: 1, email: 'admin@lols.cl', rol_id: 1, rv: 1, p: ['sistema.logs.ver'] },
    process.env.JWT_SECRET || 'secret'
);

const tokenForbidden = () => jwt.sign(
    { id: 1, email: 'user@lols.cl', rol_id: 2, rv: 1, p: [] },
    process.env.JWT_SECRET || 'secret'
);

describe('GET /api/logs — listado paginado con filtros', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('403 sin permiso sistema.logs.ver', async () => {
        const res = await request(app)
            .get('/api/logs')
            .set('Authorization', `Bearer ${tokenForbidden()}`);
        expect(res.status).toBe(403);
    });

    test('200 con permiso devuelve estructura paginada', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 50 }]])
            .mockResolvedValueOnce([[
                { id: 1, modulo: 'trabajadores', accion: 'CREATE', usuario_nombre: 'Admin' }
            ]]);

        const res = await request(app)
            .get('/api/logs')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            data: expect.any(Array),
            total: 50,
            page: 1,
            limit: 20,
            total_pages: 3,    // ceil(50/20) = 3
        });
    });

    test('excluye LOGIN por default (incluir_logins ausente)', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [countSql, countParams] = db.query.mock.calls[0];
        expect(countSql).toMatch(/l\.accion NOT IN/i);
        expect(countParams).toContain('LOGIN');
    });

    test('incluir_logins=true NO añade NOT IN LOGIN', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs?incluir_logins=true')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [countSql, countParams] = db.query.mock.calls[0];
        expect(countSql).not.toMatch(/NOT IN.*\?/i);
        expect(countParams).not.toContain('LOGIN');
    });

    test('filtro por usuario_id se traduce a SQL exacto', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs?usuario_id=42')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [, params] = db.query.mock.calls[0];
        expect(params).toContain(42);
    });

    test('filtro accion CSV se traduce a IN(...)', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs?accion=CREATE,DELETE')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/l\.accion IN \(\?,\?\)/);
        expect(params).toEqual(expect.arrayContaining(['CREATE', 'DELETE']));
    });

    test('filtros de fecha emiten >= y <= con horas correctas', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs?desde=2026-04-01&hasta=2026-04-30')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [, params] = db.query.mock.calls[0];
        expect(params).toContain('2026-04-01 00:00:00');
        expect(params).toContain('2026-04-30 23:59:59');
    });

    test('q busca en entidad_label OR detalle OR usuario.nombre', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        await request(app)
            .get('/api/logs?q=Pedro')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/l\.entidad_label LIKE \? OR l\.detalle LIKE \? OR u\.nombre LIKE \?/);
        expect(params.filter(p => p === '%Pedro%').length).toBe(3);
    });

    test('limit > 200 se clampa a 200', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/logs?limit=9999')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        expect(res.body.limit).toBe(200);
    });

    test('total_pages = ceil(total/limit), mínimo 1 cuando total=0', async () => {
        db.query
            .mockResolvedValueOnce([[{ total: 0 }]])
            .mockResolvedValueOnce([[]]);

        const res = await request(app)
            .get('/api/logs')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        expect(res.body.total_pages).toBe(1);
    });
});

describe('GET /api/logs/filtros — datos para dropdowns', () => {
    beforeEach(() => jest.clearAllMocks());

    test('devuelve usuarios distintos, módulos, entidad_tipos y acciones', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 1, nombre: 'Admin' }, { id: 2, nombre: 'Bodega' }]])
            .mockResolvedValueOnce([[{ modulo: 'trabajadores' }, { modulo: 'obras' }]])
            .mockResolvedValueOnce([[{ entidad_tipo: 'trabajador' }, { entidad_tipo: 'obra' }]])
            .mockResolvedValueOnce([[{ accion: 'CREATE' }, { accion: 'UPDATE' }]]);

        const res = await request(app)
            .get('/api/logs/filtros')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            usuarios: [
                { id: 1, nombre: 'Admin' },
                { id: 2, nombre: 'Bodega' },
            ],
            modulos: ['trabajadores', 'obras'],
            entidad_tipos: ['trabajador', 'obra'],
            acciones: ['CREATE', 'UPDATE'],
            acciones_default: expect.arrayContaining(['CREATE', 'UPDATE', 'DELETE']),
        });
    });

    test('403 sin permiso', async () => {
        const res = await request(app)
            .get('/api/logs/filtros')
            .set('Authorization', `Bearer ${tokenForbidden()}`);
        expect(res.status).toBe(403);
    });
});

describe('GET /api/logs/export — CSV con filtros', () => {
    beforeEach(() => jest.clearAllMocks());

    test('content-type CSV + filename con fecha', async () => {
        const conn = {
            query: jest.fn().mockResolvedValue([[]]),
            release: jest.fn(),
        };
        db.getConnection = jest.fn().mockResolvedValue(conn);

        const res = await request(app)
            .get('/api/logs/export')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/text\/csv/);
        expect(res.headers['content-disposition']).toMatch(/historial_\d{4}-\d{2}-\d{2}\.csv/);
        expect(conn.release).toHaveBeenCalled();
    });

    test('CSV inicia con BOM UTF-8 + header de columnas', async () => {
        const conn = {
            query: jest.fn().mockResolvedValue([[]]),
            release: jest.fn(),
        };
        db.getConnection = jest.fn().mockResolvedValue(conn);

        const res = await request(app)
            .get('/api/logs/export')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        // BOM UTF-8 (EF BB BF) → en UTF-8 el char es
        expect(res.text.charCodeAt(0)).toBe(0xFEFF);
        expect(res.text).toContain('Fecha,Usuario,Módulo,Acción');
    });

    test('emite filas en orden recibido del query con resumen extraído', async () => {
        const conn = {
            query: jest.fn().mockResolvedValueOnce([[
                {
                    created_at: new Date('2026-04-21T10:00:00Z'),
                    modulo: 'trabajadores',
                    accion: 'UPDATE',
                    item_id: '42',
                    entidad_tipo: 'trabajador',
                    entidad_label: 'Juan Pérez',
                    detalle: JSON.stringify({ resumen: 'RUT: 1.234-5 → 1.234-6' }),
                    ip: '127.0.0.1',
                    usuario_nombre: 'Admin',
                }
            ]]),
            release: jest.fn(),
        };
        db.getConnection = jest.fn().mockResolvedValue(conn);

        const res = await request(app)
            .get('/api/logs/export')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const lines = res.text.split('\r\n').filter(Boolean);
        expect(lines.length).toBe(2);  // header + 1 row
        expect(lines[1]).toContain('trabajadores');
        expect(lines[1]).toContain('Juan Pérez');
        expect(lines[1]).toContain('RUT: 1.234-5');
    });

    test('escapa correctamente comillas y comas en detalle', async () => {
        const conn = {
            query: jest.fn().mockResolvedValueOnce([[
                {
                    created_at: new Date('2026-04-21T10:00:00Z'),
                    modulo: 'obras',
                    accion: 'CREATE',
                    item_id: '5',
                    entidad_tipo: 'obra',
                    entidad_label: 'Obra "Las, Pinos"',
                    detalle: JSON.stringify({ resumen: 'Nombre: Obra "Las, Pinos"' }),
                    ip: '127.0.0.1',
                    usuario_nombre: 'Admin',
                }
            ]]),
            release: jest.fn(),
        };
        db.getConnection = jest.fn().mockResolvedValue(conn);

        const res = await request(app)
            .get('/api/logs/export')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        // Comilla escapada: " → ""
        expect(res.text).toContain('"Obra ""Las, Pinos"""');
    });

    test('aplica filtros a la query subyacente', async () => {
        const conn = {
            query: jest.fn().mockResolvedValue([[]]),
            release: jest.fn(),
        };
        db.getConnection = jest.fn().mockResolvedValue(conn);

        await request(app)
            .get('/api/logs/export?modulo=trabajadores&accion=DELETE&desde=2026-04-01')
            .set('Authorization', `Bearer ${tokenAllowed()}`);

        const [sql, params] = conn.query.mock.calls[0];
        expect(sql).toMatch(/l\.modulo = \?/);
        expect(sql).toMatch(/l\.accion IN/);
        expect(sql).toMatch(/l\.created_at >= \?/);
        expect(params).toContain('trabajadores');
        expect(params).toContain('DELETE');
        expect(params).toContain('2026-04-01 00:00:00');
    });
});

/**
 * Tests de facturas de inventario como REGISTRO de compras (mig 157, 2026-11-25):
 * - crear()/editar(): NO tocan stock (ubicaciones_stock); borrador guarda a medias,
 *   registrada exige número, proveedor, fecha e ítems vinculados al catálogo; una
 *   registrada no vuelve a borrador. Historial solo para ediciones de una registrada.
 * - anular(): no revierte stock (lo que entró por facturas viejas se queda).
 * - getHistorial(): lee logs_actividad filtrado por modulo+item_id+UPDATE.
 * - Rutas: gates de permiso (gestionar/ver) + validateBody (borrador vs registrada).
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

const facturaService = require('../src/services/factura-inventario.service');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');

function makeConn() {
    return {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
    };
}

const tocaStock = (conn) => conn.query.mock.calls.some(c => /ubicaciones_stock/.test(c[0]));

const CABECERA = {
    id: 7, estado: 'registrada', numero_factura: 'F-100', proveedor: 'ACME', fecha_factura: new Date(2026, 5, 8),
    monto_neto: '100000.00', observaciones: null, activo: 1,
};
const ITEM_PREV = { id: 1, factura_id: 7, item_id: 33, obra_id: 2, bodega_id: null, cantidad: '10.0000', precio_unitario: '10000.00', descripcion: 'PLACA FENOLICA' };

const DATA_NUEVA = {
    numero_factura: 'F-100', proveedor: 'ACME LTDA', fecha_factura: '2026-06-08',
    monto_neto: 150000, observaciones: null,
    items: [{ item_id: 33, cantidad: 15, precio_unitario: 10000 }],
};

describe('crear() — service', () => {
    beforeEach(() => jest.clearAllMocks());

    test('registrada: inserta cabecera + ítems sin destino y NO toca stock', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([{ insertId: 50 }]).mockResolvedValueOnce([{ insertId: 1 }]);

        const r = await facturaService.crear({ ...DATA_NUEVA, items: [{ item_id: 33, cantidad: 2, precio_unitario: 5, descripcion_factura: 'PLACA 18MM' }] }, 77);
        expect(r).toEqual({ id: 50, estado: 'registrada' });
        expect(tocaStock(conn)).toBe(false);
        const ins = conn.query.mock.calls.find(c => /INSERT INTO factura_items/.test(c[0]));
        expect(ins[0]).toMatch(/VALUES \(\?, \?, NULL, NULL, \?, \?, \?\)/);
        expect(ins[1]).toEqual([50, 33, 2, 5, 'PLACA 18MM']);
    });

    test('borrador: se guarda incompleto (sin número, sin ítems vinculados)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([{ insertId: 51 }]).mockResolvedValueOnce([{ insertId: 1 }]);

        const r = await facturaService.crear({ estado: 'borrador', items: [{ cantidad: 1, precio_unitario: 0, descripcion_factura: 'algo' }] }, 77);
        expect(r).toEqual({ id: 51, estado: 'borrador' });
        expect(conn.query.mock.calls[0][1]).toEqual(['borrador', null, null, null, 0, null, 77]);
    });

    test('registrada con una línea sin vincular al catálogo → 400 sin tocar la BD', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        await expect(facturaService.crear({ ...DATA_NUEVA, items: [{ cantidad: 1, precio_unitario: 1 }] }, 77))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(conn.query).not.toHaveBeenCalled();
    });
});

describe('editar() — service', () => {
    beforeEach(() => jest.clearAllMocks());

    function primeHappyPath(conn, cabecera = CABECERA) {
        conn.query
            .mockResolvedValueOnce([[cabecera]])              // SELECT FOR UPDATE
            .mockResolvedValueOnce([[ITEM_PREV]])             // SELECT items previos
            .mockResolvedValueOnce([{ affectedRows: 1 }])     // DELETE factura_items
            .mockResolvedValueOnce([{ affectedRows: 1 }])     // UPDATE cabecera
            .mockResolvedValueOnce([{ insertId: 9 }])         // INSERT item nuevo
            .mockResolvedValueOnce([[{ id: 33, descripcion: 'PLACA FENOLICA' }]]); // descripciones
    }

    test('registrada: reemplaza ítems y cabecera SIN tocar stock y loggea diff', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        primeHappyPath(conn);

        const result = await facturaService.editar(7, DATA_NUEVA, 77, null);
        expect(result).toEqual({ id: 7, estado: 'registrada' });
        expect(conn.commit).toHaveBeenCalled();
        expect(tocaStock(conn)).toBe(false);

        const calls = conn.query.mock.calls;
        expect(calls.some(c => /DELETE FROM factura_items WHERE factura_id/.test(c[0]))).toBe(true);
        const upd = calls.find(c => /UPDATE facturas_inventario\s+SET estado/.test(c[0]));
        expect(upd[1]).toEqual(['registrada', 'F-100', 'ACME LTDA', '2026-06-08', 150000, null, 7]);

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [uid, modulo, accion, itemId, detalle] = logManualActivity.mock.calls[0];
        expect([uid, modulo, accion, itemId]).toEqual([77, 'facturas-inventario', 'UPDATE', '7']);
        const parsed = JSON.parse(detalle);
        expect(parsed.cambios.proveedor).toEqual({ de: 'ACME', a: 'ACME LTDA' });
        expect(parsed.cambios.monto_neto).toEqual({ de: 100000, a: 150000 });
        expect(parsed.cambios.fecha_factura).toBeUndefined(); // misma fecha (Date vs string, local)
        expect(parsed.items_detalle).toContain('PLACA FENOLICA: x10 → x15');
    });

    test('sin cambios reales → NO loggea', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        primeHappyPath(conn);
        const igual = {
            numero_factura: 'F-100', proveedor: 'ACME', fecha_factura: '2026-06-08',
            monto_neto: 100000, observaciones: null,
            items: [{ item_id: 33, obra_id: 2, bodega_id: null, cantidad: 10, precio_unitario: 10000 }],
        };
        await facturaService.editar(7, igual, 77, null);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('borrador → registrada: cambia de estado y NO loggea (no es una modificación)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        primeHappyPath(conn, { ...CABECERA, estado: 'borrador' });
        const r = await facturaService.editar(7, { ...DATA_NUEVA, estado: 'registrada' }, 77, null);
        expect(r.estado).toBe('registrada');
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('registrada → borrador: 400, rollback', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[CABECERA]]);
        await expect(facturaService.editar(7, { ...DATA_NUEVA, estado: 'borrador' }, 77, null))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('400 si la factura está anulada → rollback, sin log', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[{ ...CABECERA, activo: 0 }]]);

        await expect(facturaService.editar(7, DATA_NUEVA, 77, null))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('404 si no existe → rollback', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[]]);

        await expect(facturaService.editar(999, DATA_NUEVA, 77, null))
            .rejects.toMatchObject({ statusCode: 404 });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('error a mitad de transacción → rollback, sin log', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        conn.query
            .mockResolvedValueOnce([[CABECERA]])
            .mockResolvedValueOnce([[ITEM_PREV]])
            .mockRejectedValueOnce(new Error('boom'));

        await expect(facturaService.editar(7, DATA_NUEVA, 77, null)).rejects.toThrow('boom');
        expect(conn.rollback).toHaveBeenCalled();
        expect(logManualActivity).not.toHaveBeenCalled();
    });
});

describe('anular() — service', () => {
    beforeEach(() => jest.clearAllMocks());

    test('marca inactiva y NO revierte stock', async () => {
        db.query
            .mockResolvedValueOnce([[{ activo: 1, estado: 'registrada' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        await facturaService.anular(7, 77, null);
        expect(db.query.mock.calls.some(c => /ubicaciones_stock/.test(c[0]))).toBe(false);
        expect(JSON.parse(logManualActivity.mock.calls[0][4]).resumen).toBe('Factura anulada');
    });
});

describe('getHistorial() — service', () => {
    beforeEach(() => jest.clearAllMocks());

    test('filtra por modulo + item_id (string) + accion UPDATE y parsea detalle', async () => {
        db.query.mockResolvedValueOnce([[
            { id: 1, created_at: '2026-08-07 10:00:00', usuario_nombre: 'Mauricio', detalle: JSON.stringify({ cambios: { proveedor: { de: 'A', a: 'B' } }, resumen: 'Proveedor: A → B', items_detalle: [] }) },
            { id: 2, created_at: '2026-08-06 09:00:00', usuario_nombre: null, detalle: '{corrupto' },
        ]]);

        const rows = await facturaService.getHistorial(7);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/l\.modulo = 'facturas-inventario'/);
        expect(sql).toMatch(/l\.item_id = \?/);
        expect(sql).toMatch(/l\.accion = 'UPDATE'/);
        expect(params).toEqual(['7']); // string: item_id es VARCHAR, no matar el índice

        expect(rows).toHaveLength(2);
        expect(rows[0].resumen).toBe('Proveedor: A → B');
        expect(rows[1].resumen).toBeNull(); // detalle corrupto degrada, no explota
    });
});

describe('rutas facturas-inventario — gates y validación', () => {
    const request = require('supertest');
    const jwt = require('jsonwebtoken');

    const serviceMock = require('../src/services/factura-inventario.service');
    const app = require('../index');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const makeToken = (permisos, id = 5) =>
        jwt.sign({ id, email: 'u@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);

    // spyOn dentro de beforeAll: a nivel de describe se ejecutaría al CARGAR el
    // archivo y pisaría el service real para los tests de arriba.
    beforeAll(() => {
        jest.spyOn(serviceMock, 'editar').mockResolvedValue({ id: 7 });
        jest.spyOn(serviceMock, 'getHistorial').mockResolvedValue([]);
    });
    afterAll(() => jest.restoreAllMocks());

    beforeEach(() => jest.clearAllMocks());

    test('PUT /:id sin gestionar → 403', async () => {
        const res = await request(app)
            .put('/api/facturas-inventario/7')
            .set('Authorization', `Bearer ${makeToken(['inventario.facturas.ver'])}`)
            .send(DATA_NUEVA);
        expect(res.status).toBe(403);
    });

    test('PUT /:id con items vacío → 400 (validateBody)', async () => {
        const res = await request(app)
            .put('/api/facturas-inventario/7')
            .set('Authorization', `Bearer ${makeToken(['inventario.facturas.gestionar'])}`)
            .send({ ...DATA_NUEVA, items: [] });
        expect(res.status).toBe(400);
    });

    test('PUT /:id válido → 200 y llega al service con userId', async () => {
        const res = await request(app)
            .put('/api/facturas-inventario/7')
            .set('Authorization', `Bearer ${makeToken(['inventario.facturas.gestionar'])}`)
            .send(DATA_NUEVA);
        expect(res.status).toBe(200);
        expect(serviceMock.editar).toHaveBeenCalledWith(7, expect.any(Object), 5, expect.anything());
    });

    test('GET /:id/historial sin facturas.ver → 403; con ver → 200', async () => {
        const res403 = await request(app)
            .get('/api/facturas-inventario/7/historial')
            .set('Authorization', `Bearer ${makeToken(['inventario.ver'])}`);
        expect(res403.status).toBe(403);

        const res200 = await request(app)
            .get('/api/facturas-inventario/7/historial')
            .set('Authorization', `Bearer ${makeToken(['inventario.facturas.ver'])}`);
        expect(res200.status).toBe(200);
        expect(res200.body.data).toEqual([]);
    });
});

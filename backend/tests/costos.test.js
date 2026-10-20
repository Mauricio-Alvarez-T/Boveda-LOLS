/**
 * Tests de Costos de obra (mig 122, docs/reglas/costos.md) — esqueleto para Rodrigo.
 *
 * Lo que fijan:
 *   · las cuentas del presupuesto chileno: CD → GG e imprevistos sobre CD → utilidad
 *     sobre (CD+GG+imp) → IVA sobre el neto,
 *   · lo gastado se mide en NETO: factura sin neto → total / 1,19 (marcado estimado);
 *     boleta → el total (ese IVA no se recupera),
 *   · los números en formato chileno ("45.000", "1.234,5", "$ 89.900"),
 *   · importar en modo "reemplazar" se niega si hay gastos asignados a partidas,
 *   · un gasto no se puede asignar a una partida de OTRA obra,
 *   · cada cambio deja historial, y un gasto rechazado borra la foto recién subida,
 *   · todo pide `costos.gestionar` (403 sin él).
 *
 * Mocks de BD, logger y fs; sin conexión real.
 */

jest.mock('../src/config/db', () => {
    const conn = { query: jest.fn(), beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn() };
    return { query: jest.fn().mockResolvedValue([[]]), getConnection: jest.fn().mockResolvedValue(conn), __conn: conn };
});
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    requestLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));
jest.mock('fs', () => {
    const real = jest.requireActual('fs');
    return { ...real, unlinkSync: jest.fn() };
});

const request = require('supertest');
const fs = require('fs');
const app = require('../index');
const db = require('../src/config/db');
const svc = require('../src/services/costos.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 5, email: 'rodrigo@lols.cl', rol_id: 2, rv: 1, p }, SECRET);
const OBRA = [[{ id: 3, nombre: 'BASCUÑAN 661', finalizada: 0 }]];

describe('Costos — cuentas del presupuesto', () => {
    test('CD, GG e imprevistos sobre CD, utilidad sobre el costo, IVA sobre el neto', () => {
        const t = svc.calcularTotales(
            { gg_pct: 15, imprevistos_pct: 3, utilidad_pct: 10, iva_pct: 19 },
            [
                { cantidad: 48, precio_unitario: 142000, origen: 'original' },     // 6.816.000
                { cantidad: 10, precio_unitario: 50000, origen: 'modificacion' },   //   500.000
            ]
        );
        expect(t.costo_directo).toBe(7316000);
        expect(t.costo_directo_original).toBe(6816000);
        expect(t.costo_directo_modificaciones).toBe(500000);
        expect(t.gastos_generales).toBe(1097400);
        expect(t.imprevistos).toBe(219480);
        expect(t.costo_presupuestado).toBe(8632880);
        expect(t.utilidad).toBe(863288);
        expect(t.neto).toBe(9496168);
        expect(t.iva).toBe(1804272);
        expect(t.total).toBe(11300440);
    });

    test('lo gastado va en neto: factura sin neto se estima; boleta cuenta el total', () => {
        expect(svc.netoDeGasto({ monto_total: 119000, tipo_documento: 'factura', monto_neto: null })).toEqual({ neto: 100000, estimado: true });
        expect(svc.netoDeGasto({ monto_total: 119000, tipo_documento: 'factura', monto_neto: 100000 })).toEqual({ neto: 100000, estimado: false });
        expect(svc.netoDeGasto({ monto_total: 5000, tipo_documento: 'boleta', monto_neto: null })).toEqual({ neto: 5000, estimado: false });
    });

    test('números en formato chileno', () => {
        expect(svc.num('45.000')).toBe(45000);
        expect(svc.num('1.500.000')).toBe(1500000);
        expect(svc.num('1.234,5')).toBe(1234.5);
        expect(svc.num('$ 89.900')).toBe(89900);
        expect(svc.num('12.5')).toBe(12.5);
        expect(svc.num('', 'x')).toBe('x');
        expect(Number.isNaN(svc.num('abc'))).toBe(true);
    });
});

describe('Costos — partidas e importación', () => {
    beforeEach(() => jest.clearAllMocks());

    test('crear partida: crea el presupuesto si no existía y deja historial', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)                                  // obra
            .mockResolvedValueOnce([[]])                                  // no hay presupuesto
            .mockResolvedValueOnce([{ insertId: 70 }])                    // crea presupuesto
            .mockResolvedValueOnce([[{ m: 4 }]])                          // orden máx
            .mockResolvedValueOnce([{ insertId: 900 }])                   // INSERT partida
            .mockResolvedValueOnce([{}]);                                 // historial
        const r = await svc.crearPartida(3, { capitulo: 'Obra gruesa', descripcion: 'Hormigón H-25 losa', unidad: 'm3', cantidad: '48', precio_unitario: '142.000' }, 5);
        expect(r).toEqual({ id: 900 });
        const ins = db.query.mock.calls[4][1];
        expect(ins).toEqual(expect.arrayContaining(['Obra gruesa', 'Hormigón H-25 losa', 'm3', 48, 142000, 'original', 5]));
        expect(ins[9]).toBe(5);                                           // orden = máx + 1
        expect(db.query.mock.calls[5][0]).toMatch(/INSERT INTO costo_historial/);
    });

    test('partida sin descripción → 400', async () => {
        db.query.mockResolvedValueOnce(OBRA);
        await expect(svc.crearPartida(3, { cantidad: 1 }, 5)).rejects.toMatchObject({ statusCode: 400, code: 'COSTO_PARTIDA_SIN_DESCRIPCION' });
    });

    test('importar "reemplazar" con gastos asignados → 409 y rollback', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]]);           // presupuesto existe
        db.__conn.query.mockResolvedValueOnce([[{ n: 2 }]]);              // 2 gastos con partida
        await expect(svc.importarPartidas(3, { modo: 'reemplazar', partidas: [{ descripcion: 'Radier', cantidad: 10, precio_unitario: 1000 }] }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'COSTO_REEMPLAZO_CON_GASTOS' });
        expect(db.__conn.rollback).toHaveBeenCalled();
        expect(db.__conn.commit).not.toHaveBeenCalled();
    });

    test('importar "agregar" inserta todas las filas en un solo INSERT y registra el historial', async () => {
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]]);
        db.__conn.query
            .mockResolvedValueOnce([[{ m: 2 }]])                          // orden máx
            .mockResolvedValueOnce([{ affectedRows: 2 }])                 // INSERT múltiple
            .mockResolvedValueOnce([{}]);                                 // historial
        const r = await svc.importarPartidas(3, { modo: 'agregar', partidas: [
            { capitulo: 'Obra gruesa', descripcion: 'Radier', unidad: 'm2', cantidad: 100, precio_unitario: 12000 },
            { capitulo: 'Terminaciones', descripcion: 'Cerámica', unidad: 'm2', cantidad: 50, precio_unitario: 15390 },
        ] }, 5);
        expect(r).toEqual({ importadas: 2, costo_directo: 1200000 + 769500 });
        const valores = db.__conn.query.mock.calls[1][1][0];
        expect(valores).toHaveLength(2);
        expect(valores[0][9]).toBe(3);                                    // orden sigue al máx
        expect(db.__conn.query.mock.calls[2][0]).toMatch(/costo_historial/);
        expect(db.__conn.commit).toHaveBeenCalled();
    });

    test('una fila inválida dice cuál es', async () => {
        db.query.mockResolvedValueOnce(OBRA);
        await expect(svc.importarPartidas(3, { modo: 'agregar', partidas: [{ descripcion: 'ok', cantidad: 1 }, { descripcion: '', cantidad: 1 }] }, 5))
            .rejects.toThrow(/Fila 2/);
    });
});

describe('Costos — gastos', () => {
    beforeEach(() => jest.clearAllMocks());

    test('gasto con foto: guarda la ruta relativa y deja historial', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]])              // la obra ya está en el módulo
            .mockResolvedValueOnce([{ insertId: 31 }])
            .mockResolvedValueOnce([{}]);
        const file = { originalname: 'factura.jpg', mimetype: 'image/jpeg', size: 250000, path: require('path').join(__dirname, '../uploads/costos/3/1-2.jpg') };
        const r = await svc.crearGasto(3, { monto_total: '119.000', tipo_documento: 'factura', fecha: '2026-10-16' }, file, 5);
        expect(r).toEqual({ id: 31 });
        const [sql, params] = db.query.mock.calls[2];
        expect(sql).toMatch(/INSERT INTO costo_gastos/);
        expect(params).toContain(119000);
        expect(params).toContain(require('path').join('costos', '3', '1-2.jpg'));
    });

    test('monto inválido → 400 y se borra la foto recién subida', async () => {
        db.query.mockResolvedValueOnce(OBRA);
        const file = { originalname: 'x.jpg', mimetype: 'image/jpeg', size: 10, path: '/tmp/x.jpg' };
        await expect(svc.crearGasto(3, { monto_total: '0' }, file, 5)).rejects.toMatchObject({ statusCode: 400, code: 'COSTO_GASTO_MONTO' });
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/x.jpg');
    });

    test('no se puede asignar a una partida de otra obra', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[]]);                                 // la partida no es de la obra 3
        await expect(svc.crearGasto(3, { monto_total: 1000, partida_id: '77' }, null, 5))
            .rejects.toMatchObject({ statusCode: 400, code: 'COSTO_PARTIDA_AJENA' });
    });

    test('marcar como pagada pone la fecha de pago de hoy si no venía', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 31, obra_id: 3, monto_total: 119000, proveedor: 'Sodimac', estado_pago: 'por_pagar', fecha_pago: null }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{}]);
        await svc.editarGasto(31, { estado_pago: 'pagada' }, 5);
        const [sql, params] = db.query.mock.calls[1];
        expect(sql).toMatch(/estado_pago = \?, fecha_pago = \?/);
        expect(params[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('el detalle resume gastado, por completar, por pagar y partidas excedidas', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3, gg_pct: 10, imprevistos_pct: 0, utilidad_pct: 10, iva_pct: 19 }]])
            .mockResolvedValueOnce([[
                { id: 1, capitulo: 'Obra gruesa', descripcion: 'Radier', cantidad: 10, precio_unitario: 10000, origen: 'original' },   // 100.000
                { id: 2, capitulo: 'Obra gruesa', descripcion: 'Moldaje', cantidad: 5, precio_unitario: 20000, origen: 'original' },  // 100.000
            ]])
            .mockResolvedValueOnce([[
                { id: 1, partida_id: 1, monto_total: 142800, monto_neto: 120000, tipo_documento: 'factura', proveedor: 'Melón', estado_pago: 'pagada', foto_ruta: 'costos/3/a.jpg' },
                { id: 2, partida_id: null, categoria: null, monto_total: 11900, monto_neto: null, tipo_documento: 'factura', proveedor: null, estado_pago: 'por_pagar', fecha_vencimiento: '2000-01-01', foto_ruta: null },
            ]]);
        const d = await svc.detalleObra(3);
        expect(d.resumen.costo_directo).toBe(200000);
        expect(d.resumen.costo_presupuestado).toBe(220000);
        expect(d.resumen.gastado_neto).toBe(120000 + 10000);
        expect(d.resumen.gastado_estimado).toBe(true);
        expect(d.resumen.por_completar).toBe(1);
        expect(d.resumen.vencidas).toEqual({ n: 1, monto: 11900 });
        expect(d.resumen.partidas_excedidas.map(p => p.id)).toEqual([1]);
        expect(d.gastos[0]).not.toHaveProperty('foto_ruta');
        expect(d.gastos[0].tiene_foto).toBe(true);
    });

    test('las fechas DATE salen como el día local, no corridas a UTC', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[]])                                  // sin presupuesto
            .mockResolvedValueOnce([[
                // mysql2 entrega DATE como medianoche local del servidor.
                { id: 9, partida_id: null, categoria: 'materiales', monto_total: 1000, monto_neto: null, tipo_documento: 'boleta', proveedor: 'Ferretería', estado_pago: 'por_pagar',
                  fecha: new Date(2026, 9, 16), fecha_vencimiento: new Date(2026, 10, 1), fecha_pago: null, foto_ruta: null },
            ]]);
        const d = await svc.detalleObra(3);
        expect(d.gastos[0].fecha).toBe('2026-10-16');
        expect(d.gastos[0].fecha_vencimiento).toBe('2026-11-01');
        expect(d.gastos[0].fecha_pago).toBeNull();
    });

    test('editar sin cambios reales no escribe ni ensucia el historial (DECIMAL y DATE de la BD)', async () => {
        db.query.mockResolvedValueOnce([[{ id: 31, obra_id: 3, monto_total: '119000.00', monto_neto: '100000.00', fecha: new Date(2026, 9, 16), proveedor: 'Sodimac', estado_pago: 'por_pagar' }]]);
        const r = await svc.editarGasto(31, { monto_total: '119.000', monto_neto: 100000, fecha: '2026-10-16', proveedor: 'Sodimac' }, 5);
        expect(r).toEqual({ id: 31, sin_cambios: true });
        expect(db.query).toHaveBeenCalledTimes(1);
    });
});

describe('Costos — categorías detalladas (mig 124)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('acepta las categorías nuevas y rechaza las que se tradujeron (mano_obra, maquinaria)', async () => {
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]]).mockResolvedValueOnce([{ insertId: 40 }]).mockResolvedValueOnce([{}]);
        await expect(svc.crearGasto(3, { monto_total: 1000, categoria: 'hormigon' }, null, 5)).resolves.toEqual({ id: 40 });
        for (const vieja of ['mano_obra', 'maquinaria']) {
            db.query.mockResolvedValueOnce(OBRA);
            await expect(svc.crearGasto(3, { monto_total: 1000, categoria: vieja }, null, 5)).rejects.toMatchObject({ statusCode: 400, code: 'COSTO_CATEGORIA' });
        }
    });

    test('una planilla de sueldos no lleva IVA: cuenta el total, y sin proveedor no queda «por completar»', () => {
        expect(svc.netoDeGasto({ monto_neto: null, monto_total: 2400000, tipo_documento: 'planilla' })).toEqual({ neto: 2400000, estimado: false });
        expect(svc.faltaCompletar({ proveedor: null, tipo_documento: 'planilla', partida_id: null, categoria: 'sueldos' })).toBe(false);
        expect(svc.faltaCompletar({ proveedor: null, tipo_documento: 'factura', partida_id: null, categoria: 'materiales' })).toBe(true);
    });

    test('sin partida: administración y faenas van a gastos generales; sueldos y subcontratos, a mano de obra; materiales, sin asignar', async () => {
        const g = (id, categoria, total, tipo = 'boleta') => ({ id, partida_id: null, categoria, monto_total: total, monto_neto: null, tipo_documento: tipo, proveedor: 'X', estado_pago: 'pagada', foto_ruta: null });
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3, gg_pct: 10, imprevistos_pct: 0, utilidad_pct: 0, iva_pct: 19 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[
                g(1, 'sueldos_administracion', 2400000, 'planilla'), g(2, 'arriendo_equipos', 650000), g(3, 'permisos', 300000),
                g(4, 'sueldos', 4200000, 'planilla'), g(5, 'anticipos', 1000000, 'planilla'), g(6, 'subcontrato', 900000),
                g(7, 'hormigon', 500000), g(8, null, 100000), g(9, 'herramientas', 145000),
            ]]);
        const d = await svc.detalleObra(3);
        // Herramientas = gasto general de obra (respuesta del 19-10): se suman mes a mes.
        expect(d.resumen.gastos_generales_gastado).toBe(2400000 + 650000 + 300000 + 145000);
        expect(d.resumen.mano_obra_sin_partida).toBe(4200000 + 1000000 + 900000);
        expect(d.resumen.sin_asignar).toBe(500000 + 100000);
        expect(d.resumen.por_completar).toBe(1);                       // solo el sin categoría
    });
});

describe('Costos — obras del módulo (se agregan, no aparecen todas)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('la portada lista solo las obras agregadas (con presupuesto o gastos)', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await svc.listarObras();
        expect(db.query.mock.calls[0][0]).toMatch(/AND \(p\.id IS NOT NULL OR gt\.gastos > 0\)/);
    });

    test('disponibles = obras reales sin presupuesto ni gastos', async () => {
        db.query.mockResolvedValueOnce([[{ id: 8, nombre: 'ABATE 80', finalizada: 0 }]]);
        const r = await svc.obrasDisponibles();
        expect(r).toEqual([{ id: 8, nombre: 'ABATE 80', finalizada: false }]);
        const sql = db.query.mock.calls[0][0];
        expect(sql).toMatch(/es_prueba = 0/);
        expect(sql).toMatch(/p\.id IS NULL/);
        expect(sql).toMatch(/NOT EXISTS \(SELECT 1 FROM costo_gastos/);
    });

    test('agregar crea el presupuesto vacío y deja historial; si ya estaba, no duplica', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[]])                                   // no tenía presupuesto
            .mockResolvedValueOnce([[]])                                   // presupuestoDe(crear): SELECT
            .mockResolvedValueOnce([{ insertId: 70 }])                     // INSERT
            .mockResolvedValueOnce([{}]);                                  // historial
        expect(await svc.agregarObra(3, 5)).toEqual({ obra_id: 3 });
        expect(db.query.mock.calls[3][0]).toMatch(/INSERT INTO costo_presupuestos/);
        expect(db.query.mock.calls[4][1]).toContain('Agregó la obra BASCUÑAN 661 a Presupuestos');

        jest.clearAllMocks();
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]]);
        expect(await svc.agregarObra(3, 5)).toEqual({ obra_id: 3, ya_estaba: true });
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('quitar solo una obra vacía: con partidas o gastos → 409', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]])
            .mockResolvedValueOnce([[{ partidas: 4, gastos: 0 }]]);
        await expect(svc.quitarObra(3, 5)).rejects.toMatchObject({ statusCode: 409, code: 'COSTO_OBRA_CON_DATOS' });

        jest.clearAllMocks();
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3 }]])
            .mockResolvedValueOnce([[{ partidas: 0, gastos: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{}]);
        expect(await svc.quitarObra(3, 5)).toEqual({ obra_id: 3 });
        expect(db.query.mock.calls[3]).toEqual(['DELETE FROM costo_presupuestos WHERE id = ?', [70]]);
    });
});

describe('Rutas /api/costos — gate', () => {
    beforeEach(() => jest.clearAllMocks());

    test('sin costos.gestionar → 403 en lectura y escritura', async () => {
        for (const [m, u] of [['get', '/api/costos/obras'], ['get', '/api/costos/obras/3'], ['post', '/api/costos/obras/3/partidas'], ['delete', '/api/costos/gastos/1']]) {
            const r = await request(app)[m](u).set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
            expect(r.status).toBe(403);
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('con costos.gestionar lista las obras', async () => {
        db.query.mockResolvedValueOnce([[{ obra_id: 3, obra_nombre: 'BASCUÑAN 661', finalizada: 0, presupuesto_id: 70, gg_pct: 10, imprevistos_pct: 0, costo_directo: 200000, partidas: 2, gastado_neto: 130000, gastos: 2, por_completar: 1, por_pagar: 11900 }]]);
        const r = await request(app).get('/api/costos/obras').set('Authorization', `Bearer ${token(['costos.gestionar'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data[0]).toMatchObject({ obra_id: 3, tiene_presupuesto: true, costo_presupuestado: 220000, gastado_neto: 130000 });
    });

    test('/obras/disponibles no se lee como el id de una obra', async () => {
        db.query.mockResolvedValueOnce([[{ id: 8, nombre: 'ABATE 80', finalizada: 0 }]]);
        const r = await request(app).get('/api/costos/obras/disponibles').set('Authorization', `Bearer ${token(['costos.gestionar'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data).toEqual([{ id: 8, nombre: 'ABATE 80', finalizada: false }]);
    });
});

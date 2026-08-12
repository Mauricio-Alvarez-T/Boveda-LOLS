/**
 * Tests de la Bodega Virtual (mig 099): flag es_virtual + modo de visibilidad
 * ocultar/mostrar/sumar.
 * - getResumen: ocultar excluye del listado; mostrar la lista pero sus
 *   cantidades quedan FUERA de item.total_cantidad y totales.total_cantidad;
 *   sumar las incluye.
 * - getDashboardEjecutivo: query #14 (patrimonio) excluye stock virtual salvo
 *   modo sumar.
 * - facturas.getAll: expone monto_virtual (subquery con precedencia obra>bodega).
 * - CRUD bodegas: hiddenFlagColumn oculta es_virtual=1 por default, con
 *   override ?incluir_virtual=true y filtro explícito.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

jest.mock('../src/middleware/logger', () => ({
    activityLogger: (req, res, next) => next(),
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    resolveEntidad: jest.fn().mockResolvedValue({ tipo: null, label: null }),
}));

const db = require('../src/config/db');
const inventarioService = require('../src/services/inventario.service');
const facturaService = require('../src/services/factura-inventario.service');
const createCrudService = require('../src/services/crud.service');

/* ── getResumen ─────────────────────────────────────────────────────────── */

// Orden de las 5 lecturas del Promise.all: obras, bodegas, items, stock, descuentos.
function primeResumen({ conVirtual }) {
    db.query
        .mockResolvedValueOnce([[{ id: 1, nombre: 'OBRA A' }]])
        .mockResolvedValueOnce([conVirtual
            ? [
                { id: 5, nombre: 'CENTRAL', responsable_nombre: null, es_virtual: 0 },
                { id: 9, nombre: 'Bodega Virtual', responsable_nombre: null, es_virtual: 1 },
            ]
            : [{ id: 5, nombre: 'CENTRAL', responsable_nombre: null, es_virtual: 0 }],
        ])
        .mockResolvedValueOnce([[{
            id: 100, categoria_id: 1, categoria_nombre: 'CAT', categoria_orden: 1,
            nro_item: '1', descripcion: 'PLACA', m2: null, valor_compra: '1000.00',
            valor_arriendo: '10.00', unidad: 'U', imagen_url: null,
        }]])
        .mockResolvedValueOnce([[
            { item_id: 100, obra_id: 1, bodega_id: null, cantidad: '2.0000', valor_arriendo_override: null },
            { item_id: 100, obra_id: null, bodega_id: 5, cantidad: '3.0000', valor_arriendo_override: null },
            { item_id: 100, obra_id: null, bodega_id: 9, cantidad: '7.0000', valor_arriendo_override: null },
        ]])
        .mockResolvedValueOnce([[]]); // descuentos
}

describe('getResumen — modo bodega virtual', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('default (ocultar): la query de bodegas excluye es_virtual', async () => {
        primeResumen({ conVirtual: false });
        await inventarioService.getResumen();
        const sqlBodegas = db.query.mock.calls[1][0];
        expect(sqlBodegas).toMatch(/es_virtual = 0/);
    });

    test('mostrar: virtual en el payload, sus cantidades FUERA de los totales', async () => {
        primeResumen({ conVirtual: true });
        const r = await inventarioService.getResumen(null, { bodegaVirtual: 'mostrar' });

        expect(db.query.mock.calls[1][0]).not.toMatch(/es_virtual = 0/);
        const virtual = r.bodegas.find(b => b.id === 9);
        expect(virtual).toBeDefined();
        expect(virtual.es_virtual).toBe(true);

        const item = r.categorias[0].items[0];
        // Celda visible ("mostrar los datos")...
        expect(item.ubicaciones.bodega_9).toEqual({ cantidad: 7, total: 0 });
        // ...pero fuera de los totales: 2 (obra) + 3 (bodega normal) = 5.
        expect(item.total_cantidad).toBe(5);
        expect(r.totales.total_cantidad).toBe(5);
    });

    test('sumar: sus cantidades entran a los totales', async () => {
        primeResumen({ conVirtual: true });
        const r = await inventarioService.getResumen(null, { bodegaVirtual: 'sumar' });
        expect(r.categorias[0].items[0].total_cantidad).toBe(12);
        expect(r.totales.total_cantidad).toBe(12);
    });

    test('modo basura cae a ocultar', async () => {
        primeResumen({ conVirtual: false });
        await inventarioService.getResumen(null, { bodegaVirtual: 'lo-que-sea' });
        expect(db.query.mock.calls[1][0]).toMatch(/es_virtual = 0/);
    });
});

/* ── getDashboardEjecutivo — query #14 patrimonio ───────────────────────── */

// 14 lecturas secuenciales (mismo orden que inventario_dashboard.test.js).
function primeDashboard() {
    db.query
        .mockResolvedValueOnce([[{ count: 0 }]])                                     // 1 pendientes
        .mockResolvedValueOnce([[{ count: 0 }]])                                     // 2 en tránsito
        .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]]) // 3 discrepancias
        .mockResolvedValueOnce([[]])                                                 // 4 valor por obra
        .mockResolvedValueOnce([[]])                                                 // 5a alertas pendientes
        .mockResolvedValueOnce([[]])                                                 // 5b alertas discrepancias
        .mockResolvedValueOnce([[]])                                                 // 5c en tránsito
        .mockResolvedValueOnce([[{ count: 0 }]])                                     // 6 estancados
        .mockResolvedValueOnce([[]])                                                 // 7 rechazos
        .mockResolvedValueOnce([[]])                                                 // 8 snapshots
        .mockResolvedValueOnce([[]])                                                 // 9 donut
        .mockResolvedValueOnce([[{ eventos: 0, obras_distintas: 0, costo_externo: 0 }]]) // 10 bombas
        .mockResolvedValueOnce([[]])                                                 // 11 faltantes
        .mockResolvedValueOnce([[]])                                                 // 12 vehículos empresa
        .mockResolvedValueOnce([[]])                                                 // 13 vehículos treemap
        .mockResolvedValueOnce([[{ total: 0 }]]);                                    // 14 patrimonio
}

describe('getDashboardEjecutivo — patrimonio y bodega virtual', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('default: query #14 excluye stock de bodegas virtuales', async () => {
        primeDashboard();
        await inventarioService.getDashboardEjecutivo();
        const sqlPatrimonio = db.query.mock.calls[db.query.mock.calls.length - 1][0];
        expect(sqlPatrimonio).toMatch(/SUM\(us\.cantidad \* i\.valor_compra\)/);
        expect(sqlPatrimonio).toMatch(/es_virtual = 1/);
    });

    test('sumar: query #14 SIN exclusión de virtuales', async () => {
        primeDashboard();
        await inventarioService.getDashboardEjecutivo(null, { bodegaVirtual: 'sumar' });
        const sqlPatrimonio = db.query.mock.calls[db.query.mock.calls.length - 1][0];
        expect(sqlPatrimonio).not.toMatch(/es_virtual/);
    });
});

/* ── facturas.getAll — monto_virtual ────────────────────────────────────── */

describe('facturas getAll — monto_virtual', () => {
    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    test('expone monto_virtual con precedencia obra>bodega y params [limit, offset] intactos', async () => {
        db.query
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ total: 0 }]]);

        await facturaService.getAll({});

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/monto_virtual/);
        expect(sql).toMatch(/b\.es_virtual = 1/);
        expect(sql).toMatch(/fi\.obra_id IS NULL/); // legacy: obra gana (normalizeUbicacion)
        const [limit, offset] = params.slice(-2);
        expect(typeof limit).toBe('number');
        expect(typeof offset).toBe('number');
    });
});

/* ── CRUD bodegas — hiddenFlagColumn es_virtual ─────────────────────────── */

describe('CRUD bodegas — ocultamiento por es_virtual', () => {
    const svc = createCrudService('bodegas', {
        activeColumn: 'activa',
        useSoftDelete: true,
        orderBy: 'bodegas.nombre ASC',
        allowedFilters: ['participa_inventario', 'participa_transferencias', 'es_virtual'],
        hiddenFlagColumn: 'es_virtual',
        hiddenFlagParam: 'incluir_virtual',
    });

    beforeEach(() => { jest.clearAllMocks(); db.query.mockReset(); });

    function primeCrud() {
        db.query
            .mockResolvedValueOnce([[]])              // rows
            .mockResolvedValueOnce([[{ total: 0 }]]); // count
    }

    test('default: WHERE excluye es_virtual', async () => {
        primeCrud();
        await svc.getAll({});
        expect(db.query.mock.calls[0][0]).toMatch(/bodegas\.es_virtual = 0/);
    });

    test('incluir_virtual=true: sin exclusión', async () => {
        primeCrud();
        await svc.getAll({ incluir_virtual: 'true' });
        expect(db.query.mock.calls[0][0]).not.toMatch(/es_virtual = 0/);
    });

    test('filtro explícito es_virtual=1 manda (allowedFilters)', async () => {
        primeCrud();
        await svc.getAll({ es_virtual: '1' });
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/bodegas\.es_virtual = \?/);
        expect(params).toEqual(expect.arrayContaining(['1']));
        expect(sql).not.toMatch(/es_virtual = 0/);
    });
});

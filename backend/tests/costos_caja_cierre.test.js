/**
 * Tests de flujo de caja, cobros, cierre de obra y comparación (mig 123, docs/reglas/costos.md).
 *
 * Lo que fijan:
 *   · el flujo agrupa por semana de lunes a domingo: lo vencido va a «Atrasado», lo que no tiene
 *     fecha va aparte y lo que cae después del horizonte, a «Más adelante»,
 *   · un cobro entra como neto + IVA − retención, y la retención no puede comerse el cobro,
 *   · una obra cerrada no admite cambios de montos (409), salvo la superficie y la observación,
 *   · el cierre guarda los números finales: la venta sale de los cobros o, si no hay, del presupuesto,
 *   · reabrir exige un motivo,
 *   · la comparación promedia por m² solo las obras CERRADAS (las en curso no están terminadas).
 *
 * Mocks de BD y logger; sin conexión real.
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

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const costos = require('../src/services/costos.service');
const caja = require('../src/services/costosCaja.service');
const cierre = require('../src/services/costosCierre.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const token = (p) => jwt.sign({ id: 5, email: 'rodrigo@lols.cl', rol_id: 2, rv: 1, p }, SECRET);
const OBRA = [[{ id: 3, nombre: 'BASCUÑAN 661', finalizada: 0 }]];
const CERRADA = { id: 70, obra_id: 3, cerrado_at: new Date(2026, 9, 1), gg_pct: 10, imprevistos_pct: 0, utilidad_pct: 10, iva_pct: 19, superficie_m2: null };

describe('Flujo de caja — armarFlujo', () => {
    // Miércoles 21-10-2026: la semana 1 va del lunes 19 al domingo 25.
    const HOY = '2026-10-21';
    const movs = [
        { tipo: 'pago', fecha: '2026-10-15', monto: 1000 },          // vencido → atrasado
        { tipo: 'cobro', fecha: '2026-10-20', monto: 300 },          // se esperaba ayer → atrasado
        { tipo: 'cobro', fecha: '2026-10-21', monto: 5000 },         // hoy → semana 1
        { tipo: 'pago', fecha: '2026-10-25', monto: 700 },           // domingo → semana 1
        { tipo: 'pago', fecha: '2026-10-26', monto: 2000 },          // lunes → semana 2
        { tipo: 'pago', fecha: null, monto: 450 },                   // sin vencimiento
        { tipo: 'cobro', fecha: '2026-12-30', monto: 9000 },         // después de 8 semanas
    ];

    test('semanas de lunes a domingo, atrasado, sin fecha y más adelante', () => {
        const f = caja.armarFlujo(movs, HOY, 8);
        expect(f.semanas).toHaveLength(8);
        expect(f.semanas[0]).toMatchObject({ desde: '2026-10-19', hasta: '2026-10-25', entradas: 5000, salidas: 700, neto: 4300 });
        expect(f.semanas[1]).toMatchObject({ desde: '2026-10-26', hasta: '2026-11-01', salidas: 2000 });
        expect(f.semanas[7].hasta).toBe('2026-12-13');
        expect(f.atrasado).toMatchObject({ entradas: 300, salidas: 1000, neto: -700 });
        expect(f.sin_fecha).toMatchObject({ salidas: 450 });
        expect(f.mas_adelante).toMatchObject({ entradas: 9000, desde: '2026-12-14' });
        // El horizonte = atrasado + las 8 semanas (sin «sin fecha» ni «más adelante»).
        expect(f.totales).toEqual({ entradas: 5300, salidas: 3700 });
    });

    test('el lunes de un domingo es el de esa misma semana', () => {
        expect(caja.lunesDe('2026-10-25')).toBe('2026-10-19');
        expect(caja.lunesDe('2026-10-19')).toBe('2026-10-19');
    });
});

describe('Cobros', () => {
    beforeEach(() => jest.clearAllMocks());

    test('validaciones: qué se cobra, monto y fecha', () => {
        expect(() => caja.leerCobro({ fecha: '2026-10-30', glosa: '', monto_neto: 100 })).toThrow(/Falta qué se cobra/);
        expect(() => caja.leerCobro({ fecha: '2026-10-30', glosa: 'EP 8', monto_neto: 0 })).toThrow(/mayor que cero/);
        expect(() => caja.leerCobro({ glosa: 'EP 8', monto_neto: 100 })).toThrow(/fecha/);
        expect(caja.leerCobro({ fecha: '2026-10-30', glosa: 'EP 8', monto_neto: '1.000.000', iva: '190.000' }))
            .toMatchObject({ monto_neto: 1000000, iva: 190000, retencion: 0, estado: 'por_cobrar' });
    });

    test('la retención no puede ser mayor que neto + IVA', async () => {
        db.query.mockResolvedValueOnce(OBRA);
        await expect(caja.crearCobro(3, { fecha: '2026-10-30', glosa: 'EP 8', monto_neto: 100, iva: 19, retencion: 200 }, 5))
            .rejects.toMatchObject({ statusCode: 400, code: 'COSTO_COBRO_RETENCION' });
    });

    test('cobrado sin fecha de cobro = cobrado hoy; queda en el historial con lo que entra', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[{ id: 70, obra_id: 3, cerrado_at: null }]])
            .mockResolvedValueOnce([{ insertId: 12 }])
            .mockResolvedValueOnce([{}]);
        await caja.crearCobro(3, { fecha: '2026-10-30', glosa: 'EP 8', monto_neto: 1000000, iva: 190000, retencion: 50000, estado: 'cobrado' }, 5);
        const [sql, params] = db.query.mock.calls[2];
        expect(sql).toMatch(/INSERT INTO costo_cobros/);
        expect(params.some(p => /^\d{4}-\d{2}-\d{2}$/.test(String(p)) && p !== '2026-10-30')).toBe(true);   // fecha_cobro = hoy
        expect(db.query.mock.calls[3][1]).toContain('Agregó el cobro «EP 8» por $1.140.000 (cobrado)');
    });

    test('en una obra cerrada no se agregan cobros', async () => {
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[CERRADA]]);
        await expect(caja.crearCobro(3, { fecha: '2026-10-30', glosa: 'EP 9', monto_neto: 100 }, 5))
            .rejects.toMatchObject({ statusCode: 409, code: 'COSTO_OBRA_CERRADA' });
    });
});

describe('Obra cerrada — montos congelados', () => {
    beforeEach(() => jest.clearAllMocks());

    test('no se agregan partidas ni se editan gastos', async () => {
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[CERRADA]]);
        await expect(costos.crearPartida(3, { descripcion: 'Radier' }, 5)).rejects.toMatchObject({ statusCode: 409, code: 'COSTO_OBRA_CERRADA' });

        db.query.mockResolvedValueOnce([[{ id: 31, obra_id: 3, monto_total: '1000.00', cerrado_at: CERRADA.cerrado_at }]]);
        await expect(costos.editarGasto(31, { proveedor: 'Otro' }, 5)).rejects.toMatchObject({ statusCode: 409 });
    });

    test('la superficie sí se corrige; los porcentajes no', async () => {
        db.query
            .mockResolvedValueOnce(OBRA)
            .mockResolvedValueOnce([[CERRADA]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{}]);
        jest.spyOn(costos, 'detalleObra').mockResolvedValueOnce({ ok: true });
        await costos.guardarPresupuesto(3, { superficie_m2: '1.250' }, 5);
        expect(db.query.mock.calls[2][0]).toMatch(/UPDATE costo_presupuestos SET superficie_m2 = \?/);
        expect(db.query.mock.calls[2][1][0]).toBe(1250);

        jest.clearAllMocks();
        db.query.mockResolvedValueOnce(OBRA).mockResolvedValueOnce([[CERRADA]]);
        await expect(costos.guardarPresupuesto(3, { gg_pct: 15 }, 5)).rejects.toMatchObject({ statusCode: 409 });
    });
});

/** Detalle mínimo con la forma de costos.detalleObra. */
function detalle({ cobros = [], cerrada = false, m2 = null, gastado = 230000, id = 3, nombre = 'BASCUÑAN 661' } = {}) {
    const cobrado = cobros.filter(c => c.estado === 'cobrado');
    const porCobrar = cobros.filter(c => c.estado !== 'cobrado');
    const s = (arr, k) => arr.reduce((t, c) => t + c[k], 0);
    return {
        obra: { id, nombre, finalizada: true },
        presupuesto: { id: 70, obra_id: id, superficie_m2: m2, cerrado_at: cerrada ? new Date() : null },
        partidas: [{ id: 1 }],
        gastos: [
            { categoria: 'materiales', monto_neto: 150000, monto_total: 178500, tipo_documento: 'factura' },
            { categoria: null, monto_neto: null, monto_total: gastado - 150000, tipo_documento: 'boleta' },
        ],
        cobros,
        cierre: null,
        resumen: {
            costo_directo: 200000, gastos_generales: 20000, imprevistos: 0, costo_presupuestado: 220000, utilidad: 22000, neto: 242000,
            gastado_neto: gastado, gastado_estimado: false, gastos_generales_gastado: 0, sin_asignar: gastado - 150000, por_completar: 1,
            por_pagar: { n: 0, monto: 0 }, capitulos: [{ capitulo: 'Obra gruesa', presupuestado: 200000, gastado }], partidas_excedidas: [],
            cobros: {
                cobrado: { n: cobrado.length, neto: s(cobrado, 'monto_neto'), total: s(cobrado, 'total') },
                por_cobrar: { n: porCobrar.length, neto: s(porCobrar, 'monto_neto'), total: s(porCobrar, 'total') },
                retenido: s(cobros, 'retencion'),
            },
        },
    };
}

describe('Cierre de obra', () => {
    beforeEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

    test('sin cobros, la venta sale del presupuesto (y se dice); el margen real se calcula sobre ella', () => {
        const r = cierre.resumenCierre(detalle());
        expect(r.venta).toMatchObject({ neto: 242000, fuente: 'presupuesto' });
        expect(r.margen).toEqual({ presupuestado: 22000, pct_presupuestado: 9.1, real: 12000, pct_real: 5 });
        expect(r.desviacion_costo).toBe(10000);
        expect(r.real.por_categoria).toEqual({ materiales: 150000, sin_categoria: 80000 });
    });

    test('con cobros, la venta es el neto de todos los cobros', () => {
        const cobros = [
            { estado: 'cobrado', monto_neto: 150000, iva: 28500, retencion: 7500, total: 171000 },
            { estado: 'por_cobrar', monto_neto: 100000, iva: 19000, retencion: 0, total: 119000 },
        ];
        const r = cierre.resumenCierre(detalle({ cobros }));
        expect(r.venta).toMatchObject({ neto: 250000, fuente: 'cobros', cobrado_neto: 150000, por_cobrar_neto: 100000, retenido: 7500 });
        expect(r.margen.real).toBe(20000);
        expect(r.pendientes.por_cobrar).toEqual({ n: 1, total: 119000 });
    });

    test('cerrar guarda los números finales y deja historial; dos veces → 409; sin presupuesto → 400', async () => {
        const spy = jest.spyOn(costos, 'detalleObra').mockResolvedValue(detalle({ m2: 100 }));
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{}]);
        await cierre.cerrarObra(3, { lecciones: 'Comprar el fierro antes del alza', superficie_m2: '120' }, 5);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/SET cerrado_at = NOW\(\), cerrado_por = \?, cierre_resumen = \?, cierre_lecciones = \?, superficie_m2 = \?/);
        const guardado = JSON.parse(params[1]);
        expect(guardado).toMatchObject({ superficie_m2: 120, venta: { fuente: 'presupuesto' }, margen: { pct_real: 5 } });
        expect(params[2]).toBe('Comprar el fierro antes del alza');
        expect(db.query.mock.calls[1][1]).toContain('Cerró la obra: margen real 5 % (presupuestado 9.1 %)');

        spy.mockResolvedValueOnce(detalle({ cerrada: true }));
        await expect(cierre.cerrarObra(3, {}, 5)).rejects.toMatchObject({ statusCode: 409 });
        spy.mockResolvedValueOnce({ ...detalle(), presupuesto: null });
        await expect(cierre.cerrarObra(3, {}, 5)).rejects.toMatchObject({ statusCode: 400, code: 'COSTO_SIN_PRESUPUESTO' });
    });

    test('reabrir exige motivo y que esté cerrada; guarda el cierre anterior en el historial', async () => {
        await expect(cierre.reabrirObra(3, { motivo: '' }, 5)).rejects.toMatchObject({ statusCode: 400, code: 'COSTO_REABRIR_MOTIVO' });

        db.query.mockResolvedValueOnce([[{ id: 70, cerrado_at: null }]]);
        await expect(cierre.reabrirObra(3, { motivo: 'Llegó una factura atrasada' }, 5)).rejects.toMatchObject({ statusCode: 409 });

        jest.spyOn(costos, 'detalleObra').mockResolvedValue({ ok: true });
        db.query
            .mockResolvedValueOnce([[{ id: 70, cerrado_at: new Date(), cierre_resumen: '{"margen":{"pct_real":5}}' }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{}]);
        await cierre.reabrirObra(3, { motivo: 'Llegó una factura atrasada' }, 5);
        expect(db.query.mock.calls.at(-2)[0]).toMatch(/SET cerrado_at = NULL/);
        const hist = db.query.mock.calls.at(-1)[1];
        expect(hist).toContain('Reabrió la obra: Llegó una factura atrasada');
        expect(JSON.parse(hist[5])).toEqual({ motivo: 'Llegó una factura atrasada', cierre_anterior: { margen: { pct_real: 5 } } });
    });
});

describe('Comparar obras', () => {
    beforeEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

    test('costo por m² de cada obra; el promedio considera solo las cerradas con superficie', async () => {
        db.query.mockResolvedValueOnce([[{ id: 3 }, { id: 4 }, { id: 5 }]]);
        const cerrada = detalle({ id: 3, m2: 100 });
        cerrada.cierre = { cerrado_at: new Date(), resumen: { ...cierre.resumenCierre(cerrada) } };
        const enCurso = detalle({ id: 4, nombre: 'ABATE 80', m2: 50, gastado: 160000 });
        const sinM2 = detalle({ id: 5, nombre: 'GORBEA 3082', m2: null });
        jest.spyOn(costos, 'detalleObra')
            .mockResolvedValueOnce(cerrada).mockResolvedValueOnce(enCurso).mockResolvedValueOnce(sinM2);

        const r = await cierre.comparacion();
        expect(r.obras.map(o => [o.obra_id, o.cerrada])).toEqual([[3, true], [4, false], [5, false]]);
        expect(r.obras[0].por_m2).toEqual({ presupuestado: 2200, real: 2300, venta: 2420 });
        expect(r.obras[1].por_m2.real).toBe(3200);
        expect(r.obras[2].por_m2).toEqual({ presupuestado: null, real: null, venta: null });
        expect(r.promedio_cerradas).toEqual({ obras: 1, costo_real_m2: 2300, costo_presupuestado_m2: 2200, margen_pct_real: 5 });
    });
});

describe('Rutas nuevas — gate costos.gestionar', () => {
    beforeEach(() => { jest.clearAllMocks(); jest.restoreAllMocks(); });

    test('sin permiso → 403 en flujo, comparación, cobros y cierre', async () => {
        for (const [m, u] of [['get', '/api/costos/flujo'], ['get', '/api/costos/comparacion'], ['post', '/api/costos/obras/3/cobros'], ['post', '/api/costos/obras/3/cerrar'], ['delete', '/api/costos/cobros/1']]) {
            const r = await request(app)[m](u).set('Authorization', `Bearer ${token(['asistencia.ver'])}`);
            expect(r.status).toBe(403);
        }
        expect(db.query).not.toHaveBeenCalled();
    });

    test('el flujo responde con las semanas pedidas (entre 4 y 26)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);
        const r = await request(app).get('/api/costos/flujo?semanas=99').set('Authorization', `Bearer ${token(['costos.gestionar'])}`);
        expect(r.status).toBe(200);
        expect(r.body.data.semanas).toHaveLength(26);
    });
});

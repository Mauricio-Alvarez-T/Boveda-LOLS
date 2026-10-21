/**
 * Resolver una diferencia (discrepancia) de transferencia ELIGIENDO LA CAUSA (dueño 2026-10-21, mig 129).
 *
 * PUT /api/transferencias/discrepancias/:id/resolver  { estado, resolucion, causa? }
 *   dif = recibida − enviada (sobrante > 0, faltante < 0). La columna `diferencia` tiene el signo opuesto
 *   y NO se usa.
 *   · origen_envio_de_mas    → sin stock; aviso si lo recibido no tenía respaldo en el origen (kardex).
 *   · error_conteo_recepcion → destino −dif; origen primario + lo descontado por sobre lo enviado.
 *                              409 si el destino ya no tiene las dif (sin escribir nada).
 *   · perdida_en_transito    → origen −faltante (saldos de splits FIFO / origen primario), sin bajar de 0.
 *   · nunca_salio            → sin stock.
 *   · llego_despues          → como pérdida + destino +faltante.
 *   Legacy (stock_reconciliado=FALSE): las que mueven stock → 409. 'descartada' no mueve stock.
 *
 * El mock de conn simula ubicaciones_stock en memoria (por SQL, no por orden de llamadas) para afirmar
 * el stock final y el kardex que queda.
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const transferenciaService = require('../src/services/transferencia.service');
const schemas = require('../src/schemas/transferencias.schema');
const { CODIGOS_CAUSA } = require('../src/config/causasDiscrepancia');

const ITEM = 5;
const TRF = 100;
const USER = 77;
const BODEGA_ORIGEN = 2;   // origen primario (transferencia_items.origen_bodega_id)
const OBRA_DESTINO = 9;
const OBRA_SPLIT = 4;

const key = (obra, bodega) => `${obra ?? ''}|${bodega ?? ''}`;
const err1054 = () => Object.assign(new Error("Unknown column 'causa' in 'field list'"), { errno: 1054, code: 'ER_BAD_FIELD_ERROR' });

/**
 * Arma un conn cuyo query responde por SQL y simula ubicaciones_stock.
 * @param {object} o
 *   disc       fila de transferencia_discrepancias (null = no existe)
 *   trf        fila de transferencias
 *   itemRow    fila de transferencia_items
 *   splits     filas de transferencia_item_origenes
 *   stock      { 'obra|bodega': cantidad }
 *   overrides  { 'obra|bodega': valor_arriendo_override }
 *   kardex     { salida, entrada } (sumas de stock_movimientos de la TRF/ítem)
 *   failOn     RegExp: la query que calce rechaza (para probar rollback)
 */
function setup(o = {}) {
    const state = {
        disc: o.disc === undefined ? discRow() : o.disc,
        trf: { id: TRF, codigo: 'TRF-202610-0001', stock_reconciliado: true, origen_obra_id: null, origen_bodega_id: null, destino_obra_id: OBRA_DESTINO, destino_bodega_id: null, ...(o.trf || {}) },
        itemRow: o.itemRow === undefined ? { id: 200, origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN } : o.itemRow,
        splits: o.splits || [],
        stock: { ...(o.stock || {}) },
        overrides: { ...(o.overrides || {}) },
        insertedOverride: {},
        kardex: o.kardex || { salida: 0, entrada: 0 },
        movimientos: [],
        splitUpdates: [],
        discUpdates: [],
    };
    const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        query: jest.fn(async (sql, p = []) => {
            if (o.failOn && o.failOn.test(sql)) throw o.failError || new Error('fallo simulado');
            if (/FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/.test(sql)) return [state.disc ? [state.disc] : []];
            if (/FROM transferencias WHERE id = \? FOR UPDATE/.test(sql)) return [[state.trf]];
            if (/FROM transferencia_recepciones/.test(sql)) return [o.sinRecepciones ? [] : [{ 1: 1 }]];
            if (/FROM transferencia_items\s/.test(sql)) return [state.itemRow ? [state.itemRow] : []];
            if (/FROM transferencia_item_origenes/.test(sql)) return [state.splits];
            if (/FROM stock_movimientos/.test(sql)) return [[{ salida: String(state.kardex.salida), entrada: String(state.kardex.entrada) }]];
            if (/SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/.test(sql)) {
                const k = key(p[1], p[2]);
                // DECIMAL llega como string desde mysql2
                return [k in state.stock ? [{ cantidad: `${state.stock[k]}.0000` }] : []];
            }
            if (/SELECT valor_arriendo_override FROM ubicaciones_stock/.test(sql)) {
                const k = key(p[1], p[2]);
                return [k in state.stock ? [{ valor_arriendo_override: state.overrides[k] ?? null }] : []];
            }
            if (/^\s*UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(sql)) {
                const k = key(p[2], p[3]);
                if (k in state.stock) state.stock[k] = Math.max(state.stock[k] - p[0], 0);
                return [{ affectedRows: 1 }];
            }
            if (/INSERT INTO ubicaciones_stock/.test(sql)) {
                const k = key(p[1], p[2]);
                if (!(k in state.stock)) state.insertedOverride[k] = p[4];
                state.stock[k] = (state.stock[k] ?? 0) + p[3];
                return [{ affectedRows: 1 }];
            }
            if (/INSERT INTO stock_movimientos/.test(sql)) {
                const [item_id, obra_id, bodega_id, tipo, cantidad_anterior, cantidad_nueva, referencia_tipo, referencia_id, motivo, usuario_id] = p;
                state.movimientos.push({ item_id, obra_id, bodega_id, tipo, cantidad_anterior, cantidad_nueva, referencia_tipo, referencia_id, motivo, usuario_id });
                return [{ insertId: state.movimientos.length }];
            }
            if (/UPDATE transferencia_item_origenes/.test(sql)) {
                state.splitUpdates.push({ take: p[0], id: p[1] });
                return [{ affectedRows: 1 }];
            }
            if (/FROM obras WHERE id IN/.test(sql)) return [p[0].map(id => ({ id, nombre: `Obra ${id}` }))];
            if (/FROM bodegas WHERE id IN/.test(sql)) return [p[0].map(id => ({ id, nombre: `Bodega ${id}` }))];
            if (/UPDATE transferencia_discrepancias/.test(sql)) {
                // Descartar no toca causa/ajuste_stock (4 parámetros); resolver sí (6).
                state.discUpdates.push(p.length === 4
                    ? { estado: p[0], resolucion: p[1], causa: null, ajuste_stock: null, resuelto_por: p[2], id: p[3] }
                    : { estado: p[0], resolucion: p[1], causa: p[2], ajuste_stock: p[3], resuelto_por: p[4], id: p[5] });
                return [{ affectedRows: 1 }];
            }
            return [[]];
        }),
    };
    db.getConnection.mockResolvedValue(conn);
    return { conn, state };
}

function discRow(over = {}) {
    // DECIMAL(12,4) llega como string; `diferencia` (enviada − recibida) con el signo de la BD.
    return { id: 31, transferencia_id: TRF, item_id: ITEM, cantidad_enviada: '10.0000', cantidad_recibida: '12.0000', estado: 'pendiente', causa: null, ajuste_stock: null, ...over };
}

const sqls = (conn) => conn.query.mock.calls.map(([sql]) => String(sql));
const escrituras = (conn) => sqls(conn).filter(s =>
    /UPDATE ubicaciones_stock|INSERT INTO ubicaciones_stock|INSERT INTO stock_movimientos|UPDATE transferencia_item_origenes|UPDATE transferencia_discrepancias/.test(s));

const resolver = (causa, extra = {}) => transferenciaService.resolverDiscrepancia(
    extra.id ?? '31', USER, extra.estado ?? 'resuelta', extra.nota ?? 'Revisado con bodega', causa
);

beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sobrante (llegó más de lo enviado)', () => {
    test('origen_envio_de_mas con respaldo completo → sin stock, sin kardex, aviso null', async () => {
        const { conn, state } = setup({ kardex: { salida: 12, entrada: 12 }, stock: { [key(null, BODEGA_ORIGEN)]: 5 } });
        const r = await resolver('origen_envio_de_mas');

        expect(r).toEqual({ id: 31, estado: 'resuelta', resolucion: 'Revisado con bodega', causa: 'origen_envio_de_mas', ajustes: [], aviso: null });
        expect(state.movimientos).toHaveLength(0);
        expect(sqls(conn).some(s => /ubicaciones_stock/.test(s))).toBe(false);
        expect(state.discUpdates).toEqual([expect.objectContaining({
            estado: 'resuelta', causa: 'origen_envio_de_mas', resuelto_por: USER,
            ajuste_stock: JSON.stringify({ ajustes: [], aviso: null }),
        })]);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('origen_envio_de_mas: sin_respaldo se calcula desde el kardex de salida → aviso', async () => {
        // Recibidas 12; el kardex de salida suma 9 (el origen no alcanzaba y quedó en 0) → 3 sin respaldo.
        const { conn, state } = setup({ kardex: { salida: 9, entrada: 12 } });
        const r = await resolver('origen_envio_de_mas');

        expect(r.ajustes).toEqual([]);
        expect(r.aviso).toMatch(/^3 de las 12 unidades recibidas no tenían respaldo en el origen/);
        expect(state.movimientos).toHaveLength(0);
        const kardexSql = sqls(conn).find(s => /FROM stock_movimientos/.test(s));
        expect(kardexSql).toMatch(/transferencia_salida/);
        expect(kardexSql).toMatch(/referencia_tipo = 'transferencia'/);
        const kardexCall = conn.query.mock.calls.find(([s]) => /FROM stock_movimientos/.test(s));
        expect(kardexCall[1]).toEqual([TRF, ITEM]);
        expect(JSON.parse(state.discUpdates[0].ajuste_stock)).toEqual({ ajustes: [], aviso: r.aviso });
    });

    test('error_conteo_recepcion → destino −2 y origen primario +2 (lo tomado por sobre lo enviado), con kardex', async () => {
        const { conn, state } = setup({
            kardex: { salida: 12, entrada: 12 },
            stock: { [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 20 },
        });
        const r = await resolver('error_conteo_recepcion');

        expect(state.stock[key(OBRA_DESTINO, null)]).toBe(18);
        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(7);
        expect(r.ajustes).toEqual([
            { obra_id: null, bodega_id: BODEGA_ORIGEN, ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, cantidad: 2 },
            { obra_id: OBRA_DESTINO, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_DESTINO}`, cantidad: -2 },
        ]);
        expect(r.aviso).toBeNull();
        expect(state.movimientos).toHaveLength(2);
        state.movimientos.forEach(m => {
            expect(m).toMatchObject({ item_id: ITEM, tipo: 'discrepancia', referencia_tipo: 'transferencia', referencia_id: TRF, usuario_id: USER });
            expect(m.motivo).toMatch(/TRF-202610-0001/);
            expect(m.motivo).toMatch(/Error de conteo al recibir/);
            expect(m.motivo).toMatch(/Revisado con bodega/);
        });
        expect(state.movimientos).toEqual(expect.arrayContaining([
            expect.objectContaining({ obra_id: null, bodega_id: BODEGA_ORIGEN, cantidad_anterior: 5, cantidad_nueva: 7 }),
            expect.objectContaining({ obra_id: OBRA_DESTINO, bodega_id: null, cantidad_anterior: 20, cantidad_nueva: 18 }),
        ]));
        // Filas de stock bloqueadas antes de escribir
        const locks = sqls(conn).filter(s => /SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/.test(s));
        expect(locks).toHaveLength(2);
        expect(JSON.parse(state.discUpdates[0].ajuste_stock).ajustes).toEqual(r.ajustes);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('error_conteo_recepcion sin exceso descontado del origen (kardex = enviado) → solo destino', async () => {
        const { state } = setup({
            kardex: { salida: 10, entrada: 12 + 0 },
            stock: { [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 20 },
        });
        const r = await resolver('error_conteo_recepcion');
        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(5);
        expect(r.ajustes).toEqual([{ obra_id: OBRA_DESTINO, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_DESTINO}`, cantidad: -2 }]);
    });

    test('error_conteo_recepcion: recepción anterior al kardex → asume descontado lo recibido y avisa', async () => {
        const { state } = setup({
            kardex: { salida: 0, entrada: 0 },
            stock: { [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 20 },
        });
        const r = await resolver('error_conteo_recepcion');
        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(7);
        expect(state.stock[key(OBRA_DESTINO, null)]).toBe(18);
        expect(r.aviso).toMatch(/anterior al kardex/);
    });

    test('error_conteo_recepcion con el destino sin esas unidades → 409 claro y NO escribe nada', async () => {
        const { conn, state } = setup({
            kardex: { salida: 12, entrada: 12 },
            stock: { [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 1 },
        });
        await expect(resolver('error_conteo_recepcion')).rejects.toMatchObject({
            statusCode: 409,
            code: 'DESTINO_SIN_STOCK',
            message: 'El destino ya no tiene esas 2 unidades (hoy tiene 1): ajusta a mano o elige otra causa',
        });
        expect(escrituras(conn)).toEqual([]);
        expect(state.stock).toEqual({ [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 1 });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('error_conteo_recepcion con el destino sin fila → cuenta como 0 → 409', async () => {
        const { conn } = setup({ kardex: { salida: 12, entrada: 12 }, stock: { [key(null, BODEGA_ORIGEN)]: 5 } });
        await expect(resolver('error_conteo_recepcion')).rejects.toMatchObject({ statusCode: 409, code: 'DESTINO_SIN_STOCK' });
        expect(escrituras(conn)).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('faltante (llegó menos de lo enviado)', () => {
    const faltante = (over = {}) => discRow({ cantidad_enviada: '10.0000', cantidad_recibida: '7.0000', ...over });

    test('perdida_en_transito → descuenta el saldo no descontado de los splits (FIFO) y sube cantidad_decrementada', async () => {
        const { conn, state } = setup({
            disc: faltante(),
            splits: [
                { id: 1, origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN, cantidad_enviada: '6.0000', cantidad_decrementada: '6.0000' },
                { id: 2, origen_obra_id: OBRA_SPLIT, origen_bodega_id: null, cantidad_enviada: '4.0000', cantidad_decrementada: '1.0000' },
            ],
            stock: { [key(null, BODEGA_ORIGEN)]: 8, [key(OBRA_SPLIT, null)]: 10, [key(OBRA_DESTINO, null)]: 7 },
        });
        const r = await resolver('perdida_en_transito');

        expect(state.stock[key(OBRA_SPLIT, null)]).toBe(7);
        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(8);   // split 1 ya estaba descontado entero
        expect(state.stock[key(OBRA_DESTINO, null)]).toBe(7);    // el destino no cambia
        expect(state.splitUpdates).toEqual([{ take: 3, id: 2 }]);
        expect(r.ajustes).toEqual([{ obra_id: OBRA_SPLIT, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_SPLIT}`, cantidad: -3 }]);
        expect(r.aviso).toBeNull();
        expect(state.movimientos).toEqual([expect.objectContaining({
            obra_id: OBRA_SPLIT, bodega_id: null, tipo: 'discrepancia', cantidad_anterior: 10, cantidad_nueva: 7,
            referencia_tipo: 'transferencia', referencia_id: TRF,
        })]);
        expect(state.movimientos[0].motivo).toMatch(/Pérdida en tránsito/);
        // splits bloqueados
        expect(sqls(conn).find(s => /FROM transferencia_item_origenes/.test(s))).toMatch(/FOR UPDATE/);
    });

    test('perdida_en_transito: el saldo de splits se limita al faltante (splits sin cantidad_decrementada)', async () => {
        const { state } = setup({
            disc: faltante(),
            splits: [{ id: 1, origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN, cantidad_enviada: '10.0000', cantidad_decrementada: '0.0000' }],
            stock: { [key(null, BODEGA_ORIGEN)]: 20 },
        });
        await resolver('perdida_en_transito');
        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(17);
        expect(state.splitUpdates).toEqual([{ take: 3, id: 1 }]);
    });

    test('perdida_en_transito sin splits y origen insuficiente → no baja de 0 y avisa cuánto no se descontó', async () => {
        const { state } = setup({
            disc: faltante(),
            splits: [],
            stock: { [key(null, BODEGA_ORIGEN)]: 1 },
        });
        const r = await resolver('perdida_en_transito');

        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(0);
        expect(r.ajustes).toEqual([{ obra_id: null, bodega_id: BODEGA_ORIGEN, ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, cantidad: -1 }]);
        expect(r.aviso).toMatch(/no se pudieron descontar 2 unidades/);
        expect(state.movimientos).toEqual([expect.objectContaining({ cantidad_anterior: 1, cantidad_nueva: 0 })]);
        expect(JSON.parse(state.discUpdates[0].ajuste_stock)).toEqual({ ajustes: r.ajustes, aviso: r.aviso });
    });

    test('perdida_en_transito con el origen en 0 (sin fila) → sin ajustes ni kardex, todo al aviso', async () => {
        const { state } = setup({ disc: faltante(), splits: [], stock: {} });
        const r = await resolver('perdida_en_transito');
        expect(r.ajustes).toEqual([]);
        expect(r.aviso).toMatch(/no se pudieron descontar 3 unidades/);
        expect(state.movimientos).toHaveLength(0);
        expect(state.stock).toEqual({});
    });

    test('nunca_salio → sin cambio de stock ni kardex', async () => {
        const { conn, state } = setup({ disc: faltante(), stock: { [key(null, BODEGA_ORIGEN)]: 8 } });
        const r = await resolver('nunca_salio');
        expect(r).toMatchObject({ causa: 'nunca_salio', ajustes: [], aviso: null });
        expect(sqls(conn).some(s => /ubicaciones_stock|stock_movimientos|transferencia_item_origenes/.test(s))).toBe(false);
        expect(state.discUpdates[0]).toMatchObject({ causa: 'nunca_salio', estado: 'resuelta' });
    });

    test('llego_despues → origen −faltante + destino +faltante (fila nueva copia el override del origen)', async () => {
        const { state } = setup({
            disc: faltante({ cantidad_recibida: '6.0000' }),
            splits: [],
            stock: { [key(null, BODEGA_ORIGEN)]: 10 },
            overrides: { [key(null, BODEGA_ORIGEN)]: 1500 },
        });
        const r = await resolver('llego_despues');

        expect(state.stock[key(null, BODEGA_ORIGEN)]).toBe(6);
        expect(state.stock[key(OBRA_DESTINO, null)]).toBe(4);
        expect(state.insertedOverride[key(OBRA_DESTINO, null)]).toBe(1500);
        expect(r.ajustes).toEqual([
            { obra_id: null, bodega_id: BODEGA_ORIGEN, ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, cantidad: -4 },
            { obra_id: OBRA_DESTINO, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_DESTINO}`, cantidad: 4 },
        ]);
        expect(state.movimientos).toEqual(expect.arrayContaining([
            expect.objectContaining({ bodega_id: BODEGA_ORIGEN, cantidad_anterior: 10, cantidad_nueva: 6, tipo: 'discrepancia' }),
            expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad_anterior: 0, cantidad_nueva: 4, tipo: 'discrepancia' }),
        ]));
        state.movimientos.forEach(m => expect(m.motivo).toMatch(/Llegó después/));
    });

    test('llego_despues con destino existente → suma sin tocar su override', async () => {
        const { state } = setup({
            disc: faltante(),
            splits: [],
            stock: { [key(null, BODEGA_ORIGEN)]: 10, [key(OBRA_DESTINO, null)]: 7 },
        });
        await resolver('llego_despues');
        expect(state.stock[key(OBRA_DESTINO, null)]).toBe(10);
        expect(state.insertedOverride).toEqual({});
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('validaciones y errores', () => {
    test('falta la causa al resolver → 400 sin abrir transacción', async () => {
        setup();
        await expect(resolver(undefined)).rejects.toMatchObject({ statusCode: 400, code: 'CAUSA_REQUERIDA' });
        await expect(resolver('')).rejects.toMatchObject({ statusCode: 400 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('causa fuera del catálogo → 400', async () => {
        setup();
        await expect(resolver('se_lo_llevo_el_viento')).rejects.toMatchObject({ statusCode: 400 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('nota vacía o estado inválido → 400', async () => {
        setup();
        await expect(transferenciaService.resolverDiscrepancia('31', USER, 'resuelta', '   ', 'nunca_salio')).rejects.toMatchObject({ statusCode: 400 });
        await expect(transferenciaService.resolverDiscrepancia('31', USER, 'otra', 'x', 'nunca_salio')).rejects.toMatchObject({ statusCode: 400 });
    });

    test('causa de faltante sobre un sobrante → 400 con mensaje claro, sin escribir', async () => {
        const { conn } = setup();   // enviada 10, recibida 12 → sobrante 2
        await expect(resolver('perdida_en_transito')).rejects.toMatchObject({
            statusCode: 400, code: 'CAUSA_NO_CALZA',
            message: expect.stringMatching(/es para faltantes; esta diferencia es un sobrante de 2/),
        });
        expect(escrituras(conn)).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('causa de sobrante sobre un faltante → 400', async () => {
        const { conn } = setup({ disc: discRow({ cantidad_recibida: '7.5000' }) });
        await expect(resolver('error_conteo_recepcion')).rejects.toMatchObject({
            statusCode: 400, code: 'CAUSA_NO_CALZA',
            message: expect.stringMatching(/es para sobrantes; esta diferencia es un faltante de 2,5/),
        });
        expect(escrituras(conn)).toEqual([]);
    });

    test.each(['error_conteo_recepcion', 'perdida_en_transito', 'llego_despues'])(
        'legacy (stock_reconciliado=FALSE) + %s → 409 "ajusta a mano", sin escribir', async (causa) => {
            const disc = causa === 'error_conteo_recepcion' ? discRow() : discRow({ cantidad_recibida: '7.0000' });
            const { conn } = setup({ disc, trf: { stock_reconciliado: false }, stock: { [key(OBRA_DESTINO, null)]: 50 } });
            await expect(resolver(causa)).rejects.toMatchObject({
                statusCode: 409, code: 'REGIMEN_LEGACY', message: 'Solicitud anterior al cambio de stock: ajusta a mano',
            });
            expect(escrituras(conn)).toEqual([]);
            expect(conn.rollback).toHaveBeenCalled();
        });

    test('legacy + nunca_salio → se permite, sin stock', async () => {
        const { state } = setup({ disc: discRow({ cantidad_recibida: '7.0000' }), trf: { stock_reconciliado: false } });
        const r = await resolver('nunca_salio');
        expect(r).toMatchObject({ causa: 'nunca_salio', ajustes: [] });
        // Legacy: el origen ya descontó lo enviado al aprobar → se avisa que las que nunca salieron no se devolvieron.
        expect(r.aviso).toMatch(/las 3 unidades que nunca salieron no se le devolvieron/);
        expect(state.movimientos).toHaveLength(0);
    });

    test('recibida sin eventos de recepción (antes de Ola 2) = régimen anterior: la causa que mueve stock → 409', async () => {
        const { conn, state } = setup({ disc: discRow({ cantidad_recibida: '7.0000' }), sinRecepciones: true, stock: { [key(null, BODEGA_ORIGEN)]: 50 } });
        await expect(resolver('perdida_en_transito')).rejects.toMatchObject({ statusCode: 409, code: 'REGIMEN_LEGACY' });
        expect(escrituras(conn).filter(x => !/UPDATE transferencia_discrepancias/.test(x))).toHaveLength(0);
        expect(state.movimientos).toHaveLength(0);
    });

    test('un 1054 que no es de causa/ajuste_stock sale como error real, no como «falta la migración»', async () => {
        const err = Object.assign(new Error("Unknown column 'cantidad_decrementada' in 'field list'"), { errno: 1054, sqlMessage: "Unknown column 'cantidad_decrementada' in 'field list'" });
        setup({ disc: discRow({ cantidad_recibida: '7.0000' }), splits: [{ id: 1, origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN, cantidad_enviada: '10', cantidad_decrementada: '7' }], failOn: /FROM transferencia_item_origenes/, failError: err });
        await expect(resolver('perdida_en_transito')).rejects.not.toMatchObject({ code: 'MIGRACION_PENDIENTE' });
    });

    test('legacy + origen_envio_de_mas → se permite; avisa que lo de más sigue contado en el origen (sin mirar kardex)', async () => {
        const { conn } = setup({ trf: { stock_reconciliado: false } });
        const r = await resolver('origen_envio_de_mas');
        expect(r.ajustes).toEqual([]);
        expect(r.aviso).toMatch(/las 2 unidades de más siguen contadas en el origen/);
        expect(sqls(conn).some(s => /stock_movimientos|ubicaciones_stock/.test(s))).toBe(false);
    });

    test('descartada → no mueve stock, ignora la causa y deja causa/ajuste_stock en null', async () => {
        const { conn, state } = setup();
        const r = await transferenciaService.resolverDiscrepancia('31', USER, 'descartada', '  dato de prueba  ', 'error_conteo_recepcion');
        expect(r).toEqual({ id: 31, estado: 'descartada', resolucion: 'dato de prueba', causa: null, ajustes: [], aviso: null });
        expect(sqls(conn).some(s => /FROM transferencias WHERE|ubicaciones_stock|stock_movimientos/.test(s))).toBe(false);
        expect(state.discUpdates).toEqual([expect.objectContaining({ estado: 'descartada', causa: null, ajuste_stock: null, resolucion: 'dato de prueba' })]);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('ya resuelta → 409 NO_PENDIENTE sin escribir', async () => {
        const { conn } = setup({ disc: discRow({ estado: 'resuelta' }) });
        await expect(resolver('origen_envio_de_mas')).rejects.toMatchObject({ statusCode: 409, code: 'NO_PENDIENTE' });
        expect(escrituras(conn)).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('no existe → 404', async () => {
        setup({ disc: null });
        await expect(resolver('origen_envio_de_mas')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('la discrepancia se bloquea con FOR UPDATE y la transferencia también', async () => {
        const { conn } = setup({ kardex: { salida: 12, entrada: 12 } });
        await resolver('origen_envio_de_mas');
        const s = sqls(conn);
        expect(s[0]).toMatch(/FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/);
        expect(s[0]).toMatch(/causa/);   // la columna de la mig 129 se pide explícita (1054 antes de tocar stock)
        expect(s[1]).toMatch(/FROM transferencias WHERE id = \? FOR UPDATE/);
        expect(conn.beginTransaction).toHaveBeenCalled();
    });

    test('fallo a mitad de camino (kardex) → rollback, sin commit, error hacia arriba', async () => {
        const { conn } = setup({
            kardex: { salida: 12, entrada: 12 },
            stock: { [key(null, BODEGA_ORIGEN)]: 5, [key(OBRA_DESTINO, null)]: 20 },
            failOn: /INSERT INTO stock_movimientos/,
            failError: new Error('ER_LOCK_DEADLOCK simulado'),
        });
        await expect(resolver('error_conteo_recepcion')).rejects.toThrow('ER_LOCK_DEADLOCK simulado');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
        expect(sqls(conn).some(s => /UPDATE transferencia_discrepancias/.test(s))).toBe(false);
    });

    test('sin la mig 129 (errno 1054) → 409 MIGRACION_PENDIENTE', async () => {
        const { conn } = setup({ failOn: /FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/, failError: err1054() });
        await expect(resolver('origen_envio_de_mas')).rejects.toMatchObject({ statusCode: 409, code: 'MIGRACION_PENDIENTE' });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('el motivo del kardex se corta a 255 (resolucion admite 1000)', async () => {
        const { state } = setup({ disc: discRow({ cantidad_recibida: '7.0000' }), stock: { [key(null, BODEGA_ORIGEN)]: 10 } });
        await resolver('perdida_en_transito', { nota: 'x'.repeat(1000) });
        expect(state.movimientos[0].motivo.length).toBe(255);
        expect(state.discUpdates[0].resolucion).toHaveLength(1000);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET discrepancias devuelve causa y ajuste_stock', () => {
    test('parsea ajuste_stock; tolera NULL, JSON corrupto y filas sin las columnas (mig 129 pendiente)', async () => {
        const ajuste = { ajustes: [{ obra_id: 9, bodega_id: null, ubicacion_nombre: 'Obra 9', cantidad: -2 }], aviso: null };
        db.query.mockImplementation(async (sql) => {
            if (/SELECT DISTINCT t\.id/.test(sql)) return [[{ id: TRF, codigo: 'TRF-1' }]];
            if (/SELECT d\.\*/.test(sql)) {
                return [[
                    { id: 1, transferencia_id: TRF, cantidad_enviada: '10.0000', cantidad_recibida: '12.0000', diferencia: '-2.0000', estado: 'resuelta', causa: 'error_conteo_recepcion', ajuste_stock: JSON.stringify(ajuste) },
                    { id: 2, transferencia_id: TRF, cantidad_enviada: '5.0000', cantidad_recibida: '4.0000', diferencia: '1.0000', estado: 'pendiente', causa: null, ajuste_stock: null },
                    { id: 3, transferencia_id: TRF, cantidad_enviada: '5.0000', cantidad_recibida: '3.0000', diferencia: '2.0000', estado: 'resuelta', causa: 'nunca_salio', ajuste_stock: '{roto' },
                    { id: 4, transferencia_id: TRF, cantidad_enviada: '5.0000', cantidad_recibida: '6.0000', diferencia: '-1.0000', estado: 'pendiente' },
                ]];
            }
            if (/COUNT\(DISTINCT t\.id\)/.test(sql)) return [[{ total: 1 }]];
            return [[]];
        });
        const r = await transferenciaService.getDiscrepancias({});
        const ds = r.data[0].discrepancias;
        expect(ds[0]).toMatchObject({ causa: 'error_conteo_recepcion', ajuste_stock: ajuste, diferencia: -2 });
        expect(ds[1]).toMatchObject({ causa: null, ajuste_stock: null });
        expect(ds[2]).toMatchObject({ causa: 'nunca_salio', ajuste_stock: null });
        expect(ds[3]).toMatchObject({ causa: null, ajuste_stock: null });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /api/transferencias/discrepancias/:id/resolver (ruta + schema)', () => {
    const app = require('../index');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const token = jwt.sign({ id: USER, email: 'aprob@lols.cl', rol_id: 2, rv: 1, p: ['inventario.transferencias.aprobar'] }, SECRET);
    const URL = '/api/transferencias/discrepancias/31/resolver';
    let spy;
    beforeEach(() => {
        spy = jest.spyOn(transferenciaService, 'resolverDiscrepancia')
            .mockResolvedValue({ id: 31, estado: 'resuelta', resolucion: 'ok', causa: 'nunca_salio', ajustes: [], aviso: null });
    });
    afterEach(() => spy.mockRestore());

    test('el schema declara causa con el catálogo cerrado de 5 valores', () => {
        expect(schemas.resolverDiscrepancia.causa).toEqual({ type: 'string', in: CODIGOS_CAUSA });
        expect(CODIGOS_CAUSA).toEqual(['origen_envio_de_mas', 'error_conteo_recepcion', 'perdida_en_transito', 'nunca_salio', 'llego_despues']);
    });

    test('pasa la causa al service (5º parámetro) y responde { data }', async () => {
        const res = await request(app).put(URL).set('Authorization', `Bearer ${token}`)
            .send({ estado: 'resuelta', resolucion: 'ok', causa: 'nunca_salio', resuelto_por: 1 });
        expect(res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith('31', USER, 'resuelta', 'ok', 'nunca_salio');
        expect(res.body.data).toMatchObject({ causa: 'nunca_salio', ajustes: [], aviso: null });
    });

    test('causa fuera del catálogo → 400 del schema, sin llamar al service', async () => {
        const res = await request(app).put(URL).set('Authorization', `Bearer ${token}`)
            .send({ estado: 'resuelta', resolucion: 'ok', causa: 'magia' });
        expect(res.status).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });

    test('409 del service llega con su code (MIGRACION_PENDIENTE)', async () => {
        spy.mockRejectedValue(Object.assign(new Error('Resolver diferencias con causa requiere la migración 129'), { statusCode: 409, code: 'MIGRACION_PENDIENTE' }));
        const res = await request(app).put(URL).set('Authorization', `Bearer ${token}`)
            .send({ estado: 'resuelta', resolucion: 'ok', causa: 'nunca_salio' });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('MIGRACION_PENDIENTE');
    });
});

describe('eliminar y descartar (revisión 2026-10-21)', () => {
    test('no se elimina una diferencia que ya ajustó stock → 409 CON_AJUSTE, sin DELETE', async () => {
        db.query.mockReset().mockResolvedValueOnce([[{ id: 31, transferencia_id: TRF, ajuste_stock: JSON.stringify({ ajustes: [{ cantidad: -2 }], aviso: null }) }]]);
        await expect(transferenciaService.eliminarDiscrepancia(31, 1)).rejects.toMatchObject({ statusCode: 409, code: 'CON_AJUSTE' });
        expect(db.query.mock.calls.some(([s]) => /DELETE/.test(String(s)))).toBe(false);
    });

    test('sin ajustes (o sin la columna) sí se elimina', async () => {
        const e1054 = Object.assign(new Error("Unknown column 'ajuste_stock'"), { errno: 1054 });
        db.query.mockReset().mockRejectedValueOnce(e1054).mockResolvedValueOnce([[{ id: 31, transferencia_id: TRF }]]).mockResolvedValue([{ affectedRows: 1 }]);
        await expect(transferenciaService.eliminarDiscrepancia(31, 1)).resolves.toEqual({ id: 31 });
    });

    test('descartar no pide las columnas nuevas (funciona sin la mig 129)', async () => {
        const { conn } = setup({ failOn: /causa, ajuste_stock/, failError: Object.assign(new Error("Unknown column 'causa'"), { errno: 1054, sqlMessage: "Unknown column 'causa'" }) });
        await expect(transferenciaService.resolverDiscrepancia(31, 1, 'descartada', 'No aplica')).resolves.toMatchObject({ estado: 'descartada', causa: null });
        expect(sqls(conn).some(s => /causa/.test(s))).toBe(false);
    });
});

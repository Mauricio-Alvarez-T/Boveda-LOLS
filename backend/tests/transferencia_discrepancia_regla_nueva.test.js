/**
 * Diferencias (discrepancias) de transferencia con la REGLA NUEVA (decisión del dueño 2026-10-21, mig 130).
 *
 *   · recibir() mueve SOLO lo ENVIADO (parcial: hasta lo declarado sin pasar de lo enviado; el 'total' que
 *     cierra completa la enviada). Lo declarado de más/menos queda en transferencia_discrepancias con
 *     diferencia_aplicada = 0 (pendiente, fuera del stock). Ya no se crea stock sin respaldo al recibir.
 *   · PUT /discrepancias/:id/resolver { estado, resolucion? }
 *       'resuelta'   = APROBAR lo declarado: sobrante → destino +dif / origen −dif (sin bajar de 0, aviso);
 *                      faltante → destino −f (409 si no alcanza) / origen +f (splits en orden inverso).
 *       'descartada' = RECHAZAR lo declarado: no mueve stock.
 *       resolucion opcional (texto generado). Regla antigua (diferencia_aplicada = 1) → 409 REGLA_ANTIGUA.
 *   · POST /discrepancias/:id/rehacer?simular=1 (solo Super Admin): deja el stock como si hubiera llegado lo
 *     enviado y reabre la fila como pendiente de la regla nueva.
 *
 * El mock de conn simula en memoria las tablas que tocan recibir/resolver/rehacer (por SQL, no por orden de
 * llamadas) para afirmar el stock final, el kardex, los splits y la fila de la discrepancia.
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
const { logManualActivity } = require('../src/middleware/logger');

const ITEM = 5;
const TRF = 100;
const RECEPTOR = 77;
const DAPHNE = 12;          // quien resuelve en inventario
const BODEGA_ORIGEN = 2;    // origen primario (transferencia_items.origen_bodega_id)
const OBRA_DESTINO = 9;
const OBRA_SPLIT = 4;
const PERMS_RECIBIR = ['inventario.transferencias.recibir'];

const k = (obra, bodega, item = ITEM) => `${item}|${obra ?? ''}|${bodega ?? ''}`;
const ORIGEN = k(null, BODEGA_ORIGEN);
const DESTINO = k(OBRA_DESTINO, null);
const SPLIT_B = k(OBRA_SPLIT, null);
const dec = (n) => (n == null ? null : `${Number(n).toFixed(4)}`);   // DECIMAL(12,4) como lo entrega mysql2
const err1054 = (col) => Object.assign(new Error(`Unknown column '${col}' in 'field list'`), {
    errno: 1054, code: 'ER_BAD_FIELD_ERROR', sqlMessage: `Unknown column '${col}' in 'field list'`,
});

/**
 * BD en memoria.
 * @param {object} o
 *   trf          campos que pisan la transferencia base
 *   enviada      cantidad_enviada del ítem (10)
 *   recibidaPrev cantidad_recibida acumulada (null)
 *   itemRow      false = sin fila en transferencia_items
 *   splits       [{ id, obra, bodega, enviada, decrementada }] (default: 1 split de la bodega origen por la enviada)
 *   stock        { k(obra,bodega): cantidad }
 *   overrides    { k(obra,bodega): valor_arriendo_override }
 *   discs        filas de transferencia_discrepancias
 *   kardex       filas previas de stock_movimientos (created_at opcional; las nuevas llevan state.ahora)
 *   responsables { bodega_id: responsable_nombre }
 *   usuarios     { id: nombre } (JOIN del aviso de ajustes posteriores)
 *   ahora        Date de las filas nuevas del kardex y de fecha_recepcion al cerrar
 *   recepciones  nº de eventos previos en transferencia_recepciones (default 1; 0 = régimen anterior)
 *   failOn       RegExp: la query que calce rechaza con failError
 */
function setup(o = {}) {
    const enviada = o.enviada ?? 10;
    const state = {
        trf: {
            id: TRF, codigo: 'TRF-202610-0001', estado: 'en_transito', stock_reconciliado: true,
            origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN, destino_obra_id: OBRA_DESTINO, destino_bodega_id: null,
            transportista_id: 50, aprobador_id: 40, fecha_recepcion: null, ...(o.trf || {}),
        },
        items: o.itemRow === false ? [] : [{
            id: 200, item_id: ITEM, cantidad_enviada: enviada, cantidad_recibida: o.recibidaPrev ?? null,
            origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN,
        }],
        splits: (o.splits || [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada, decrementada: 0 }])
            .map(s => ({ ...s, transferencia_item_id: 200 })),
        stock: { ...(o.stock || {}) },
        overrides: { ...(o.overrides || {}) },
        insertedOverride: {},
        discs: (o.discs || []).map(d => ({ ...d })),
        movimientos: (o.kardex || []).map(m => ({ ...m })),
        recepciones: Array.from({ length: o.recepciones ?? 1 }, (_, i) => ({ id: 4000 + i, transferencia_id: TRF })),
        recepcionItems: [],
        escrituras: [],
        ahora: o.ahora || new Date(2026, 9, 21, 9, 0),
        responsables: { ...(o.responsables || {}) },
        usuarios: { ...(o.usuarios || {}) },
        trfBorrada: false,
    };
    const W = (sql) => state.escrituras.push(sql.replace(/\s+/g, ' ').trim().slice(0, 60));
    const conn = {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
        query: jest.fn(async (sql, p = []) => {
            sql = String(sql);
            if (o.failOn && o.failOn.test(sql)) throw o.failError || new Error('fallo simulado');

            // ── transferencias ──
            if (/SELECT \* FROM transferencias WHERE id = \? FOR UPDATE/.test(sql)) return [[{ ...state.trf }]];
            if (/FROM transferencias WHERE id = \? FOR UPDATE/.test(sql)) return [Number(p[0]) === TRF ? [{ ...state.trf }] : []];
            if (/^\s*UPDATE transferencias SET estado/.test(sql)) {
                W(sql);
                state.trf.estado = /'recepcion_parcial'/.test(sql) ? 'recepcion_parcial' : 'recibida';
                if (/fecha_recepcion = NOW\(\)/.test(sql)) state.trf.fecha_recepcion = state.ahora;
                return [{ affectedRows: 1 }];
            }

            // ── transferencia_items ──
            if (/SELECT id, item_id, cantidad_enviada, cantidad_recibida/.test(sql)) {
                return [state.items.map(r => ({ ...r, cantidad_enviada: dec(r.cantidad_enviada), cantidad_recibida: dec(r.cantidad_recibida) }))];
            }
            if (/FROM transferencia_items\s+WHERE transferencia_id = \? AND item_id = \? ORDER BY id DESC LIMIT 1/.test(sql)) {
                const r = [...state.items].reverse().find(x => x.item_id === Number(p[1]));
                return [r ? [{ id: r.id, origen_obra_id: r.origen_obra_id, origen_bodega_id: r.origen_bodega_id }] : []];
            }
            if (/^\s*UPDATE transferencia_items SET cantidad_recibida/.test(sql)) {
                W(sql);
                state.items.filter(r => r.item_id === Number(p[2])).forEach(r => { r.cantidad_recibida = (r.cantidad_recibida ?? 0) + p[0]; });
                return [{ affectedRows: 1 }];
            }

            // ── recepciones ──
            if (/INSERT INTO transferencia_recepciones\s/.test(sql)) {
                W(sql);
                state.recepciones.push({ id: 5000 + state.recepciones.length, transferencia_id: p[0], tipo: p[2] });
                return [{ insertId: 5000 + state.recepciones.length }];
            }
            if (/INSERT INTO transferencia_recepcion_items/.test(sql)) {
                W(sql);
                state.recepcionItems.push({ recepcion_id: p[0], transferencia_item_id: p[1], cantidad_recibida: p[2] });
                return [{ affectedRows: 1 }];
            }
            if (/FROM transferencia_recepciones WHERE transferencia_id/.test(sql)) {
                return [state.recepciones.filter(r => r.transferencia_id === Number(p[0])).slice(0, 1).map(() => ({ 1: 1 }))];
            }

            // ── splits ──
            if (/FROM transferencia_item_origenes/.test(sql)) {
                return [state.splits.filter(s => s.transferencia_item_id === Number(p[0])).sort((a, b) => a.id - b.id).map(s => ({
                    id: s.id, origen_obra_id: s.obra, origen_bodega_id: s.bodega,
                    cantidad_enviada: dec(s.enviada), cantidad_decrementada: dec(s.decrementada),
                }))];
            }
            if (/^\s*UPDATE transferencia_item_origenes SET cantidad_decrementada/.test(sql)) {
                W(sql);
                const s = state.splits.find(x => x.id === p[1]);
                if (s) s.decrementada = Math.round((s.decrementada + p[0]) * 10000) / 10000;
                return [{ affectedRows: 1 }];
            }

            // ── ubicaciones_stock ──
            if (/SELECT cantidad FROM ubicaciones_stock/.test(sql)) {
                const key = k(p[1], p[2], p[0]);
                return [key in state.stock ? [{ cantidad: dec(state.stock[key]) }] : []];
            }
            if (/SELECT valor_arriendo_override FROM ubicaciones_stock/.test(sql)) {
                const key = k(p[1], p[2], p[0]);
                return [key in state.stock ? [{ valor_arriendo_override: state.overrides[key] ?? null }] : []];
            }
            if (/^\s*UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(sql)) {
                W(sql);
                const key = k(p[2], p[3], p[1]);
                if (key in state.stock) state.stock[key] = Math.max(Math.round((state.stock[key] - p[0]) * 10000) / 10000, 0);
                return [{ affectedRows: key in state.stock ? 1 : 0 }];
            }
            if (/INSERT INTO ubicaciones_stock/.test(sql)) {
                W(sql);
                const key = k(p[1], p[2], p[0]);
                if (!(key in state.stock)) state.insertedOverride[key] = p[4];
                state.stock[key] = Math.round(((state.stock[key] ?? 0) + p[3]) * 10000) / 10000;
                return [{ affectedRows: 1 }];
            }

            // ── kardex ──
            if (/INSERT INTO stock_movimientos/.test(sql)) {
                W(sql);
                const [item_id, obra_id, bodega_id, tipo, cantidad_anterior, cantidad_nueva, referencia_tipo, referencia_id, motivo, usuario_id] = p;
                state.movimientos.push({ item_id, obra_id, bodega_id, tipo, cantidad_anterior, cantidad_nueva, referencia_tipo, referencia_id, motivo, usuario_id, created_at: state.ahora });
                return [{ insertId: state.movimientos.length }];
            }
            // _kardexDeTrfItem (_salidoDelOrigen / _descontadoDelOrigen): filas del kardex de (TRF, ítem)
            if (/SELECT tipo, obra_id, bodega_id, cantidad_anterior, cantidad_nueva\s+FROM stock_movimientos/.test(sql)) {
                return [state.movimientos
                    .filter(m => m.referencia_tipo === 'transferencia' && Number(m.referencia_id) === Number(p[0]) && Number(m.item_id) === Number(p[1]))
                    .map(m => ({ tipo: m.tipo, obra_id: m.obra_id, bodega_id: m.bodega_id, cantidad_anterior: dec(m.cantidad_anterior), cantidad_nueva: dec(m.cantidad_nueva) }))];
            }
            // _ajustesPosteriores: ajuste_manual/discrepancia del ítem en esas ubicaciones, desde la recepción, que no
            // vengan de una transferencia (ni esta ni otras)
            if (/FROM stock_movimientos m\s+LEFT JOIN usuarios/.test(sql)) {
                expect(sql).toMatch(/NOT \(m\.referencia_tipo <=> 'transferencia'\)/);
                const [itemId, desde, ...pares] = p;
                const ubics = [];
                for (let i = 0; i < pares.length; i += 2) ubics.push(k(pares[i], pares[i + 1], itemId));
                return [state.movimientos
                    .filter(m => Number(m.item_id) === Number(itemId) && ['ajuste_manual', 'discrepancia'].includes(m.tipo))
                    .filter(m => m.created_at && m.created_at >= desde)
                    .filter(m => m.referencia_tipo !== 'transferencia')
                    .filter(m => ubics.includes(k(m.obra_id, m.bodega_id, m.item_id)))
                    .sort((a, b) => a.created_at - b.created_at)
                    .map(m => ({
                        created_at: m.created_at, obra_id: m.obra_id, bodega_id: m.bodega_id,
                        cantidad_anterior: dec(m.cantidad_anterior), cantidad_nueva: dec(m.cantidad_nueva),
                        usuario_nombre: state.usuarios[m.usuario_id] ?? null,
                    }))];
            }
            // ── discrepancias ──
            if (/INSERT INTO transferencia_discrepancias/.test(sql)) {
                W(sql);
                const literal0 = /diferencia_aplicada\)\s*VALUES \(\?, \?, \?, \?, \?, \?, 0\)/.test(sql);
                state.discs.push({
                    id: 31 + state.discs.length, transferencia_id: p[0], item_id: p[1], cantidad_enviada: p[2], cantidad_recibida: p[3],
                    observacion: p[4], reportado_por: p[5], estado: 'pendiente', diferencia_aplicada: literal0 ? 0 : null,
                    resolucion: null, resuelto_por: null, ajuste_stock: null, causa: null,
                });
                return [{ insertId: 31 + state.discs.length - 1 }];
            }
            if (/FROM transferencia_discrepancias WHERE transferencia_id = \? FOR UPDATE/.test(sql)) {
                return [state.discs.filter(x => x.transferencia_id === Number(p[0])).map(x => ({ ...x }))];
            }
            if (/^\s*DELETE FROM transferencia_discrepancias WHERE id = \?/.test(sql)) {
                W(sql);
                state.discs = state.discs.filter(x => x.id !== Number(p[0]));
                return [{ affectedRows: 1 }];
            }
            if (/^\s*DELETE FROM transferencias WHERE id = \?/.test(sql)) {
                W(sql);
                state.trfBorrada = true;
                return [{ affectedRows: 1 }];
            }
            if (/FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/.test(sql)) {
                const d = state.discs.find(x => x.id === Number(p[0]));
                return [d ? [{ ...d, cantidad_enviada: dec(d.cantidad_enviada), cantidad_recibida: dec(d.cantidad_recibida) }] : []];
            }
            if (/^\s*UPDATE transferencia_discrepancias\s+SET estado = 'pendiente', diferencia_aplicada = 0/.test(sql)) {
                W(sql);
                const d = state.discs.find(x => x.id === Number(p[2]));
                if (!d || d.diferencia_aplicada === 0 || d.diferencia_aplicada === false) return [{ affectedRows: 0 }];
                Object.assign(d, { estado: 'pendiente', diferencia_aplicada: 0, resolucion: null, resuelto_por: null, observacion: p[0], ajuste_stock: p[1] });
                return [{ affectedRows: 1 }];
            }
            if (/^\s*UPDATE transferencia_discrepancias\s+SET estado = \?, resolucion = \?, ajuste_stock = \?, resuelto_por = \?/.test(sql)) {
                W(sql);
                const d = state.discs.find(x => x.id === Number(p[4]));
                if (!d || d.estado !== 'pendiente') return [{ affectedRows: 0 }];
                Object.assign(d, { estado: p[0], resolucion: p[1], ajuste_stock: p[2], resuelto_por: p[3] });
                return [{ affectedRows: 1 }];
            }

            // ── catálogos ──
            if (/FROM items_inventario WHERE id = \?/.test(sql)) return [[{ id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' }]];
            if (/FROM obras WHERE id IN/.test(sql)) return [p[0].map(id => ({ id, nombre: `Obra ${id}` }))];
            if (/FROM bodegas WHERE id IN/.test(sql)) {
                return [p[0].map(id => ({ id, nombre: `Bodega ${id}`, responsable_nombre: state.responsables[id] ?? null }))];
            }

            throw new Error(`SQL no simulado en el test: ${sql.slice(0, 120)}`);
        }),
    };
    db.getConnection.mockResolvedValue(conn);
    return { conn, state };
}

/** Fila de discrepancia de la regla nueva (diferencia_aplicada = 0) ya en la BD. */
const disc = (over = {}) => ({
    id: 31, transferencia_id: TRF, item_id: ITEM, cantidad_enviada: 10, cantidad_recibida: 12, observacion: null,
    reportado_por: RECEPTOR, estado: 'pendiente', diferencia_aplicada: 0, resolucion: null, resuelto_por: null,
    ajuste_stock: null, causa: null, ...over,
});

const recibir = (cant, tipo = 'total', items) => transferenciaService.recibir(
    TRF, RECEPTOR, items || [{ item_id: ITEM, cantidad_recibida: cant }], PERMS_RECIBIR, tipo
);
const resolver = (estado = 'resuelta', nota, id = 31) => transferenciaService.resolverDiscrepancia(id, DAPHNE, estado, nota);
const rehacer = (simular = false, id = 31) => transferenciaService.rehacerDiscrepancia(id, 1, { simular });
const kardexDe = (state, tipo) => state.movimientos.filter(m => m.tipo === tipo);
const sqls = (conn) => conn.query.mock.calls.map(([s]) => String(s));

beforeEach(() => {
    jest.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('recibir() mueve SOLO lo enviado', () => {
    test('total con SOBRANTE (declara 12 de 10): stock mueve 10, discrepancia pendiente con diferencia_aplicada=0', async () => {
        const { conn, state } = setup({ stock: { [ORIGEN]: 50 } });
        const r = await recibir(12);

        expect(r.estado).toBe('recibida');
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.splits[0].decrementada).toBe(10);
        // Lo declarado se registra igual
        expect(state.items[0].cantidad_recibida).toBe(12);
        expect(state.recepcionItems).toEqual([expect.objectContaining({ cantidad_recibida: 12 })]);
        expect(state.discs).toEqual([expect.objectContaining({
            transferencia_id: TRF, item_id: ITEM, cantidad_enviada: 10, cantidad_recibida: 12,
            diferencia_aplicada: 0, estado: 'pendiente', reportado_por: RECEPTOR,
        })]);
        // Kardex por lo movido
        expect(kardexDe(state, 'transferencia_salida')).toEqual([expect.objectContaining({ cantidad_anterior: 50, cantidad_nueva: 40, referencia_id: TRF })]);
        expect(kardexDe(state, 'transferencia_entrada')).toEqual([expect.objectContaining({ cantidad_anterior: 0, cantidad_nueva: 10, referencia_id: TRF })]);
        // El INSERT lleva diferencia_aplicada como literal 0 (nunca NULL = «regla antigua»)
        const ins = conn.query.mock.calls.find(([s]) => /INSERT INTO transferencia_discrepancias/.test(s));
        expect(ins[0]).toMatch(/diferencia_aplicada\)\s*VALUES \(\?, \?, \?, \?, \?, \?, 0\)/);
        expect(ins[1]).toEqual([TRF, ITEM, 10, 12, null, RECEPTOR]);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('over-receive ya NO crea stock: con el origen justo (10) y 12 declaradas, el total del sistema se conserva', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 10 } });
        await recibir(12);
        expect(state.stock[ORIGEN]).toBe(0);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.stock[ORIGEN] + state.stock[DESTINO]).toBe(10);
    });

    test('total con FALTANTE (declara 7 de 10): stock mueve 10 igual, discrepancia (10, 7) pendiente', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(7);
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.items[0].cantidad_recibida).toBe(7);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 7, diferencia_aplicada: 0 })]);
    });

    test('total cuadrado (10 de 10): mueve 10 y no hay discrepancia', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(10);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.discs).toEqual([]);
    });

    test('parciales + total: 4 → 3 → total declara 1 más (8 de 10) → el total mueve el resto (3)', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });

        await recibir(4, 'parcial');
        expect(state.trf.estado).toBe('recepcion_parcial');
        expect(state.stock[ORIGEN]).toBe(46);
        expect(state.stock[DESTINO]).toBe(4);

        await recibir(3, 'parcial');
        expect(state.stock[ORIGEN]).toBe(43);
        expect(state.stock[DESTINO]).toBe(7);
        expect(state.discs).toEqual([]);

        await recibir(1, 'total');
        expect(state.trf.estado).toBe('recibida');
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.splits[0].decrementada).toBe(10);
        expect(state.items[0].cantidad_recibida).toBe(8);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 8, diferencia_aplicada: 0 })]);
        expect(kardexDe(state, 'transferencia_entrada').map(m => m.cantidad_nueva - m.cantidad_anterior)).toEqual([4, 3, 3]);
    });

    test('parcial + total con sobrante: 4 y luego 9 (13 de 10) → el total mueve solo 6', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(4, 'parcial');
        await recibir(9, 'total');
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 13 })]);
    });

    test('un total que declara 0 para el ítem igual mueve el resto de lo enviado (faltante pendiente)', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(4, 'parcial');
        await recibir(0, 'total');
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 4 })]);
    });

    test('multi-split FIFO: el total con sobrante consume los splits por lo enviado, sin tocar el fallback', async () => {
        const { state } = setup({
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 0 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 0 }],
            stock: { [ORIGEN]: 50, [SPLIT_B]: 20 },
        });
        await recibir(15);
        expect(state.stock[ORIGEN]).toBe(44);
        expect(state.stock[SPLIT_B]).toBe(16);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.splits.map(s => s.decrementada)).toEqual([6, 4]);
    });

    test('régimen legacy (stock_reconciliado=FALSE): solo suma lo ENVIADO al destino; el origen no se toca', async () => {
        const { state } = setup({ trf: { stock_reconciliado: false }, stock: { [ORIGEN]: 50 } });
        await recibir(12);
        expect(state.stock[ORIGEN]).toBe(50);
        expect(state.stock[DESTINO]).toBe(10);
        expect(kardexDe(state, 'transferencia_salida')).toHaveLength(0);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_recibida: 12, diferencia_aplicada: 0 })]);
    });

    test('item_id repetido en el payload (total): no mueve dos veces y registra UNA discrepancia con el total declarado', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(null, 'total', [{ item_id: ITEM, cantidad_recibida: 6 }, { item_id: ITEM, cantidad_recibida: 6 }]);
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 12 })]);
    });

    test('item_id repetido en un parcial que suma más de lo enviado → 400 (el tope cuenta las dos entradas)', async () => {
        const { conn } = setup({ stock: { [ORIGEN]: 50 } });
        await expect(recibir(null, 'parcial', [{ item_id: ITEM, cantidad_recibida: 6 }, { item_id: ITEM, cantidad_recibida: 6 }]))
            .rejects.toMatchObject({ statusCode: 400 });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('sin la mig 130 (1054 de diferencia_aplicada) → 409 MIGRACION_PENDIENTE, rollback y sin commit', async () => {
        const { conn } = setup({ stock: { [ORIGEN]: 50 }, failOn: /INSERT INTO transferencia_discrepancias/, failError: err1054('diferencia_aplicada') });
        await expect(recibir(12)).rejects.toMatchObject({ statusCode: 409, code: 'MIGRACION_PENDIENTE' });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('otro 1054 en recibir sale como error real', async () => {
        setup({ stock: { [ORIGEN]: 50 }, failOn: /INSERT INTO transferencia_discrepancias/, failError: err1054('otra_columna') });
        await expect(recibir(12)).rejects.not.toMatchObject({ code: 'MIGRACION_PENDIENTE' });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('RESOLVER = aprobar lo declarado', () => {
    test('de punta a punta: recibir 12 de 10 y aprobar → destino queda con 12 y el origen pierde las 2 de más', async () => {
        const { conn, state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(12);
        const r = await resolver('resuelta');

        expect(state.stock[ORIGEN]).toBe(38);
        expect(state.stock[DESTINO]).toBe(12);
        expect(r).toEqual({
            id: 31, estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados',
            ajustes: [
                { obra_id: null, bodega_id: BODEGA_ORIGEN, ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, antes: 40, despues: 38, cantidad: -2 },
                { obra_id: OBRA_DESTINO, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_DESTINO}`, antes: 10, despues: 12, cantidad: 2 },
            ],
            aviso: null,
            transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001',
            item: { id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' },
            simulado: false,
        });
        const movs = kardexDe(state, 'discrepancia');
        expect(movs).toHaveLength(2);
        movs.forEach(m => {
            expect(m).toMatchObject({ item_id: ITEM, referencia_tipo: 'transferencia', referencia_id: TRF, usuario_id: DAPHNE });
            expect(m.motivo).toMatch(/^Diferencia aprobada TRF-202610-0001: llegaron 12 de 10 enviados \(sobrante 2\)$/);
        });
        expect(movs).toEqual(expect.arrayContaining([
            expect.objectContaining({ bodega_id: BODEGA_ORIGEN, cantidad_anterior: 40, cantidad_nueva: 38 }),
            expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad_anterior: 10, cantidad_nueva: 12 }),
        ]));
        expect(state.discs[0]).toMatchObject({ estado: 'resuelta', resuelto_por: DAPHNE, resolucion: 'Aprobada: llegaron 12 de 10 enviados' });
        expect(JSON.parse(state.discs[0].ajuste_stock)).toEqual({ ajustes: r.ajustes, aviso: null });
        expect(conn.commit).toHaveBeenCalledTimes(2);
    });

    test('bloqueos: discrepancia → transferencia → filas de stock (todas FOR UPDATE) antes de escribir', async () => {
        const { conn } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        await resolver('resuelta');
        const s = sqls(conn);
        expect(s[0]).toMatch(/FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/);
        expect(s[0]).toMatch(/diferencia_aplicada/);
        expect(s[0]).not.toMatch(/causa/);
        expect(s[1]).toMatch(/FROM transferencias WHERE id = \? FOR UPDATE/);
        const primeraEscritura = s.findIndex(x => /UPDATE ubicaciones_stock|INSERT INTO ubicaciones_stock/.test(x));
        const locks = s.map((x, i) => [x, i]).filter(([x]) => /SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/.test(x));
        expect(locks).toHaveLength(2);
        locks.forEach(([, i]) => expect(i).toBeLessThan(primeraEscritura));
        // ya no se escribe la causa
        expect(s.find(x => /UPDATE transferencia_discrepancias/.test(x))).not.toMatch(/causa/);
    });

    test('sobrante con el origen insuficiente → el origen queda en 0 (no negativo) y el aviso dice cuántas quedaron sin respaldo', async () => {
        const { state } = setup({ discs: [disc({ cantidad_recibida: 13 })], stock: { [ORIGEN]: 1, [DESTINO]: 10 } });
        const r = await resolver('resuelta');
        expect(state.stock[ORIGEN]).toBe(0);
        expect(state.stock[DESTINO]).toBe(13);
        expect(r.ajustes).toEqual([
            expect.objectContaining({ bodega_id: BODEGA_ORIGEN, cantidad: -1 }),
            expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad: 3 }),
        ]);
        expect(r.aviso).toBe(`Bodega ${BODEGA_ORIGEN} no tenía stock suficiente: 2 de las 3 unidades quedaron sin respaldo (quedó en 0). Revisa su stock.`);
        expect(JSON.parse(state.discs[0].ajuste_stock).aviso).toBe(r.aviso);
    });

    test('sobrante con el origen sin fila → solo suma al destino; todo al aviso', async () => {
        const { state } = setup({ discs: [disc()], stock: { [DESTINO]: 10 } });
        const r = await resolver('resuelta');
        expect(state.stock[DESTINO]).toBe(12);
        expect(state.stock[ORIGEN]).toBeUndefined();
        expect(r.ajustes).toEqual([expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad: 2 })]);
        expect(r.aviso).toMatch(/2 de las 2 unidades quedaron sin respaldo/);
    });

    test('sobrante con el destino sin fila → la crea copiando el valor_arriendo_override del origen', async () => {
        const { state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40 }, overrides: { [ORIGEN]: 1500 } });
        await resolver('resuelta');
        expect(state.stock[DESTINO]).toBe(2);
        expect(state.insertedOverride[DESTINO]).toBe(1500);
    });

    test('FALTANTE (7 de 10) con splits → destino −3 y vuelve al origen en orden INVERSO (baja cantidad_decrementada)', async () => {
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 7 })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 6 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 4 }],
            stock: { [ORIGEN]: 44, [SPLIT_B]: 16, [DESTINO]: 10 },
        });
        const r = await resolver('resuelta');
        expect(state.stock[DESTINO]).toBe(7);
        expect(state.stock[SPLIT_B]).toBe(19);
        expect(state.stock[ORIGEN]).toBe(44);
        expect(state.splits.map(s => s.decrementada)).toEqual([6, 1]);
        expect(r.ajustes).toEqual([
            { obra_id: OBRA_SPLIT, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_SPLIT}`, antes: 16, despues: 19, cantidad: 3 },
            { obra_id: OBRA_DESTINO, bodega_id: null, ubicacion_nombre: `Obra ${OBRA_DESTINO}`, antes: 10, despues: 7, cantidad: -3 },
        ]);
        expect(r.aviso).toBeNull();
        expect(r.resolucion).toBe('Aprobada: llegaron 7 de 10 enviados');
        expect(kardexDe(state, 'discrepancia')[0].motivo).toMatch(/\(faltante 3\)/);
    });

    test('faltante que pasa por varios splits: el último entrega todo lo que descontó y el resto sale del anterior', async () => {
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 5 })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 6 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 4 }],
            stock: { [ORIGEN]: 44, [SPLIT_B]: 16, [DESTINO]: 10 },
        });
        await resolver('resuelta');
        expect(state.stock[SPLIT_B]).toBe(20);
        expect(state.stock[ORIGEN]).toBe(45);
        expect(state.stock[DESTINO]).toBe(5);
        expect(state.splits.map(s => s.decrementada)).toEqual([5, 0]);
    });

    test('faltante sin splits → todo vuelve al origen primario', async () => {
        const { state } = setup({ discs: [disc({ cantidad_recibida: 7 })], splits: [], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        await resolver('resuelta');
        expect(state.stock[ORIGEN]).toBe(43);
        expect(state.stock[DESTINO]).toBe(7);
    });

    test('faltante con el destino insuficiente → 409 claro nombrando el destino y NO escribe nada', async () => {
        const { conn, state } = setup({ discs: [disc({ cantidad_recibida: 7 })], stock: { [ORIGEN]: 40, [DESTINO]: 1 } });
        await expect(resolver('resuelta')).rejects.toMatchObject({
            statusCode: 409, code: 'DESTINO_SIN_STOCK',
            message: `Obra ${OBRA_DESTINO} ya no tiene esas 3 unidades (hoy tiene 1): ajústalo a mano`,
        });
        expect(state.escrituras).toEqual([]);
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 1 });
        expect(state.discs[0].estado).toBe('pendiente');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    // Revisión 2026-10-21 [ALTA]: recibir() sube cantidad_decrementada aunque el GREATEST recorte. Si el origen no
    // tenía todo al despachar, aprobar el faltante devolvía unidades que nunca salieron (creaba stock).
    test('faltante con el origen corto al despachar (tenía 8 de 10): al origen vuelve solo lo que salió de más (1), con aviso', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 8 } });
        await recibir(7);
        expect(state.stock).toEqual({ [ORIGEN]: 0, [DESTINO]: 10 });
        expect(state.splits[0].decrementada).toBe(10);   // contabilizó 10 aunque salieron 8
        const totalAntes = 8;

        const r = await resolver('resuelta');
        expect(state.stock[DESTINO]).toBe(7);
        expect(state.stock[ORIGEN]).toBe(1);
        expect(state.stock[ORIGEN] + state.stock[DESTINO]).toBe(totalAntes);   // no se crea stock
        expect(state.splits[0].decrementada).toBe(9);                           // baja solo lo que vuelve
        expect(r.ajustes).toEqual([
            { ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, obra_id: null, bodega_id: BODEGA_ORIGEN, antes: 0, despues: 1, cantidad: 1 },
            { ubicacion_nombre: `Obra ${OBRA_DESTINO}`, obra_id: OBRA_DESTINO, bodega_id: null, antes: 10, despues: 7, cantidad: -3 },
        ]);
        expect(r.aviso).toBe('Al origen vuelve solo 1 de las 3 unidades: el origen no tenía esas unidades al despachar (salieron 8 de las 10 enviadas).');
        expect(JSON.parse(state.discs[0].ajuste_stock).aviso).toBe(r.aviso);
    });

    test('faltante con el origen en 0 al despachar (sin fila de salida en el kardex, sí de entrada): no vuelve nada', async () => {
        const { state } = setup({ stock: { [ORIGEN]: 0 } });
        await recibir(7);
        expect(kardexDe(state, 'transferencia_salida')).toHaveLength(0);
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 0, [DESTINO]: 7 });
        expect(state.splits[0].decrementada).toBe(10);
        expect(r.ajustes).toEqual([expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad: -3 })]);
        expect(r.aviso).toBe('Al origen no vuelve ninguna de las 3 unidades: el origen no tenía esas unidades al despachar (salieron 0 de las 10 enviadas).');
    });

    test('faltante multi-split con un split corto: vuelve lo que salió de más, en orden INVERSO y sin pasar de lo que salió de cada ubicación', async () => {
        // split A (bodega) 6 de 6 con stock; split B (obra) solo tenía 1 de 4 → salieron 7; declara 5 → vuelven 2 (no 5).
        // B perdió 1: recupera 1 (no 2); el otro vuelve a A.
        const { state } = setup({
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 0 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 0 }],
            stock: { [ORIGEN]: 50, [SPLIT_B]: 1 },
        });
        await recibir(5);
        expect(state.stock).toEqual({ [ORIGEN]: 44, [SPLIT_B]: 0, [DESTINO]: 10 });
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 45, [SPLIT_B]: 1, [DESTINO]: 5 });
        expect(state.splits.map(s => s.decrementada)).toEqual([5, 3]);
        expect(r.aviso).toBe('Al origen vuelven solo 2 de las 5 unidades: el origen no tenía esas unidades al despachar (salieron 7 de las 10 enviadas).');
    });

    test('faltante multi-split con todo el stock: vuelve f completo, primero al último split', async () => {
        const { state } = setup({
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 0 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 0 }],
            stock: { [ORIGEN]: 50, [SPLIT_B]: 20 },
        });
        await recibir(5);
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 45, [SPLIT_B]: 20, [DESTINO]: 5 });
        expect(state.splits.map(s => s.decrementada)).toEqual([5, 0]);
        expect(r.aviso).toBeNull();
    });

    test('faltante de TRF legacy (stock_reconciliado=FALSE): el origen descontó lo enviado al aprobar → vuelve f completo', async () => {
        const { state } = setup({ trf: { stock_reconciliado: false }, splits: [], stock: { [ORIGEN]: 40 } });
        await recibir(7);
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 43, [DESTINO]: 7 });
        expect(r.aviso).toBeNull();
    });

    // Revisión 2026-10-21: kardex PARCIAL — un viaje anterior al kardex (26-may) y el resto con kardex. Antes solo se
    // contaba la salida del kardex (7) y no volvía nada al origen; ahora lo llevado al destino sin entrada (3) cuenta
    // como salido, igual que _descontadoDelOrigen.
    test('faltante con kardex parcial (primer viaje anterior al kardex): lo movido sin entrada cuenta como salido → vuelve f', async () => {
        // Viaje 1 (sin kardex): parcial de 3 → origen 50→47, destino 0→3, split decrementado 3.
        const { state } = setup({
            trf: { estado: 'recepcion_parcial' }, recibidaPrev: 3,
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 10, decrementada: 3 }],
            stock: { [ORIGEN]: 47, [DESTINO]: 3 },
        });
        // Viaje 2 (con kardex): total declara 5 → mueve el resto de lo enviado (7). Declarado 8 de 10 → faltante 2.
        await recibir(5);
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        expect(kardexDe(state, 'transferencia_salida').map(m => m.cantidad_anterior - m.cantidad_nueva)).toEqual([7]);
        expect(state.discs).toEqual([expect.objectContaining({ cantidad_enviada: 10, cantidad_recibida: 8 })]);

        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 42, [DESTINO]: 8 });
        expect(state.splits[0].decrementada).toBe(8);
        expect(r.aviso).toBeNull();
    });

    test('kardex parcial con el viaje con kardex corto: lo sin kardex se asume salido, lo del kardex cuenta lo real', async () => {
        // Viaje 1 sin kardex (3); viaje 2 total con el origen en 5 (de 7) → salieron 5 + 3 = 8 de 10. Declara 6 → f = 4,
        // vuelven 8 − 6 = 2.
        const { state } = setup({
            trf: { estado: 'recepcion_parcial' }, recibidaPrev: 3,
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 10, decrementada: 3 }],
            stock: { [ORIGEN]: 5, [DESTINO]: 3 },
        });
        await recibir(3);
        expect(state.stock).toEqual({ [ORIGEN]: 0, [DESTINO]: 10 });
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 2, [DESTINO]: 6 });
        expect(r.aviso).toBe('Al origen vuelven solo 2 de las 4 unidades: el origen no tenía esas unidades al despachar (salieron 8 de las 10 enviadas).');
    });

    test('fila rehecha (regla anterior, régimen nuevo) con kardex parcial: lo movido al destino es lo RECIBIDO', async () => {
        // Regla anterior: viaje 1 sin kardex (3) + viaje 2 total con kardex (4) → recibida 7 de 10, origen −7, destino +7.
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 7, diferencia_aplicada: 1, estado: 'pendiente' })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 10, decrementada: 7 }],
            stock: { [ORIGEN]: 43, [DESTINO]: 7 },
            kardex: [
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 47, cantidad_nueva: 43, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 3, cantidad_nueva: 7, referencia_tipo: 'transferencia', referencia_id: TRF },
            ],
        });
        await rehacer(false);   // faltante: origen −3 (split), destino +3 → como si hubiera llegado lo enviado
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        // Aprobar: salido = 4 (kardex) + 3 (sin entrada: 7 recibidas − 4) + 3 (rehacer) = 10 → vuelven las 3.
        const r = await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 43, [DESTINO]: 7 });
        expect(state.splits[0].decrementada).toBe(7);
        expect(r.aviso).toBeNull();
    });

    test('decimales: aprobar un faltante de 2,5 deja el texto con coma', async () => {
        const { state } = setup({ discs: [disc({ cantidad_recibida: 7.5 })], splits: [], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await resolver('resuelta');
        expect(state.stock[DESTINO]).toBe(7.5);
        expect(state.stock[ORIGEN]).toBe(42.5);
        expect(r.resolucion).toBe('Aprobada: llegaron 7,5 de 10 enviados');
    });

    test('resolucion escrita → se guarda tal cual (recortada) y va en el motivo del kardex (cortado a 255)', async () => {
        const { state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await resolver('resuelta', `  Contado de nuevo con bodega ${'x'.repeat(400)}  `);
        expect(r.resolucion.startsWith('Contado de nuevo con bodega')).toBe(true);
        expect(state.discs[0].resolucion).toBe(r.resolucion);
        kardexDe(state, 'discrepancia').forEach(m => {
            expect(m.motivo).toMatch(/· Contado de nuevo con bodega/);
            expect(m.motivo.length).toBe(255);
        });
    });

    test('una causa que llegue (modelo anterior) se ignora: aprueba igual', async () => {
        const { conn, state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await transferenciaService.resolverDiscrepancia(31, DAPHNE, 'resuelta', '', 'nunca_salio');
        expect(r).not.toHaveProperty('causa');
        expect(state.stock[DESTINO]).toBe(12);
        expect(sqls(conn).some(s => /causa/.test(s))).toBe(false);
    });

    test('si la fila se rehízo antes, aprobar conserva el registro del rehacer (ajuste_stock.rehecha)', async () => {
        const rehecha = { fecha: '2026-10-21T12:00:00.000Z', regimen: 'nuevo', ajustes: [{ cantidad: -2 }], aviso: null };
        const { state } = setup({ discs: [disc({ ajuste_stock: JSON.stringify({ ajustes: [], aviso: null, rehecha }) })], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await resolver('resuelta');
        expect(JSON.parse(state.discs[0].ajuste_stock)).toEqual({ ajustes: r.ajustes, aviso: null, rehecha });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DESCARTAR = rechazar lo declarado', () => {
    test('no mueve stock (queda lo enviado), texto generado y ajuste_stock vacío', async () => {
        const { conn, state } = setup({ stock: { [ORIGEN]: 50 } });
        await recibir(12);
        const antes = { ...state.stock };
        const movsAntes = state.movimientos.length;
        const r = await resolver('descartada');

        expect(r).toMatchObject({ id: 31, estado: 'descartada', resolucion: 'Rechazada: queda lo enviado (10)', ajustes: [], aviso: null, transferencia_id: TRF, simulado: false });
        expect(state.stock).toEqual(antes);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.movimientos).toHaveLength(movsAntes);
        expect(state.discs[0]).toMatchObject({ estado: 'descartada', resuelto_por: DAPHNE });
        expect(JSON.parse(state.discs[0].ajuste_stock)).toEqual({ ajustes: [], aviso: null });
        // tras la recepción, la resolución no toca ubicaciones_stock
        const desde = conn.query.mock.calls.findIndex(([s]) => /FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/.test(s));
        expect(sqls(conn).slice(desde).some(s => /ubicaciones_stock|stock_movimientos|transferencia_item_origenes/.test(s))).toBe(false);
    });

    test('con nota → guarda la nota', async () => {
        const { state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await resolver('descartada', '  Bodega digitó 12 por error  ');
        expect(r.resolucion).toBe('Bodega digitó 12 por error');
        expect(state.discs[0].resolucion).toBe('Bodega digitó 12 por error');
    });

    test('nota vacía o solo espacios → texto generado', async () => {
        setup({ discs: [disc({ cantidad_recibida: 7 })], stock: { [DESTINO]: 10 } });
        await expect(resolver('descartada', '   ')).resolves.toMatchObject({ resolucion: 'Rechazada: queda lo enviado (10)' });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('guardas de resolver/descartar', () => {
    test.each([1, true, null])('descartar una diferencia de la regla anterior (diferencia_aplicada=%p) → 409 REGLA_ANTIGUA sin escribir', async (aplicada) => {
        const { conn, state } = setup({ discs: [disc({ diferencia_aplicada: aplicada })], stock: { [ORIGEN]: 40, [DESTINO]: 12 } });
        await expect(resolver('descartada')).rejects.toMatchObject({
            statusCode: 409, code: 'REGLA_ANTIGUA',
            message: 'Esta diferencia es de la regla anterior (ya está en el stock): para rechazarla primero hay que rehacerla',
        });
        expect(state.escrituras).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
    });

    // Revisión 2026-10-21 [MEDIA]: lo declarado ya está en el stock (regla anterior) → aprobar cierra sin mover stock.
    test.each([1, true, null])('aprobar una diferencia de la regla anterior (diferencia_aplicada=%p) la cierra SIN mover stock', async (aplicada) => {
        const { conn, state } = setup({ discs: [disc({ diferencia_aplicada: aplicada })], stock: { [ORIGEN]: 38, [DESTINO]: 12 } });
        const r = await resolver('resuelta');
        expect(r).toMatchObject({
            estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados', ajustes: [],
            aviso: 'Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock', simulado: false,
            cerrada_regla_anterior: true,   // la UI lo muestra como información
        });
        expect(state.stock).toEqual({ [ORIGEN]: 38, [DESTINO]: 12 });
        expect(state.movimientos).toHaveLength(0);
        expect(state.discs[0]).toMatchObject({ estado: 'resuelta', resuelto_por: DAPHNE, diferencia_aplicada: aplicada });
        expect(JSON.parse(state.discs[0].ajuste_stock)).toEqual({ ajustes: [], aviso: r.aviso });
        expect(sqls(conn).some(s => /ubicaciones_stock|transferencia_item_origenes/.test(s))).toBe(false);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('diferencia_aplicada=false (boolean del typeCast) es regla nueva', async () => {
        setup({ discs: [disc({ diferencia_aplicada: false })], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await resolver('resuelta');
        expect(r).toMatchObject({ estado: 'resuelta' });
        // cerrada_regla_anterior solo viene (true) al cerrar una de la regla anterior
        expect(r).not.toHaveProperty('cerrada_regla_anterior');
    });

    test('ya resuelta → 409 NO_PENDIENTE sin escribir', async () => {
        const { conn, state } = setup({ discs: [disc({ estado: 'resuelta' })] });
        await expect(resolver('descartada')).rejects.toMatchObject({ statusCode: 409, code: 'NO_PENDIENTE' });
        expect(state.escrituras).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('no existe → 404', async () => {
        setup({ discs: [] });
        await expect(resolver('resuelta')).rejects.toMatchObject({ statusCode: 404 });
    });

    test('estado inválido → 400 sin abrir transacción', async () => {
        setup({ discs: [disc()] });
        await expect(resolver('aprobada')).rejects.toMatchObject({ statusCode: 400 });
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('fallo a mitad de camino (kardex) → rollback, sin commit, sin marcar resuelta', async () => {
        const { conn } = setup({
            discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 },
            failOn: /INSERT INTO stock_movimientos/, failError: new Error('ER_LOCK_DEADLOCK simulado'),
        });
        await expect(resolver('resuelta')).rejects.toThrow('ER_LOCK_DEADLOCK simulado');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
        expect(sqls(conn).some(s => /UPDATE transferencia_discrepancias/.test(s))).toBe(false);
    });

    test('sin la mig 130 (1054 de diferencia_aplicada) → 409 MIGRACION_PENDIENTE', async () => {
        const { conn } = setup({ discs: [disc()], failOn: /FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/, failError: err1054('diferencia_aplicada') });
        await expect(resolver('descartada')).rejects.toMatchObject({ statusCode: 409, code: 'MIGRACION_PENDIENTE', message: expect.stringMatching(/migración 130/) });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('un 1054 de otra columna sale como error real', async () => {
        setup({ discs: [disc({ cantidad_recibida: 7 })], stock: { [ORIGEN]: 40, [DESTINO]: 10 }, failOn: /FROM transferencia_item_origenes/, failError: err1054('cantidad_decrementada') });
        await expect(resolver('resuelta')).rejects.not.toMatchObject({ code: 'MIGRACION_PENDIENTE' });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Revisión 2026-10-21 [MEDIA]: PUT /resolver?simular=1 corre la misma lógica sin escribir y devuelve lo que pasaría.
describe('SIMULAR resolver/descartar', () => {
    const simularResolver = (estado = 'resuelta', id = 31) => transferenciaService.resolverDiscrepancia(id, DAPHNE, estado, '', { simular: true });

    test('aprobar un sobrante: ajustes con antes/después, bloqueo null, sin escribir y con rollback', async () => {
        const { conn, state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await simularResolver('resuelta');
        expect(r).toEqual({
            id: 31, estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados',
            ajustes: [
                { ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, obra_id: null, bodega_id: BODEGA_ORIGEN, antes: 40, despues: 38, cantidad: -2 },
                { ubicacion_nombre: `Obra ${OBRA_DESTINO}`, obra_id: OBRA_DESTINO, bodega_id: null, antes: 10, despues: 12, cantidad: 2 },
            ],
            aviso: null, bloqueo: null, simulado: true,
            transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001',
            item: { id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' },
        });
        expect(state.escrituras).toEqual([]);
        expect(state.movimientos).toHaveLength(0);
        expect(state.discs[0]).toMatchObject({ estado: 'pendiente', ajuste_stock: null });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        // mismos bloqueos que el real
        expect(sqls(conn).filter(s => /SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/.test(s))).toHaveLength(2);
    });

    test('aprobar un faltante simulado no toca los splits; el real después aplica lo mismo', async () => {
        const base = { discs: [disc({ cantidad_recibida: 7 })], stock: { [ORIGEN]: 40, [DESTINO]: 10 }, splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 10, decrementada: 10 }] };
        const { state } = setup(base);
        const sim = await simularResolver('resuelta');
        expect(state.splits[0].decrementada).toBe(10);
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        const real = await resolver('resuelta');
        expect(real.ajustes).toEqual(sim.ajustes);
        expect(real.aviso).toEqual(sim.aviso);
        expect(state.stock).toEqual({ [ORIGEN]: 43, [DESTINO]: 7 });
        expect(state.splits[0].decrementada).toBe(7);
    });

    test('faltante con el destino insuficiente → 200 con bloqueo DESTINO_SIN_STOCK (en real sería 409), sin escribir', async () => {
        const { conn, state } = setup({ discs: [disc({ cantidad_recibida: 7 })], stock: { [ORIGEN]: 40, [DESTINO]: 1 } });
        const r = await simularResolver('resuelta');
        expect(r).toMatchObject({
            id: 31, estado: 'resuelta', ajustes: [], aviso: null, simulado: true, transferencia_id: TRF,
            bloqueo: { code: 'DESTINO_SIN_STOCK', message: `Obra ${OBRA_DESTINO} ya no tiene esas 3 unidades (hoy tiene 1): ajústalo a mano` },
        });
        expect(state.escrituras).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    test('descartar simulado → ajustes [] y texto generado, sin escribir', async () => {
        const { state } = setup({ discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await simularResolver('descartada');
        expect(r).toMatchObject({ estado: 'descartada', resolucion: 'Rechazada: queda lo enviado (10)', ajustes: [], aviso: null, bloqueo: null, simulado: true });
        expect(state.escrituras).toEqual([]);
        expect(state.discs[0].estado).toBe('pendiente');
    });

    test.each([
        ['descartar la regla anterior', 'descartada', { diferencia_aplicada: 1 }, 'REGLA_ANTIGUA'],
        ['una ya resuelta', 'resuelta', { estado: 'resuelta' }, 'NO_PENDIENTE'],
    ])('%s → bloqueo %s (200)', async (_, estado, over, code) => {
        const { state } = setup({ discs: [disc(over)], stock: { [ORIGEN]: 40, [DESTINO]: 10 } });
        const r = await simularResolver(estado);
        expect(r.bloqueo).toMatchObject({ code });
        expect(r.ajustes).toEqual([]);
        expect(state.escrituras).toEqual([]);
    });

    test('aprobar la regla anterior simulado → sin ajustes y con el aviso de cierre', async () => {
        setup({ discs: [disc({ diferencia_aplicada: 1 })], stock: { [ORIGEN]: 38, [DESTINO]: 12 } });
        const r = await simularResolver('resuelta');
        expect(r).toMatchObject({
            ajustes: [], bloqueo: null, aviso: 'Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock',
            cerrada_regla_anterior: true,
        });
    });

    test('404 y estado inválido siguen siendo error al simular', async () => {
        setup({ discs: [] });
        await expect(simularResolver('resuelta')).rejects.toMatchObject({ statusCode: 404 });
        await expect(simularResolver('aprobada')).rejects.toMatchObject({ statusCode: 400 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('REHACER diferencias de la regla anterior (Super Admin)', () => {
    // Estado que dejó la regla anterior en régimen nuevo: recibir() movió lo RECIBIDO (12 de 10 enviados):
    // split 50→40 + fallback del origen primario 40→38; destino 0→12.
    const sobranteViejo = (over = {}) => setup({
        discs: [disc({ diferencia_aplicada: 1, estado: 'resuelta', resolucion: 'ok viejo', resuelto_por: 3, observacion: 'Llegaron 2 de más' })],
        splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 10, decrementada: 10 }],
        stock: { [ORIGEN]: 38, [DESTINO]: 12 },
        kardex: [
            { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 50, cantidad_nueva: 40, referencia_tipo: 'transferencia', referencia_id: TRF },
            { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 40, cantidad_nueva: 38, referencia_tipo: 'transferencia', referencia_id: TRF },
            { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 12, referencia_tipo: 'transferencia', referencia_id: TRF },
        ],
        ...over,
    });

    test('simular=1 (régimen nuevo, sobrante): devuelve el plan con antes/después y NO escribe nada', async () => {
        const { conn, state } = sobranteViejo();
        const r = await rehacer(true);

        expect(r).toEqual({
            id: 31, transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001',
            item: { id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' },
            enviada: 10, recibida: 12, dif: 2, regimen: 'nuevo',
            ajustes: [
                { ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, obra_id: null, bodega_id: BODEGA_ORIGEN, antes: 38, despues: 40, cantidad: 2 },
                { ubicacion_nombre: `Obra ${OBRA_DESTINO}`, obra_id: OBRA_DESTINO, bodega_id: null, antes: 12, despues: 10, cantidad: -2 },
            ],
            aviso: null, estado_anterior: 'resuelta', simulado: true,
        });
        expect(state.escrituras).toEqual([]);
        expect(state.stock).toEqual({ [ORIGEN]: 38, [DESTINO]: 12 });
        expect(state.discs[0]).toMatchObject({ estado: 'resuelta', diferencia_aplicada: 1 });
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        // se bloquea igual que el real
        expect(sqls(conn).filter(s => /SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/.test(s))).toHaveLength(2);
    });

    test('real (régimen nuevo, sobrante): stock como si hubiera llegado lo enviado y la fila vuelve a pendiente de la regla nueva', async () => {
        const { conn, state } = sobranteViejo();
        const r = await rehacer(false);

        expect(r.simulado).toBe(false);
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        const d = state.discs[0];
        expect(d).toMatchObject({ estado: 'pendiente', diferencia_aplicada: 0, resolucion: null, resuelto_por: null });
        expect(d.observacion).toBe('Llegaron 2 de más\nResolución anterior (regla antigua): resuelta · ok viejo');
        const guardado = JSON.parse(d.ajuste_stock);
        expect(guardado).toMatchObject({ ajustes: [], aviso: null, rehecha: { regimen: 'nuevo', estado_anterior: 'resuelta', resolucion_anterior: 'ok viejo', ajustes: r.ajustes, usuario_id: 1 } });
        const movs = kardexDe(state, 'discrepancia');
        expect(movs).toHaveLength(2);
        movs.forEach(m => expect(m.motivo).toMatch(/^Rehecha con la regla nueva \(21-oct\): TRF-202610-0001/));
        expect(conn.commit).toHaveBeenCalled();
        // el UPDATE de la fila tiene guard contra la regla nueva
        expect(sqls(conn).find(s => /SET estado = 'pendiente', diferencia_aplicada = 0/.test(s))).toMatch(/NOT \(diferencia_aplicada <=> 0\)/);
    });

    test('rehacer y después aprobar deja lo declarado; rehacer y descartar deja lo enviado', async () => {
        const a = sobranteViejo();
        await rehacer(false);
        await resolver('resuelta');
        expect(a.state.stock).toEqual({ [ORIGEN]: 38, [DESTINO]: 12 });
        expect(JSON.parse(a.state.discs[0].ajuste_stock).rehecha).toBeTruthy();

        const b = sobranteViejo();
        await rehacer(false);
        await resolver('descartada');
        expect(b.state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
    });

    test('régimen nuevo, sobrante, recepción anterior al kardex → asume que el origen descontó lo recibido y avisa', async () => {
        const { state } = sobranteViejo({ kardex: [] });
        const r = await rehacer(false);
        expect(state.stock[ORIGEN]).toBe(40);
        expect(state.stock[DESTINO]).toBe(10);
        expect(r.aviso).toMatch(/anterior al kardex/);
    });

    test('régimen nuevo, sobrante, el origen no tenía todo al recibir (kardex muestra 9 salidas) → no le devuelve nada y avisa', async () => {
        const { state } = sobranteViejo({
            stock: { [ORIGEN]: 0, [DESTINO]: 12 },
            kardex: [
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 9, cantidad_nueva: 0, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 12, referencia_tipo: 'transferencia', referencia_id: TRF },
            ],
        });
        const r = await rehacer(false);
        expect(state.stock[ORIGEN]).toBe(0);
        expect(state.stock[DESTINO]).toBe(10);
        expect(r.ajustes).toEqual([expect.objectContaining({ obra_id: OBRA_DESTINO, cantidad: -2 })]);
        expect(r.aviso).toMatch(/1 unidad salió sin respaldo/);
    });

    // Revisión 2026-10-21: lo de más se mide POR UBICACIÓN. Antes, un split corto en OTRA ubicación (B) restaba del total
    // y al origen primario volvía menos de lo que de verdad perdió.
    test('régimen nuevo, sobrante multi-split con el split B corto: al origen primario vuelve TODO lo de más que salió de él', async () => {
        // Regla anterior, 13 de 10: split A (bodega) 6 → 50→44; split B (obra) 4 pero tenía 2 → 2→0; lo de más (3) del
        // origen primario (= A) 44→41. Destino 0→13.
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 13, diferencia_aplicada: 1, estado: 'pendiente' })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 6 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 4 }],
            stock: { [ORIGEN]: 41, [SPLIT_B]: 0, [DESTINO]: 13 },
            kardex: [
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 50, cantidad_nueva: 44, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_SPLIT, bodega_id: null, tipo: 'transferencia_salida', cantidad_anterior: 2, cantidad_nueva: 0, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 44, cantidad_nueva: 41, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 13, referencia_tipo: 'transferencia', referencia_id: TRF },
            ],
        });
        const r = await rehacer(false);
        // Antes: salidas 11 − enviada 10 = 1. Ahora: salidas en A (9) − lo que descontaron los splits de A (6) = 3.
        expect(state.stock).toEqual({ [ORIGEN]: 44, [SPLIT_B]: 0, [DESTINO]: 10 });
        expect(state.splits.map(s => s.decrementada)).toEqual([6, 4]);
        // El faltante de B (2 de 4) se avisa aparte: es lo enviado que salió sin respaldo.
        expect(r.aviso).toBe('Al recibir, el origen no tenía todo lo enviado: 2 unidades salieron sin respaldo (quedó en 0). Revisa su stock.');
    });

    test('régimen nuevo, sobrante con el origen primario corto en lo de más: vuelve solo lo que salió de más de él', async () => {
        // A (6) tenía 7: 7→1 por el split y 1→0 por lo de más (pidió 3) → de más salió 1.
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 13, diferencia_aplicada: 1, estado: 'pendiente' })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 6 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 4 }],
            stock: { [ORIGEN]: 0, [SPLIT_B]: 16, [DESTINO]: 13 },
            kardex: [
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 7, cantidad_nueva: 1, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_SPLIT, bodega_id: null, tipo: 'transferencia_salida', cantidad_anterior: 20, cantidad_nueva: 16, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 1, cantidad_nueva: 0, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 13, referencia_tipo: 'transferencia', referencia_id: TRF },
            ],
        });
        const r = await rehacer(false);
        expect(state.stock).toEqual({ [ORIGEN]: 1, [SPLIT_B]: 16, [DESTINO]: 10 });
        expect(r.aviso).toBeNull();
    });

    test('régimen nuevo, sobrante SIN splits: la base del origen primario es la enviada completa', async () => {
        // Sin splits recibir() sacó todo del origen primario. Tenía 8 de 12 → no salió nada de más (antes que lo enviado).
        const sinSplits = (stockOrigen, salieron) => setup({
            discs: [disc({ diferencia_aplicada: 1, estado: 'pendiente' })],
            splits: [],
            stock: { [ORIGEN]: stockOrigen - salieron, [DESTINO]: 12 },
            kardex: [
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: stockOrigen, cantidad_nueva: stockOrigen - salieron, referencia_tipo: 'transferencia', referencia_id: TRF },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 12, referencia_tipo: 'transferencia', referencia_id: TRF },
            ],
        });
        const corto = sinSplits(8, 8);
        const r1 = await rehacer(false);
        expect(corto.state.stock).toEqual({ [ORIGEN]: 0, [DESTINO]: 10 });
        expect(r1.aviso).toBe('Al recibir, el origen no tenía todo lo enviado: 2 unidades salieron sin respaldo (quedó en 0). Revisa su stock.');

        const completo = sinSplits(50, 12);
        await rehacer(false);
        expect(completo.state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
    });

    test('régimen nuevo, FALTANTE: el origen pierde lo que faltaba (saldos de splits FIFO) y el destino lo suma', async () => {
        // Regla anterior: recibió 7 de 10 → split A (6) entero + split B 1 de 4; destino +7.
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 7, diferencia_aplicada: 1, estado: 'pendiente' })],
            splits: [{ id: 700, obra: null, bodega: BODEGA_ORIGEN, enviada: 6, decrementada: 6 }, { id: 701, obra: OBRA_SPLIT, bodega: null, enviada: 4, decrementada: 1 }],
            stock: { [ORIGEN]: 44, [SPLIT_B]: 19, [DESTINO]: 7 },
        });
        const r = await rehacer(false);
        expect(r).toMatchObject({ regimen: 'nuevo', dif: -3, estado_anterior: 'pendiente' });
        expect(state.stock[SPLIT_B]).toBe(16);
        expect(state.stock[ORIGEN]).toBe(44);
        expect(state.stock[DESTINO]).toBe(10);
        expect(state.splits.map(s => s.decrementada)).toEqual([6, 4]);
        // estaba pendiente: no hay «resolución anterior» que guardar
        expect(state.discs[0].observacion).toBeNull();
        // y ahora se puede aprobar con la regla nueva (vuelve al split B)
        await resolver('resuelta');
        expect(state.stock).toEqual({ [ORIGEN]: 44, [SPLIT_B]: 19, [DESTINO]: 7 });
    });

    test('régimen nuevo, faltante con el origen sin stock → no baja de 0 y avisa; el destino suma igual', async () => {
        const { state } = setup({
            discs: [disc({ cantidad_recibida: 7, diferencia_aplicada: 1 })],
            splits: [],
            stock: { [ORIGEN]: 1, [DESTINO]: 7 },
        });
        const r = await rehacer(false);
        expect(state.stock[ORIGEN]).toBe(0);
        expect(state.stock[DESTINO]).toBe(10);
        expect(r.aviso).toMatch(/2 de las 3 unidades quedaron sin respaldo/);
    });

    test.each([
        ['stock_reconciliado=FALSE', { trf: { stock_reconciliado: false } }],
        ['sin eventos de recepción', { recepciones: 0 }],
    ])('régimen ANTERIOR (%s), sobrante: solo destino −dif; el origen no se toca', async (_, over) => {
        const { state } = setup({ discs: [disc({ diferencia_aplicada: 1 })], stock: { [ORIGEN]: 40, [DESTINO]: 12 }, ...over });
        const r = await rehacer(false);
        expect(r.regimen).toBe('anterior');
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        expect(r.ajustes).toEqual([{ ubicacion_nombre: `Obra ${OBRA_DESTINO}`, obra_id: OBRA_DESTINO, bodega_id: null, antes: 12, despues: 10, cantidad: -2 }]);
        expect(state.splits[0].decrementada).toBe(0);
    });

    test('régimen ANTERIOR, faltante: solo destino +f', async () => {
        const { state } = setup({ trf: { stock_reconciliado: false }, discs: [disc({ cantidad_recibida: 7, diferencia_aplicada: 1, estado: 'descartada', resolucion: null })], stock: { [ORIGEN]: 40, [DESTINO]: 7 } });
        const r = await rehacer(false);
        expect(r).toMatchObject({ regimen: 'anterior', dif: -3, estado_anterior: 'descartada' });
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 10 });
        expect(state.discs[0].observacion).toBe('Resolución anterior (regla antigua): descartada · sin nota');
    });

    // Revisión 2026-10-21 [MEDIA]: ya no es 409; el destino baja hasta 0 y el aviso dice cuántas no se pudieron quitar.
    test('sobrante con el destino sin esas unidades → el destino baja hasta 0 y avisa; la simulación lo muestra igual', async () => {
        const { conn, state } = sobranteViejo({ stock: { [ORIGEN]: 38, [DESTINO]: 1 } });
        const aviso = `Obra ${OBRA_DESTINO} no tenía esas unidades: no se pudieron quitar 1 de las 2 (quedó en 0). Revisa su stock.`;

        const sim = await rehacer(true);
        expect(sim.ajustes).toEqual([
            { ubicacion_nombre: `Bodega ${BODEGA_ORIGEN}`, obra_id: null, bodega_id: BODEGA_ORIGEN, antes: 38, despues: 40, cantidad: 2 },
            { ubicacion_nombre: `Obra ${OBRA_DESTINO}`, obra_id: OBRA_DESTINO, bodega_id: null, antes: 1, despues: 0, cantidad: -1 },
        ]);
        expect(sim.aviso).toBe(aviso);
        expect(state.escrituras).toEqual([]);

        const real = await rehacer(false);
        expect(real.ajustes).toEqual(sim.ajustes);
        expect(real.aviso).toBe(aviso);
        expect(state.stock).toEqual({ [ORIGEN]: 40, [DESTINO]: 0 });
        expect(state.discs[0]).toMatchObject({ estado: 'pendiente', diferencia_aplicada: 0 });
        expect(conn.commit).toHaveBeenCalledTimes(1);
    });

    // Revisión 2026-10-21 [BAJA]: avisar si alguien ajustó el ítem a mano después de la recepción.
    test('avisa los ajustes manuales posteriores a la recepción en el origen o el destino (no los de transferencias ni los anteriores)', async () => {
        const fechaRecepcion = new Date(2026, 9, 10, 15, 0);
        const mov = (over) => ({ item_id: ITEM, referencia_tipo: null, referencia_id: null, motivo: null, ...over });
        const { state } = sobranteViejo({
            trf: { fecha_recepcion: fechaRecepcion, estado: 'recibida' },
            usuarios: { 8: 'Daphne Soto' },
            responsables: { [BODEGA_ORIGEN]: 'Pedro' },
            kardex: [
                // de la recepción (esta TRF): no cuentan
                { item_id: ITEM, obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'transferencia_salida', cantidad_anterior: 50, cantidad_nueva: 38, referencia_tipo: 'transferencia', referencia_id: TRF, created_at: fechaRecepcion },
                { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 0, cantidad_nueva: 12, referencia_tipo: 'transferencia', referencia_id: TRF, created_at: fechaRecepcion },
                // antes de la recepción: no cuenta
                mov({ obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'ajuste_manual', cantidad_anterior: 3, cantidad_nueva: 0, usuario_id: 8, created_at: new Date(2026, 9, 1, 8, 0) }),
                // después, en el destino y en el origen: cuentan (a mano, y la 'discrepancia' de un conteo)
                mov({ obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'ajuste_manual', cantidad_anterior: 12, cantidad_nueva: 10, usuario_id: 8, created_at: new Date(2026, 9, 12, 10, 5) }),
                mov({ obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'discrepancia', cantidad_anterior: 38, cantidad_nueva: 39, referencia_tipo: 'discrepancia', referencia_id: 9, usuario_id: 99, created_at: new Date(2026, 9, 13, 9, 30) }),
                // Revisión 2026-10-21: la diferencia aprobada de OTRA transferencia en el mismo origen no corrige esta → no cuenta
                mov({ obra_id: null, bodega_id: BODEGA_ORIGEN, tipo: 'discrepancia', cantidad_anterior: 39, cantidad_nueva: 37, referencia_tipo: 'transferencia', referencia_id: 555, usuario_id: 8, created_at: new Date(2026, 9, 13, 11, 0) }),
                // después pero en otra ubicación o de otro tipo: no cuentan
                mov({ obra_id: 77, bodega_id: null, tipo: 'ajuste_manual', cantidad_anterior: 1, cantidad_nueva: 2, usuario_id: 8, created_at: new Date(2026, 9, 14, 9, 0) }),
                mov({ obra_id: OBRA_DESTINO, bodega_id: null, tipo: 'transferencia_entrada', cantidad_anterior: 10, cantidad_nueva: 15, referencia_tipo: 'transferencia', referencia_id: 600, created_at: new Date(2026, 9, 14, 9, 0) }),
            ],
            stock: { [ORIGEN]: 39, [DESTINO]: 15 },
        });
        const r = await rehacer(true);
        expect(r.aviso).toBe(
            'Hubo ajustes manuales después: 12-10-2026 10:05 Obra 9 12→10 (Daphne Soto); 13-10-2026 09:30 Bodega 2 (Pedro) 38→39. '
            + 'Puede que ya esté corregido: revísalo antes de rehacer.'
        );
        // la bodega con responsable se nombra como en el frontend: «nombre (responsable)»
        expect(r.ajustes[0].ubicacion_nombre).toBe(`Bodega ${BODEGA_ORIGEN} (Pedro)`);
        expect(state.escrituras).toEqual([]);
    });

    test('sin fecha_recepcion o sin ajustes posteriores → no hay aviso de ajustes manuales', async () => {
        sobranteViejo();
        const r = await rehacer(true);
        expect(r.aviso).toBeNull();
    });

    test('una fila de la regla nueva no se rehace → 409 YA_REGLA_NUEVA', async () => {
        const { state } = setup({ discs: [disc({ diferencia_aplicada: 0 })], stock: { [DESTINO]: 10 } });
        await expect(rehacer(false)).rejects.toMatchObject({ statusCode: 409, code: 'YA_REGLA_NUEVA' });
        expect(state.escrituras).toEqual([]);
    });

    test.each([
        ['causa elegida (mig 129)', { causa: 'error_conteo_recepcion', ajuste_stock: JSON.stringify({ ajustes: [], aviso: null }) }],
        ['ajuste_stock con ajustes', { ajuste_stock: JSON.stringify({ ajustes: [{ cantidad: -2 }], aviso: null }) }],
    ])('resuelta con el modelo de causas que ya ajustó el stock (%s) → 409 CON_AJUSTE', async (_, over) => {
        const { state } = setup({ discs: [disc({ diferencia_aplicada: 1, estado: 'resuelta', ...over })], stock: { [ORIGEN]: 40, [DESTINO]: 12 } });
        await expect(rehacer(true)).rejects.toMatchObject({ statusCode: 409, code: 'CON_AJUSTE' });
        expect(state.escrituras).toEqual([]);
    });

    test('no existe → 404', async () => {
        setup({ discs: [] });
        await expect(rehacer(true)).rejects.toMatchObject({ statusCode: 404 });
    });

    test('fallo al escribir → rollback, sin commit, la fila sigue de la regla anterior', async () => {
        const { conn, state } = sobranteViejo({ failOn: /INSERT INTO stock_movimientos/, failError: new Error('caída simulada') });
        await expect(rehacer(false)).rejects.toThrow('caída simulada');
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(state.discs[0].diferencia_aplicada).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET discrepancias: diferencia_aplicada y stock actual de origen/destino', () => {
    test('normaliza diferencia_aplicada, toma el origen primario de la última fila del ítem y trae stock y nombres', async () => {
        const ajuste = { ajustes: [{ obra_id: 9, bodega_id: null, ubicacion_nombre: 'Obra 9', cantidad: 2 }], aviso: null };
        db.query.mockImplementation(async (sql, p) => {
            sql = String(sql);
            if (/SELECT DISTINCT t\.id/.test(sql)) {
                return [[{ id: TRF, codigo: 'TRF-1', origen_obra_id: null, origen_bodega_id: BODEGA_ORIGEN, destino_obra_id: OBRA_DESTINO, destino_bodega_id: null }]];
            }
            if (/SELECT d\.\*/.test(sql)) {
                return [[
                    { id: 1, transferencia_id: TRF, item_id: ITEM, cantidad_enviada: '10.0000', cantidad_recibida: '12.0000', diferencia: '-2.0000', estado: 'pendiente', diferencia_aplicada: false, ajuste_stock: null },
                    { id: 2, transferencia_id: TRF, item_id: 6, cantidad_enviada: '5.0000', cantidad_recibida: '4.0000', diferencia: '1.0000', estado: 'pendiente', diferencia_aplicada: true, ajuste_stock: JSON.stringify(ajuste) },
                    { id: 3, transferencia_id: TRF, item_id: 7, cantidad_enviada: '5.0000', cantidad_recibida: '3.0000', diferencia: '2.0000', estado: 'resuelta', diferencia_aplicada: 1, ajuste_stock: '{roto' },
                    { id: 4, transferencia_id: TRF, item_id: 8, cantidad_enviada: '5.0000', cantidad_recibida: '6.0000', diferencia: '-1.0000', estado: 'pendiente' },
                    // la columna existe pero viene NULL → regla antigua (true), igual que el service
                    { id: 5, transferencia_id: TRF, item_id: 8, cantidad_enviada: '5.0000', cantidad_recibida: '6.0000', diferencia: '-1.0000', estado: 'pendiente', diferencia_aplicada: null },
                ]];
            }
            if (/FROM transferencia_items ti/.test(sql)) {
                // ítem 5: el origen primario es la obra del split (pisa a la cabecera); ítem 6 sin origen propio → cabecera
                return [[
                    { transferencia_id: TRF, item_id: ITEM, origen_obra_id: OBRA_SPLIT, origen_bodega_id: null },
                    { transferencia_id: TRF, item_id: 6, origen_obra_id: null, origen_bodega_id: null },
                ]];
            }
            if (/FROM ubicaciones_stock WHERE item_id IN/.test(sql)) {
                expect(p[0]).toEqual([ITEM, 6, 7, 8]);
                return [[
                    { item_id: ITEM, obra_id: OBRA_SPLIT, bodega_id: null, cantidad: '16.0000' },
                    { item_id: ITEM, obra_id: OBRA_DESTINO, bodega_id: null, cantidad: '10.0000' },
                    { item_id: 6, obra_id: null, bodega_id: BODEGA_ORIGEN, cantidad: '3.5000' },
                ]];
            }
            if (/FROM obras WHERE id IN/.test(sql)) return [p[0].map(id => ({ id, nombre: `Obra ${id}` }))];
            if (/FROM bodegas WHERE id IN/.test(sql)) return [p[0].map(id => ({ id, nombre: `Bodega ${id}` }))];
            if (/COUNT\(DISTINCT t\.id\)/.test(sql)) return [[{ total: 1 }]];
            return [[]];
        });

        const r = await transferenciaService.getDiscrepancias({});
        const t = r.data[0];
        expect(t).toMatchObject({ origen_bodega_id: BODEGA_ORIGEN, destino_obra_id: OBRA_DESTINO });
        const [d1, d2, d3, d4, d5] = t.discrepancias;
        expect(d1).toMatchObject({
            diferencia_aplicada: false, cantidad_recibida: 12, diferencia: -2, ajuste_stock: null,
            origen_nombre: `Obra ${OBRA_SPLIT}`, origen_stock_actual: 16,
            destino_nombre: `Obra ${OBRA_DESTINO}`, destino_stock_actual: 10,
        });
        expect(d1).not.toHaveProperty('causa');
        expect(d2).toMatchObject({ diferencia_aplicada: true, ajuste_stock: ajuste, origen_nombre: `Bodega ${BODEGA_ORIGEN}`, origen_stock_actual: 3.5, destino_stock_actual: 0 });
        expect(d3).toMatchObject({ diferencia_aplicada: true, ajuste_stock: null, origen_nombre: `Bodega ${BODEGA_ORIGEN}`, origen_stock_actual: 0 });
        expect(d4).toMatchObject({ diferencia_aplicada: null });   // sin la columna (mig 130 sin aplicar)
        expect(d5).toMatchObject({ diferencia_aplicada: true });
    });

    test('tolera que las queries de stock/nombres no traigan nada', async () => {
        db.query.mockImplementation(async (sql) => {
            sql = String(sql);
            if (/SELECT DISTINCT t\.id/.test(sql)) return [[{ id: TRF, codigo: 'TRF-1', origen_bodega_id: BODEGA_ORIGEN, destino_obra_id: OBRA_DESTINO }]];
            if (/SELECT d\.\*/.test(sql)) return [[{ id: 1, transferencia_id: TRF, item_id: ITEM, cantidad_enviada: '10', cantidad_recibida: '12', diferencia: '-2', estado: 'pendiente', diferencia_aplicada: 0 }]];
            if (/COUNT\(DISTINCT t\.id\)/.test(sql)) return [[{ total: 1 }]];
            return [[]];
        });
        const r = await transferenciaService.getDiscrepancias({ estado: 'pendiente' });
        expect(r.data[0].discrepancias[0]).toMatchObject({
            diferencia_aplicada: false, origen_stock_actual: 0, destino_stock_actual: 0, origen_nombre: null, destino_nombre: null,
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('eliminar una diferencia', () => {
    const eliminarDisc = (id = 31) => transferenciaService.eliminarDiscrepancia(id, 1);

    test.each([
        ['ajustó stock al aprobarse', { estado: 'resuelta', diferencia_aplicada: false, ajuste_stock: JSON.stringify({ ajustes: [{ cantidad: -2 }], aviso: null }) }],
        ['se rehízo (pendiente)', { estado: 'pendiente', diferencia_aplicada: false, ajuste_stock: JSON.stringify({ ajustes: [], aviso: null, rehecha: { ajustes: [{ cantidad: 2 }] } }) }],
    ])('no se elimina si %s → 409 CON_AJUSTE, sin DELETE y con rollback', async (_, fila) => {
        const { conn, state } = setup({ discs: [disc(fila)] });
        await expect(eliminarDisc()).rejects.toMatchObject({ statusCode: 409, code: 'CON_AJUSTE' });
        expect(state.escrituras).toEqual([]);
        expect(state.discs).toHaveLength(1);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('pendiente de la regla anterior (su diferencia ya está en el stock) → 409 REGLA_ANTIGUA', async () => {
        const { state } = setup({ discs: [disc({ estado: 'pendiente', diferencia_aplicada: true })] });
        await expect(eliminarDisc()).rejects.toMatchObject({
            statusCode: 409, code: 'REGLA_ANTIGUA',
            message: 'Esta diferencia es de la regla anterior y ya está en el stock: primero apruébala (se cierra sin mover stock) o pide que la rehagan.',
        });
        expect(state.discs).toHaveLength(1);
    });

    test('pendiente de la regla anterior: aprobarla (se cierra sin mover stock) y después sí se elimina', async () => {
        const { state } = setup({ discs: [disc({ estado: 'pendiente', diferencia_aplicada: 1 })], stock: { [ORIGEN]: 38, [DESTINO]: 12 } });
        await resolver('resuelta');
        await expect(eliminarDisc()).resolves.toEqual({ id: 31 });
        expect(state.discs).toEqual([]);
        expect(state.stock).toEqual({ [ORIGEN]: 38, [DESTINO]: 12 });
    });

    test.each([
        ['descartada de la regla nueva', { estado: 'descartada', diferencia_aplicada: false, ajuste_stock: JSON.stringify({ ajustes: [], aviso: null }) }],
        ['pendiente de la regla nueva', { estado: 'pendiente', diferencia_aplicada: false, ajuste_stock: null }],
        ['resuelta de la regla anterior', { estado: 'resuelta', diferencia_aplicada: true, ajuste_stock: null }],
        ['aprobada de la regla anterior sin mover stock', { estado: 'resuelta', diferencia_aplicada: true, ajuste_stock: JSON.stringify({ ajustes: [], aviso: 'Regla anterior: …' }) }],
    ])('sí se elimina: %s', async (_, fila) => {
        const { conn, state } = setup({ discs: [disc(fila)] });
        await expect(eliminarDisc()).resolves.toEqual({ id: 31 });
        expect(state.discs).toEqual([]);
        expect(conn.commit).toHaveBeenCalled();
    });

    // Revisión 2026-10-21 [BAJA]: sin TOCTOU — la guarda lee la fila bloqueada y el DELETE va en la misma transacción.
    test('bloquea la fila (FOR UPDATE) antes de las guardas y borra dentro de la misma transacción', async () => {
        const { conn } = setup({ discs: [disc({ estado: 'descartada' })] });
        await eliminarDisc();
        const s = sqls(conn);
        expect(conn.beginTransaction).toHaveBeenCalled();
        expect(s[0]).toMatch(/FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/);
        expect(s[1]).toMatch(/DELETE FROM transferencia_discrepancias WHERE id = \?/);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
        expect(db.query).not.toHaveBeenCalled();
    });

    test('no existe → 404 con rollback', async () => {
        const { conn } = setup({ discs: [] });
        await expect(eliminarDisc()).rejects.toMatchObject({ statusCode: 404 });
        expect(conn.rollback).toHaveBeenCalled();
    });

    test('sin las columnas nuevas (1054) cae a SELECT más simples y elimina', async () => {
        const e1054 = Object.assign(new Error("Unknown column 'diferencia_aplicada'"), { errno: 1054 });
        const conn = {
            beginTransaction: jest.fn().mockResolvedValue(undefined), commit: jest.fn().mockResolvedValue(undefined),
            rollback: jest.fn().mockResolvedValue(undefined), release: jest.fn(),
            query: jest.fn()
                .mockRejectedValueOnce(e1054)
                .mockRejectedValueOnce(e1054)
                .mockResolvedValueOnce([[{ id: 31, transferencia_id: TRF, estado: 'pendiente' }]])
                .mockResolvedValue([{ affectedRows: 1 }]),
        };
        db.getConnection.mockResolvedValue(conn);
        await expect(transferenciaService.eliminarDiscrepancia(31, 1)).resolves.toEqual({ id: 31 });
        expect(conn.query.mock.calls[2][0]).toMatch(/SELECT id, transferencia_id, estado FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/);
        expect(conn.commit).toHaveBeenCalled();
    });
});

// Revisión 2026-10-21 [BAJA]: borrar la TRANSFERENCIA ya no se lleva en silencio (CASCADE) diferencias que movieron stock.
describe('eliminar la transferencia con diferencias', () => {
    test.each([
        ['una diferencia aprobada que ajustó stock', { estado: 'resuelta', ajuste_stock: JSON.stringify({ ajustes: [{ cantidad: 2 }], aviso: null }) }, 'CON_AJUSTE',
            'TRF-202610-0001 tiene una diferencia que ya ajustó el stock: no se puede eliminar (el ajuste quedaría sin su registro).'],
        ['una rehecha', { estado: 'pendiente', ajuste_stock: JSON.stringify({ ajustes: [], aviso: null, rehecha: { ajustes: [{ cantidad: -2 }] } }) }, 'CON_AJUSTE',
            'TRF-202610-0001 tiene una diferencia que ya ajustó el stock: no se puede eliminar (el ajuste quedaría sin su registro).'],
        ['una pendiente de la regla anterior', { estado: 'pendiente', diferencia_aplicada: 1 }, 'REGLA_ANTIGUA',
            'TRF-202610-0001 tiene una diferencia pendiente de la regla anterior (ya está en el stock): primero apruébala (se cierra sin mover stock) o pide que la rehagan.'],
    ])('con %s → 409 %s, sin DELETE', async (_, over, code, message) => {
        const { conn, state } = setup({ trf: { estado: 'recibida' }, discs: [disc({ id: 30, estado: 'descartada' }), disc(over)] });
        await expect(transferenciaService.eliminar(TRF, 1)).rejects.toMatchObject({ statusCode: 409, code, message });
        expect(state.trfBorrada).toBe(false);
        expect(state.escrituras).toEqual([]);
        expect(conn.rollback).toHaveBeenCalled();
        // las diferencias se leen bloqueadas, después de la transferencia
        const s = sqls(conn);
        expect(s[0]).toMatch(/FROM transferencias WHERE id = \? FOR UPDATE/);
        expect(s[1]).toMatch(/FROM transferencia_discrepancias WHERE transferencia_id = \? FOR UPDATE/);
    });

    test('varias → el mensaje las cuenta', async () => {
        const conAjuste = { estado: 'resuelta', ajuste_stock: JSON.stringify({ ajustes: [{ cantidad: 2 }], aviso: null }) };
        setup({ discs: [disc({ id: 30, ...conAjuste }), disc({ id: 31, ...conAjuste })] });
        await expect(transferenciaService.eliminar(TRF, 1)).rejects.toMatchObject({
            message: expect.stringMatching(/^TRF-202610-0001 tiene 2 diferencias que ya ajustaron el stock/),
        });
    });

    test('varias pendientes de la regla anterior → plural y el consejo de aprobarlas o pedir que las rehagan', async () => {
        setup({ discs: [disc({ id: 30, diferencia_aplicada: 1 }), disc({ id: 31, diferencia_aplicada: null })] });
        await expect(transferenciaService.eliminar(TRF, 1)).rejects.toMatchObject({
            statusCode: 409, code: 'REGLA_ANTIGUA',
            message: 'TRF-202610-0001 tiene 2 diferencias pendientes de la regla anterior (ya están en el stock): primero apruébalas (se cierran sin mover stock) o pide que las rehagan.',
        });
    });

    test.each([
        ['sin diferencias', []],
        ['con diferencias que no movieron stock', [
            disc({ id: 30, estado: 'descartada', ajuste_stock: JSON.stringify({ ajustes: [], aviso: null }) }),
            disc({ id: 31, estado: 'pendiente' }),
            disc({ id: 32, estado: 'resuelta', diferencia_aplicada: 1 }),
        ]],
    ])('%s → se elimina', async (_, discs) => {
        const { conn, state } = setup({ discs });
        await expect(transferenciaService.eliminar(TRF, 1)).resolves.toMatchObject({ id: TRF, codigo: 'TRF-202610-0001' });
        expect(state.trfBorrada).toBe(true);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('sin las columnas de las mig 129/130 cae a menos columnas y elimina', async () => {
        const { conn, state } = setup({
            discs: [disc({ id: 30 })],
            failOn: /SELECT id, estado, ajuste_stock(, diferencia_aplicada)? FROM transferencia_discrepancias/,
            failError: err1054('ajuste_stock'),
        });
        await expect(transferenciaService.eliminar(TRF, 1)).resolves.toMatchObject({ id: TRF });
        expect(sqls(conn).some(s => /SELECT id, estado FROM transferencia_discrepancias WHERE transferencia_id = \? FOR UPDATE/.test(s))).toBe(true);
        expect(state.trfBorrada).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Revisión 2026-10-21: un choque con otra transacción (deadlock 1213 / lock wait 1205) ya no sale como 500 con el
// texto de MySQL: 409 REINTENTAR con un mensaje que se entiende, y rollback.
describe('choque con otra transacción → 409 REINTENTAR', () => {
    const deadlock = () => Object.assign(new Error('Deadlock found when trying to get lock; try restarting transaction'), {
        errno: 1213, code: 'ER_LOCK_DEADLOCK', sqlMessage: 'Deadlock found when trying to get lock; try restarting transaction',
    });
    const lockWait = () => Object.assign(new Error('Lock wait timeout exceeded; try restarting transaction'), {
        errno: 1205, code: 'ER_LOCK_WAIT_TIMEOUT', sqlMessage: 'Lock wait timeout exceeded; try restarting transaction',
    });
    const REINTENTAR = { statusCode: 409, code: 'REINTENTAR', message: 'Otra persona está trabajando en esta solicitud: reintenta en unos segundos' };

    test.each([['deadlock (1213)', deadlock], ['lock wait (1205)', lockWait]])('resolver: %s al bloquear el stock → 409 REINTENTAR con rollback', async (_, fallo) => {
        const { conn, state } = setup({
            discs: [disc()], stock: { [ORIGEN]: 40, [DESTINO]: 10 },
            failOn: /SELECT cantidad FROM ubicaciones_stock[\s\S]*FOR UPDATE/, failError: fallo(),
        });
        await expect(resolver('resuelta')).rejects.toMatchObject(REINTENTAR);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(state.discs[0].estado).toBe('pendiente');
    });

    test('resolver SIMULADO: REINTENTAR no es un bloqueo (es pasajero) → sale como 409, no como `bloqueo`', async () => {
        setup({ discs: [disc()], failOn: /FROM transferencia_discrepancias WHERE id = \? FOR UPDATE/, failError: deadlock() });
        await expect(transferenciaService.resolverDiscrepancia(31, DAPHNE, 'resuelta', '', { simular: true })).rejects.toMatchObject(REINTENTAR);
    });

    test.each([[false], [true]])('rehacer (simular=%p): lock wait → 409 REINTENTAR con rollback', async (simular) => {
        const { conn, state } = setup({
            discs: [disc({ diferencia_aplicada: 1 })], stock: { [ORIGEN]: 40, [DESTINO]: 12 },
            failOn: /FROM transferencias WHERE id = \? FOR UPDATE/, failError: lockWait(),
        });
        await expect(rehacer(simular)).rejects.toMatchObject(REINTENTAR);
        expect(conn.rollback).toHaveBeenCalled();
        expect(state.discs[0].diferencia_aplicada).toBe(1);
    });

    test('eliminar una diferencia: deadlock en el DELETE → 409 REINTENTAR con rollback', async () => {
        const { conn, state } = setup({
            discs: [disc({ estado: 'descartada' })],
            failOn: /DELETE FROM transferencia_discrepancias/, failError: deadlock(),
        });
        await expect(transferenciaService.eliminarDiscrepancia(31, 1)).rejects.toMatchObject(REINTENTAR);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(state.discs).toHaveLength(1);
    });

    test('eliminar la transferencia: deadlock al leer sus diferencias → 409 REINTENTAR con rollback', async () => {
        const { conn, state } = setup({
            discs: [disc({ estado: 'descartada' })],
            failOn: /FROM transferencia_discrepancias WHERE transferencia_id = \? FOR UPDATE/, failError: deadlock(),
        });
        await expect(transferenciaService.eliminar(TRF, 1)).rejects.toMatchObject(REINTENTAR);
        expect(conn.rollback).toHaveBeenCalled();
        expect(state.trfBorrada).toBe(false);
    });

    test('otro error de MySQL (no es de locks) sigue saliendo tal cual', async () => {
        const otro = Object.assign(new Error('Duplicate entry'), { errno: 1062, code: 'ER_DUP_ENTRY' });
        setup({ discs: [disc({ estado: 'descartada' })], failOn: /DELETE FROM transferencia_discrepancias/, failError: otro });
        await expect(transferenciaService.eliminarDiscrepancia(31, 1)).rejects.toBe(otro);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('rutas: PUT /discrepancias/:id/resolver y POST /discrepancias/:id/rehacer', () => {
    const app = require('../index');
    const SECRET = process.env.JWT_SECRET || 'secret';
    const tokenDe = (rol_id, p = ['inventario.transferencias.aprobar']) => jwt.sign({ id: DAPHNE, email: 'daphne@lols.cl', rol_id, rv: 1, p }, SECRET);
    let spyResolver;
    let spyRehacer;
    beforeEach(() => {
        spyResolver = jest.spyOn(transferenciaService, 'resolverDiscrepancia')
            .mockResolvedValue({ id: 31, estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados', ajustes: [], aviso: null });
        spyRehacer = jest.spyOn(transferenciaService, 'rehacerDiscrepancia')
            .mockResolvedValue({ id: 31, regimen: 'nuevo', ajustes: [], aviso: null, simulado: true });
    });
    afterEach(() => { spyResolver.mockRestore(); spyRehacer.mockRestore(); });

    test('el schema ya no tiene causa y la resolucion es opcional', () => {
        expect(schemas.resolverDiscrepancia).toEqual({
            estado: { required: true, type: 'string', in: ['resuelta', 'descartada'] },
            resolucion: { type: 'string', maxLength: 1000 },
        });
    });

    test('resolver sin resolucion → 200; la causa que llegue se descarta (sin simular)', async () => {
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta', causa: 'nunca_salio', resuelto_por: 1 });
        expect(res.status).toBe(200);
        expect(spyResolver).toHaveBeenCalledWith('31', DAPHNE, 'resuelta', undefined, { simular: false });
        expect(res.body.data).toMatchObject({ estado: 'resuelta', ajustes: [], aviso: null });
    });

    // Revisión 2026-10-21 [BAJA]: simular estricto en las dos rutas.
    test.each([
        ['?simular=1', true], ['?simular=true', true], ['', false], ['?simular=0', false], ['?simular=false', false],
    ])('resolver%s → simular=%p', async (qs, simular) => {
        const res = await request(app).put(`/api/transferencias/discrepancias/31/resolver${qs}`).set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'descartada' });
        expect(res.status).toBe(200);
        expect(spyResolver).toHaveBeenLastCalledWith('31', DAPHNE, 'descartada', undefined, { simular });
    });

    test.each(['?simular=si', '?simular=', '?simular', '?simular=TRUE', '?simular=1&simular=1'])('resolver%s → 400 sin llamar al service', async (qs) => {
        const res = await request(app).put(`/api/transferencias/discrepancias/31/resolver${qs}`).set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(400);
        expect(res.body.error).toBe('El parámetro simular debe ser 1, true, 0 o false');
        expect(spyResolver).not.toHaveBeenCalled();
    });

    test.each(['?simular=si', '?simular=', '?simular=2'])('rehacer%s → 400 sin llamar al service', async (qs) => {
        const res = await request(app).post(`/api/transferencias/discrepancias/31/rehacer${qs}`).set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(400);
        expect(spyRehacer).not.toHaveBeenCalled();
    });

    test('resolver simulado → 200 con el bloqueo del service y SIN log de actividad', async () => {
        spyResolver.mockResolvedValue({
            id: 31, estado: 'resuelta', resolucion: null, ajustes: [], aviso: null, simulado: true,
            bloqueo: { code: 'DESTINO_SIN_STOCK', message: 'Obra 9 ya no tiene esas 3 unidades (hoy tiene 1): ajústalo a mano' },
        });
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver?simular=1').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(200);
        expect(res.body.data.bloqueo).toEqual({ code: 'DESTINO_SIN_STOCK', message: 'Obra 9 ya no tiene esas 3 unidades (hoy tiene 1): ajústalo a mano' });
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    // Revisión 2026-10-21 [BAJA]: solo lo REAL va al log de actividad, con la TRF, el ítem y los ajustes.
    test('resolver real → log manual con id, TRF, ítem y ajustes', async () => {
        const ajustes = [{ ubicacion_nombre: 'Obra 9', obra_id: 9, bodega_id: null, antes: 10, despues: 12, cantidad: 2 }];
        spyResolver.mockResolvedValue({
            id: 31, estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados', ajustes, aviso: null, simulado: false,
            transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001', item: { id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' },
        });
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(200);
        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [usuario, modulo, accion, itemId, detalle, req, extras] = logManualActivity.mock.calls[0];
        expect([usuario, modulo, accion, itemId]).toEqual([DAPHNE, 'transferencias', 'UPDATE', String(TRF)]);
        expect(req).toBeTruthy();
        expect(extras).toEqual({ entidad_tipo: 'transferencia', entidad_label: 'TRF-202610-0001' });
        expect(JSON.parse(detalle)).toEqual({
            resumen: 'Diferencia #31 aprobada (TRF-202610-0001 · Andamio 1,5 m)', accion: 'diferencia_resuelta',
            discrepancia_id: 31, transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001',
            item: { id: ITEM, descripcion: 'Andamio 1,5 m', nro_item: 'A-15', unidad: 'unidad' },
            estado: 'resuelta', ajustes, aviso: null,
        });
    });

    test('resolver real de una de la regla anterior → responde cerrada_regla_anterior y el log dice que no movió stock', async () => {
        spyResolver.mockResolvedValue({
            id: 31, estado: 'resuelta', resolucion: 'Aprobada: llegaron 12 de 10 enviados', ajustes: [],
            aviso: 'Regla anterior: la diferencia ya estaba aplicada; se cierra sin mover stock', simulado: false, cerrada_regla_anterior: true,
            transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001', item: { id: ITEM, descripcion: 'Andamio 1,5 m' },
        });
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(200);
        expect(res.body.data.cerrada_regla_anterior).toBe(true);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({
            resumen: 'Diferencia #31 aprobada (TRF-202610-0001 · Andamio 1,5 m): regla anterior, se cierra sin mover stock',
            accion: 'diferencia_resuelta', cerrada_regla_anterior: true, ajustes: [],
        });
    });

    test('el 409 REINTENTAR del service llega con su code y su mensaje', async () => {
        spyResolver.mockRejectedValue(Object.assign(new Error('Otra persona está trabajando en esta solicitud: reintenta en unos segundos'), { statusCode: 409, code: 'REINTENTAR' }));
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'REINTENTAR', error: 'Otra persona está trabajando en esta solicitud: reintenta en unos segundos' });
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('rehacer: simulado sin log; real con log (regimen y estado anterior)', async () => {
        let res = await request(app).post('/api/transferencias/discrepancias/31/rehacer?simular=1').set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(200);
        expect(logManualActivity).not.toHaveBeenCalled();

        spyRehacer.mockResolvedValue({
            id: 31, transferencia_id: TRF, transferencia_codigo: 'TRF-202610-0001', item: { id: ITEM, descripcion: 'Andamio 1,5 m' },
            regimen: 'nuevo', estado_anterior: 'resuelta', ajustes: [{ cantidad: -2 }], aviso: null, simulado: false,
        });
        res = await request(app).post('/api/transferencias/discrepancias/31/rehacer').set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(200);
        expect(logManualActivity).toHaveBeenCalledTimes(1);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({
            resumen: 'Diferencia #31 rehecha con la regla nueva (TRF-202610-0001 · Andamio 1,5 m): vuelve a pendiente',
            accion: 'diferencia_rehecha', discrepancia_id: 31, transferencia_id: TRF, regimen: 'nuevo', estado_anterior: 'resuelta',
            ajustes: [{ cantidad: -2 }],
        });
    });

    test('un error del service no se loguea', async () => {
        spyResolver.mockRejectedValue(Object.assign(new Error('x'), { statusCode: 409, code: 'NO_PENDIENTE' }));
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'resuelta' });
        expect(res.status).toBe(409);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('estado inválido → 400 del schema, sin llamar al service', async () => {
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'aprobada' });
        expect(res.status).toBe(400);
        expect(spyResolver).not.toHaveBeenCalled();
    });

    test('el 409 del service llega con su code (REGLA_ANTIGUA)', async () => {
        spyResolver.mockRejectedValue(Object.assign(new Error('Esta diferencia es de la regla anterior: primero hay que rehacerla'), { statusCode: 409, code: 'REGLA_ANTIGUA' }));
        const res = await request(app).put('/api/transferencias/discrepancias/31/resolver').set('Authorization', `Bearer ${tokenDe(2)}`)
            .send({ estado: 'descartada', resolucion: 'x' });
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'REGLA_ANTIGUA', error: 'Esta diferencia es de la regla anterior: primero hay que rehacerla' });
    });

    test('rehacer: un rol que no es Super Admin (aunque pueda aprobar) → 403 sin llamar al service', async () => {
        const res = await request(app).post('/api/transferencias/discrepancias/31/rehacer?simular=1').set('Authorization', `Bearer ${tokenDe(2)}`);
        expect(res.status).toBe(403);
        expect(spyRehacer).not.toHaveBeenCalled();
    });

    test('rehacer: Super Admin sin el permiso de aprobar → 403', async () => {
        const res = await request(app).post('/api/transferencias/discrepancias/31/rehacer').set('Authorization', `Bearer ${tokenDe(1, ['inventario.ver'])}`);
        expect(res.status).toBe(403);
        expect(spyRehacer).not.toHaveBeenCalled();
    });

    test('rehacer: Super Admin con ?simular=1 → simula; sin el parámetro → aplica', async () => {
        let res = await request(app).post('/api/transferencias/discrepancias/31/rehacer?simular=1').set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(200);
        expect(spyRehacer).toHaveBeenLastCalledWith('31', DAPHNE, { simular: true });
        expect(res.body.data).toMatchObject({ regimen: 'nuevo', simulado: true });

        res = await request(app).post('/api/transferencias/discrepancias/31/rehacer').set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(200);
        expect(spyRehacer).toHaveBeenLastCalledWith('31', DAPHNE, { simular: false });
    });

    test('rehacer: el 409 del service (DESTINO_SIN_STOCK) llega con su code', async () => {
        spyRehacer.mockRejectedValue(Object.assign(new Error('Obra 9 ya no tiene esas 2 unidades (hoy tiene 1): ajústalo a mano'), { statusCode: 409, code: 'DESTINO_SIN_STOCK' }));
        const res = await request(app).post('/api/transferencias/discrepancias/31/rehacer?simular=1').set('Authorization', `Bearer ${tokenDe(1)}`);
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DESTINO_SIN_STOCK');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Revisión 2026-10-21 [BAJA]: el activityLogger global no registra rehacer/resolver (genéricos y también la
// simulación); la ruta loguea a mano solo lo real. Se prueba el middleware REAL (requireActual).
describe('activityLogger global: excluye rehacer/resolver de diferencias', () => {
    const { EventEmitter } = require('events');
    const real = jest.requireActual('../src/middleware/logger');
    const logsInsertados = async (method, url, body = {}) => {
        db.query.mockReset().mockResolvedValue([[]]);
        const req = { method, originalUrl: url, params: {}, body, user: { id: DAPHNE }, ip: '127.0.0.1', connection: {}, get: () => 'jest' };
        const res = new EventEmitter();
        res.statusCode = 200;
        await real.activityLogger(req, res, () => {});
        res.emit('finish');
        for (let i = 0; i < 5; i += 1) await new Promise(r => setImmediate(r));
        return db.query.mock.calls.filter(([s]) => /INSERT INTO logs_actividad/.test(String(s)));
    };

    test.each([
        ['POST', '/api/transferencias/discrepancias/31/rehacer?simular=1'],
        ['POST', '/api/transferencias/discrepancias/31/rehacer'],
        ['PUT', '/api/transferencias/discrepancias/31/resolver?simular=1'],
        ['PUT', '/api/transferencias/discrepancias/31/resolver'],
    ])('%s %s → no inserta en logs_actividad', async (method, url) => {
        expect(await logsInsertados(method, url, { estado: 'resuelta' })).toHaveLength(0);
    });

    test('control: otra ruta de transferencias sí se loguea (el arnés funciona)', async () => {
        expect(await logsInsertados('PUT', '/api/transferencias/22/despachar')).toHaveLength(1);
    });
});

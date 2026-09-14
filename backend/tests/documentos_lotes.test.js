/**
 * /api/documentos-lotes — cadena de custodia de documentos físicos (plan Gestiones B6, mig 114).
 *
 *  - Gates: registrar (RRHH) vs portar (portador); 403 sin tocar la BD.
 *  - Crear lote: transacción (portador válido → FOR UPDATE de documentos → lote → ítems → lote_id), 409
 *    DOCUMENTO_NO_DISPONIBLE, 400 PORTADOR_INVALIDO, rollback, log con conteos (sin nombres de trabajadores).
 *  - Doble llave: confirmar-retiro SOLO el portador del lote (RRHH → 403), parcial (recibidos / no_entregados).
 *  - Recepción: firmados → firmado + fecha_firmado; sin firma → descargado (excepción a monótono); parcial.
 *  - Anular solo pendiente. Contadores por alcance. Degradación 1146: listas vacías, 409 MIGRACION_PENDIENTE.
 *  - decorarCustodia: solo con la columna lote_id (hasCols); sin ella no toca las filas.
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

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const service = require('../src/services/documentosLotes.service');
const { resetSchemaCache } = require('../src/utils/schema');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (id, permisos) => jwt.sign({ id, email: `u${id}@lols.cl`, rol_id: 2, rv: 1, p: permisos }, SECRET);
const RRHH = 3, JHOAN = 7, HECTOR = 8;
const tokenRRHH = makeToken(RRHH, ['documentos.entrega.registrar']);
const tokenJhoan = makeToken(JHOAN, ['documentos.entrega.portar']);
const tokenHector = makeToken(HECTOR, ['documentos.entrega.portar']);
const tokenTerreno = makeToken(9, ['asistencia.ver']);

const BASE = '/api/documentos-lotes';
const err1146 = () => Object.assign(new Error("Table 'documentos_lotes' doesn't exist"), { errno: 1146, code: 'ER_NO_SUCH_TABLE' });
const err1054 = () => Object.assign(new Error("Unknown column 'lote_id'"), { errno: 1054, code: 'ER_BAD_FIELD_ERROR' });

const makeConn = () => ({
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    query: jest.fn().mockResolvedValue([[]]),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
});
let conn;
beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockReset().mockResolvedValue([[]]);
    conn = makeConn();
    db.getConnection.mockReset().mockResolvedValue(conn);
    resetSchemaCache();
});
const sqlOf = (fn) => fn.mock.calls.map(([sql]) => String(sql));

const PORTADOR = { id: JHOAN, nombre: 'Jhoan Vásquez', email: 'jhoan@lols.cl' };
const DOC = (id, extra = {}) => ({ id, activo: 1, origen: 'generado', estado: 'descargado', lote_id: null, ...extra });
const LOTE = (extra = {}) => ({ id: 41, portador_id: JHOAN, creado_por: RRHH, estado: 'pendiente_retiro', ...extra });
const LOTE_ROW = (extra = {}) => ({
    id: 41, portador_id: JHOAN, portador_nombre: 'Jhoan Vásquez', creado_por: RRHH, creado_por_nombre: 'Matías', estado: 'pendiente_retiro',
    observacion: null, creado_en: '2026-09-14 10:00:00', retirado_en: null, cerrado_en: null,
    total: '3', pendientes: '3', en_terreno: '0', firmados: '0', sin_firma: '0', no_entregados: '0', ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
describe('gates (403 sin tocar la BD)', () => {
    test.each([
        ['GET', `${BASE}/portadores`, tokenJhoan],
        ['GET', `${BASE}/disponibles`, tokenJhoan],
        ['POST', `${BASE}`, tokenJhoan],
        ['PUT', `${BASE}/41/confirmar-retiro`, tokenRRHH],   // doble llave: RRHH no confirma retiros
        ['PUT', `${BASE}/41/recepcion`, tokenJhoan],
        ['DELETE', `${BASE}/41`, tokenJhoan],
        ['GET', `${BASE}`, tokenTerreno],
        ['GET', `${BASE}/pendientes/count`, tokenTerreno],
        ['GET', `${BASE}/41`, tokenTerreno],
    ])('%s %s → 403', async (method, url, token) => {
        const res = await request(app)[method.toLowerCase()](url).set('Authorization', `Bearer ${token}`).send({ portador_id: JHOAN, documento_ids: [1], firmados: [1] });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
        expect(db.getConnection).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /portadores y /disponibles', () => {
    test('portadores: usuarios activos con el permiso efectivo (rol o grant, sin deny; rol 1 siempre)', async () => {
        db.query.mockResolvedValueOnce([[PORTADOR, { id: HECTOR, nombre: 'Héctor Gómez', email: null }]]);
        const res = await request(app).get(`${BASE}/portadores`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([{ id: JHOAN, nombre: 'Jhoan Vásquez', email: 'jhoan@lols.cl' }, { id: HECTOR, nombre: 'Héctor Gómez', email: null }]);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/u\.activo = 1/);
        expect(sql).toMatch(/permisos_rol_v2/);
        expect(sql).toMatch(/permisos_usuario_override/);
        expect(sql).toMatch(/o\.tipo = 'deny'/);
        expect(sql).toMatch(/u\.rol_id = 1/);
        expect(params).toEqual(['documentos.entrega.portar', 'documentos.entrega.portar', 'documentos.entrega.portar']);
    });

    test('disponibles: solo generados, descargados y sin lote; filtro por obra y texto; sin mig 114 → []', async () => {
        db.query.mockResolvedValueOnce([[{
            id: 11, nombre_archivo: 'Contrato_Perez.doc', fecha_generacion: 'x', fecha_descarga: 'y', tipo_nombre: 'Contrato de Trabajo (Bóveda)', tipo_codigo: 'CONTRATO',
            trabajador_id: 5, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', rut: '12.345.678-5', trabajador_activo: 1, obra_id: 7, obra_nombre: 'Edificio Central',
        }]]);
        let res = await request(app).get(`${BASE}/disponibles?obra_id=7&q=Pér`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([expect.objectContaining({ id: 11, trabajador_nombre: 'Pérez Soto Juan', rut: '12.345.678-5', obra_nombre: 'Edificio Central', tipo_codigo: 'CONTRATO' })]);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/d\.origen = 'generado' AND d\.estado = 'descargado' AND d\.lote_id IS NULL/);
        expect(sql).toMatch(/t\.obra_id = \?/);
        expect(params).toEqual([7, '%Pér%', '%Pér%', '%Pér%', '%Pér%']);

        db.query.mockReset().mockRejectedValueOnce(err1054());
        res = await request(app).get(`${BASE}/disponibles`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST / (crear lote)', () => {
    test('201: portador válido → FOR UPDATE de documentos → lote → ítems → lote_id; log con conteos y sin nombres', async () => {
        conn.query
            .mockResolvedValueOnce([[PORTADOR]])                                  // portador con permiso
            .mockResolvedValueOnce([[DOC(11), DOC(12), DOC(13)]])                 // documentos FOR UPDATE
            .mockResolvedValueOnce([{ insertId: 41 }])                            // INSERT lote
            .mockResolvedValueOnce([{ affectedRows: 3 }])                         // INSERT items
            .mockResolvedValueOnce([{ affectedRows: 3 }]);                        // UPDATE documentos.lote_id
        const res = await request(app).post(BASE).set('Authorization', `Bearer ${tokenRRHH}`)
            .send({ portador_id: JHOAN, documento_ids: [11, 12, 13, 12, '13'], observacion: ' Kit obra central ' });
        expect(res.status).toBe(201);
        expect(res.body.data).toEqual({ lote_id: 41, portador_id: JHOAN, portador_nombre: 'Jhoan Vásquez', n: 3 });

        const sqls = sqlOf(conn.query);
        expect(sqls[0]).toMatch(/AND u\.id = \?/);
        expect(conn.query.mock.calls[0][1].slice(-1)[0]).toBe(JHOAN);
        expect(sqls[1]).toMatch(/FROM documentos WHERE id IN \(\?\) FOR UPDATE/);
        expect(conn.query.mock.calls[1][1]).toEqual([[11, 12, 13]]);            // sin repetidos, casteados
        expect(sqls[2]).toMatch(/INSERT INTO documentos_lotes \(portador_id, creado_por, estado, observacion\)/);
        expect(conn.query.mock.calls[2][1]).toEqual([JHOAN, RRHH, 'Kit obra central']);
        expect(sqls[3]).toMatch(/INSERT INTO documentos_lotes_items \(lote_id, documento_id\) VALUES \?/);
        expect(conn.query.mock.calls[3][1]).toEqual([[[41, 11], [41, 12], [41, 13]]]);
        expect(sqls[4]).toMatch(/UPDATE documentos SET lote_id = \? WHERE id IN \(\?\)/);
        expect(conn.query.mock.calls[4][1]).toEqual([41, [11, 12, 13]]);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.rollback).not.toHaveBeenCalled();

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [uid, modulo, accion, itemId, detalle] = logManualActivity.mock.calls[0];
        expect([uid, modulo, accion, itemId]).toEqual([RRHH, 'documentos-lotes', 'CREATE', '41']);
        expect(JSON.parse(detalle)).toMatchObject({ evento: 'lote_creado', portador_id: JHOAN, documentos: 3 });
        expect(detalle).not.toMatch(/Pérez|12\.345/);
    });

    test('409 DOCUMENTO_NO_DISPONIBLE (en otro lote / no descargado / inexistente) con la lista; rollback, nada escrito', async () => {
        conn.query
            .mockResolvedValueOnce([[PORTADOR]])
            .mockResolvedValueOnce([[DOC(11), DOC(12, { lote_id: 9 }), DOC(13, { estado: 'generado' })]]);   // el 14 no existe
        const res = await request(app).post(BASE).set('Authorization', `Bearer ${tokenRRHH}`).send({ portador_id: JHOAN, documento_ids: [11, 12, 13, 14] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENTO_NO_DISPONIBLE');
        expect(res.body.no_disponibles).toEqual([12, 13, 14]);
        // Ojo: el SELECT lleva "FOR UPDATE" — solo cuentan sentencias que EMPIEZAN con INSERT/UPDATE.
        expect(sqlOf(conn.query).some(s => /^\s*(INSERT|UPDATE)/.test(s))).toBe(false);
        expect(conn.rollback).toHaveBeenCalled();
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('400 PORTADOR_INVALIDO si el usuario no existe, está inactivo o no tiene el permiso de portar; 400 sin documentos', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        let res = await request(app).post(BASE).set('Authorization', `Bearer ${tokenRRHH}`).send({ portador_id: 99, documento_ids: [11] });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('PORTADOR_INVALIDO');
        expect(conn.rollback).toHaveBeenCalled();

        res = await request(app).post(BASE).set('Authorization', `Bearer ${tokenRRHH}`).send({ portador_id: JHOAN, documento_ids: ['x', -1, 0] });
        expect(res.status).toBe(400);
        expect(db.getConnection).toHaveBeenCalledTimes(1);   // el segundo ni abrió transacción
    });

    test('409 MIGRACION_PENDIENTE si la mig 114 no corrió (1146 dentro de la transacción)', async () => {
        conn.query.mockResolvedValueOnce([[PORTADOR]]).mockResolvedValueOnce([[DOC(11)]]).mockRejectedValueOnce(err1146());
        const res = await request(app).post(BASE).set('Authorization', `Bearer ${tokenRRHH}`).send({ portador_id: JHOAN, documento_ids: [11] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('MIGRACION_PENDIENTE');
        expect(conn.rollback).toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET / y GET /:id (alcance por rol)', () => {
    test('RRHH ve todos; el portador solo los suyos (WHERE portador_id); ?estado filtra; sin mig → []', async () => {
        db.query.mockResolvedValueOnce([[LOTE_ROW()]]);
        let res = await request(app).get(`${BASE}?estado=pendiente_retiro`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([expect.objectContaining({ id: 41, portador_nombre: 'Jhoan Vásquez', total: 3, pendientes: 3, estado: 'pendiente_retiro' })]);
        expect(db.query.mock.calls[0][0]).not.toMatch(/l\.portador_id = \?/);
        expect(db.query.mock.calls[0][1]).toEqual(['pendiente_retiro']);

        db.query.mockReset().mockResolvedValueOnce([[]]);
        res = await request(app).get(BASE).set('Authorization', `Bearer ${tokenJhoan}`);
        expect(res.status).toBe(200);
        expect(db.query.mock.calls[0][0]).toMatch(/l\.portador_id = \?/);
        expect(db.query.mock.calls[0][1]).toEqual([JHOAN]);

        db.query.mockReset().mockRejectedValueOnce(err1146());
        res = await request(app).get(BASE).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });

    test('GET /:id: ítems con trabajador/obra/tipo; 403 al portador ajeno; 404 inexistente', async () => {
        const ITEM = { id: 1, documento_id: 11, estado: 'pendiente', retirado_en: null, resuelto_en: null, observacion: null, nombre_archivo: 'Contrato_Perez.doc', documento_estado: 'descargado', tipo_nombre: 'Contrato de Trabajo (Bóveda)', tipo_codigo: 'CONTRATO', trabajador_id: 5, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: null, rut: '12.345.678-5', obra_nombre: 'Edificio Central' };
        db.query.mockResolvedValueOnce([[LOTE_ROW()]]).mockResolvedValueOnce([[ITEM]]);
        let res = await request(app).get(`${BASE}/41`).set('Authorization', `Bearer ${tokenJhoan}`);
        expect(res.status).toBe(200);
        expect(res.body.data.items).toEqual([expect.objectContaining({ documento_id: 11, trabajador_nombre: 'Pérez Juan', obra_nombre: 'Edificio Central', estado: 'pendiente' })]);

        db.query.mockReset().mockResolvedValueOnce([[LOTE_ROW()]]);
        res = await request(app).get(`${BASE}/41`).set('Authorization', `Bearer ${tokenHector}`);
        expect(res.status).toBe(403);
        expect(db.query).toHaveBeenCalledTimes(1);   // no llegó a pedir los ítems

        db.query.mockReset().mockResolvedValueOnce([[]]);
        res = await request(app).get(`${BASE}/999`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(404);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /:id/confirmar-retiro (doble llave)', () => {
    test('el portador confirma parcial: recibidos → retirado/en_terreno; el resto → no_entregado y vuelve a oficina; lote en_terreno', async () => {
        conn.query
            .mockResolvedValueOnce([[LOTE()]])                                                     // lote FOR UPDATE
            .mockResolvedValueOnce([[{ documento_id: 11 }, { documento_id: 12 }, { documento_id: 13 }]]) // items pendientes
            .mockResolvedValueOnce([{ affectedRows: 2 }]).mockResolvedValueOnce([{ affectedRows: 2 }])  // recibidos
            .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }])  // no recibidos
            .mockResolvedValueOnce([{ affectedRows: 1 }]);                                         // lote
        const res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenJhoan}`).send({ documento_ids: [11, 12] });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ lote_id: 41, estado: 'en_terreno', recibidos: 2, no_entregados: 1 });
        const sqls = sqlOf(conn.query);
        expect(sqls[2]).toMatch(/SET estado = 'retirado', retirado_en = NOW\(\)/);
        expect(conn.query.mock.calls[2][1]).toEqual(['41', [11, 12]]);
        expect(sqls[3]).toMatch(/UPDATE documentos SET estado = 'en_terreno' WHERE id IN \(\?\)/);
        expect(sqls[4]).toMatch(/SET estado = 'no_entregado'/);
        expect(conn.query.mock.calls[4][1]).toEqual([JHOAN, '41', [13]]);
        expect(sqls[5]).toMatch(/UPDATE documentos SET lote_id = NULL WHERE id IN \(\?\)/);
        expect(conn.query.mock.calls[5][1]).toEqual([[13]]);
        expect(sqls[6]).toMatch(/UPDATE documentos_lotes SET estado = \?, retirado_en = NOW\(\) WHERE id = \?/);
        expect(conn.query.mock.calls[6][1]).toEqual(['en_terreno', '41']);
        expect(conn.commit).toHaveBeenCalled();
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({ evento: 'lote_retirado', recibidos: 2, no_entregados: 1 });
    });

    test('no recibió nada → todos no_entregado y el lote se cierra', async () => {
        conn.query.mockResolvedValueOnce([[LOTE()]]).mockResolvedValueOnce([[{ documento_id: 11 }]]);
        const res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenJhoan}`).send({ documento_ids: [] });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ estado: 'cerrado', recibidos: 0, no_entregados: 1 });
        const sqls = sqlOf(conn.query);
        expect(sqls.some(s => /estado = 'retirado'/.test(s))).toBe(false);
        expect(sqls.slice(-1)[0]).toMatch(/retirado_en = NOW\(\), cerrado_en = NOW\(\)/);
    });

    test('403 LOTE_AJENO (otro portador), 409 si ya no está pendiente, 400 id que no es del lote, 404 inexistente', async () => {
        conn.query.mockResolvedValueOnce([[LOTE()]]);
        let res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenHector}`).send({ documento_ids: [11] });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('LOTE_AJENO');
        expect(conn.rollback).toHaveBeenCalled();

        conn.query.mockReset().mockResolvedValueOnce([[LOTE({ estado: 'en_terreno' })]]);
        res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenJhoan}`).send({ documento_ids: [11] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('LOTE_NO_PENDIENTE');

        conn.query.mockReset().mockResolvedValueOnce([[LOTE()]]).mockResolvedValueOnce([[{ documento_id: 11 }]]);
        res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenJhoan}`).send({ documento_ids: [11, 99] });
        expect(res.status).toBe(400);
        expect(res.body.ajenos).toEqual([99]);

        conn.query.mockReset().mockResolvedValueOnce([[]]);
        res = await request(app).put(`${BASE}/41/confirmar-retiro`).set('Authorization', `Bearer ${tokenJhoan}`).send({ documento_ids: [] });
        expect(res.status).toBe(404);
        expect(logManualActivity).not.toHaveBeenCalled();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PUT /:id/recepcion (RRHH recibe lo que vuelve)', () => {
    test('parcial: firmados → firmado + fecha_firmado + lote_id NULL; sin firma → descargado (excepción a monótono); el lote sigue en_terreno', async () => {
        conn.query
            .mockResolvedValueOnce([[LOTE({ estado: 'en_terreno' })]])
            .mockResolvedValueOnce([[{ documento_id: 11 }, { documento_id: 12 }, { documento_id: 13 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await request(app).put(`${BASE}/41/recepcion`).set('Authorization', `Bearer ${tokenRRHH}`).send({ firmados: [11], sin_firma: [12, 11], observacion: 'faltó firma en la 12' });
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ lote_id: 41, estado: 'en_terreno', firmados: 1, sin_firma: 1, en_terreno: 1 });
        const sqls = sqlOf(conn.query);
        expect(sqls[2]).toMatch(/SET estado = 'firmado', resuelto_en = NOW\(\), resuelto_por = \?/);
        expect(sqls[3]).toMatch(/UPDATE documentos SET estado = 'firmado', fecha_firmado = NOW\(\), lote_id = NULL WHERE id IN \(\?\)/);
        expect(conn.query.mock.calls[3][1]).toEqual([[11]]);
        expect(sqls[4]).toMatch(/SET estado = 'devuelto_sin_firma'/);
        expect(sqls[5]).toMatch(/UPDATE documentos SET estado = 'descargado', lote_id = NULL WHERE id IN \(\?\)/);
        expect(conn.query.mock.calls[5][1]).toEqual([[12]]);
        expect(sqls.some(s => /SET estado = 'cerrado'/.test(s))).toBe(false);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({ evento: 'lote_recepcion', firmados: 1, sin_firma: 1 });
    });

    test('cuando no queda nada en terreno el lote se cierra; 409 si el portador no confirmó aún; 400 sin listas / id ajeno', async () => {
        conn.query.mockResolvedValueOnce([[LOTE({ estado: 'en_terreno' })]]).mockResolvedValueOnce([[{ documento_id: 13 }]]);
        let res = await request(app).put(`${BASE}/41/recepcion`).set('Authorization', `Bearer ${tokenRRHH}`).send({ firmados: [13] });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ estado: 'cerrado', en_terreno: 0 });
        expect(sqlOf(conn.query).slice(-1)[0]).toMatch(/SET estado = 'cerrado', cerrado_en = NOW\(\)/);

        conn.query.mockReset().mockResolvedValueOnce([[LOTE()]]);
        res = await request(app).put(`${BASE}/41/recepcion`).set('Authorization', `Bearer ${tokenRRHH}`).send({ firmados: [11] });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('LOTE_NO_EN_TERRENO');
        expect(res.body.error).toMatch(/aún no confirmó/);

        res = await request(app).put(`${BASE}/41/recepcion`).set('Authorization', `Bearer ${tokenRRHH}`).send({ firmados: [], sin_firma: [] });
        expect(res.status).toBe(400);

        conn.query.mockReset().mockResolvedValueOnce([[LOTE({ estado: 'en_terreno' })]]).mockResolvedValueOnce([[{ documento_id: 13 }]]);
        res = await request(app).put(`${BASE}/41/recepcion`).set('Authorization', `Bearer ${tokenRRHH}`).send({ firmados: [11] });
        expect(res.status).toBe(400);
        expect(res.body.ajenos).toEqual([11]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('DELETE /:id (anular) y contadores', () => {
    test('anular libera los documentos y borra ítems + lote; solo pendiente_retiro', async () => {
        conn.query.mockResolvedValueOnce([[LOTE()]]).mockResolvedValueOnce([{ affectedRows: 3 }]);
        let res = await request(app).delete(`${BASE}/41`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ lote_id: 41, liberados: 3 });
        const sqls = sqlOf(conn.query);
        expect(sqls[1]).toMatch(/UPDATE documentos SET lote_id = NULL WHERE lote_id = \?/);
        expect(sqls[2]).toMatch(/DELETE FROM documentos_lotes_items WHERE lote_id = \?/);
        expect(sqls[3]).toMatch(/DELETE FROM documentos_lotes WHERE id = \?/);

        conn.query.mockReset().mockResolvedValueOnce([[LOTE({ estado: 'en_terreno' })]]);
        res = await request(app).delete(`${BASE}/41`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.status).toBe(409);
        expect(sqlOf(conn.query).some(s => /DELETE/.test(s))).toBe(false);
    });

    test('pendientes/count: RRHH global, portador solo propios; sin mig → ceros', async () => {
        db.query.mockResolvedValueOnce([[{ por_confirmar: '2', en_terreno: '1' }]]);
        let res = await request(app).get(`${BASE}/pendientes/count`).set('Authorization', `Bearer ${tokenRRHH}`);
        expect(res.body.data).toEqual({ por_confirmar: 2, en_terreno: 1, alcance: 'todos' });
        expect(db.query.mock.calls[0][0]).not.toMatch(/WHERE portador_id/);

        db.query.mockReset().mockResolvedValueOnce([[{ por_confirmar: '1', en_terreno: '0' }]]);
        res = await request(app).get(`${BASE}/pendientes/count`).set('Authorization', `Bearer ${tokenJhoan}`);
        expect(res.body.data).toEqual({ por_confirmar: 1, en_terreno: 0, alcance: 'propios' });
        expect(db.query.mock.calls[0][0]).toMatch(/WHERE portador_id = \?/);
        expect(db.query.mock.calls[0][1]).toEqual([JHOAN]);

        db.query.mockReset().mockRejectedValueOnce(err1146());
        res = await request(app).get(`${BASE}/pendientes/count`).set('Authorization', `Bearer ${tokenJhoan}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ por_confirmar: 0, en_terreno: 0 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('decorarCustodia (ficha del trabajador)', () => {
    test('sin la columna lote_id (hasCols) devuelve las filas intactas y no consulta lotes', async () => {
        db.query.mockResolvedValueOnce([[{ COLUMN_NAME: 'id' }, { COLUMN_NAME: 'estado' }]]);   // information_schema sin lote_id
        const rows = [{ id: 11, estado: 'descargado' }];
        expect(await service.decorarCustodia(rows)).toEqual(rows);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(await service.decorarCustodia([])).toEqual([]);
    });

    test('con la columna: agrega lote, portador y fecha de firma por documento', async () => {
        db.query
            .mockResolvedValueOnce([[{ COLUMN_NAME: 'lote_id' }]])
            .mockResolvedValueOnce([[{ id: 11, lote_id: 41, fecha_firmado: null, lote_retirado_en: '2026-09-14 12:00:00', lote_estado: 'en_terreno', portador_nombre: 'Jhoan Vásquez' }, { id: 12, lote_id: null, fecha_firmado: '2026-09-13 09:00:00', lote_retirado_en: null, lote_estado: null, portador_nombre: null }]]);
        const out = await service.decorarCustodia([{ id: 11, estado: 'en_terreno' }, { id: 12, estado: 'firmado' }, { id: 13, estado: 'generado' }]);
        expect(out[0]).toMatchObject({ lote_id: 41, portador_nombre: 'Jhoan Vásquez', lote_estado: 'en_terreno' });
        expect(out[1]).toMatchObject({ lote_id: null, fecha_firmado: '2026-09-13 09:00:00' });
        expect(out[2]).toEqual({ id: 13, estado: 'generado' });
        expect(db.query.mock.calls[1][1]).toEqual([[11, 12, 13]]);
    });
});

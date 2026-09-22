/**
 * /api/cargo-sueldos — parámetros de sueldo por cargo (plan Gestiones B3, mig 111).
 *
 * Fija el contrato:
 *  - gates exclusivos: 403 sin cargos.sueldo.ver / .editar (cargos.editar NO alcanza) y sin tocar la BD;
 *  - 400 de forma (negativo, decimal, texto) y 404 si el cargo no existe (dentro de la transacción);
 *  - montos como Number en las respuestas;
 *  - historial SOLO cuando cambia algún monto; rollback ante error;
 *  - el logger global NO registra el PUT (montos) y el log manual no lleva cifras;
 *  - degradación errno 1146 (mig 111 pendiente): listar devuelve cargos con sueldo null;
 *  - /api/cargos nunca devuelve columnas de sueldo (tabla aparte).
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
const jwt = require('jsonwebtoken');
const PERMISOS = require('../src/config/permisos.config');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 3, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenVer = makeToken(['cargos.sueldo.ver']);
const tokenEditar = makeToken(['cargos.sueldo.ver', 'cargos.sueldo.editar']);
const tokenCargos = makeToken(['cargos.ver', 'cargos.editar']); // gestiona cargos pero NO sueldos

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
});
const sqlOf = (mockFn) => mockFn.mock.calls.map(([sql]) => String(sql));

const FILA = { id: 1, cargo_id: 4, cargo_nombre: 'Jornal', sueldo_base: '553553', bono_colacion: '0', bono_movilizacion: '0', observaciones: null, actualizado_por: 3, actualizado_por_nombre: 'RRHH', updated_at: '2026-09-11 10:00:00' };

describe('catálogo', () => {
    test('cargos.sueldo.* viven en el módulo Cargos y NO en Financiero', () => {
        const ver = PERMISOS.find(p => p[0] === 'cargos.sueldo.ver');
        const ed = PERMISOS.find(p => p[0] === 'cargos.sueldo.editar');
        expect(ver[1]).toBe('Cargos');
        expect(ed[1]).toBe('Cargos');
        expect(ver[3]).not.toMatch(/Disponible próximamente/);
        expect(PERMISOS.PERMISOS_FINANCIEROS).toHaveLength(7);
    });
});

describe('GET /api/cargo-sueldos', () => {
    test('con ver → lista cargos con sueldo (Number) o null', async () => {
        db.query.mockResolvedValueOnce([[
            { cargo_id: 4, cargo_nombre: 'Jornal', id: 1, sueldo_base: '553553', bono_colacion: '20000', bono_movilizacion: '15000', observaciones: null, actualizado_por: 3, actualizado_por_nombre: 'RRHH', updated_at: 'x' },
            { cargo_id: 5, cargo_nombre: 'Capataz', id: null, sueldo_base: null, bono_colacion: null, bono_movilizacion: null, observaciones: null, actualizado_por: null, actualizado_por_nombre: null, updated_at: null },
        ]]);
        const res = await request(app).get('/api/cargo-sueldos').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.data[0].sueldo.sueldo_base).toBe(553553);
        expect(typeof res.body.data[0].sueldo.bono_colacion).toBe('number');
        expect(res.body.data[1].sueldo).toBeNull();
    });

    test('mig 111 pendiente (errno 1146) → cargos con sueldo null, no 500', async () => {
        db.query
            .mockRejectedValueOnce(Object.assign(new Error("Table 'cargo_sueldos' doesn't exist"), { errno: 1146, code: 'ER_NO_SUCH_TABLE' }))
            .mockResolvedValueOnce([[{ cargo_id: 4, cargo_nombre: 'Jornal' }]]);
        const res = await request(app).get('/api/cargo-sueldos').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([{ cargo_id: 4, cargo_nombre: 'Jornal', sueldo: null }]);
    });

    test('403 sin cargos.sueldo.ver (aunque tenga cargos.editar) y sin tocar la BD', async () => {
        const res = await request(app).get('/api/cargo-sueldos').set('Authorization', `Bearer ${tokenCargos}`);
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('GET /:cargoId y /:cargoId/historial', async () => {
        db.query.mockResolvedValueOnce([[FILA]]);
        const uno = await request(app).get('/api/cargo-sueldos/4').set('Authorization', `Bearer ${tokenVer}`);
        expect(uno.status).toBe(200);
        expect(uno.body.data.sueldo_base).toBe(553553);

        db.query.mockResolvedValueOnce([[{ id: 9, cargo_id: 4, sueldo_base: '500000', bono_colacion: '0', bono_movilizacion: '0', observaciones: null, cambiado_por: 3, cambiado_por_nombre: 'RRHH', cambiado_en: 'x' }]]);
        const hist = await request(app).get('/api/cargo-sueldos/4/historial').set('Authorization', `Bearer ${tokenVer}`);
        expect(hist.status).toBe(200);
        expect(hist.body.data[0].sueldo_base).toBe(500000);
        expect(sqlOf(db.query).pop()).toMatch(/cargo_sueldos_historial/);
    });
});

describe('PUT /api/cargo-sueldos/:cargoId', () => {
    const mockTx = ({ prev = null } = {}) => {
        conn.query
            .mockResolvedValueOnce([[{ id: 4, nombre: 'Jornal', activo: 1 }]])   // cargo FOR UPDATE
            .mockResolvedValueOnce([prev ? [prev] : []])                        // sueldo previo FOR UPDATE
            .mockResolvedValue([{ affectedRows: 1 }]);                          // INSERT/UPDATE + historial
        db.query.mockResolvedValueOnce([[{ ...FILA, sueldo_base: '600000', bono_colacion: '20000', bono_movilizacion: '15000' }]]); // getPorCargo final
    };

    test('403 con cargos.editar pero sin cargos.sueldo.editar; con solo .ver también 403', async () => {
        for (const t of [tokenCargos, tokenVer]) {
            const res = await request(app).put('/api/cargo-sueldos/4').set('Authorization', `Bearer ${t}`).send({ sueldo_base: 1 });
            expect(res.status).toBe(403);
        }
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('400 de forma: negativo, decimal, texto, falta sueldo_base', async () => {
        for (const body of [{ sueldo_base: -1 }, { sueldo_base: 1000.5 }, { sueldo_base: 'mil' }, { bono_colacion: 5 }]) {
            const res = await request(app).put('/api/cargo-sueldos/4').set('Authorization', `Bearer ${tokenEditar}`).send(body);
            expect(res.status).toBe(400);
        }
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('crea (sin fila previa): INSERT … ON DUPLICATE KEY + historial + commit; log manual sin montos', async () => {
        mockTx();
        const res = await request(app).put('/api/cargo-sueldos/4').set('Authorization', `Bearer ${tokenEditar}`)
            .send({ sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: '  Ajuste 2026  ', hack: 'x' });
        expect(res.status).toBe(200);
        expect(res.body.data.sueldo_base).toBe(600000);

        const sql = sqlOf(conn.query);
        expect(sql[0]).toMatch(/FROM cargos WHERE id = \? FOR UPDATE/);
        expect(sql[1]).toMatch(/FROM cargo_sueldos WHERE cargo_id = \? FOR UPDATE/);
        expect(sql[2]).toMatch(/INSERT INTO cargo_sueldos[\s\S]*ON DUPLICATE KEY UPDATE/);
        expect(conn.query.mock.calls[2][1]).toEqual([4, 600000, 20000, 15000, 'Ajuste 2026', 3]);
        expect(sql[3]).toMatch(/INSERT INTO cargo_sueldos_historial/);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [uid, modulo, accion, itemId, detalle] = logManualActivity.mock.calls[0];
        expect([uid, modulo, accion, itemId]).toEqual([3, 'cargo-sueldos', 'CREATE', 4]);
        expect(detalle).not.toMatch(/600000|20000|15000/);
        expect(JSON.parse(detalle)).toMatchObject({ evento: 'sueldo_cargo_actualizado', cargo: 'Jornal', cambio_montos: true });
    });

    test('actualiza sin cambiar montos → NO escribe historial; bonos omitidos conservan el valor previo', async () => {
        mockTx({ prev: { id: 1, cargo_id: 4, sueldo_base: 600000, bono_colacion: 20000, bono_movilizacion: 15000, observaciones: 'a' } });
        const res = await request(app).put('/api/cargo-sueldos/4').set('Authorization', `Bearer ${tokenEditar}`)
            .send({ sueldo_base: 600000, observaciones: 'nota nueva' });
        expect(res.status).toBe(200);
        const sql = sqlOf(conn.query);
        expect(sql.some(s => /cargo_sueldos_historial/.test(s))).toBe(false);
        expect(conn.query.mock.calls[2][1]).toEqual([4, 600000, 20000, 15000, 'nota nueva', 3]);
        expect(JSON.parse(logManualActivity.mock.calls[0][4]).cambio_montos).toBe(false);
        expect(logManualActivity.mock.calls[0][2]).toBe('UPDATE');
    });

    test('cargo inexistente → 404 con rollback y sin INSERT', async () => {
        conn.query.mockResolvedValueOnce([[]]);
        const res = await request(app).put('/api/cargo-sueldos/999').set('Authorization', `Bearer ${tokenEditar}`).send({ sueldo_base: 1 });
        expect(res.status).toBe(404);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
        expect(sqlOf(conn.query).some(s => /INSERT/.test(s))).toBe(false);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('error de BD en el INSERT → rollback + release, propaga 500', async () => {
        conn.query
            .mockResolvedValueOnce([[{ id: 4, nombre: 'Jornal', activo: 1 }]])
            .mockResolvedValueOnce([[]])
            .mockRejectedValueOnce(new Error('ER_LOCK'));
        const res = await request(app).put('/api/cargo-sueldos/4').set('Authorization', `Bearer ${tokenEditar}`).send({ sueldo_base: 1 });
        expect(res.status).toBe(500);
        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });
});

describe('aislamiento de montos', () => {
    test('GET /api/cargos (terreno) no consulta ni devuelve columnas de sueldo', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 4, nombre: 'Jornal', activo: 1 }]])
            .mockResolvedValueOnce([[{ total: 1 }]]);
        const res = await request(app).get('/api/cargos?activo=true').set('Authorization', `Bearer ${makeToken(['cargos.ver'])}`);
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body)).not.toMatch(/sueldo/);
        expect(sqlOf(db.query).join(' ')).not.toMatch(/cargo_sueldos/);
    });
});

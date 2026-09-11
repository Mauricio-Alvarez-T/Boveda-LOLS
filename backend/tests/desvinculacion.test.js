/**
 * Desvinculación con causal + reactivación (plan Gestiones B4, mig 112).
 *
 * Fija el contrato de PUT /api/trabajadores/:id/desvincular, PUT /:id/reactivar,
 * GET /:id/desvinculaciones, GET /catalogos/causales-desvinculacion y el GUARD del
 * PUT/DELETE genérico de trabajadores (index.js):
 *  - gates REALES en backend: desvincular = trabajadores.eliminar, reactivar = trabajadores.reactivar
 *    (con solo trabajadores.editar → 403 y sin tocar la BD);
 *  - 400 de forma (causal inválida, fecha) y de negocio (art. 160 sin detalle, fecha < ingreso);
 *  - 409 si ya está desvinculado / ya activo; rollback ante error;
 *  - historial: INSERT en trabajador_desvinculaciones con fecha_ingreso_periodo; reactivar NO toca
 *    fecha_ingreso, cierra la fila y conserva la marca salvo quitar_marca_no_recontratar;
 *  - la marca "no recontratar" SOLO advierte: reactivar responde 200 igual;
 *  - el log manual no lleva `detalle`; el catálogo responde 200 (ruta de 2 segmentos, no la
 *    captura el GET /:id del CRUD);
 *  - guard: PUT /trabajadores/:id {activo:false} → 400 explícito sin UPDATE; con otros campos se
 *    limpia activo/fecha y sigue; DELETE /trabajadores/:id → 405.
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
const { resetSchemaCache } = require('../src/utils/schema');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) => jwt.sign({ id: 3, email: 'rrhh@lols.cl', rol_id: 2, rv: 1, p: permisos }, SECRET);
const tokenEliminar = makeToken(['trabajadores.ver', 'trabajadores.eliminar']);
const tokenReactivar = makeToken(['trabajadores.ver', 'trabajadores.reactivar']);
const tokenEditar = makeToken(['trabajadores.ver', 'trabajadores.editar']);
const tokenVer = makeToken(['trabajadores.ver']);

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
const sqlOf = (mockFn) => mockFn.mock.calls.map(([sql]) => String(sql));
const hoy = new Date();
const p = n => String(n).padStart(2, '0');
const HOY = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;

const TRAB_ACTIVO = { id: 7, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', activo: 1, fecha_ingreso: '2026-01-15', rut_normalized: '123456785' };
const TRAB_INACTIVO = { ...TRAB_ACTIVO, activo: 0, no_recontratar: 1 };

describe('GET /api/trabajadores/catalogos/causales-desvinculacion', () => {
    test('200 con las causales seleccionables (LEGADO excluida) — ruta de 2 segmentos, no la captura el CRUD', async () => {
        const res = await request(app).get('/api/trabajadores/catalogos/causales-desvinculacion').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        const codigos = res.body.data.map(c => c.codigo);
        expect(codigos).toContain('INASISTENCIA');
        expect(codigos).toContain('VENCIMIENTO_PLAZO');
        expect(codigos).not.toContain('LEGADO');
        const inas = res.body.data.find(c => c.codigo === 'INASISTENCIA');
        expect(inas).toMatchObject({ articulo: '160', sugiere_no_recontratar: true, requiere_detalle: true });
        expect(inas.articulo_texto).toMatch(/Artículo 160/);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('PUT /api/trabajadores/:id/desvincular', () => {
    const body = { fecha_desvinculacion: HOY, causal_codigo: 'VENCIMIENTO_PLAZO' };

    test('403 con solo trabajadores.editar (antes bastaba para finiquitar por PUT genérico)', async () => {
        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEditar}`).send(body);
        expect(res.status).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('400 de forma: causal inválida, sin fecha, fecha mal formada', async () => {
        for (const b of [{ ...body, causal_codigo: 'INVENTADA' }, { causal_codigo: 'RENUNCIA' }, { ...body, fecha_desvinculacion: '11/09/2026' }, { ...body, causal_codigo: 'LEGADO' }]) {
            const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`).send(b);
            expect(res.status).toBe(400);
        }
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('400 art. 160 sin detalle (antes de abrir transacción)', async () => {
        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`)
            .send({ ...body, causal_codigo: 'INASISTENCIA', detalle: '   ' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/detallar/i);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('200: INSERT historial con fecha_ingreso_periodo + UPDATE trabajadores + commit; marca sugerida por la causal; log sin detalle', async () => {
        conn.query
            .mockResolvedValueOnce([[TRAB_ACTIVO]])          // FOR UPDATE
            .mockResolvedValueOnce([{ insertId: 55 }])       // INSERT historial
            .mockResolvedValueOnce([{ affectedRows: 1 }])    // UPDATE trabajadores
            .mockResolvedValueOnce([[{ n: 2 }]]);            // asistencias posteriores

        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`)
            .send({ fecha_desvinculacion: HOY, causal_codigo: 'INASISTENCIA', detalle: 'Faltó 3 lunes seguidos sin aviso', extra: 'x' });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ trabajador_id: 7, desvinculacion_id: 55, no_recontratar: true, asistencias_posteriores: 2 });
        expect(res.body.data.causal.codigo).toBe('INASISTENCIA');

        const sql = sqlOf(conn.query);
        expect(sql[0]).toMatch(/FROM trabajadores WHERE id = \? FOR UPDATE/);
        expect(sql[1]).toMatch(/INSERT INTO trabajador_desvinculaciones/);
        // Mig 113: además rut_normalized + nombre_snapshot (el antecedente sobrevive a la depuración).
        expect(conn.query.mock.calls[1][1]).toEqual([7, HOY, '2026-01-15', 'INASISTENCIA', 'Faltó 3 lunes seguidos sin aviso', 1, 3, '123456785', 'Pérez Soto Juan']);
        expect(sql[2]).toMatch(/UPDATE trabajadores[\s\S]*activo = 0[\s\S]*causal_desvinculacion = \?[\s\S]*no_recontratar = \?/);
        expect(conn.query.mock.calls[2][1]).toEqual([HOY, 'INASISTENCIA', 1, 7]);
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const detalleLog = logManualActivity.mock.calls[0][4];
        expect(detalleLog).not.toMatch(/Faltó 3 lunes/);
        expect(JSON.parse(detalleLog)).toMatchObject({ evento: 'trabajador_desvinculado', causal_codigo: 'INASISTENCIA', no_recontratar: true });
    });

    test('no_recontratar explícito false pisa la sugerencia de la causal', async () => {
        conn.query.mockResolvedValueOnce([[TRAB_ACTIVO]]).mockResolvedValueOnce([{ insertId: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[{ n: 0 }]]);
        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`)
            .send({ fecha_desvinculacion: HOY, causal_codigo: 'ABANDONO', detalle: 'ok', no_recontratar: false });
        expect(res.status).toBe(200);
        expect(res.body.data.no_recontratar).toBe(false);
        expect(conn.query.mock.calls[2][1][2]).toBe(0);
    });

    test('400 fecha anterior al ingreso → rollback, sin INSERT', async () => {
        conn.query.mockResolvedValueOnce([[TRAB_ACTIVO]]);
        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`)
            .send({ fecha_desvinculacion: '2026-01-01', causal_codigo: 'RENUNCIA' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/anterior al ingreso/);
        expect(conn.rollback).toHaveBeenCalled();
        expect(sqlOf(conn.query).some(s => /INSERT/.test(s))).toBe(false);
    });

    test('400 fecha a más de 30 días', async () => {
        const res = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`)
            .send({ fecha_desvinculacion: '2099-01-01', causal_codigo: 'RENUNCIA' });
        expect(res.status).toBe(400);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('409 ya desvinculado (code YA_DESVINCULADO en el body) y 404 inexistente', async () => {
        conn.query.mockResolvedValueOnce([[TRAB_INACTIVO]]);
        const r409 = await request(app).put('/api/trabajadores/7/desvincular').set('Authorization', `Bearer ${tokenEliminar}`).send(body);
        expect(r409.status).toBe(409);
        expect(r409.body.code).toBe('YA_DESVINCULADO');
        expect(conn.rollback).toHaveBeenCalled();

        conn = makeConn(); db.getConnection.mockResolvedValue(conn);
        conn.query.mockResolvedValueOnce([[]]);
        const r404 = await request(app).put('/api/trabajadores/999/desvincular').set('Authorization', `Bearer ${tokenEliminar}`).send(body);
        expect(r404.status).toBe(404);
        expect(logManualActivity).not.toHaveBeenCalled();
    });
});

describe('PUT /api/trabajadores/:id/reactivar', () => {
    test('403 con solo trabajadores.editar', async () => {
        const res = await request(app).put('/api/trabajadores/7/reactivar').set('Authorization', `Bearer ${tokenEditar}`).send({});
        expect(res.status).toBe(403);
        expect(db.getConnection).not.toHaveBeenCalled();
    });

    test('200 con marca "no recontratar": SOLO advierte (no bloquea), conserva la marca, NO toca fecha_ingreso y cierra la fila del historial', async () => {
        conn.query
            .mockResolvedValueOnce([[TRAB_INACTIVO]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])   // UPDATE trabajadores
            .mockResolvedValueOnce([{ affectedRows: 1 }]);  // cierra historial
        const res = await request(app).put('/api/trabajadores/7/reactivar').set('Authorization', `Bearer ${tokenReactivar}`).send({});
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ trabajador_id: 7, tenia_marca: true, marca_conservada: true, historial_cerrado: true });
        const sql = sqlOf(conn.query);
        expect(sql[1]).toMatch(/UPDATE trabajadores[\s\S]*activo = 1[\s\S]*fecha_desvinculacion = NULL[\s\S]*causal_desvinculacion = NULL/);
        expect(sql[1]).not.toMatch(/fecha_ingreso/);
        expect(conn.query.mock.calls[1][1]).toEqual([1, 7]);
        expect(sql[2]).toMatch(/UPDATE trabajador_desvinculaciones[\s\S]*reactivado_en = NOW\(\)[\s\S]*reactivado_en IS NULL/);
        expect(conn.commit).toHaveBeenCalled();
    });

    test('quitar_marca_no_recontratar: true → no_recontratar = 0', async () => {
        conn.query.mockResolvedValueOnce([[TRAB_INACTIVO]]).mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await request(app).put('/api/trabajadores/7/reactivar').set('Authorization', `Bearer ${tokenReactivar}`).send({ quitar_marca_no_recontratar: true });
        expect(res.status).toBe(200);
        expect(res.body.data.marca_conservada).toBe(false);
        expect(conn.query.mock.calls[1][1]).toEqual([0, 7]);
        expect(JSON.parse(logManualActivity.mock.calls[0][4])).toMatchObject({ evento: 'trabajador_reactivado', quitar_marca_no_recontratar: true });
    });

    test('409 ya activo con rollback', async () => {
        conn.query.mockResolvedValueOnce([[TRAB_ACTIVO]]);
        const res = await request(app).put('/api/trabajadores/7/reactivar').set('Authorization', `Bearer ${tokenReactivar}`).send({});
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('YA_ACTIVO');
        expect(conn.rollback).toHaveBeenCalled();
    });
});

describe('GET /api/trabajadores/:id/desvinculaciones', () => {
    const FILA = { id: 9, trabajador_id: 7, fecha_desvinculacion: '2026-06-30', fecha_ingreso_periodo: '2026-01-15', causal_codigo: 'INASISTENCIA', detalle: 'secreto', no_recontratar: 1, desvinculado_por: 3, desvinculado_por_nombre: 'RRHH', desvinculado_en: 'x', finiquito_documento_id: null, reactivado_por: null, reactivado_por_nombre: null, reactivado_en: null };

    test('con trabajadores.eliminar → historial con detalle y nombre de causal', async () => {
        db.query.mockResolvedValueOnce([[FILA]]);
        const res = await request(app).get('/api/trabajadores/7/desvinculaciones').set('Authorization', `Bearer ${tokenEliminar}`);
        expect(res.status).toBe(200);
        expect(res.body.data[0]).toMatchObject({ causal_codigo: 'INASISTENCIA', detalle: 'secreto', no_recontratar: true, fecha: '2026-06-30' });
        expect(res.body.data[0].causal_nombre).toMatch(/Inasistencias/);
    });

    test('con solo trabajadores.ver → 403', async () => {
        const res = await request(app).get('/api/trabajadores/7/desvinculaciones').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(403);
    });

    test('mig 112 pendiente (errno 1146) → [] sin 500', async () => {
        db.query.mockRejectedValueOnce(Object.assign(new Error('no table'), { errno: 1146 }));
        const res = await request(app).get('/api/trabajadores/7/desvinculaciones').set('Authorization', `Bearer ${tokenReactivar}`);
        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});

describe('resumen y check-rut exponen la última desvinculación (sin detalle)', () => {
    const FILA = { id: 9, trabajador_id: 7, fecha_desvinculacion: '2026-06-30', causal_codigo: 'INASISTENCIA', detalle: 'secreto', no_recontratar: 1 };

    test('GET /:id/resumen de un inactivo trae ultima_desvinculacion resumida', async () => {
        db.query
            .mockResolvedValueOnce([[{ fecha_ingreso: '2026-01-15', fecha_desvinculacion: '2026-06-30', activo: 0 }]])
            .mockResolvedValueOnce([[{ dias_trabajados: '10', faltas: '3', dias_presente: '10', dias_vacaciones: '0', dias_licencia: '0', dias_registrados: '13' }]])
            .mockResolvedValueOnce([[FILA]]);
        const res = await request(app).get('/api/trabajadores/7/resumen').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data.ultima_desvinculacion).toMatchObject({ fecha: '2026-06-30', causal_codigo: 'INASISTENCIA', no_recontratar: true });
        expect(res.body.data.ultima_desvinculacion).not.toHaveProperty('detalle');
    });

    test('GET /:id/resumen de un activo no consulta el historial', async () => {
        db.query
            .mockResolvedValueOnce([[{ fecha_ingreso: '2026-01-15', fecha_desvinculacion: null, activo: 1 }]])
            .mockResolvedValueOnce([[{ dias_trabajados: '10' }]]);
        const res = await request(app).get('/api/trabajadores/7/resumen').set('Authorization', `Bearer ${tokenVer}`);
        expect(res.status).toBe(200);
        expect(res.body.data.ultima_desvinculacion).toBeNull();
        expect(db.query).toHaveBeenCalledTimes(2);
    });

    test('GET /trabajadores/check-rut de un finiquitado agrega ultima_desvinculacion', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 7, nombres: 'Juan', apellido_paterno: 'Pérez', apellido_materno: 'Soto', activo: 0 }]])
            .mockResolvedValueOnce([[FILA]]);
        const res = await request(app).get('/api/trabajadores/check-rut/12.345.678-5').set('Authorization', `Bearer ${makeToken(['trabajadores.crear'])}`);
        expect(res.status).toBe(200);
        expect(res.body.trabajador.activo).toBe(false);
        expect(res.body.ultima_desvinculacion).toMatchObject({ fecha: '2026-06-30', no_recontratar: true });
        expect(res.body.ultima_desvinculacion.causal_nombre).toMatch(/Inasistencias/);
    });
});

describe('antecedente por RUT tras depuración (mig 113)', () => {
    const FILA_DEPURADA = { id: 12, trabajador_id: null, rut_normalized: '123456785', nombre_snapshot: 'Pérez Soto Juan', fecha_desvinculacion: '2026-06-30', causal_codigo: 'INASISTENCIA', detalle: 'secreto', no_recontratar: 1 };

    test('GET /trabajadores/check-rut sin ficha pero con antecedente → exists:false + ultima_desvinculacion (depurado)', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const res = await request(app).get('/api/trabajadores/check-rut/12.345.678-5').set('Authorization', `Bearer ${makeToken(['trabajadores.crear'])}`);
        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(false);
        expect(res.body.ultima_desvinculacion).toMatchObject({ trabajador_depurado: true, nombre: 'Pérez Soto Juan', no_recontratar: true, fecha: '2026-06-30' });
        expect(res.body.ultima_desvinculacion.causal_nombre).toMatch(/Inasistencias/);
        expect(db.query.mock.calls[1][0]).toMatch(/d\.rut_normalized = \?/);
        expect(db.query.mock.calls[1][1]).toEqual(['123456785']);
    });

    test('GET /trabajadores/check-rut sin ficha ni antecedente → shape histórico intacto', async () => {
        const res = await request(app).get('/api/trabajadores/check-rut/12.345.678-5').set('Authorization', `Bearer ${makeToken(['trabajadores.crear'])}`);
        expect(res.body).toEqual({ exists: false, trabajador: null });
    });

    test('GET /solicitudes-ingreso/check-rut: terreno recibe el antecedente SIN nombre de causal; oficina (trabajadores.ver) CON nombre', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const terreno = await request(app).get('/api/solicitudes-ingreso/check-rut/12.345.678-5').set('Authorization', `Bearer ${makeToken(['trabajadores.solicitud.crear'])}`);
        expect(terreno.status).toBe(200);
        expect(terreno.body.data.existe_trabajador).toBe(false);
        expect(terreno.body.data.ultima_desvinculacion).toMatchObject({ trabajador_depurado: true, no_recontratar: true, articulo: '160' });
        expect(terreno.body.data.ultima_desvinculacion).not.toHaveProperty('causal_nombre');
        expect(terreno.body.data.ultima_desvinculacion).not.toHaveProperty('detalle');

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const oficina = await request(app).get('/api/solicitudes-ingreso/check-rut/12.345.678-5').set('Authorization', `Bearer ${makeToken(['trabajadores.solicitud.crear', 'trabajadores.ver'])}`);
        expect(oficina.body.data.ultima_desvinculacion.causal_nombre).toMatch(/Inasistencias/);
        expect(oficina.body.data.ultima_desvinculacion).not.toHaveProperty('detalle');
    });

    test('check-rut ×2: quien desvincula (trabajadores.eliminar) recibe también el detalle interno', async () => {
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const sol = await request(app).get('/api/solicitudes-ingreso/check-rut/12.345.678-5')
            .set('Authorization', `Bearer ${makeToken(['trabajadores.solicitud.crear', 'trabajadores.eliminar'])}`);
        expect(sol.body.data.ultima_desvinculacion).toMatchObject({ detalle: 'secreto', causal_codigo: 'INASISTENCIA' });

        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const trab = await request(app).get('/api/trabajadores/check-rut/12.345.678-5')
            .set('Authorization', `Bearer ${makeToken(['trabajadores.crear', 'trabajadores.reactivar'])}`);
        expect(trab.body.ultima_desvinculacion).toMatchObject({ detalle: 'secreto', trabajador_depurado: true });

        // Solo crear (sin eliminar/reactivar): resumen, sin detalle.
        db.query.mockReset().mockResolvedValue([[]]);
        db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[FILA_DEPURADA]]);
        const soloCrear = await request(app).get('/api/trabajadores/check-rut/12.345.678-5')
            .set('Authorization', `Bearer ${makeToken(['trabajadores.crear'])}`);
        expect(soloCrear.body.ultima_desvinculacion.causal_nombre).toMatch(/Inasistencias/);
        expect(soloCrear.body.ultima_desvinculacion).not.toHaveProperty('detalle');
    });
});

describe('guard del CRUD genérico de trabajadores (index.js)', () => {
    test('PUT /trabajadores/:id {activo:false, fecha_desvinculacion} → 400 explícito y NINGÚN UPDATE', async () => {
        const res = await request(app).put('/api/trabajadores/7').set('Authorization', `Bearer ${tokenEditar}`)
            .send({ activo: false, fecha_desvinculacion: HOY });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/recarga la página/i);
        expect(sqlOf(db.query).some(s => /UPDATE trabajadores/i.test(s))).toBe(false);
    });

    test('PUT /trabajadores/:id con otros campos: se limpian activo/fecha y sigue al CRUD', async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id: 7, telefono: '+569' }]]);
        const res = await request(app).put('/api/trabajadores/7').set('Authorization', `Bearer ${tokenEditar}`)
            .send({ activo: false, telefono: '+569' });
        expect(res.status).not.toBe(400);
        const upd = db.query.mock.calls.find(c => /UPDATE trabajadores/i.test(c[0]));
        expect(upd).toBeDefined();
        expect(String(upd[0])).not.toMatch(/activo|fecha_desvinculacion/);
    });

    test('DELETE /trabajadores/:id → 405 (usar /desvincular)', async () => {
        const res = await request(app).delete('/api/trabajadores/7').set('Authorization', `Bearer ${tokenEliminar}`);
        expect(res.status).toBe(405);
        expect(res.body.error).toMatch(/desvincular/);
        expect(db.query).not.toHaveBeenCalled();
    });
});

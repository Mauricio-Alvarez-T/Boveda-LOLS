/**
 * Tests del borrado correctivo de asistencia (goma de borrar).
 *
 * Nace del caso real 2026-08-26: marcaron asistencia a los 194 trabajadores en
 * el día equivocado (27-08) y no existía forma de deshacerlo. Lo que fijan:
 *   · el DELETE usa los ids EXACTOS seleccionados antes (race-safe: no borra
 *     filas creadas entre el SELECT y el DELETE),
 *   · con obra_id borra solo esa obra; sin obra_id borra el día completo
 *     (duplicados cross-obra incluidos — regla "fila vigente"),
 *   · la gate es asistencia.guardar (quien guarda corrige),
 *   · queda UN log de auditoría con quién/fecha/cuántos/quiénes,
 *   · y el fallo del log jamás revierte un borrado ya hecho.
 *
 * Mocks de BD, sin conexión real (patrón de crud_entities.test.js).
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([[]]),
}));
jest.mock('../src/middleware/logger', () => ({
    logManualActivity: jest.fn().mockResolvedValue(undefined),
    // index.js monta activityLogger como middleware global: sin él, app no carga.
    activityLogger: (req, res, next) => next(),
    resolveEntidad: jest.fn(),
}));

const request = require('supertest');
const app = require('../index');
const db = require('../src/config/db');
const { logManualActivity } = require('../src/middleware/logger');
const svc = require('../src/services/asistencia.service');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'secret';
const makeToken = (permisos) =>
    jwt.sign({ id: 9, email: 'op@lols.cl', rol_id: 1, rv: 1, p: permisos }, SECRET);

const FILAS = [
    { id: 11, trabajador_id: 1, obra_id: 5, estado_id: 1, horas_extra: 2, observacion: 'llegó tarde' },
    { id: 12, trabajador_id: 2, obra_id: 5, estado_id: 1, horas_extra: 0, observacion: null },
    { id: 13, trabajador_id: 2, obra_id: 7, estado_id: 1, horas_extra: null, observacion: null },   // duplicado cross-obra
];

/** Respuesta del aviso de períodos cuando no hay ninguno activo. */
const SIN_PERIODOS = [[{ n: 0 }]];

describe('asistenciaService.borrarDia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('sin obra borra TODAS las filas del día (duplicados cross-obra incluidos)', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])                                    // SELECT
            .mockResolvedValueOnce([{ affectedRows: 3 }])                      // DELETE
            .mockResolvedValueOnce(SIN_PERIODOS)                               // aviso períodos
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }, { id: 2, nombres: 'Luis', apellido_paterno: 'Rev' }]]);

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2] }, 9, {});

        expect(r).toEqual({ borrados: 3, trabajadores: 2, con_periodo: 0, traslados_restantes: 0 });
        const [selSql, selParams] = db.query.mock.calls[0];
        expect(selSql).not.toMatch(/obra_id = \?/);
        expect(selParams).toEqual(['2026-08-27', [1, 2]]);
        // El DELETE va por ids exactos del SELECT — nunca re-evalúa el WHERE.
        const [delSql, delParams] = db.query.mock.calls[1];
        expect(delSql).toMatch(/DELETE FROM asistencias WHERE id IN/);
        expect(delParams).toEqual([[11, 12, 13]]);
    });

    test('con obra_id borra el DÍA del trabajador: esa obra + filas ≠TO de otras obras; el TO ajeno vive y se avisa', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])                                    // SELECT (incluye la cross-obra 13)
            .mockResolvedValueOnce([{ affectedRows: 3 }])                      // DELETE
            .mockResolvedValueOnce(SIN_PERIODOS)                               // aviso períodos
            .mockResolvedValueOnce([[{ n: 1 }]])                               // TO vivo en otra obra
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }]]);

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2], obra_id: 5 }, 9, {});

        const [selSql, selParams] = db.query.mock.calls[0];
        // Regla fila-vigente (v2, caso TOESCA): las filas del día en OTRAS obras son
        // duplicados/errores por definición y también caen — salvo el TO del traslado.
        expect(selSql).toMatch(/AND \(obra_id = \? OR estado_id <> \(SELECT id FROM estados_asistencia WHERE codigo = 'TO'\)\)/);
        expect(selParams).toEqual(['2026-08-27', [1, 2], 5]);
        // El DELETE sigue siendo por ids exactos del snapshot (race-safe).
        const [delSql, delParams] = db.query.mock.calls[1];
        expect(delSql).toMatch(/DELETE FROM asistencias WHERE id IN/);
        expect(delParams).toEqual([[11, 12, 13]]);
        // Aviso: el TO del origen queda vivo a propósito.
        expect(r.traslados_restantes).toBe(1);
        const [toSql] = db.query.mock.calls[3];
        expect(toSql).toMatch(/ea\.codigo = 'TO'/);
        expect(toSql).toMatch(/a\.obra_id <> \?/);
    });

    test('avisa cuántos trabajadores tienen un período activo que cubre el día', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])
            .mockResolvedValueOnce([{ affectedRows: 3 }])
            .mockResolvedValueOnce([[{ n: 2 }]])                               // 2 con período
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }]]);

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2] }, 9, {});
        expect(r.con_periodo).toBe(2);
        const [perSql, perParams] = db.query.mock.calls[2];
        expect(perSql).toMatch(/periodos_ausencia/);
        expect(perSql).toMatch(/BETWEEN p\.fecha_inicio AND p\.fecha_fin/);
        expect(perParams).toEqual([[1, 2], '2026-08-27']);
    });

    test('sin filas que borrar: no ejecuta DELETE y devuelve 0', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1] }, 9, {});
        expect(r).toEqual({ borrados: 0, trabajadores: 0, con_periodo: 0, traslados_restantes: 0 });
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(logManualActivity).not.toHaveBeenCalled();
    });

    test('queda auditado con snapshot restaurable por fila', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])
            .mockResolvedValueOnce([{ affectedRows: 3 }])
            .mockResolvedValueOnce(SIN_PERIODOS)
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }, { id: 2, nombres: 'Luis', apellido_paterno: 'Rev' }]]);

        await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2] }, 9, { ip: 'x' });

        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const [userId, entidad, accion, , detalle] = logManualActivity.mock.calls[0];
        expect([userId, entidad, accion]).toEqual([9, 'asistencias', 'DELETE']);
        const d = JSON.parse(detalle);
        expect(d.fecha).toBe('2026-08-27');
        expect(d.registros_borrados).toBe(3);
        expect(d.trabajadores).toEqual(['Ana Soto', 'Luis Rev']);
        expect(d.resumen).toMatch(/Borrado correctivo: 3 registro/);
        // Snapshot por fila: con él se puede reconstruir a mano lo borrado.
        expect(d.filas).toEqual([
            { trabajador_id: 1, obra_id: 5, estado_id: 1, horas_extra: 2, observacion: 'llegó tarde' },
            { trabajador_id: 2, obra_id: 5, estado_id: 1 },
            { trabajador_id: 2, obra_id: 7, estado_id: 1 },
        ]);
    });

    test('si el lookup de NOMBRES falla, igual queda log con los ids (nunca sin rastro)', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])
            .mockResolvedValueOnce([{ affectedRows: 3 }])
            .mockResolvedValueOnce(SIN_PERIODOS)
            .mockRejectedValueOnce(new Error('trabajadores caído'));

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2] }, 9, {});
        expect(r.borrados).toBe(3);
        expect(logManualActivity).toHaveBeenCalledTimes(1);
        const d = JSON.parse(logManualActivity.mock.calls[0][4]);
        expect(d.trabajadores).toEqual([1, 2]);   // ids como fallback
    });

    test('si fallan los avisos informativos (períodos), el borrado responde igual', async () => {
        db.query
            .mockResolvedValueOnce([FILAS])
            .mockResolvedValueOnce([{ affectedRows: 3 }])
            .mockRejectedValueOnce(new Error('periodos caído'))
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }]]);

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2] }, 9, {});
        expect(r.borrados).toBe(3);
        expect(r.con_periodo).toBe(0);
    });

    test('valida fecha, ids y tope de 500', async () => {
        await expect(svc.borrarDia({ fecha: '27-08-2026', trabajador_ids: [1] }, 9, {})).rejects.toThrow(/Fecha inválida/);
        await expect(svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [] }, 9, {})).rejects.toThrow(/lista de ids/);
        await expect(svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [0] }, 9, {})).rejects.toThrow(/lista de ids/);
        await expect(svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: ['x'] }, 9, {})).rejects.toThrow(/lista de ids/);
        const muchos = Array.from({ length: 501 }, (_, i) => i + 1);
        await expect(svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: muchos }, 9, {})).rejects.toThrow(/Máximo: 500/);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('ids duplicados se deduplican antes de consultar', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [7, 7, 7] }, 9, {});
        expect(db.query.mock.calls[0][1]).toEqual(['2026-08-27', [7]]);
    });
});

describe('asistenciaService.getBorrables', () => {
    beforeEach(() => jest.clearAllMocks());

    const ROWS = [
        // Ana: fila en la obra 5 (miembro actual, activa).
        { trabajador_id: 1, obra_id: 5, estado_codigo: 'A', nombres: 'Ana', apellido_paterno: 'Soto', rut: '1-9', activo: true, obra_actual_id: 5, obra_nombre: 'TOESCA', obra_actual_nombre: 'TOESCA' },
        // Luis: miembro actual de la 5 pero su fila del día vive en la obra 7 (caso TOESCA).
        { trabajador_id: 2, obra_id: 7, estado_codigo: 'A', nombres: 'Luis', apellido_paterno: 'Rev', rut: '2-7', activo: true, obra_actual_id: 5, obra_nombre: 'DOMEYKO', obra_actual_nombre: 'TOESCA' },
        // Pedro: FINIQUITADO con fila en la obra 5 + par TO en la 7.
        { trabajador_id: 3, obra_id: 5, estado_codigo: 'A', nombres: 'Pedro', apellido_paterno: 'Paz', rut: '3-5', activo: false, obra_actual_id: 9, obra_nombre: 'TOESCA', obra_actual_nombre: 'OTRA' },
        { trabajador_id: 3, obra_id: 7, estado_codigo: 'TO', nombres: 'Pedro', apellido_paterno: 'Paz', rut: '3-5', activo: false, obra_actual_id: 9, obra_nombre: 'DOMEYKO', obra_actual_nombre: 'OTRA' },
    ];

    test('con obra: incluye filas EN la obra y filas de MIEMBROS de la obra en otras obras; sin filtro de activos', async () => {
        db.query.mockResolvedValueOnce([ROWS]);
        const r = await svc.getBorrables('2026-08-27', 5);

        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toMatch(/\(a\.obra_id = \? OR t\.obra_id = \?\)/);
        expect(sql).toMatch(/t\.es_prueba = 0/);
        // Los finiquitados con filas DEBEN aparecer (el Excel los pinta; antes eran
        // imborrables). t.activo va como COLUMNA (para el badge), nunca como filtro.
        expect(sql).not.toMatch(/t\.activo\s*=/);
        expect(params).toEqual(['2026-08-27', 5, 5]);

        expect(r).toHaveLength(3);
        const luis = r.find(i => i.trabajador_id === 2);
        expect(luis.filas).toEqual([{ obra_id: 7, obra_nombre: 'DOMEYKO', estado_codigo: 'A', es_to: false }]);
        const pedro = r.find(i => i.trabajador_id === 3);
        expect(pedro.activo).toBe(false);
        expect(pedro.filas).toHaveLength(2);
        expect(pedro.filas[1]).toEqual({ obra_id: 7, obra_nombre: 'DOMEYKO', estado_codigo: 'TO', es_to: true });
    });

    test('sin obra (Reporte Global): todas las filas del día, sin scope', async () => {
        db.query.mockResolvedValueOnce([ROWS]);
        await svc.getBorrables('2026-08-27');
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).not.toMatch(/a\.obra_id = \?/);
        expect(params).toEqual(['2026-08-27']);
    });

    test('fecha inválida → 400 sin tocar la BD', async () => {
        await expect(svc.getBorrables('27-08-2026', 5)).rejects.toThrow(/Fecha inválida/);
        expect(db.query).not.toHaveBeenCalled();
    });
});

describe('GET /api/asistencias/borrables — gate de permiso', () => {
    beforeEach(() => jest.clearAllMocks());

    test('403 sin asistencia.guardar', async () => {
        const res = await request(app)
            .get('/api/asistencias/borrables?fecha=2026-08-27&obra_id=5')
            .set('Authorization', 'Bearer ' + makeToken(['asistencia.ver']));
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('con asistencia.guardar responde la lista agrupada', async () => {
        db.query.mockResolvedValueOnce([[
            { trabajador_id: 1, obra_id: 5, estado_codigo: 'A', nombres: 'Ana', apellido_paterno: 'Soto', rut: '1-9', activo: true, obra_actual_id: 5, obra_nombre: 'TOESCA', obra_actual_nombre: 'TOESCA' },
        ]]);
        const res = await request(app)
            .get('/api/asistencias/borrables?fecha=2026-08-27&obra_id=5')
            .set('Authorization', 'Bearer ' + makeToken(['asistencia.guardar']));
        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({ trabajador_id: 1, nombre: 'Soto Ana', activo: true });
    });
});

describe('POST /api/asistencias/borrar-dia — gate de permiso', () => {
    beforeEach(() => jest.clearAllMocks());

    test('403 sin asistencia.guardar', async () => {
        const res = await request(app)
            .post('/api/asistencias/borrar-dia')
            .set('Authorization', 'Bearer ' + makeToken(['asistencia.ver']))
            .send({ fecha: '2026-08-27', trabajador_ids: [1] });
        expect(res.status).toBe(403);
        expect(db.query).not.toHaveBeenCalled();
    });

    test('con asistencia.guardar borra y responde el conteo', async () => {
        db.query
            .mockResolvedValueOnce([FILAS.slice(0, 1)])
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce(SIN_PERIODOS)
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }]]);

        const res = await request(app)
            .post('/api/asistencias/borrar-dia')
            .set('Authorization', 'Bearer ' + makeToken(['asistencia.guardar']))
            .send({ fecha: '2026-08-27', trabajador_ids: [1] });

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual({ borrados: 1, trabajadores: 1, con_periodo: 0, traslados_restantes: 0 });
    });
});

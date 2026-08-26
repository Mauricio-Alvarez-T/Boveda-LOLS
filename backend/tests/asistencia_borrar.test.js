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

    test('con obra_id el alcance queda scopeado a esa obra y detecta TO restantes', async () => {
        db.query
            .mockResolvedValueOnce([FILAS.slice(0, 2)])                        // SELECT
            .mockResolvedValueOnce([{ affectedRows: 2 }])                      // DELETE
            .mockResolvedValueOnce(SIN_PERIODOS)                               // aviso períodos
            .mockResolvedValueOnce([[{ n: 1 }]])                               // TO vivo en otra obra
            .mockResolvedValueOnce([[{ id: 1, nombres: 'Ana', apellido_paterno: 'Soto' }]]);

        const r = await svc.borrarDia({ fecha: '2026-08-27', trabajador_ids: [1, 2], obra_id: 5 }, 9, {});

        const [selSql, selParams] = db.query.mock.calls[0];
        expect(selSql).toMatch(/AND obra_id = \?/);
        expect(selParams).toEqual(['2026-08-27', [1, 2], 5]);
        // Aviso: al borrar solo el lado de una obra puede quedar el TO del origen vivo.
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

jest.mock('../src/config/db', () => {
    const queryMock = jest.fn();
    const connQueryMock = jest.fn();
    const beginTransactionMock = jest.fn().mockResolvedValue();
    const commitMock = jest.fn().mockResolvedValue();
    const rollbackMock = jest.fn().mockResolvedValue();
    const releaseMock = jest.fn();
    const getConnectionMock = jest.fn().mockResolvedValue({
        query: connQueryMock,
        beginTransaction: beginTransactionMock,
        commit: commitMock,
        rollback: rollbackMock,
        release: releaseMock,
    });
    return {
        query: queryMock,
        getConnection: getConnectionMock,
        __mocks: { queryMock, connQueryMock, beginTransactionMock, commitMock, rollbackMock, releaseMock, getConnectionMock },
    };
});

const service = require('../src/services/actividadesSugeridas.service');
const db = require('../src/config/db');
const { queryMock, connQueryMock, commitMock, rollbackMock } = db.__mocks;

const iso = (d) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};
/** Lunes de la semana en curso (hoy puede ser cualquier día, incluso viernes o domingo). */
function lunesActual() {
    const d = new Date(); d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
}
const sumarDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

const SEMANA_ACTUAL = iso(lunesActual());
const SEMANA_PROXIMA = iso(sumarDias(lunesActual(), 7));
const SEMANA_PASADA = iso(sumarDias(lunesActual(), -7));
const SEMANA_ANTEPASADA = iso(sumarDias(lunesActual(), -14));
const MARTES_PROXIMO = iso(sumarDias(lunesActual(), 8));
const SEMANA_LEJANA = iso(sumarDias(lunesActual(), 7 * 60));

/**
 * Mock helper para `crearLista`. Encadena las consultas en orden:
 *   1. SELECT FOR UPDATE (lock obra+semana) — vacío
 *   2. SELECT obras — activa
 *   3. SELECT trabajadores — todos activos
 *   4. INSERT cabecera — insertId
 *   5. INSERT detalle — affectedRows
 * (Ya no hay consulta a feriados: una semana no "coincide" con un feriado.)
 */
function mockCrearOk(insertId = 99, trabajadores = [{ id: 10 }]) {
    connQueryMock
        .mockResolvedValueOnce([[]])
        .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
        .mockResolvedValueOnce([trabajadores.map(t => ({ id: t.id, activo: 1, fecha_desvinculacion: null }))])
        .mockResolvedValueOnce([{ insertId }])
        .mockResolvedValueOnce([{ affectedRows: trabajadores.length }]);
}

describe('ActividadesSugeridas Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        connQueryMock.mockReset();
        queryMock.mockReset();
    });

    describe('validarSemana', () => {
        const { validarSemana } = service._internal;

        test('acepta el lunes de la semana en curso aunque hoy sea viernes o domingo', () => {
            expect(() => validarSemana(SEMANA_ACTUAL)).not.toThrow();
        });

        test('acepta el lunes de la próxima semana', () => {
            expect(() => validarSemana(SEMANA_PROXIMA)).not.toThrow();
        });

        test('rechaza una fecha que no es lunes', () => {
            expect(() => validarSemana(MARTES_PROXIMO)).toThrow(
                expect.objectContaining({ message: 'La semana debe indicarse por su lunes', statusCode: 400 })
            );
        });

        test('acepta la semana pasada (se arma el lunes siguiente a la actividad)', () => {
            expect(() => validarSemana(SEMANA_PASADA)).not.toThrow();
        });

        test('rechaza la semana antepasada', () => {
            expect(() => validarSemana(SEMANA_ANTEPASADA)).toThrow(
                expect.objectContaining({ message: 'Solo se puede armar la lista desde la semana pasada en adelante', statusCode: 400 })
            );
        });

        test('rechaza más de 1 año adelante', () => {
            expect(() => validarSemana(SEMANA_LEJANA)).toThrow(
                expect.objectContaining({ message: expect.stringMatching(/demasiado lejana/i), statusCode: 400 })
            );
        });

        test('rechaza basura', () => {
            expect(() => validarSemana('no-es-fecha')).toThrow(expect.objectContaining({ message: 'Semana inválida' }));
        });

        test('ningún mensaje del service menciona sábado', () => {
            const fs = require('fs');
            const src = fs.readFileSync(require.resolve('../src/services/actividadesSugeridas.service'), 'utf8');
            expect(src).not.toMatch(/s[aá]bado/i);
            expect(src).not.toMatch(/sabados_extra/);
        });
    });

    describe('crearLista — validaciones', () => {
        test('rechaza semana que no es lunes', async () => {
            await expect(
                service.crearLista({ obra_id: 1, semana: MARTES_PROXIMO, trabajadores: [{ trabajador_id: 1 }] }, 1)
            ).rejects.toMatchObject({ message: 'La semana debe indicarse por su lunes', statusCode: 400 });
        });

        test('rechaza la semana antepasada', async () => {
            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_ANTEPASADA, trabajadores: [{ trabajador_id: 1 }] }, 1)
            ).rejects.toMatchObject({ message: 'Solo se puede armar la lista desde la semana pasada en adelante', statusCode: 400 });
        });

        test('rechaza si falta obra_id o semana', async () => {
            await expect(
                service.crearLista({ semana: SEMANA_PROXIMA, trabajadores: [{ trabajador_id: 1 }] }, 1)
            ).rejects.toMatchObject({ message: 'obra_id y semana son requeridos', statusCode: 400 });
            await expect(
                service.crearLista({ obra_id: 1, trabajadores: [{ trabajador_id: 1 }] }, 1)
            ).rejects.toMatchObject({ message: 'obra_id y semana son requeridos', statusCode: 400 });
        });

        test('rechaza si trabajadores está vacío', async () => {
            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: [] }, 1)
            ).rejects.toMatchObject({ message: /al menos 1 trabajador/i, statusCode: 400 });
        });

        test('rechaza si trabajadores excede 500', async () => {
            const huge = Array.from({ length: 501 }, (_, i) => ({ trabajador_id: i + 1 }));
            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: huge }, 1)
            ).rejects.toMatchObject({ message: /Demasiados trabajadores/, statusCode: 400 });
        });

        test('rechaza obra inactiva', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ id: 1, activa: 0 }]]);
            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: [{ trabajador_id: 10 }] }, 1)
            ).rejects.toMatchObject({ message: /obra inactiva/i, statusCode: 400 });
        });

        test('rechaza trabajadores finiquitados', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[
                    { id: 10, activo: 1, fecha_desvinculacion: null },
                    { id: 11, activo: 0, fecha_desvinculacion: '2026-04-15' },
                ]]);
            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: [{ trabajador_id: 10 }, { trabajador_id: 11 }] }, 1)
            ).rejects.toMatchObject({ message: /inactivos o finiquitados/i, statusCode: 400 });
        });

        test('no consulta feriados: la semana no se cruza con la tabla feriados', async () => {
            mockCrearOk(7, [{ id: 10 }]);
            await service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: [{ trabajador_id: 10 }] }, 1);
            const sqls = connQueryMock.mock.calls.map(c => c[0]);
            expect(sqls.some(s => /feriados/i.test(s))).toBe(false);
        });

        test('crea lista válida (lock por obra+semana, INSERT con semana) y commitea', async () => {
            mockCrearOk(99, [{ id: 10 }, { id: 11 }]);
            const result = await service.crearLista(
                {
                    obra_id: 1,
                    semana: SEMANA_PROXIMA,
                    observaciones_globales: 'Avance losa',
                    observaciones_por_cargo: { 3: 'Tejer muros' },
                    trabajadores: [
                        { trabajador_id: 10, obra_origen_id: 1 },
                        { trabajador_id: 11, obra_origen_id: 2 },
                    ],
                },
                42
            );
            expect(result).toEqual({ id: 99 });
            expect(commitMock).toHaveBeenCalled();

            const [lockSql, lockParams] = connQueryMock.mock.calls[0];
            expect(lockSql).toMatch(/FROM actividades_sugeridas WHERE obra_id = \? AND semana = \? FOR UPDATE/);
            expect(lockParams).toEqual([1, SEMANA_PROXIMA]);

            const [insSql, insParams] = connQueryMock.mock.calls[3];
            expect(insSql).toMatch(/INSERT INTO actividades_sugeridas\s*\(obra_id, semana,/);
            expect(insParams[1]).toBe(SEMANA_PROXIMA);

            const [detSql] = connQueryMock.mock.calls[4];
            expect(detSql).toMatch(/INSERT INTO actividades_sugeridas_trabajadores\s*\(actividad_id,/);
        });

        // Mig 135 (dueño 2026-10-23): una lista cancelada libera la semana de su obra.
        test('crea aunque esa obra y semana tenga una lista CANCELADA (la conserva)', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ id: 5, estado: 'cancelada' }]])
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[{ id: 10, activo: 1, fecha_desvinculacion: null }]])
                .mockResolvedValueOnce([{ insertId: 77 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);

            const result = await service.crearLista(
                { obra_id: 1, semana: SEMANA_ACTUAL, trabajadores: [{ trabajador_id: 10 }] }, 1
            );
            expect(result).toEqual({ id: 77 });
            expect(commitMock).toHaveBeenCalled();
            const sqls = connQueryMock.mock.calls.map(c => c[0]);
            // No toca la cancelada: ni la borra ni la reactiva.
            expect(sqls.some(s => /DELETE FROM actividades_sugeridas\b/i.test(s))).toBe(false);
            expect(sqls.some(s => /UPDATE actividades_sugeridas\b/i.test(s))).toBe(false);
        });

        test('409 sin INSERT si ya hay una lista ACTIVA (Creada o Realizada) en esa obra y semana', async () => {
            for (const estado of ['citada', 'realizada']) {
                connQueryMock.mockReset();
                rollbackMock.mockClear();
                connQueryMock.mockResolvedValueOnce([[{ id: 5, estado: 'cancelada' }, { id: 6, estado }]]);

                await expect(
                    service.crearLista({ obra_id: 1, semana: SEMANA_ACTUAL, trabajadores: [{ trabajador_id: 10 }] }, 1)
                ).rejects.toMatchObject({ statusCode: 409, message: 'Ya existe una lista para esta obra en esa semana' });
                const sqls = connQueryMock.mock.calls.map(c => c[0]);
                expect(sqls.some(s => /INSERT INTO actividades_sugeridas/i.test(s))).toBe(false);
                expect(rollbackMock).toHaveBeenCalled();
            }
        });

        test('mapea ER_DUP_ENTRY a 409 con mensaje de semana', async () => {
            const dupErr = new Error('Duplicate');
            dupErr.code = 'ER_DUP_ENTRY';
            connQueryMock
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[{ id: 10, activo: 1, fecha_desvinculacion: null }]])
                .mockRejectedValueOnce(dupErr);

            await expect(
                service.crearLista({ obra_id: 1, semana: SEMANA_PROXIMA, trabajadores: [{ trabajador_id: 10 }] }, 1)
            ).rejects.toMatchObject({
                message: 'Ya existe una lista para esta obra en esa semana',
                statusCode: 409,
            });
            expect(rollbackMock).toHaveBeenCalled();
        });
    });

    describe('listar', () => {
        test('filtra por s.semana BETWEEN (rango plano del mes) y ordena por semana', async () => {
            queryMock.mockResolvedValueOnce([[]]);
            await service.listar({ obra_id: 3, mes: 9, anio: 2026 });
            const [sql, params] = queryMock.mock.calls[0];
            expect(sql).toMatch(/FROM actividades_sugeridas s/);
            expect(sql).toMatch(/LEFT JOIN actividades_sugeridas_trabajadores t ON t\.actividad_id = s\.id/);
            expect(sql).toMatch(/s\.semana BETWEEN \? AND \?/);
            expect(sql).toMatch(/ORDER BY s\.semana DESC/);
            expect(params).toEqual([3, '2026-09-01', '2026-09-30']);
        });
    });

    describe('editarLista', () => {
        test('409 si la lista no está en estado citada', async () => {
            connQueryMock.mockResolvedValueOnce([[{ estado: 'realizada', obra_id: 1, semana: SEMANA_PROXIMA }]]);
            await expect(
                service.editarLista(5, { trabajadores: [{ trabajador_id: 10 }] }, 1)
            ).rejects.toMatchObject({ statusCode: 409, message: /estado "citada"/ });
        });
    });

    describe('registrarAsistencia', () => {
        test('404 si la lista no existe', async () => {
            connQueryMock.mockResolvedValueOnce([[]]);
            await expect(
                service.registrarAsistencia(999, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 404, message: 'Lista no encontrada' });
        });

        test('rechaza si la lista está cancelada', async () => {
            connQueryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            await expect(
                service.registrarAsistencia(5, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        test('registro sin horas: el UPDATE de detalle no toca horas_trabajadas y usa actividad_id', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ estado: 'citada' }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ trabajador_id: 10 }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            await service.registrarAsistencia(
                5,
                { trabajadores: [{ trabajador_id: 10, asistio: 1, observacion: 'llegó tarde' }] },
                1
            );
            const updateCall = connQueryMock.mock.calls.find(c => /UPDATE actividades_sugeridas_trabajadores/i.test(c[0]));
            expect(updateCall[0]).not.toMatch(/horas_trabajadas/);
            expect(updateCall[0]).toMatch(/WHERE actividad_id = \? AND trabajador_id = \?/);
            const updateCabecera = connQueryMock.mock.calls.find(c => /UPDATE actividades_sugeridas\s/i.test(c[0]));
            expect(updateCabecera[0]).not.toMatch(/horas_default/);
        });
    });

    describe('cancelar', () => {
        test('404 si no existe', async () => {
            connQueryMock.mockResolvedValueOnce([[]]);
            await expect(service.cancelar(999, 1)).rejects.toMatchObject({ statusCode: 404 });
        });

        test('idempotente si ya está cancelada', async () => {
            connQueryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            const result = await service.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
            expect(commitMock).toHaveBeenCalled();
        });

        test('cancela lista activa: marca cabecera y trabajadores', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ estado: 'citada' }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 5 }]);
            const result = await service.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
            const updateTrbs = connQueryMock.mock.calls[2];
            expect(updateTrbs[0]).toMatch(/UPDATE actividades_sugeridas_trabajadores[\s\S]*estado = 'cancelado'[\s\S]*WHERE actividad_id = \?/);
        });
    });

    describe('eliminar (borrado definitivo, jefatura 2026-10-26)', () => {
        test('404 si no existe, sin borrar nada y con rollback', async () => {
            connQueryMock.mockResolvedValueOnce([[]]);
            await expect(service.eliminar(999)).rejects.toMatchObject({ statusCode: 404 });
            expect(connQueryMock.mock.calls.some(c => /DELETE/.test(c[0]))).toBe(false);
            expect(rollbackMock).toHaveBeenCalled();
            expect(commitMock).not.toHaveBeenCalled();
        });

        test('borra una lista REALIZADA: trabajadores y cabecera, devuelve lo borrado', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ id: 7, obra_id: 3, semana: new Date(2026, 9, 19), estado: 'realizada', obra_nombre: 'TOESCA 2770' }]])
                .mockResolvedValueOnce([[{ trabajadores: 10, asistieron: '10' }]])
                .mockResolvedValueOnce([{ affectedRows: 10 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            const r = await service.eliminar(7);
            expect(r).toEqual({
                id: 7, obra_id: 3, obra_nombre: 'TOESCA 2770', semana: '2026-10-19',
                estado: 'realizada', trabajadores: 10, asistieron: 10,
            });
            const sqls = connQueryMock.mock.calls.map(c => c[0]);
            expect(sqls[0]).toMatch(/FROM actividades_sugeridas s[\s\S]*WHERE s\.id = \? FOR UPDATE/);
            expect(sqls[2]).toMatch(/DELETE FROM actividades_sugeridas_trabajadores WHERE actividad_id = \?/);
            expect(sqls[3]).toMatch(/DELETE FROM actividades_sugeridas WHERE id = \?/);
            expect(connQueryMock.mock.calls[3][1]).toEqual([7]);
            expect(commitMock).toHaveBeenCalled();
        });

        test('también borra una cancelada (sin trabajadores asistentes)', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ id: 8, obra_id: 3, semana: '2026-10-19', estado: 'cancelada', obra_nombre: null }]])
                .mockResolvedValueOnce([[{ trabajadores: 0, asistieron: null }]])
                .mockResolvedValueOnce([{ affectedRows: 0 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            const r = await service.eliminar(8);
            expect(r).toMatchObject({ estado: 'cancelada', trabajadores: 0, asistieron: 0, obra_nombre: null });
        });
    });
});

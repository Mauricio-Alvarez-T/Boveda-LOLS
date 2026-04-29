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

const sabadosExtraService = require('../src/services/sabadosExtra.service');
const db = require('../src/config/db');
const { queryMock, connQueryMock, commitMock, rollbackMock } = db.__mocks;

/**
 * Mock helper para `crearCitacion`. Encadena los SELECTs en orden:
 *   1. SELECT FOR UPDATE (lock obra+fecha) — vacío
 *   2. SELECT feriados — vacío
 *   3. SELECT obras — activa
 *   4. SELECT trabajadores — todos activos
 *   5. INSERT cabecera — insertId
 *   6. INSERT detalle — affectedRows
 */
function mockCrearOk(insertId = 99, trabajadores = [{ id: 10 }]) {
    connQueryMock
        .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE (no existe)
        .mockResolvedValueOnce([[]]) // SELECT feriados — no es feriado
        .mockResolvedValueOnce([[{ id: 1, activa: 1 }]]) // SELECT obras
        .mockResolvedValueOnce([trabajadores.map(t => ({ id: t.id, activo: 1, fecha_desvinculacion: null }))])
        .mockResolvedValueOnce([{ insertId }]) // INSERT cabecera
        .mockResolvedValueOnce([{ affectedRows: trabajadores.length }]); // INSERT detalle
}

describe('SabadosExtra Service', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    // ─────────────────────────────────────────────
    // crearCitacion — validaciones
    // ─────────────────────────────────────────────
    describe('crearCitacion — validaciones', () => {
        test('rechaza fecha que no es sábado (24/04/2026 = viernes)', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-04-24', trabajadores: [{ trabajador_id: 1 }] },
                    1
                )
            ).rejects.toMatchObject({ message: 'La fecha debe ser sábado', statusCode: 400 });
        });

        test('rechaza fecha pasada (sábado pero anterior a hoy)', async () => {
            // 03/01/2026 fue sábado y ya pasó (hoy=2026-04-29 según contexto)
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-01-03', trabajadores: [{ trabajador_id: 1 }] },
                    1
                )
            ).rejects.toMatchObject({ message: 'No se permite fecha pasada', statusCode: 400 });
        });

        test('rechaza fecha más de 1 año adelante', async () => {
            // 2 años hacia adelante
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2028-04-29', trabajadores: [{ trabajador_id: 1 }] },
                    1
                )
            ).rejects.toMatchObject({ message: /demasiado lejana/i, statusCode: 400 });
        });

        test('rechaza si falta obra_id', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { fecha: '2026-05-02', trabajadores: [{ trabajador_id: 1 }] },
                    1
                )
            ).rejects.toMatchObject({ message: 'obra_id y fecha son requeridos', statusCode: 400 });
        });

        test('rechaza si trabajadores está vacío', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: [] },
                    1
                )
            ).rejects.toMatchObject({ message: /al menos 1 trabajador/i, statusCode: 400 });
        });

        test('rechaza si trabajadores excede 500', async () => {
            const huge = Array.from({ length: 501 }, (_, i) => ({ trabajador_id: i + 1 }));
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: huge },
                    1
                )
            ).rejects.toMatchObject({ message: /Demasiados trabajadores/, statusCode: 400 });
        });

        test('rechaza horas_default fuera de rango', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', horas_default: 30, trabajadores: [{ trabajador_id: 1 }] },
                    1
                )
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        test('rechaza obra inactiva', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
                .mockResolvedValueOnce([[]]) // feriados
                .mockResolvedValueOnce([[{ id: 1, activa: 0 }]]); // obra INACTIVA
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: [{ trabajador_id: 10 }] },
                    1
                )
            ).rejects.toMatchObject({ message: /obra inactiva/i, statusCode: 400 });
        });

        test('rechaza trabajadores finiquitados', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
                .mockResolvedValueOnce([[]]) // feriados
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[
                    { id: 10, activo: 1, fecha_desvinculacion: null },
                    { id: 11, activo: 0, fecha_desvinculacion: '2026-04-15' },
                ]]);
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: [{ trabajador_id: 10 }, { trabajador_id: 11 }] },
                    1
                )
            ).rejects.toMatchObject({ message: /inactivos o finiquitados/i, statusCode: 400 });
        });

        test('rechaza si la fecha es feriado y no se aceptó explícitamente', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
                .mockResolvedValueOnce([[{ id: 1, nombre: 'Día del Trabajador' }]]); // ES feriado
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: [{ trabajador_id: 10 }] },
                    1
                )
            ).rejects.toMatchObject({ message: /feriado/i, statusCode: 409 });
        });

        test('acepta feriado si se pasa flag acepta_feriado', async () => {
            connQueryMock
                .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
                .mockResolvedValueOnce([[{ id: 1, nombre: 'Día del Trabajador' }]]) // feriado pero...
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[{ id: 10, activo: 1, fecha_desvinculacion: null }]])
                .mockResolvedValueOnce([{ insertId: 50 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            const result = await sabadosExtraService.crearCitacion(
                { obra_id: 1, fecha: '2026-05-02', trabajadores: [{ trabajador_id: 10 }], acepta_feriado: true },
                1
            );
            expect(result).toEqual({ id: 50 });
        });

        test('crea citación válida y commitea', async () => {
            mockCrearOk(99, [{ id: 10 }, { id: 11 }]);
            const result = await sabadosExtraService.crearCitacion(
                {
                    obra_id: 1,
                    fecha: '2026-05-02',
                    horas_default: 8,
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
        });

        test('mapea ER_DUP_ENTRY a 409', async () => {
            const dupErr = new Error('Duplicate');
            dupErr.code = 'ER_DUP_ENTRY';
            connQueryMock
                .mockResolvedValueOnce([[]]) // SELECT FOR UPDATE
                .mockResolvedValueOnce([[]]) // feriados
                .mockResolvedValueOnce([[{ id: 1, activa: 1 }]])
                .mockResolvedValueOnce([[{ id: 10, activo: 1, fecha_desvinculacion: null }]])
                .mockRejectedValueOnce(dupErr); // INSERT cabecera lanza dup

            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-05-02', trabajadores: [{ trabajador_id: 10 }] },
                    1
                )
            ).rejects.toMatchObject({
                message: 'Ya existe una citación para esta obra y fecha',
                statusCode: 409,
            });
            expect(rollbackMock).toHaveBeenCalled();
        });
    });

    // ─────────────────────────────────────────────
    // registrarAsistencia
    // ─────────────────────────────────────────────
    describe('registrarAsistencia', () => {
        test('404 si la citación no existe', async () => {
            connQueryMock.mockResolvedValueOnce([[]]); // SELECT FOR UPDATE vacío
            await expect(
                sabadosExtraService.registrarAsistencia(999, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 404 });
        });

        test('rechaza si la citación está cancelada', async () => {
            connQueryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            await expect(
                sabadosExtraService.registrarAsistencia(5, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        test('rechaza horas individuales fuera de rango', async () => {
            await expect(
                sabadosExtraService.registrarAsistencia(
                    5,
                    { trabajadores: [{ trabajador_id: 10, asistio: 1, horas_trabajadas: 50 }] },
                    1
                )
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        test('parsea coma decimal (`5,5` → 5.5)', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ estado: 'citada' }]])      // SELECT FOR UPDATE
                .mockResolvedValueOnce([{ affectedRows: 1 }])         // UPDATE cabecera
                .mockResolvedValueOnce([[{ trabajador_id: 10 }]])     // existing
                .mockResolvedValueOnce([{ affectedRows: 1 }]);        // UPDATE detalle
            await sabadosExtraService.registrarAsistencia(
                5,
                { trabajadores: [{ trabajador_id: 10, asistio: 1, horas_trabajadas: '5,5' }] },
                1
            );
            // El mock UPDATE detalle recibió 5.5 como segundo elemento
            const updateCall = connQueryMock.mock.calls.find(c => /UPDATE sabados_extra_trabajadores/i.test(c[0]));
            expect(updateCall[1]).toContain(5.5);
        });
    });

    // ─────────────────────────────────────────────
    // cancelar
    // ─────────────────────────────────────────────
    describe('cancelar', () => {
        test('404 si no existe', async () => {
            connQueryMock.mockResolvedValueOnce([[]]); // SELECT FOR UPDATE vacío
            await expect(sabadosExtraService.cancelar(999, 1)).rejects.toMatchObject({ statusCode: 404 });
        });

        test('idempotente si ya está cancelada', async () => {
            connQueryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            const result = await sabadosExtraService.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
            expect(commitMock).toHaveBeenCalled();
        });

        test('cancela citación activa: marca cabecera y trabajadores', async () => {
            connQueryMock
                .mockResolvedValueOnce([[{ estado: 'citada' }]])  // SELECT FOR UPDATE
                .mockResolvedValueOnce([{ affectedRows: 1 }])     // UPDATE cabecera
                .mockResolvedValueOnce([{ affectedRows: 5 }]);    // UPDATE trabajadores
            const result = await sabadosExtraService.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
            // Verifica que el segundo UPDATE marca trabajadores como 'cancelado'
            const updateTrbs = connQueryMock.mock.calls[2];
            expect(updateTrbs[0]).toMatch(/UPDATE sabados_extra_trabajadores[\s\S]*estado = 'cancelado'/);
        });
    });

    // ─────────────────────────────────────────────
    // parseHoras (helper interno)
    // ─────────────────────────────────────────────
    describe('parseHoras (helper)', () => {
        const { parseHoras } = sabadosExtraService._internal;

        test('número pasa derecho', () => { expect(parseHoras(8)).toBe(8); });
        test('null retorna null', () => { expect(parseHoras(null)).toBeNull(); });
        test('coma decimal `5,5` → 5.5', () => { expect(parseHoras('5,5')).toBe(5.5); });
        test('punto decimal `5.5` → 5.5', () => { expect(parseHoras('5.5')).toBe(5.5); });
        test('string inválido → NaN', () => { expect(parseHoras('hola')).toBeNaN(); });
    });
});

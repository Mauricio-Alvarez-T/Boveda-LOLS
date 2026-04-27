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

describe('SabadosExtra Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('crearCitacion — validaciones', () => {
        test('rechaza fecha que no es sábado', async () => {
            // 25/04/2026 es sábado, 24/04/2026 es viernes
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-04-24', trabajadores: [] },
                    1
                )
            ).rejects.toMatchObject({ message: 'La fecha debe ser sábado', statusCode: 400 });
        });

        test('rechaza si falta obra_id', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { fecha: '2026-04-25', trabajadores: [] },
                    1
                )
            ).rejects.toMatchObject({ message: 'obra_id y fecha son requeridos', statusCode: 400 });
        });

        test('rechaza horas_default fuera de rango', async () => {
            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-04-25', horas_default: 30, trabajadores: [] },
                    1
                )
            ).rejects.toMatchObject({ statusCode: 400 });
        });

        test('crea citación válida (sábado real)', async () => {
            connQueryMock
                .mockResolvedValueOnce([{ insertId: 99 }])  // INSERT cabecera
                .mockResolvedValueOnce([{ affectedRows: 2 }]); // INSERT detalle

            const result = await sabadosExtraService.crearCitacion(
                {
                    obra_id: 1,
                    fecha: '2026-04-25',
                    horas_default: 8,
                    observaciones_globales: 'Avance losa',
                    observaciones_por_cargo: { 3: 'Tejer muros', 5: 'Fondos vigas' },
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
            connQueryMock.mockRejectedValueOnce(dupErr);

            await expect(
                sabadosExtraService.crearCitacion(
                    { obra_id: 1, fecha: '2026-04-25', trabajadores: [] },
                    1
                )
            ).rejects.toMatchObject({
                message: 'Ya existe una citación para esta obra y fecha',
                statusCode: 409,
            });
            expect(rollbackMock).toHaveBeenCalled();
        });
    });

    describe('registrarAsistencia — validaciones', () => {
        test('404 si la citación no existe', async () => {
            queryMock.mockResolvedValueOnce([[]]);
            await expect(
                sabadosExtraService.registrarAsistencia(999, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 404 });
        });

        test('rechaza si la citación está cancelada', async () => {
            queryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            await expect(
                sabadosExtraService.registrarAsistencia(5, { trabajadores: [] }, 1)
            ).rejects.toMatchObject({ statusCode: 409 });
        });

        test('rechaza horas individuales fuera de rango', async () => {
            queryMock.mockResolvedValueOnce([[{ estado: 'citada' }]]);
            await expect(
                sabadosExtraService.registrarAsistencia(
                    5,
                    { trabajadores: [{ trabajador_id: 10, asistio: 1, horas_trabajadas: 50 }] },
                    1
                )
            ).rejects.toMatchObject({ statusCode: 400 });
        });
    });

    describe('cancelar', () => {
        test('404 si no existe', async () => {
            queryMock.mockResolvedValueOnce([[]]);
            await expect(sabadosExtraService.cancelar(999, 1)).rejects.toMatchObject({ statusCode: 404 });
        });

        test('idempotente si ya está cancelada', async () => {
            queryMock.mockResolvedValueOnce([[{ estado: 'cancelada' }]]);
            const result = await sabadosExtraService.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
        });

        test('cancela una citación activa', async () => {
            queryMock
                .mockResolvedValueOnce([[{ estado: 'citada' }]])  // SELECT estado
                .mockResolvedValueOnce([{ affectedRows: 1 }]);    // UPDATE
            const result = await sabadosExtraService.cancelar(5, 1);
            expect(result).toEqual({ id: 5 });
            expect(queryMock).toHaveBeenCalledTimes(2);
        });
    });
});

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

/**
 * Mock de lookups usados por _logBulkChanges en orden:
 *   1) SELECT id, nombres, apellido_paterno FROM trabajadores WHERE id IN (?)
 *   2) SELECT id, nombre FROM estados_asistencia
 *   3) SELECT id, nombre FROM tipos_ausencia
 *   4) SELECT id, nombre FROM obras WHERE id IN (?)
 * Luego N × INSERT INTO logs_actividad (vía logManualActivity).
 */
const mockLookups = (workers, obras) => {
    db.query.mockReset();
    db.query
        .mockResolvedValueOnce([workers])   // trabajadores
        .mockResolvedValueOnce([[           // estados_asistencia
            { id: 1, nombre: 'Asiste' },
            { id: 2, nombre: 'Falta' },
            { id: 3, nombre: 'Permiso' },
        ]])
        .mockResolvedValueOnce([[]])        // tipos_ausencia
        .mockResolvedValueOnce([obras]);    // obras
    // INSERTs posteriores devuelven vacío por defecto
    db.query.mockResolvedValue([[]]);
};

const getInsertLogs = () =>
    db.query.mock.calls.filter(c => /INSERT INTO logs_actividad/.test(c[0]));

describe('asistenciaService._logBulkChanges — agrupación de logs', () => {
    beforeEach(() => jest.clearAllMocks());

    test('bulk de 5 trabajadores en 1 obra → 1 log bulk_asistencia', async () => {
        const workers = [
            { id: 1, nombres: 'JUAN',  apellido_paterno: 'PEREZ' },
            { id: 2, nombres: 'PEDRO', apellido_paterno: 'SOTO' },
            { id: 3, nombres: 'ANA',   apellido_paterno: 'ARAYA' },
            { id: 4, nombres: 'LUIS',  apellido_paterno: 'ZUÑIGA' },
            { id: 5, nombres: 'MARIA', apellido_paterno: 'MUÑOZ' },
        ];
        mockLookups(workers, [{ id: 10, nombre: 'BASCUÑAN 661' }]);

        const entries = workers.map(w => ({
            trabajador_id: w.id,
            asistencia_id: 100 + w.id,
            obra_id: 10,
            estado_id: 1,
            accion: 'CREATE',
            cambios: null,
            fecha: '2026-04-21',
        }));

        await asistenciaService._logBulkChanges(entries, 10, 99, null);

        const inserts = getInsertLogs();
        expect(inserts).toHaveLength(1);

        const [, params] = inserts[0];
        // params = [usuario_id, modulo, accion, item_id, detalle, ip, user_agent]
        expect(params[1]).toBe('asistencias');
        expect(params[2]).toBe('CREATE'); // todos CREATE
        expect(params[3]).toBe('obra_10');

        const payload = JSON.parse(params[4]);
        expect(payload.type).toBe('bulk_asistencia');
        expect(payload.obra_id).toBe(10);
        expect(payload.obra_nombre).toBe('BASCUÑAN 661');
        expect(payload.total).toBe(5);
        expect(payload.creados).toBe(5);
        expect(payload.actualizados).toBe(0);
        expect(payload.trabajadores).toHaveLength(5);
        // Orden alfabético por apellido paterno: ARAYA, MUÑOZ, PEREZ, SOTO, ZUÑIGA
        expect(payload.trabajadores.map(t => t.nombre)).toEqual([
            'ANA ARAYA', 'MARIA MUÑOZ', 'JUAN PEREZ', 'PEDRO SOTO', 'LUIS ZUÑIGA'
        ]);
        expect(payload.resumen).toMatch(/BASCUÑAN 661/);
    });

    test('1 solo trabajador → 1 log compact (sin type)', async () => {
        mockLookups(
            [{ id: 1, nombres: 'JUAN', apellido_paterno: 'PEREZ' }],
            [{ id: 10, nombre: 'BASCUÑAN 661' }]
        );

        const entries = [{
            trabajador_id: 1,
            asistencia_id: 101,
            obra_id: 10,
            estado_id: 1,
            accion: 'CREATE',
            cambios: null,
            fecha: '2026-04-21',
        }];

        await asistenciaService._logBulkChanges(entries, 10, 99, null);

        const inserts = getInsertLogs();
        expect(inserts).toHaveLength(1);

        const payload = JSON.parse(inserts[0][1][4]);
        expect(payload.type).toBeUndefined();
        expect(payload.resumen).toMatch(/JUAN PEREZ/);
        // item_id es el asistencia_id, no obra_X
        expect(inserts[0][1][3]).toBe(101);
    });

    test('multi-obra (3 + 4 trabajadores) → 2 logs bulk_asistencia', async () => {
        const workers = [
            { id: 1, nombres: 'JUAN',  apellido_paterno: 'PEREZ' },
            { id: 2, nombres: 'PEDRO', apellido_paterno: 'SOTO' },
            { id: 3, nombres: 'ANA',   apellido_paterno: 'ARAYA' },
            { id: 4, nombres: 'LUIS',  apellido_paterno: 'ZUÑIGA' },
            { id: 5, nombres: 'MARIA', apellido_paterno: 'MUÑOZ' },
            { id: 6, nombres: 'JOSE',  apellido_paterno: 'ROJAS' },
            { id: 7, nombres: 'ELENA', apellido_paterno: 'CASTRO' },
        ];
        mockLookups(workers, [
            { id: 10, nombre: 'OBRA A' },
            { id: 20, nombre: 'OBRA B' },
        ]);

        const mkEntry = (id, obra, accion = 'CREATE', cambios = null) => ({
            trabajador_id: id,
            asistencia_id: 100 + id,
            obra_id: obra,
            estado_id: 1,
            accion,
            cambios,
            fecha: '2026-04-21',
        });

        const entries = [
            mkEntry(1, 10), mkEntry(2, 10), mkEntry(3, 10),            // 3 en obra 10
            mkEntry(4, 20), mkEntry(5, 20),                             // 2 CREATE en obra 20
            mkEntry(6, 20, 'UPDATE', { estado_id: { de: 1, a: 2 } }),  // 1 UPDATE
            mkEntry(7, 20, 'UPDATE', { estado_id: { de: 1, a: 2 } }),  // 1 UPDATE
        ];

        await asistenciaService._logBulkChanges(entries, 'ALL', 99, null);

        const inserts = getInsertLogs();
        expect(inserts).toHaveLength(2);

        const payloads = inserts.map(i => JSON.parse(i[1][4]));
        const byObra = Object.fromEntries(payloads.map(p => [p.obra_id, p]));

        expect(byObra[10].type).toBe('bulk_asistencia');
        expect(byObra[10].total).toBe(3);
        expect(byObra[10].creados).toBe(3);
        expect(byObra[10].actualizados).toBe(0);

        expect(byObra[20].type).toBe('bulk_asistencia');
        expect(byObra[20].total).toBe(4);
        expect(byObra[20].creados).toBe(2);
        expect(byObra[20].actualizados).toBe(2);

        // accion del log: obra 10 todos CREATE → CREATE; obra 20 mixto → UPDATE
        const accionesPorObra = Object.fromEntries(
            inserts.map(i => [JSON.parse(i[1][4]).obra_id, i[1][2]])
        );
        expect(accionesPorObra[10]).toBe('CREATE');
        expect(accionesPorObra[20]).toBe('UPDATE');
    });

    test('UPDATE individual preserva formato compact con cambios legibles', async () => {
        mockLookups(
            [{ id: 1, nombres: 'JUAN', apellido_paterno: 'PEREZ' }],
            [{ id: 10, nombre: 'BASCUÑAN 661' }]
        );

        const entries = [{
            trabajador_id: 1,
            asistencia_id: 101,
            obra_id: 10,
            estado_id: 2,
            accion: 'UPDATE',
            cambios: { estado_id: { de: 1, a: 2 } },
            fecha: '2026-04-21',
        }];

        await asistenciaService._logBulkChanges(entries, 10, 99, null);

        const inserts = getInsertLogs();
        expect(inserts).toHaveLength(1);

        const params = inserts[0][1];
        expect(params[2]).toBe('UPDATE');
        const payload = JSON.parse(params[4]);
        expect(payload.type).toBeUndefined();
        expect(payload.trabajador).toBe('JUAN PEREZ');
        expect(payload.cambios.estado_id).toEqual({ de: 'Asiste', a: 'Falta' });
        expect(payload.resumen).toMatch(/Asiste/);
        expect(payload.resumen).toMatch(/Falta/);
    });
});

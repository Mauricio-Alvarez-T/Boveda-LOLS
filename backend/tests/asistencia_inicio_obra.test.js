/**
 * Primera lista de una obra «En preparación» → «Pasa lista desde» ese día (Marcos 2026-11-20, mig 156).
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn().mockResolvedValue([{ affectedRows: 1 }]),
    getConnection: jest.fn(),
}));

const asistenciaService = require('../src/services/asistencia.service');
const db = require('../src/config/db');

describe('_marcarInicioAsistencia', () => {
    beforeEach(() => jest.clearAllMocks());

    test('por obra, el día más antiguo de lo guardado; solo llena las que siguen en preparación', async () => {
        await asistenciaService._marcarInicioAsistencia([
            { trabajador_id: 1, obra_id: 7, fecha: '2026-11-17' },
            { trabajador_id: 2, obra_id: 7, fecha: '2026-11-16' },
            { trabajador_id: 3, obra_id: '9', fecha: '2026-11-18T00:00:00.000Z' },
        ]);
        expect(db.query).toHaveBeenCalledTimes(2);
        const [sql, params] = db.query.mock.calls[0];
        expect(sql).toContain('asistencia_desde IS NULL');
        expect(sql).toContain('participa_asistencia = 1');
        expect(params).toEqual(['2026-11-16', 7]);
        expect(db.query.mock.calls[1][1]).toEqual(['2026-11-18', 9]);
    });

    test('sin obra o sin fecha válida no hace nada; un error no rompe el guardado', async () => {
        await asistenciaService._marcarInicioAsistencia([{ obra_id: null, fecha: '2026-11-16' }, { obra_id: 3, fecha: '' }]);
        expect(db.query).not.toHaveBeenCalled();

        db.query.mockRejectedValueOnce(new Error('se cayó la base'));
        await expect(asistenciaService._marcarInicioAsistencia([{ obra_id: 3, fecha: '2026-11-16' }])).resolves.toBeUndefined();
    });
});

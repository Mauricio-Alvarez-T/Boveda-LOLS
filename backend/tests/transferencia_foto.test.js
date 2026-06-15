/**
 * Tests de las fotos OPCIONALES de recepción/discrepancia (Fase 3).
 * setFotoRecepcion/setFotoDiscrepancia usan db.query directo (sin transacción);
 * getRecepciones debe exponer foto_url.
 */
jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const transferenciaService = require('../src/services/transferencia.service');
const db = require('../src/config/db');

describe('transferenciaService — fotos opcionales (Fase 3)', () => {
    beforeEach(() => jest.clearAllMocks());

    test('setFotoRecepcion: valida pertenencia y persiste foto_url', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 7 }]])           // SELECT: recepción existe y pertenece a la TRF
            .mockResolvedValueOnce([{ affectedRows: 1 }]);  // UPDATE foto_url

        const res = await transferenciaService.setFotoRecepcion(3, 7, '/api/uploads/transferencias/x.jpg');

        expect(res).toEqual({ recepcion_id: 7, foto_url: '/api/uploads/transferencias/x.jpg' });
        const updateCall = db.query.mock.calls[1];
        expect(updateCall[0]).toMatch(/UPDATE transferencia_recepciones SET foto_url/);
        expect(updateCall[1]).toEqual(['/api/uploads/transferencias/x.jpg', 7]);
    });

    test('setFotoRecepcion: 404 si la recepción no pertenece a la transferencia (y no hace UPDATE)', async () => {
        db.query.mockResolvedValueOnce([[]]); // SELECT vacío
        await expect(
            transferenciaService.setFotoRecepcion(3, 999, '/x.jpg')
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(db.query).toHaveBeenCalledTimes(1); // no llegó al UPDATE
    });

    test('setFotoDiscrepancia: persiste foto_url', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 12 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }]);
        const res = await transferenciaService.setFotoDiscrepancia(12, '/api/uploads/transferencias/d.png');
        expect(res).toEqual({ discrepancia_id: 12, foto_url: '/api/uploads/transferencias/d.png' });
    });

    test('setFotoDiscrepancia: 404 si no existe', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(
            transferenciaService.setFotoDiscrepancia(999, '/x.jpg')
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    test('getRecepciones expone foto_url en cada recepción', async () => {
        db.query
            .mockResolvedValueOnce([[
                { id: 1, transferencia_id: 3, receptor_id: 9, fecha_recepcion: '2026-06-14', tipo: 'parcial', observacion: null, foto_url: '/api/uploads/transferencias/r.jpg', receptor_nombre: 'Juan' },
            ]])
            .mockResolvedValueOnce([[]]); // items de la recepción (vacío para el test)
        const res = await transferenciaService.getRecepciones(3);
        expect(res[0].foto_url).toBe('/api/uploads/transferencias/r.jpg');
    });
});

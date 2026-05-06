/**
 * Tests para items_custom (items personalizados fuera de catálogo).
 *
 * Cubre:
 *   · validación de shape (descripcion no vacía, cantidad >= 1)
 *   · solo permitido en flujo 'solicitud'
 *   · permite items vacíos si hay items_custom (al menos uno de los dos)
 *   · persiste en transferencia_items_custom dentro de la misma transacción
 *   · getById retorna items_custom
 */

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
    getConnection: jest.fn(),
}));

const transferenciaService = require('../src/services/transferencia.service');
const db = require('../src/config/db');

function makeConn() {
    return {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn(),
    };
}

describe('crear() — items_custom', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockReset();
        db.getConnection.mockReset();
    });

    test('rechaza si items e items_custom están vacíos', async () => {
        await expect(
            transferenciaService.crear({
                destino_bodega_id: 1,
                items: [],
                items_custom: [],
            }, 99)
        ).rejects.toThrow(/al menos un ítem/i);
    });

    test('rechaza item_custom sin descripcion', async () => {
        await expect(
            transferenciaService.crear({
                destino_bodega_id: 1,
                items: [],
                items_custom: [{ descripcion: '   ', cantidad: 5 }],
            }, 99)
        ).rejects.toThrow(/descripcion requerida/i);
    });

    test('rechaza item_custom con cantidad < 1', async () => {
        await expect(
            transferenciaService.crear({
                destino_bodega_id: 1,
                items: [],
                items_custom: [{ descripcion: 'Tornillos', cantidad: 0 }],
            }, 99)
        ).rejects.toThrow(/cantidad debe ser >= 1/i);
    });

    test('rechaza items_custom en flujo distinto a solicitud', async () => {
        await expect(
            transferenciaService.crear({
                destino_obra_id: 1,
                origen_obra_id: 2,
                items: [{ item_id: 5, cantidad: 1 }],
                items_custom: [{ descripcion: 'X', cantidad: 1 }],
                tipo_flujo: 'intra_obra',
            }, 99)
        ).rejects.toThrow(/solo permitidos en flujo de solicitud/i);
    });

    test('crea solicitud SOLO con items_custom (sin items de catálogo)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        // _generarCodigo usa db.query (no conn)
        db.query.mockResolvedValueOnce([[]]); // no hay códigos previos

        conn.query
            // INSERT INTO transferencias
            .mockResolvedValueOnce([{ insertId: 555 }])
            // INSERT INTO transferencia_items_custom (1ra)
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT INTO transferencia_items_custom (2da)
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await transferenciaService.crear({
            destino_bodega_id: 1,
            items: [],
            items_custom: [
                { descripcion: 'Tornillos hex 5mm', cantidad: 100, unidad: 'U' },
                { descripcion: 'Pegamento epoxi marca X', cantidad: 5, unidad: 'kg', observacion: 'Marca específica' },
            ],
        }, 99);

        expect(result).toEqual({ id: 555, codigo: expect.stringMatching(/^TRF-/) });
        expect(conn.commit).toHaveBeenCalled();

        // No debe haber SELECTs de validación de stock (no hay items normales)
        const stockSelects = conn.query.mock.calls.filter(c =>
            /FROM ubicaciones_stock/i.test(c[0])
        );
        expect(stockSelects).toHaveLength(0);

        // Debe haber 2 INSERT en transferencia_items_custom
        const customInserts = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_items_custom/i.test(c[0])
        );
        expect(customInserts).toHaveLength(2);
        expect(customInserts[0][1]).toEqual([555, 'Tornillos hex 5mm', 100, 'U', null]);
        expect(customInserts[1][1]).toEqual([555, 'Pegamento epoxi marca X', 5, 'kg', 'Marca específica']);
    });

    test('crea solicitud con items normales + items_custom (ambos persisten)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);
        db.query.mockResolvedValueOnce([[]]);

        conn.query
            // SELECT stock para validar item_id=5
            .mockResolvedValueOnce([[{ total: 50, descripcion: 'Item A' }]])
            // INSERT INTO transferencias
            .mockResolvedValueOnce([{ insertId: 600 }])
            // INSERT INTO transferencia_items
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT INTO transferencia_items_custom
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        await transferenciaService.crear({
            destino_bodega_id: 1,
            items: [{ item_id: 5, cantidad: 10 }],
            items_custom: [{ descripcion: 'Algo a comprar', cantidad: 3 }],
        }, 42);

        const itemInserts = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_items \(/i.test(c[0])
        );
        expect(itemInserts).toHaveLength(1);

        const customInserts = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_items_custom/i.test(c[0])
        );
        expect(customInserts).toHaveLength(1);
        expect(customInserts[0][1]).toEqual([600, 'Algo a comprar', 3, null, null]);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('getById() — items_custom', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        db.query.mockReset();
    });

    test('retorna items_custom en el payload', async () => {
        // Mocks secuenciales: SELECT trf, SELECT items, SELECT items_custom
        // (sin splits porque items.length === 0 saltea esa rama)
        db.query
            .mockResolvedValueOnce([[{ id: 1, codigo: 'TRF-X', estado: 'pendiente' }]])
            .mockResolvedValueOnce([[]]) // items vacío
            .mockResolvedValueOnce([[
                { id: 10, descripcion: 'Tornillos', cantidad: 50, unidad: 'U', observacion: null, compra_realizada: 0, notas_compra: null, fecha_compra: null },
            ]]);

        const result = await transferenciaService.getById(1);
        expect(result.items_custom).toHaveLength(1);
        expect(result.items_custom[0]).toMatchObject({
            id: 10,
            descripcion: 'Tornillos',
            cantidad: 50,
            unidad: 'U',
        });
    });

    test('retorna items_custom vacío si no hay', async () => {
        db.query
            .mockResolvedValueOnce([[{ id: 2, codigo: 'TRF-Y', estado: 'pendiente' }]])
            .mockResolvedValueOnce([[{ id: 100, item_id: 5, cantidad_solicitada: 1 }]])
            .mockResolvedValueOnce([[]]) // splits vacío (items.length > 0 → entra rama)
            .mockResolvedValueOnce([[]]); // items_custom vacío

        const result = await transferenciaService.getById(2);
        expect(result.items_custom).toEqual([]);
        expect(result.items).toHaveLength(1);
    });
});

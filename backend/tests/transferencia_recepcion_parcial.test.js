/**
 * Tests de la feature de Recepción Parcial.
 *
 * Migración 048 introduce el estado `recepcion_parcial` y dos tablas audit
 * (transferencia_recepciones + transferencia_recepcion_items). El método
 * recibir() acepta `tipo: 'parcial' | 'total'`:
 *   · parcial → estado recepcion_parcial, sin discrepancia, NO setea
 *               receptor_id/recibido_por/fecha_recepcion del header.
 *   · total   → estado recibida, discrepancia para cualquier gap acumulado.
 *
 * Stock por evento: cada llamada decrementa origen + incrementa destino
 * SOLO por la cantidad de ESTE viaje. FIFO por split via
 * transferencia_item_origenes.cantidad_decrementada.
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

describe('recibir() — modo parcial', () => {
    beforeEach(() => jest.clearAllMocks());

    test('1) tipo=parcial → estado recepcion_parcial, NO setea recibido_por del header', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'en_transito', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // dbItems con cantidad_recibida = null (primera recepción)
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: null, origen_obra_id: null, origen_bodega_id: 2 }]])
            // INSERT header
            .mockResolvedValueOnce([{ insertId: 5000 }])
            // SELECT splits FOR UPDATE
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 10, cantidad_decrementada: 0 }]])
            // UPDATE decremento origen
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE cantidad_decrementada del split
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE cantidad_recibida acumulado
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // INSERT recepcion_items audit
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            // UPDATE estado → recepcion_parcial
            .mockResolvedValueOnce([{ affectedRows: 1 }]);

        const result = await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 4 }],
            ['inventario.transferencias.recibir'],
            'parcial'
        );

        expect(result.estado).toBe('recepcion_parcial');

        // El UPDATE final debe ser estado=recepcion_parcial SIN recibido_por
        const updateTrf = conn.query.mock.calls.find(c =>
            /UPDATE transferencias SET estado/.test(c[0])
        );
        expect(updateTrf[0]).toMatch(/estado\s*=\s*'recepcion_parcial'/);
        expect(updateTrf[0]).not.toMatch(/recibido_por/);

        // NO debe haber INSERT en transferencia_discrepancias
        const discrepCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_discrepancias/.test(c[0])
        );
        expect(discrepCalls).toHaveLength(0);

        expect(conn.commit).toHaveBeenCalled();
    });

    test('2) Stock por evento: decrementa origen solo por cantidad del viaje (no la enviada total)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'en_transito', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // Item enviada=10, cantidad_recibida=null (nada llegado aún)
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: null, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5000 }])
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 10, cantidad_decrementada: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento origen
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_decrementada
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado

        // Este viaje trae solo 4 de 10
        await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 4 }],
            ['inventario.transferencias.recibir'],
            'parcial'
        );

        // Decremento origen debe ser por 4 (no 10)
        const decrementCalls = conn.query.mock.calls.filter(c =>
            /UPDATE ubicaciones_stock SET cantidad = GREATEST/.test(c[0])
        );
        expect(decrementCalls).toHaveLength(1);
        expect(decrementCalls[0][1][0]).toBe(4); // cantidad descontada = 4

        // Incremento destino debe ser por 4
        const incrementCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO ubicaciones_stock/.test(c[0]) && /ON DUPLICATE KEY/.test(c[0])
        );
        expect(incrementCalls).toHaveLength(1);
        expect(incrementCalls[0][1][3]).toBe(4); // cantidad en INSERT = 4

        // UPDATE split.cantidad_decrementada += 4
        const splitUpdates = conn.query.mock.calls.filter(c =>
            /UPDATE transferencia_item_origenes SET cantidad_decrementada/.test(c[0])
        );
        expect(splitUpdates).toHaveLength(1);
        expect(splitUpdates[0][1]).toEqual([4, 700]);
    });

    test('3) Multi-split FIFO: parcial consume primero split id ASC, segundo parcial continúa donde quedó', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'en_transito', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        // PARCIAL 1: enviada 10 (split A=6, split B=4), trae 7 → consume A=6 entero + B=1
        // Fase 13 (kardex): cada decremento/incremento intercala un SELECT cantidad
        // previa (_selCant) + un INSERT en stock_movimientos (_logMov).
        conn.query
            .mockResolvedValueOnce([[trfRow]])
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: null, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5000 }])
            // SELECT splits — orden ASC por id: A primero, B segundo
            .mockResolvedValueOnce([[
                { id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 6, cantidad_decrementada: 0 },
                { id: 701, origen_obra_id: 5, origen_bodega_id: null, cantidad_enviada: 4, cantidad_decrementada: 0 },
            ]])
            // ── Split A ──
            .mockResolvedValueOnce([[{ cantidad: 100 }]]) // _selCant origen split A
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento split A (6)
            .mockResolvedValueOnce([{ insertId: 9001 }])   // kardex salida split A
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE split A decremento=6
            // ── Split B ──
            .mockResolvedValueOnce([[{ cantidad: 50 }]])  // _selCant origen split B
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento split B (1)
            .mockResolvedValueOnce([{ insertId: 9002 }])   // kardex salida split B
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE split B decremento=1
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida
            // ── Destino ──
            .mockResolvedValueOnce([[{ cantidad: 0 }]])   // _selCant destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ insertId: 9003 }])   // kardex entrada destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado

        await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 7 }],
            ['inventario.transferencias.recibir'],
            'parcial'
        );

        // Verificar que decremento split A = 6 (consumido entero) y split B = 1
        const splitUpdates = conn.query.mock.calls.filter(c =>
            /UPDATE transferencia_item_origenes SET cantidad_decrementada/.test(c[0])
        );
        expect(splitUpdates).toHaveLength(2);
        expect(splitUpdates[0][1]).toEqual([6, 700]); // A=6
        expect(splitUpdates[1][1]).toEqual([1, 701]); // B=1
    });

    test('4) Over-receive en parcial → 400 (cumulative > enviada bloqueado)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'recepcion_parcial', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // Ya hay 7 recibidos previamente. Enviada 10. Resta 3.
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: 7, origen_obra_id: null, origen_bodega_id: 2 }]]);

        // Intentamos recibir 5 más → 7+5=12 > 10 → 400
        await expect(
            transferenciaService.recibir(
                100, 77, [{ item_id: 5, cantidad_recibida: 5 }],
                ['inventario.transferencias.recibir'],
                'parcial'
            )
        ).rejects.toMatchObject({
            statusCode: 400,
            message: expect.stringMatching(/Recepción parcial no puede exceder/i),
        });

        expect(conn.rollback).toHaveBeenCalled();
        expect(conn.commit).not.toHaveBeenCalled();
    });

    test('5) Tipo=total con cumulative < enviada → crea discrepancia (merma)', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'recepcion_parcial', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // Ya hay 7 recibidos. Enviada 10. Resta 3.
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: 7, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5001 }])  // INSERT header
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 10, cantidad_decrementada: 7 }]])
            // En este "total" trae solo 2 más. 7+2=9 < 10 enviada → discrepancia de 1.
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento origen 2
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE split decrementada=9
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida (7+2=9)
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT transferencia_discrepancias
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado → recibida

        await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 2 }],
            ['inventario.transferencias.recibir'],
            'total'
        );

        // Debe haber 1 INSERT en discrepancias con cantidad_recibida acumulada (9, no 2)
        const discrepCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_discrepancias/.test(c[0])
        );
        expect(discrepCalls).toHaveLength(1);
        // Args: [transferencia_id, item_id, cantidad_enviada, cantidad_recibida_acumulada, observacion, reportado_por]
        // (reportado_por = receptorId=77, agregado en mig 061 / commit 7f7a0a8)
        expect(discrepCalls[0][1]).toEqual([100, 5, 10, 9, null, 77]);

        // UPDATE estado debe ser → recibida con recibido_por
        const updateTrf = conn.query.mock.calls.find(c =>
            /UPDATE transferencias SET estado/.test(c[0])
        );
        expect(updateTrf[0]).toMatch(/estado\s*=\s*'recibida'/);
        expect(updateTrf[0]).toMatch(/recibido_por\s*=\s*\?/);
    });

    test('6) SoD: receptor === transportista bloquea aunque sea recepcion_parcial', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'recepcion_parcial', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            transportista_id: 99,
            aprobador_id: 50,
        };
        conn.query.mockResolvedValueOnce([[trfRow]]);

        await expect(
            transferenciaService.recibir(
                100,
                99, // receptorId === transportista_id
                [{ item_id: 5, cantidad_recibida: 1 }],
                ['inventario.transferencias.recibir'],
                'parcial'
            )
        ).rejects.toMatchObject({
            statusCode: 403,
            message: expect.stringMatching(/SoD violation/i),
        });
    });

    test('7) Estado origen recepcion_parcial → permite seguir recibiendo parcial', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'recepcion_parcial', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // Ya hay 4 recibidos. Enviada 10. Resta 6.
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: 4, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5002 }])
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 10, cantidad_decrementada: 4 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento 3
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // split decrementada=7
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida 4+3=7
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado sigue recepcion_parcial

        const result = await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 3 }],
            ['inventario.transferencias.recibir'],
            'parcial'
        );

        expect(result.estado).toBe('recepcion_parcial');
        expect(conn.commit).toHaveBeenCalled();
    });

    test('8) tipo inválido → throw', async () => {
        await expect(
            transferenciaService.recibir(
                100, 77, [{ item_id: 5, cantidad_recibida: 3 }],
                ['inventario.transferencias.recibir'],
                'medio_parcial' // tipo inválido
            )
        ).rejects.toMatchObject({ message: expect.stringMatching(/tipo debe ser/i) });
    });

    test('9) Tipo=total con cumulative === enviada → NO crea discrepancia', async () => {
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'recepcion_parcial', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // Acumulado 7. Enviada 10. Resta 3.
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: 10, cantidad_recibida: 7, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5003 }])
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 10, cantidad_decrementada: 7 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento 3
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // split decrementada=10
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida 7+3=10
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            // NO debe haber INSERT discrepancia (10=10)
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado → recibida

        await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 3 }],
            ['inventario.transferencias.recibir'],
            'total'
        );

        const discrepCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_discrepancias/.test(c[0])
        );
        expect(discrepCalls).toHaveLength(0);
    });

    test('10) tipo=total con cantidad_enviada DECIMAL string (mysql2) y recibido == enviado → NO crea discrepancia (regresión coerción number vs string)', async () => {
        // El test #9 mockea cantidad_enviada como número (10) y por eso NO atrapa el
        // bug real: en producción mysql2 devuelve DECIMAL(12,4) como STRING ('1.0000').
        // Si recibir() no normaliza, `1 !== '1.0000'` es true → discrepancia fantasma.
        const conn = makeConn();
        db.getConnection.mockResolvedValue(conn);

        const trfRow = {
            id: 100, estado: 'en_transito', stock_reconciliado: 1,
            destino_obra_id: 9, destino_bodega_id: null,
            origen_obra_id: null, origen_bodega_id: 2,
            transportista_id: 50,
        };

        conn.query
            .mockResolvedValueOnce([[trfRow]])
            // dbItems: cantidad_enviada como STRING DECIMAL (lo que devuelve mysql2), recibida null
            .mockResolvedValueOnce([[{ id: 200, item_id: 5, cantidad_enviada: '1.0000', cantidad_recibida: null, origen_obra_id: null, origen_bodega_id: 2 }]])
            .mockResolvedValueOnce([{ insertId: 5005 }])  // INSERT header
            .mockResolvedValueOnce([[{ id: 700, origen_obra_id: null, origen_bodega_id: 2, cantidad_enviada: 1, cantidad_decrementada: 0 }]])
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // decremento origen
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE split decrementada
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // UPDATE cantidad_recibida
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT destino
            .mockResolvedValueOnce([{ affectedRows: 1 }])  // INSERT recepcion_items
            .mockResolvedValueOnce([{ affectedRows: 1 }]); // UPDATE estado → recibida
        // Red de seguridad: si el bug reaparece e inserta una discrepancia de más,
        // que no falle por falta de mock — la aserción de abajo lo detecta.
        conn.query.mockResolvedValue([{ affectedRows: 1 }]);

        // Recibe total: 1 de 1 enviado → cuadra exacto, NO debe haber discrepancia.
        await transferenciaService.recibir(
            100, 77, [{ item_id: 5, cantidad_recibida: 1 }],
            ['inventario.transferencias.recibir'],
            'total'
        );

        const discrepCalls = conn.query.mock.calls.filter(c =>
            /INSERT INTO transferencia_discrepancias/.test(c[0])
        );
        expect(discrepCalls).toHaveLength(0);
    });
});

describe('getRecepciones() — historial de eventos', () => {
    beforeEach(() => jest.clearAllMocks());

    test('devuelve eventos con items embebidos', async () => {
        db.query
            // SELECT recepciones
            .mockResolvedValueOnce([[
                { id: 1, transferencia_id: 100, receptor_id: 77, fecha_recepcion: '2026-05-19 10:00', tipo: 'parcial', observacion: null, receptor_nombre: 'Juan' },
                { id: 2, transferencia_id: 100, receptor_id: 77, fecha_recepcion: '2026-05-20 14:30', tipo: 'total', observacion: 'cierre', receptor_nombre: 'Juan' },
            ]])
            // SELECT items con JOINs
            .mockResolvedValueOnce([[
                { id: 10, recepcion_id: 1, transferencia_item_id: 200, cantidad_recibida: 4, observacion: null, item_id: 5, item_descripcion: 'Tornillo', unidad: 'unidad' },
                { id: 11, recepcion_id: 2, transferencia_item_id: 200, cantidad_recibida: 6, observacion: null, item_id: 5, item_descripcion: 'Tornillo', unidad: 'unidad' },
            ]]);

        const recepciones = await transferenciaService.getRecepciones(100);
        expect(recepciones).toHaveLength(2);
        expect(recepciones[0].tipo).toBe('parcial');
        expect(recepciones[0].items).toHaveLength(1);
        expect(recepciones[0].items[0].cantidad_recibida).toBe(4);
        expect(recepciones[1].tipo).toBe('total');
        expect(recepciones[1].items[0].cantidad_recibida).toBe(6);
    });

    test('devuelve [] si no hay eventos', async () => {
        db.query.mockResolvedValueOnce([[]]);
        const recepciones = await transferenciaService.getRecepciones(999);
        expect(recepciones).toEqual([]);
    });
});

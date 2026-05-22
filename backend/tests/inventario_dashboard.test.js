jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const inventarioService = require('../src/services/inventario.service');
const db = require('../src/config/db');

describe('Inventario Service — getDashboardEjecutivo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Congelar fecha para que findMesAnterior sea determinista.
        // Con 2026-05-01, target (hoy-30 = 2026-04-01) queda >3 días de
        // todos los snapshots mock (2026-03-25 … 2026-04-23).
        jest.useFakeTimers({ now: new Date('2026-05-01T12:00:00Z') });
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('retorna shape con kpis, top_obras, alertas y rechazos_recientes', async () => {
        // Las 9 queries del service corren en paralelo con Promise.all, así que
        // mockeamos cada invocación sucesiva en el orden declarado en el service.
        //
        // Snapshots usan fechas RELATIVAS a "hoy" para que el test sea
        // determinista en cualquier fecha. Antes usaba fechas fijas (2026-04-XX)
        // que con el paso del tiempo terminaron coincidiendo con el target
        // de findMesAnterior (today - 30 días ±3) — el test fallaba en CI.
        // Snapshots ahora todos fuera de ventana ±3 días para que mes_anterior=null.
        const today = new Date();
        const isoOffset = (daysAgo) =>
            new Date(today.getTime() - daysAgo * 86400000).toISOString().split('T')[0];
        db.query
            // 1. transferencias pendientes count
            .mockResolvedValueOnce([[{ count: 7 }]])
            // 2. transferencias en tránsito count
            .mockResolvedValueOnce([[{ count: 2 }]])
            // 3. discrepancias pendientes
            .mockResolvedValueOnce([[{ transferencias_afectadas: 3, unidades_totales: 42 }]])
            // 4. valor por obra
            .mockResolvedValueOnce([[
                // Auditoría 6.1: backend ahora calcula valor_neto en SQL (no se recalcula en JS).
                { id: 1, nombre: 'CERRILLOS', valor_neto: 18200000, valor_bruto: 18200000, descuento_porcentaje: 0 },
                { id: 2, nombre: 'DOMEYKO', valor_neto: 10890000, valor_bruto: 12100000, descuento_porcentaje: 10 },
                { id: 3, nombre: 'SIN STOCK', valor_neto: 0, valor_bruto: 0, descuento_porcentaje: 0 },
            ]])
            // 5a. alertas pendientes
            .mockResolvedValueOnce([[{
                id: 101, codigo: 'TRF-000142',
                fecha_solicitud: '2026-04-17',
                origen_obra_nombre: 'DOMEYKO', origen_bodega_nombre: null,
                destino_obra_nombre: 'CERRILLOS', destino_bodega_nombre: null,
                solicitante_nombre: 'Juan', items_count: 4, dias: 3,
            }]])
            // 5b. alertas discrepancias
            .mockResolvedValueOnce([[{
                id: 102, codigo: 'TRF-000138',
                fecha_recepcion: '2026-04-15',
                origen_obra_nombre: 'ESCOBAR WILLIAMS', origen_bodega_nombre: null,
                destino_obra_nombre: 'CERRILLOS', destino_bodega_nombre: null,
                items_con_discrepancia: 1, unidades: 15, dias: 5,
            }]])
            // 5c. alertas en tránsito
            .mockResolvedValueOnce([[{
                id: 103, codigo: 'TRF-000139',
                fecha_despacho: '2026-04-14',
                origen_obra_nombre: 'DOMEYKO', origen_bodega_nombre: null,
                destino_obra_nombre: 'ABATE 676', destino_bodega_nombre: null,
                dias: 6,
            }]])
            // 6. estancados +7d count
            .mockResolvedValueOnce([[{ count: 1 }]])
            // 7. rechazos recientes (últimos 7 días)
            .mockResolvedValueOnce([[{
                id: 104, codigo: 'TRF-000140',
                fecha_aprobacion: '2026-04-19',
                origen_obra_nombre: 'DOMEYKO', origen_bodega_nombre: null,
                destino_obra_nombre: null, destino_bodega_nombre: 'BODEGA CENTRAL',
                observaciones_rechazo: 'Items dañados',
                rechazado_por_nombre: 'María',
                dias: 2,
            }]])
            // 8. snapshots últimos 31 días (sparklines + comparativa).
            // Fechas relativas (hoy - N días). Todas fuera de ventana ±3 días
            // alrededor de "hoy - 30 días" para garantizar mes_anterior=null.
            .mockResolvedValueOnce([[
                { fecha: isoOffset(50), kpi: 'pendientes', valor: 10 },
                { fecha: isoOffset(50), kpi: 'valor_obras', valor: 25000000 },
                { fecha: isoOffset(5),  kpi: 'pendientes', valor: 8 },
                { fecha: isoOffset(4),  kpi: 'pendientes', valor: 6 },
                { fecha: isoOffset(3),  kpi: 'pendientes', valor: 5 },
                { fecha: isoOffset(2),  kpi: 'pendientes', valor: 4 },
                { fecha: isoOffset(2),  kpi: 'valor_obras', valor: 28000000 },
            ]])
            // 9. valor por categoría (donut)
            .mockResolvedValueOnce([[
                { id: 1, nombre: 'ANDAMIOS', orden: 1, valor_neto: 8000000 },
                { id: 2, nombre: 'ALZAPRIMAS', orden: 2, valor_neto: 0 },
                { id: 3, nombre: 'MOLDAJES', orden: 3, valor_neto: 15000000 },
                { id: 4, nombre: 'MAQUINARIA', orden: 4, valor_neto: 6000000 },
            ]])
            // 10. bombas hormigón mes actual
            .mockResolvedValueOnce([[{ eventos: 12, obras_distintas: 5, costo_externo: 3200000 }]]);

        const result = await inventarioService.getDashboardEjecutivo();

        // KPIs
        expect(result.kpis.transferencias_pendientes).toBe(7);
        expect(result.kpis.transferencias_en_transito).toBe(2);
        expect(result.kpis.discrepancias_pendientes.transferencias_afectadas).toBe(3);
        expect(result.kpis.discrepancias_pendientes.unidades_totales).toBe(42);
        expect(result.kpis.estancados_transito).toBe(1);

        // Valor total obras = CERRILLOS (18.2M, 0% desc) + DOMEYKO (12.1M * 0.9 = 10.89M)
        expect(result.kpis.valor_total_obras).toBeCloseTo(18200000 + 12100000 * 0.9, 0);

        // Top obras: sólo las con valor > 0, con descuento aplicado
        expect(result.top_obras).toHaveLength(2);
        expect(result.top_obras[0].obra_id).toBe(1);
        expect(result.top_obras[1].valor_mensual).toBeCloseTo(12100000 * 0.9, 0);

        // Alertas: discrepancia primero (prioridad 0), luego pendiente (1), luego tránsito (2)
        expect(result.alertas).toHaveLength(3);
        expect(result.alertas[0].tipo).toBe('discrepancia');
        expect(result.alertas[1].tipo).toBe('pendiente');
        expect(result.alertas[2].tipo).toBe('transito');
        // Cada alerta trae transferencia_id para click → detalle
        result.alertas.forEach(a => expect(a.transferencia_id).toBeTruthy());

        // Rechazos recientes
        expect(result.rechazos_recientes).toHaveLength(1);
        expect(result.rechazos_recientes[0].codigo).toBe('TRF-000140');
        expect(result.rechazos_recientes[0].observaciones_rechazo).toBe('Items dañados');
        expect(result.rechazos_recientes[0].rechazado_por).toBe('María');
        expect(result.rechazos_recientes[0].origen).toBe('DOMEYKO');
        expect(result.rechazos_recientes[0].destino).toBe('BODEGA CENTRAL');

        // Histórico: sparklines + comparativa mes anterior
        expect(result.historico).toBeDefined();
        expect(result.historico.pendientes).toBeDefined();
        // Sparkline pendientes: últimos 6 snapshots (incluye el del 25/03 + abril) + valor hoy (7)
        expect(result.historico.pendientes.sparkline[result.historico.pendientes.sparkline.length - 1]).toBe(7);
        // mes_anterior = null cuando no hay snapshot dentro de ±3 días de (hoy - 30). Con fecha congelada en 2026-05-01, target es 2026-04-01, lejos de los mocks.
        expect(result.historico.pendientes.mes_anterior).toBeNull();
        expect(result.historico.valor_obras.sparkline[result.historico.valor_obras.sparkline.length - 1])
            .toBeCloseTo(18200000 + 12100000 * 0.9, 0);

        // Valor por categoría (donut)
        expect(result.valor_por_categoria).toHaveLength(4);
        expect(result.valor_por_categoria[0]).toEqual({
            categoria_id: 1, nombre: 'ANDAMIOS', orden: 1, valor: 8000000,
        });
        expect(result.valor_por_categoria[2].valor).toBe(15000000);

        // Bombas hormigón mes
        expect(result.bombas_hormigon_mes).toEqual({
            eventos: 12, obras_distintas: 5, costo_externo: 3200000,
        });
    });

    test('soporta estado vacío sin explotar', async () => {
        db.query
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[{ eventos: 0, obras_distintas: 0, costo_externo: 0 }]]);

        const result = await inventarioService.getDashboardEjecutivo();

        expect(result.kpis.transferencias_pendientes).toBe(0);
        expect(result.kpis.valor_total_obras).toBe(0);
        expect(result.kpis.estancados_transito).toBe(0);
        expect(result.top_obras).toEqual([]);
        expect(result.alertas).toEqual([]);
        expect(result.rechazos_recientes).toEqual([]);
        expect(result.historico).toBeDefined();
        expect(result.historico.pendientes.sparkline).toEqual([0]);
        expect(result.historico.pendientes.mes_anterior).toBeNull();
        expect(result.valor_por_categoria).toEqual([]);
        expect(result.bombas_hormigon_mes).toEqual({ eventos: 0, obras_distintas: 0, costo_externo: 0 });
    });

    test('filtra por obra_id: top_obras vacío + sparklines apagados + filtros SQL aplicados', async () => {
        // Cuando se pasa obraId, query 8 (snapshots) es Promise.resolve([[]]) — solo 9 queries
        // van al mock. El service usa 12 destructurings, pero query 8 (snapshots) no toca db.query.
        db.query
            .mockResolvedValueOnce([[{ count: 2 }]])  // 1 pendientes filtradas
            .mockResolvedValueOnce([[{ count: 1 }]])  // 2 transito
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])  // 3 discrep
            .mockResolvedValueOnce([[                                                          // 4 valor obras (1 sola)
                { id: 5, nombre: 'CERRILLOS', valor_neto: 9000000, valor_bruto: 9000000, descuento_porcentaje: 0 },
            ]])
            .mockResolvedValueOnce([[]])  // 5a alertas pendientes
            .mockResolvedValueOnce([[]])  // 5b alertas discrep
            .mockResolvedValueOnce([[]])  // 5c alertas transito
            .mockResolvedValueOnce([[{ count: 0 }]])  // 6 estancados
            .mockResolvedValueOnce([[]])  // 7 rechazos
            // 8 snapshots: NO se llama (Promise.resolve([[]]))
            .mockResolvedValueOnce([[                                                          // 9 categoría (filtrada por obra)
                { id: 3, nombre: 'MOLDAJES', orden: 3, valor_neto: 9000000 },
            ]])
            .mockResolvedValueOnce([[{ eventos: 1, obras_distintas: 1, costo_externo: 0 }]]); // 10 bombas

        const result = await inventarioService.getDashboardEjecutivo(5);

        expect(result.filtered_obra_id).toBe(5);
        expect(result.kpis.transferencias_pendientes).toBe(2);
        expect(result.kpis.valor_total_obras).toBeCloseTo(9000000, 0);
        // Top obras vacío cuando hay filtro (ranking pierde sentido)
        expect(result.top_obras).toEqual([]);
        // Histórico apagado: sparklines tienen solo el valor de hoy + mes_anterior null
        expect(result.historico.pendientes.mes_anterior).toBeNull();
        expect(result.historico.pendientes.delta_pct).toBeNull();
        expect(result.bombas_hormigon_mes.eventos).toBe(1);

        // Verifica que las queries con filtro recibieron los params [obraId, obraId] o [obraId]
        const calls = db.query.mock.calls;
        // Query 1 (pendientes count) debe tener params [5, 5]
        expect(calls[0][1]).toEqual([5, 5]);
        // Query 4 (valor obras) debe tener params [5]
        expect(calls[3][1]).toEqual([5]);
        // Query 10 (bombas, último call) debe tener params [5]
        expect(calls[calls.length - 1][1]).toEqual([5]);
    });
});

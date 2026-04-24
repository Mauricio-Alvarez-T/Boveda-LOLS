jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const inventarioService = require('../src/services/inventario.service');
const db = require('../src/config/db');

describe('Inventario Service — getDashboardEjecutivo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('retorna shape con kpis, top_obras, alertas y rechazos_recientes', async () => {
        // Las 9 queries del service corren en paralelo con Promise.all, así que
        // mockeamos cada invocación sucesiva en el orden declarado en el service.
        db.query
            // 1. transferencias pendientes count
            .mockResolvedValueOnce([[{ count: 7 }]])
            // 2. transferencias en tránsito count
            .mockResolvedValueOnce([[{ count: 2 }]])
            // 3. discrepancias pendientes
            .mockResolvedValueOnce([[{ transferencias_afectadas: 3, unidades_totales: 42 }]])
            // 4. valor por obra
            .mockResolvedValueOnce([[
                { id: 1, nombre: 'CERRILLOS', subtotal_bruto: 18200000, descuento_porcentaje: 0 },
                { id: 2, nombre: 'DOMEYKO', subtotal_bruto: 12100000, descuento_porcentaje: 10 },
                { id: 3, nombre: 'SIN STOCK', subtotal_bruto: 0, descuento_porcentaje: 0 },
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
            // 8. snapshots últimos 31 días (sparklines + comparativa)
            .mockResolvedValueOnce([[
                { fecha: '2026-03-25', kpi: 'pendientes', valor: 10 },
                { fecha: '2026-03-25', kpi: 'valor_obras', valor: 25000000 },
                { fecha: '2026-04-20', kpi: 'pendientes', valor: 8 },
                { fecha: '2026-04-21', kpi: 'pendientes', valor: 6 },
                { fecha: '2026-04-22', kpi: 'pendientes', valor: 5 },
                { fecha: '2026-04-23', kpi: 'pendientes', valor: 4 },
                { fecha: '2026-04-23', kpi: 'valor_obras', valor: 28000000 },
            ]])
            // 9. valor por categoría (donut)
            .mockResolvedValueOnce([[
                { id: 1, nombre: 'ANDAMIOS', orden: 1, valor_neto: 8000000 },
                { id: 2, nombre: 'ALZAPRIMAS', orden: 2, valor_neto: 0 },
                { id: 3, nombre: 'MOLDAJES', orden: 3, valor_neto: 15000000 },
                { id: 4, nombre: 'MAQUINARIA', orden: 4, valor_neto: 6000000 },
            ]]);

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
        // mes_anterior solo se setea cuando hay ≥20 puntos en la serie. Con 5 puntos debe ser null.
        expect(result.historico.pendientes.mes_anterior).toBeNull();
        expect(result.historico.valor_obras.sparkline[result.historico.valor_obras.sparkline.length - 1])
            .toBeCloseTo(18200000 + 12100000 * 0.9, 0);

        // Valor por categoría (donut)
        expect(result.valor_por_categoria).toHaveLength(4);
        expect(result.valor_por_categoria[0]).toEqual({
            categoria_id: 1, nombre: 'ANDAMIOS', orden: 1, valor: 8000000,
        });
        expect(result.valor_por_categoria[2].valor).toBe(15000000);
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
            .mockResolvedValueOnce([[]]);

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
    });
});

jest.mock('../src/config/db', () => ({
    query: jest.fn(),
}));

const inventarioService = require('../src/services/inventario.service');
const db = require('../src/config/db');

describe('Inventario Service — getDashboardEjecutivo', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('retorna shape con kpis, top_obras y alertas', async () => {
        // Las 7 queries del service corren en paralelo con Promise.all, así que
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
            }]]);

        const result = await inventarioService.getDashboardEjecutivo();

        // KPIs
        expect(result.kpis.transferencias_pendientes).toBe(7);
        expect(result.kpis.transferencias_en_transito).toBe(2);
        expect(result.kpis.discrepancias_pendientes.transferencias_afectadas).toBe(3);
        expect(result.kpis.discrepancias_pendientes.unidades_totales).toBe(42);

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
    });

    test('soporta estado vacío sin explotar', async () => {
        db.query
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ count: 0 }]])
            .mockResolvedValueOnce([[{ transferencias_afectadas: 0, unidades_totales: 0 }]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]])
            .mockResolvedValueOnce([[]]);

        const result = await inventarioService.getDashboardEjecutivo();

        expect(result.kpis.transferencias_pendientes).toBe(0);
        expect(result.kpis.valor_total_obras).toBe(0);
        expect(result.top_obras).toEqual([]);
        expect(result.alertas).toEqual([]);
    });
});

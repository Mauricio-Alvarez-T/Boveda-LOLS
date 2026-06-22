import {
    buildTrfDemo, aprobarTrfDemo, recibirTrfDemo, tieneDiferencia,
    buildDiscrepanciaDemo, resolverDiscrepanciaDemo,
} from './journeyHelpers';

/** Engine fake mínimo (solo lo que buildTrfDemo lee). */
const fakeEngine = (over: Partial<Record<string, unknown>> = {}) => ({
    cart: [{ item_id: 1, cantidad: 5 }],
    customItems: [],
    origen: { tipo: 'central' },
    destino: { tipo: 'obra', id: 1 },
    infer: { tipoFlujo: 'solicitud' },
    requierePionetas: false,
    cantidadPionetas: 0,
    observaciones: '',
    motivo: '',
    ...over,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

describe('buildTrfDemo', () => {
    it('solicitud (catálogo) nace pendiente con sus ítems', () => {
        const trf = buildTrfDemo(fakeEngine());
        expect(trf.estado).toBe('pendiente');
        expect(trf.tipo_flujo).toBe('solicitud');
        expect(trf.items).toHaveLength(1);
        expect(trf.items![0].cantidad_solicitada).toBe(5);
        expect(trf.items![0].cantidad_enviada).toBeNull(); // aún no aprobado
        expect(trf.destino_obra_id).toBe(1);
    });

    it('flujos sin aprobación (push_directo/orden_gerencia) nacen en_transito y ya despachados', () => {
        const push = buildTrfDemo(fakeEngine({ infer: { tipoFlujo: 'push_directo' }, origen: { tipo: 'bodega', id: 101 } }));
        expect(push.estado).toBe('en_transito');
        expect(push.items![0].cantidad_enviada).toBe(5);
        expect(push.origen_bodega_id).toBe(101);

        const orden = buildTrfDemo(fakeEngine({ infer: { tipoFlujo: 'orden_gerencia' }, origen: { tipo: 'bodega', id: 101 } }));
        expect(orden.estado).toBe('en_transito');
    });
});

describe('transiciones aprobar/recibir', () => {
    it('aprobar fija cantidad_enviada y pasa a aprobada', () => {
        const trf = buildTrfDemo(fakeEngine());
        const aprob = aprobarTrfDemo(trf, { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        expect(aprob.estado).toBe('aprobada');
        expect(aprob.items![0].cantidad_enviada).toBe(5);
        expect(aprob.aprobador_id).not.toBeNull();
    });

    it('recibir total = recibida; parcial = recepcion_parcial', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const total = recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 5 }], 'total');
        expect(total.estado).toBe('recibida');
        expect(tieneDiferencia(total)).toBe(false);

        const parcial = recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 2 }], 'parcial');
        expect(parcial.estado).toBe('recepcion_parcial');
    });
});

describe('discrepancia', () => {
    it('recibir de menos genera diferencia y se puede resolver', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const recibida = recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 3 }], 'total');
        expect(tieneDiferencia(recibida)).toBe(true);

        const disc = buildDiscrepanciaDemo(recibida);
        expect(disc.discrepancias).toHaveLength(1);
        expect(disc.discrepancias[0].diferencia).toBe(2); // 5 enviadas − 3 recibidas
        expect(disc.total_items_afectados).toBe(1);
        expect(disc.total_unidades_perdidas).toBe(2);
        expect(disc.discrepancias[0].estado).toBe('pendiente');

        const resuelta = resolverDiscrepanciaDemo(disc, disc.discrepancias[0].id, 'resuelta', 'Se encontró en bodega');
        expect(resuelta.discrepancias[0].estado).toBe('resuelta');
        expect(resuelta.discrepancias[0].resolucion).toBe('Se encontró en bodega');
    });
});

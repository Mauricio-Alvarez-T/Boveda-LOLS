import {
    buildTrfDemo, aprobarTrfDemo, recibirTrfDemo, tieneDiferencia,
    buildDiscrepanciaDemo, instruccionResolverDemo, resolverDiscrepanciaDemo, simularDiscrepanciaDemo,
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

    it('la diferencia de ejemplo es de la regla nueva, con nombres reales y el stock que dejó lo enviado', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const d = buildDiscrepanciaDemo(recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 3 }], 'total')).discrepancias[0];
        expect(d.diferencia_aplicada).toBe(0);
        expect(d.origen_nombre).toBe('Bodega Central');
        expect(d.destino_nombre).toBe('Edificio Las Condes');
        // stockMapDemo: Bodega Central 30 − 5 enviadas; Edificio Las Condes 8 + 5 enviadas.
        expect(d.origen_stock_actual).toBe(25);
        expect(d.destino_stock_actual).toBe(13);
    });

    it('aprobar (resuelta) suma/resta lo declarado; rechazar (descartada) no mueve stock; nota vacía = texto por defecto', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const disc = buildDiscrepanciaDemo(recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 3 }], 'total'));
        const id = disc.discrepancias[0].id;

        // Faltante de 2: destino −2 y vuelven 2 al origen.
        const aprobada = resolverDiscrepanciaDemo(disc, id, 'resuelta', 'Se contó bien').discrepancias[0];
        expect(aprobada.ajuste_stock).toEqual({
            ajustes: [
                expect.objectContaining({ ubicacion_nombre: 'Edificio Las Condes', cantidad: -2 }),
                expect.objectContaining({ ubicacion_nombre: 'Bodega Central', cantidad: 2 }),
            ],
            aviso: null,
        });

        const rechazada = resolverDiscrepanciaDemo(disc, id, 'descartada', '').discrepancias[0];
        expect(rechazada.estado).toBe('descartada');
        expect(rechazada.ajuste_stock).toEqual({ ajustes: [], aviso: null });
        expect(rechazada.resolucion).toBe('Rechazada: queda lo enviado (5)');

        const sinNota = resolverDiscrepanciaDemo(disc, id, 'resuelta', '   ').discrepancias[0];
        expect(sinNota.resolucion).toBe('Aprobada: llegaron 3 de 5 enviados');
    });

    it('simulación de ejemplo: «hoy A → quedará B» con el stock de la demo; rechazar no mueve stock', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const disc = buildDiscrepanciaDemo(recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 3 }], 'total'));
        const id = disc.discrepancias[0].id;
        // Destino 13 (8 + 5 enviadas) −2; origen 25 (30 − 5) +2.
        expect(simularDiscrepanciaDemo(disc, id, 'resuelta')).toEqual({
            ajustes: [
                expect.objectContaining({ ubicacion_nombre: 'Edificio Las Condes', cantidad: -2, antes: 13, despues: 11 }),
                expect.objectContaining({ ubicacion_nombre: 'Bodega Central', cantidad: 2, antes: 25, despues: 27 }),
            ],
            aviso: null,
            bloqueo: null,
        });
        expect(simularDiscrepanciaDemo(disc, id, 'descartada')).toEqual({ ajustes: [], aviso: null, bloqueo: null });
        expect(simularDiscrepanciaDemo(disc, 999, 'resuelta').ajustes).toEqual([]);
    });

    it('sobrante aprobado: destino +N y origen −N', () => {
        const aprob = aprobarTrfDemo(buildTrfDemo(fakeEngine()), { items: [{ item_id: 1, splits: [{ cantidad: 5 }] }] });
        const disc = buildDiscrepanciaDemo(recibirTrfDemo(aprob, [{ item_id: 1, cantidad_recibida: 7 }], 'total'));
        const aprobada = resolverDiscrepanciaDemo(disc, disc.discrepancias[0].id, 'resuelta', '').discrepancias[0];
        expect(aprobada.ajuste_stock).toEqual({
            ajustes: [
                expect.objectContaining({ ubicacion_nombre: 'Edificio Las Condes', cantidad: 2 }),
                expect.objectContaining({ ubicacion_nombre: 'Bodega Central', cantidad: -2 }),
            ],
            aviso: null,
        });
    });
});

describe('instruccionResolverDemo (globo del paso Resolver)', () => {
    it('«Aprobar» deshabilitado mientras carga la simulación: texto neutro, no «no se puede»', () => {
        expect(instruccionResolverDemo('Aprobar y ajustar stock', false, false)).toBe('Calculando cómo queda el stock…');
    });

    it('solo con un bloqueo de la simulación dice que no se puede aprobar', () => {
        expect(instruccionResolverDemo('Aprobar y ajustar stock', false, true)).toMatch(/no se puede aprobar/);
    });

    it('habilitado: invita a leer el efecto y aprobar', () => {
        expect(instruccionResolverDemo('Aprobar y ajustar stock', true, false)).toMatch(/pulsa "Aprobar y ajustar stock"/);
    });

    it('otros botones y sin botón resaltado', () => {
        expect(instruccionResolverDemo('Rechazar lo declarado', true, false)).toMatch(/no mueve nada/);
        expect(instruccionResolverDemo('Resolver', true, false)).toMatch(/Pulsa "Resolver"/);
        expect(instruccionResolverDemo(null, false, false)).toMatch(/"Resolver" para aprobar lo declarado o "Descartar"/);
    });
});

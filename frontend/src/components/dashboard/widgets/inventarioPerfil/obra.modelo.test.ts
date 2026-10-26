import * as fs from 'fs';
import * as path from 'path';
import {
    RUTA_RECIBIR_VACIO, TOPE_ESPERANDO, TOPE_FUERA, TOPE_HISTORIAL, TOPE_RECHAZADAS, TOPE_RECIBIR, adondeVa, avisoDiferencias,
    botonRecibir, botonesGrandes, conTope, datosCircuito, estadoPorRecibir, itemsPedidos, itemsQueLlegan, lineaEsperando, lineaFuera,
    lineaHistorial, lineaPorRecibir, llegaASuObra, mesDe, modeloObra, pasosCircuito, pildoraEsperando, pildoraHistorial,
    rotulosCircuito, saleDeSuObra, textoAprobo, textoOrigen, textoPedida, textoRechazo, textoRecibir,
} from './obra.modelo';
import type { InventarioPerfilApi, ItemPerfil, LugarPerfil, SolicitudPerfil } from './tipos';

const item = (descripcion: string, unidad: string | null, pedida: number, enviada: number | null = null, recibida: number | null = null): ItemPerfil =>
    ({ clave: descripcion, personalizado: false, descripcion, unidad, pedida, enviada, recibida });
const personalizado = (descripcion: string, unidad: string | null, pedida: number, enviada: number | null = null, recibida: number | null = null): ItemPerfil =>
    ({ ...item(descripcion, unidad, pedida, enviada, recibida), clave: `p-${descripcion}`, personalizado: true });
const bodega = (nombre: string, id = 2): LugarPerfil => ({ tipo: 'bodega', id, nombre, responsable: null });
const obraL = (nombre: string, id = 3): LugarPerfil => ({ tipo: 'obra', id, nombre, responsable: null });
const DOMEYKO = obraL('Domeyko', 3);
const GORBEA = obraL('Gorbea 3082', 5);
const LEO = { id: 7, nombre: 'Leonardo López' };
const JHOAN = { id: 40, nombre: 'Jhoan Vásquez' };

const ETAPA: Record<SolicitudPerfil['estado'], SolicitudPerfil['etapa']> = {
    pendiente: 'pedida', aprobada: 'aprobada', en_transito: 'despachada', recepcion_parcial: 'despachada', recibida: 'recibida', rechazada: 'rechazada',
};

const sol = (o: Partial<SolicitudPerfil> & Pick<SolicitudPerfil, 'id' | 'estado'>): SolicitudPerfil => ({
    codigo: `TRF-202610-00${o.id}`,
    etapa: ETAPA[o.estado],
    tipo_flujo: 'solicitud',
    tipo: 'herramientas',
    origen: null,
    destino: DOMEYKO,
    solicitante: { id: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra' },
    propia: true,
    fecha_solicitud: '2026-10-16',
    aprobacion: null,
    despacho: null,
    recepcion: null,
    ultima_recepcion: null,
    rechazo: null,
    dias: 0,
    del_mes: false,
    puede_aprobar: null,
    bloqueo_aprobar: null,
    items: [item('Cemento', 'SACO', 40)],
    ...o,
});

/** Una devolución de Domeyko a la bodega y un traslado de Domeyko a Gorbea: los dos los pidió él y salen de su obra. */
const devolucion = (o: Partial<SolicitudPerfil> & Pick<SolicitudPerfil, 'id' | 'estado'>) =>
    sol({ tipo_flujo: 'devolucion', origen: DOMEYKO, destino: bodega('Bodega Cerrillos'), ...o });
const traslado = (o: Partial<SolicitudPerfil> & Pick<SolicitudPerfil, 'id' | 'estado'>) =>
    sol({ tipo_flujo: 'intra_obra', origen: DOMEYKO, destino: GORBEA, ...o });

const DATOS = (o: Partial<InventarioPerfilApi> = {}): InventarioPerfilApi => ({
    hoy: '2026-10-22',
    perfil: 'obra',
    super_admin: false,
    alcance: { todas: false, bodega_id: null },
    obra: { id: 3, nombre: 'Domeyko' },
    puede: { aprobar: false, ver_diferencias: false, resolver_diferencias: false, solicitar: true, recibir: true, sod_bypass: false },
    aprobadores: [LEO],
    circuito: {
        pedida: { total: 2, dias: 6 }, aprobada: { total: 1, dias: 4 }, despachada: { total: 1, dias: 1 },
        recibida: { total: 2, ultima: '2026-10-08' }, diferencias: { total: 1, dias: 14, items: 1, mas_antigua_id: 21 },
    },
    solicitudes: [],
    diferencias: null,
    limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
    ...o,
});

describe('modeloObra · orden de las listas (lienzo A, VistaObra)', () => {
    const lista = [
        sol({ id: 42, estado: 'pendiente', dias: 6 }),
        sol({ id: 45, estado: 'pendiente', dias: 1 }),
        sol({ id: 46, estado: 'pendiente', dias: 9 }),
        sol({ id: 31, estado: 'aprobada', dias: 4 }),
        sol({ id: 35, estado: 'aprobada', dias: 7 }),
        sol({ id: 33, estado: 'en_transito', dias: 1 }),
        sol({ id: 36, estado: 'recepcion_parcial', dias: 3 }),
        sol({ id: 22, estado: 'recibida', recepcion: { por: null, fecha: '2026-10-03' } }),
        sol({ id: 21, estado: 'recibida', recepcion: { por: null, fecha: '2026-10-08' } }),
        sol({ id: 23, estado: 'recibida', recepcion: { por: null, fecha: '2026-09-27' } }),
        sol({ id: 24, estado: 'rechazada', del_mes: true, rechazo: { por: LEO, fecha: '2026-10-10', motivo: 'Ya hay stock.' } }),
        sol({ id: 26, estado: 'rechazada', del_mes: true, rechazo: { por: LEO, fecha: '2026-10-15', motivo: null } }),
        sol({ id: 19, estado: 'rechazada', del_mes: false, rechazo: { por: LEO, fecha: '2026-09-30', motivo: null } }),
    ];
    const m = modeloObra(DATOS({ solicitudes: lista }));

    test('por recibir: primero lo que ya salió (en camino o con una parte recibida), después lo aprobado; las más antiguas primero', () => {
        expect(m.porRecibir.todas.map(s => s.id)).toEqual([36, 33, 35, 31]);
        expect(m.fuera.todas).toEqual([]);
    });

    test('esperando: las pedidas, la más antigua primero', () => {
        expect(m.esperando.todas.map(s => s.id)).toEqual([46, 42, 45]);
    });

    test('historial: recibidas, la más nueva primero (la vista muestra las primeras TOPE_HISTORIAL)', () => {
        expect(m.historial.map(s => s.id)).toEqual([21, 22, 23]);
        expect(TOPE_HISTORIAL).toBe(3);
    });

    test('no aprobadas: solo las de este mes, la más nueva primero', () => {
        expect(m.rechazadas.todas.map(s => s.id)).toEqual([26, 24]);
    });

    test('obra y quién aprueba: «Domeyko» y «Esperando a Leonardo»; sin datos, «tu obra» y «Esperando a Leonardo» (Marcos 2026-10-26)', () => {
        expect(m).toMatchObject({ obra: 'Domeyko', obraId: 3, enObra: 'Domeyko', tituloEsperando: 'Esperando a Leonardo' });
        const sin = modeloObra(DATOS({ obra: null, aprobadores: [] }));
        expect(sin).toMatchObject({ obra: null, obraId: null, enObra: 'tu obra', tituloEsperando: 'Esperando a Leonardo' });
        expect(modeloObra(DATOS({ obra: { id: 3, nombre: '  ' } })).enObra).toBe('tu obra');
    });

    test('sin solicitudes: listas vacías (la vista muestra sus mensajes «nada en camino», «todavía no ha llegado nada»…)', () => {
        const vacio = modeloObra(DATOS());
        expect([vacio.porRecibir.todas, vacio.fuera.todas, vacio.esperando.todas, vacio.historial, vacio.rechazadas.todas])
            .toEqual([[], [], [], [], []]);
    });
});

describe('lo que llega a su obra y lo que sale (devoluciones, traslados, lo pedido para otra obra)', () => {
    test('salen de su obra: la devolución (obra → bodega) y el traslado que parte de su obra; no se ofrecen para recibir', () => {
        expect(saleDeSuObra(devolucion({ id: 1, estado: 'aprobada' }), 3)).toBe(true);
        expect(saleDeSuObra(traslado({ id: 2, estado: 'aprobada' }), 3)).toBe(true);
        expect(llegaASuObra(devolucion({ id: 1, estado: 'aprobada' }), 3)).toBe(false);
        expect(llegaASuObra(traslado({ id: 2, estado: 'aprobada' }), 3)).toBe(false);
        // Un traslado de otra obra HACIA la suya sí llega.
        expect(llegaASuObra(traslado({ id: 3, estado: 'aprobada', origen: GORBEA, destino: DOMEYKO }), 3)).toBe(true);
        // Lo que pidió para otra obra no llega a la suya; lo de su obra sí (aunque salga de una bodega).
        expect(llegaASuObra(sol({ id: 4, estado: 'aprobada', destino: GORBEA }), 3)).toBe(false);
        expect(llegaASuObra(sol({ id: 5, estado: 'aprobada', origen: bodega('Paraguay') }), 3)).toBe(true);
        // A una bodega (sin ser devolución) tampoco.
        expect(llegaASuObra(sol({ id: 6, estado: 'aprobada', destino: bodega('Paraguay') }), 3)).toBe(false);
    });

    test('sin su obra conocida: llega lo que va a una obra; un traslado entre obras se toma como que sale (no se sabe su lado)', () => {
        expect(llegaASuObra(sol({ id: 4, estado: 'aprobada', destino: GORBEA }), null)).toBe(true);
        expect(llegaASuObra(traslado({ id: 2, estado: 'aprobada' }), null)).toBe(false);
        expect(llegaASuObra(devolucion({ id: 1, estado: 'aprobada' }), null)).toBe(false);
    });

    test('en el modelo: «Recibir» y su burbuja cuentan solo lo que llega; lo demás va aparte, sin «Recibir»', () => {
        const m = modeloObra(DATOS({
            solicitudes: [
                sol({ id: 31, estado: 'aprobada', dias: 4 }),
                sol({ id: 33, estado: 'en_transito', dias: 1 }),
                devolucion({ id: 37, estado: 'aprobada', dias: 3 }),
                traslado({ id: 38, estado: 'en_transito', dias: 2 }),
                sol({ id: 39, estado: 'aprobada', dias: 9, destino: GORBEA }),
                // Recibidas: la devolución ya recibida en la bodega no es «lo que ya llegó a tu obra».
                sol({ id: 21, estado: 'recibida', del_mes: true, recepcion: { por: null, fecha: '2026-10-08' } }),
                devolucion({ id: 27, estado: 'recibida', del_mes: true, recepcion: { por: null, fecha: '2026-10-12' } }),
                // Pedida: espera aprobación igual (es suya), con adónde va en su línea.
                devolucion({ id: 47, estado: 'pendiente', dias: 2 }),
            ],
        }));
        expect(m.porRecibir.todas.map(s => s.id)).toEqual([33, 31]);
        expect(textoRecibir(m.porRecibir.todas.length, m.enObra)).toBe('2 llegan a Domeyko');
        expect(m.fuera.todas.map(s => s.id)).toEqual([38, 39, 37]);
        expect(m.historial.map(s => s.id)).toEqual([21]);
        expect(m.esperando.todas.map(s => s.id)).toEqual([47]);
        expect(m.todasASuObra).toBe(false);
    });

    test('adónde va: devolución, traslado (desde su obra o entre otras) y lo pedido para otra obra', () => {
        expect(adondeVa(devolucion({ id: 1, estado: 'aprobada' }), 3)).toBe('Devolución a Bodega Cerrillos');
        expect(adondeVa(traslado({ id: 2, estado: 'aprobada' }), 3)).toBe('Traslado a Gorbea 3082');
        expect(adondeVa(traslado({ id: 2, estado: 'aprobada' }), null)).toBe('Traslado de Domeyko a Gorbea 3082');
        expect(adondeVa(sol({ id: 4, estado: 'aprobada', destino: GORBEA }), 3)).toBe('Para Gorbea 3082');
        expect(adondeVa(sol({ id: 4, estado: 'aprobada', destino: null }), 3)).toBe('Para otro lugar');
    });

    test('su línea: adónde va y en qué va (aprobada, en camino, una parte recibida); nunca «Recibir»', () => {
        expect(lineaFuera(devolucion({ id: 37, estado: 'aprobada', aprobacion: { por: LEO, fecha: '2026-10-19' } }), 3))
            .toBe('Devolución a Bodega Cerrillos · aprobó Leonardo el 19 oct');
        expect(lineaFuera(devolucion({ id: 37, estado: 'aprobada' }), 3)).toBe('Devolución a Bodega Cerrillos · aprobada');
        expect(lineaFuera(traslado({ id: 38, estado: 'en_transito', despacho: { por: JHOAN, fecha: '2026-10-21' } }), 3))
            .toBe('Traslado a Gorbea 3082 · salió el 21 oct');
        expect(lineaFuera(traslado({ id: 38, estado: 'en_transito' }), 3)).toBe('Traslado a Gorbea 3082 · en camino');
        expect(lineaFuera(traslado({ id: 38, estado: 'recepcion_parcial', ultima_recepcion: { por: null, fecha: '2026-10-20' } }), 3))
            .toBe('Traslado a Gorbea 3082 · llegó una parte el 20 oct');
    });

    test('esperando: si no va a su obra, la línea dice adónde va antes de cuándo se pidió', () => {
        expect(lineaEsperando(devolucion({ id: 47, estado: 'pendiente' }), 3)).toBe('Devolución a Bodega Cerrillos · pedida el 16 oct');
        expect(lineaEsperando(sol({ id: 42, estado: 'pendiente' }), 3)).toBe('pedida el 16 oct');
        expect(lineaEsperando(sol({ id: 42, estado: 'pendiente', fecha_solicitud: null }), 3)).toBe('');
    });
});

describe('topes de las listas (la burbuja y las cifras cuentan todas)', () => {
    const aprobadas = (n: number) => Array.from({ length: n }, (_, i) => sol({ id: 100 + i, estado: 'aprobada', dias: n - i }));

    test('los topes: 5 por recibir, 4 esperando, 2 no aprobadas, 3 que van a otro lugar, 3 del historial', () => {
        expect([TOPE_RECIBIR, TOPE_ESPERANDO, TOPE_RECHAZADAS, TOPE_FUERA, TOPE_HISTORIAL]).toEqual([5, 4, 2, 3, 3]);
    });

    test('por recibir: 7 aprobadas → se ven 5 y «Ver las 7 en Inventario» abre las aprobadas; con una en camino, «Todas»', () => {
        const m = modeloObra(DATOS({ solicitudes: aprobadas(7) }));
        expect(m.porRecibir.todas).toHaveLength(7);
        expect(m.porRecibir.visibles.map(s => s.id)).toEqual([100, 101, 102, 103, 104]);
        expect(m.porRecibir.pie).toEqual({ texto: 'Ver las 7 en Inventario', ruta: '/inventario?tab=transferencias&estado=aprobada' });
        const conCamino = modeloObra(DATOS({ solicitudes: [...aprobadas(6), sol({ id: 90, estado: 'en_transito', dias: 1 })] }));
        expect(conCamino.porRecibir.pie?.ruta).toBe('/inventario?tab=transferencias&estado=todas');
        // Hasta el tope, sin pie.
        expect(modeloObra(DATOS({ solicitudes: aprobadas(5) })).porRecibir.pie).toBeNull();
    });

    test('esperando y no aprobadas: su tope y su filtro (pendientes; las rechazadas van en «Todas»)', () => {
        const pedidas = Array.from({ length: 6 }, (_, i) => sol({ id: 200 + i, estado: 'pendiente', dias: 10 - i }));
        const rechazadas = Array.from({ length: 3 }, (_, i) =>
            sol({ id: 300 + i, estado: 'rechazada', del_mes: true, rechazo: { por: LEO, fecha: `2026-10-0${i + 1}`, motivo: null } }));
        const m = modeloObra(DATOS({ solicitudes: [...pedidas, ...rechazadas] }));
        expect(m.esperando.visibles).toHaveLength(4);
        expect(m.esperando.pie).toEqual({ texto: 'Ver las 6 en Inventario', ruta: '/inventario?tab=transferencias&estado=pendiente' });
        expect(m.rechazadas.visibles.map(s => s.id)).toEqual([302, 301]);
        expect(m.rechazadas.pie).toEqual({ texto: 'Ver las 3 en Inventario', ruta: '/inventario?tab=transferencias&estado=todas' });
    });

    test('conTope no cambia la lista original', () => {
        const lista = aprobadas(3);
        const r = conTope(lista, 2, 'aprobada');
        expect(r.visibles).toHaveLength(2);
        expect(lista).toHaveLength(3);
    });
});

describe('circuito', () => {
    test('las cifras son las del servidor; «Aprobada» suma las en tránsito; «hasta N días» solo en las etapas en curso', () => {
        const c = datosCircuito(DATOS().circuito);
        // Sin «Despachada» (don Luis 2026-10-23): 1 aprobada + 1 en tránsito; días, el máximo de las dos.
        expect(c.conteos).toEqual({ pedida: 2, aprobada: 2, recibida: 2 });
        expect(c.hasta).toEqual({ pedida: 6, aprobada: 4 });
        expect(c.enTransito).toBe(1);
        const vacio = datosCircuito({ ...DATOS().circuito, pedida: { total: 0, dias: null } });
        expect(vacio.hasta.pedida).toBeUndefined();
    });

    test('las etapas: Pedida → Aprobada · por recibir → Recibida (sin «Despachada»); con alguna en tránsito, «Todas»', () => {
        expect(pasosCircuito('2026-10-22').map(p => [p.texto, p.bajada, p.filtro])).toEqual([
            ['Pedida', 'por aprobar', 'pendiente'],
            ['Aprobada', 'por recibir', 'aprobada'],
            ['Recibida', 'en octubre', 'recibida'],
        ]);
        expect(pasosCircuito('2026-10-22', 1)[1].filtro).toBe('todas');
        expect(pasosCircuito('2027-01-03')[2].bajada).toBe('en enero');
        expect(pasosCircuito('')[2].bajada).toBe('este mes');
        expect(mesDe('2026-09-30')).toBe('septiembre');
        expect(mesDe('2026-13-01')).toBe('');
    });

    test('rótulos: «· Domeyko» y «lo que va a tu obra» solo si todo va a su obra', () => {
        const c = datosCircuito(DATOS().circuito);
        expect(rotulosCircuito(c, 'Domeyko', true)).toEqual({
            marcas: { aprobada: { tono: 'azul' } },
            titulo: 'Tus solicitudes en el circuito · Domeyko',
            nota: 'Marcado: lo que va a tu obra',
        });
        expect(rotulosCircuito(c, 'Domeyko', false)).toEqual({
            marcas: { aprobada: { tono: 'azul' } },
            titulo: 'Tus solicitudes en el circuito',
            nota: 'Marcado: lo aprobado que falta recibir',
        });
        expect(rotulosCircuito(c, null, false).titulo).toBe('Tus solicitudes en el circuito');
    });

    test('marcas: solo «Aprobada» con alguna (también si solo hay en tránsito); sin marcas, sin nota', () => {
        const sinDespacho = datosCircuito({ ...DATOS().circuito, despachada: { total: 0, dias: null } });
        expect(rotulosCircuito(sinDespacho, 'Domeyko', true).marcas).toEqual({ aprobada: { tono: 'azul' } });
        const soloTransito = datosCircuito({ ...DATOS().circuito, aprobada: { total: 0, dias: null } });
        expect(rotulosCircuito(soloTransito, 'Domeyko', true).marcas).toEqual({ aprobada: { tono: 'azul' } });
        const nada = datosCircuito({ ...DATOS().circuito, aprobada: { total: 0, dias: null }, despachada: { total: 0, dias: null } });
        expect(rotulosCircuito(nada, 'Domeyko', true)).toMatchObject({ marcas: {}, nota: null });
    });

    test('todasASuObra: mira lo que está en el circuito (en curso y recibido este mes), no lo rechazado ni lo viejo', () => {
        const base = [sol({ id: 31, estado: 'aprobada' }), sol({ id: 21, estado: 'recibida', del_mes: true })];
        expect(modeloObra(DATOS({ solicitudes: base })).todasASuObra).toBe(true);
        expect(modeloObra(DATOS({ solicitudes: [...base, devolucion({ id: 37, estado: 'aprobada' })] })).todasASuObra).toBe(false);
        expect(modeloObra(DATOS({ solicitudes: [...base, devolucion({ id: 27, estado: 'recibida', del_mes: false })] })).todasASuObra).toBe(true);
        expect(modeloObra(DATOS({ solicitudes: [...base, devolucion({ id: 28, estado: 'rechazada', del_mes: true })] })).todasASuObra).toBe(true);
        // Sin su obra conocida, nunca «· tu obra» en el título.
        expect(modeloObra(DATOS({ obra: null, solicitudes: base })).todasASuObra).toBe(false);
    });
});

describe('aviso de diferencias (aparte del circuito)', () => {
    test('«1 diferencia sin aclarar» y abre la solicitud de la más antigua (no la pestaña Diferencias, que la obra no ve)', () => {
        expect(avisoDiferencias({ total: 1, dias: 14, items: 1, mas_antigua_id: 21 })).toEqual({
            items: 1,
            titulo: '1 diferencia sin aclarar',
            bajada: 'Lo que llegó no calza con lo enviado · la más antigua, hace 14 días',
            ruta: '/inventario?tab=transferencias&estado=recibida&id=21',
        });
    });

    test('cuenta ítems (no solicitudes); de hoy; sin id, la lista de sus recibidas', () => {
        const a = avisoDiferencias({ total: 1, dias: 0, items: 3 });
        expect(a).toMatchObject({ titulo: '3 diferencias sin aclarar', bajada: 'Lo que llegó no calza con lo enviado · la más antigua es de hoy' });
        expect(a?.ruta).toBe('/inventario?tab=transferencias&estado=recibida');
    });

    test('en varias solicitudes: lo dice y abre sus recibidas (la más antigua sola dejaría las otras fuera de alcance)', () => {
        expect(avisoDiferencias({ total: 2, dias: 1, items: 3, mas_antigua_id: 21 })).toEqual({
            items: 3,
            titulo: '3 diferencias sin aclarar',
            bajada: 'Lo que llegó no calza con lo enviado en 2 solicitudes · la más antigua, hace 1 día',
            ruta: '/inventario?tab=transferencias&estado=recibida',
        });
    });

    test('sin diferencias: no hay aviso', () => {
        expect(avisoDiferencias({ total: 0, dias: null, items: 0, mas_antigua_id: null })).toBeNull();
        expect(modeloObra(DATOS({ circuito: { ...DATOS().circuito, diferencias: { total: 0, dias: null, items: 0 } } })).diferencias).toBeNull();
    });
});

describe('botón «Recibir»', () => {
    test('«2 llegan a Domeyko», «1 llega a tu obra», «Nada en camino»', () => {
        expect(textoRecibir(2, 'Domeyko')).toBe('2 llegan a Domeyko');
        expect(textoRecibir(1, 'tu obra')).toBe('1 llega a tu obra');
        expect(textoRecibir(0, 'Domeyko')).toBe('Nada en camino');
    });

    test('con permiso de recibir: «Recibir» en verde de acción y la nota que invita a confirmar', () => {
        expect(botonRecibir(2, 'Domeyko', true)).toEqual({
            titulo: 'Recibir', texto: '2 llegan a Domeyko', accion: true, etiqueta: 'Recibir: 2 llegan a Domeyko',
            nota: 'Cuando llegue, tócala y confirma lo que llegó', accionFila: 'Recibir',
        });
    });

    test('sin el permiso: «Lo que llega», neutro, y la nota no le pide confirmar (lo hace quien recibe en obra)', () => {
        expect(botonRecibir(2, 'Domeyko', false)).toEqual({
            titulo: 'Lo que llega', texto: '2 llegan a Domeyko', accion: false, etiqueta: 'Lo que llega: 2 llegan a Domeyko',
            nota: 'Quien recibe en obra confirma lo que llegó', accionFila: 'Ver',
        });
    });

    test('sin nada en camino abre lo último que llegó (las aprobadas estarían vacías)', () => {
        expect(botonRecibir(0, 'Domeyko', true).etiqueta).toBe('Recibir: nada en camino. Abre lo que ya llegó');
        expect(RUTA_RECIBIR_VACIO).toBe('/inventario?tab=transferencias&estado=recibida');
    });
});

describe('botones grandes: «Pedir materiales» solo si puede pedir; nunca uno de aprobar', () => {
    const PUEDE = DATOS().puede;

    test('con permiso de pedir: «Pedir materiales» y «Recibir»', () => {
        expect(botonesGrandes(PUEDE)).toEqual(['pedir', 'recibir']);
        expect(botonesGrandes({ ...PUEDE, recibir: false })).toEqual(['pedir', 'recibir']);
    });

    test('sin permiso de pedir (un prevencionista que solo recibe): solo «Recibir», sin «Pedir materiales»', () => {
        expect(botonesGrandes({ ...PUEDE, solicitar: false })).toEqual(['recibir']);
        // Sin recibir tampoco: «Recibir» queda como «Lo que llega», neutro (no se quita: muestra lo que viene).
        expect(botonesGrandes({ ...PUEDE, solicitar: false, recibir: false })).toEqual(['recibir']);
        expect(botonRecibir(1, 'Domeyko', false).accion).toBe(false);
    });

    test('con aprobar (un rol de obra hecho a mano, sin ver_todas): ni botón ni fila de aprobar', () => {
        const conAprobar = { ...PUEDE, aprobar: true, ver_diferencias: true, resolver_diferencias: true, sod_bypass: true };
        expect(botonesGrandes(conAprobar)).toEqual(['pedir', 'recibir']);
        expect(botonesGrandes({ ...conAprobar, solicitar: false })).toEqual(['recibir']);
        // La acción de cada fila por recibir es «Recibir» o «Ver»; nunca «Aprobar».
        expect([botonRecibir(2, 'Domeyko', true).accionFila, botonRecibir(2, 'Domeyko', false).accionFila]).toEqual(['Recibir', 'Ver']);
        // Y el modelo no cambia con aprobar: lo pendiente va en «Esperando a Leonardo», que solo abre la solicitud.
        const pendientes = [sol({ id: 42, estado: 'pendiente', dias: 6 }), sol({ id: 45, estado: 'pendiente', dias: 1, propia: false })];
        const sin = modeloObra(DATOS({ solicitudes: pendientes }));
        const con = modeloObra(DATOS({
            puede: conAprobar,
            solicitudes: pendientes.map(s => ({ ...s, puede_aprobar: !s.propia, bloqueo_aprobar: s.propia ? 'sod_solicitante' as const : null })),
        }));
        expect(con.esperando.todas.map(s => s.id)).toEqual(sin.esperando.todas.map(s => s.id));
        expect({ ...con, esperando: null }).toEqual({ ...sin, esperando: null });
    });

    test('VistaObra.tsx: «Pedir materiales» sale de `botonesGrandes` y no lee nada de aprobar', () => {
        const fuente = fs.readFileSync(path.join(__dirname, 'VistaObra.tsx'), 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');
        expect(fuente).toMatch(/botones=\{botonesGrandes\(datos\.puede\)\}/);
        expect(fuente).toMatch(/botones\.includes\('pedir'\) && \(/);
        expect(fuente).not.toMatch(/puede\.aprobar|puede_aprobar|bloqueo_aprobar|resolver_diferencias|sod_bypass/);
        expect(fuente).not.toMatch(/\bAprobar\b|\bRechazar\b/);
    });
});

describe('textos de las filas', () => {
    test('lo que llega va con la cantidad que sale (lo aprobado), sin los ítems cortados a 0; hasta 3', () => {
        const s = sol({
            id: 31, estado: 'aprobada',
            items: [item('Moldaje fenólico 1,22×2,44', 'UN', 15, 15), item('Clavos 4"', 'KG', 12, 10), item('Alambre', 'KG', 5, 0)],
        });
        expect(itemsQueLlegan(s)).toBe('Moldaje fenólico 1,22×2,44 ×15 y Clavos 4" ×10 kg');
        const sinEnviar = sol({ id: 32, estado: 'aprobada', items: [item('Betonera 150 L', 'UN', 1), item('Rotomartillo SDS', 'UN', 2)] });
        expect(itemsQueLlegan(sinEnviar)).toBe('Betonera 150 L ×1 y Rotomartillo SDS ×2');
        const cuatro = sol({ id: 33, estado: 'aprobada', items: ['A', 'B', 'C', 'D'].map(n => item(n, 'UN', 1, 1)) });
        expect(itemsQueLlegan(cuatro)).toBe('A ×1, B ×1, C ×1 y 1 ítem más');
        expect(itemsQueLlegan(sol({ id: 34, estado: 'aprobada', items: [] }))).toBe('TRF-202610-0034');
        // Lo pedido (esperando, no aprobadas): hasta 2.
        expect(itemsPedidos(sol({ id: 42, estado: 'pendiente', items: [item('Cemento', 'SACO', 40), item('Arena gruesa', 'M3', 3)] })))
            .toBe('Cemento ×40 sacos y Arena gruesa ×3 m³');
    });

    test('estado de la fila: en camino (azul), una parte recibida (azul), aprobada (verde)', () => {
        expect(estadoPorRecibir({ estado: 'en_transito', etapa: 'despachada' })).toEqual({ texto: 'En camino', tono: 'azul', enCamino: true });
        expect(estadoPorRecibir({ estado: 'recepcion_parcial', etapa: 'despachada' })).toEqual({ texto: 'Llegó una parte', tono: 'azul', enCamino: true });
        expect(estadoPorRecibir({ estado: 'aprobada', etapa: 'aprobada' })).toEqual({ texto: 'Aprobada', tono: 'verde', enCamino: false });
    });

    test('línea de una en camino: «Salió de Paraguay el 21 oct», sin nombrar a quien despachó (don Luis 2026-10-23)', () => {
        const s = sol({ id: 33, estado: 'en_transito', origen: bodega('Paraguay'), despacho: { por: JHOAN, fecha: '2026-10-21' } });
        expect(lineaPorRecibir(s)).toBe('Salió de Paraguay el 21 oct');
        expect(lineaPorRecibir(s)).not.toMatch(/despach|Jhoan/i);
        // Con quién despachó pero sin fecha: lo que sí quedó, la aprobación.
        const sinFecha = { ...s, despacho: { por: JHOAN, fecha: null }, aprobacion: { por: LEO, fecha: '2026-10-17' } };
        expect(lineaPorRecibir(sinFecha)).toBe('Salió de Paraguay · aprobó Leonardo el 17 oct');
    });

    test('en camino sin despacho registrado: no inventa quién despachó; dice lo que sí quedó (la aprobación)', () => {
        const s = sol({ id: 33, estado: 'en_transito', origen: bodega('Paraguay'), aprobacion: { por: LEO, fecha: '2026-10-17' } });
        expect(lineaPorRecibir(s)).toBe('Salió de Paraguay · aprobó Leonardo el 17 oct');
        expect(lineaPorRecibir({ ...s, origen: null })).toBe('Aprobó Leonardo el 17 oct');
        expect(lineaPorRecibir({ ...s, origen: null, aprobacion: null })).toBe('');
    });

    test('con una parte recibida: agrega «llegó una parte el …»', () => {
        const s = sol({
            id: 36, estado: 'recepcion_parcial', origen: bodega('Bodega Cerrillos'), despacho: { por: JHOAN, fecha: '2026-10-19' },
            ultima_recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-20' },
        });
        expect(lineaPorRecibir(s)).toBe('Salió de Bodega Cerrillos el 19 oct · llegó una parte el 20 oct');
    });

    test('línea de una aprobada: «Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos»', () => {
        const s = sol({ id: 31, estado: 'aprobada', origen: bodega('Bodega Cerrillos'), aprobacion: { por: LEO, fecha: '2026-10-18' } });
        expect(lineaPorRecibir(s)).toBe('Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos');
    });

    test('varios orígenes: nombra el principal «y N lugares más» (la cabecera guarda solo uno)', () => {
        const s = sol({ id: 31, estado: 'aprobada', origen: bodega('Bodega Cerrillos'), aprobacion: { por: LEO, fecha: '2026-10-18' }, origenes_extra: 1 });
        expect(textoOrigen(s)).toBe('Bodega Cerrillos y 1 lugar más');
        expect(textoOrigen({ ...s, origenes_extra: 2 })).toBe('Bodega Cerrillos y 2 lugares más');
        expect(textoOrigen({ ...s, origenes_extra: undefined })).toBe('Bodega Cerrillos');
        expect(textoOrigen({ ...s, origen: null })).toBeNull();
        expect(lineaPorRecibir(s)).toBe('Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos y 1 lugar más');
        const enCamino = sol({ id: 33, estado: 'en_transito', origen: bodega('Paraguay'), despacho: { por: JHOAN, fecha: '2026-10-21' }, origenes_extra: 1 });
        expect(lineaPorRecibir(enCamino)).toBe('Salió de Paraguay y 1 lugar más, el 21 oct');
        expect(lineaHistorial({ ...s, estado: 'recibida', etapa: 'recibida' })).toBe('desde Bodega Cerrillos y 1 lugar más · aprobó Leonardo el 18 oct');
    });

    test('textoAprobo con lo que haya registrado', () => {
        expect(textoAprobo({ aprobacion: { por: LEO, fecha: '2026-10-18' } })).toBe('Aprobó Leonardo el 18 oct');
        expect(textoAprobo({ aprobacion: { por: LEO, fecha: null } })).toBe('Aprobó Leonardo');
        expect(textoAprobo({ aprobacion: { por: null, fecha: '2026-10-18' } })).toBe('Aprobada el 18 oct');
        expect(textoAprobo({ aprobacion: null })).toBeNull();
        expect(textoAprobo({ aprobacion: { por: LEO, fecha: '2026-10-06' } }, { minuscula: true })).toBe('aprobó Leonardo el 6 oct');
    });

    test('historial: «desde Bodega Cerrillos · aprobó Leonardo el 6 oct» y la píldora de lo que llegó', () => {
        const s = sol({
            id: 21, estado: 'recibida', origen: bodega('Bodega Cerrillos'), aprobacion: { por: LEO, fecha: '2026-10-06' },
            items: [item('Cemento', 'SACO', 50, 50, 48), item('Fierro 8 mm', 'BARRA', 40, 40, 40)],
        });
        expect(lineaHistorial(s)).toBe('desde Bodega Cerrillos · aprobó Leonardo el 6 oct');
        expect(pildoraHistorial(s)).toEqual({ texto: 'Faltaron 2 sacos', tono: 'rojo' });
        expect(pildoraHistorial({ items: [item('Andamio marco 1,5 m', 'UN', 8, 8, 8)] })).toEqual({ texto: 'Llegó completa', tono: 'neutro' });
        expect(pildoraHistorial({ items: [item('A', 'UN', 2, 2, 1), item('B', 'UN', 2, 2, 3)] })).toEqual({ texto: '2 ítems con diferencia', tono: 'rojo' });
        expect(lineaHistorial({ ...s, origen: null, aprobacion: null })).toBe('');
    });

    test('historial · personalizados: un contador sin anotar (0) NO es «faltó todo»; sin píldora salvo que todo esté anotado y calce', () => {
        // Cemento personalizado: RecibirForm parte el contador en 0; cerrar sin tocarlo deja 0 y no genera diferencia.
        expect(pildoraHistorial({ items: [personalizado('Cemento', 'SACO', 40, 40, 0)] })).toBeNull();
        expect(pildoraHistorial({ items: [personalizado('Cemento', 'SACO', 40, 40, 38)] })).toBeNull();
        expect(pildoraHistorial({ items: [personalizado('Cemento', 'SACO', 40, 40, 40)] })).toEqual({ texto: 'Llegó completa', tono: 'neutro' });
        // El catálogo manda: lo que anota transferencia_discrepancias (lo mismo que cuenta el aviso de diferencias).
        expect(pildoraHistorial({ items: [item('Andamio', 'UN', 8, 8, 6), personalizado('Cemento', 'SACO', 40, 40, 0)] }))
            .toEqual({ texto: 'Faltaron 2 unidades', tono: 'rojo' });
        expect(pildoraHistorial({ items: [item('Andamio', 'UN', 8, 8, 8), personalizado('Cemento', 'SACO', 40, 40, 0)] })).toBeNull();
        expect(pildoraHistorial({ items: [] })).toBeNull();
    });

    test('esperando: «6 días esperando» en ámbar (rojo desde 31), «de hoy»; «pedida el 16 oct»', () => {
        expect(pildoraEsperando(6)).toEqual({ texto: '6 días esperando', tono: 'ambar' });
        expect(pildoraEsperando(1)).toEqual({ texto: '1 día esperando', tono: 'ambar' });
        expect(pildoraEsperando(0)).toEqual({ texto: 'de hoy', tono: 'ambar' });
        expect(pildoraEsperando(31)).toEqual({ texto: '31 días esperando', tono: 'rojo' });
        expect(textoPedida({ fecha_solicitud: '2026-10-16' })).toBe('pedida el 16 oct');
        expect(textoPedida({ fecha_solicitud: null })).toBe('');
    });

    test('no aprobada: ítems, cuándo y el motivo que escribió quien la rechazó (sin motivo, nada)', () => {
        const s = sol({
            id: 24, estado: 'rechazada', items: [item('Taladro percutor', 'UN', 2)],
            rechazo: { por: LEO, fecha: '2026-10-10', motivo: ' Ya hay stock en la obra (bodega de faena). ' },
        });
        expect(textoRechazo(s)).toEqual({ items: 'Taladro percutor ×2', cuando: ', el 10 oct.', motivo: 'Ya hay stock en la obra (bodega de faena).' });
        expect(textoRechazo({ ...s, rechazo: { por: LEO, fecha: null, motivo: '' } })).toEqual({ items: 'Taladro percutor ×2', cuando: '.', motivo: null });
    });
});

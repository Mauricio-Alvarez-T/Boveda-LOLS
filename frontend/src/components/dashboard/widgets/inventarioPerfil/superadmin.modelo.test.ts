import {
    FIN_COMPLETA, FIN_CON_DIFERENCIA, FIN_DISTINTO, FIN_RECIBIDA, FIN_REVISADA, GRUPOS, JEFATURA, NOTA_DESTINO, QUIEN_APRUEBA,
    TEXTO_SIN_DIFERENCIA, TOPE_GRUPO, TOPE_GRUPO_ABIERTO, ahoraDe, avisoDiferencias, circuitoSuperAdmin, conteosMes, despuesDe,
    etiquetaPaso, etiquetaResponsable, filasDelGrupo, gruposDe, listaCortada, mesDe, modeloSuperAdmin, nombresCortos,
    notaObraElegida, porDia, quienApruebaDe, quienRecibe, responsablesDe, rotuloDia, rotuloGrupo, solicitudDesdeDiferencias,
    textoHasta, textoVerUltimo, vaAUnaObra,
    type Casilla, type Evento,
} from './superadmin.modelo';
import type { CircuitoPerfil, DiferenciaPerfil, InventarioPerfilApi, LugarPerfil, SolicitudPerfil } from './tipos';

const NB = String.fromCharCode(160);
const HOY = '2026-10-22';
const LEO = { id: 10, nombre: 'Leonardo López' };
const JHOAN = { id: 30, nombre: 'Jhoan Vásquez' };
const HECTOR = { id: 31, nombre: 'Héctor Gómez' };
const MARCO = { id: 1, nombre: 'Marco Uribe' };
const obra = (id: number, nombre: string): LugarPerfil => ({ tipo: 'obra', id, nombre, responsable: null });
const CERRILLOS: LugarPerfil = { tipo: 'bodega', id: 1, nombre: 'Bodega Cerrillos', responsable: null };
const PARAGUAY: LugarPerfil = { tipo: 'bodega', id: 2, nombre: 'Paraguay', responsable: null };
const DOMEYKO = obra(1, 'Domeyko');
const GORBEA = obra(2, 'Gorbea 3082');

const sol = (o: Partial<SolicitudPerfil> & { id: number }): SolicitudPerfil => ({
    codigo: `TRF-202610-00${o.id}`,
    estado: 'pendiente',
    etapa: 'pedida',
    tipo_flujo: 'solicitud',
    tipo: 'materiales',
    origen: null,
    destino: DOMEYKO,
    solicitante: { id: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra' },
    propia: false,
    fecha_solicitud: '2026-10-13',
    aprobacion: null,
    despacho: null,
    recepcion: null,
    ultima_recepcion: null,
    rechazo: null,
    dias: 0,
    del_mes: false,
    puede_aprobar: null,
    bloqueo_aprobar: null,
    items: [{ clave: `p${o.id}`, personalizado: true, descripcion: 'Cemento', unidad: 'SACO', pedida: 40, enviada: null, recibida: null }],
    ...o,
});

const dif = (o: Partial<DiferenciaPerfil> & { id: number; transferencia_id: number }): DiferenciaPerfil => ({
    codigo: `TRF-202610-00${o.transferencia_id}`,
    descripcion: 'Andamio marco 1,5 m',
    unidad: 'UN',
    enviada: 12,
    recibida: 9,
    diferencia: 3,
    faltan: 3,
    sobran: 0,
    origen: CERRILLOS,
    destino: GORBEA,
    aprobacion: { por: LEO, fecha: '2026-10-17' },
    despacho: { por: JHOAN, fecha: '2026-10-19' },
    recepcion: { por: { id: 24, nombre: 'Ana Rojas' }, fecha: '2026-10-20' },
    dias: 2,
    ...o,
});

const CIRCUITO: CircuitoPerfil = {
    pedida: { total: 1, dias: 9 },
    aprobada: { total: 1, dias: 2 },
    despachada: { total: 1, dias: 1 },
    // Las del mes que trae la lista (22 y 21): con la cifra exacta igual a la lista, ninguna vino cortada.
    recibida: { total: 2, ultima: '2026-10-08' },
    diferencias: { total: 2, items: 2, dias: 40 },
};

/** La lista del ejemplo: una de cada paso, más una recibida que solo vino en `diferencias`. */
const SOLICITUDES: SolicitudPerfil[] = [
    sol({ id: 41, dias: 9, destino: GORBEA, solicitante: { id: 21, nombre: 'Carla Soto', rol: 'Prevencionista' } }),
    sol({
        id: 32, estado: 'aprobada', etapa: 'aprobada', dias: 2, origen: CERRILLOS, destino: GORBEA, fecha_solicitud: '2026-10-15',
        aprobacion: { por: LEO, fecha: '2026-10-20' },
    }),
    sol({
        id: 33, estado: 'en_transito', etapa: 'despachada', dias: 1, origen: PARAGUAY, fecha_solicitud: '2026-10-12', tipo: 'herramientas',
        aprobacion: { por: LEO, fecha: '2026-10-17' }, despacho: { por: JHOAN, fecha: '2026-10-21' },
    }),
    sol({
        id: 34, estado: 'recepcion_parcial', etapa: 'despachada', dias: 3, origen: CERRILLOS, fecha_solicitud: '2026-10-11',
        aprobacion: { por: LEO, fecha: '2026-10-12' }, despacho: { por: HECTOR, fecha: '2026-10-14' },
        ultima_recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-19' },
    }),
    // Recibida completa, SIN despacho (la interfaz no tiene «Despachar»).
    sol({
        id: 22, estado: 'recibida', etapa: 'recibida', del_mes: true, dias: 19, origen: PARAGUAY, fecha_solicitud: '2026-10-01',
        aprobacion: { por: LEO, fecha: '2026-10-02' }, recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-03' },
        items: [{ clave: 'c22', personalizado: false, descripcion: 'Andamio marco 1,5 m', unidad: 'UN', pedida: 8, enviada: 8, recibida: 8 }],
    }),
    // Recibida con una diferencia pendiente (dos ítems: la diferencia nombra el suyo).
    sol({
        id: 21, estado: 'recibida', etapa: 'recibida', del_mes: true, dias: 14, origen: CERRILLOS, fecha_solicitud: '2026-10-05',
        aprobacion: { por: LEO, fecha: '2026-10-06' }, despacho: { por: JHOAN, fecha: '2026-10-07' },
        recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-08' },
        items: [
            { clave: 'p21a', personalizado: true, descripcion: 'Cemento', unidad: 'SACO', pedida: 50, enviada: 50, recibida: 48 },
            { clave: 'p21b', personalizado: true, descripcion: 'Fierro 8 mm', unidad: 'BARRA', pedida: 40, enviada: 40, recibida: 40 },
        ],
    }),
    // Recibida que llegó distinto (ítem del catálogo: dejó diferencia), pero ya se revisó (no está en `diferencias`). De septiembre.
    sol({
        id: 23, codigo: 'TRF-202609-0118', estado: 'recibida', etapa: 'recibida', del_mes: false, dias: 25, origen: CERRILLOS,
        fecha_solicitud: '2026-09-24', aprobacion: { por: LEO, fecha: '2026-09-25' }, recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-09-27' },
        items: [{ clave: 'c23', personalizado: false, descripcion: 'Arena fina', unidad: 'M3', pedida: 4, enviada: 4, recibida: 3 }],
    }),
    sol({
        id: 24, estado: 'rechazada', etapa: 'rechazada', del_mes: true, dias: 12, fecha_solicitud: '2026-10-09', tipo: 'herramientas',
        rechazo: { por: LEO, fecha: '2026-10-10', motivo: 'Ya hay stock en la obra (bodega de faena).' },
    }),
];

const DIFERENCIAS: DiferenciaPerfil[] = [
    // De la 21 (en la lista).
    dif({
        id: 2, transferencia_id: 21, descripcion: 'Cemento', unidad: 'SACO', enviada: 50, recibida: 48, diferencia: 2, faltan: 2,
        destino: DOMEYKO, despacho: { por: JHOAN, fecha: '2026-10-07' }, recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-08' }, dias: 14,
    }),
    // De la 9, recibida en agosto: NO vino en `solicitudes`. Llegó de más y sin despacho.
    dif({
        id: 7, transferencia_id: 9, codigo: 'TRF-202608-0009', descripcion: 'Puntal metálico 3 m', enviada: 20, recibida: 21, diferencia: -1,
        faltan: 0, sobran: 1, despacho: null, aprobacion: { por: LEO, fecha: '2026-08-10' }, recepcion: { por: null, fecha: '2026-08-12' }, dias: 71,
    }),
];

const datos = (o: Partial<InventarioPerfilApi> = {}): InventarioPerfilApi => ({
    hoy: HOY,
    perfil: 'aprueba',
    super_admin: true,
    alcance: { todas: true, bodega_id: null },
    obra: null,
    puede: { aprobar: true, ver_diferencias: true, resolver_diferencias: true, solicitar: true, recibir: true, sod_bypass: true },
    aprobadores: [LEO],
    circuito: CIRCUITO,
    solicitudes: SOLICITUDES,
    diferencias: DIFERENCIAS,
    limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
    ...o,
});

const fila = (m: ReturnType<typeof modeloSuperAdmin>, id: number) =>
    Object.values(m.porGrupo).flat().find(f => f.id === id)!;
const tipos = (c: Casilla[]) => c.map(x => x.tipo);

// ─────────────────────────────── Grupos y orden ───────────────────────────────

describe('grupos de la secuencia', () => {
    const m = modeloSuperAdmin(datos());

    it('cada solicitud cae en un solo paso; la que solo vino en «diferencias» también aparece', () => {
        const ids = (g: keyof typeof m.porGrupo) => m.porGrupo[g].map(f => f.id);
        expect(ids('aprobar')).toEqual([41]);
        expect(ids('aprobada')).toEqual([32]);
        expect(ids('camino')).toEqual([33, 34]);
        // Primero las que tienen una diferencia por resolver (la 21 y la 9); después la ya revisada (23).
        expect(ids('dif')).toEqual([21, 9, 23]);
        expect(ids('completa')).toEqual([22]);
        expect(ids('rechazada')).toEqual([24]);
    });

    it('pestañas con su cifra; «Recibidas» junta con diferencia y completas', () => {
        expect(m.filtros).toEqual([
            { key: 'todas', texto: 'Todas', n: 9 },
            { key: 'aprobar', texto: 'Por aprobar', n: 1 },
            { key: 'aprobada', texto: 'Aprobada', n: 1 },
            { key: 'camino', texto: 'En camino', n: 2 },
            { key: 'recibidas', texto: 'Recibidas', n: 4 },
            { key: 'rechazada', texto: 'No aprobada', n: 1 },
        ]);
        expect(gruposDe('recibidas').map(g => g.key)).toEqual(['dif', 'completa']);
        expect(gruposDe('todas')).toHaveLength(6);
    });

    it('rótulo con la cifra pegada', () => {
        const [aprobar, aprobada] = gruposDe('todas');
        expect(rotuloGrupo(aprobar, 6)).toBe(`Por aprobar ·${NB}6`);
        expect(rotuloGrupo(aprobada, 1)).toBe(`Aprobada · por recibir ·${NB}1`);
    });

    it('cuántas filas se dibujan: 2 en «Todas» cerrada; desplegada o en pestaña, hasta 50 y el resto en Inventario', () => {
        expect(filasDelGrupo(6, { enTodas: true, desplegada: false })).toEqual({ vista: TOPE_GRUPO, resto: 0 });
        expect(filasDelGrupo(1, { enTodas: true, desplegada: false })).toEqual({ vista: 1, resto: 0 });
        expect(filasDelGrupo(6, { enTodas: true, desplegada: true })).toEqual({ vista: 6, resto: 0 });
        expect(filasDelGrupo(80, { enTodas: false, desplegada: false })).toEqual({ vista: TOPE_GRUPO_ABIERTO, resto: 30 });
    });

    it('«Ver»: la diferencia pendiente abre Inventario → Diferencias; lo demás, la solicitud', () => {
        expect(fila(m, 21).ruta).toBe('/inventario?tab=transferencias&estado=discrepancias&id=21');
        expect(fila(m, 21).etiquetaRuta).toBe('Ver la diferencia de TRF-202610-0021');
        expect(fila(m, 41).ruta).toBe('/inventario?tab=transferencias&estado=pendiente&id=41');
        expect(fila(m, 23).ruta).toBe('/inventario?tab=transferencias&estado=recibida&id=23');
    });
});

// ─────────────────────────────── Casillas por paso ───────────────────────────────

describe('casillas de cada solicitud', () => {
    const m = modeloSuperAdmin(datos());

    it('por aprobar: pidió, ahora le toca a quien aprueba (nombre de `aprobadores`), lo que falta punteado', () => {
        const f = fila(m, 41);
        expect(tipos(f.casillas)).toEqual(['hecho', 'ahora', 'falta', 'falta', 'nada']);
        expect(f.casillas[0]).toMatchObject({ verbo: 'Pidió', quien: 'Carla Soto', fecha: '13 oct', extra: 'Prevencionista' });
        expect(f.casillas[1]).toMatchObject({ verbo: 'aprobar', quien: 'Leonardo López', tono: 'ambar', detalle: '9 días esperando' });
        expect(f.ahora).toBe('aprobar · Leonardo López');
        expect(f.despues).toBe('Después: despachar y recibir.');
        expect(f.items).toBe('Cemento ×40 sacos');
        expect(f.tipo).toBe('Materiales');
    });

    it('aprobada: «sale de bodega» con quienes despacharon antes desde ahí y hace cuánto; la obra ya puede recibir', () => {
        const f = fila(m, 32);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'ahora', 'falta', 'nada']);
        expect(f.casillas[1]).toMatchObject({ verbo: 'Aprobó', quien: 'Leonardo López', fecha: '20 oct' });
        // Desde Cerrillos despacharon Jhoan y Héctor (Jhoan despachó último en cualquier bodega: va primero). No está
        // registrado para ESTA solicitud: dice «antes».
        expect(f.casillas[2]).toMatchObject({ verbo: 'sale de bodega', quien: 'Bodega Cerrillos', detalle: `antes despacharon Jhoan y Héctor · hace${NB}2${NB}días` });
        expect(f.casillas[3]).toMatchObject({ tipo: 'falta', verbo: 'Recibir', nota: 'la obra ya puede hacerlo' });
        expect(f.despues).toBe('Después: recibir (la obra ya puede hacerlo).');
    });

    it('aprobada con responsable de bodega: va el responsable; desde una obra: «sale de la obra»', () => {
        const conResp = modeloSuperAdmin(datos({
            solicitudes: [sol({ id: 50, estado: 'aprobada', etapa: 'aprobada', dias: 0, origen: { ...CERRILLOS, responsable: 'Juan Pérez' } })],
            diferencias: [],
        }));
        expect(fila(conResp, 50).casillas[2]).toMatchObject({ quien: 'Bodega Cerrillos', detalle: 'Juan Pérez · de hoy' });
        const desdeObra = modeloSuperAdmin(datos({
            solicitudes: [sol({ id: 51, estado: 'aprobada', etapa: 'aprobada', dias: 3, origen: GORBEA })], diferencias: [],
        }));
        expect(fila(desdeObra, 51).casillas[2]).toMatchObject({ verbo: 'sale de la obra', quien: 'Gorbea 3082', detalle: `hace${NB}3${NB}días` });
    });

    it('en camino: despachó (con la bodega) y ahora recibe quien pidió; recepción parcial: «recibir lo que falta»', () => {
        const f = fila(m, 33);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'hecho', 'ahora', 'nada']);
        expect(f.casillas[2]).toMatchObject({ verbo: 'Despachó', quien: 'Jhoan Vásquez', fecha: '21 oct', extra: 'desde Paraguay' });
        expect(f.casillas[3]).toMatchObject({ verbo: 'recibir', quien: 'Tomás Vera', tono: 'azul', detalle: 'salió hace 1 día' });
        expect(f.tipo).toBe('Herramientas');
        expect(fila(m, 34).casillas[3]).toMatchObject({ verbo: 'recibir lo que falta', detalle: 'llegó una parte el 19 oct' });
    });

    it('recibida sin despacho: el paso «Despachada» se mantiene en gris («Sin despacho»)', () => {
        const f = fila(m, 22);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'sin', 'hecho', 'fin']);
        expect(f.casillas[2]).toEqual({ tipo: 'sin', verbo: 'Sin despacho', nota: 'la obra recibió directo' });
        expect(f.casillas[3]).toMatchObject({ verbo: 'Recibió', quien: 'Tomás Vera', fecha: '3 oct' });
        expect(f.casillas[4]).toMatchObject({ tipo: 'fin', quien: 'Llegó completa', completa: true });
        expect(f.ahora).toBeNull();
        expect(f.despues).toBeNull();
    });

    it('con diferencia pendiente: «Recibió» con lo que faltó y ahora la resuelve quien aprueba; jefatura la investiga', () => {
        const f = fila(m, 21);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'hecho', 'hecho', 'ahora']);
        expect(f.casillas[3]).toMatchObject({
            punto: 'rojo',
            difs: [{ clave: 'd2', pildora: 'Faltan 2 sacos', tono: 'rojo', texto: 'Cemento: salieron 50, llegaron 48. La anotó al recibir.' }],
        });
        expect(f.casillas[4]).toMatchObject({
            verbo: 'resolver la diferencia', quien: 'Leonardo López', tono: 'rojo', detalle: '14 días sin resolver', nota: `${JEFATURA} la investiga`,
        });
        expect(f.porResolver).toBe(true);
    });

    it('diferencia ya revisada: cerrada, con lo que llegó distinto en gris', () => {
        const f = fila(m, 23);
        expect(f.casillas[3].difs).toEqual([{ clave: 'c23', pildora: 'Faltó 1 m³', tono: 'neutro', texto: 'Salieron 4, llegaron 3.' }]);
        expect(f.casillas[3].punto).toBeUndefined();
        expect(f.casillas[4]).toMatchObject({ tipo: 'fin', quien: FIN_REVISADA });
        // Sin la lista de diferencias, o si vino cortada, no se sabe si sigue pendiente.
        const sinLista = modeloSuperAdmin(datos({ diferencias: null }));
        expect(fila(sinLista, 23).casillas[4]).toMatchObject({ tipo: 'fin', quien: FIN_CON_DIFERENCIA });
        const cortada = modeloSuperAdmin(datos({ circuito: { ...CIRCUITO, diferencias: { total: 3, items: 3, dias: 40 } } }));
        expect(fila(cortada, 23).casillas[4]).toMatchObject({ tipo: 'fin', quien: FIN_CON_DIFERENCIA });
        expect(cortada.eventos.find(e => e.solicitudId === 23 && e.accion === 'recibio')?.pie).toBe('TRF-202609-0118 · Arena fina: faltó 1 m³');
    });

    it('un ítem fuera del catálogo que llegó distinto: «Llegó distinto», sin diferencia registrada (nadie la revisó)', () => {
        const p = sol({
            id: 70, estado: 'recibida', etapa: 'recibida', del_mes: true, origen: CERRILLOS, recepcion: { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-21' },
            items: [{ clave: 'p70', personalizado: true, descripcion: 'Cemento', unidad: 'SACO', pedida: 50, enviada: 50, recibida: 48 }],
        });
        const m2 = modeloSuperAdmin(datos({ solicitudes: [...SOLICITUDES, p], circuito: { ...CIRCUITO, recibida: { total: 3, ultima: '2026-10-21' } } }));
        const f = fila(m2, 70);
        expect(f.grupo).toBe('dif');
        expect(f.casillas[3].difs).toEqual([{ clave: 'p70', pildora: 'Faltaron 2 sacos', tono: 'neutro', texto: 'Salieron 50, llegaron 48. Sin diferencia registrada.' }]);
        expect(f.casillas[4]).toMatchObject({ tipo: 'fin', quien: FIN_DISTINTO });
        expect(f.casillas.some(c => c.quien === FIN_REVISADA)).toBe(false);
        expect(m2.eventos.find(e => e.solicitudId === 70 && e.accion === 'recibio')).toMatchObject({
            frase: 'recibió en Domeyko', pie: 'TRF-202610-0070 · Cemento: faltaron 2 sacos · sin diferencia registrada', tono: 'neutro', icono: 'recibio',
        });
    });

    it('si la app no sabe cuánto llegó de un ítem, no dice «completa»: «Recibida» (y el paso no dice «llegaron completas»)', () => {
        const recepcion = { por: { id: 20, nombre: 'Tomás Vera' }, fecha: '2026-10-21' };
        // Fuera del catálogo en 0 con algo enviado: RecibirForm parte su contador en 0 (no es «no llegó nada»).
        const cero = sol({
            id: 71, estado: 'recibida', etapa: 'recibida', del_mes: true, recepcion,
            items: [{ clave: 'p71', personalizado: true, descripcion: 'Arena', unidad: 'M3', pedida: 3, enviada: 3, recibida: 0 }],
        });
        const nulo = sol({
            id: 72, estado: 'recibida', etapa: 'recibida', del_mes: true, recepcion,
            items: [{ clave: 'c72', personalizado: false, descripcion: 'Andamio', unidad: 'UN', pedida: 3, enviada: 3, recibida: null }],
        });
        const m2 = modeloSuperAdmin(datos({ solicitudes: [cero, nulo], diferencias: [], circuito: { ...CIRCUITO, recibida: { total: 2, ultima: null } } }));
        for (const id of [71, 72]) {
            const f = fila(m2, id);
            expect(f.grupo).toBe('completa');
            expect(f.casillas[3].difs).toBeUndefined();
            expect(f.casillas[4]).toMatchObject({ tipo: 'fin', quien: FIN_RECIBIDA });
        }
        expect(m2.grupos.find(g => g.key === 'completa')?.texto).toEqual(TEXTO_SIN_DIFERENCIA);
        expect(m2.eventos.find(e => e.solicitudId === 71 && e.accion === 'recibio')?.pie).toBe('TRF-202610-0071');
        // Con todas verificadas, el rótulo del lienzo.
        expect(modeloSuperAdmin(datos()).grupos.find(g => g.key === 'completa')?.texto).toEqual(['Recibida · llegó completa', 'Recibidas · llegaron completas']);
        expect(fila(modeloSuperAdmin(datos()), 22).casillas[4].quien).toBe(FIN_COMPLETA);
        expect(gruposDe('recibidas', m2.grupos).map(g => g.texto[1])).toEqual(['Recibidas con diferencia', TEXTO_SIN_DIFERENCIA[1]]);
        expect(gruposDe('todas')).toEqual([...GRUPOS]);
    });

    it('no aprobada: quién y cuándo (del rechazo), su motivo y cerrada', () => {
        const f = fila(m, 24);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'fin', 'nada', 'nada']);
        expect(f.casillas[1]).toMatchObject({
            verbo: 'No aprobó', quien: 'Leonardo López', fecha: '10 oct', punto: 'rojo', motivo: 'Ya hay stock en la obra (bodega de faena).',
        });
        expect(f.casillas[2]).toMatchObject({ quien: 'No pasó a bodega', completa: false });
    });

    it('no aprobada que había sido aprobada antes: el paso «Aprobó» registrado, sin fecha (el rechazo la pisa)', () => {
        const r2 = sol({
            id: 73, estado: 'rechazada', etapa: 'rechazada', del_mes: true, aprobacion: { por: LEO, fecha: null },
            rechazo: { por: { id: 11, nombre: 'Ana Pérez' }, fecha: '2026-10-15', motivo: null },
        });
        const f = fila(modeloSuperAdmin(datos({ solicitudes: [r2], diferencias: [] })), 73);
        expect(tipos(f.casillas)).toEqual(['hecho', 'hecho', 'hecho', 'fin', 'nada']);
        expect(f.casillas[1]).toEqual({ tipo: 'hecho', verbo: 'Aprobó', quien: 'Leonardo López', fecha: undefined, extra: 'sin fecha' });
        expect(f.casillas[2]).toMatchObject({ verbo: 'No aprobó', quien: 'Ana Pérez', fecha: '15 oct' });
    });

    it('devolución y traslado: los recibe el destino (no quien pidió), con sus frases', () => {
        const DEV = sol({
            id: 80, tipo_flujo: 'devolucion', tipo: 'herramientas', estado: 'aprobada', etapa: 'aprobada', dias: 3, origen: DOMEYKO, destino: CERRILLOS,
            aprobacion: { por: LEO, fecha: '2026-10-19' }, fecha_solicitud: '2026-10-18',
        });
        const DEV_CAMINO = sol({
            id: 81, tipo_flujo: 'devolucion', tipo: 'herramientas', estado: 'en_transito', etapa: 'despachada', dias: 1, origen: DOMEYKO,
            destino: { ...CERRILLOS, responsable: 'Juan Pérez' }, aprobacion: { por: LEO, fecha: '2026-10-19' },
        });
        const TRAS = sol({
            id: 82, tipo_flujo: 'intra_obra', tipo: 'herramientas', estado: 'en_transito', etapa: 'despachada', dias: 1, origen: DOMEYKO, destino: GORBEA,
            aprobacion: { por: LEO, fecha: '2026-10-19' }, fecha_solicitud: '2026-10-19',
        });
        const m2 = modeloSuperAdmin(datos({ solicitudes: [DEV, DEV_CAMINO, TRAS], diferencias: [] }));
        const dev = fila(m2, 80);
        expect(dev.lugar).toBe('Domeyko → Bodega Cerrillos');
        expect(dev.tipo).toBe('Devolución');
        expect(dev.casillas[2]).toMatchObject({ tipo: 'ahora', verbo: 'sale de la obra', quien: 'Domeyko' });
        expect(dev.casillas[3]).toMatchObject({ tipo: 'falta', verbo: 'Recibir', nota: NOTA_DESTINO });
        expect(fila(m2, 81).casillas[3]).toMatchObject({ tipo: 'ahora', verbo: 'recibir', quien: 'Bodega Cerrillos (Juan Pérez)' });
        expect(fila(m2, 82).casillas[3]).toMatchObject({ tipo: 'ahora', verbo: 'recibir', quien: 'Gorbea 3082' });
        expect(fila(m2, 82).tipo).toBe('Traslado');
        const ev = (id: number, a: string) => m2.eventos.find(e => e.solicitudId === id && e.accion === a);
        expect(ev(80, 'pidio')?.frase).toBe('pidió devolver a Bodega Cerrillos desde Domeyko');
        expect(ev(80, 'aprobo')?.frase).toBe('aprobó la devolución de Domeyko a Bodega Cerrillos');
        expect(ev(82, 'pidio')?.frase).toBe('pidió trasladar herramientas de Domeyko a Gorbea 3082');
        expect(ev(82, 'aprobo')?.frase).toBe('aprobó el traslado de Domeyko a Gorbea 3082');
        // Un pedido normal lo recibe quien pidió.
        expect(quienRecibe(SOLICITUDES[2])).toBe('Tomás Vera');
        expect(vaAUnaObra(DEV)).toBe(false);
        expect(vaAUnaObra(TRAS)).toBe(true);
    });

    it('la que solo vino en «diferencias»: se arma con lo de la diferencia; quién pidió, «sin datos aquí»', () => {
        const f = fila(m, 9);
        expect(f.grupo).toBe('dif');
        expect(f.soloDiferencia).toBe(true);
        expect(f.tipo).toBeNull();
        expect(f.items).toBe('Puntal metálico 3 m');
        expect(f.lugar).toBe('Gorbea 3082');
        expect(tipos(f.casillas)).toEqual(['sin', 'hecho', 'sin', 'hecho', 'ahora']);
        expect(f.casillas[0]).toEqual({ tipo: 'sin', verbo: 'Pidió', nota: 'sin datos aquí' });
        expect(f.casillas[3]).toMatchObject({ verbo: 'Recibió', fecha: '12 ago', punto: 'ambar' });
        expect(f.casillas[3].quien).toBeUndefined();
        expect(f.casillas[4]).toMatchObject({ tono: 'ambar', detalle: '71 días sin resolver' });
        expect(solicitudDesdeDiferencias([DIFERENCIAS[1]])).toMatchObject({ id: 9, estado: 'recibida', solicitante: null, fecha_solicitud: null });
    });

    it('sin aprobadores en la respuesta, el texto no lleva nombre', () => {
        const m2 = modeloSuperAdmin(datos({ aprobadores: [] }));
        expect(fila(m2, 41).casillas[1].quien).toBe(QUIEN_APRUEBA);
    });

    it('ahoraDe / despuesDe', () => {
        expect(ahoraDe([{ tipo: 'hecho', verbo: 'Pidió' }, { tipo: 'ahora', verbo: 'recibir', quien: 'Tomás Vera' }])).toBe('recibir · Tomás Vera');
        expect(ahoraDe([{ tipo: 'fin', verbo: 'Cerrada' }])).toBeNull();
        expect(despuesDe([{ tipo: 'falta', verbo: 'Recibir' }])).toBe('Después: recibir.');
    });
});

// ─────────────────────────────── Lo último que pasó ───────────────────────────────

describe('eventos', () => {
    const m = modeloSuperAdmin(datos());
    const de = (id: number) => m.eventos.filter(e => e.solicitudId === id);

    it('una fila por cosa registrada, lo más nuevo arriba (en el mismo día, lo más avanzado primero)', () => {
        expect(m.eventos.slice(0, 4).map(e => `${e.fecha} ${e.accion} ${e.solicitudId}`)).toEqual([
            '2026-10-21 despacho 33',
            '2026-10-20 aprobo 32',
            '2026-10-19 recibio_parte 34',
            '2026-10-17 aprobo 33',
        ]);
        // Fechas en orden.
        const fechas = m.eventos.map(e => e.fecha);
        expect([...fechas].sort().reverse()).toEqual(fechas);
    });

    it('frases y pies como el lienzo', () => {
        expect(de(41)).toEqual([expect.objectContaining({
            accion: 'pidio', quien: 'Carla Soto', frase: 'pidió materiales para Gorbea 3082', pie: 'TRF-202610-0041 · Cemento ×40 sacos', icono: 'pidio',
        })]);
        expect(de(32).find(e => e.accion === 'aprobo')).toMatchObject({ frase: 'aprobó la solicitud de Gorbea 3082', pie: 'TRF-202610-0032 · sale de Bodega Cerrillos' });
        expect(de(33).find(e => e.accion === 'despacho')).toMatchObject({ frase: 'despachó a Domeyko desde Paraguay', pie: 'TRF-202610-0033', tono: 'azul' });
        expect(de(24).find(e => e.accion === 'rechazo')).toMatchObject({
            fecha: '2026-10-10', frase: 'no aprobó la solicitud de Domeyko', pie: 'TRF-202610-0024 · «Ya hay stock en la obra (bodega de faena).»', tono: 'rojo',
        });
        expect(de(22).find(e => e.accion === 'recibio')).toMatchObject({ frase: 'recibió en Domeyko', pie: 'TRF-202610-0022 · llegó completa' });
        expect(de(21).find(e => e.accion === 'recibio')).toMatchObject({
            frase: 'recibió en Domeyko con diferencia', pie: 'TRF-202610-0021 · Cemento: faltan 2 sacos', tono: 'rojo', icono: 'faltante',
        });
        expect(de(23).find(e => e.accion === 'recibio')).toMatchObject({ pie: 'TRF-202609-0118 · Arena fina: faltó 1 m³ · ya revisada', tono: 'neutro' });
    });

    it('sin despacho registrado no hay fila de despacho; sin nombre, la frase va impersonal', () => {
        expect(de(22).map(e => e.accion)).toEqual(['recibio', 'aprobo', 'pidio']);
        // La 9 solo vino en «diferencias»: sin pidió (no hay fecha) y recibió sin nombre.
        expect(de(9).map(e => e.accion)).toEqual(['recibio', 'aprobo']);
        expect(de(9).find(e => e.accion === 'recibio')).toMatchObject({
            quien: null, frase: 'Se recibió en Gorbea 3082 con diferencia', icono: 'sobrante', tono: 'ambar',
            pie: 'TRF-202608-0009 · Puntal metálico 3 m: llegó 1 unidad de más',
        });
    });

    it('agrupados por día: «Hoy», «Ayer» y el resto con su día', () => {
        expect(rotuloDia('2026-10-22', HOY)).toBe('Hoy · jue 22 oct');
        expect(rotuloDia('2026-10-21', HOY)).toBe('Ayer · mié 21 oct');
        expect(rotuloDia('2026-10-20', HOY)).toBe('mar 20 oct');
        const dias = porDia(m.eventos, HOY);
        expect(dias[0]).toMatchObject({ fecha: '2026-10-21', rotulo: 'Ayer · mié 21 oct' });
        expect(dias.reduce((n, d) => n + d.eventos.length, 0)).toBe(m.eventos.length);
        expect(new Set(dias.map(d => d.fecha)).size).toBe(dias.length);
    });
});

// ─────────────────────────────── Lo del mes y «Quién tiene qué» ───────────────────────────────

describe('conteos del mes', () => {
    const m = modeloSuperAdmin(datos());

    it('aprobó y no aprobó quien aprueba (por id), pidieron y despachos por persona (quien despachó último primero)', () => {
        const c = conteosMes(m.eventos, HOY, [LEO.id]);
        expect(c.mes).toBe('octubre');
        // Aprobó en octubre: 32, 33, 34, 22, 21 (la 23 fue en septiembre; la 9, en agosto).
        expect(c.aprobo).toBe(5);
        expect(c.rechazo).toBe(1);
        expect(c.pidio).toBe(7);
        expect(c.despachos).toEqual([{ nombre: 'Jhoan Vásquez', n: 2 }, { nombre: 'Héctor Gómez', n: 1 }]);
        expect(c.totalDespachos).toBe(3);
    });

    it('lo que aprobó el Super Administrador no se le cuenta a quien aprueba', () => {
        const otra = sol({ id: 60, estado: 'aprobada', etapa: 'aprobada', aprobacion: { por: MARCO, fecha: '2026-10-21' } });
        const m2 = modeloSuperAdmin(datos({ solicitudes: [...SOLICITUDES, otra] }));
        expect(conteosMes(m2.eventos, HOY, [LEO.id]).aprobo).toBe(5);
        // Sin aprobadores: cuenta las de todos.
        expect(conteosMes(m2.eventos, HOY, []).aprobo).toBe(6);
    });

    it('mesDe', () => {
        expect(mesDe('2026-10-22')).toBe('octubre');
        expect(mesDe('')).toBe('');
    });
});

describe('quién tiene qué', () => {
    it('con los nombres de la respuesta y lo que hizo cada uno este mes', () => {
        const [aprueba, bodega, obras, jefatura] = modeloSuperAdmin(datos()).responsables;
        expect(aprueba).toMatchObject({
            nombre: 'Leonardo López', iniciales: 'LL', cifra: 1, linea: 'por aprobar · la más antigua, 9 días',
            nota: 'En octubre aprobó 5 y no aprobó 1.', ir: { filtro: 'aprobar' },
            ademas: { texto: 'Además, 2 diferencias por resolver', ir: { filtro: 'recibidas' } },
        });
        expect(bodega).toMatchObject({
            nombre: 'Bodega', iniciales: null, cifra: 1, linea: 'aún sin salir · la más antigua, aprobada hace 2 días',
            nota: 'En octubre Jhoan despachó 2 y Héctor 1.', ir: { filtro: 'aprobada' },
        });
        expect(obras).toMatchObject({
            cifra: 2, linea: 'por recibir · 1 en camino y 1 aprobada que ya puede recibir', nota: 'En octubre pidieron 7 y recibieron 2.',
            ir: { filtro: 'todas', grupo: 'aprobada' },
        });
        // La respuesta no trae quién tiene `diferencias_ver`: el rótulo, no un nombre fijo.
        expect(jefatura).toMatchObject({
            nombre: JEFATURA, cifra: 2, linea: 'diferencias por investigar · la más antigua, hace 40 días',
            nota: '1 con faltante y 1 con sobrante. Sus WhatsApp no quedan guardados.', ir: { filtro: 'recibidas' },
        });
    });

    it('sin nada pendiente ni despachos; sin aprobadores, sin nombre', () => {
        const vacio: CircuitoPerfil = {
            pedida: { total: 0, dias: null }, aprobada: { total: 0, dias: null }, despachada: { total: 0, dias: null },
            recibida: { total: 0, ultima: null }, diferencias: { total: 0, items: 0, dias: null },
        };
        const conteos = conteosMes([], HOY, []);
        const [aprueba, bodega, obras, jefatura] = responsablesDe({ circuito: vacio, diferencias: [] }, conteos, quienApruebaDe([]));
        expect(aprueba).toMatchObject({ nombre: QUIEN_APRUEBA, iniciales: null, linea: 'nada por aprobar', nota: 'En octubre: 0 aprobadas y 0 no aprobadas.' });
        expect(aprueba.ademas).toBeUndefined();
        expect(bodega).toMatchObject({ linea: 'todo lo aprobado ya salió', nota: 'En octubre no se registró ningún despacho.' });
        expect(obras.linea).toBe('nada por recibir');
        expect(jefatura).toMatchObject({ linea: 'nada por investigar', nota: 'Sus WhatsApp no quedan guardados.' });
    });

    it('dos que aprueban: «Leonardo o Ana», en plural', () => {
        const q = quienApruebaDe([LEO, { id: 12, nombre: 'Ana Pérez' }]);
        expect(q).toMatchObject({ nombre: 'Leonardo o Ana', corto: 'Leonardo o Ana', iniciales: null, cuantos: 2 });
        const [aprueba] = responsablesDe({ circuito: CIRCUITO, diferencias: [] }, conteosMes([], HOY, q.ids), q);
        expect(aprueba.nota).toBe('En octubre aprobaron 0 y no aprobaron 0.');
    });

    it('«Obras» cuenta solo lo que va a una obra: una devolución la recibe la bodega', () => {
        const dev = sol({ id: 90, tipo_flujo: 'devolucion', estado: 'aprobada', etapa: 'aprobada', origen: DOMEYKO, destino: CERRILLOS });
        const devRecibida = sol({ id: 91, tipo_flujo: 'devolucion', estado: 'recibida', etapa: 'recibida', del_mes: true, origen: DOMEYKO, destino: CERRILLOS });
        const c: CircuitoPerfil = { ...CIRCUITO, aprobada: { total: 2, dias: 2 }, recibida: { total: 3, ultima: null } };
        const [, bodega, obras] = responsablesDe({ circuito: c, diferencias: [], solicitudes: [...SOLICITUDES, dev, devRecibida] },
            conteosMes([], HOY, []), quienApruebaDe([LEO]));
        expect(bodega.cifra).toBe(2);
        expect(obras).toMatchObject({ cifra: 2, linea: 'por recibir · 1 en camino y 1 aprobada que ya puede recibir' });
        expect(obras.nota).toBe('En octubre pidieron 0 y recibieron 2.');
    });

    it('las diferencias cuentan solicitudes (como la tarjeta y las otras vistas), no ítems', () => {
        const dos = [
            dif({ id: 5, transferencia_id: 21, descripcion: 'Cemento', diferencia: 2 }),
            dif({ id: 6, transferencia_id: 21, descripcion: 'Fierro 8 mm', diferencia: -1 }),
        ];
        const c: CircuitoPerfil = { ...CIRCUITO, diferencias: { total: 1, items: 2, dias: 14 } };
        const [aprueba, , , jefatura] = responsablesDe({ circuito: c, diferencias: dos }, conteosMes([], HOY, []), quienApruebaDe([LEO]));
        expect(aprueba.ademas?.texto).toBe('Además, 1 diferencia por resolver');
        expect(jefatura).toMatchObject({ cifra: 1, linea: 'diferencia por investigar · la más antigua, hace 14 días' });
        expect(jefatura.nota).toBe('1 con faltante y 1 con sobrante. Sus WhatsApp no quedan guardados.');
        expect(avisoDiferencias(c.diferencias)).toEqual({
            n: 1, titulo: '1 diferencia sin aclarar', bajada: 'Lo que llegó no calza con lo enviado en 2 ítems · la más antigua, hace 14 días',
        });
    });

    it('dos nombres cortos iguales: van completos («Juan Pérez o Juan Soto», no «Juan o Juan»)', () => {
        expect(nombresCortos(['Juan Pérez', 'Juan Soto', 'Ana Rojas'])).toEqual(['Juan Pérez', 'Juan Soto', 'Ana']);
        const ev = (id: number, quien: string): Evento => ({
            clave: `${id}`, fecha: '2026-10-10', accion: 'despacho', solicitudId: id, porId: id, quien, frase: '', pie: '', tono: 'azul', icono: 'despacho',
        });
        const c = conteosMes([ev(1, 'Juan Pérez'), ev(2, 'Juan Soto'), ev(3, 'Juan Soto')], HOY);
        const [, bodega] = responsablesDe({ circuito: CIRCUITO, diferencias: [] }, c, quienApruebaDe([LEO]));
        expect(bodega.nota).toBe('En octubre Juan Soto despachó 2 y Juan Pérez 1.');
        expect(quienApruebaDe([LEO, { id: 13, nombre: 'Leonardo Soto' }]).corto).toBe('Leonardo López o Leonardo Soto');
    });

    it('la etiqueta de la caja lleva lo que se ve (también la línea del mes)', () => {
        const [aprueba] = modeloSuperAdmin(datos()).responsables;
        expect(etiquetaResponsable(aprueba)).toBe('Leonardo López: 1, por aprobar · la más antigua, 9 días. En octubre aprobó 5 y no aprobó 1. Ver en la secuencia');
    });

    it('muchos despachadores: solo el total', () => {
        const ev = (id: number, quien: string): Evento => ({
            clave: `${id}`, fecha: '2026-10-10', accion: 'despacho', solicitudId: id, porId: id, quien, frase: '', pie: '', tono: 'azul', icono: 'despacho',
        });
        const c = conteosMes([ev(1, 'A Uno'), ev(2, 'B Dos'), ev(3, 'C Tres'), ev(4, 'D Cuatro')], HOY);
        const [, bodega] = responsablesDe({ circuito: CIRCUITO, diferencias: [] }, c, quienApruebaDe([LEO]));
        expect(bodega.nota).toBe('En octubre se registraron 4 despachos.');
    });
});

// ─────────────────────────────── Circuito ───────────────────────────────

describe('circuito de todas las obras', () => {
    it('las cifras exactas; «Despachada» se mantiene y con 0 dice «sin despacho»', () => {
        const c: CircuitoPerfil = { ...CIRCUITO, despachada: { total: 0, dias: null } };
        const [pedida, aprobada, despachada, recibida] = circuitoSuperAdmin(c, HOY, { corto: 'Leonardo' }, 1);
        expect(pedida).toMatchObject({
            total: 1, hasta: 9, tono: 'ambar', resaltar: true, bajada: `espera a Leonardo${NB}↓`, bajadaCorta: `a Leonardo${NB}↓`, ir: { filtro: 'aprobar' },
        });
        expect(aprobada).toMatchObject({ total: 1, bajada: `por recibir${NB}↓`, bajadaCorta: `por recibir${NB}↓` });
        expect(despachada).toMatchObject({ key: 'despachada', texto: 'Despachada', total: 0, hasta: null, resaltar: false, tono: 'neutro', bajada: 'sin despacho' });
        expect(recibida).toMatchObject({ total: 2, resaltar: false, bajada: `en octubre${NB}↓`, bajadaCorta: `en oct.${NB}↓`, nota: 'y 1 de antes', ir: { filtro: 'recibidas' } });
        // La etiqueta lleva todo lo que se ve (también «hasta 9 días»).
        expect(etiquetaPaso(pedida)).toBe('Pedida: 1, espera a Leonardo, hasta 9 días');
        expect(etiquetaPaso(despachada)).toBe('Despachada: 0, sin despacho');
        expect(etiquetaPaso(recibida)).toBe('Recibida: 2, en octubre, y 1 de antes');
    });

    it('sin nadie que apruebe ni pendientes', () => {
        const c: CircuitoPerfil = { ...CIRCUITO, pedida: { total: 2, dias: 0 }, aprobada: { total: 0, dias: null } };
        const [pedida, aprobada] = circuitoSuperAdmin(c, HOY, { corto: null });
        expect(pedida).toMatchObject({ bajada: `por aprobar${NB}↓`, hasta: 0 });
        expect(aprobada).toMatchObject({ resaltar: false, bajada: 'nada por recibir' });
        expect(textoHasta(0)).toBe('de hoy');
        expect(textoHasta(9)).toBe('hasta 9 días');
    });

    it('el modelo cuenta en «Recibida» las de meses anteriores que muestra la pestaña «Recibidas»', () => {
        // La 23 (septiembre) y la 9 (agosto, solo vino en «diferencias»): las dos salen en la pestaña.
        expect(modeloSuperAdmin(datos()).circuito[3].nota).toBe('y 2 de antes');
    });

    it('las diferencias, aparte (cuenta solicitudes)', () => {
        expect(avisoDiferencias(CIRCUITO.diferencias)).toEqual({
            n: 2, titulo: '2 diferencias sin aclarar', bajada: 'Lo que llegó no calza con lo enviado · la más antigua, hace 40 días',
        });
        expect(avisoDiferencias({ total: 2, items: 3, dias: 5 })?.bajada).toBe('Lo que llegó no calza con lo enviado en 3 ítems · la más antigua, hace 5 días');
        expect(avisoDiferencias({ total: 1, items: 1, dias: 0 })?.titulo).toBe('1 diferencia sin aclarar');
        expect(avisoDiferencias({ total: 0, items: 0, dias: null })).toBeNull();
    });
});

describe('topes de la respuesta', () => {
    it('sin ninguna lista cortada, nada; si el circuito cuenta más que la lista, el aviso lleva a Inventario', () => {
        expect(modeloSuperAdmin(datos()).tope).toBeNull();
        const cortada = modeloSuperAdmin(datos({ circuito: { ...CIRCUITO, pedida: { total: 250, dias: 40 } } }));
        expect(cortada.tope).toEqual({ texto: 'La lista llegó a su tope: lo que no está aquí, en Inventario', ruta: '/inventario?tab=transferencias&estado=todas' });
    });

    it('el tope es por etapa: 90 pendientes y 120 aprobadas (210 en curso) con tope 200 no están cortadas', () => {
        const muchas = [
            ...Array.from({ length: 90 }, (_, i) => sol({ id: 1000 + i })),
            ...Array.from({ length: 120 }, (_, i) => sol({ id: 2000 + i, estado: 'aprobada', etapa: 'aprobada', origen: CERRILLOS })),
        ];
        const base = {
            solicitudes: muchas, diferencias: [],
            circuito: { ...CIRCUITO, pedida: { total: 90, dias: 9 }, aprobada: { total: 120, dias: 30 }, despachada: { total: 0, dias: null },
                recibida: { total: 0, ultima: null }, diferencias: { total: 0, items: 0, dias: null } },
            limites: { en_curso: 200, recibidas: 100, recibidas_recientes: 10, rechazadas: 50, diferencias: 100, aprobadores: 10 },
        };
        expect(listaCortada(base)).toBe(false);
        expect(listaCortada({ ...base, circuito: { ...base.circuito, aprobada: { total: 230, dias: 30 } } })).toBe(true);
        // Diferencias: el circuito cuenta más ítems que la lista.
        expect(listaCortada({ ...base, circuito: { ...base.circuito, diferencias: { total: 1, items: 1, dias: 2 } } })).toBe(true);
        // Rechazadas del mes (sin cifra exacta): llegar a su tope cuenta como corte.
        const rechazadas = Array.from({ length: 50 }, (_, i) => sol({ id: 3000 + i, estado: 'rechazada', etapa: 'rechazada', del_mes: true }));
        expect(listaCortada({ ...base, solicitudes: [...muchas, ...rechazadas] })).toBe(true);
    });

    it('«Ver los N» dice lo que se dibuja abierto (a lo más 150)', () => {
        expect(textoVerUltimo(42)).toBe('Ver los 42');
        expect(textoVerUltimo(600)).toBe('Ver los 150');
    });

    it('con una obra elegida arriba, la nota de que este detalle no se filtra', () => {
        expect(notaObraElegida('Domeyko')).toBe('Aquí van todas las obras: el selector de obra de arriba no filtra este detalle.');
        expect(notaObraElegida(null)).toBeNull();
        expect(notaObraElegida('  ')).toBeNull();
    });

    it('respuesta vacía: todo en cero, sin filas ni eventos', () => {
        const vacio = modeloSuperAdmin(datos({ solicitudes: [], diferencias: [], aprobadores: [] }));
        expect(vacio.filtros[0].n).toBe(0);
        expect(vacio.eventos).toEqual([]);
        expect(vacio.responsables[0].nombre).toBe(QUIEN_APRUEBA);
    });
});

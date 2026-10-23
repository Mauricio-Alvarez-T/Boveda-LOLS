import {
    MAX_LINEAS_APURAR, TOPE_INICIO, alcanceJefatura, anchoFila, bajadaAprobada, bajadaAprobadas, bajadaDespachada, bajadaDespachadas,
    bajadaDiferencias, bajadaPedida, bajadaPedidas, bajadaRecibida, bajadaRecibidas, cargoDe, cifraDias, cifraDiferencia, cuantasPorApurar,
    diferenciasPendientes, disposicionDiferencia, etapasJefatura, etiquetaEtapa, fraseFila, fueraDeLista, haceCuanto, laApruebaSoloSuperAdmin,
    listasJefatura, mensajeApurar, mensajeDiferencia, mesDe, notaObraElegida, notaSoloSuperAdmin, personasDiferencia, pildoraRecibida,
    pildorasParcial, pildorasTipo, queDiferencia, rellenaEtapa, rutaDe, solicitudesConDiferencia, textoApurar, textoEnInventario, textosTope,
    textoVerLista, textoVerResumen, tituloAprobadas, tituloDespachadas, tituloDiferencias, tituloFila, tituloPedidas, tituloRecibidas,
    tonoCirculo,
} from './jefatura.modelo';
import type { CircuitoPerfil, DiferenciaPerfil, ItemPerfil, LugarPerfil, SolicitudPerfil } from './tipos';

// ─── Ayudas ───

const obra = (nombre: string, id = 1): LugarPerfil => ({ tipo: 'obra', id, nombre, responsable: null });
const bodega = (nombre: string, id = 1): LugarPerfil => ({ tipo: 'bodega', id, nombre, responsable: 'Juan Pérez' });
const yo = (id: number, nombre: string) => ({ id, nombre });
const item = (descripcion: string, unidad: string | null, pedida: number, enviada: number | null = null, recibida: number | null = null): ItemPerfil =>
    ({ clave: descripcion, personalizado: false, descripcion, unidad, pedida, enviada, recibida });

function sol(over: Partial<SolicitudPerfil> & Pick<SolicitudPerfil, 'id' | 'estado' | 'etapa'>): SolicitudPerfil {
    return {
        codigo: `TRF-202610-00${over.id}`, tipo_flujo: 'solicitud', tipo: 'materiales',
        origen: null, destino: obra('Domeyko'), solicitante: { id: 20, nombre: 'Tomás Vera', rol: 'Jefe de Obra' }, propia: false,
        fecha_solicitud: '2026-10-16', aprobacion: null, despacho: null, recepcion: null, ultima_recepcion: null, rechazo: null,
        dias: 0, del_mes: false, puede_aprobar: null, bloqueo_aprobar: null, items: [], ...over,
    };
}

function dif(over: Partial<DiferenciaPerfil> = {}): DiferenciaPerfil {
    return {
        id: 2, transferencia_id: 21, codigo: 'TRF-202610-0021', descripcion: 'Cemento', unidad: 'SACO',
        enviada: 50, recibida: 48, diferencia: 2, faltan: 2, sobran: 0,
        origen: bodega('Bodega Cerrillos'), destino: obra('Domeyko'),
        aprobacion: { por: yo(10, 'Leonardo López'), fecha: '2026-10-06' },
        despacho: { por: yo(30, 'Jhoan Vásquez'), fecha: '2026-10-07' },
        recepcion: { por: yo(20, 'Tomás Vera'), fecha: '2026-10-08' },
        dias: 14, ...over,
    };
}

const CIRCUITO: CircuitoPerfil = {
    pedida: { total: 6, dias: 9 },
    aprobada: { total: 2, dias: 4 },
    despachada: { total: 2, dias: 2 },
    recibida: { total: 5, ultima: '2026-10-20' },
    diferencias: { total: 3, dias: 14, items: 4 },
};
const VACIO: CircuitoPerfil = {
    pedida: { total: 0, dias: null }, aprobada: { total: 0, dias: null }, despachada: { total: 0, dias: null },
    recibida: { total: 0, ultima: '2026-09-27' }, diferencias: { total: 0, dias: null, items: 0 },
};
const LEONARDO = [yo(10, 'Leonardo López')];

// ─── El circuito ───

describe('etapasJefatura: las cinco etapas del lienzo B con las cifras exactas del circuito', () => {
    test('con datos: cifras, textos, datos, tonos y marcas («Apurar», «Aclarar») como el lienzo', () => {
        const [p, a, c, r, d] = etapasJefatura(CIRCUITO);
        expect(p).toEqual({
            clave: 'pedida', numero: 1, cifra: 6, que: 'esperan aprobación', dato: 'la más antigua: 9 días',
            tonoDato: 'ambar', tono: 'ambar', marca: { texto: 'Apurar', tono: 'ambar' },
        });
        expect(a).toMatchObject({ numero: 2, cifra: 2, que: 'por recibir', dato: 'la más antigua: 4 días', tono: 'neutro' });
        expect(a.marca).toBeUndefined();
        expect(c).toMatchObject({ numero: 3, cifra: 2, que: 'van en camino', dato: 'la más antigua: 2 días', tono: 'azul' });
        expect(r).toMatchObject({ numero: 4, cifra: 5, que: 'llegaron este mes', dato: 'la última: 20 oct', tono: 'neutro' });
        // Diferencias cuenta SOLICITUDES (3, como la tarjeta del Inicio y la pestaña), no los 4 ítems de su lista.
        expect(d).toEqual({
            clave: 'diferencias', numero: null, cifra: 3, que: 'llegaron distinto a lo enviado', dato: 'la más antigua: hace 14 días',
            tonoDato: 'rojo', tono: 'rojo', marca: { texto: 'Aclarar', tono: 'rojo' },
        });
    });

    test('vacío: todo neutro, sin marcas, «nada aquí» / «nada este mes» / «ninguna»', () => {
        const etapas = etapasJefatura(VACIO);
        expect(etapas.map(e => e.dato)).toEqual(['nada aquí', 'nada aquí', 'nada aquí', 'nada este mes', 'ninguna']);
        expect(etapas.every(e => e.tono === 'neutro' && e.tonoDato === 'neutro' && !e.marca)).toBe(true);
        expect(etapas.map(e => e.cifra)).toEqual([0, 0, 0, 0, 0]);
    });

    test('singular y «de hoy»; el dato de Pedida toma el color de los días (gris hasta 7, rojo más de 30)', () => {
        const uno: CircuitoPerfil = {
            pedida: { total: 1, dias: 0 }, aprobada: { total: 1, dias: 1 }, despachada: { total: 1, dias: 0 },
            recibida: { total: 1, ultima: '2026-10-22' }, diferencias: { total: 1, dias: 0, items: 1 },
        };
        const [p, a, c, r, d] = etapasJefatura(uno);
        expect([p.que, a.que, c.que, r.que, d.que]).toEqual([
            'espera aprobación', 'por recibir', 'va en camino', 'llegó este mes', 'llegó distinto a lo enviado',
        ]);
        expect(p.dato).toBe('la más antigua: de hoy');
        expect(a.dato).toBe('la más antigua: 1 día');
        expect(d.dato).toBe('la más antigua: de hoy');
        expect(p.tonoDato).toBe('neutro');
        expect(etapasJefatura({ ...uno, pedida: { total: 3, dias: 31 } })[0].tonoDato).toBe('rojo');
    });

    test('etiquetaEtapa: lo que oye el lector de pantalla', () => {
        const [p, , , , d] = etapasJefatura(CIRCUITO);
        expect(etiquetaEtapa(p)).toBe('Paso 1, Pedida: 6 esperan aprobación. la más antigua: 9 días. Apurar');
        expect(etiquetaEtapa(d)).toBe('Diferencias: 3 llegaron distinto a lo enviado. la más antigua: hace 14 días. Aclarar');
    });

    test('con 150 ítems en 34 solicitudes, la cifra es 34 (lo que lista Inventario → Diferencias)', () => {
        const d = etapasJefatura({ ...CIRCUITO, diferencias: { total: 34, dias: 20, items: 150 } })[4];
        expect(d.cifra).toBe(34);
    });

    test('rellenaEtapa: la abierta se pinta solo si tiene algo (con 0, solo el anillo)', () => {
        const [p] = etapasJefatura(CIRCUITO);
        const [p0] = etapasJefatura(VACIO);
        expect(rellenaEtapa(p, true)).toBe(true);
        expect(rellenaEtapa(p, false)).toBe(false);
        expect(rellenaEtapa(p0, true)).toBe(false);
    });

    test('alcanceJefatura: del alcance real de la respuesta, no fijo', () => {
        expect(alcanceJefatura({ todas: true, bodega_id: null })).toBe('todas las obras');
        expect(alcanceJefatura({ todas: false, bodega_id: 3 })).toBe('tus solicitudes y tu bodega');
        expect(alcanceJefatura({ todas: false, bodega_id: null })).toBe('tus solicitudes');
        expect(alcanceJefatura(null)).toBe('todas las obras');
        expect(notaObraElegida('todas las obras')).toBe('Aquí van todas las obras: el selector de obra de arriba no filtra este detalle.');
    });
});

// ─── Listas ───

describe('listasJefatura: cada etapa con su orden', () => {
    const lista: SolicitudPerfil[] = [
        sol({ id: 1, estado: 'pendiente', etapa: 'pedida', dias: 2 }),
        sol({ id: 2, estado: 'pendiente', etapa: 'pedida', dias: 9 }),
        sol({ id: 3, estado: 'aprobada', etapa: 'aprobada', dias: 1 }),
        sol({ id: 4, estado: 'aprobada', etapa: 'aprobada', dias: 4 }),
        sol({ id: 5, estado: 'en_transito', etapa: 'despachada', dias: 1 }),
        sol({ id: 6, estado: 'recepcion_parcial', etapa: 'despachada', dias: 3 }),
        sol({ id: 7, estado: 'recibida', etapa: 'recibida', del_mes: true, recepcion: { por: null, fecha: '2026-10-08' } }),
        sol({ id: 8, estado: 'recibida', etapa: 'recibida', del_mes: true, recepcion: { por: null, fecha: '2026-10-20' } }),
        sol({ id: 9, estado: 'recibida', etapa: 'recibida', del_mes: false, recepcion: { por: null, fecha: '2026-09-27' } }),
        sol({ id: 10, estado: 'rechazada', etapa: 'rechazada', del_mes: true }),
    ];
    const difs = [dif({ id: 1, dias: 2 }), dif({ id: 2, dias: 14 }), dif({ id: 3, dias: 6 })];

    test('en curso: las que llevan más días primero; recibidas: solo las del mes, la más nueva primero; sin rechazadas', () => {
        const l = listasJefatura({ solicitudes: lista, diferencias: difs });
        expect(l.pedidas.map(s => s.id)).toEqual([2, 1]);
        expect(l.aprobadas.map(s => s.id)).toEqual([4, 3]);
        expect(l.despachadas.map(s => s.id)).toEqual([6, 5]);
        expect(l.recibidas.map(s => s.id)).toEqual([8, 7]);
        expect(l.diferencias?.map(d => d.id)).toEqual([2, 3, 1]);
    });

    test('no cambia la respuesta; sin permiso de diferencias viene null', () => {
        const copia = JSON.stringify(lista);
        const l = listasJefatura({ solicitudes: lista, diferencias: null });
        expect(JSON.stringify(lista)).toBe(copia);
        expect(l.diferencias).toBeNull();
    });

    test('fueraDeLista: cuántas quedan para ver en Inventario (lista con tope)', () => {
        expect(fueraDeLista(240, 200)).toBe(40);
        expect(fueraDeLista(6, 6)).toBe(0);
        expect(fueraDeLista(3, 5)).toBe(0);
    });

    test('solicitudesConDiferencia: la lista es por ítem; cuenta solicitudes distintas', () => {
        expect(solicitudesConDiferencia([dif({ id: 1, transferencia_id: 21 }), dif({ id: 2, transferencia_id: 21 }), dif({ id: 3, transferencia_id: 25 })])).toBe(2);
        expect(solicitudesConDiferencia(null)).toBe(0);
    });
});

// ─── Tope del Inicio ───

describe('tope del Inicio: unas pocas a la vista, «Ver las N» y el resto en Inventario', () => {
    test('8 solicitudes y 5 diferencias', () => {
        expect(TOPE_INICIO).toEqual({ solicitudes: 8, diferencias: 5 });
    });

    test('textosTope: lista completa', () => {
        expect(textosTope({ vistas: 8, enLista: 12, total: 12, abierto: false })).toEqual({ cuantas: 'Se ven 8 de 12', boton: 'Ver las 12' });
        expect(textosTope({ vistas: 12, enLista: 12, total: 12, abierto: true })).toEqual({ cuantas: 'Se ven las 12', boton: 'Ocultar' });
    });

    test('textosTope: lista cortada por el servidor (200 de 240): el botón no promete las 240', () => {
        expect(textosTope({ vistas: 8, enLista: 200, total: 240, abierto: false })).toEqual({ cuantas: 'Se ven 8 de 240', boton: 'Ver 200 de 240' });
        expect(textosTope({ vistas: 200, enLista: 200, total: 240, abierto: true })).toEqual({ cuantas: 'Se ven 200 de 240', boton: 'Ocultar' });
    });

    test('textosTope: diferencias que no son una por solicitud se cuentan en ítems', () => {
        expect(textosTope({ vistas: 5, enLista: 7, total: 7, abierto: false, items: true })).toEqual({ cuantas: 'Se ven 5 de 7 ítems', boton: 'Ver los 7 ítems' });
        expect(textosTope({ vistas: 7, enLista: 7, total: 7, abierto: true, items: true })).toEqual({ cuantas: 'Se ven los 7 ítems', boton: 'Ocultar' });
    });

    test('textoVerResumen: «Ver las 6»; con más de las que se abren, «Ver las más antiguas»', () => {
        expect(textoVerResumen(6)).toBe('Ver las 6');
        expect(textoVerResumen(1)).toBe('Ver la solicitud');
        expect(textoVerResumen(8)).toBe('Ver las 8');
        expect(textoVerResumen(240)).toBe('Ver las más antiguas');
    });

    test('textoEnInventario: con cifra solo si el filtro de llegada muestra esas', () => {
        expect(textoEnInventario('pedida', 240)).toBe('Ver las 240 en Inventario');
        expect(textoEnInventario('diferencias', 34)).toBe('Ver las 34 en Inventario');
        // Despachada abre «todas» (Inventario no tiene filtro de en camino): sin cifra.
        expect(textoEnInventario('despachada', 12)).toBe('Ver en Inventario');
        expect(textoEnInventario('diferencias', 1)).toBe('Ver en Inventario');
    });
});

// ─── Textos de paneles ───

describe('textos de los paneles', () => {
    test('Pedida: título con quien aprueba, bajada larga o resumida', () => {
        expect(tituloPedidas(6, 'Leonardo')).toBe('6 solicitudes esperan a Leonardo');
        expect(tituloPedidas(1, 'Leonardo')).toBe('1 solicitud espera a Leonardo');
        expect(tituloPedidas(3, null)).toBe('3 solicitudes esperan aprobación');
        expect(tituloPedidas(0, 'Leonardo')).toBe('Nada espera aprobación');

        const carla = sol({ id: 41, estado: 'pendiente', etapa: 'pedida', dias: 9, destino: obra('Gorbea 3082'),
            solicitante: { id: 21, nombre: 'Carla Soto', rol: 'Prevencionista' } });
        const otra = sol({ id: 42, estado: 'pendiente', etapa: 'pedida', dias: 6 });
        expect(bajadaPedidas([carla, otra], { resumen: false, aprobadores: LEONARDO }))
            .toBe('La más antigua lleva 9 días. Mándale la lista para que las apruebe o rechace.');
        expect(bajadaPedidas([carla, otra], { resumen: true, aprobadores: LEONARDO }))
            .toBe('La más antigua lleva 9 días: Carla Soto, Gorbea 3082.');
        expect(bajadaPedidas([{ ...carla, dias: 0 }], { resumen: false, aprobadores: [] }))
            .toBe('La más antigua es de hoy. Manda la lista para que la aprueben o rechacen.');
        expect(bajadaPedidas([carla], { resumen: false, aprobadores: [...LEONARDO, yo(12, 'Ana Rojas')] }))
            .toBe('La más antigua lleva 9 días. Mándales la lista para que la aprueben o rechacen.');
        expect(bajadaPedidas([], { resumen: false })).toBe('Cuando alguien pida materiales, aparece aquí.');
    });

    test('botones: «Apurar a Leonardo» y «Ver las 6»', () => {
        expect(textoApurar('Leonardo')).toBe('Apurar a Leonardo');
        expect(textoApurar('Leonardo o Ana')).toBe('Apurar a Leonardo o Ana');
        expect(textoApurar(null)).toBe('Apurar por WhatsApp');
        expect(textoVerLista(6)).toBe('Ver las 6');
        expect(textoVerLista(1)).toBe('Ver la solicitud');
    });

    test('Aprobada: nombra a quien aprobó solo si es uno', () => {
        expect(tituloAprobadas(2)).toBe('2 aprobadas por recibir');
        expect(tituloAprobadas(1)).toBe('1 aprobada por recibir');
        const de = (id: number, nombre: string | null) => sol({ id, estado: 'aprobada', etapa: 'aprobada',
            aprobacion: { por: nombre ? yo(10, nombre) : null, fecha: '2026-10-18' } });
        expect(bajadaAprobadas([de(1, 'Leonardo López'), de(2, 'Leonardo López')])).toBe('Leonardo ya las aprobó; falta que salgan de bodega.');
        expect(bajadaAprobadas([de(1, 'Leonardo López')])).toBe('Leonardo ya la aprobó; falta que salga de bodega.');
        expect(bajadaAprobadas([de(1, 'Leonardo López'), de(2, 'Marco Uribe')])).toBe('Ya están aprobadas; falta que salgan de bodega.');
        expect(bajadaAprobadas([de(1, null)])).toBe('Ya está aprobada; falta que salga de bodega.');
        expect(bajadaAprobadas([])).toBe('Lo aprobado espera aquí hasta que salga de bodega.');
    });

    test('Despachada, Recibida y Diferencias', () => {
        expect(tituloDespachadas(2)).toBe('2 van en camino');
        expect(tituloDespachadas(1)).toBe('1 va en camino');
        expect(tituloRecibidas(5)).toBe('5 llegaron este mes');
        expect(tituloRecibidas(1)).toBe('1 llegó este mes');
        expect(bajadaRecibidas('2026-10-22')).toBe('Recibidas en octubre. Si algo llegó distinto, también está en «Diferencias».');
        expect(tituloDiferencias(4)).toBe('4 diferencias por aclarar');
        expect(tituloDiferencias(1)).toBe('1 diferencia por aclarar');
        expect(bajadaDespachadas(2)).toBe('Ya salieron de bodega; falta que la obra confirme lo que llegó.');
        expect(bajadaDiferencias(4)).toBe('Lo que llegó no calza con lo enviado. Pregúntale por WhatsApp a quien despachó o recibió: el mensaje va listo.');
        expect(bajadaDiferencias(4, 4)).toBe(bajadaDiferencias(4));
        // Varios ítems en una misma solicitud: se dice, porque la lista va ítem por ítem.
        expect(bajadaDiferencias(3, 4)).toMatch(/^4 ítems en 3 solicitudes\. Lo que llegó no calza/);
        expect(bajadaDiferencias(1, 3)).toMatch(/^3 ítems en 1 solicitud\. /);
        expect(bajadaDiferencias(0)).toMatch(/^Cuando algo llegue distinto/);
        expect(bajadaDespachadas(0)).toMatch(/^Lo que sale de bodega/);
        // Vacíos: una frase, no «0 …».
        expect([tituloAprobadas(0), tituloDespachadas(0), tituloRecibidas(0), tituloDiferencias(0)])
            .toEqual(['Nada por recibir', 'Nada va en camino', 'Nada llegó este mes', 'Ninguna diferencia por aclarar']);
        expect(mesDe('2026-01-05')).toBe('enero');
        expect(mesDe('')).toBe('este mes');
    });
});

// ─── Filas ───

describe('filas de solicitudes', () => {
    test('cargoDe: el rol como el lienzo («Jefe de obra»); las siglas quedan', () => {
        expect(cargoDe('Jefe de Obra')).toBe('Jefe de obra');
        expect(cargoDe('Prevencionista')).toBe('Prevencionista');
        expect(cargoDe('Encargado RRHH')).toBe('Encargado RRHH');
        expect(cargoDe('  ')).toBeNull();
        expect(cargoDe(null)).toBeNull();
    });

    test('título y bajada de una pedida: quién, para dónde, cargo, fecha y código', () => {
        const s = sol({ id: 41, estado: 'pendiente', etapa: 'pedida', destino: obra('Gorbea 3082'), fecha_solicitud: '2026-10-13',
            solicitante: { id: 21, nombre: 'Carla Soto', rol: 'Prevencionista' } });
        expect(tituloFila(s)).toBe('Carla Soto · Gorbea 3082');
        expect(bajadaPedida(s)).toBe('Prevencionista · pidió el 13 oct · TRF-202610-0041');
        const sinNada = sol({ id: 50, estado: 'pendiente', etapa: 'pedida', destino: null, solicitante: null, fecha_solicitud: null });
        expect(tituloFila(sinNada)).toBe('TRF-202610-0050');
        expect(bajadaPedida(sinNada)).toBe('TRF-202610-0050');
    });

    test('aprobada, despachada y recibida dicen solo lo registrado', () => {
        const aprobada = sol({ id: 31, estado: 'aprobada', etapa: 'aprobada', origen: bodega('Bodega Cerrillos'),
            aprobacion: { por: yo(10, 'Leonardo López'), fecha: '2026-10-18' } });
        expect(bajadaAprobada(aprobada)).toBe('Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos');

        const enCamino = sol({ id: 33, estado: 'en_transito', etapa: 'despachada', origen: bodega('Paraguay', 2),
            aprobacion: { por: yo(10, 'Leonardo López'), fecha: '2026-10-17' }, despacho: { por: yo(30, 'Jhoan Vásquez'), fecha: '2026-10-21' } });
        expect(bajadaDespachada(enCamino)).toBe('Despachó Jhoan Vásquez el 21 oct · desde Paraguay');
        // Sin «Despachar» registrado: lo que sí se guardó, quién aprobó.
        expect(bajadaDespachada({ ...enCamino, despacho: null })).toBe('Aprobó Leonardo el 17 oct · desde Paraguay');
        expect(bajadaDespachada({ ...enCamino, despacho: null, aprobacion: null, origen: null })).toBe('TRF-202610-0033');

        const recibida = sol({ id: 25, estado: 'recibida', etapa: 'recibida', origen: bodega('Bodega Cerrillos'),
            recepcion: { por: yo(21, 'Carla Soto'), fecha: '2026-10-10' } });
        expect(bajadaRecibida(recibida)).toBe('Recibió Carla Soto el 10 oct · desde Bodega Cerrillos');
        expect(bajadaRecibida({ ...recibida, recepcion: { por: null, fecha: '2026-10-10' } })).toBe('Recibida el 10 oct · desde Bodega Cerrillos');
    });

    test('fraseFila: lo pedido con su cantidad («Cemento (40 sacos) y Arena gruesa (3 m³).»)', () => {
        expect(fraseFila({ items: [item('Cemento', 'SACO', 40), item('Arena gruesa', 'M3', 3)] }))
            .toBe('Cemento (40 sacos) y Arena gruesa (3 m³).');
        expect(fraseFila({ items: [item('Arnés', 'UN', 6), item('Casco', 'UN', 10), item('Señalética', 'UN', 4)] }))
            .toBe('Arnés (6 un.), Casco (10 un.) y 1 ítem más.');
        expect(fraseFila({ items: [] })).toBeUndefined();
    });

    test('cifra de días, círculo y píldoras', () => {
        expect(cifraDias(9, 'esperando', 'ambar', 'pedida')).toEqual({ valor: '9', etiqueta: 'días esperando', tono: 'ambar' });
        expect(cifraDias(1, 'esperando', 'neutro', 'pedida')).toEqual({ valor: '1', etiqueta: 'día esperando', tono: 'neutro' });
        expect(cifraDias(0, 'en camino', 'azul', 'salió')).toEqual({ valor: 'Hoy', etiqueta: 'salió', tono: 'neutro' });
        expect(tonoCirculo({ dias: 31 })).toBe('rojo');
        expect(tonoCirculo({ dias: 30 })).toBe('neutro');
        expect(pildorasTipo({ tipo: 'herramientas' })).toEqual([{ texto: 'Herramientas', tono: 'neutro' }]);
        expect(pildorasTipo({ tipo: 'materiales' })).toEqual([]);
        expect(pildorasParcial({ estado: 'recepcion_parcial' })).toEqual([{ texto: 'Llegó una parte', tono: 'azul' }]);
        expect(pildorasParcial({ estado: 'en_transito' })).toEqual([]);
    });

    test('pildoraRecibida: cómo llegó (o nada si no hay con qué comparar)', () => {
        expect(pildoraRecibida({ id: 1, items: [item('Andamio', 'UN', 8, 8, 8)] })).toEqual({ texto: 'Llegó completa', tono: 'verde' });
        expect(pildoraRecibida({ id: 1, items: [item('Cemento', 'SACO', 50, 50, 48), item('Fierro', 'BARRA', 40, 40, 40)] }))
            .toEqual({ texto: 'Faltaron 2 sacos', tono: 'rojo' });
        expect(pildoraRecibida({ id: 1, items: [item('Puntal', 'UN', 20, 20, 21)] })).toEqual({ texto: 'Llegó 1 unidad de más', tono: 'rojo' });
        expect(pildoraRecibida({ id: 1, items: [item('A', 'UN', 2, 2, 1), item('B', 'UN', 2, 2, 3)] })).toEqual({ texto: '2 ítems llegaron distinto', tono: 'rojo' });
        expect(pildoraRecibida({ id: 1, items: [item('Sin registro', 'UN', 2, null, null)] })).toBeNull();
        expect(pildoraRecibida({ id: 1, items: [] })).toBeNull();
    });

    test('pildoraRecibida: rojo solo si la diferencia sigue pendiente; ya aclarada, neutra «Llegó distinto»', () => {
        const faltaron = { id: 21, items: [item('Cemento', 'SACO', 50, 50, 48)] };
        const pendientes = diferenciasPendientes({ diferencias: [dif({ transferencia_id: 21 })], circuito: { diferencias: { items: 1 } } });
        expect(pendientes?.completa).toBe(true);
        expect(pildoraRecibida(faltaron, pendientes)).toEqual({ texto: 'Faltaron 2 sacos', tono: 'rojo' });
        expect(pildoraRecibida({ ...faltaron, id: 99 }, pendientes)).toEqual({ texto: 'Llegó distinto', tono: 'neutro' });
        // La lista vino cortada (100 de 150): que no esté no quiere decir que se aclaró, queda roja.
        const cortada = diferenciasPendientes({ diferencias: [dif({ transferencia_id: 21 })], circuito: { diferencias: { items: 150 } } });
        expect(cortada?.completa).toBe(false);
        expect(pildoraRecibida({ ...faltaron, id: 99 }, cortada)).toEqual({ texto: 'Faltaron 2 sacos', tono: 'rojo' });
        // Sin la lista (sin permiso), como antes.
        expect(diferenciasPendientes({ diferencias: null, circuito: { diferencias: { items: 3 } } })).toBeNull();
        expect(pildoraRecibida({ ...faltaron, id: 99 }, null)).toEqual({ texto: 'Faltaron 2 sacos', tono: 'rojo' });
        // «Llegó completa» no depende de las pendientes.
        expect(pildoraRecibida({ id: 99, items: [item('Andamio', 'UN', 8, 8, 8)] }, pendientes)).toEqual({ texto: 'Llegó completa', tono: 'verde' });
    });
});

describe('filas de diferencias', () => {
    test('cifra, ruta, frase y días', () => {
        expect(cifraDiferencia({ diferencia: 2 })).toEqual({ valor: '2', etiqueta: 'faltan', tono: 'rojo' });
        expect(cifraDiferencia({ diferencia: 1 })).toEqual({ valor: '1', etiqueta: 'falta', tono: 'rojo' });
        expect(cifraDiferencia({ diferencia: -1 })).toEqual({ valor: '1', etiqueta: 'de más', tono: 'ambar' });
        expect(rutaDe(dif())).toBe('Bodega Cerrillos → Domeyko · TRF-202610-0021');
        expect(rutaDe(dif({ origen: null }))).toBe('Domeyko · TRF-202610-0021');
        expect(queDiferencia(dif())).toBe('faltan 2 sacos');
        expect(queDiferencia(dif({ diferencia: -1, unidad: 'UN' }))).toBe('llegó 1 unidad de más');
        expect(haceCuanto(14)).toBe('Hace 14 días.');
        expect(haceCuanto(1)).toBe('Hace 1 día.');
        expect(haceCuanto(0)).toBe('Hoy.');
    });

    test('anchoFila: el de la vista, la mitad lado a lado, menos el relleno; en dos columnas, la mitad', () => {
        expect(anchoFila(1160)).toBe(1120);
        expect(anchoFila(1160, { lado: true })).toBe(528);
        expect(anchoFila(1160, { dos: true })).toBe(540);
        expect(anchoFila(468, { relleno: 32 })).toBe(436);
        expect(anchoFila(0)).toBe(0);
    });

    test('disposicionDiferencia: sangría, personas lado a lado y el botón «Preguntar» según el ancho (cortes del lienzo)', () => {
        // Celular: sin sangría bajo 420, una persona bajo otra, «Preguntar a Jhoan» desde 340 de columna.
        expect(disposicionDiferencia(436, 2)).toEqual({ sangria: true, juntas: false, boton: 'largo' });
        expect(disposicionDiferencia(328, 2)).toEqual({ sangria: false, juntas: false, boton: 'corto' });
        expect(disposicionDiferencia(280, 2)).toEqual({ sangria: false, juntas: false, boton: 'icono' });
        // Computador, paneles lado a lado (528): juntas y solo el ícono.
        expect(disposicionDiferencia(528, 2)).toEqual({ sangria: true, juntas: true, boton: 'icono' });
        // Un solo panel ancho (1120): juntas y «Preguntar a Jhoan».
        expect(disposicionDiferencia(1120, 2)).toEqual({ sangria: true, juntas: true, boton: 'largo' });
        // Una sola persona: nunca «juntas».
        expect(disposicionDiferencia(1120, 1).juntas).toBe(false);
    });

    test('personasDiferencia: despachó y recibió; sin despacho registrado, quien aprobó; nadie inventado', () => {
        expect(personasDiferencia(dif())).toEqual([
            { paso: 'despacho', nombre: 'Jhoan Vásquez', cuando: ' el 7 oct', texto: 'Despachó el 7 oct' },
            { paso: 'recepcion', nombre: 'Tomás Vera', cuando: ' el 8 oct', texto: 'Recibió el 8 oct' },
        ]);
        expect(personasDiferencia(dif({ despacho: null })).map(p => p.texto)).toEqual(['Aprobó el 6 oct', 'Recibió el 8 oct']);
        expect(personasDiferencia(dif({ despacho: { por: null, fecha: '2026-10-07' }, aprobacion: null, recepcion: { por: yo(1, 'Ana'), fecha: null } })))
            .toEqual([{ paso: 'recepcion', nombre: 'Ana', cuando: '', texto: 'Recibió' }]);
    });
});

// ─── Mensajes de WhatsApp ───

describe('mensajes de WhatsApp', () => {
    const pedidas = [
        sol({ id: 41, estado: 'pendiente', etapa: 'pedida', dias: 9, codigo: 'TRF-202610-0041', destino: obra('Gorbea 3082'),
            solicitante: { id: 21, nombre: 'Carla Soto', rol: 'Prevencionista' } }),
        sol({ id: 44, estado: 'pendiente', etapa: 'pedida', dias: 1, codigo: 'TRF-202610-0044', destino: obra('Abate 80'),
            solicitante: { id: 23, nombre: 'Luis Fuentes', rol: 'Jefe de Obra' } }),
        sol({ id: 46, estado: 'pendiente', etapa: 'pedida', dias: 0, codigo: 'TRF-202610-0046', destino: obra('Conferencia 622'),
            solicitante: { id: 24, nombre: 'Ana Rojas', rol: 'Prevencionista' } }),
    ];

    test('mensajeApurar: saludo a Leonardo, una línea por solicitud y la pregunta', () => {
        expect(mensajeApurar(pedidas, { aprobadores: LEONARDO })).toBe([
            'Hola Leonardo, hay 3 solicitudes de materiales esperando tu aprobación:',
            '• Gorbea 3082 · Carla Soto · 9 días esperando (TRF-202610-0041)',
            '• Abate 80 · Luis Fuentes · 1 día esperando (TRF-202610-0044)',
            '• Conferencia 622 · Ana Rojas · pedida hoy (TRF-202610-0046)',
            '¿Las puedes revisar para aprobar o rechazar?',
        ].join('\n'));
    });

    test('mensajeApurar: una sola, sin nombre de aprobador, y con tope de líneas', () => {
        expect(mensajeApurar(pedidas.slice(0, 1), { aprobadores: [] })).toBe([
            'Hola, hay 1 solicitud de materiales esperando tu aprobación:',
            '• Gorbea 3082 · Carla Soto · 9 días esperando (TRF-202610-0041)',
            '¿La puedes revisar para aprobar o rechazar?',
        ].join('\n'));
        const muchas = Array.from({ length: 30 }, (_, i) => sol({ id: 100 + i, estado: 'pendiente', etapa: 'pedida', dias: 3 }));
        const lineas = mensajeApurar(muchas, { total: 32, aprobadores: LEONARDO }).split('\n');
        expect(lineas[0]).toBe('Hola Leonardo, hay 32 solicitudes de materiales esperando tu aprobación:');
        expect(lineas.filter(l => l.startsWith('• Domeyko'))).toHaveLength(MAX_LINEAS_APURAR);
        expect(lineas[lineas.length - 2]).toBe(`• y ${32 - MAX_LINEAS_APURAR} más en Inventario`);
    });

    test('mensajeDiferencia: saludo con su nombre, el ítem, quién despachó y recibió, y la pregunta', () => {
        expect(mensajeDiferencia(dif(), 'Jhoan Vásquez')).toBe([
            'Hola Jhoan, te escribo por una diferencia en la solicitud TRF-202610-0021 (Bodega Cerrillos → Domeyko).',
            '• Cemento: se enviaron 50 sacos y llegaron 48: faltan 2 sacos.',
            '• Despachó Jhoan Vásquez el 7 oct. Recibió Tomás Vera el 8 oct.',
            '¿Me cuentas qué pasó?',
        ].join('\n'));
    });

    test('mensajeDiferencia: de más, sin despacho registrado (va quien aprobó) y sin origen', () => {
        const d = dif({ descripcion: 'Puntal metálico 3 m', unidad: 'UN', enviada: 20, recibida: 21, diferencia: -1, origen: null, despacho: null });
        expect(mensajeDiferencia(d, 'Leonardo López')).toBe([
            'Hola Leonardo, te escribo por una diferencia en la solicitud TRF-202610-0021 (Domeyko).',
            '• Puntal metálico 3 m: se enviaron 20 unidades y llegaron 21: llegó 1 unidad de más.',
            '• Aprobó Leonardo López el 6 oct. Recibió Tomás Vera el 8 oct.',
            '¿Me cuentas qué pasó?',
        ].join('\n'));
    });

    test('SoD: la que pidió el único que aprueba no se le apura (solo la aprueba un Super Administrador)', () => {
        const deLeonardo = sol({ id: 47, estado: 'pendiente', etapa: 'pedida', dias: 2, codigo: 'TRF-202610-0047', destino: obra('Domeyko'),
            solicitante: { id: 10, nombre: 'Leonardo López', rol: 'Administrador' } });
        expect(laApruebaSoloSuperAdmin(deLeonardo, LEONARDO)).toBe(true);
        expect(laApruebaSoloSuperAdmin(pedidas[0], LEONARDO)).toBe(false);
        // Con otro aprobador, el otro sí la puede aprobar.
        expect(laApruebaSoloSuperAdmin(deLeonardo, [...LEONARDO, yo(12, 'Ana Rojas')])).toBe(false);
        expect(laApruebaSoloSuperAdmin(deLeonardo, [])).toBe(false);
        expect(notaSoloSuperAdmin(deLeonardo)).toBe('La pidió Leonardo: solo la puede aprobar un Super Administrador.');

        const lista = [...pedidas, deLeonardo];
        expect(cuantasPorApurar(lista, { total: 4, aprobadores: LEONARDO })).toBe(3);
        expect(cuantasPorApurar([deLeonardo], { total: 1, aprobadores: LEONARDO })).toBe(0);
        const texto = mensajeApurar(lista, { total: 4, aprobadores: LEONARDO });
        expect(texto).not.toMatch(/TRF-202610-0047/);
        expect(texto.split('\n')[0]).toBe('Hola Leonardo, hay 3 solicitudes de materiales esperando tu aprobación:');
    });

    test('nunca hay dinero en los mensajes', () => {
        const texto = mensajeApurar(pedidas, { aprobadores: LEONARDO }) + mensajeDiferencia(dif(), 'Jhoan');
        expect(texto).not.toMatch(/\$|valor|costo|precio/i);
    });
});

import type { TonoTarjeta } from '../tarjetaActiva';
import {
    cantidad, fechaCorta, fraseItems, itemConCantidad, masAntiguasPrimero, nombreCorto, nombreCortoDe, nombreDe, nombreLugar,
    numero, plural, quienAprueba, textoDiferencia, tonoDias,
} from './formato';
import type { DiferenciaPerfil, InventarioPerfilApi, PasoPerfil, PersonaPerfil, SolicitudPerfil } from './tipos';

/**
 * Lógica PURA de la vista «jefatura» del detalle «Inventario» del Inicio (Daphne Lazcano: «Ver diferencias» sin
 * aprobar; opción B «El circuito» del lienzo, `Jefatura` de boveda-diseno/frontend/src/preview/inventario/opcionB.tsx).
 * Arma, con la respuesta de GET /transferencias/inicio/perfil: las cinco etapas del circuito, las listas de cada una
 * (orden y topes), los textos de paneles y filas, y los mensajes de WhatsApp («Apurar a Leonardo» y «Preguntar» por una
 * diferencia). Solo usa lo que la app registra (quién pidió, aprobó, despachó y recibió, y cuándo): los WhatsApp no
 * quedan guardados. Test: `jefatura.modelo.test.ts`. El dibujo está en `VistaJefatura.tsx`.
 */

// ─────────────────────────────── El circuito ───────────────────────────────

export type ClaveEtapa = 'pedida' | 'aprobada' | 'despachada' | 'recibida' | 'diferencias';

export const NOMBRE_ETAPA: Record<ClaveEtapa, string> = {
    pedida: 'Pedida', aprobada: 'Aprobada', despachada: 'Despachada', recibida: 'Recibida', diferencias: 'Diferencias',
};

/** Lo que se abre al entrar: lo que espera a Leonardo y las diferencias, cada uno en su panel. */
export const POR_DEFECTO_JEFATURA: ClaveEtapa[][] = [['pedida'], ['diferencias']];

export interface MarcaEtapa { texto: string; tono: TonoTarjeta }

export interface EtapaCircuito {
    clave: ClaveEtapa;
    /** 1-4 en el circuito; null = Diferencias (va aparte). */
    numero: number | null;
    cifra: number;
    /** Qué cuenta la cifra, en palabras: «esperan aprobación». */
    que: string;
    /** Un dato que avisa: «la más antigua: 9 días». */
    dato: string;
    tonoDato: TonoTarjeta;
    tono: TonoTarjeta;
    /** Por qué le importa a Daphne: «Apurar» (lo que espera a Leonardo) y «Aclarar» (las diferencias). */
    marca?: MarcaEtapa;
}

/** 0 → «hoy», 1 → «1 día», 9 → «9 días» (el `dias` del lienzo). */
export const dias = (n: number): string => (n <= 0 ? 'hoy' : plural(n, '1 día', `${n} días`));

/** «la más antigua: 9 días» (0 → «de hoy»); `hace`: «la más antigua: hace 14 días». Sin ninguna, `vacio`. */
function laMasAntigua(n: number | null, vacio: string, hace = false): string {
    if (n == null) return vacio;
    if (n <= 0) return 'la más antigua: de hoy';
    return `la más antigua: ${hace ? 'hace ' : ''}${dias(n)}`;
}

/**
 * Las cinco etapas, con las cifras EXACTAS de `circuito` (las listas pueden venir con tope):
 * Pedida → Aprobada → Despachada → Recibida (este mes) y Diferencias aparte. Todas cuentan SOLICITUDES, también
 * Diferencias (`circuito.diferencias.total`), como la tarjeta del Inicio y la pestaña Inventario → Diferencias; los
 * ítems con diferencia (`items`) son un detalle del panel («4 ítems en 3 solicitudes»).
 */
export function etapasJefatura(circuito: InventarioPerfilApi['circuito']): EtapaCircuito[] {
    const { pedida: p, aprobada: a, despachada: c, recibida: r, diferencias: d } = circuito;
    const nDif = d.total;
    return [
        {
            clave: 'pedida', numero: 1, cifra: p.total, que: plural(p.total, 'espera aprobación', 'esperan aprobación'),
            dato: laMasAntigua(p.total ? p.dias ?? 0 : null, 'nada aquí'),
            tonoDato: p.total ? tonoDias(p.dias) : 'neutro', tono: p.total ? 'ambar' : 'neutro',
            marca: p.total ? { texto: 'Apurar', tono: 'ambar' } : undefined,
        },
        {
            clave: 'aprobada', numero: 2, cifra: a.total, que: 'por recibir',
            dato: laMasAntigua(a.total ? a.dias ?? 0 : null, 'nada aquí'), tonoDato: 'neutro', tono: 'neutro',
        },
        {
            clave: 'despachada', numero: 3, cifra: c.total, que: plural(c.total, 'va en camino', 'van en camino'),
            dato: laMasAntigua(c.total ? c.dias ?? 0 : null, 'nada aquí'), tonoDato: 'neutro', tono: c.total ? 'azul' : 'neutro',
        },
        {
            clave: 'recibida', numero: 4, cifra: r.total, que: plural(r.total, 'llegó este mes', 'llegaron este mes'),
            dato: r.total && r.ultima ? `la última: ${fechaCorta(r.ultima)}` : 'nada este mes', tonoDato: 'neutro', tono: 'neutro',
        },
        {
            clave: 'diferencias', numero: null, cifra: nDif,
            que: plural(nDif, 'llegó distinto a lo enviado', 'llegaron distinto a lo enviado'),
            dato: laMasAntigua(nDif ? d.dias ?? 0 : null, 'ninguna', true),
            tonoDato: nDif ? 'rojo' : 'neutro', tono: nDif ? 'rojo' : 'neutro',
            marca: nDif ? { texto: 'Aclarar', tono: 'rojo' } : undefined,
        },
    ];
}

/**
 * La etapa abierta se pinta entera (verde; rojo en Diferencias) solo si tiene algo. Con 0 queda blanca con un anillo
 * de selección: un relleno verde con «0 · nada aquí» se leería como un logro.
 */
export const rellenaEtapa = (e: Pick<EtapaCircuito, 'cifra'>, abierta: boolean): boolean => abierta && e.cifra > 0;

/** Lo que se lee en voz alta al tocar una etapa: «Paso 1, Pedida: 6 esperan aprobación. la más antigua: 9 días. Apurar». */
export const etiquetaEtapa = (e: EtapaCircuito): string =>
    `${e.numero ? `Paso ${e.numero}, ` : ''}${NOMBRE_ETAPA[e.clave]}: ${e.cifra} ${e.que}. ${e.dato}${e.marca ? `. ${e.marca.texto}` : ''}`;

/**
 * Lo que se mira en el circuito, del alcance REAL de la respuesta (el de GET /:id): con `ver_todas`, «todas las obras»;
 * sin él, lo propio y, si tiene bodega asignada, lo que llega a esa bodega.
 */
export function alcanceJefatura(alcance?: Pick<InventarioPerfilApi['alcance'], 'todas' | 'bodega_id'> | null): string {
    if (!alcance || alcance.todas) return 'todas las obras';
    return alcance.bodega_id != null ? 'tus solicitudes y tu bodega' : 'tus solicitudes';
}

/**
 * Nota cuando hay una obra elegida en el selector de arriba: este detalle NO se filtra por obra (las cifras exactas del
 * circuito son de todo su alcance), a diferencia de otras partes del Inicio. «Aquí van todas las obras: …».
 */
export const notaObraElegida = (alcance: string): string =>
    `Aquí van ${alcance}: el selector de obra de arriba no filtra este detalle.`;

// ─────────────────────────────── Las listas ───────────────────────────────

export interface ListasJefatura {
    /** Pendientes de aprobar, la más antigua primero. */
    pedidas: SolicitudPerfil[];
    /** Aprobadas que aún no salen, la más antigua primero. */
    aprobadas: SolicitudPerfil[];
    /** En tránsito o con recepción parcial, la más antigua primero. */
    despachadas: SolicitudPerfil[];
    /** Recibidas ESTE mes, la más nueva primero. */
    recibidas: SolicitudPerfil[];
    /** Ítems con diferencia, la más antigua primero; null si el servidor no la mandó (sin permiso). */
    diferencias: DiferenciaPerfil[] | null;
}

const deEtapa = (lista: readonly SolicitudPerfil[], etapa: SolicitudPerfil['etapa']) =>
    masAntiguasPrimero(lista.filter(s => s.etapa === etapa));

/** Fecha en que llegó (la recepción que la cerró), o '' si la app no la guardó. */
const fechaRecepcion = (s: SolicitudPerfil) => s.recepcion?.fecha ?? '';

export function listasJefatura(datos: Pick<InventarioPerfilApi, 'solicitudes' | 'diferencias'>): ListasJefatura {
    const { solicitudes } = datos;
    return {
        pedidas: deEtapa(solicitudes, 'pedida'),
        aprobadas: deEtapa(solicitudes, 'aprobada'),
        despachadas: deEtapa(solicitudes, 'despachada'),
        recibidas: solicitudes.filter(s => s.etapa === 'recibida' && s.del_mes)
            .sort((x, y) => fechaRecepcion(y).localeCompare(fechaRecepcion(x)) || y.id - x.id),
        diferencias: datos.diferencias ? masAntiguasPrimero(datos.diferencias) : null,
    };
}

/** Cuántas quedan fuera de la lista (vino con tope) y hay que ver en Inventario; 0 si vienen todas. */
export const fueraDeLista = (total: number, enLista: number): number => Math.max(0, total - enLista);

/** Cuántas solicitudes distintas tienen diferencias en la lista (la lista es por ítem). */
export const solicitudesConDiferencia = (lista: readonly Pick<DiferenciaPerfil, 'transferencia_id'>[] | null | undefined): number =>
    new Set((lista ?? []).map(d => d.transferencia_id)).size;

// ─────────────────────────────── Tope del Inicio ───────────────────────────────
// Las cifras del circuito son exactas; las listas del Inicio muestran primero unas pocas (las más antiguas en lo que
// está en curso, las más nuevas en lo recibido) con «Ver las N» / «Ocultar», como el `PieTope` del lienzo. Si el servidor
// también cortó la lista (`limites`), el resto está en Inventario.

/** Cuántas se ven al entrar: 8 solicitudes por panel y 5 diferencias (cada una es alta: lleva «Quién lo hizo»). */
export const TOPE_INICIO = { solicitudes: 8, diferencias: 5 } as const;

/**
 * Textos del pie de una lista con tope: a la izquierda cuántas se ven y a la derecha el botón.
 * `vistas` = las dibujadas, `enLista` = las que vinieron, `total` = la cifra exacta; `items`: la lista cuenta ítems
 * (Diferencias, cuando no son uno por solicitud), así que se dice «ítems».
 */
export function textosTope({ vistas, enLista, total, abierto, items = false }: {
    vistas: number; enLista: number; total: number; abierto: boolean; items?: boolean;
}): { cuantas: string; boton: string } {
    const t = Math.max(total, enLista);
    const de = items ? ' ítems' : '';
    const todas = items ? `los ${t} ítems` : `las ${t}`;
    const completa = enLista >= t;
    return {
        cuantas: abierto && completa ? `Se ven ${todas}` : `Se ven ${abierto ? enLista : vistas} de ${t}${de}`,
        boton: abierto ? 'Ocultar' : completa ? `Ver ${todas}` : `Ver ${enLista} de ${t}`,
    };
}

/** «Ver las 6» / «Ver la solicitud» (desplegar la lista resumida del celular). */
export const textoVerLista = (n: number): string => (n === 1 ? 'Ver la solicitud' : `Ver las ${n}`);

/**
 * El botón que despliega «Pedida» resumida en el celular: «Ver las 6»; si son más de las que se muestran de una vez,
 * «Ver las más antiguas» (la cifra exacta ya está en el título y no calzaría con lo que se abre).
 */
export const textoVerResumen = (total: number, tope: number = TOPE_INICIO.solicitudes): string =>
    (total > tope ? 'Ver las más antiguas' : textoVerLista(total));

/** El filtro de Inventario → Solicitudes con la lista completa de cada etapa (si la del Inicio vino con tope). */
export const FILTRO_ETAPA = {
    pedida: 'pendiente', aprobada: 'aprobada', despachada: 'todas', recibida: 'recibida', diferencias: 'discrepancias',
} as const satisfies Record<ClaveEtapa, string>;

/**
 * El enlace a Inventario cuando la lista del Inicio vino cortada por el servidor: «Ver las 240 en Inventario». Sin cifra
 * si el filtro de llegada no muestra solo esas (Despachada abre «todas»: Inventario no tiene filtro de en camino) o si
 * es una sola. En Diferencias la cifra es de solicitudes, como la pestaña.
 */
export const textoEnInventario = (clave: ClaveEtapa, total: number): string =>
    (FILTRO_ETAPA[clave] === 'todas' || total <= 1 ? 'Ver en Inventario' : `Ver las ${total} en Inventario`);

// ─────────────────────────────── Textos de los paneles ───────────────────────────────

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-10-22' → «octubre» (el mes de `hoy`). */
export function mesDe(hoy: string): string {
    const m = /^\d{4}-(\d{2})/.exec(hoy ?? '');
    const n = m ? Number(m[1]) : 0;
    return n >= 1 && n <= 12 ? MESES_LARGOS[n - 1] : 'este mes';
}

/** Quién aprueba hoy (`datos.aprobadores`): «Leonardo», «Leonardo o Ana» o null (nadie, o más de dos). */
export const aQuienApurar = (aprobadores: readonly PersonaPerfil[] | null | undefined): string | null => quienAprueba(aprobadores);

/** Cuántos aprueban (para «Mándale» / «Mándales»). */
const cuantosAprueban = (aprobadores: readonly PersonaPerfil[] | null | undefined) =>
    (aprobadores ?? []).filter(p => nombreDe(p)).length;

/** «6 solicitudes esperan a Leonardo» · «1 solicitud espera a Leonardo» · «Nada espera aprobación». */
export function tituloPedidas(total: number, quien: string | null): string {
    if (total === 0) return 'Nada espera aprobación';
    return `${plural(total, '1 solicitud espera', `${total} solicitudes esperan`)} ${quien ? `a ${quien}` : 'aprobación'}`;
}

/** La línea bajo el título de «Pedida»: con espacio, qué hacer; resumida (celular), cuál es la más antigua. */
export function bajadaPedidas(
    lista: readonly SolicitudPerfil[],
    { resumen, aprobadores }: { resumen: boolean; aprobadores?: readonly PersonaPerfil[] | null },
): string {
    const vieja = lista[0];
    if (!vieja) return 'Cuando alguien pida materiales, aparece aquí.';
    const lleva = vieja.dias <= 0 ? 'La más antigua es de hoy' : `La más antigua lleva ${dias(vieja.dias)}`;
    if (resumen) {
        const quien = [nombreDe(vieja.solicitante), nombreLugar(vieja.destino)].filter(Boolean).join(', ');
        return quien ? `${lleva}: ${quien}.` : `${lleva}.`;
    }
    const una = lista.length === 1;
    const la = una ? 'la' : 'las';
    const quienes = cuantosAprueban(aprobadores);
    const manda = quienes === 1 ? 'Mándale la lista' : quienes === 2 ? 'Mándales la lista' : 'Manda la lista';
    const aprueben = quienes === 1 ? `${la} apruebe o rechace` : `${la} aprueben o rechacen`;
    return `${lleva}. ${manda} para que ${aprueben}.`;
}

/** «Apurar a Leonardo» (o «Apurar por WhatsApp» si no se sabe a quién). */
export const textoApurar = (quien: string | null): string => (quien ? `Apurar a ${quien}` : 'Apurar por WhatsApp');

export const tituloAprobadas = (n: number): string => (n === 0 ? 'Nada por recibir' : `${plural(n, '1 aprobada', `${n} aprobadas`)} por recibir`);

/** «Leonardo ya las aprobó; falta que salgan de bodega.» Con varios aprobadores (o sin nombre), sin nombre. */
export function bajadaAprobadas(lista: readonly SolicitudPerfil[]): string {
    if (lista.length === 0) return 'Lo aprobado espera aquí hasta que salga de bodega.';
    const una = lista.length === 1;
    const quienes = lista.map(s => nombreCortoDe(s.aprobacion?.por)).filter((q, i, todos) => todos.indexOf(q) === i);
    const salgan = una ? 'falta que salga de bodega' : 'falta que salgan de bodega';
    if (quienes.length === 1 && quienes[0]) return `${quienes[0]} ya ${una ? 'la' : 'las'} aprobó; ${salgan}.`;
    return `Ya ${una ? 'está aprobada' : 'están aprobadas'}; ${salgan}.`;
}

export const tituloDespachadas = (n: number): string => (n === 0 ? 'Nada va en camino' : `${plural(n, '1 va', `${n} van`)} en camino`);
export const bajadaDespachadas = (n: number): string => (n === 0
    ? 'Lo que sale de bodega aparece aquí hasta que la obra confirme lo que llegó.'
    : 'Ya salieron de bodega; falta que la obra confirme lo que llegó.');

export const tituloRecibidas = (n: number): string => (n === 0 ? 'Nada llegó este mes' : `${plural(n, '1 llegó', `${n} llegaron`)} este mes`);
export const bajadaRecibidas = (hoy: string): string =>
    `Recibidas en ${mesDe(hoy)}. Si algo llegó distinto, también está en «Diferencias».`;

/** `n` = SOLICITUDES con alguna diferencia pendiente (la cifra de la tarjeta del Inicio y de la pestaña). */
export const tituloDiferencias = (n: number): string => (n === 0 ? 'Ninguna diferencia por aclarar' : `${plural(n, '1 diferencia', `${n} diferencias`)} por aclarar`);

/**
 * Bajo el título de Diferencias. `items` = ítems con diferencia: si no es uno por solicitud, se dice al comienzo
 * («4 ítems en 3 solicitudes.»), porque la lista va ítem por ítem.
 */
export function bajadaDiferencias(n: number, items: number = n): string {
    if (n === 0) return 'Cuando algo llegue distinto a lo enviado, aparece aquí con quién lo despachó y quién lo recibió.';
    const detalle = items > n ? `${items} ítems en ${plural(n, '1 solicitud', `${n} solicitudes`)}. ` : '';
    return `${detalle}Lo que llegó no calza con lo enviado. Pregúntale por WhatsApp a quien despachó o recibió: el mensaje va listo.`;
}

// ─────────────────────────────── Filas de solicitudes ───────────────────────────────

/**
 * El rol de quien pidió como «cargo», con minúscula al medio como el lienzo: «Jefe de Obra» → «Jefe de obra».
 * Las siglas quedan («RRHH»). null si no tiene rol.
 */
export function cargoDe(rol?: string | null): string | null {
    const palabras = (rol ?? '').trim().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return null;
    return palabras.map((p, i) => (i > 0 && /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]+$/.test(p) ? p.toLowerCase() : p)).join(' ');
}

/** «Carla Soto · Gorbea 3082» (quién pidió y para dónde). */
export function tituloFila(s: SolicitudPerfil): string {
    const partes = [nombreDe(s.solicitante), nombreLugar(s.destino)].filter((p): p is string => !!p);
    return partes.length ? partes.join(' · ') : s.codigo;
}

const juntar = (partes: (string | null | false | undefined)[]) => partes.filter((p): p is string => !!p).join(' · ');
const elDia = (fecha?: string | null) => (fechaCorta(fecha) ? ` el ${fechaCorta(fecha)}` : '');

/** Pedida: «Prevencionista · pidió el 13 oct · TRF-202610-0041». */
export const bajadaPedida = (s: SolicitudPerfil): string =>
    juntar([cargoDe(s.solicitante?.rol), fechaCorta(s.fecha_solicitud) && `pidió el ${fechaCorta(s.fecha_solicitud)}`, s.codigo]);

/** Aprobada: «Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos». */
export function bajadaAprobada(s: SolicitudPerfil): string {
    const quien = nombreCortoDe(s.aprobacion?.por);
    const origen = nombreLugar(s.origen);
    return juntar([quien ? `Aprobó ${quien}${elDia(s.aprobacion?.fecha)}` : fechaCorta(s.aprobacion?.fecha) && `Aprobada el ${fechaCorta(s.aprobacion?.fecha)}`,
        origen && `sale de ${origen}`]) || s.codigo;
}

/**
 * Despachada: «Despachó Jhoan Vásquez el 21 oct · desde Paraguay». La interfaz no tiene «Despachar» (muchas no traen
 * despacho): entonces dice lo que sí se registró, quién la aprobó.
 */
export function bajadaDespachada(s: SolicitudPerfil): string {
    const despacho = nombreDe(s.despacho?.por);
    const aprobo = nombreCortoDe(s.aprobacion?.por);
    const origen = nombreLugar(s.origen);
    const quien = despacho ? `Despachó ${despacho}${elDia(s.despacho?.fecha)}`
        : aprobo ? `Aprobó ${aprobo}${elDia(s.aprobacion?.fecha)}` : null;
    return juntar([quien, origen && `desde ${origen}`]) || s.codigo;
}

/** Recibida: «Recibió Carla Soto el 10 oct · desde Bodega Cerrillos». */
export function bajadaRecibida(s: SolicitudPerfil): string {
    const quien = nombreDe(s.recepcion?.por);
    const origen = nombreLugar(s.origen);
    const fecha = fechaCorta(s.recepcion?.fecha);
    return juntar([quien ? `Recibió ${quien}${elDia(s.recepcion?.fecha)}` : fecha && `Recibida el ${fecha}`, origen && `desde ${origen}`]) || s.codigo;
}

/** Lo pedido: «Cemento (40 sacos) y Arena gruesa (3 m³).» · con más de dos, «… y 1 ítem más.». */
export function fraseFila(s: Pick<SolicitudPerfil, 'items'>): string | undefined {
    if (s.items.length === 0) return undefined;
    return `${fraseItems(s.items, { formato: i => itemConCantidad(i) })}.`;
}

export interface CifraFila { valor: string; etiqueta: string; tono: TonoTarjeta }

/** «9 / días esperando»; si es de hoy, «Hoy / pedida». */
export const cifraDias = (n: number, sufijo: string, tono: TonoTarjeta, deHoy: string): CifraFila =>
    (n <= 0 ? { valor: 'Hoy', etiqueta: deHoy, tono: 'neutro' } : { valor: String(n), etiqueta: `${plural(n, 'día', 'días')} ${sufijo}`, tono });

/** Círculo de la fila: rojo si lleva más de 30 días en la etapa. */
export const tonoCirculo = (s: Pick<SolicitudPerfil, 'dias'>): TonoTarjeta => (s.dias > 30 ? 'rojo' : 'neutro');

export interface PildoraFila { texto: string; tono: TonoTarjeta }

/** «Herramientas» (lleva ítems del catálogo). */
export const pildorasTipo = (s: Pick<SolicitudPerfil, 'tipo'>): PildoraFila[] =>
    (s.tipo === 'herramientas' ? [{ texto: 'Herramientas', tono: 'neutro' }] : []);

/** Una despachada que ya empezó a llegar (recepción parcial): «Llegó una parte». */
export const pildorasParcial = (s: Pick<SolicitudPerfil, 'estado'>): PildoraFila[] =>
    (s.estado === 'recepcion_parcial' ? [{ texto: 'Llegó una parte', tono: 'azul' }] : []);

/**
 * Qué solicitudes tienen hoy una diferencia PENDIENTE (de `datos.diferencias`). `completa` = la lista vino entera (no
 * llegó al tope del servidor): solo así «no está» quiere decir «ya se aclaró». null sin la lista (sin permiso).
 */
export interface DiferenciasPendientes { ids: ReadonlySet<number>; completa: boolean }

export function diferenciasPendientes(
    datos: { diferencias: readonly Pick<DiferenciaPerfil, 'transferencia_id'>[] | null; circuito: { diferencias: { items: number } } },
): DiferenciasPendientes | null {
    if (!datos.diferencias) return null;
    return {
        ids: new Set(datos.diferencias.map(d => d.transferencia_id)),
        completa: datos.diferencias.length >= datos.circuito.diferencias.items,
    };
}

/**
 * Cómo llegó una recibida, ítem por ítem: «Faltaron 2 sacos», «Llegó 1 unidad de más», «2 ítems llegaron distinto» o
 * «Llegó completa». Sin nada que comparar (la app no guardó lo enviado o lo recibido), nada.
 * El rojo es para una diferencia que sigue PENDIENTE: si `pendientes` dice que esa solicitud ya no tiene ninguna (se
 * aprobó o rechazó lo declarado), va neutra, «Llegó distinto». Si no se sabe (sin lista, o la lista vino cortada y no
 * está), queda roja: puede seguir pendiente.
 */
export function pildoraRecibida(s: Pick<SolicitudPerfil, 'id' | 'items'>, pendientes?: DiferenciasPendientes | null): PildoraFila | null {
    const conocidos = s.items.filter(i => i.enviada != null && i.recibida != null);
    if (conocidos.length === 0) return null;
    const distintos = conocidos.filter(i => Math.round(((i.enviada ?? 0) - (i.recibida ?? 0)) * 10_000) !== 0);
    if (distintos.length === 0) return { texto: 'Llegó completa', tono: 'verde' };
    if (pendientes?.completa && !pendientes.ids.has(s.id)) return { texto: 'Llegó distinto', tono: 'neutro' };
    if (distintos.length > 1) return { texto: `${distintos.length} ítems llegaron distinto`, tono: 'rojo' };
    const i = distintos[0];
    return { texto: textoDiferencia((i.enviada ?? 0) - (i.recibida ?? 0), i.unidad, { pasado: true }), tono: 'rojo' };
}

// ─────────────────────────────── SoD en lo que espera aprobación ───────────────────────────────

/**
 * La pidió el ÚNICO que aprueba (p. ej. Leonardo): `aprobar()` se lo bloquea (SoD: solicitante ≠ aprobador) y solo un
 * Super Administrador con `sod_bypass` puede aprobarla. No sirve apurarlo por ella. Con otro aprobador más, sí.
 */
export function laApruebaSoloSuperAdmin(
    s: Pick<SolicitudPerfil, 'solicitante'>,
    aprobadores: readonly PersonaPerfil[] | null | undefined,
): boolean {
    const quien = s.solicitante?.id;
    const ids = (aprobadores ?? []).map(p => p.id);
    return quien != null && ids.length > 0 && ids.every(id => id === quien);
}

/** La nota de esa fila: «La pidió Leonardo: solo la puede aprobar un Super Administrador.». */
export const notaSoloSuperAdmin = (s: Pick<SolicitudPerfil, 'solicitante'>): string =>
    `La pidió ${nombreCortoDe(s.solicitante) ?? 'quien aprueba'}: solo la puede aprobar un Super Administrador.`;

/** Cuántas sirve apurar: la cifra exacta menos las de la lista que solo puede aprobar un Super Administrador. */
export function cuantasPorApurar(
    lista: readonly SolicitudPerfil[],
    { total = lista.length, aprobadores }: { total?: number; aprobadores?: readonly PersonaPerfil[] | null } = {},
): number {
    const bloqueadas = lista.filter(s => laApruebaSoloSuperAdmin(s, aprobadores)).length;
    return Math.max(Math.max(total, lista.length) - bloqueadas, 0);
}

// ─────────────────────────────── Filas de diferencias ───────────────────────────────

/** Rojo si faltó; ámbar si solo llegó de más. */
export const tonoDiferencia = (d: Pick<DiferenciaPerfil, 'diferencia'>): TonoTarjeta => (d.diferencia > 0 ? 'rojo' : 'ambar');

/** La cifra de la derecha: «2 / faltan», «1 / falta», «1 / de más». */
export function cifraDiferencia(d: Pick<DiferenciaPerfil, 'diferencia'>): CifraFila {
    const n = Math.abs(d.diferencia);
    return { valor: numero(n), etiqueta: d.diferencia > 0 ? plural(n, 'falta', 'faltan') : 'de más', tono: tonoDiferencia(d) };
}

/** «Bodega Cerrillos → Domeyko · TRF-202610-0021». */
export function rutaDe(d: Pick<DiferenciaPerfil, 'origen' | 'destino' | 'codigo'>): string {
    const lugares = [nombreLugar(d.origen), nombreLugar(d.destino)].filter(Boolean).join(' → ');
    return lugares ? `${lugares} · ${d.codigo}` : d.codigo;
}

/** «faltan 2 sacos» / «llegó 1 unidad de más». */
export const queDiferencia = (d: Pick<DiferenciaPerfil, 'diferencia' | 'unidad'>): string =>
    textoDiferencia(d.diferencia, d.unidad, { minuscula: true });

/** «Hace 14 días.» · «Hoy.» */
export const haceCuanto = (n: number): string => (n <= 0 ? 'Hoy.' : `Hace ${dias(n)}.`);

export interface PersonaDiferencia {
    /** Qué hizo: despachó; si la app no registró despacho, quien aprobó (decidió qué salía); recibió. */
    paso: 'despacho' | 'aprobacion' | 'recepcion';
    nombre: string;
    /** « el 7 oct» (vacío si la app no guardó la fecha). */
    cuando: string;
    /** «Despachó el 7 oct», «Aprobó el 6 oct», «Recibió el 8 oct». */
    texto: string;
}

const VERBO: Record<PersonaDiferencia['paso'], string> = { despacho: 'Despachó', aprobacion: 'Aprobó', recepcion: 'Recibió' };

const persona = (paso: PersonaDiferencia['paso'], p: PasoPerfil | null | undefined): PersonaDiferencia | null => {
    const nombre = nombreDe(p?.por);
    const cuando = elDia(p?.fecha);
    return nombre ? { paso, nombre, cuando, texto: `${VERBO[paso]}${cuando}` } : null;
};

/**
 * «Quién lo hizo»: quien despachó y quien recibió, con su fecha. Si la app no registró despacho (la interfaz no tiene
 * «Despachar»), va quien la aprobó, que decidió qué salía. Quien falte no va (no se inventa).
 */
export function personasDiferencia(d: Pick<DiferenciaPerfil, 'despacho' | 'aprobacion' | 'recepcion'>): PersonaDiferencia[] {
    const sale = persona('despacho', d.despacho) ?? persona('aprobacion', d.aprobacion);
    return [sale, persona('recepcion', d.recepcion)].filter((p): p is PersonaDiferencia => !!p);
}

// ─────────────────────────────── Medidas de una diferencia ───────────────────────────────
// Se calculan desde el ancho de la vista (un solo ResizeObserver para todo), no midiendo cada fila.

/** Separación entre los dos paneles lado a lado (`gap-6`) y entre las dos columnas de una lista (`gap-x-10`). */
const ENTRE_PANELES = 24;
const ENTRE_COLUMNAS = 40;

/**
 * Ancho de una fila de la lista: el de la vista, la mitad si los dos paneles van lado a lado, menos el relleno del
 * panel (`p-4` = 32 / `sm:p-5` = 40) y, si la lista va en dos columnas, la mitad de lo que queda.
 */
export function anchoFila(ancho: number, { lado = false, dos = false, relleno = 40 }: { lado?: boolean; dos?: boolean; relleno?: number } = {}): number {
    const panel = lado ? (ancho - ENTRE_PANELES) / 2 : ancho;
    const adentro = Math.max(panel - relleno, 0);
    return dos ? Math.max((adentro - ENTRE_COLUMNAS) / 2, 0) : adentro;
}

export type BotonPreguntarTexto = 'largo' | 'corto' | 'icono';

/**
 * Cómo va una diferencia según el ancho de su fila: `sangria` (la frase y «Quién lo hizo» bajo el ítem, alineados tras
 * el ícono; angosta, a todo el ancho), `juntas` (las dos personas lado a lado) y el botón «Preguntar»: «Preguntar a
 * Jhoan», «Preguntar» o solo el ícono (44 × 44). Los mismos cortes del lienzo.
 */
export function disposicionDiferencia(ancho: number, personas: number): { sangria: boolean; juntas: boolean; boton: BotonPreguntarTexto } {
    const sangria = ancho >= 420;
    const caja = ancho - (sangria ? 52 : 0) - 24;
    const juntas = personas > 1 && caja >= 420;
    const columna = juntas ? (caja - 16) / 2 : caja;
    return { sangria, juntas, boton: columna >= 340 ? 'largo' : columna >= 270 ? 'corto' : 'icono' };
}

// ─────────────────────────────── Mensajes de WhatsApp ───────────────────────────────
// Los de datos.ts del lienzo (mensajeDiferencia, mensajeApurar) en español simple: fechas «7 oct», unidades en palabras
// («2 sacos»), «1 día» en singular y el saludo con el nombre de a quien se le escribe. Sin número: los usuarios no tienen
// teléfono, la persona elige el contacto (utils/whatsappShare.ts).

/** Tope de líneas del mensaje «Apurar»: con más, «y N más en Inventario» (un mensaje largo no se lee ni cabe en el enlace). */
export const MAX_LINEAS_APURAR = 15;

/**
 * «Hola Leonardo, hay 6 solicitudes de materiales esperando tu aprobación: • Gorbea 3082 · Carla Soto · 9 días esperando
 * (TRF-…) … ¿Las puedes revisar para aprobar o rechazar?». `total` = la cifra exacta (la lista puede venir con tope).
 * Las que pidió el único que aprueba no van (no las puede aprobar él: `laApruebaSoloSuperAdmin`).
 */
export function mensajeApurar(
    lista: readonly SolicitudPerfil[],
    { total = lista.length, aprobadores }: { total?: number; aprobadores?: readonly PersonaPerfil[] | null } = {},
): string {
    const apurables = lista.filter(s => !laApruebaSoloSuperAdmin(s, aprobadores));
    const n = cuantasPorApurar(lista, { total, aprobadores });
    const una = n === 1;
    const nombres = (aprobadores ?? []).map(nombreCortoDe).filter((x): x is string => !!x);
    const saludo = nombres.length === 1 ? `Hola ${nombres[0]}` : 'Hola';
    const vistas = apurables.slice(0, MAX_LINEAS_APURAR);
    const resto = n - vistas.length;
    return [
        `${saludo}, ${una ? 'hay 1 solicitud de materiales esperando' : `hay ${n} solicitudes de materiales esperando`} tu aprobación:`,
        ...vistas.map(s => {
            const cuanto = s.dias <= 0 ? 'pedida hoy' : `${dias(s.dias)} esperando`;
            return `• ${juntar([nombreLugar(s.destino), nombreDe(s.solicitante), cuanto])} (${s.codigo})`;
        }),
        ...(resto > 0 ? [`• y ${plural(resto, '1 más', `${resto} más`)} en Inventario`] : []),
        `¿${una ? 'La' : 'Las'} puedes revisar para aprobar o rechazar?`,
    ].join('\n');
}

/**
 * A quien despachó (o aprobó) o recibió: «Hola Jhoan, te escribo por una diferencia en la solicitud TRF-… (Bodega
 * Cerrillos → Domeyko). • Cemento: se enviaron 50 sacos y llegaron 48: faltan 2 sacos. • Despachó Jhoan Vásquez el
 * 7 oct. Recibió Tomás Vera el 8 oct. ¿Me cuentas qué pasó?».
 */
export function mensajeDiferencia(d: DiferenciaPerfil, para: string): string {
    const lugares = [nombreLugar(d.origen), nombreLugar(d.destino)].filter(Boolean).join(' → ');
    const quienes = personasDiferencia(d).map(p => `${VERBO[p.paso]} ${p.nombre}${p.cuando}.`);
    const nombre = nombreCorto(para);
    return [
        `Hola${nombre ? ` ${nombre}` : ''}, te escribo por una diferencia en la solicitud ${d.codigo}${lugares ? ` (${lugares})` : ''}.`,
        `• ${d.descripcion?.trim() || 'Ítem sin nombre'}: se enviaron ${cantidad(d.enviada, d.unidad)} y llegaron ${numero(d.recibida)}: ${queDiferencia(d)}.`,
        ...(quienes.length ? [`• ${quienes.join(' ')}`] : []),
        '¿Me cuentas qué pasó?',
    ].join('\n');
}

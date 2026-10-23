import type { TonoTarjeta } from '../tarjetaActiva';
import {
    fechaCorta, fraseItems, llegoDistinto, masAntiguasPrimero, nombreCortoDe, nombreLugar, plural, porRecibirCircuito, quienAprueba,
    rutaLista, rutaSolicitud, textoDias, tonoDias, type FiltroInventario,
} from './formato';
import type { CircuitoPerfil, InventarioPerfilApi, PuedePerfil, SolicitudPerfil } from './tipos';

/**
 * Lógica PURA de VistaObra (detalle «Inventario» del Inicio para jefes de obra y prevencionistas; opción A del lienzo,
 * boveda-diseno/frontend/src/preview/inventario/opcionA.tsx → VistaObra). Orden de las listas, topes y textos, con test en
 * `obra.modelo.test.ts`. Lo común (fechas, cantidades, ítems, enlaces) viene de `formato.ts`.
 * Solo lo que la app registra: si falta un dato (quién aprobó, la fecha…), la frase lo omite; no se inventa. Sin bodega ni
 * despacho: don Luis (2026-10-23) dejó a bodegueros y conductores fuera del ciclo de solicitud (Pedida → Aprobada →
 * Recibida); lo que va en tránsito cuenta en «Aprobada · por recibir» y no se nombra a quien lo despachó.
 * Reglas: docs/reglas/inventario-transferencias.md § Inicio por perfil → «Vista de obra».
 */

// ─────────────────────────────── Lo que llega y lo que no ───────────────────────────────

type ConLugares = Pick<SolicitudPerfil, 'tipo_flujo' | 'origen' | 'destino'>;

/**
 * ¿Sale de su obra? Las devoluciones (obra → bodega) y lo que parte de su obra (un traslado `intra_obra` a otra obra).
 * Sin su obra conocida, un traslado entre obras cuenta como que sale: no se sabe de qué lado está y no se invita a
 * recibir algo que quizás mandó él.
 */
export function saleDeSuObra(s: ConLugares, obraId: number | null): boolean {
    if (s.tipo_flujo === 'devolucion') return true;
    if (s.origen?.tipo !== 'obra') return false;
    return obraId == null ? s.tipo_flujo === 'intra_obra' : s.origen.id === obraId;
}

/** ¿Llega a su obra? El destino es una obra (la suya, si se sabe cuál) y no sale de ella. */
export function llegaASuObra(s: ConLugares, obraId: number | null): boolean {
    if (saleDeSuObra(s, obraId)) return false;
    if (s.destino?.tipo !== 'obra') return false;
    return obraId == null || s.destino.id === obraId;
}

/**
 * Adónde va lo que NO llega a su obra: «Devolución a Bodega Cerrillos», «Traslado a Gorbea 3082» (si el traslado no
 * parte de su obra, «Traslado de Paraguay a Gorbea 3082») o «Para Gorbea 3082» (lo que pidió para otra obra).
 */
export function adondeVa(s: ConLugares, obraId: number | null): string {
    const destino = nombreLugar(s.destino) ?? 'otro lugar';
    if (s.tipo_flujo === 'devolucion') return `Devolución a ${destino}`;
    if (s.tipo_flujo === 'intra_obra') {
        const origen = nombreLugar(s.origen);
        const desdeLaSuya = obraId != null && s.origen?.tipo === 'obra' && s.origen.id === obraId;
        return !desdeLaSuya && origen ? `Traslado de ${origen} a ${destino}` : `Traslado a ${destino}`;
    }
    return `Para ${destino}`;
}

// ─────────────────────────────── Circuito ───────────────────────────────

/** Pedida → Aprobada → Recibida (sin «Despachada»: don Luis 2026-10-23). */
export type Paso = 'pedida' | 'aprobada' | 'recibida';

export interface PasoCircuito {
    key: Paso;
    texto: string;
    /** La bajada bajo el nombre. */
    bajada: string;
    /**
     * El filtro de Inventario → Solicitudes que abre al tocarla. «Aprobada» con alguna en tránsito abre «Todas»: el
     * filtro «Aprobadas» no la muestra.
     */
    filtro: FiltroInventario;
}

const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** '2026-10-22' → «octubre»; vacío si no es una fecha. */
export function mesDe(hoy?: string | null): string {
    const m = /^\d{4}-(\d{2})-\d{2}/.exec((hoy ?? '').trim());
    const mes = m ? Number(m[1]) : 0;
    return mes >= 1 && mes <= 12 ? MESES_LARGOS[mes - 1] : '';
}

/**
 * Las tres etapas, con «Recibida · en octubre» según `hoy` (el mes del servidor). «Aprobada · por recibir» (el lienzo
 * decía «aún sin salir»): cuenta también lo que va en tránsito, y lo que se sabe es que nadie lo ha recibido.
 * `enTransito` = cuántas de «Aprobada» están en tránsito (`DatosCircuito.enTransito`): con alguna, abre «Todas».
 */
export function pasosCircuito(hoy?: string | null, enTransito = 0): PasoCircuito[] {
    const mes = mesDe(hoy);
    return [
        { key: 'pedida', texto: 'Pedida', bajada: 'por aprobar', filtro: 'pendiente' },
        { key: 'aprobada', texto: 'Aprobada', bajada: 'por recibir', filtro: enTransito > 0 ? 'todas' : 'aprobada' },
        { key: 'recibida', texto: 'Recibida', bajada: mes ? `en ${mes}` : 'este mes', filtro: 'recibida' },
    ];
}

export interface DatosCircuito {
    conteos: Record<Paso, number>;
    /** Días de la más antigua en cada etapa en curso (no en «Recibida»). */
    hasta: Partial<Record<Paso, number>>;
    /** Cuántas de «Aprobada» van en tránsito o con una parte recibida (el `despachada` del servidor). */
    enTransito: number;
}

/**
 * Las cifras del circuito, tal cual las cuenta el servidor (exactas, con el alcance de quien mira: TODAS las suyas).
 * «Aprobada» = aprobadas + despachadas (`porRecibirCircuito`).
 */
export function datosCircuito(c: CircuitoPerfil): DatosCircuito {
    const a = porRecibirCircuito(c);
    const hasta: Partial<Record<Paso, number>> = {};
    if (c.pedida.dias != null) hasta.pedida = c.pedida.dias;
    if (a.dias != null) hasta.aprobada = a.dias;
    return {
        conteos: { pedida: c.pedida.total, aprobada: a.total, recibida: c.recibida.total },
        hasta,
        enTransito: c.despachada?.total ?? 0,
    };
}

export interface MarcaCircuito { tono: TonoTarjeta; bajada?: string }

export interface RotulosCircuito {
    /** Etapas marcadas (azul: en curso), más grandes y con anillo. */
    marcas: Partial<Record<Paso, MarcaCircuito>>;
    titulo: string;
    /** La nota a la derecha del título; null si no hay nada marcado. */
    nota: string | null;
}

/**
 * Qué se marca y cómo se rotula el circuito. El servidor cuenta TODAS sus solicitudes (también devoluciones y lo que
 * pidió para otra obra), así que «· Domeyko» en el título y «lo que va a tu obra» solo cuando todo lo que está en el
 * circuito va a su obra (`todasASuObra`). Aprobada se marca solo si tiene alguna: un anillo azul en un 0 no dice nada.
 */
export function rotulosCircuito(c: DatosCircuito, obra: string | null, todasASuObra: boolean): RotulosCircuito {
    const marcas: Partial<Record<Paso, MarcaCircuito>> = {};
    if (c.conteos.aprobada > 0) marcas.aprobada = { tono: 'azul' };
    const hayMarcas = Object.keys(marcas).length > 0;
    return {
        marcas,
        titulo: obra && todasASuObra ? `Tus solicitudes en el circuito · ${obra}` : 'Tus solicitudes en el circuito',
        nota: !hayMarcas ? null : todasASuObra ? 'Marcado: lo que va a tu obra' : 'Marcado: lo aprobado que falta recibir',
    };
}

// ─────────────────────────────── El modelo de la vista ───────────────────────────────

/** Filas a la vista de cada lista; el resto, en Inventario (las cifras y la burbuja cuentan TODAS). */
export const TOPE_HISTORIAL = 3;
export const TOPE_RECIBIR = 5;
export const TOPE_ESPERANDO = 4;
export const TOPE_RECHAZADAS = 2;
export const TOPE_FUERA = 3;

/** El enlace al pie de una lista que pasó su tope: «Ver las 7 en Inventario». */
export interface PieLista { texto: string; ruta: string }

export interface ListaObra {
    /** Todas (para las cifras y la burbuja). */
    todas: SolicitudPerfil[];
    /** Las que se muestran (hasta el tope). */
    visibles: SolicitudPerfil[];
    /** null si caben todas. */
    pie: PieLista | null;
}

/** Corta la lista en su tope y, si sobran, arma el pie que abre Inventario con ese filtro. */
export function conTope(lista: readonly SolicitudPerfil[], tope: number, filtro: FiltroInventario): ListaObra {
    const todas = [...lista];
    if (todas.length <= tope) return { todas, visibles: todas, pie: null };
    return { todas, visibles: todas.slice(0, tope), pie: { texto: `Ver las ${todas.length} en Inventario`, ruta: rutaLista(filtro) } };
}

/** El filtro que muestra todas las de la lista: «Aprobadas» si lo son todas; si hay alguna en camino, «Todas». */
const filtroComun = (lista: readonly SolicitudPerfil[]): FiltroInventario =>
    (lista.every(s => s.estado === 'aprobada') ? 'aprobada' : 'todas');

export interface AvisoDiferencias {
    /** Cuántos ítems llegaron distinto y siguen sin aclarar. */
    items: number;
    titulo: string;
    bajada: string;
    /**
     * Con UNA solicitud con diferencias, la abre (su obra no ve la pestaña «Diferencias»); con varias (o sin el id), la
     * lista de sus recibidas.
     */
    ruta: string;
}

export interface ModeloObra {
    /** Nombre de su obra, o «tu obra» si no se sabe. */
    enObra: string;
    /** Nombre de su obra o null (para no escribir «· tu obra» en un rótulo). */
    obra: string | null;
    /** id de su obra o null: decide qué llega a ella (`llegaASuObra`). */
    obraId: number | null;
    /**
     * Lo que llega a su obra: primero lo que ya salió (en camino o con una parte recibida), después lo aprobado; las más
     * antiguas primero. Nada que salga de su obra (devoluciones, traslados) ni lo que va a otra obra.
     */
    porRecibir: ListaObra;
    /** Aprobado o en camino que NO llega a su obra (devoluciones, traslados, lo pedido para otra obra): sin «Recibir». */
    fuera: ListaObra;
    /** Pedidas que esperan aprobación (todas las suyas, vayan donde vayan), las más antiguas primero. */
    esperando: ListaObra;
    /** Recibidas en su obra, la más nueva primero (TODAS las que vinieron; la vista muestra `TOPE_HISTORIAL`). */
    historial: SolicitudPerfil[];
    /** No aprobadas este mes, la más nueva primero. */
    rechazadas: ListaObra;
    /** «Esperando a Leonardo» (o «Esperando aprobación» si no se sabe quién aprueba). */
    tituloEsperando: string;
    circuito: DatosCircuito;
    /** true si todo lo que está en el circuito (en curso y recibido este mes) va a su obra. */
    todasASuObra: boolean;
    rotulos: RotulosCircuito;
    /** null si todo lo recibido calza con lo enviado. */
    diferencias: AvisoDiferencias | null;
}

const deEtapa = (lista: readonly SolicitudPerfil[], etapa: SolicitudPerfil['etapa']) => lista.filter(s => s.etapa === etapa);
const masNuevaPrimero = (fecha: (s: SolicitudPerfil) => string | null | undefined) =>
    (a: SolicitudPerfil, b: SolicitudPerfil) => (fecha(b) ?? '').localeCompare(fecha(a) ?? '');

export function modeloObra(datos: InventarioPerfilApi): ModeloObra {
    const obra = datos.obra?.nombre?.trim() || null;
    const obraId = datos.obra?.id ?? null;
    const enObra = obra ?? 'tu obra';
    const lista = datos.solicitudes ?? [];
    const llega = (s: SolicitudPerfil) => llegaASuObra(s, obraId);
    const quien = quienAprueba(datos.aprobadores);
    const enCurso = [...masAntiguasPrimero(deEtapa(lista, 'despachada')), ...masAntiguasPrimero(deEtapa(lista, 'aprobada'))];
    const porRecibir = enCurso.filter(llega);
    const fuera = enCurso.filter(s => !llega(s));
    const enElCircuito = lista.filter(s => s.etapa !== 'rechazada' && (s.etapa !== 'recibida' || s.del_mes));
    const todasASuObra = obra != null && enElCircuito.every(llega);
    const circuito = datosCircuito(datos.circuito);
    return {
        enObra,
        obra,
        obraId,
        porRecibir: conTope(porRecibir, TOPE_RECIBIR, filtroComun(porRecibir)),
        fuera: conTope(fuera, TOPE_FUERA, 'todas'),
        esperando: conTope(masAntiguasPrimero(deEtapa(lista, 'pedida')), TOPE_ESPERANDO, 'pendiente'),
        historial: deEtapa(lista, 'recibida').filter(llega).sort(masNuevaPrimero(s => s.recepcion?.fecha)),
        rechazadas: conTope(deEtapa(lista, 'rechazada').filter(s => s.del_mes).sort(masNuevaPrimero(s => s.rechazo?.fecha)),
            TOPE_RECHAZADAS, 'todas'),
        tituloEsperando: quien ? `Esperando a ${quien}` : 'Esperando aprobación',
        circuito,
        todasASuObra,
        rotulos: rotulosCircuito(circuito, obra, todasASuObra),
        diferencias: avisoDiferencias(datos.circuito.diferencias),
    };
}

/**
 * «1 diferencia sin aclarar» · «Lo que llegó no calza con lo enviado · la más antigua, hace 14 días». Con varias
 * solicitudes, «… en 2 solicitudes …» y abre sus recibidas (desde el Inicio no alcanzaría las otras).
 */
export function avisoDiferencias(d: CircuitoPerfil['diferencias']): AvisoDiferencias | null {
    const n = d.items || 0;
    if (n <= 0) return null;
    const solicitudes = d.total || 0;
    const dias = d.dias ?? null;
    const cuando = dias == null ? '' : dias <= 0 ? ' · la más antigua es de hoy' : ` · la más antigua, hace ${textoDias(dias)}`;
    const varias = solicitudes > 1;
    return {
        items: n,
        titulo: `${n} ${plural(n, 'diferencia sin aclarar', 'diferencias sin aclarar')}`,
        bajada: `Lo que llegó no calza con lo enviado${varias ? ` en ${solicitudes} solicitudes` : ''}${cuando}`,
        // Las diferencias solo nacen al cerrar la recepción: la solicitud está «recibida».
        ruta: !varias && d.mas_antigua_id ? rutaSolicitud({ id: d.mas_antigua_id, estado: 'recibida' }) : rutaLista('recibida'),
    };
}

// ─────────────────────────────── Botón «Recibir» ───────────────────────────────

/** El texto de «Recibir» (botón grande): «2 llegan a Domeyko» / «Nada en camino». */
export const textoRecibir = (n: number, enObra: string): string =>
    (n > 0 ? `${n} ${plural(n, 'llega', 'llegan')} a ${enObra}` : 'Nada en camino');

export interface BotonRecibir {
    /** «Recibir», o «Lo que llega» sin el permiso de recibir. */
    titulo: string;
    texto: string;
    /** Verde de acción solo si puede recibir; sin el permiso, neutro (no hay nada que hacer ahí). */
    accion: boolean;
    etiqueta: string;
    /** La nota del bloque de lo que llega. */
    nota: string;
    /** La acción de cada fila por recibir. */
    accionFila: string;
}

/** El botón grande y lo que dice el bloque de lo que llega, con o sin `inventario.transferencias.recibir`. */
export function botonRecibir(n: number, enObra: string, puedeRecibir: boolean): BotonRecibir {
    const titulo = puedeRecibir ? 'Recibir' : 'Lo que llega';
    const texto = textoRecibir(n, enObra);
    return {
        titulo,
        texto,
        accion: puedeRecibir,
        etiqueta: n > 0 ? `${titulo}: ${texto}` : `${titulo}: nada en camino. Abre lo que ya llegó`,
        nota: puedeRecibir ? 'Cuando llegue, tócala y confirma lo que llegó' : 'Quien recibe en obra confirma lo que llegó',
        accionFila: puedeRecibir ? 'Recibir' : 'Ver',
    };
}

/** Sin nada en camino, «Recibir» abre lo último que llegó (la lista de aprobadas estaría vacía). */
export const RUTA_RECIBIR_VACIO = rutaLista('recibida');

// ─────────────────────────────── Botones grandes ───────────────────────────────

/** Un botón grande de arriba. No hay uno de aprobar (ver `botonesGrandes`). */
export type BotonGrande = 'pedir' | 'recibir';

/**
 * Qué botones grandes se ofrecen arriba, en orden:
 *   - «Pedir materiales», solo si puede pedir (`puede.solicitar` = `solicitar` o `solicitud_materiales`). Sin el permiso
 *     (un prevencionista que solo recibe) no va: `RUTA_PEDIR` abriría Inventario sin el asistente (TransferenciasPanel
 *     lo abre solo con permiso de pedir) y un botón verde que no pide nada engaña. No queda neutro como «Lo que llega»
 *     (`botonRecibir` sin `recibir`) porque ese sí muestra algo, lo que viene a su obra; un «Pedir» neutro no lleva a nada.
 *   - «Recibir» (sin `recibir`, «Lo que llega» y neutro), siempre.
 * Nunca uno de aprobar, aunque quien mira tenga `aprobar` (un rol de obra hecho a mano, sin `ver_todas`): la vista de
 * obra no aprueba ni mira `puede.aprobar` / `puede_aprobar`; aprobar se hace en Inventario.
 */
export function botonesGrandes(puede: PuedePerfil): BotonGrande[] {
    return puede.solicitar ? ['pedir', 'recibir'] : ['recibir'];
}

// ─────────────────────────────── Textos de las filas ───────────────────────────────

/** Lo que llega: con la cantidad que sale (lo aprobado, si se registró); sin los ítems cortados a 0. «A ×1 y B ×2». */
export function itemsQueLlegan(s: Pick<SolicitudPerfil, 'items' | 'codigo'>, max = 3): string {
    const salen = s.items.filter(i => i.enviada !== 0);
    const lista = (salen.length ? salen : s.items).map(i => ({ descripcion: i.descripcion, unidad: i.unidad, pedida: i.enviada ?? i.pedida }));
    return fraseItems(lista, { max }) || s.codigo;
}

/** Lo que se pidió (esperando, no aprobadas): «Cemento ×40 sacos y Arena gruesa ×3 m³». */
export const itemsPedidos = (s: Pick<SolicitudPerfil, 'items' | 'codigo'>, max = 2): string => fraseItems(s.items, { max }) || s.codigo;

/** Estado de una fila por recibir: la píldora y el círculo. */
export function estadoPorRecibir(s: Pick<SolicitudPerfil, 'estado' | 'etapa'>): { texto: string; tono: TonoTarjeta; enCamino: boolean } {
    if (s.estado === 'recepcion_parcial') return { texto: 'Llegó una parte', tono: 'azul', enCamino: true };
    if (s.etapa === 'despachada') return { texto: 'En camino', tono: 'azul', enCamino: true };
    return { texto: 'Aprobada', tono: 'verde', enCamino: false };
}

/** «Aprobó Leonardo el 18 oct» (o lo que haya: «Aprobó Leonardo», «Aprobada el 18 oct»); null si no se registró. */
export function textoAprobo(s: Pick<SolicitudPerfil, 'aprobacion'>, { minuscula = false }: { minuscula?: boolean } = {}): string | null {
    const quien = nombreCortoDe(s.aprobacion?.por);
    const fecha = fechaCorta(s.aprobacion?.fecha);
    const texto = quien && fecha ? `Aprobó ${quien} el ${fecha}` : quien ? `Aprobó ${quien}` : fecha ? `Aprobada el ${fecha}` : null;
    return texto && minuscula ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

const unir = (partes: readonly (string | null | false | undefined)[]) => partes.filter(Boolean).join(' · ');

/**
 * El origen como lo dice la fila: «Bodega Cerrillos» o, si la aprobación sacó de varios lugares (`origenes_extra`),
 * «Bodega Cerrillos y 1 lugar más» (la cabecera guarda solo el principal). null sin origen.
 */
export function textoOrigen(s: Pick<SolicitudPerfil, 'origen' | 'origenes_extra'>): string | null {
    const origen = nombreLugar(s.origen);
    if (!origen) return null;
    const extra = Math.max(0, Math.trunc(Number(s.origenes_extra) || 0));
    return extra > 0 ? `${origen} y ${extra} ${plural(extra, 'lugar', 'lugares')} más` : origen;
}

/** «llegó una parte el 20 oct» (solo con una recepción parcial). */
function textoParte(s: SolicitudPerfil): string | null {
    if (s.estado !== 'recepcion_parcial') return null;
    const fecha = fechaCorta(s.ultima_recepcion?.fecha);
    return fecha ? `llegó una parte el ${fecha}` : 'llegó una parte';
}

/**
 * La línea chica de una fila por recibir (lienzo A):
 *   - en camino: «Salió de Paraguay el 21 oct» (el origen y la fecha, si se registró; si no, quién aprobó). Sin «despachó
 *     X»: don Luis (2026-10-23) dejó a bodegueros y conductores fuera del ciclo de solicitud;
 *   - con una parte recibida, además «llegó una parte el 20 oct»;
 *   - aprobada: «Aprobó Leonardo el 18 oct · sale de Bodega Cerrillos».
 * Con varios orígenes: «Salió de Paraguay y 1 lugar más, el 21 oct» / «sale de Bodega Cerrillos y 1 lugar más».
 */
export function lineaPorRecibir(s: SolicitudPerfil): string {
    const origen = textoOrigen(s);
    if (s.etapa === 'despachada') {
        const fecha = fechaCorta(s.despacho?.fecha);
        const coma = s.origenes_extra ? ',' : '';
        const salida = origen ? (fecha ? `Salió de ${origen}${coma} el ${fecha}` : `Salió de ${origen}`) : fecha ? `Salió el ${fecha}` : null;
        // Sin fecha de salida registrada: lo que sí quedó, la aprobación.
        const respaldo = !fecha ? textoAprobo(s, { minuscula: !!salida }) : null;
        return unir([salida, respaldo, textoParte(s)]);
    }
    return unir([textoAprobo(s), origen && `sale de ${origen}`]);
}

/**
 * La línea chica de lo que NO llega a su obra (sin «Recibir»): adónde va y en qué va.
 * «Devolución a Bodega Cerrillos · aprobó Leonardo el 19 oct», «Traslado a Gorbea 3082 · salió el 21 oct».
 */
export function lineaFuera(s: SolicitudPerfil, obraId: number | null): string {
    const fecha = fechaCorta(s.despacho?.fecha);
    const paso = textoParte(s)
        ?? (s.etapa === 'despachada' ? (fecha ? `salió el ${fecha}` : 'en camino') : textoAprobo(s, { minuscula: true }) ?? 'aprobada');
    return unir([adondeVa(s, obraId), paso]);
}

/** La línea chica del historial: «desde Bodega Cerrillos · aprobó Leonardo el 6 oct». */
export function lineaHistorial(s: SolicitudPerfil): string {
    const origen = textoOrigen(s);
    return unir([origen && `desde ${origen}`, textoAprobo(s, { minuscula: true })]);
}

const mismaCantidad = (a: number, b: number) => Math.abs(a - b) < 0.0001;

/**
 * La píldora del historial, con lo que la app registra como diferencia:
 *   - rojo «Faltaron 2 sacos» si un ítem del CATÁLOGO llegó distinto (lo mismo que anota transferencia_discrepancias, de
 *     donde sale el aviso «N diferencias sin aclarar»);
 *   - «Llegó completa» si TODOS los ítems tienen lo que llegó anotado y calza con lo enviado;
 *   - si no (null, sin píldora): un ítem personalizado sin anotar. Su contador parte en 0 al recibir y antes del
 *     2026-06-15 ni se guardaba, así que un 0 no es «faltó todo» (y no genera diferencia).
 */
export function pildoraHistorial(s: Pick<SolicitudPerfil, 'items'>): { texto: string; tono: TonoTarjeta } | null {
    const distinto = llegoDistinto({ items: s.items.filter(i => !i.personalizado) });
    if (distinto) return { texto: distinto.texto, tono: 'rojo' };
    const completa = s.items.length > 0
        && s.items.every(i => i.enviada != null && i.recibida != null && mismaCantidad(i.enviada, i.recibida));
    return completa ? { texto: 'Llegó completa', tono: 'neutro' } : null;
}

/** La píldora de una pedida que espera: «6 días esperando» (ámbar; de 31 días en adelante, rojo) o «de hoy». */
export function pildoraEsperando(dias: number): { texto: string; tono: TonoTarjeta } {
    return {
        texto: dias <= 0 ? 'de hoy' : `${textoDias(dias)} esperando`,
        tono: dias >= 8 ? tonoDias(dias) : 'ambar',
    };
}

/** «pedida el 16 oct» (vacío si no se registró la fecha). */
export const textoPedida = (s: Pick<SolicitudPerfil, 'fecha_solicitud'>): string =>
    (fechaCorta(s.fecha_solicitud) ? `pedida el ${fechaCorta(s.fecha_solicitud)}` : '');

/** La línea de una pedida que espera: «pedida el 16 oct»; si no va a su obra, antes adónde va («Devolución a …»). */
export function lineaEsperando(s: SolicitudPerfil, obraId: number | null): string {
    return unir([!llegaASuObra(s, obraId) && adondeVa(s, obraId), textoPedida(s)]);
}

/** Una no aprobada: «Taladro percutor ×2», «, el 10 oct.» y el motivo que escribió quien la rechazó (o null). */
export function textoRechazo(s: SolicitudPerfil): { items: string; cuando: string; motivo: string | null } {
    const fecha = fechaCorta(s.rechazo?.fecha);
    return {
        items: itemsPedidos(s),
        cuando: fecha ? `, el ${fecha}.` : '.',
        motivo: s.rechazo?.motivo?.trim() || null,
    };
}

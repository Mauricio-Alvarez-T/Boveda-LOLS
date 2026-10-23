import type { TonoTarjeta } from '../tarjetaActiva';
import {
    TIPO, diasEntre, enLista, fechaConDia, fechaCorta, fraseItems, iniciales, nombreCorto, nombreDe, nombreLugar, numero,
    plural, porRecibirCircuito, quienAprueba, rutaDiferencia, rutaLista, rutaSolicitud, textoDias, textoDiferencia,
    type FiltroInventario,
} from './formato';
import type {
    CircuitoPerfil, DiferenciaPerfil, EstadoSolicitudPerfil, InventarioPerfilApi, ItemPerfil, PasoPerfil, PersonaPerfil,
    SolicitudPerfil,
} from './tipos';

/**
 * Lógica PURA de VistaSuperAdmin (detalle «Inventario» del Inicio de Marcos y Mauricio, rol 1; diseño «Super
 * Administrador» de la opción A del lienzo, Marcos 2026-10-22). Test en `superadmin.modelo.test.ts`.
 *
 * Don Luis (2026-10-23): bodegueros y conductores fuera del ciclo de solicitud. Aquí no hay «Despachada», ni caja
 * «Bodega», ni paso «Despachar», ni «despachó» en lo último que pasó: lo que el servidor manda en tránsito o con una
 * parte recibida va en «Aprobadas · por recibir».
 *
 * Arma, SOLO con lo que trae GET /transferencias/inicio/perfil (contrato en tipos.ts):
 *   - el circuito de todas las obras (Pedida → Aprobada → Recibida) con las cifras exactas del servidor (Aprobada =
 *     aprobadas + en tránsito, `porRecibirCircuito`);
 *   - «Quién tiene qué»: lo pendiente de quien aprueba (nombre de `aprobadores`), de las obras (solo lo que va a una obra)
 *     y de quien investiga las diferencias (la respuesta no dice quién tiene `diferencias_ver`: va el rótulo
 *     «Jefatura»). Las diferencias cuentan SOLICITUDES, como la tarjeta, VistaLeonardo y VistaJefatura;
 *   - «Lo último que pasó»: una fila por cosa registrada (pidió, aprobó, no aprobó, recibió), por día;
 *   - «Secuencia completa · cada solicitud»: los pasos de cada una (quién y cuándo), el de ahora y a quién le toca,
 *     agrupadas en cinco pasos que no se pisan. Una devolución o un traslado los recibe el destino, no quien pidió.
 * Lo que la app NO guarda no aparece: los WhatsApp de jefatura no quedan registrados; un ítem fuera del catálogo
 * (personalizado) no deja diferencia, así que no hay «diferencia revisada» para él. Nunca dinero.
 */

/** Espacio que no se corta: la flecha nunca queda sola en otra línea, «hace 2 días» no se parte. */
const NB = String.fromCharCode(160);
const FLECHA = `${NB}↓`;
const sinCortes = (texto: string) => texto.replace(/ /g, NB);

/** «Todas»: cuántas de cada paso a la vista desde 768 px (en el celular, 1). */
export const TOPE_GRUPO = 2;
/** En una pestaña, en el celular: las 3 primeras de toda la pestaña (desde 768 px, todas). */
export const TOPE_SEC_CEL = 3;
/** Al desplegar (o en una pestaña), filas por paso a lo más; el resto, en Inventario. */
export const TOPE_GRUPO_ABIERTO = 50;
/** «Lo último que pasó»: filas que se dibujan cerrado (el alto las corta) y abierto (se desliza por dentro). */
export const TOPE_ULTIMO_CERRADO = 30;
export const TOPE_ULTIMO = 150;

/** Sin nombres en la respuesta: rótulos genéricos (nunca un nombre fijo). */
export const QUIEN_APRUEBA = 'Quien aprueba';
/** La respuesta no trae quién tiene `diferencias_ver` (Daphne): este rótulo va en su lugar. */
export const JEFATURA = 'Jefatura';

/** Cómo terminó una recibida (la casilla final). */
export const FIN_COMPLETA = 'Llegó completa';
export const FIN_REVISADA = 'Diferencia revisada';
/** Un ítem del catálogo llegó distinto y no se sabe si su diferencia sigue pendiente (sin la lista, o cortada). */
export const FIN_CON_DIFERENCIA = 'Llegó con diferencia';
/** Un ítem fuera del catálogo llegó distinto: la app no le registra diferencia (no hay nada que revisar). */
export const FIN_DISTINTO = 'Llegó distinto';
/** La app no sabe cuánto llegó de algún ítem: no se dice «completa». */
export const FIN_RECIBIDA = 'Recibida';
/** Lo que va bajo un ítem fuera del catálogo que llegó distinto. */
export const SIN_DIFERENCIA_REGISTRADA = 'Sin diferencia registrada.';

// ─────────────────────────────── Pasos y pestañas ───────────────────────────────

/**
 * En qué paso está cada solicitud: cinco grupos que no se pisan. Sin «En camino» (don Luis 2026-10-23): lo que va en
 * tránsito o con una parte recibida está en «aprobada» (por recibir).
 */
export type Grupo = 'aprobar' | 'aprobada' | 'dif' | 'completa' | 'rechazada';
/** Pestañas de la secuencia: «Recibidas» junta las que llegaron con diferencia y las que llegaron completas. */
export type FiltroSec = 'todas' | 'aprobar' | 'aprobada' | 'recibidas' | 'rechazada';
/** Adónde lleva un toque dentro de la vista: una pestaña de la secuencia o, dentro de «Todas», un paso. */
export interface Destino { filtro: FiltroSec; grupo?: Grupo }

export interface GrupoSec {
    key: Grupo;
    /** Rótulo (singular, plural). */
    texto: [string, string];
    filtro: Exclude<FiltroSec, 'todas'>;
    /** Color del punto del rótulo (su significado). */
    tono: TonoTarjeta;
    /** El filtro de Inventario → Solicitudes donde está el resto. */
    lista: FiltroInventario;
}

/** Los pasos en el orden del circuito (lienzo: GRUPOS). */
export const GRUPOS: readonly GrupoSec[] = [
    { key: 'aprobar', texto: ['Por aprobar', 'Por aprobar'], filtro: 'aprobar', tono: 'ambar', lista: 'pendiente' },
    { key: 'aprobada', texto: ['Aprobada · por recibir', 'Aprobadas · por recibir'], filtro: 'aprobada', tono: 'ambar', lista: 'aprobada' },
    { key: 'dif', texto: ['Recibida con diferencia', 'Recibidas con diferencia'], filtro: 'recibidas', tono: 'rojo', lista: 'discrepancias' },
    { key: 'completa', texto: ['Recibida · llegó completa', 'Recibidas · llegaron completas'], filtro: 'recibidas', tono: 'verde', lista: 'recibida' },
    { key: 'rechazada', texto: ['No aprobada', 'No aprobadas'], filtro: 'rechazada', tono: 'neutro', lista: 'todas' },
];

/**
 * El rótulo de «completas» cuando alguna de ese paso no se sabe si llegó completa (la app no anotó cuánto llegó de
 * algún ítem): no se afirma lo que la app no registró.
 */
export const TEXTO_SIN_DIFERENCIA: [string, string] = ['Recibida · sin diferencia registrada', 'Recibidas · sin diferencia registrada'];

/** Los grupos que muestra una pestaña («Todas»: los cinco). `lista`: los del modelo (`ModeloSuperAdmin.grupos`). */
export const gruposDe = (filtro: FiltroSec, lista: readonly GrupoSec[] = GRUPOS): GrupoSec[] =>
    lista.filter(g => filtro === 'todas' || g.filtro === filtro);

/** «Por aprobar · 6», «Recibidas · llegaron completas · 2» (la cifra va pegada: si no cabe, baja junto). */
export const rotuloGrupo = (g: GrupoSec, n: number): string => `${plural(n, g.texto[0], g.texto[1])} ·${NB}${n}`;

/**
 * Cuántas filas de un paso se dibujan: en «Todas» cerrada, 2 (el celular esconde la 2.ª); desplegada o en una
 * pestaña, todas hasta 50. `resto` = las que no se dibujan y quedan en Inventario (solo desplegada o en pestaña).
 */
export function filasDelGrupo(n: number, { enTodas, desplegada }: { enTodas: boolean; desplegada: boolean }): { vista: number; resto: number } {
    if (enTodas && !desplegada) return { vista: Math.min(n, TOPE_GRUPO), resto: 0 };
    const vista = Math.min(n, TOPE_GRUPO_ABIERTO);
    return { vista, resto: n - vista };
}

// ─────────────────────────────── Nombres ───────────────────────────────

/**
 * Primeros nombres para una frase («Leonardo o Ana»). Si dos de la misma lista comparten el primero («Juan Pérez» y
 * «Juan Soto»), esos van completos: «Juan Pérez o Juan Soto», no «Juan o Juan».
 */
export function nombresCortos(nombres: readonly string[]): string[] {
    const cortos = nombres.map(nombreCorto);
    return nombres.map((n, i) => (cortos.filter(c => c === cortos[i]).length > 1 ? n.trim() : cortos[i]));
}

/** Quién aprueba, con los nombres de `datos.aprobadores` (nunca fijos). */
export interface QuienApruebaSA {
    /** «Leonardo López» (uno), «Leonardo o Ana» (dos); null sin nadie o con más de dos. */
    nombre: string | null;
    /** «Leonardo» / «Leonardo o Ana» (para «esperan a Leonardo»); null igual que arriba. */
    corto: string | null;
    /** Iniciales si es uno solo (el círculo de su caja); si no, va un ícono. */
    iniciales: string | null;
    /** Cuántos aprueban (con nombre): conjuga «aprobó» / «aprobaron». */
    cuantos: number;
    /** Sus ids: lo que «aprobó en octubre» cuenta solo lo de ellos (no lo del Super Administrador). */
    ids: number[];
}

export function quienApruebaDe(aprobadores?: readonly PersonaPerfil[] | null): QuienApruebaSA {
    const lista = aprobadores ?? [];
    const conNombre = lista.filter(p => !!nombreDe(p));
    const uno = conNombre.length === 1 ? nombreDe(conNombre[0]) : null;
    const nombres = conNombre.map(p => nombreDe(p) as string);
    const corto = nombres.length === 2 ? nombresCortos(nombres).join(' o ') : quienAprueba(conNombre);
    return { nombre: uno ?? corto, corto, iniciales: uno ? iniciales(uno) : null, cuantos: conNombre.length, ids: lista.map(p => p.id) };
}

// ─────────────────────────────── Devoluciones y traslados ───────────────────────────────

type ConLugares = Pick<SolicitudPerfil, 'tipo_flujo' | 'origen' | 'destino'>;

/** Va a una obra (lo único que cuenta la caja «Obras»): el destino es una obra y no es una devolución. */
export const vaAUnaObra = (s: ConLugares): boolean => s.destino?.tipo === 'obra' && s.tipo_flujo !== 'devolucion';

/**
 * La recibe el destino, no quien pidió: lo que va a una bodega (una devolución) y un traslado entre obras (lo pide la
 * obra de origen). En un pedido normal recibe quien pidió.
 */
export const recibeElDestino = (s: ConLugares): boolean =>
    s.destino?.tipo === 'bodega' || s.tipo_flujo === 'devolucion' || s.tipo_flujo === 'intra_obra';

/** «Bodega Cerrillos (Juan Pérez)» si va a una bodega; «Gorbea 3082» en un traslado; si no, quien pidió. */
export function quienRecibe(s: ConLugares & Pick<SolicitudPerfil, 'solicitante'>): string {
    if (s.destino?.tipo === 'bodega') return nombreLugar(s.destino, { conResponsable: true }) ?? 'La bodega';
    if (recibeElDestino(s)) return nombreLugar(s.destino) ?? 'El destino';
    return nombreDe(s.solicitante) ?? nombreLugar(s.destino) ?? 'La obra';
}

/** La nota de «Recibir» cuando lo recibe el destino. */
export const NOTA_DESTINO = 'lo confirma quien recibe en el destino';

/** Una devolución o un traslado con los dos lugares: «Domeyko → Bodega Cerrillos»; si no, null. */
function ruta(s: ConLugares): string | null {
    if (s.tipo_flujo !== 'devolucion' && s.tipo_flujo !== 'intra_obra') return null;
    const origen = nombreLugar(s.origen);
    const destino = nombreLugar(s.destino);
    return origen && destino ? `${origen} → ${destino}` : null;
}

/** Cómo se nombra cada solicitud en «Lo último que pasó» (según `tipo_flujo`). */
function frasesDe(s: Pick<SolicitudPerfil, 'tipo_flujo' | 'origen' | 'destino' | 'tipo'>): { pidio: [string, string]; cual: string } {
    const destino = nombreLugar(s.destino) ?? 'su destino';
    const origen = nombreLugar(s.origen);
    if (s.tipo_flujo === 'devolucion') {
        const que = origen ? `devolver a ${destino} desde ${origen}` : `devolver a ${destino}`;
        return { pidio: [`pidió ${que}`, `Se pidió ${que}`], cual: origen ? `la devolución de ${origen} a ${destino}` : `la devolución a ${destino}` };
    }
    if (s.tipo_flujo === 'intra_obra') {
        const tramo = origen ? `de ${origen} a ${destino}` : `a ${destino}`;
        return { pidio: [`pidió trasladar ${s.tipo} ${tramo}`, `Se pidió trasladar ${s.tipo} ${tramo}`], cual: `el traslado ${tramo}` };
    }
    return { pidio: [`pidió ${s.tipo} para ${destino}`, `Se pidieron ${s.tipo} para ${destino}`], cual: `la solicitud de ${destino}` };
}

// ─────────────────────────────── Lo que se juntó de la respuesta ───────────────────────────────

/** Una solicitud con sus diferencias pendientes (de `datos.diferencias`). */
interface Registro {
    s: SolicitudPerfil;
    difs: DiferenciaPerfil[];
    /** No vino en `solicitudes` (recibida hace tiempo: la lista trae las del mes y las 10 últimas), solo en `diferencias`. */
    soloDiferencia: boolean;
}

/**
 * Una solicitud que vino SOLO en `diferencias` (su recepción quedó fuera de la lista): se arma con lo que trae la
 * diferencia (código, origen → destino, quién aprobó y recibió, y cuándo). Quién pidió y cuándo no
 * vienen: ese paso dice «sin datos aquí». Sus ítems son los que tienen diferencia (del catálogo: solo esos la dejan).
 */
export function solicitudDesdeDiferencias(difs: readonly DiferenciaPerfil[]): SolicitudPerfil {
    const d = difs[0];
    return {
        id: d.transferencia_id,
        codigo: d.codigo,
        estado: 'recibida',
        etapa: 'recibida',
        tipo_flujo: null,
        tipo: 'herramientas',
        origen: d.origen,
        destino: d.destino,
        solicitante: null,
        propia: false,
        fecha_solicitud: null,
        aprobacion: d.aprobacion,
        despacho: d.despacho,
        recepcion: d.recepcion,
        ultima_recepcion: null,
        rechazo: null,
        dias: d.dias,
        del_mes: false,
        puede_aprobar: null,
        bloqueo_aprobar: null,
        items: difs.map(x => ({
            clave: `d${x.id}`, personalizado: false, descripcion: x.descripcion, unidad: x.unidad, pedida: x.enviada,
            enviada: x.enviada, recibida: x.recibida,
        })),
    };
}

function registrosDe(datos: Pick<InventarioPerfilApi, 'solicitudes' | 'diferencias'>): Registro[] {
    const difsPor = new Map<number, DiferenciaPerfil[]>();
    for (const d of datos.diferencias ?? []) difsPor.set(d.transferencia_id, [...(difsPor.get(d.transferencia_id) ?? []), d]);
    const enLaLista = new Set(datos.solicitudes.map(s => s.id));
    const solas = [...difsPor.entries()]
        .filter(([id]) => !enLaLista.has(id))
        .map(([, difs]): Registro => ({ s: solicitudDesdeDiferencias(difs), difs, soloDiferencia: true }));
    return [
        ...datos.solicitudes.map((s): Registro => ({ s, difs: difsPor.get(s.id) ?? [], soloDiferencia: false })),
        ...solas,
    ];
}

const cifraDistinta = (a: number, b: number) => Math.round((a - b) * 10_000) !== 0;
/** Llegó distinto de lo enviado (las dos cifras anotadas). */
const distinto = (i: ItemPerfil) => i.enviada != null && i.recibida != null && cifraDistinta(i.enviada, i.recibida);
/**
 * La app no sabe cuánto llegó: `recibida` null, o un ítem fuera del catálogo en 0 con algo enviado (RecibirForm parte
 * su contador en 0 y antes del 2026-06-15 ni se guardaba: ese 0 no es «no llegó nada»; la misma regla de VistaObra).
 */
const sinAnotar = (i: ItemPerfil) => i.recibida == null || (i.personalizado && i.recibida === 0 && (i.enviada ?? 0) > 0);
/** Del catálogo y llegaron distinto: dejan diferencia (recibir() la anota en transferencia_discrepancias, por item_id). */
const delCatalogoDistintos = (s: SolicitudPerfil) => s.items.filter(i => !i.personalizado && distinto(i));
/** Fuera del catálogo (personalizados) y llegaron distinto: la app NO les registra diferencia. */
const personalizadosDistintos = (s: SolicitudPerfil) => s.items.filter(i => i.personalizado && !sinAnotar(i) && distinto(i));

/**
 * El paso de una solicitud (los cinco no se pisan). En tránsito o con una parte recibida: «aprobada» (por recibir).
 * Recibida: con diferencia si tiene alguna pendiente o llegó distinto.
 */
function grupoDe({ s, difs }: Registro): Grupo {
    switch (s.estado) {
        case 'pendiente': return 'aprobar';
        case 'aprobada':
        case 'en_transito':
        case 'recepcion_parcial': return 'aprobada';
        case 'rechazada': return 'rechazada';
        default:
            return difs.length > 0 || delCatalogoDistintos(s).length > 0 || personalizadosDistintos(s).length > 0 ? 'dif' : 'completa';
    }
}

/** Fecha del último paso registrado ('' si ninguno): dentro de cada paso, lo que se movió último va arriba. */
const ultimoPaso = (s: SolicitudPerfil): string =>
    [s.fecha_solicitud, s.aprobacion?.fecha, s.ultima_recepcion?.fecha, s.recepcion?.fecha, s.rechazo?.fecha]
        .filter((f): f is string => !!f).sort().pop() ?? '';
const AVANCE: Record<EstadoSolicitudPerfil, number> = {
    pendiente: 0, aprobada: 1, rechazada: 1, en_transito: 2, recepcion_parcial: 2, recibida: 3,
};

// ─────────────────────────────── Cómo llegó una recibida ───────────────────────────────

/** Lo que llegó distinto en un ítem, como va bajo «Recibió». */
export interface DifCasilla {
    clave: string;
    /** «Faltan 3 unidades» / «Llegó 1 unidad de más» (pendiente) · «Faltaron 3 unidades» (ya revisada o sin registro). */
    pildora: string;
    tono: TonoTarjeta;
    /** «Salieron 12, llegaron 9. La anotó al recibir.»; con varios ítems, con el nombre delante. */
    texto: string;
}

/** «Salieron 12, llegaron 9.» (con `nombre`: «Andamio: salieron 12, llegaron 9.»). */
function salieronLlegaron(enviada: number, recibida: number, nombre?: string): string {
    const frase = `${plural(enviada, 'alió', 'alieron')} ${numero(enviada)}, ${plural(recibida, 'llegó', 'llegaron')} ${numero(recibida)}.`;
    return nombre ? `${nombre}: s${frase}` : `S${frase}`;
}

interface Llegada {
    lista: DifCasilla[];
    /** Hay diferencias pendientes (en `diferencias`): la casilla final es «resolver la diferencia». */
    pendientes: boolean;
    /** Alguna pendiente es un faltante (rojo); si no, sobrante (ámbar). */
    falta: boolean;
    /** Sin pendientes: cómo se cerró (FIN_*). */
    fin: string;
    /** Lo que va en el pie del evento «recibió» (ítem por ítem y, al final, si se revisó o no se registra). */
    pie: string[];
}

/**
 * Cómo llegó una recibida, con lo que la app registró:
 *   - con diferencias pendientes (`diferencias`): esas, en rojo o ámbar;
 *   - un ítem del CATÁLOGO que llegó distinto y ya no está pendiente: «Diferencia revisada» (si vino la lista completa;
 *     si no, «Llegó con diferencia»: no se sabe);
 *   - un ítem fuera del catálogo que llegó distinto: «Llegó distinto» y «Sin diferencia registrada» (la app no se la
 *     anota: nadie la revisó);
 *   - si de algún ítem no se sabe cuánto llegó (o no hay ítems): «Recibida», sin «completa»;
 *   - si no, «Llegó completa».
 */
function llegadaDe({ s, difs }: Registro, conocidas: boolean): Llegada {
    const varios = s.items.length > 1;
    if (difs.length > 0) {
        return {
            pendientes: true,
            falta: difs.some(d => d.diferencia > 0),
            fin: FIN_CON_DIFERENCIA,
            lista: difs.map(d => ({
                clave: `d${d.id}`,
                pildora: textoDiferencia(d.diferencia, d.unidad),
                tono: d.diferencia > 0 ? 'rojo' : 'ambar',
                texto: `${salieronLlegaron(d.enviada, d.recibida, varios ? d.descripcion : undefined)} La anotó al recibir.`,
            })),
            pie: difs.map(x => `${x.descripcion}: ${textoDiferencia(x.diferencia, x.unidad, { minuscula: true })}`),
        };
    }
    const catalogo = delCatalogoDistintos(s);
    const personalizados = personalizadosDistintos(s);
    const falto = (i: ItemPerfil, opciones: { minuscula?: boolean } = {}) =>
        textoDiferencia((i.enviada ?? 0) - (i.recibida ?? 0), i.unidad, { pasado: true, ...opciones });
    const casilla = (i: ItemPerfil, nota?: string): DifCasilla => ({
        clave: i.clave,
        pildora: falto(i),
        tono: 'neutro',
        texto: [salieronLlegaron(i.enviada ?? 0, i.recibida ?? 0, varios ? i.descripcion : undefined), nota].filter(Boolean).join(' '),
    });
    const pieItem = (i: ItemPerfil) => `${i.descripcion}: ${falto(i, { minuscula: true })}`;
    const fin = catalogo.length > 0 ? (conocidas ? FIN_REVISADA : FIN_CON_DIFERENCIA)
        : personalizados.length > 0 ? FIN_DISTINTO
            : s.items.length === 0 || s.items.some(sinAnotar) ? FIN_RECIBIDA : FIN_COMPLETA;
    const cierre = catalogo.length > 0 ? (conocidas ? ['ya revisada'] : []) : personalizados.length > 0 ? ['sin diferencia registrada'] : [];
    return {
        pendientes: false,
        falta: false,
        fin,
        lista: [...catalogo.map(i => casilla(i)), ...personalizados.map(i => casilla(i, SIN_DIFERENCIA_REGISTRADA))],
        pie: [...catalogo.map(pieItem), ...personalizados.map(pieItem), ...cierre],
    };
}

// ─────────────────────────────── Pasos de una solicitud ───────────────────────────────

/**
 * Una casilla de la secuencia (lienzo: Casilla): lo hecho (verbo, nombre, fecha y un dato chico), el paso de ahora
 * (a quién le toca y hace cuánto), lo que falta (punteado), lo que la app no registró (`sin`: «Pidió · sin datos
 * aquí»), el final («Llegó completa» / «Sin aprobar») o nada (para que las columnas calcen fila con fila).
 */
export interface Casilla {
    tipo: 'hecho' | 'ahora' | 'falta' | 'sin' | 'fin' | 'nada';
    verbo: string;
    quien?: string;
    /** «22 oct». */
    fecha?: string;
    /** Dato chico bajo el nombre: el rol de quien pidió, el lugar de donde sale. */
    extra?: string;
    /** En «ahora»: hace cuánto. */
    detalle?: string;
    /** Lo chico de abajo (en «ahora», «falta» y «sin»). */
    nota?: string;
    tono?: TonoTarjeta;
    /** Color del punto de un paso hecho: rojo (no aprobada o faltó) o ámbar (llegó de más). */
    punto?: TonoTarjeta;
    motivo?: string;
    difs?: DifCasilla[];
    /** «fin»: check verde (cerrada) o prohibido gris (no aprobada). */
    completa?: boolean;
}

const NADA: Casilla = { tipo: 'nada', verbo: '' };

/** Lo que la vista necesita saber de afuera para armar los pasos. */
interface Contexto {
    /** «Leonardo López», «Leonardo o Ana» o «Quien aprueba». */
    aprueba: string;
    /** Quien investiga las diferencias (hoy siempre «Jefatura»: la respuesta no lo trae). */
    investiga: string;
    /** Vino la lista `diferencias` completa (sin ella, o cortada, no se sabe si una diferencia sigue pendiente). */
    conocidas: boolean;
}

/** Un paso registrado, o null si la app no guardó ni quién ni cuándo. */
function hecho(verbo: string, paso: PasoPerfil | null | undefined, extra?: string | null): Casilla | null {
    const quien = nombreDe(paso?.por);
    const fecha = fechaCorta(paso?.fecha);
    if (!quien && !fecha) return null;
    return { tipo: 'hecho', verbo, quien: quien ?? undefined, fecha: fecha || undefined, extra: extra?.trim() || undefined };
}
const sinDatos = (verbo: string): Casilla => ({ tipo: 'sin', verbo, nota: 'sin datos aquí' });
const haceDias = (dias: number) => (dias <= 0 ? 'de hoy' : sinCortes(`hace ${textoDias(dias)}`));

/** Cuántas casillas tiene cada fila (las columnas calzan fila con fila desde 768 px). */
export const CASILLAS = 4;

/**
 * Pidió → Aprobó → Recibió → (si hay diferencia pendiente) resolverla. Cuatro casillas siempre. Sin «Despachó» ni
 * «Despachar» (don Luis 2026-10-23: bodegueros y conductores fuera del ciclo de solicitud): lo aprobado, también lo que
 * el servidor manda en tránsito, espera que lo reciban.
 */
function casillasDe(r: Registro, ctx: Contexto): Casilla[] {
    const { s } = r;
    const pidio = hecho('Pidió', { por: s.solicitante, fecha: s.fecha_solicitud }, s.solicitante?.rol) ?? sinDatos('Pidió');
    const alDestino = recibeElDestino(s);
    if (s.estado === 'pendiente') {
        return [pidio,
            { tipo: 'ahora', verbo: 'aprobar', quien: ctx.aprueba, tono: s.dias > 30 ? 'rojo' : 'ambar',
                detalle: s.dias <= 0 ? 'pedida hoy' : `${textoDias(s.dias)} esperando` },
            { tipo: 'falta', verbo: 'Recibir' }, NADA];
    }
    if (s.estado === 'rechazada') {
        const no: Casilla = {
            tipo: 'hecho', verbo: 'No aprobó', quien: nombreDe(s.rechazo?.por) ?? undefined,
            fecha: fechaCorta(s.rechazo?.fecha) || undefined, punto: 'rojo', motivo: s.rechazo?.motivo?.trim() || undefined,
        };
        const cerrada: Casilla = { tipo: 'fin', verbo: 'Cerrada', quien: 'Sin aprobar', completa: false };
        // Si había sido aprobada antes, la app guarda quién (sin fecha: el rechazo la pisa). Es un paso registrado.
        const antes = s.aprobacion?.por ? hecho('Aprobó', { por: s.aprobacion.por, fecha: null }, 'sin fecha') : null;
        return antes ? [pidio, antes, no, cerrada] : [pidio, no, cerrada, NADA];
    }
    const origen = nombreLugar(s.origen);
    const recibida = s.estado === 'recibida';
    // De dónde sale va bajo «Aprobó» (lo decide la aprobación).
    const aprobo = hecho('Aprobó', s.aprobacion, origen ? `${recibida ? 'salió' : 'sale'} de ${origen}` : null) ?? sinDatos('Aprobó');
    if (!recibida) {
        // Por recibir (aprobada, en tránsito o con una parte recibida): recibe quien pidió; en una devolución o un
        // traslado, el destino.
        const quien = quienRecibe(s);
        const nota = alDestino ? NOTA_DESTINO : undefined;
        if (s.estado === 'recepcion_parcial') {
            const parte = fechaCorta(s.ultima_recepcion?.fecha);
            return [pidio, aprobo,
                { tipo: 'ahora', verbo: 'recibir lo que falta', quien, tono: 'azul', detalle: parte ? `llegó una parte el ${parte}` : haceDias(s.dias), nota },
                NADA];
        }
        return [pidio, aprobo, { tipo: 'ahora', verbo: 'recibir', quien, tono: 'azul', detalle: haceDias(s.dias), nota }, NADA];
    }
    const d = llegadaDe(r, ctx.conocidas);
    const recibio: Casilla = {
        ...(hecho('Recibió', s.recepcion) ?? { tipo: 'hecho', verbo: 'Recibió' }),
        difs: d.lista.length ? d.lista : undefined,
        punto: d.pendientes ? (d.falta ? 'rojo' : 'ambar') : undefined,
    };
    if (d.pendientes) {
        const dias = Math.max(...r.difs.map(x => x.dias));
        // En la app lo pendiente es que quien aprueba la resuelva; jefatura la investiga (por WhatsApp: no queda guardado).
        return [pidio, aprobo, recibio,
            {
                tipo: 'ahora', verbo: 'resolver la diferencia', quien: ctx.aprueba, tono: d.falta ? 'rojo' : 'ambar',
                detalle: dias <= 0 ? 'anotada hoy' : `${textoDias(dias)} sin resolver`, nota: `${ctx.investiga} la investiga`,
            }];
    }
    return [pidio, aprobo, recibio, { tipo: 'fin', verbo: 'Cerrada', quien: d.fin, completa: true }];
}

/** «aprobar · Leonardo López»: el paso de ahora y a quién le toca (null si ya se cerró). */
export function ahoraDe(casillas: readonly Casilla[]): string | null {
    const c = casillas.find(x => x.tipo === 'ahora');
    return c ? [c.verbo, c.quien].filter(Boolean).join(' · ') : null;
}

/** En el celular lo que falta no se dibuja: se nombra al final («Después: recibir.»). */
export function despuesDe(casillas: readonly Casilla[]): string | null {
    const faltan = casillas.filter(c => c.tipo === 'falta').map(c => (c.nota ? `${c.verbo.toLowerCase()} (${c.nota})` : c.verbo.toLowerCase()));
    return faltan.length ? `Después: ${enLista(faltan)}.` : null;
}

/** Una solicitud con su secuencia completa (lienzo: FilaSecuencia). */
export interface FilaSec {
    id: number;
    codigo: string;
    grupo: Grupo;
    /** Obra (o bodega) de destino; en una devolución o un traslado, «Domeyko → Bodega Cerrillos»; sin ella, el código. */
    lugar: string;
    /** «Extintor PQS 6 kg ×3 y Botiquín ×1». */
    items: string;
    /** «Materiales» / «Herramientas» / «Devolución» / «Traslado»; null si solo vino la diferencia (no se sabe). */
    tipo: string | null;
    casillas: Casilla[];
    /** «aprobar · Leonardo López» (null si está cerrada). */
    ahora: string | null;
    /** «Después: recibir.» (celular). */
    despues: string | null;
    /** «Ver»: la diferencia pendiente se abre en Inventario → Diferencias; lo demás, la solicitud. */
    ruta: string;
    etiquetaRuta: string;
    /** Con una diferencia por resolver (va primero en su paso). */
    porResolver: boolean;
    soloDiferencia: boolean;
}

const TIPO_FLUJO: Partial<Record<NonNullable<SolicitudPerfil['tipo_flujo']>, string>> = { devolucion: 'Devolución', intra_obra: 'Traslado' };

function filaSec(r: Registro, ctx: Contexto): FilaSec {
    const { s } = r;
    const casillas = casillasDe(r, ctx);
    const porResolver = r.difs.length > 0;
    return {
        id: s.id,
        codigo: s.codigo,
        grupo: grupoDe(r),
        lugar: ruta(s) ?? nombreLugar(s.destino) ?? s.codigo,
        items: (r.soloDiferencia
            ? fraseItems(s.items, { formato: i => i.descripcion?.trim() || 'Ítem sin nombre' })
            : fraseItems(s.items)) || 'Sin ítems registrados',
        tipo: r.soloDiferencia ? null : (s.tipo_flujo && TIPO_FLUJO[s.tipo_flujo]) || (TIPO[s.tipo] ?? TIPO.materiales),
        casillas,
        ahora: ahoraDe(casillas),
        despues: despuesDe(casillas),
        ruta: porResolver ? rutaDiferencia(s.id) : rutaSolicitud(s),
        etiquetaRuta: porResolver ? `Ver la diferencia de ${s.codigo}` : `Ver la solicitud ${s.codigo}`,
        porResolver,
        soloDiferencia: r.soloDiferencia,
    };
}

// ─────────────────────────────── Lo último que pasó ───────────────────────────────

/** Lo que se registra en el ciclo de solicitud (sin «despachó»: don Luis 2026-10-23). */
export type AccionEvento = 'pidio' | 'aprobo' | 'rechazo' | 'recibio' | 'recibio_parte';
export type IconoEvento = 'pidio' | 'aprobo' | 'rechazo' | 'recibio' | 'faltante' | 'sobrante';

/** Una cosa que la app registró (lienzo: MOVIMIENTOS). La diferencia se anota AL recibir: va en esa misma fila. */
export interface Evento {
    clave: string;
    /** 'YYYY-MM-DD'. */
    fecha: string;
    accion: AccionEvento;
    solicitudId: number;
    porId: number | null;
    /** Quién lo hizo; null si la app no lo guardó (entonces `frase` va sola, impersonal: «Se aprobó…»). */
    quien: string | null;
    /** Con `quien`: lo que va después del nombre («aprobó la solicitud de Gorbea 3082»). */
    frase: string;
    /** «TRF-202610-0032 · sale de Bodega Cerrillos». */
    pie: string;
    tono: TonoTarjeta;
    icono: IconoEvento;
}

/** Dentro del mismo día, lo que va después en el circuito primero. */
const ORDEN_ACCION: Record<AccionEvento, number> = { pidio: 0, aprobo: 1, rechazo: 1, recibio_parte: 2, recibio: 2 };

function eventosDeRegistro(r: Registro, conocidas: boolean): Evento[] {
    const { s } = r;
    const lugar = nombreLugar(s.destino) ?? 'su destino';
    const origen = nombreLugar(s.origen);
    const { pidio, cual } = frasesDe(s);
    const ev = (accion: AccionEvento, paso: PasoPerfil | null | undefined, con: string, sin: string,
        pie: string, tono: TonoTarjeta, icono: IconoEvento): Evento[] => {
        if (!paso?.fecha) return [];
        const quien = nombreDe(paso.por);
        return [{
            clave: `${s.id}-${accion}`, fecha: paso.fecha.slice(0, 10), accion, solicitudId: s.id, porId: paso.por?.id ?? null,
            quien, frase: quien ? con : sin, pie, tono, icono,
        }];
    };
    const recibio = (): Evento[] => {
        if (s.estado !== 'recibida') return [];
        const d = llegadaDe(r, conocidas);
        if (d.lista.length === 0) {
            return ev('recibio', s.recepcion, `recibió en ${lugar}`, `Se recibió en ${lugar}`,
                d.fin === FIN_COMPLETA ? `${s.codigo} · llegó completa` : s.codigo, 'neutro', 'recibio');
        }
        // «con diferencia» solo si la app la registró (catálogo); un ítem fuera del catálogo «llegó distinto».
        const registrada = d.pendientes || d.fin !== FIN_DISTINTO;
        const tono: TonoTarjeta = d.pendientes ? (d.falta ? 'rojo' : 'ambar') : 'neutro';
        return ev('recibio', s.recepcion,
            registrada ? `recibió en ${lugar} con diferencia` : `recibió en ${lugar}`,
            registrada ? `Se recibió en ${lugar} con diferencia` : `Se recibió en ${lugar}`,
            [s.codigo, ...d.pie].join(' · '), tono,
            d.pendientes ? (d.falta ? 'faltante' : 'sobrante') : 'recibio');
    };
    return [
        ...ev('pidio', { por: s.solicitante, fecha: s.fecha_solicitud }, pidio[0], pidio[1],
            `${s.codigo} · ${fraseItems(s.items, { max: 1 }) || 'sin ítems'}`, 'neutro', 'pidio'),
        ...(s.estado === 'rechazada'
            ? ev('rechazo', s.rechazo, `no aprobó ${cual}`, `No se aprobó ${cual}`,
                s.rechazo?.motivo?.trim() ? `${s.codigo} · «${s.rechazo.motivo.trim()}»` : s.codigo, 'rojo', 'rechazo')
            : ev('aprobo', s.aprobacion, `aprobó ${cual}`, `Se aprobó ${cual}`,
                origen ? `${s.codigo} · sale de ${origen}` : s.codigo, 'neutro', 'aprobo')),
        ...(s.estado === 'recepcion_parcial'
            ? ev('recibio_parte', s.ultima_recepcion, `recibió una parte en ${lugar}`, `Se recibió una parte en ${lugar}`, s.codigo, 'neutro', 'recibio')
            : []),
        ...recibio(),
    ];
}

/** Lo más nuevo arriba; en el mismo día, lo que va después en el circuito primero. */
function ordenarEventos(eventos: Evento[]): Evento[] {
    return [...eventos].sort((a, b) =>
        b.fecha.localeCompare(a.fecha) || ORDEN_ACCION[b.accion] - ORDEN_ACCION[a.accion] || b.solicitudId - a.solicitudId);
}

export interface DiaEventos { fecha: string; rotulo: string; eventos: Evento[] }

/** «Hoy · jue 22 oct», «Ayer · mié 21 oct», «mar 20 oct». */
export function rotuloDia(fecha: string, hoy: string): string {
    const base = fechaConDia(fecha);
    const atras = diasEntre(fecha, hoy);
    return atras === 0 ? `Hoy · ${base}` : atras === 1 ? `Ayer · ${base}` : base;
}

/** Los eventos (ya ordenados) agrupados por día, en el mismo orden. */
export function porDia(eventos: readonly Evento[], hoy: string): DiaEventos[] {
    const dias: DiaEventos[] = [];
    for (const e of eventos) {
        const ultimo = dias[dias.length - 1];
        if (ultimo && ultimo.fecha === e.fecha) ultimo.eventos.push(e);
        else dias.push({ fecha: e.fecha, rotulo: rotuloDia(e.fecha, hoy), eventos: [e] });
    }
    return dias;
}

/** «Ver los 42»: lo que se dibuja abierto, a lo más `TOPE_ULTIMO` (el resto, en Inventario). */
export const textoVerUltimo = (n: number): string => `Ver los ${Math.min(n, TOPE_ULTIMO)}`;

// ─────────────────────────────── Lo del mes ───────────────────────────────

const MESES_LARGOS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** '2026-10-22' → «octubre» (vacío si no es una fecha). */
export function mesDe(hoy: string): string {
    const m = /^\d{4}-(\d{2})-\d{2}/.exec(hoy.trim());
    const mes = m ? Number(m[1]) : 0;
    return mes >= 1 && mes <= 12 ? MESES_LARGOS[mes - 1] : '';
}

export interface ConteosMes {
    /** «octubre». */
    mes: string;
    /** Aprobó y no aprobó quien aprueba (`ids`; sin ids, cualquiera). */
    aprobo: number;
    rechazo: number;
    /** Solicitudes pedidas este mes (en la lista). */
    pidio: number;
}

/**
 * Lo que hizo cada uno este mes, contado desde los eventos (salen de la lista: todas las en curso, las recibidas del
 * mes y las rechazadas del mes, así que lo del mes está completo salvo topes y canceladas). Sin despachos: no están en
 * el ciclo (don Luis 2026-10-23).
 */
export function conteosMes(eventos: readonly Evento[], hoy: string, idsAprueban: readonly number[] = []): ConteosMes {
    const inicio = `${hoy.slice(0, 7)}-01`;
    const delMes = eventos.filter(e => e.fecha >= inicio);
    const deQuienAprueba = (e: Evento) => idsAprueban.length === 0 || (e.porId != null && idsAprueban.includes(e.porId));
    return {
        mes: mesDe(hoy),
        aprobo: delMes.filter(e => e.accion === 'aprobo' && deQuienAprueba(e)).length,
        rechazo: delMes.filter(e => e.accion === 'rechazo' && deQuienAprueba(e)).length,
        pidio: delMes.filter(e => e.accion === 'pidio').length,
    };
}

// ─────────────────────────────── Circuito ───────────────────────────────

/** Pedida → Aprobada → Recibida (sin «Despachada»: don Luis 2026-10-23). */
export type PasoCircuito = 'pedida' | 'aprobada' | 'recibida';

/** Una etapa del circuito de todas las obras (lienzo: Circuito con las marcas del Super Administrador). */
export interface PasoCircuitoSA {
    key: PasoCircuito;
    texto: string;
    /** Cifra exacta del servidor (`circuito`). */
    total: number;
    /** Días de la más antigua (solo las en curso con alguna; desde 640 px, «hasta 9 días»). */
    hasta: number | null;
    tono: TonoTarjeta;
    /** Más grande, en su color y con anillo (las etapas en curso con alguna). */
    resaltar: boolean;
    bajada: string;
    /** Bajo 640 px. */
    bajadaCorta: string;
    /** Una línea chica más (Recibida: «y 1 de antes» = las de meses anteriores que trae la lista). */
    nota?: string;
    ir: Destino;
}

/** «hasta 9 días»; si la más antigua es de hoy, «de hoy». */
export const textoHasta = (dias: number): string => (dias <= 0 ? 'de hoy' : `hasta ${textoDias(dias)}`);

/**
 * «Pedida: 6, esperan a Leonardo, hasta 9 días» (sin la flecha), para el `aria-label` de la etapa: lleva TODO lo que
 * se ve (el `aria-label` reemplaza el texto visible para el lector de pantalla).
 */
export const etiquetaPaso = (p: PasoCircuitoSA): string =>
    [`${p.texto}: ${p.total}`, p.bajada.replace(/\s*↓/, ''), p.hasta !== null ? textoHasta(p.hasta) : '', p.nota ?? '']
        .filter(Boolean).join(', ');

/**
 * Las tres etapas con las cifras exactas del servidor. «Aprobada · por recibir» = aprobadas + en tránsito o con una
 * parte recibida (`porRecibirCircuito`), con los días de la más antigua de las dos.
 */
export function circuitoSuperAdmin(c: CircuitoPerfil, hoy: string, aprueba: Pick<QuienApruebaSA, 'corto'>, recibidasAntes = 0): PasoCircuitoSA[] {
    const mes = mesDe(hoy);
    const mesCorto = fechaCorta(hoy).split(' ')[1] ?? '';
    const enCurso = (total: number, dias: number | null) => (total > 0 ? dias ?? 0 : null);
    const p = c.pedida.total;
    const porRecibir = porRecibirCircuito(c);
    const a = porRecibir.total;
    return [
        {
            key: 'pedida', texto: 'Pedida', total: p, hasta: enCurso(p, c.pedida.dias), tono: p ? 'ambar' : 'neutro', resaltar: p > 0,
            bajada: p ? (aprueba.corto ? `${plural(p, 'espera', 'esperan')} a ${aprueba.corto}${FLECHA}` : `por aprobar${FLECHA}`) : 'al día',
            bajadaCorta: p ? (aprueba.corto ? `a ${aprueba.corto}${FLECHA}` : `por aprobar${FLECHA}`) : 'al día',
            ir: { filtro: 'aprobar' },
        },
        {
            key: 'aprobada', texto: 'Aprobada', total: a, hasta: enCurso(a, porRecibir.dias), tono: a ? 'ambar' : 'neutro', resaltar: a > 0,
            bajada: a ? `por recibir${FLECHA}` : 'nada por recibir', bajadaCorta: a ? `por recibir${FLECHA}` : 'nada por recibir',
            ir: { filtro: 'aprobada' },
        },
        {
            key: 'recibida', texto: 'Recibida', total: c.recibida.total, hasta: null, tono: 'neutro', resaltar: false,
            bajada: mes ? `en ${mes}${FLECHA}` : `este mes${FLECHA}`, bajadaCorta: mesCorto ? `en ${mesCorto}.${FLECHA}` : `este mes${FLECHA}`,
            nota: recibidasAntes > 0 ? `y ${recibidasAntes} de antes` : undefined,
            ir: { filtro: 'recibidas' },
        },
    ];
}

/**
 * Las diferencias, APARTE del circuito. Cuentan SOLICITUDES (`total`), como la tarjeta del Inicio, la pestaña
 * Diferencias, VistaLeonardo y VistaJefatura; si son más ítems, la bajada lo dice («… en 3 ítems»). null sin ninguna.
 */
export function avisoDiferencias(d: CircuitoPerfil['diferencias']): { n: number; titulo: string; bajada: string } | null {
    const items = d.items || 0;
    const n = d.total || (items > 0 ? 1 : 0);
    if (n <= 0) return null;
    const cuando = d.dias == null ? '' : d.dias <= 0 ? ' · la más antigua es de hoy' : ` · la más antigua, hace ${textoDias(d.dias)}`;
    return {
        n,
        titulo: `${n} ${plural(n, 'diferencia sin aclarar', 'diferencias sin aclarar')}`,
        bajada: `Lo que llegó no calza con lo enviado${items > n ? ` en ${items} ítems` : ''}${cuando}`,
    };
}

// ─────────────────────────────── Quién tiene qué ───────────────────────────────

export interface Responsable {
    /** Tres cajas (sin «Bodega»: don Luis 2026-10-23). */
    key: 'aprueba' | 'obras' | 'jefatura';
    nombre: string;
    /** Iniciales para el círculo; null = va el ícono de su rol. */
    iniciales: string | null;
    cifra: number;
    tono: TonoTarjeta;
    /** «por aprobar · la más antigua, 9 días». */
    linea: string;
    /** Lo que hizo este mes o una aclaración, chico. */
    nota: string;
    ir: Destino;
    /** Algo más que tiene pendiente (quien aprueba: las diferencias por resolver), con su propio enlace. */
    ademas?: { texto: string; ir: Destino };
}

/** Lo que dice la caja de una persona, también para el lector de pantalla (su `aria-label` reemplaza lo visible). */
export const etiquetaResponsable = (r: Pick<Responsable, 'nombre' | 'cifra' | 'linea' | 'nota'>): string =>
    `${r.nombre}: ${r.cifra}, ${r.linea}. ${r.nota} Ver en la secuencia`;

const laMasAntigua = (dias: number | null, { hace = false, prefijo = '' }: { hace?: boolean; prefijo?: string } = {}) =>
    (dias == null ? '' : dias <= 0 ? `la más antigua es de hoy` : `la más antigua, ${prefijo}${hace ? 'hace ' : ''}${textoDias(dias)}`);
const conLinea = (...partes: string[]) => partes.filter(Boolean).join(' · ');

export function responsablesDe(
    datos: Pick<InventarioPerfilApi, 'circuito' | 'diferencias'> & { solicitudes?: readonly SolicitudPerfil[] },
    conteos: ConteosMes,
    aprueba: QuienApruebaSA,
    investiga: string = JEFATURA,
): Responsable[] {
    const { pedida, recibida, diferencias } = datos.circuito;
    const enMes = conteos.mes ? `En ${conteos.mes}` : 'Este mes';
    // Solicitudes con diferencia (como la tarjeta y las otras vistas), no ítems.
    const difs = diferencias.total || (diferencias.items > 0 ? 1 : 0);
    const lista = datos.diferencias ?? [];
    const solicitudesCon = (pred: (d: DiferenciaPerfil) => boolean) => new Set(lista.filter(pred).map(d => d.transferencia_id)).size;
    const faltan = solicitudesCon(d => d.diferencia > 0);
    const sobran = solicitudesCon(d => d.diferencia < 0);

    // «Obras»: solo lo que va a una obra. Las cifras del circuito son exactas para todo; se les resta lo de la lista que
    // va a una bodega (las devoluciones), que recibe la bodega. «Por recibir» = aprobadas + en tránsito (sin caja
    // «Bodega» ni «por enviar»: don Luis 2026-10-23, bodegueros y conductores fuera del ciclo; lo que sale de una obra lo
    // recibe igual su destino: un traslado obra → obra cuenta aquí, en la obra que lo recibe).
    const enLaLista = datos.solicitudes ?? [];
    const porRecibirSol = (s: SolicitudPerfil) => s.estado === 'aprobada' || s.estado === 'en_transito' || s.estado === 'recepcion_parcial';
    const fuera = (pred: (s: SolicitudPerfil) => boolean) => enLaLista.filter(s => pred(s) && !vaAUnaObra(s)).length;
    const circuitoPorRecibir = porRecibirCircuito(datos.circuito);
    const porRecibir = Math.max(0, circuitoPorRecibir.total - fuera(porRecibirSol));
    const recibidasObra = Math.max(0, recibida.total - fuera(s => s.estado === 'recibida' && s.del_mes));
    const diasObras = datos.solicitudes
        ? enLaLista.filter(s => porRecibirSol(s) && vaAUnaObra(s)).reduce<number | null>((m, s) => (m == null || s.dias > m ? s.dias : m), null)
        : circuitoPorRecibir.dias;

    const notaAprueba = aprueba.cuantos === 1
        ? `${enMes} aprobó ${conteos.aprobo} y no aprobó ${conteos.rechazo}.`
        : aprueba.cuantos > 1
            ? `${enMes} aprobaron ${conteos.aprobo} y no aprobaron ${conteos.rechazo}.`
            : `${enMes}: ${conteos.aprobo} ${plural(conteos.aprobo, 'aprobada', 'aprobadas')} y ${conteos.rechazo} no ${plural(conteos.rechazo, 'aprobada', 'aprobadas')}.`;

    const lineaObras = porRecibir === 0
        ? 'nada por recibir'
        : conLinea(`${plural(porRecibir, 'aprobada', 'aprobadas')} por recibir`, laMasAntigua(diasObras));

    const detalleDifs = [
        faltan ? `${faltan} con ${plural(faltan, 'faltante', 'faltantes')}` : '',
        sobran ? `${sobran} con ${plural(sobran, 'sobrante', 'sobrantes')}` : '',
    ].filter(Boolean).join(' y ');

    return [
        {
            key: 'aprueba', nombre: aprueba.nombre ?? QUIEN_APRUEBA, iniciales: aprueba.iniciales, cifra: pedida.total, tono: 'ambar',
            linea: pedida.total ? conLinea('por aprobar', laMasAntigua(pedida.dias)) : 'nada por aprobar',
            nota: notaAprueba,
            ir: { filtro: 'aprobar' },
            ademas: difs ? { texto: `Además, ${difs} ${plural(difs, 'diferencia', 'diferencias')} por resolver`, ir: { filtro: 'recibidas' } } : undefined,
        },
        {
            key: 'obras', nombre: 'Obras', iniciales: null, cifra: porRecibir, tono: 'azul',
            linea: lineaObras,
            nota: `${enMes} pidieron ${conteos.pidio} y recibieron ${recibidasObra}.`,
            ir: { filtro: 'todas', grupo: 'aprobada' },
        },
        {
            key: 'jefatura', nombre: investiga, iniciales: null, cifra: difs, tono: 'rojo',
            linea: difs
                ? conLinea(`${plural(difs, 'diferencia', 'diferencias')} por investigar`, laMasAntigua(diferencias.dias, { hace: true }))
                : 'nada por investigar',
            nota: `${detalleDifs ? `${detalleDifs}. ` : ''}Sus WhatsApp no quedan guardados.`,
            ir: { filtro: 'recibidas' },
        },
    ];
}

/**
 * Con una obra elegida en el selector de arriba («Todas las Obras»): este detalle no se filtra (es de todas), y lo dice
 * (la misma nota de VistaJefatura). null sin obra elegida.
 */
export function notaObraElegida(obraElegida: string | null | undefined, lugar = 'todas las obras'): string | null {
    return obraElegida?.trim() ? `Aquí van ${lugar}: el selector de obra de arriba no filtra este detalle.` : null;
}

// ─────────────────────────────── Todo junto ───────────────────────────────

export interface OpcionFiltro { key: FiltroSec; texto: string; n: number }

/**
 * «Secuencia completa · cada solicitud» (SecuenciaCompleta.tsx): la usan VistaSuperAdmin y, desde 2026-10-23, VistaJefatura
 * (el dueño: a Daphne «le interesa tener el detalle en lo que va cada solicitud»). La arma `modeloSecuencia`.
 */
export interface ModeloSecuencia {
    /** Los cinco pasos con su rótulo (el de «completas» cambia si alguna no se sabe si llegó completa). */
    grupos: GrupoSec[];
    /** Las filas de cada paso, ya ordenadas (lo pendiente de resolver primero; después lo que se movió último). */
    porGrupo: Record<Grupo, FilaSec[]>;
    /** Pestañas con su cifra (de la lista). */
    filtros: OpcionFiltro[];
    /** Alguna lista vino cortada (el servidor la topó): lo que falta está en Inventario. */
    tope: { texto: string; ruta: string } | null;
}

export interface ModeloSuperAdmin extends ModeloSecuencia {
    /** Con `ver_todas` («todas las obras»). */
    todas: boolean;
    circuito: PasoCircuitoSA[];
    diferencias: ReturnType<typeof avisoDiferencias>;
    responsables: Responsable[];
    /** Todo lo registrado, lo más nuevo arriba. */
    eventos: Evento[];
}

/**
 * ¿El servidor cortó alguna lista? Se compara cada etapa con su cifra EXACTA del circuito (los topes, `limites`, son
 * por etapa): así se detecta un corte de verdad y no se avisa por sumar etapas. Las rechazadas del mes no tienen cifra
 * exacta: llegar a su tope cuenta como corte.
 */
export function listaCortada(datos: Pick<InventarioPerfilApi, 'circuito' | 'solicitudes' | 'diferencias' | 'limites'>): boolean {
    const c = datos.circuito;
    const cuenta = (pred: (s: SolicitudPerfil) => boolean) => datos.solicitudes.filter(pred).length;
    const rechazadas = datos.limites?.rechazadas;
    return c.pedida.total > cuenta(s => s.estado === 'pendiente')
        || c.aprobada.total > cuenta(s => s.estado === 'aprobada')
        || c.despachada.total > cuenta(s => s.estado === 'en_transito' || s.estado === 'recepcion_parcial')
        || c.recibida.total > cuenta(s => s.estado === 'recibida' && s.del_mes)
        || (!!rechazadas && cuenta(s => s.estado === 'rechazada') >= rechazadas)
        || (datos.diferencias != null && (c.diferencias.items || 0) > datos.diferencias.length);
}

/** Se sabe si una diferencia ya no está pendiente solo con la lista completa (vino y no se cortó). */
const diferenciasConocidas = (datos: Pick<InventarioPerfilApi, 'circuito' | 'diferencias'>): boolean =>
    datos.diferencias != null && (datos.circuito.diferencias.items || 0) <= datos.diferencias.length;

/** La secuencia de cada solicitud con lo ya juntado de la respuesta (lo comparten las dos funciones de abajo). */
function secuenciaDe(datos: InventarioPerfilApi, registros: Registro[], conocidas: boolean, aprueba: QuienApruebaSA): ModeloSecuencia {
    const ctx: Contexto = {
        aprueba: aprueba.nombre ?? QUIEN_APRUEBA,
        investiga: JEFATURA,
        conocidas,
    };
    const ordenados = [...registros].sort((a, b) =>
        Number(b.difs.length > 0) - Number(a.difs.length > 0)
        || ultimoPaso(b.s).localeCompare(ultimoPaso(a.s))
        || AVANCE[b.s.estado] - AVANCE[a.s.estado]
        || b.s.id - a.s.id);
    const filas = ordenados.map(r => filaSec(r, ctx));
    const porGrupo = Object.fromEntries(GRUPOS.map(g => [g.key, filas.filter(f => f.grupo === g.key)])) as Record<Grupo, FilaSec[]>;
    const sinVerificar = porGrupo.completa.some(f => f.casillas.some(c => c.tipo === 'fin' && c.quien !== FIN_COMPLETA));
    const grupos = GRUPOS.map(g => (g.key === 'completa' && sinVerificar ? { ...g, texto: TEXTO_SIN_DIFERENCIA } : g));
    const n = (...gs: Grupo[]) => gs.reduce((t, g) => t + porGrupo[g].length, 0);
    const recibidas = n('dif', 'completa');
    const filtros: OpcionFiltro[] = [
        { key: 'todas', texto: 'Todas', n: filas.length },
        { key: 'aprobar', texto: 'Por aprobar', n: n('aprobar') },
        { key: 'aprobada', texto: plural(n('aprobada'), 'Aprobada', 'Aprobadas'), n: n('aprobada') },
        { key: 'recibidas', texto: plural(recibidas, 'Recibida', 'Recibidas'), n: recibidas },
        { key: 'rechazada', texto: plural(n('rechazada'), 'No aprobada', 'No aprobadas'), n: n('rechazada') },
    ];
    return {
        grupos,
        porGrupo,
        filtros,
        tope: listaCortada(datos) ? { texto: 'La lista llegó a su tope: lo que no está aquí, en Inventario', ruta: rutaLista('todas') } : null,
    };
}

/**
 * Solo la «Secuencia completa · cada solicitud» (VistaJefatura la pone bajo lo suyo): la MISMA que arma `modeloSuperAdmin`
 * con estos datos, sin el circuito, «Quién tiene qué» ni «Lo último que pasó».
 */
export function modeloSecuencia(datos: InventarioPerfilApi): ModeloSecuencia {
    return secuenciaDe(datos, registrosDe(datos), diferenciasConocidas(datos), quienApruebaDe(datos.aprobadores));
}

export function modeloSuperAdmin(datos: InventarioPerfilApi): ModeloSuperAdmin {
    const registros = registrosDe(datos);
    const conocidas = diferenciasConocidas(datos);
    const eventos = ordenarEventos(registros.flatMap(r => eventosDeRegistro(r, conocidas)));
    const aprueba = quienApruebaDe(datos.aprobadores);
    // «Recibida» cuenta las de este mes (cifra exacta); la lista trae además las últimas de antes.
    const antes = registros.filter(r => r.s.estado === 'recibida' && !r.s.del_mes).length;
    return {
        todas: datos.alcance.todas,
        circuito: circuitoSuperAdmin(datos.circuito, datos.hoy, aprueba, antes),
        diferencias: avisoDiferencias(datos.circuito.diferencias),
        responsables: responsablesDe(datos, conteosMes(eventos, datos.hoy, aprueba.ids), aprueba),
        ...secuenciaDe(datos, registros, conocidas, aprueba),
        eventos,
    };
}

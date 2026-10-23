import type { TonoTarjeta } from '../tarjetaActiva';
import {
    TIPO, diasEntre, enLista, fechaConDia, fechaCorta, fraseItems, iniciales, nombreCorto, nombreDe, nombreLugar, numero,
    plural, quienAprueba, rutaDiferencia, rutaLista, rutaSolicitud, textoDias, textoDiferencia, type FiltroInventario,
} from './formato';
import type {
    CircuitoPerfil, DiferenciaPerfil, EstadoSolicitudPerfil, InventarioPerfilApi, LugarPerfil, PasoPerfil, PersonaPerfil,
    SolicitudPerfil,
} from './tipos';

/**
 * Lógica PURA de VistaSuperAdmin (detalle «Inventario» del Inicio de Marcos y Mauricio, rol 1; diseño «Super
 * Administrador» de la opción A del lienzo, Marcos 2026-10-22). Test en `superadmin.modelo.test.ts`.
 *
 * Arma, SOLO con lo que trae GET /transferencias/inicio/perfil (contrato en tipos.ts):
 *   - el circuito de todas las obras (Pedida → Aprobada → Despachada → Recibida) con las cifras exactas del servidor;
 *     «Despachada» se mantiene aunque la interfaz no tenga «Despachar» (casi siempre en 0: «sin despacho»);
 *   - «Quién tiene qué»: lo pendiente de quien aprueba (nombre de `aprobadores`), de bodega, de las obras y de quien
 *     investiga las diferencias (la respuesta no dice quién tiene `diferencias_ver`: va el rótulo «Jefatura»);
 *   - «Lo último que pasó»: una fila por cosa registrada (pidió, aprobó, no aprobó, despachó, recibió), por día;
 *   - «Secuencia completa · cada solicitud»: los pasos de cada una (quién y cuándo), el de ahora y a quién le toca,
 *     agrupadas en seis pasos que no se pisan.
 * Lo que la app NO guarda no aparece: los WhatsApp de jefatura no quedan registrados. Nunca dinero.
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

// ─────────────────────────────── Pasos y pestañas ───────────────────────────────

/** En qué paso está cada solicitud: seis grupos que no se pisan. */
export type Grupo = 'aprobar' | 'aprobada' | 'camino' | 'dif' | 'completa' | 'rechazada';
/** Pestañas de la secuencia: «Recibidas» junta las que llegaron con diferencia y las que llegaron completas. */
export type FiltroSec = 'todas' | 'aprobar' | 'aprobada' | 'camino' | 'recibidas' | 'rechazada';
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
    { key: 'aprobada', texto: ['Aprobada · aún sin salir', 'Aprobadas · aún sin salir'], filtro: 'aprobada', tono: 'ambar', lista: 'aprobada' },
    { key: 'camino', texto: ['En camino', 'En camino'], filtro: 'camino', tono: 'azul', lista: 'todas' },
    { key: 'dif', texto: ['Recibida con diferencia', 'Recibidas con diferencia'], filtro: 'recibidas', tono: 'rojo', lista: 'discrepancias' },
    { key: 'completa', texto: ['Recibida · llegó completa', 'Recibidas · llegaron completas'], filtro: 'recibidas', tono: 'verde', lista: 'recibida' },
    { key: 'rechazada', texto: ['No aprobada', 'No aprobadas'], filtro: 'rechazada', tono: 'neutro', lista: 'todas' },
];

/** Los grupos que muestra una pestaña («Todas»: los seis). */
export const gruposDe = (filtro: FiltroSec): GrupoSec[] => GRUPOS.filter(g => filtro === 'todas' || g.filtro === filtro);

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

// ─────────────────────────────── Quién aprueba ───────────────────────────────

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
    const corto = quienAprueba(conNombre);
    return { nombre: uno ?? corto, corto, iniciales: uno ? iniciales(uno) : null, cuantos: conNombre.length, ids: lista.map(p => p.id) };
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
 * diferencia (código, origen → destino, quién aprobó, despachó y recibió, y cuándo). Quién pidió y cuándo no
 * vienen: ese paso dice «sin datos aquí». Sus ítems son los que tienen diferencia.
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
    const enLista = new Set(datos.solicitudes.map(s => s.id));
    const solas = [...difsPor.entries()]
        .filter(([id]) => !enLista.has(id))
        .map(([, difs]): Registro => ({ s: solicitudDesdeDiferencias(difs), difs, soloDiferencia: true }));
    return [
        ...datos.solicitudes.map((s): Registro => ({ s, difs: difsPor.get(s.id) ?? [], soloDiferencia: false })),
        ...solas,
    ];
}

const cifraDistinta = (a: number, b: number) => Math.round((a - b) * 10_000) !== 0;
/** Ítems que llegaron distinto de lo enviado (también los de una diferencia ya revisada). */
const itemsDistintos = (s: SolicitudPerfil) =>
    s.items.filter(i => i.enviada != null && i.recibida != null && cifraDistinta(i.enviada, i.recibida));

/** El paso de una solicitud (las seis no se pisan). Recibida: con diferencia si tiene alguna pendiente o llegó distinto. */
function grupoDe({ s, difs }: Registro): Grupo {
    switch (s.estado) {
        case 'pendiente': return 'aprobar';
        case 'aprobada': return 'aprobada';
        case 'en_transito':
        case 'recepcion_parcial': return 'camino';
        case 'rechazada': return 'rechazada';
        default: return difs.length > 0 || itemsDistintos(s).length > 0 ? 'dif' : 'completa';
    }
}

/** Fecha del último paso registrado ('' si ninguno): dentro de cada paso, lo que se movió último va arriba. */
const ultimoPaso = (s: SolicitudPerfil): string =>
    [s.fecha_solicitud, s.aprobacion?.fecha, s.despacho?.fecha, s.ultima_recepcion?.fecha, s.recepcion?.fecha, s.rechazo?.fecha]
        .filter((f): f is string => !!f).sort().pop() ?? '';
const AVANCE: Record<EstadoSolicitudPerfil, number> = {
    pendiente: 0, aprobada: 1, rechazada: 1, en_transito: 2, recepcion_parcial: 2, recibida: 3,
};

// ─────────────────────────────── Pasos de una solicitud ───────────────────────────────

/** Lo que llegó distinto en un ítem, como va bajo «Recibió». */
export interface DifCasilla {
    clave: string;
    /** «Faltan 3 unidades» / «Llegó 1 unidad de más» (pendiente) · «Faltaron 3 unidades» (ya revisada). */
    pildora: string;
    tono: TonoTarjeta;
    /** «Salieron 12, llegaron 9. La anotó al recibir.»; con varios ítems, con el nombre delante. */
    texto: string;
}

/**
 * Una casilla de la secuencia (lienzo: Casilla): lo hecho (verbo, nombre, fecha y un dato chico), el paso de ahora
 * (a quién le toca y hace cuánto), lo que falta (punteado), lo que la app no registró (`sin`: «Sin despacho»), el
 * final («Llegó completa» / «No pasó a bodega») o nada (para que las columnas calcen fila con fila).
 */
export interface Casilla {
    tipo: 'hecho' | 'ahora' | 'falta' | 'sin' | 'fin' | 'nada';
    verbo: string;
    quien?: string;
    /** «22 oct». */
    fecha?: string;
    /** Dato chico bajo el nombre: el rol de quien pidió, la bodega de donde salió. */
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
    /** «fin»: check verde (cerrada bien) o prohibido gris (no pasó a bodega). */
    completa?: boolean;
}

const NADA: Casilla = { tipo: 'nada', verbo: '' };

/** Lo que la vista necesita saber de afuera para armar los pasos. */
interface Contexto {
    /** «Leonardo López», «Leonardo o Ana» o «Quien aprueba». */
    aprueba: string;
    /** Quien investiga las diferencias (hoy siempre «Jefatura»: la respuesta no lo trae). */
    investiga: string;
    /** Quiénes despachan desde ese origen (responsable de la bodega o quienes ya despacharon de ahí). */
    despachan: (origen: LugarPerfil | null) => string | null;
    /** Vino la lista `diferencias` (sin ella no se sabe si una diferencia sigue pendiente). */
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

/** «Salieron 12, llegaron 9.» (con `nombre`: «Andamio: salieron 12, llegaron 9.»). */
function salieronLlegaron(enviada: number, recibida: number, nombre?: string): string {
    const frase = `${plural(enviada, 'alió', 'alieron')} ${numero(enviada)}, ${plural(recibida, 'llegó', 'llegaron')} ${numero(recibida)}.`;
    return nombre ? `${nombre}: s${frase}` : `S${frase}`;
}

/** Lo que llegó distinto: las pendientes de `difs` o, si ya se revisaron, lo que dicen los ítems. */
function difsCasilla({ s, difs }: Registro): { lista: DifCasilla[]; pendientes: boolean; falta: boolean } {
    const varios = s.items.length > 1;
    if (difs.length > 0) {
        return {
            pendientes: true,
            falta: difs.some(d => d.diferencia > 0),
            lista: difs.map(d => ({
                clave: `d${d.id}`,
                pildora: textoDiferencia(d.diferencia, d.unidad),
                tono: d.diferencia > 0 ? 'rojo' : 'ambar',
                texto: `${salieronLlegaron(d.enviada, d.recibida, varios ? d.descripcion : undefined)} La anotó al recibir.`,
            })),
        };
    }
    return {
        pendientes: false,
        falta: false,
        lista: itemsDistintos(s).map(i => ({
            clave: i.clave,
            pildora: textoDiferencia((i.enviada ?? 0) - (i.recibida ?? 0), i.unidad, { pasado: true }),
            tono: 'neutro',
            texto: salieronLlegaron(i.enviada ?? 0, i.recibida ?? 0, varios ? i.descripcion : undefined),
        })),
    };
}

/** Pidió → Aprobó → Despachó → Recibió → (si hay diferencia pendiente) resolverla. Cinco casillas siempre. */
function casillasDe(r: Registro, ctx: Contexto): Casilla[] {
    const { s } = r;
    const pidio = hecho('Pidió', { por: s.solicitante, fecha: s.fecha_solicitud }, s.solicitante?.rol) ?? sinDatos('Pidió');
    if (s.estado === 'pendiente') {
        return [pidio,
            { tipo: 'ahora', verbo: 'aprobar', quien: ctx.aprueba, tono: s.dias > 30 ? 'rojo' : 'ambar',
                detalle: s.dias <= 0 ? 'pedida hoy' : `${textoDias(s.dias)} esperando` },
            { tipo: 'falta', verbo: 'Despachar' }, { tipo: 'falta', verbo: 'Recibir' }, NADA];
    }
    if (s.estado === 'rechazada') {
        return [pidio,
            {
                tipo: 'hecho', verbo: 'No aprobó', quien: nombreDe(s.rechazo?.por) ?? undefined,
                fecha: fechaCorta(s.rechazo?.fecha) || undefined, punto: 'rojo', motivo: s.rechazo?.motivo?.trim() || undefined,
            },
            { tipo: 'fin', verbo: 'Cerrada', quien: 'No pasó a bodega', completa: false }, NADA, NADA];
    }
    const origen = nombreLugar(s.origen);
    const aprobo = hecho('Aprobó', s.aprobacion) ?? sinDatos('Aprobó');
    if (s.estado === 'aprobada') {
        // La interfaz no tiene «Despachar»: la obra también la puede recibir directo (recibir() acepta aprobadas).
        return [pidio, aprobo,
            {
                tipo: 'ahora', verbo: s.origen?.tipo === 'obra' ? 'sale de la obra' : 'sale de bodega', quien: origen ?? 'Bodega', tono: 'ambar',
                detalle: [ctx.despachan(s.origen), haceDias(s.dias)].filter(Boolean).join(' · '),
            },
            { tipo: 'falta', verbo: 'Recibir', nota: 'la obra ya puede hacerlo' }, NADA];
    }
    const recibida = s.estado === 'recibida';
    // Sin despacho registrado (la interfaz no tiene «Despachar»): el paso se mantiene, en gris.
    const despacho: Casilla = hecho('Despachó', s.despacho, origen ? `desde ${origen}` : null)
        ?? { tipo: 'sin', verbo: 'Sin despacho', nota: recibida ? 'la obra recibió directo' : undefined };
    if (!recibida) {
        const quien = nombreDe(s.solicitante) ?? nombreLugar(s.destino) ?? 'La obra';
        if (s.estado === 'recepcion_parcial') {
            const parte = fechaCorta(s.ultima_recepcion?.fecha);
            return [pidio, aprobo, despacho,
                { tipo: 'ahora', verbo: 'recibir lo que falta', quien, tono: 'azul', detalle: parte ? `llegó una parte el ${parte}` : haceDias(s.dias) },
                NADA];
        }
        return [pidio, aprobo, despacho,
            {
                tipo: 'ahora', verbo: 'recibir', quien, tono: 'azul',
                detalle: s.despacho ? (s.dias <= 0 ? 'salió hoy' : `salió hace ${textoDias(s.dias)}`) : haceDias(s.dias),
            },
            NADA];
    }
    const d = difsCasilla(r);
    const recibio: Casilla = {
        ...(hecho('Recibió', s.recepcion) ?? { tipo: 'hecho', verbo: 'Recibió' }),
        difs: d.lista.length ? d.lista : undefined,
        punto: d.pendientes ? (d.falta ? 'rojo' : 'ambar') : undefined,
    };
    if (d.pendientes) {
        const dias = Math.max(...r.difs.map(x => x.dias));
        // En la app lo pendiente es que quien aprueba la resuelva; jefatura la investiga (por WhatsApp: no queda guardado).
        return [pidio, aprobo, despacho, recibio,
            {
                tipo: 'ahora', verbo: 'resolver la diferencia', quien: ctx.aprueba, tono: d.falta ? 'rojo' : 'ambar',
                detalle: dias <= 0 ? 'anotada hoy' : `${textoDias(dias)} sin resolver`, nota: `${ctx.investiga} la investiga`,
            }];
    }
    const fin = d.lista.length === 0 ? 'Llegó completa' : ctx.conocidas ? 'Diferencia revisada' : 'Llegó con diferencia';
    return [pidio, aprobo, despacho, recibio, { tipo: 'fin', verbo: 'Cerrada', quien: fin, completa: true }];
}

/** «aprobar · Leonardo López»: el paso de ahora y a quién le toca (null si ya se cerró). */
export function ahoraDe(casillas: readonly Casilla[]): string | null {
    const c = casillas.find(x => x.tipo === 'ahora');
    return c ? [c.verbo, c.quien].filter(Boolean).join(' · ') : null;
}

/** En el celular lo que falta no se dibuja: se nombra al final («Después: despachar y recibir.»). */
export function despuesDe(casillas: readonly Casilla[]): string | null {
    const faltan = casillas.filter(c => c.tipo === 'falta').map(c => (c.nota ? `${c.verbo.toLowerCase()} (${c.nota})` : c.verbo.toLowerCase()));
    return faltan.length ? `Después: ${enLista(faltan)}.` : null;
}

/** Una solicitud con su secuencia completa (lienzo: FilaSecuencia). */
export interface FilaSec {
    id: number;
    codigo: string;
    grupo: Grupo;
    /** Obra (o bodega) de destino; sin ella, el código. */
    lugar: string;
    /** «Extintor PQS 6 kg ×3 y Botiquín ×1». */
    items: string;
    /** «Materiales» / «Herramientas»; null si solo vino la diferencia (no se sabe). */
    tipo: string | null;
    casillas: Casilla[];
    /** «aprobar · Leonardo López» (null si está cerrada). */
    ahora: string | null;
    /** «Después: despachar y recibir.» (celular). */
    despues: string | null;
    /** «Ver»: la diferencia pendiente se abre en Inventario → Diferencias; lo demás, la solicitud. */
    ruta: string;
    etiquetaRuta: string;
    /** Con una diferencia por resolver (va primero en su paso). */
    porResolver: boolean;
    soloDiferencia: boolean;
}

function filaSec(r: Registro, ctx: Contexto): FilaSec {
    const { s } = r;
    const casillas = casillasDe(r, ctx);
    const porResolver = r.difs.length > 0;
    return {
        id: s.id,
        codigo: s.codigo,
        grupo: grupoDe(r),
        lugar: nombreLugar(s.destino) ?? s.codigo,
        items: (r.soloDiferencia
            ? fraseItems(s.items, { formato: i => i.descripcion?.trim() || 'Ítem sin nombre' })
            : fraseItems(s.items)) || 'Sin ítems registrados',
        tipo: r.soloDiferencia ? null : TIPO[s.tipo] ?? TIPO.materiales,
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

export type AccionEvento = 'pidio' | 'aprobo' | 'rechazo' | 'despacho' | 'recibio' | 'recibio_parte';
export type IconoEvento = 'pidio' | 'aprobo' | 'rechazo' | 'despacho' | 'recibio' | 'faltante' | 'sobrante';

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
const ORDEN_ACCION: Record<AccionEvento, number> = { pidio: 0, aprobo: 1, rechazo: 1, despacho: 2, recibio_parte: 3, recibio: 3 };

function eventosDeRegistro({ s, difs }: Registro): Evento[] {
    const lugar = nombreLugar(s.destino) ?? 'su destino';
    const origen = nombreLugar(s.origen);
    const ev = (accion: AccionEvento, paso: PasoPerfil | null | undefined, con: string, sin: string,
        pie: string, tono: TonoTarjeta, icono: IconoEvento): Evento[] => {
        if (!paso?.fecha) return [];
        const quien = nombreDe(paso.por);
        return [{
            clave: `${s.id}-${accion}`, fecha: paso.fecha.slice(0, 10), accion, solicitudId: s.id, porId: paso.por?.id ?? null,
            quien, frase: quien ? con : sin, pie, tono, icono,
        }];
    };
    const desde = origen ? ` desde ${origen}` : '';
    const recibio = (): Evento[] => {
        if (s.estado !== 'recibida') return [];
        const d = difsCasilla({ s, difs, soloDiferencia: false });
        if (d.lista.length === 0) {
            return ev('recibio', s.recepcion, `recibió en ${lugar}`, `Se recibió en ${lugar}`, `${s.codigo} · llegó completa`, 'neutro', 'recibio');
        }
        const detalle = d.pendientes
            ? difs.map(x => `${x.descripcion}: ${textoDiferencia(x.diferencia, x.unidad, { minuscula: true })}`)
            : itemsDistintos(s).map(i => `${i.descripcion}: ${textoDiferencia((i.enviada ?? 0) - (i.recibida ?? 0), i.unidad, { pasado: true, minuscula: true })}`);
        const tono: TonoTarjeta = d.pendientes ? (d.falta ? 'rojo' : 'ambar') : 'neutro';
        return ev('recibio', s.recepcion, `recibió en ${lugar} con diferencia`, `Se recibió en ${lugar} con diferencia`,
            [s.codigo, ...detalle, ...(d.pendientes ? [] : ['ya revisada'])].join(' · '), tono,
            d.pendientes ? (d.falta ? 'faltante' : 'sobrante') : 'recibio');
    };
    return [
        ...ev('pidio', { por: s.solicitante, fecha: s.fecha_solicitud }, `pidió ${s.tipo} para ${lugar}`, `Se pidieron ${s.tipo} para ${lugar}`,
            `${s.codigo} · ${fraseItems(s.items, { max: 1 }) || 'sin ítems'}`, 'neutro', 'pidio'),
        ...(s.estado === 'rechazada'
            ? ev('rechazo', s.rechazo, `no aprobó la solicitud de ${lugar}`, `No se aprobó la solicitud de ${lugar}`,
                s.rechazo?.motivo?.trim() ? `${s.codigo} · «${s.rechazo.motivo.trim()}»` : s.codigo, 'rojo', 'rechazo')
            : ev('aprobo', s.aprobacion, `aprobó la solicitud de ${lugar}`, `Se aprobó la solicitud de ${lugar}`,
                origen ? `${s.codigo} · sale de ${origen}` : s.codigo, 'neutro', 'aprobo')),
        ...ev('despacho', s.despacho, `despachó a ${lugar}${desde}`, `Se despachó a ${lugar}${desde}`, s.codigo, 'azul', 'despacho'),
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
    /** Despachos de este mes por persona, quien despachó último primero. */
    despachos: { nombre: string; n: number }[];
    /** Todos los despachos del mes (también los sin nombre). */
    totalDespachos: number;
}

/**
 * Lo que hizo cada uno este mes, contado desde los eventos (salen de la lista: todas las en curso, las recibidas del
 * mes y las rechazadas del mes, así que lo del mes está completo salvo topes y canceladas).
 */
export function conteosMes(eventos: readonly Evento[], hoy: string, idsAprueban: readonly number[] = []): ConteosMes {
    const inicio = `${hoy.slice(0, 7)}-01`;
    const delMes = ordenarEventos(eventos.filter(e => e.fecha >= inicio));
    const deQuienAprueba = (e: Evento) => idsAprueban.length === 0 || (e.porId != null && idsAprueban.includes(e.porId));
    const despachos: { nombre: string; n: number }[] = [];
    for (const e of delMes) {
        if (e.accion !== 'despacho' || !e.quien) continue;
        const ya = despachos.find(d => d.nombre === e.quien);
        if (ya) ya.n += 1;
        else despachos.push({ nombre: e.quien, n: 1 });
    }
    return {
        mes: mesDe(hoy),
        aprobo: delMes.filter(e => e.accion === 'aprobo' && deQuienAprueba(e)).length,
        rechazo: delMes.filter(e => e.accion === 'rechazo' && deQuienAprueba(e)).length,
        pidio: delMes.filter(e => e.accion === 'pidio').length,
        despachos,
        totalDespachos: delMes.filter(e => e.accion === 'despacho').length,
    };
}

/**
 * Quiénes despachan desde un origen: el responsable de la bodega (si la app lo tiene) o quienes ya despacharon desde
 * ahí, si son uno o dos: «Jhoan o Héctor» (en el orden de quién despachó último en cualquier bodega, el mismo de «En
 * octubre Jhoan despachó 3 y Héctor 4»). null si no se sabe.
 */
export function despachanDesde(eventos: readonly Evento[], registros: readonly { s: SolicitudPerfil }[]) {
    const origenDe = new Map(registros.map(r => [r.s.id, r.s.origen]));
    const clave = (l: LugarPerfil | null | undefined) => (l ? `${l.tipo}-${l.id}` : '');
    const despachos = ordenarEventos(eventos.filter(x => x.accion === 'despacho' && !!x.quien));
    const orden: string[] = [];
    const desde = new Map<string, Set<string>>();
    for (const e of despachos) {
        const quien = e.quien as string;
        if (!orden.includes(quien)) orden.push(quien);
        const k = clave(origenDe.get(e.solicitudId));
        if (k) desde.set(k, new Set([...(desde.get(k) ?? []), quien]));
    }
    return (origen: LugarPerfil | null): string | null => {
        if (origen?.tipo === 'bodega' && origen.responsable?.trim()) return origen.responsable.trim();
        const deAhi = desde.get(clave(origen));
        const nombres = deAhi ? orden.filter(n => deAhi.has(n)) : [];
        return nombres.length >= 1 && nombres.length <= 2 ? nombres.map(nombreCorto).join(' o ') : null;
    };
}

// ─────────────────────────────── Circuito ───────────────────────────────

export type PasoCircuito = 'pedida' | 'aprobada' | 'despachada' | 'recibida';

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

/** «Pedida: 6, esperan a Leonardo» (sin la flecha), para el `aria-label` de la etapa. */
export const etiquetaPaso = (p: PasoCircuitoSA): string =>
    `${p.texto}: ${p.total}, ${p.bajada.replace(/\s*↓/, '')}${p.nota ? `, ${p.nota}` : ''}`;

export function circuitoSuperAdmin(c: CircuitoPerfil, hoy: string, aprueba: Pick<QuienApruebaSA, 'corto'>, recibidasAntes = 0): PasoCircuitoSA[] {
    const mes = mesDe(hoy);
    const mesCorto = fechaCorta(hoy).split(' ')[1] ?? '';
    const enCurso = (total: number, dias: number | null) => (total > 0 ? dias ?? 0 : null);
    const p = c.pedida.total;
    const a = c.aprobada.total;
    const d = c.despachada.total;
    return [
        {
            key: 'pedida', texto: 'Pedida', total: p, hasta: enCurso(p, c.pedida.dias), tono: p ? 'ambar' : 'neutro', resaltar: p > 0,
            bajada: p ? (aprueba.corto ? `${plural(p, 'espera', 'esperan')} a ${aprueba.corto}${FLECHA}` : `por aprobar${FLECHA}`) : 'al día',
            bajadaCorta: p ? (aprueba.corto ? `a ${aprueba.corto}${FLECHA}` : `por aprobar${FLECHA}`) : 'al día',
            ir: { filtro: 'aprobar' },
        },
        {
            key: 'aprobada', texto: 'Aprobada', total: a, hasta: enCurso(a, c.aprobada.dias), tono: a ? 'ambar' : 'neutro', resaltar: a > 0,
            bajada: a ? `aún sin salir${FLECHA}` : 'todo salió', bajadaCorta: a ? `sin salir${FLECHA}` : 'todo salió',
            ir: { filtro: 'aprobada' },
        },
        {
            // Se mantiene aunque la interfaz no tenga «Despachar»: casi siempre en 0.
            key: 'despachada', texto: 'Despachada', total: d, hasta: enCurso(d, c.despachada.dias), tono: d ? 'azul' : 'neutro', resaltar: d > 0,
            bajada: d ? `en camino${FLECHA}` : 'sin despacho', bajadaCorta: d ? `en camino${FLECHA}` : 'sin despacho',
            ir: { filtro: 'camino' },
        },
        {
            key: 'recibida', texto: 'Recibida', total: c.recibida.total, hasta: null, tono: 'neutro', resaltar: false,
            bajada: mes ? `en ${mes}${FLECHA}` : `este mes${FLECHA}`, bajadaCorta: mesCorto ? `en ${mesCorto}.${FLECHA}` : `este mes${FLECHA}`,
            nota: recibidasAntes > 0 ? `y ${recibidasAntes} de antes` : undefined,
            ir: { filtro: 'recibidas' },
        },
    ];
}

/** Las diferencias, APARTE del circuito (cuenta ítems, como la vista de jefatura). null sin ninguna. */
export function avisoDiferencias(d: CircuitoPerfil['diferencias']): { n: number; titulo: string; bajada: string } | null {
    const n = d.items || 0;
    if (n <= 0) return null;
    const cuando = d.dias == null ? '' : d.dias <= 0 ? ' · la más antigua es de hoy' : ` · la más antigua, hace ${textoDias(d.dias)}`;
    return {
        n,
        titulo: `${n} ${plural(n, 'diferencia sin aclarar', 'diferencias sin aclarar')}`,
        bajada: `Lo que llegó no calza con lo enviado${cuando}`,
    };
}

// ─────────────────────────────── Quién tiene qué ───────────────────────────────

export interface Responsable {
    key: 'aprueba' | 'bodega' | 'obras' | 'jefatura';
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

const laMasAntigua = (dias: number | null, { hace = false, prefijo = '' }: { hace?: boolean; prefijo?: string } = {}) =>
    (dias == null ? '' : dias <= 0 ? `la más antigua es de hoy` : `la más antigua, ${prefijo}${hace ? 'hace ' : ''}${textoDias(dias)}`);
const conLinea = (...partes: string[]) => partes.filter(Boolean).join(' · ');

export function responsablesDe(
    datos: Pick<InventarioPerfilApi, 'circuito' | 'diferencias'>,
    conteos: ConteosMes,
    aprueba: QuienApruebaSA,
    investiga: string = JEFATURA,
): Responsable[] {
    const { pedida, aprobada, despachada, recibida, diferencias } = datos.circuito;
    const enMes = conteos.mes ? `En ${conteos.mes}` : 'Este mes';
    const difs = diferencias.items || 0;
    const lista = datos.diferencias ?? [];
    const faltan = lista.filter(d => d.diferencia > 0).length;
    const sobran = lista.filter(d => d.diferencia < 0).length;
    const porRecibir = aprobada.total + despachada.total;

    const notaAprueba = aprueba.cuantos === 1
        ? `${enMes} aprobó ${conteos.aprobo} y no aprobó ${conteos.rechazo}.`
        : aprueba.cuantos > 1
            ? `${enMes} aprobaron ${conteos.aprobo} y no aprobaron ${conteos.rechazo}.`
            : `${enMes}: ${conteos.aprobo} ${plural(conteos.aprobo, 'aprobada', 'aprobadas')} y ${conteos.rechazo} no ${plural(conteos.rechazo, 'aprobada', 'aprobadas')}.`;

    const nombrados = conteos.despachos;
    const notaBodega = conteos.totalDespachos === 0
        ? `${enMes} no se registró ningún despacho.`
        : nombrados.length > 0 && nombrados.length <= 3 && nombrados.reduce((n, d) => n + d.n, 0) === conteos.totalDespachos
            ? `${enMes} ${enLista(nombrados.map((d, i) => `${nombreCorto(d.nombre)}${i === 0 ? ' despachó' : ''} ${d.n}`))}.`
            : `${enMes} se ${plural(conteos.totalDespachos, 'registró', 'registraron')} ${conteos.totalDespachos} ${plural(conteos.totalDespachos, 'despacho', 'despachos')}.`;

    const enCamino = despachada.total;
    const lineaObras = porRecibir === 0
        ? 'nada por recibir'
        : `por recibir · ${enLista([
            enCamino ? `${enCamino} en camino` : '',
            aprobada.total ? `${aprobada.total} ${plural(aprobada.total, 'aprobada que ya puede', 'aprobadas que ya pueden')} recibir` : '',
        ].filter(Boolean))}`;

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
            key: 'bodega', nombre: 'Bodega', iniciales: null, cifra: aprobada.total, tono: 'ambar',
            linea: aprobada.total
                ? conLinea('aún sin salir', aprobada.dias != null && aprobada.dias <= 0 ? 'la más antigua, aprobada hoy' : laMasAntigua(aprobada.dias, { hace: true, prefijo: 'aprobada ' }))
                : 'todo lo aprobado ya salió',
            nota: notaBodega,
            ir: { filtro: 'aprobada' },
        },
        {
            key: 'obras', nombre: 'Obras', iniciales: null, cifra: porRecibir, tono: 'azul',
            linea: lineaObras,
            nota: `${enMes} pidieron ${conteos.pidio} y recibieron ${recibida.total}.`,
            ir: { filtro: 'todas', grupo: aprobada.total ? 'aprobada' : 'camino' },
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

// ─────────────────────────────── Todo junto ───────────────────────────────

export interface OpcionFiltro { key: FiltroSec; texto: string; n: number }

export interface ModeloSuperAdmin {
    /** Con `ver_todas` («todas las obras»). */
    todas: boolean;
    circuito: PasoCircuitoSA[];
    diferencias: ReturnType<typeof avisoDiferencias>;
    responsables: Responsable[];
    /** Las filas de cada paso, ya ordenadas (lo pendiente de resolver primero; después lo que se movió último). */
    porGrupo: Record<Grupo, FilaSec[]>;
    /** Pestañas con su cifra (de la lista). */
    filtros: OpcionFiltro[];
    /** Todo lo registrado, lo más nuevo arriba. */
    eventos: Evento[];
    /** Alguna lista llegó a su tope (`limites`): lo que falta está en Inventario. */
    tope: { texto: string; ruta: string } | null;
}

const EN_CURSO: readonly EstadoSolicitudPerfil[] = ['pendiente', 'aprobada', 'en_transito', 'recepcion_parcial'];

export function modeloSuperAdmin(datos: InventarioPerfilApi): ModeloSuperAdmin {
    const registros = registrosDe(datos);
    const eventos = ordenarEventos(registros.flatMap(eventosDeRegistro));
    const aprueba = quienApruebaDe(datos.aprobadores);
    const ctx: Contexto = {
        aprueba: aprueba.nombre ?? QUIEN_APRUEBA,
        investiga: JEFATURA,
        despachan: despachanDesde(eventos, registros),
        conocidas: datos.diferencias != null,
    };
    const ordenados = [...registros].sort((a, b) =>
        Number(b.difs.length > 0) - Number(a.difs.length > 0)
        || ultimoPaso(b.s).localeCompare(ultimoPaso(a.s))
        || AVANCE[b.s.estado] - AVANCE[a.s.estado]
        || b.s.id - a.s.id);
    const filas = ordenados.map(r => filaSec(r, ctx));
    const porGrupo = Object.fromEntries(GRUPOS.map(g => [g.key, filas.filter(f => f.grupo === g.key)])) as Record<Grupo, FilaSec[]>;
    const n = (...gs: Grupo[]) => gs.reduce((t, g) => t + porGrupo[g].length, 0);
    const recibidas = n('dif', 'completa');
    const filtros: OpcionFiltro[] = [
        { key: 'todas', texto: 'Todas', n: filas.length },
        { key: 'aprobar', texto: 'Por aprobar', n: n('aprobar') },
        { key: 'aprobada', texto: plural(n('aprobada'), 'Aprobada', 'Aprobadas'), n: n('aprobada') },
        { key: 'camino', texto: 'En camino', n: n('camino') },
        { key: 'recibidas', texto: plural(recibidas, 'Recibida', 'Recibidas'), n: recibidas },
        { key: 'rechazada', texto: plural(n('rechazada'), 'No aprobada', 'No aprobadas'), n: n('rechazada') },
    ];
    // «Recibida» cuenta las de este mes (cifra exacta); la lista trae además las últimas de antes.
    const antes = registros.filter(r => r.s.estado === 'recibida' && !r.s.del_mes).length;
    const l = datos.limites;
    const llego = (cuantas: number, tope?: number) => !!tope && cuantas >= tope;
    const cuenta = (pred: (s: SolicitudPerfil) => boolean) => datos.solicitudes.filter(pred).length;
    const alTope = !!l && (
        llego(cuenta(s => EN_CURSO.includes(s.estado)), l.en_curso)
        || llego(cuenta(s => s.estado === 'recibida'), l.recibidas)
        || llego(cuenta(s => s.estado === 'rechazada'), l.rechazadas)
        || llego(datos.diferencias?.length ?? 0, l.diferencias));
    return {
        todas: datos.alcance.todas,
        circuito: circuitoSuperAdmin(datos.circuito, datos.hoy, aprueba, antes),
        diferencias: avisoDiferencias(datos.circuito.diferencias),
        responsables: responsablesDe(datos, conteosMes(eventos, datos.hoy, aprueba.ids), aprueba),
        porGrupo,
        filtros,
        eventos,
        tope: alTope ? { texto: 'La lista llegó a su tope: lo que no está aquí, en Inventario', ruta: rutaLista('todas') } : null,
    };
}

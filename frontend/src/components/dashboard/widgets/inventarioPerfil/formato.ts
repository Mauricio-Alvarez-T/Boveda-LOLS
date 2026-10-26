import type { TonoTarjeta } from '../tarjetaActiva';
import { iniciales, nombreCorto, plural } from '../fichasInicio';
import { formatBodegaNombreResponsable } from '../../../../utils/formatBodega';
import type {
    CircuitoPerfil, EstadoSolicitudPerfil, EtapaCircuitoPerfil, EtapaPerfil, ItemPerfil, LugarPerfil, PersonaPerfil, SolicitudPerfil,
    TipoSolicitudPerfil,
} from './tipos';

/**
 * Formato COMÚN de las tres vistas del detalle «Inventario» del Inicio (VistaLeonardo, VistaJefatura, VistaObra;
 * Marcos 2026-10-22): fechas, días, cantidades con su unidad, frases de ítems y de diferencias, nombres, lugares y
 * enlaces a Inventario. Lógica PURA (sin DOM), con test en `formato.test.ts`. Los textos son los del lienzo
 * (boveda-diseno/frontend/src/preview/inventario, opciones A y B).
 * Regla: las vistas no repiten estas reglas; si una necesita otra forma, se agrega AQUÍ con su test.
 */

export { iniciales, nombreCorto, plural };

// ─────────────────────────────── El circuito de tres pasos ───────────────────────────────
// Don Luis (2026-10-23): bodegueros y conductores fuera del ciclo de solicitud. El circuito de las cuatro vistas es
// Pedida → Aprobada → Recibida (y Diferencias aparte): sin «Despachada». El servidor sigue mandando `despachada` (en
// tránsito o con recepción parcial: nacen así por envío directo u orden de gerencia); aquí se cuentan DENTRO de
// «Aprobada · por recibir».

/** Una etapa del circuito de tres pasos (la `etapa` de la respuesta sin «despachada»). */
export type EtapaTresPasos = Exclude<EtapaPerfil, 'despachada'>;

/** La etapa en el circuito de tres pasos: lo «despachado» (en tránsito o con una parte recibida) va en «aprobada». */
export const etapaTresPasos = (etapa: EtapaPerfil): EtapaTresPasos => (etapa === 'despachada' ? 'aprobada' : etapa);

/**
 * «Aprobada · por recibir» con las cifras exactas del servidor: aprobadas + despachadas (`total`), y los días de la más
 * antigua de las dos (`dias`; null si no hay ninguna).
 */
export function porRecibirCircuito(c: Pick<CircuitoPerfil, 'aprobada'> & { despachada?: EtapaCircuitoPerfil | null }): EtapaCircuitoPerfil {
    const d = c.despachada ?? { total: 0, dias: null };
    const total = (c.aprobada.total || 0) + (d.total || 0);
    const dias = [c.aprobada.total ? c.aprobada.dias : null, d.total ? d.dias : null].filter((n): n is number => n != null);
    return { total, dias: total > 0 ? (dias.length ? Math.max(...dias) : null) : null };
}

// ─────────────────────────────── Superficie ───────────────────────────────

/**
 * Tarjeta grande del detalle (la de «Hoy» de Asistencia): blanca, sin borde, sombra suave. En el celular con menos
 * relleno para que quepa a 360 px (lienzo A).
 */
export const TARJETA = 'rounded-3xl bg-card p-4 text-foreground shadow-[var(--shadow-md)] sm:p-6';

// ─────────────────────────────── Fechas y días ───────────────────────────────

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Año, mes y día de 'YYYY-MM-DD' (acepta también 'YYYY-MM-DD HH:mm…'); null si no es una fecha. */
function partesFecha(iso?: string | null): { anio: number; mes: number; dia: number } | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((iso ?? '').trim());
    if (!m) return null;
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
    return { anio, mes, dia };
}

/** '2026-10-18' → «18 oct». Vacío si no hay fecha (la app no la registró). */
export function fechaCorta(iso?: string | null): string {
    const p = partesFecha(iso);
    return p ? `${p.dia} ${MESES[p.mes - 1]}` : '';
}

/** '2026-10-22' → «jue 22 oct». Vacío si no hay fecha. */
export function fechaConDia(iso?: string | null): string {
    const p = partesFecha(iso);
    if (!p) return '';
    return `${DIAS_SEMANA[new Date(p.anio, p.mes - 1, p.dia).getDay()]} ${p.dia} ${MESES[p.mes - 1]}`;
}

/** Días de calendario de `desde` a `hasta` (las dos 'YYYY-MM-DD'); null si falta alguna. */
export function diasEntre(desde?: string | null, hasta?: string | null): number | null {
    const a = partesFecha(desde);
    const b = partesFecha(hasta);
    if (!a || !b) return null;
    return Math.round((Date.UTC(b.anio, b.mes - 1, b.dia) - Date.UTC(a.anio, a.mes - 1, a.dia)) / 86_400_000);
}

/** 0 → «de hoy», 1 → «1 día», 9 → «9 días». */
export const textoDias = (dias: number): string => (dias <= 0 ? 'de hoy' : `${dias} ${plural(dias, 'día', 'días')}`);

/** Días en la etapa: gris hasta 7, ámbar de 8 a 30, rojo más de 30 (la regla de las fichas del Inicio). */
export const tonoDias = (dias: number | null | undefined): TonoTarjeta =>
    (dias == null ? 'neutro' : dias > 30 ? 'rojo' : dias >= 8 ? 'ambar' : 'neutro');

/** Las que llevan más días primero; a igualdad, el orden en que venían. No cambia la lista original. */
export const masAntiguasPrimero = <T extends { dias: number }>(lista: readonly T[]): T[] =>
    [...lista].sort((a, b) => b.dias - a.dias);

// ─────────────────────────────── Cantidades y unidades ───────────────────────────────

/** Las cantidades llegan como número (DECIMAL de la BD): se redondean a 4 decimales antes de mostrarlas. */
const redondear = (n: number) => Math.round(n * 10_000) / 10_000;
const NUMERO = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });
/** «40», «2,5», «12.000». */
export const numero = (n: number): string => NUMERO.format(redondear(n));

/** Cómo se dice una unidad: corta para listas («15 un.»), larga para diferencias y mensajes («3 unidades»). */
export interface Unidad {
    corta: [string, string];
    larga: [string, string];
    /** Es «unidad» (UN, U…): en «Arnés ×6» no se nombra. */
    esUnidad?: boolean;
}

const UNIDAD: Unidad = { corta: ['un.', 'un.'], larga: ['unidad', 'unidades'], esUnidad: true };
const igual = (uno: string, varios = `${uno}s`): Unidad => ({ corta: [uno, varios], larga: [uno, varios] });
const SIN_PLURAL = (corta: string, larga = corta, largas = larga): Unidad => ({ corta: [corta, corta], larga: [larga, largas] });

/** Las unidades como se guardan (catálogo: casi todo 'U'; personalizados: texto libre) → en palabras. */
const UNIDADES: Record<string, Unidad> = {
    '': UNIDAD, U: UNIDAD, UN: UNIDAD, UND: UNIDAD, UNID: UNIDAD, UNIDAD: UNIDAD, UNIDADES: UNIDAD, 'C/U': UNIDAD,
    SACO: igual('saco'), SACOS: igual('saco'),
    BARRA: igual('barra'), BARRAS: igual('barra'),
    ROLLO: igual('rollo'), ROLLOS: igual('rollo'),
    CAJA: igual('caja'), CAJAS: igual('caja'),
    BOLSA: igual('bolsa'), BOLSAS: igual('bolsa'),
    TARRO: igual('tarro'), TARROS: igual('tarro'),
    PLANCHA: igual('plancha'), PLANCHAS: igual('plancha'),
    TIRA: igual('tira'), TIRAS: igual('tira'),
    JUEGO: igual('juego'), JUEGOS: igual('juego'),
    PAR: igual('par', 'pares'), PARES: igual('par', 'pares'),
    M3: SIN_PLURAL('m³'), 'M³': SIN_PLURAL('m³'),
    M2: SIN_PLURAL('m²'), 'M²': SIN_PLURAL('m²'),
    ML: SIN_PLURAL('ml'),
    M: SIN_PLURAL('m', 'metro', 'metros'), MT: SIN_PLURAL('m', 'metro', 'metros'), MTS: SIN_PLURAL('m', 'metro', 'metros'),
    METRO: SIN_PLURAL('m', 'metro', 'metros'), METROS: SIN_PLURAL('m', 'metro', 'metros'),
    KG: SIN_PLURAL('kg'), KGS: SIN_PLURAL('kg'), KILO: SIN_PLURAL('kg'), KILOS: SIN_PLURAL('kg'),
    TON: SIN_PLURAL('ton'),
    L: SIN_PLURAL('lt', 'litro', 'litros'), LT: SIN_PLURAL('lt', 'litro', 'litros'), LTS: SIN_PLURAL('lt', 'litro', 'litros'),
    LITRO: SIN_PLURAL('lt', 'litro', 'litros'), LITROS: SIN_PLURAL('lt', 'litro', 'litros'),
    GL: SIN_PLURAL('gl', 'galón', 'galones'), GALON: SIN_PLURAL('gl', 'galón', 'galones'), 'GALÓN': SIN_PLURAL('gl', 'galón', 'galones'),
    GALONES: SIN_PLURAL('gl', 'galón', 'galones'),
};

/** La unidad guardada ('UN', 'Saco', 'm3', null…) en palabras. Lo desconocido va tal cual, en minúscula y sin plural. */
export function unidadDe(unidad?: string | null): Unidad {
    const texto = (unidad ?? '').trim();
    const conocida = UNIDADES[texto.toUpperCase().replace(/\.$/, '')];
    if (conocida) return conocida;
    const tal = texto.toLowerCase();
    return { corta: [tal, tal], larga: [tal, tal] };
}

/** ¿Es «unidad» (UN, U, vacío…)? */
export const esUnidad = (unidad?: string | null): boolean => !!unidadDe(unidad).esUnidad;

/** «3 unidades», «1 saco», «2,5 m³», «4 metros» (diferencias y mensajes). */
export function cantidad(n: number, unidad?: string | null): string {
    const [uno, varios] = unidadDe(unidad).larga;
    return `${numero(n)} ${plural(redondear(n), uno, varios)}`;
}

/** «15 un.», «40 sacos», «3 m³» (listas de ítems). */
export function cantidadCorta(n: number, unidad?: string | null): string {
    const [uno, varios] = unidadDe(unidad).corta;
    return `${numero(n)} ${plural(redondear(n), uno, varios)}`;
}

// ─────────────────────────────── Ítems ───────────────────────────────

type ItemTexto = Pick<ItemPerfil, 'descripcion' | 'unidad' | 'pedida'>;
const nombreItem = (i: Pick<ItemPerfil, 'descripcion'>) => i.descripcion?.trim() || 'Ítem sin nombre';

/** Lienzo A: «Cemento ×40 sacos»; si es «unidad» no se nombra: «Arnés de seguridad ×6». `n` = lo pedido. */
export function itemPor(i: ItemTexto, n: number = i.pedida): string {
    const u = unidadDe(i.unidad);
    if (u.esUnidad) return `${nombreItem(i)} ×${numero(n)}`;
    return `${nombreItem(i)} ×${numero(n)} ${plural(redondear(n), u.larga[0], u.larga[1])}`;
}

/** Lienzo B: «Cemento (40 sacos)», «Andamio marco 1,5 m (12 un.)». `n` = lo pedido. */
export const itemConCantidad = (i: ItemTexto, n: number = i.pedida): string => `${nombreItem(i)} (${cantidadCorta(n, i.unidad)})`;

/** «A», «A y B», «A, B y C». */
export function enLista(partes: readonly string[]): string {
    if (partes.length <= 1) return partes.join('');
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

/** Los primeros `max` ítems y cuántos quedan: «Cemento ×40 sacos, Arena gruesa ×3 m³ y 1 ítem más». */
export function fraseItems(
    items: readonly ItemTexto[],
    { max = 2, formato = itemPor }: { max?: number; formato?: (i: ItemTexto) => string } = {},
): string {
    const vistos = items.slice(0, Math.max(0, max)).map(i => formato(i));
    const resto = items.length - vistos.length;
    return enLista(resto > 0 ? [...vistos, `${resto} ${plural(resto, 'ítem', 'ítems')} más`] : vistos);
}

/** «Materiales» / «Herramientas» (la píldora del tipo). */
export const TIPO: Record<TipoSolicitudPerfil, string> = { materiales: 'Materiales', herramientas: 'Herramientas' };

// ─────────────────────────────── Diferencias ───────────────────────────────

/**
 * Lo que llegó distinto, con `diferencia` = enviada − recibida (positiva = faltó; negativa = llegó de más):
 * «Faltan 2 sacos» / «Llegó 1 unidad de más». `pasado`: «Faltaron 2 sacos». `minuscula`: «faltan 2 sacos» (dentro de
 * una frase o un mensaje). Vacío si no hay diferencia.
 */
export function textoDiferencia(
    diferencia: number,
    unidad?: string | null,
    { pasado = false, minuscula = false }: { pasado?: boolean; minuscula?: boolean } = {},
): string {
    const d = redondear(diferencia);
    if (!d) return '';
    const n = Math.abs(d);
    const texto = d > 0
        ? `${plural(n, pasado ? 'Faltó' : 'Falta', pasado ? 'Faltaron' : 'Faltan')} ${cantidad(n, unidad)}`
        : `${plural(n, 'Llegó', 'Llegaron')} ${cantidad(n, unidad)} de más`;
    return minuscula ? texto.charAt(0).toLowerCase() + texto.slice(1) : texto;
}

/**
 * Lo que llegó distinto en una solicitud ya recibida (ítem por ítem, enviada ≠ recibida), para el historial:
 * un ítem → «Faltaron 2 sacos»; varios → «2 ítems con diferencia» (con `items` la vista puede decirlo de otra forma).
 * null si llegó todo o aún no hay recepción.
 */
export function llegoDistinto(s: Pick<SolicitudPerfil, 'items'>): { items: number; texto: string } | null {
    const distintos = s.items.filter(i => i.enviada != null && i.recibida != null && redondear(i.enviada - i.recibida) !== 0);
    if (distintos.length === 0) return null;
    if (distintos.length > 1) return { items: distintos.length, texto: `${distintos.length} ítems con diferencia` };
    const i = distintos[0];
    return { items: 1, texto: textoDiferencia((i.enviada ?? 0) - (i.recibida ?? 0), i.unidad, { pasado: true }) };
}

// ─────────────────────────────── Personas y lugares ───────────────────────────────

/** El nombre registrado, o null si la app no lo guardó. */
export const nombreDe = (p?: PersonaPerfil | null): string | null => p?.nombre?.trim() || null;

/** Primer nombre («Leonardo López» → «Leonardo»), o null. */
export function nombreCortoDe(p?: PersonaPerfil | null): string | null {
    const n = nombreDe(p);
    return n ? nombreCorto(n) : null;
}

/**
 * Sin nadie (o con más de dos) en `aprobadores`, el nombre que se muestra (Marcos 2026-10-26: «cambiar por el nombre
 * Leonardo» en vez de «Quien aprueba»; solo Leonardo aprueba, mig 131/133).
 */
export const APROBADOR_POR_DEFECTO = 'Leonardo';

/**
 * Quién aprueba hoy (`datos.aprobadores`), para «Esperando a Leonardo» / «Apurar a Leonardo»: su primer nombre; con
 * dos, «Leonardo o Ana»; sin nadie o con más de dos, `APROBADOR_POR_DEFECTO`.
 */
export function quienAprueba(aprobadores?: readonly PersonaPerfil[] | null): string {
    const nombres = (aprobadores ?? []).map(nombreCortoDe).filter((n): n is string => !!n);
    if (nombres.length === 0 || nombres.length > 2) return APROBADOR_POR_DEFECTO;
    return nombres.join(' o ');
}

/**
 * Obra o bodega: «Domeyko», «Bodega Cerrillos». Con `conResponsable`, la bodega como el resto de la app:
 * «Bodega Central (Juan Pérez)». null si no hay lugar (pendiente: el origen lo decide quien aprueba).
 */
export function nombreLugar(l?: LugarPerfil | null, { conResponsable = false }: { conResponsable?: boolean } = {}): string | null {
    const nombre = l?.nombre?.trim();
    if (!l || !nombre) return null;
    if (l.tipo === 'bodega' && conResponsable) return formatBodegaNombreResponsable(nombre, l.responsable);
    return nombre;
}

// ─────────────────────────────── Enlaces a Inventario ───────────────────────────────
// Aprobar, recibir y resolver piden un formulario (orígenes, cantidades, simulación): desde el Inicio se abre
// Inventario → Solicitudes con esa solicitud; nada se aprueba ni se recibe aquí. Inventario lee `tab`, `estado`,
// `id` y `nuevo` solo al entrar (docs/reglas/inventario-transferencias.md § Enlaces del Inicio a Inventario).

const BASE = '/inventario?tab=transferencias';

/** Filtros que existen en Inventario → Solicitudes. */
export type FiltroInventario = 'todas' | 'pendiente' | 'aprobada' | 'recibida' | 'discrepancias';

/** El filtro en que aparece cada estado (en tránsito, recepción parcial y rechazadas van en «Todas»). */
const FILTRO_DE: Record<EstadoSolicitudPerfil, FiltroInventario> = {
    pendiente: 'pendiente', aprobada: 'aprobada', en_transito: 'todas', recepcion_parcial: 'todas', recibida: 'recibida', rechazada: 'todas',
};

/** Abre Inventario con esa solicitud a la vista (para aprobarla, recibirla o solo verla). */
export const rutaSolicitud = (s: Pick<SolicitudPerfil, 'id' | 'estado'>): string =>
    `${BASE}&estado=${FILTRO_DE[s.estado] ?? 'todas'}&id=${s.id}`;

/** Abre «Diferencias» con la de esa solicitud (con solo `diferencias_ver`, en solo lectura). */
export const rutaDiferencia = (transferenciaId: number): string => `${BASE}&estado=discrepancias&id=${transferenciaId}`;

/** La lista de Inventario → Solicitudes con ese filtro. */
export const rutaLista = (filtro: FiltroInventario = 'todas'): string => `${BASE}&estado=${filtro}`;

/** «Pedir materiales»: Inventario abre el asistente de pedir al entrar (solo con permiso de solicitar). */
export const RUTA_PEDIR = `${BASE}&nuevo=pedir`;

/**
 * Lógica PURA (sin React) de las DIFERENCIAS de transferencia (modelo del dueño 2026-10-21,
 * reemplaza al de «causas» de a48ed71). La consumen DiscrepanciaDetail, DiscrepanciaRehacerModal,
 * RecibirForm, useTransferencias y el tutorial de Ayuda; vive aparte para testearla sin arrastrar
 * framer-motion (molde: faltanteReason.ts).
 *
 * Modelo:
 *  · Al RECIBIR, el stock se mueve SOLO por lo ENVIADO. Lo que quien recibió declaró de más o de
 *    menos queda como diferencia PENDIENTE: no está en el stock.
 *  · Resolver  = APROBAR lo declarado. Sobrante: destino +dif y origen −dif. Faltante: destino −f
 *    y origen +f (vuelven al origen: nunca salieron).
 *  · Descartar = RECHAZAR lo declarado (se equivocó al digitar o contar): no mueve stock.
 *  · `diferencia_aplicada = true` = regla anterior (la diferencia se aplicó al stock al recibir):
 *    aprobarla la cierra SIN mover nada; rechazarla exige que un Super Administrador la rehaga antes.
 *
 * El signo sale SIEMPRE de cantidad_recibida vs cantidad_enviada: la columna `diferencia` de la BD
 * es enviada − recibida (signo opuesto). Las cifras exactas («hoy A → quedará B») las da el servidor
 * con la SIMULACIÓN (PUT …/resolver?simular=1): el stock que trae la lista es una foto vieja y no se
 * usa para bloquear.
 */
import type {
    AjusteStockDiscrepancia, AjusteStockResultado, BloqueoDiscrepancia, RehacerDiscrepanciaPlan,
    ResolverDiscrepanciaResultado, SimulacionResolverDiscrepancia,
} from '../../types/entities';
import { fmtNumber } from '../../utils/format';

export type SignoDiscrepancia = 'sobrante' | 'faltante';

/** Estados HTTP que se muestran DENTRO del modal (queda abierto), sin toast. */
export const ESTADOS_ERROR_EN_MODAL: readonly number[] = [400, 409];

/** Prefijo con que el servidor guarda la decisión anterior al REHACER (en `observacion`). */
export const PREFIJO_RESOLUCION_ANTERIOR = 'Resolución anterior (regla antigua)';

/** Fila de la regla anterior: qué hace «Resolver». */
export const TEXTO_REGLA_ANTERIOR_APROBAR =
    'Regla anterior: la diferencia ya está en el stock; aprobar la cierra sin mover nada';

/** Fila de la regla anterior: por qué «Descartar» está deshabilitado. */
export const TEXTO_REGLA_ANTERIOR_DESCARTAR = 'primero hay que rehacerla (Super Administrador)';

/** Fila de la regla anterior que ya ajustó stock (modelo de causas): no se rehace sola. */
export const TEXTO_CON_AJUSTES = 'Se resolvió con ajustes: se corrige a mano';

/** Nota vacía: el servidor genera el texto (no se promete el texto exacto). */
export const TEXTO_NOTA_VACIA = 'Si la dejas vacía se guarda un texto automático.';

/** Simulación que no se pudo pedir: decide el servidor al confirmar. */
export const TEXTO_SIMULACION_FALLO =
    'No se pudo calcular el efecto exacto en el stock. Puedes confirmar igual: el servidor revisa el stock del momento y te avisa si no se puede.';

/** Mientras se pide la simulación (ventana real y tutorial). */
export const TEXTO_CALCULANDO_STOCK = 'Calculando cómo queda el stock…';

/** Rótulo de las líneas de la simulación («<ubicación>: hoy A → quedará B (±N)»). */
export const ROTULO_SIMULACION = 'Así queda el stock:';

/** Toast al aprobar una diferencia de la regla anterior: el servidor la cierra sin mover stock. */
export const TOAST_CERRADA_REGLA_ANTERIOR = 'Diferencia cerrada (regla anterior): no se movió stock';

/**
 * Código del 409 que significa «no se pudo ahora (el stock estaba ocupado), vuelve a intentar». La
 * ventana queda abierta para reintentar: no es un bloqueo de la decisión.
 */
export const CODIGO_REINTENTAR = 'REINTENTAR';

/** Descripción del toast de un 409 REINTENTAR. */
export const TEXTO_REINTENTAR = 'La ventana sigue abierta: revisa cómo queda el stock y vuelve a confirmar.';

/** Redondeo a 3 decimales: las cantidades son DECIMAL (kg, m³) y 1.1 − 0.3 no da 0.8 exacto. */
export function redondear(n: number): number {
    return Math.round(n * 1000) / 1000;
}

/** Cantidad legible (es-CL, decimales solo si los hay): 1234 → «1.234», 2.5 → «2,5». */
export function fmtCantidad(n: number): string {
    return fmtNumber(redondear(n));
}

/** «12 un» / «12» (sin unidad no deja un espacio colgando). */
export function cant(n: number, unidad?: string | null): string {
    const u = unidad?.trim();
    return u ? `${fmtCantidad(n)} ${u}` : fmtCantidad(n);
}

/** Número o null (DECIMAL llega como string; ausente / vacío / NaN → null). */
export function numeroONull(v: unknown): number | null {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? redondear(n) : null;
}

/**
 * Sobrante o faltante y cuántas unidades (N = |recibida − enviada|).
 * null si no hay diferencia (no debería listarse).
 */
export function signoDiscrepancia(
    cantidadEnviada: number | string | null | undefined,
    cantidadRecibida: number | string | null | undefined,
): { signo: SignoDiscrepancia; n: number } | null {
    const enviada = Number(cantidadEnviada) || 0;
    const recibida = Number(cantidadRecibida) || 0;
    const d = redondear(recibida - enviada);
    if (d === 0) return null;
    return { signo: d > 0 ? 'sobrante' : 'faltante', n: Math.abs(d) };
}

/** Booleano de la API: true, o 1 / '1' si llega crudo de MySQL. Lo demás es false. */
export function esVerdadero(v: unknown): boolean {
    return v === true || v === 1 || v === '1';
}

/**
 * ¿Fila de la REGLA ANTERIOR (diferencia_aplicada = true)? El GET la manda boolean; 1 / '1' por
 * si llega cruda. Ausente o null (backend sin la mig 130, tutorial) → no: el servidor decide.
 */
export function esReglaAnterior(diferenciaAplicada: unknown): boolean {
    return esVerdadero(diferenciaAplicada);
}

/** Rótulo del estado de una fila: con la regla nueva, resolver = aprobar y descartar = rechazar. */
export function rotuloEstado(estado: string, reglaAnterior: boolean): string {
    if (estado === 'resuelta') return reglaAnterior ? 'Resuelta' : 'Aprobada';
    if (estado === 'descartada') return reglaAnterior ? 'Descartada' : 'Rechazada';
    return 'Pendiente';
}

/** Lo que se sabe de una diferencia para armar el mensaje (nombres reales). */
export interface ContextoDiferencia {
    enviada: number | string | null | undefined;
    recibida: number | string | null | undefined;
    unidad?: string | null;
    origen: string;
    destino: string;
    /** Quien recibió y declaró la cantidad. */
    receptor?: string | null;
}

export interface MensajeAprobar {
    signo: SignoDiscrepancia;
    n: number;
    /** «Juan Pérez declaró 7 de 5 un enviados: 2 un de más.» */
    declaro: string;
    /**
     * Frase FIJA, en condicional: «Al aprobar se sumarían 2 un a Bascuñan 661 y se descontarían de
     * Conferencia 622, según el stock real.» Solo cuando NO hay simulación (sin / cargando / falló):
     * con la simulación lista mandan sus cifras exactas.
     */
    efecto: string;
}

function quienDeclaro(receptor?: string | null): string {
    return receptor?.trim() || 'Quien recibió';
}

/** «Juan Pérez declaró 7 de 5 un enviados: 2 un de más.» (null si no hay diferencia). */
export function textoDeclaro(ctx: ContextoDiferencia): string | null {
    const sig = signoDiscrepancia(ctx.enviada, ctx.recibida);
    if (!sig) return null;
    const enviada = Number(ctx.enviada) || 0;
    const recibida = Number(ctx.recibida) || 0;
    const cuanto = `${cant(sig.n, ctx.unidad)} de ${sig.signo === 'sobrante' ? 'más' : 'menos'}`;
    return `${quienDeclaro(ctx.receptor)} declaró ${fmtCantidad(recibida)} de ${cant(enviada, ctx.unidad)} enviados: ${cuanto}.`;
}

/**
 * Mensaje de RESOLVER (= aprobar lo declarado) con nombres y cifras. Las ubicaciones exactas y su
 * stock («hoy A → quedará B») salen de la simulación del servidor: el `efecto` es la frase fija (en
 * condicional, porque el servidor puede mover menos) para cuando no la hay. null si no hay diferencia.
 */
export function mensajeAprobar(ctx: ContextoDiferencia): MensajeAprobar | null {
    const sig = signoDiscrepancia(ctx.enviada, ctx.recibida);
    const declaro = textoDeclaro(ctx);
    if (!sig || !declaro) return null;
    const N = cant(sig.n, ctx.unidad);
    return {
        signo: sig.signo,
        n: sig.n,
        declaro,
        efecto: sig.signo === 'sobrante'
            ? `Al aprobar se sumarían ${N} a ${ctx.destino} y se descontarían de ${ctx.origen}, según el stock real.`
            : `Al aprobar se restarían ${N} de ${ctx.destino} y volverían a ${ctx.origen}, según el stock real.`,
    };
}

/** Mensaje de DESCARTAR (= rechazar lo declarado): no mueve stock. */
export function mensajeRechazar(ctx: ContextoDiferencia): { declaro: string | null; efecto: string } {
    const enviada = Number(ctx.enviada) || 0;
    return {
        declaro: textoDeclaro(ctx),
        efecto: `Rechazas lo declarado: queda lo enviado (${cant(enviada, ctx.unidad)}). `
            + 'Úsalo si quien recibió se equivocó al digitar o contar.',
    };
}

/**
 * Texto que guarda el servidor si la nota viene vacía. Solo lo usa el tutorial (sin backend):
 * la pantalla real NO lo promete (el servidor puede cambiarlo).
 */
export function resolucionPorDefecto(
    estado: 'resuelta' | 'descartada',
    enviada: number | string | null | undefined,
    recibida: number | string | null | undefined,
): string {
    const e = fmtCantidad(Number(enviada) || 0);
    return estado === 'resuelta'
        ? `Aprobada: llegaron ${fmtCantidad(Number(recibida) || 0)} de ${e} enviados`
        : `Rechazada: queda lo enviado (${e})`;
}

/**
 * Línea de la pantalla de RECEPCIÓN cuando lo declarado difiere de lo enviado. `difs` = diferencia
 * por ítem con signo (recibida − enviada). Una sola: «La diferencia (−2 un) queda pendiente: …».
 * null si no hay diferencias.
 */
export function lineaDiferenciaRecepcion(difs: { cantidad: number; unidad?: string | null }[]): string | null {
    const conDif = difs.filter(x => redondear(x.cantidad) !== 0);
    if (conDif.length === 0) return null;
    if (conDif.length === 1) {
        const { cantidad, unidad } = conDif[0];
        const signo = cantidad > 0 ? '+' : '−';
        return `La diferencia (${signo}${cant(Math.abs(cantidad), unidad)}) queda pendiente: Inventario la revisa; el stock se mueve por lo enviado.`;
    }
    return 'Las diferencias quedan pendientes: Inventario las revisa; el stock se mueve por lo enviado.';
}

/**
 * Separa la nota que dejó quien recibió de la decisión anterior que el servidor concatena al
 * REHACER («Resolución anterior (regla antigua): …»), para no rotularla «Nota al recibir».
 */
export function separarObservacion(obs: string | null | undefined): { nota: string | null; anterior: string | null } {
    const texto = obs?.trim() || '';
    if (!texto) return { nota: null, anterior: null };
    const i = texto.indexOf(PREFIJO_RESOLUCION_ANTERIOR);
    if (i < 0) return { nota: texto, anterior: null };
    const nota = texto.slice(0, i).replace(/[\s|·;,.\-–—]+$/u, '').trim();
    const anterior = texto.slice(i + PREFIJO_RESOLUCION_ANTERIOR.length).replace(/^[\s:]+/u, '').trim();
    return { nota: nota || null, anterior: anterior || null };
}

function idONull(v: unknown): number | null {
    const n = Number(v);
    return v == null || v === '' || !Number.isFinite(n) ? null : n;
}

function comoObjeto(v: unknown): Record<string, unknown> {
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
}

/** JSON de la columna TEXT (string) u objeto ya parseado; null si no es un objeto. */
function leerJsonObjeto(raw: unknown): Record<string, unknown> | null {
    let v: unknown = raw;
    if (typeof v === 'string') {
        if (!v.trim()) return null;
        try { v = JSON.parse(v); } catch { return null; }
    }
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
}

/**
 * Normaliza una lista de ajustes de la API (descarta los de cantidad 0 o no numérica).
 * Conserva `antes` / `despues` cuando vienen (simulación, respuesta de resolver, plan de rehacer).
 */
export function normalizarAjustes(raw: unknown): AjusteStockDiscrepancia[] {
    if (!Array.isArray(raw)) return [];
    return raw
        .map((a): AjusteStockDiscrepancia | null => {
            if (!a || typeof a !== 'object') return null;
            const r = a as Record<string, unknown>;
            const cantidad = redondear(Number(r.cantidad));
            if (!Number.isFinite(cantidad) || cantidad === 0) return null;
            const nombre = typeof r.ubicacion_nombre === 'string' && r.ubicacion_nombre.trim()
                ? r.ubicacion_nombre.trim()
                : '—';
            const ajuste: AjusteStockDiscrepancia = {
                obra_id: idONull(r.obra_id), bodega_id: idONull(r.bodega_id), ubicacion_nombre: nombre, cantidad,
            };
            const antes = numeroONull(r.antes);
            const despues = numeroONull(r.despues);
            if (antes != null) ajuste.antes = antes;
            if (despues != null) ajuste.despues = despues;
            return ajuste;
        })
        .filter((a): a is AjusteStockDiscrepancia => a !== null);
}

function leerTexto(v: unknown): string | null {
    return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Lee `ajuste_stock` (TEXT con JSON en BD): objeto, string JSON o nada.
 * null si no hay nada que mostrar o el JSON está roto (nunca lanza).
 */
export function parseAjusteStock(raw: unknown): AjusteStockResultado | null {
    const r = leerJsonObjeto(raw);
    if (!r) return null;
    return { ajustes: normalizarAjustes(r.ajustes), aviso: leerTexto(r.aviso) };
}

/**
 * Registro que deja REHACER dentro de `ajuste_stock` ({ …, rehecha: { fecha, ajustes, aviso, … } }):
 * se conserva al aprobar/rechazar después. null si la fila nunca se rehízo (o el JSON está roto).
 */
export function leerRehecha(raw: unknown): { fecha: string | null; ajustes: AjusteStockDiscrepancia[]; aviso: string | null } | null {
    const v = leerJsonObjeto(raw);
    const r = v?.rehecha;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
    const reg = r as Record<string, unknown>;
    return { fecha: leerTexto(reg.fecha), ajustes: normalizarAjustes(reg.ajustes), aviso: leerTexto(reg.aviso) };
}

/**
 * ¿`ajuste_stock` registra que se movió stock (al resolver o al rehacer)? Mismo criterio que el
 * servidor (`_ajusteMovioStock`): lista `ajustes` o `rehecha.ajustes` no vacía.
 */
export function tieneAjustesGuardados(raw: unknown): boolean {
    const r = leerJsonObjeto(raw);
    if (!r) return false;
    const con = (a: unknown) => Array.isArray(a) && a.length > 0;
    return con(r.ajustes) || con(comoObjeto(r.rehecha).ajustes);
}

/** Lo mínimo de una fila de diferencia para decidir qué acciones se ofrecen. */
interface FilaDiferencia {
    estado: string;
    ajuste_stock?: unknown;
    diferencia_aplicada?: unknown;
    causa?: string | null;
}

/**
 * Por qué el servidor rechazaría ELIMINAR la fila (null = se puede): ajustó stock (409 CON_AJUSTE)
 * o es una pendiente de la regla anterior, cuya diferencia ya está en el stock (409 REGLA_ANTIGUA).
 */
export function motivoNoEliminar(fila: FilaDiferencia): string | null {
    if (tieneAjustesGuardados(fila.ajuste_stock)) {
        return 'Esta diferencia ajustó el stock: no se puede eliminar (quedaría el ajuste sin su registro).';
    }
    if (fila.estado === 'pendiente' && esReglaAnterior(fila.diferencia_aplicada)) {
        return 'Es de la regla anterior y su diferencia ya está en el stock: primero hay que aprobarla o rehacerla.';
    }
    return null;
}

/**
 * Fila de la regla anterior que se resolvió con el modelo de causas y ajustó stock: el servidor no
 * la rehace (409 CON_AJUSTE), se corrige a mano.
 */
export function resueltaConAjustes(fila: FilaDiferencia): boolean {
    return !!fila.causa?.trim() || tieneAjustesGuardados(fila.ajuste_stock);
}

/**
 * ¿Fila APROBADA sobre la regla anterior, que el servidor cerró sin mover stock? Su aviso («Regla
 * anterior: … se cierra sin mover stock») es informativo, no una advertencia: va en tono neutro.
 * Lo dice `ajuste_stock.cerrada_regla_anterior` si el servidor lo guarda; si no, una resuelta de la
 * regla anterior sin ajustes guardados (las del modelo de causas que ajustaron stock no cuentan).
 */
export function cerradaPorReglaAnterior(fila: FilaDiferencia): boolean {
    if (fila.estado !== 'resuelta') return false;
    if (esVerdadero(leerJsonObjeto(fila.ajuste_stock)?.cerrada_regla_anterior)) return true;
    return esReglaAnterior(fila.diferencia_aplicada) && !tieneAjustesGuardados(fila.ajuste_stock);
}

/** Toast tras resolver (aprobar) / descartar (rechazar) con éxito. */
export interface MensajeResultadoResolver {
    tipo: 'success' | 'warning';
    titulo: string;
    descripcion: string | null;
    /** ms; null = la duración por defecto del toast. */
    duracion: number | null;
}

/**
 * Qué toast mostrar con la respuesta 200 de resolver: rechazada (no movió stock), cerrada con la
 * regla anterior (`cerrada_regla_anterior`: no movió stock), aprobada con ajustes, o aprobada con
 * aviso (ámbar, más largo).
 */
export function mensajeResultadoResolver(
    data: Pick<ResolverDiscrepanciaResultado, 'estado' | 'ajustes' | 'aviso' | 'cerrada_regla_anterior'>,
    unidad?: string | null,
): MensajeResultadoResolver {
    if (data.estado === 'descartada') {
        return { tipo: 'success', titulo: 'Diferencia rechazada', descripcion: 'Queda lo enviado: no se movió stock.', duracion: null };
    }
    if (data.cerrada_regla_anterior) {
        return { tipo: 'success', titulo: TOAST_CERRADA_REGLA_ANTERIOR, descripcion: null, duracion: null };
    }
    const resumen = data.ajustes.length ? resumenAjustes(data.ajustes, unidad) : 'Sin cambios de stock';
    return data.aviso
        ? { tipo: 'warning', titulo: 'Diferencia aprobada', descripcion: `${resumen}. ${data.aviso}`, duracion: 12000 }
        : { tipo: 'success', titulo: 'Diferencia aprobada', descripcion: resumen, duracion: null };
}

/** «Bascuñan 661 −80 un» / «Conferencia 622 +5 un»: signo tipográfico (−, no guion). */
export function fmtAjuste(a: AjusteStockDiscrepancia, unidad?: string | null): string {
    const signo = a.cantidad > 0 ? '+' : '−';
    return `${a.ubicacion_nombre} ${signo}${cant(Math.abs(a.cantidad), unidad)}`;
}

/** Resumen en una línea para el toast: «Bascuñan 661 −80 un · Conferencia 622 +5 un». */
export function resumenAjustes(ajustes: AjusteStockDiscrepancia[], unidad?: string | null): string {
    return ajustes.map(a => fmtAjuste(a, unidad)).join(' · ');
}

/**
 * Línea de la simulación: «Bascuñan 661: hoy 5 → quedará 7 (+2 un)». Sin antes/después (respuesta
 * incompleta) queda «Bascuñan 661: +2 un».
 */
export function lineaAjusteSimulado(a: AjusteStockDiscrepancia, unidad?: string | null): string {
    const delta = `${a.cantidad > 0 ? '+' : '−'}${cant(Math.abs(a.cantidad), unidad)}`;
    if (a.antes == null || a.despues == null) return `${a.ubicacion_nombre}: ${delta}`;
    return `${a.ubicacion_nombre}: hoy ${fmtCantidad(a.antes)} → quedará ${fmtCantidad(a.despues)} (${delta})`;
}

/** «10 → 12» (plan de rehacer); null si falta alguno de los dos. */
export function fmtTransicion(antes: number | null | undefined, despues: number | null | undefined): string | null {
    if (antes == null || despues == null) return null;
    return `${fmtCantidad(antes)} → ${fmtCantidad(despues)}`;
}

function leerBloqueo(v: unknown): BloqueoDiscrepancia | null {
    if (typeof v === 'string') return v.trim() ? { code: null, message: v.trim() } : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const b = v as Record<string, unknown>;
    const message = leerTexto(b.message) ?? leerTexto(b.mensaje) ?? leerTexto(b.error);
    const code = leerTexto(b.code);
    if (!message && !code) return null;
    return { code, message: message ?? 'El servidor no permite aplicar esta decisión.' };
}

/**
 * Normaliza la respuesta de PUT …/resolver?simular=1: { ajustes (con antes/después), aviso,
 * bloqueo: null | { code, message } } y `cerrada_regla_anterior: true` solo si el servidor la marca.
 */
export function normalizarSimulacion(raw: unknown): SimulacionResolverDiscrepancia {
    const r = comoObjeto(raw);
    const sim: SimulacionResolverDiscrepancia = {
        ajustes: normalizarAjustes(r.ajustes), aviso: leerTexto(r.aviso), bloqueo: leerBloqueo(r.bloqueo),
    };
    if (esVerdadero(r.cerrada_regla_anterior)) sim.cerrada_regla_anterior = true;
    return sim;
}

/**
 * ¿La respuesta a ?simular=1 es en realidad una resolución APLICADA? Un backend sin simulación
 * ignora el parámetro y resuelve: responde con estado + resolucion y sin `bloqueo`.
 */
export function simulacionFueAplicada(raw: unknown): boolean {
    const r = comoObjeto(raw);
    if ('bloqueo' in r || r.simulado === true) return false;
    return (r.estado === 'resuelta' || r.estado === 'descartada') && typeof r.resolucion === 'string';
}

/** Código propio (no del servidor): la «simulación» resolvió de verdad (backend sin ?simular=1). */
export const CODIGO_APLICADA_SIN_SIMULAR = 'APLICADA_SIN_SIMULAR';

/**
 * Cuándo llega el aviso: al SIMULAR (abrir la ventana: todavía no decidiste nada) o al CONFIRMAR
 * (tu decisión no se aplicó).
 */
export type MomentoDecision = 'simular' | 'confirmar';

/**
 * Error que significa «ya no hay nada que decidir»: otra persona la resolvió (409 NO_PENDIENTE),
 * ya no existe (404) o, al rehacer, otra persona ya la rehízo (409 YA_REGLA_NUEVA). Devuelve el
 * título del toast informativo y el mensaje del servidor; null si es otro error. Al confirmar, el
 * título agrega «: no se aplicó tu decisión»; al simular no (aún no había decisión).
 */
export function avisoYaCerrada(
    error: { status?: number; code?: string; message?: string } | null | undefined,
    accion: 'resolver' | 'rehacer' = 'resolver',
    momento: MomentoDecision = 'confirmar',
): { titulo: string; detalle: string | null } | null {
    if (!error) return null;
    let base: string | null = null;
    if (error.code === 'NO_PENDIENTE') base = 'Otra persona ya la resolvió';
    else if (accion === 'rehacer' && error.code === 'YA_REGLA_NUEVA') base = 'Otra persona ya la rehízo';
    else if (error.status === 404) base = 'Esta diferencia ya no está';
    if (!base) return null;
    const titulo = momento === 'confirmar' ? `${base}: no se aplicó tu decisión` : base;
    const detalle = error.message?.trim() || null;
    return { titulo, detalle: detalle && detalle !== titulo ? detalle : null };
}

/** ¿409 REINTENTAR? (el stock estaba ocupado: se reintenta con la ventana abierta). */
export function esReintentar(error: { status?: number; code?: string } | null | undefined): boolean {
    return !!error && error.code === CODIGO_REINTENTAR && (error.status === undefined || error.status === 409);
}

/** Cómo leer la respuesta 200 de PUT …/resolver?simular=1. */
export type ResultadoSimulacion =
    | { tipo: 'ok'; sim: SimulacionResolverDiscrepancia }
    /** Backend sin simulación: resolvió de verdad. */
    | { tipo: 'aplicada' }
    /** El servidor devuelve sus 409 como `bloqueo`: NO_PENDIENTE no es un bloqueo, es «ya la resolvió otra persona». */
    | { tipo: 'ya_cerrada'; error: { status: number; code: string; message: string } }
    /**
     * REINTENTAR como `bloqueo` tampoco bloquea la decisión: no se pudo calcular ahora. La ventana
     * lo trata como simulación fallida (decide el servidor al confirmar).
     */
    | { tipo: 'reintentar'; error: { status: number; code: string; message: string } };

export function interpretarSimulacion(raw: unknown): ResultadoSimulacion {
    if (simulacionFueAplicada(raw)) return { tipo: 'aplicada' };
    const sim = normalizarSimulacion(raw);
    if (sim.bloqueo?.code) {
        const error = { status: 409, code: sim.bloqueo.code, message: sim.bloqueo.message };
        if (avisoYaCerrada(error, 'resolver', 'simular')) return { tipo: 'ya_cerrada', error };
        if (esReintentar(error)) return { tipo: 'reintentar', error };
    }
    return { tipo: 'ok', sim };
}

/**
 * ¿Hay que cerrar la ventana y refrescar? Sí si ya no queda nada que decidir (avisoYaCerrada) o si
 * la simulación terminó aplicando la decisión. Los demás errores se muestran dentro de la ventana.
 */
export function debeCerrarModal(
    error: { status?: number; code?: string; message?: string } | null | undefined,
    accion: 'resolver' | 'rehacer' = 'resolver',
): boolean {
    return !!avisoYaCerrada(error, accion) || error?.code === CODIGO_APLICADA_SIN_SIMULAR;
}

/** Régimen del plan de rehacer en palabras (el backend manda 'nuevo' / 'anterior'). */
export function rotuloRegimen(regimen: string | null | undefined): string | null {
    const r = regimen?.trim().toLowerCase();
    if (!r) return null;
    if (r.startsWith('nuev')) return 'Recepción con la regla de stock por viaje (el origen descontó al recibir)';
    if (r.startsWith('ant') || r === 'legacy') return 'Solicitud antigua (el origen descontó lo enviado al aprobar)';
    return regimen!.trim();
}

/**
 * Un aviso suelto del plan: texto, o un objeto con su mensaje, o un ajuste manual del ítem
 * (ubicación, cantidades, fecha, motivo) que se describe en una línea.
 */
function textoAviso(v: unknown): string | null {
    if (typeof v === 'string') return leerTexto(v);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const r = v as Record<string, unknown>;
    const directo = leerTexto(r.mensaje) ?? leerTexto(r.message) ?? leerTexto(r.texto) ?? leerTexto(r.aviso);
    if (directo) return directo;
    const lugar = leerTexto(r.ubicacion_nombre) ?? leerTexto(r.ubicacion);
    const antes = numeroONull(r.cantidad_anterior ?? r.antes);
    const despues = numeroONull(r.cantidad_nueva ?? r.despues);
    const delta = numeroONull(r.cantidad);
    const cambio = antes != null && despues != null
        ? `${fmtCantidad(antes)} → ${fmtCantidad(despues)}`
        : delta != null ? `${delta > 0 ? '+' : '−'}${fmtCantidad(Math.abs(delta))}` : null;
    const fechaRaw = leerTexto(r.fecha) ?? leerTexto(r.created_at);
    const fecha = fechaRaw && !Number.isNaN(new Date(fechaRaw).getTime())
        ? new Date(fechaRaw).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })
        : fechaRaw;
    const motivo = leerTexto(r.motivo);
    if (!lugar && !cambio && !motivo) return null;
    const partes = [
        `Ajuste manual posterior${lugar ? ` en ${lugar}` : ''}${cambio ? `: ${cambio}` : ''}`,
        fecha,
        motivo,
    ].filter(Boolean);
    return partes.join(' · ');
}

/**
 * Con qué empieza el aviso de REHACER cuando alguien ajustó el ítem a mano después de la recepción
 * («Hubo ajustes manuales después: <fecha> <ubicación> a→b (<usuario>); … Puede que ya esté
 * corregido: revísalo antes de rehacer.»). El servidor lo pega AL FINAL de `aviso`.
 */
export const PREFIJO_AJUSTES_MANUALES = 'Hubo ajustes manuales después:';

/** Saca del `aviso` del plan la parte de ajustes manuales posteriores (va al final). */
export function separarAjustesManuales(aviso: string | null): { aviso: string | null; manuales: string | null } {
    if (!aviso) return { aviso: null, manuales: null };
    const i = aviso.indexOf(PREFIJO_AJUSTES_MANUALES);
    if (i < 0) return { aviso, manuales: null };
    return { aviso: aviso.slice(0, i).trim() || null, manuales: aviso.slice(i).trim() };
}

/**
 * Desglosa el aviso de ajustes manuales para mostrarlo como lista: cada ajuste («22-10-2026 14:05
 * Bascuñan 661 12→10 (Ana)») y el cierre («Puede que ya esté corregido: …»). null si no tiene esa forma.
 */
export function desglosarAjustesManuales(texto: string): { entradas: string[]; cierre: string | null } | null {
    if (!texto.startsWith(PREFIJO_AJUSTES_MANUALES)) return null;
    const cuerpo = texto.slice(PREFIJO_AJUSTES_MANUALES.length).trim();
    // Se corta en el cierre conocido, no en el primer «. » (hay nombres como «Av. Matta»).
    const corte = cuerpo.lastIndexOf('. Puede que');
    const lista = (corte >= 0 ? cuerpo.slice(0, corte) : cuerpo).replace(/\.$/u, '');
    const cierre = corte >= 0 ? cuerpo.slice(corte + 2).trim() || null : null;
    const entradas = lista.split(';').map(x => x.trim()).filter(Boolean);
    return entradas.length ? { entradas, cierre } : null;
}

/**
 * Avisos sueltos del plan de rehacer (p. ej. ajustes manuales del ítem posteriores a la recepción,
 * que el plan no ve). Acepta `avisos` y `ajustes_manuales` / `ajustes_posteriores`; descarta los
 * que ya están dentro de `aviso` y los repetidos.
 */
export function avisosDelPlan(r: Record<string, unknown>, aviso: string | null): string[] {
    const crudos = [r.avisos, r.ajustes_manuales, r.ajustes_posteriores]
        .flatMap(v => (Array.isArray(v) ? v : []));
    const vistos = new Set<string>();
    const fuera: string[] = [];
    for (const c of crudos) {
        const t = textoAviso(c);
        if (!t || vistos.has(t) || (aviso && aviso.includes(t))) continue;
        vistos.add(t);
        fuera.push(t);
    }
    return fuera;
}

/**
 * Normaliza la respuesta de POST /transferencias/discrepancias/:id/rehacer (simulada o no).
 * `respaldo` completa lo que no venga (id, ítem, cantidades) con la fila que ya tiene la pantalla.
 */
export function normalizarPlanRehacer(
    raw: unknown,
    respaldo: { id: number; item?: string | null; enviada?: number | string | null; recibida?: number | string | null },
): RehacerDiscrepanciaPlan {
    const r = comoObjeto(raw);
    const item = leerTexto(r.item)
        ?? (r.item && typeof r.item === 'object' ? leerTexto((r.item as Record<string, unknown>).descripcion) : null)
        ?? leerTexto(r.item_descripcion)
        ?? (respaldo.item?.trim() || null);
    const enviada = numeroONull(r.enviada) ?? numeroONull(respaldo.enviada) ?? 0;
    const recibida = numeroONull(r.recibida) ?? numeroONull(respaldo.recibida) ?? 0;
    const dif = numeroONull(r.dif) ?? redondear(recibida - enviada);
    // Los ajustes manuales posteriores van aparte (bloque propio en la ventana), no mezclados en `aviso`.
    const { aviso, manuales } = separarAjustesManuales(leerTexto(r.aviso));
    const sueltos = avisosDelPlan(r, aviso);
    return {
        id: numeroONull(r.id) ?? respaldo.id,
        transferencia_codigo: leerTexto(r.transferencia_codigo),
        item,
        enviada,
        recibida,
        dif,
        regimen: leerTexto(r.regimen),
        ajustes: normalizarAjustes(r.ajustes),
        aviso,
        avisos: manuales ? [manuales, ...sueltos.filter(a => a !== manuales)] : sueltos,
        estado_anterior: leerTexto(r.estado_anterior),
    };
}

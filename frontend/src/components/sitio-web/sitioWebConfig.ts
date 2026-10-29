import type { EstadoDerivado, EstadoPaso } from './tipos';

/**
 * Textos y clases chicas del Sitio web (mig 147, docs/reglas/sitio-web.md). Las reglas viven en `reglas.ts` (con
 * test) y en el backend; aquí solo lo que la pantalla dice.
 */

/** Campo de texto largo (los `Input` ya son `text-base`): 16 px para que el iPhone no agrande la página al tocarlo. */
export const CAMPO = 'w-full px-3 py-2.5 rounded-xl border border-border bg-card text-base text-brand-dark focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary placeholder:text-muted-foreground/70 disabled:cursor-not-allowed disabled:opacity-60';

/** La regla del dueño (28-10), tal cual se repite en la pantalla. */
export const REGLA_NADIE_RECONOCIBLE = 'Nadie reconocible: ni caras, ni nombres en cascos o chalecos, ni patentes.';
export const TEXTO_CONFIRMA_SIN_PERSONAS = 'Confirmo que en la foto no se reconoce a ninguna persona';

/** Qué quiere decir cada estado de una obra, para el `title` del badge y la cabecera de la obra. */
export const AYUDA_ESTADO: Record<EstadoDerivado, string> = {
    borrador: 'No está en el sitio. Complétala e inclúyela para que salga en la próxima publicación.',
    listo: 'Completa e incluida: sale al sitio en la próxima publicación.',
    cambios: 'Está en el sitio, pero lo de aquí es distinto: los cambios salen en la próxima publicación.',
    incompleta: 'Está en el sitio, pero aquí ahora le faltan datos: el sitio mantiene la versión anterior hasta que los completes (publicar no la cambia).',
    publicando: 'Publicada: el sitio se actualiza en unos 5 a 10 minutos.',
    publicada: 'El sitio muestra exactamente esto.',
    no_llego: 'El sitio sigue mostrando la versión anterior (la compilación del sitio falló). Avisa a Mauricio.',
    retiro_pendiente: 'Se quitó del sitio aquí: se retira en la próxima publicación.',
};

/** Pasos después del commit (GET /publicaciones/:id → pasos). */
export const TITULO_PASO: Record<'commit' | 'compilacion' | 'en_linea', string> = {
    commit: 'Entró al repositorio del sitio',
    compilacion: 'El sitio se compila',
    en_linea: 'Se ve en el sitio',
};
export const TEXTO_PASO: Record<EstadoPaso, string> = {
    ok: 'Listo',
    pendiente: 'Esperando…',
    en_cola: 'En cola',
    compilando: 'Compilando',
    fallo: 'Falló: el sitio sigue mostrando la versión anterior. Avisa a Mauricio.',
    reemplazada: 'Reemplazada por una publicación posterior (no es un error)',
    no_llego: 'No llegó al sitio: sigue mostrando la versión anterior. Avisa a Mauricio.',
};

/** Lo que dice la pantalla de cada código de error de una publicación (el mensaje del servidor va debajo). */
export const TEXTO_CODIGO: Record<string, string> = {
    SITIO_WEB_TOKEN_INVALIDO: 'El permiso de la Bóveda para publicar en GitHub no sirve (venció o lo revocaron). Avisa a Mauricio.',
    SITIO_WEB_SIN_ACCESO: 'La Bóveda no tiene acceso al repositorio del sitio. Avisa a Mauricio.',
    SITIO_WEB_REPO_MODIFICADO: 'Alguien cambió a mano las obras en el repositorio del sitio. No se pisó nada: hay que resincronizar.',
    SITIO_WEB_REPO_OCUPADO: 'El repositorio del sitio estaba recibiendo otros cambios. Espera un minuto y vuelve a publicar.',
    SITIO_WEB_BLOQUEADA: 'No se publicó nada: hay algo que corregir antes.',
    SITIO_WEB_GITHUB_TIMEOUT: 'GitHub no respondió a tiempo. No se publicó nada: vuelve a intentarlo en unos minutos.',
    SITIO_WEB_GITHUB_LIMITE: 'GitHub pidió esperar (límite de uso). Vuelve a intentarlo en unos minutos.',
    SITIO_WEB_GITHUB_RECHAZO: 'GitHub no dejó cambiar la rama del sitio (una regla o protección de la rama). No se publicó nada: avisa a Mauricio.',
    SITIO_WEB_FOTO_RECHAZADA_QUEDA: 'Una foto rechazada queda registrada para que no vuelva a salir: no se borra.',
    SITIO_WEB_FOTO_PUBLICADA: 'Esta foto está en el sitio: borrarla aquí no la saca de ahí. Quien publica tiene que rechazarla y publicar.',
    SITIO_WEB_PUBLICACION_EN_CURSO: 'Otra persona está publicando en este momento. Espera a que termine.',
};

interface RespuestaError { status?: number; data?: { error?: string; message?: string; code?: string; faltantes?: unknown; rutas?: unknown; problemas?: unknown } }

/** El `code` de un 4xx del servidor (los 5xx no lo traen). */
export function codigoError(e: unknown): string | null {
    const r = (e as { response?: RespuestaError })?.response;
    return r && (r.status ?? 0) < 500 && typeof r.data?.code === 'string' ? r.data.code : null;
}

/** Lo que el servidor mandó junto al error (faltantes, rutas, problemas). */
export function datosError<T = unknown>(e: unknown, clave: 'faltantes' | 'rutas' | 'problemas'): T | null {
    const d = (e as { response?: RespuestaError })?.response?.data;
    return d && d[clave] !== undefined ? (d[clave] as T) : null;
}

/**
 * El texto para la persona: en un 4xx el `error` del servidor (escrito para ella) o el de su `code`; en un 5xx el
 * `error` genérico; sin respuesta (se cortó la conexión o pasó el tiempo), `porDefecto`.
 */
export function mensajeError(e: unknown, porDefecto: string): string {
    const r = (e as { response?: RespuestaError; code?: string })?.response;
    if (!r) {
        return (e as { code?: string })?.code === 'ECONNABORTED'
            ? 'La respuesta tardó demasiado. Revisa en un minuto si se hizo antes de volver a intentarlo.'
            : porDefecto;
    }
    const code = codigoError(e);
    return r.data?.error || (code ? TEXTO_CODIGO[code] : null) || r.data?.message || porDefecto;
}

/** La publicación espera la respuesta en la misma petición (Passenger: nada en segundo plano). */
export const TIMEOUT_PUBLICAR_MS = 120_000;
/** Cada cuánto se consulta una publicación que todavía no se ve en el sitio. */
export const SONDEO_PUBLICACION_MS = 10_000;

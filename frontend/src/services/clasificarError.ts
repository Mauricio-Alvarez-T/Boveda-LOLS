/**
 * Qué es cada error, por el CÓDIGO de la respuesta del servidor y no por el cartel rojo (Marcos 2026-10-26: «que sepas
 * discernir un problema real y no me mandes 100 pantallazos»). Lo usan `api.ts` (cada respuesta) y el ErrorBoundary
 * (pantalla rota); `reporteErrores.ts` manda el aviso. Ver docs/reglas/seguridad-rbac.md § Errores.
 *
 *   falla     500 y otros 5xx (no 502/503/504)       → aviso + foto (una falla real del servidor)
 *   app       la pantalla se rompió (ErrorBoundary)   → aviso + foto
 *   permiso   403 con `required` (el servidor dice qué permiso falta), solo al guardar/hacer algo → aviso sin foto
 *   lento     no llegó respuesta con internet, tardó más de 15 s, 408, 429, 502/503/504 (reinicio del deploy) → se cuenta
 *   sin_senal no llegó respuesta y el teléfono dice que no tiene internet → se cuenta
 *   dato      400/404/409/413/422… al guardar/hacer algo: algo mal ingresado o una regla de la app → se cuenta
 *   (nada)    401 (sesión vencida), cancelados, «ver como», lecturas (GET) con 4xx, y los propios avisos
 */

export type CategoriaError = 'falla' | 'app' | 'permiso' | 'lento' | 'sin_senal' | 'dato';

export interface AvisoError {
    categoria: CategoriaError;
    mensaje: string;
    accion?: string;
    codigo?: number;
    permisos_faltantes?: string[];
    detalle_tecnico?: string;
    duracion_ms?: number;
}

/** Más que esto esperando una respuesta = «lento» (aunque al final llegue). */
export const LENTO_MS = 15_000;

export interface EntradaRespuesta {
    metodo?: string;
    url?: string;
    /** Código de la respuesta; undefined = no llegó respuesta. */
    status?: number;
    data?: unknown;
    /** La petición la canceló la propia app (se cerró la pantalla, se cambió de filtro…). */
    cancelado?: boolean;
    /** `navigator.onLine` en ese momento. */
    enLinea?: boolean;
    duracionMs?: number;
    /** 403 de «ver como» (solo lectura): no es un error de la persona. */
    soloLectura?: boolean;
}

/** «POST /api/transferencias/:id/recibir»: sin la consulta y con los números como :id (para agrupar repetidos). */
export function accionDe(metodo: string | undefined, url: string | undefined): string | undefined {
    if (!url) return undefined;
    const ruta = url.split('?')[0].replace(/^https?:\/\/[^/]+/, '').replace(/\/\d+(?=\/|$)/g, '/:id');
    const conApi = ruta.startsWith('/api') ? ruta : `/api${ruta.startsWith('/') ? '' : '/'}${ruta}`;
    return `${(metodo || 'GET').toUpperCase()} ${conApi}`.slice(0, 255);
}

/** Rutas cuyos errores no se avisan: los propios avisos (no hacer un bucle) y el inicio de sesión. */
const NO_AVISAR = [/\/soporte\/errores(\/|$|\?)/, /\/auth\//];

const textoDe = (data: unknown): string | undefined => {
    if (!data || typeof data !== 'object') return undefined;
    const d = data as { error?: unknown; message?: unknown };
    const t = typeof d.error === 'string' ? d.error : typeof d.message === 'string' ? d.message : undefined;
    return t?.trim() || undefined;
};

const segundos = (ms?: number) => (ms === undefined ? '' : ` (${Math.round(ms / 1000)} s)`);

/** Un error de una petición al servidor → su aviso, o null si no hay nada que avisar. */
export function clasificarRespuesta(e: EntradaRespuesta): AvisoError | null {
    if (e.cancelado || e.soloLectura) return null;
    if (e.url && NO_AVISAR.some(re => re.test(e.url!))) return null;
    const metodo = (e.metodo || 'GET').toUpperCase();
    const esLectura = metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS';
    const base = { accion: accionDe(metodo, e.url), duracion_ms: e.duracionMs };

    // Sin respuesta: sin internet, o se cortó / el servidor no contestó.
    if (e.status === undefined) {
        if (e.enLinea === false) return { ...base, categoria: 'sin_senal', mensaje: 'Sin conexión: el teléfono no tenía internet' };
        return { ...base, categoria: 'lento', mensaje: `No llegó respuesta del servidor${segundos(e.duracionMs)}` };
    }
    const s = e.status;
    const texto = textoDe(e.data);

    if (s === 401) return null;
    if (s >= 500) {
        // 502/503/504: el servidor no contestó (lo normal durante el reinicio de un deploy), no una falla del código.
        if (s === 502 || s === 503 || s === 504) {
            return { ...base, categoria: 'lento', codigo: s, mensaje: `El servidor no respondió (código ${s})` };
        }
        return { ...base, categoria: 'falla', codigo: s, mensaje: texto || 'Falla del servidor' };
    }
    if (s === 408 || s === 429) {
        return { ...base, categoria: 'lento', codigo: s, mensaje: s === 429 ? 'El servidor frenó las peticiones (demasiadas seguidas)' : 'El servidor tardó demasiado' };
    }
    // Lo demás (4xx) solo importa al guardar o hacer algo: las lecturas con 4xx son de fondo (la pantalla ya filtra).
    if (esLectura) return null;
    if (s === 403) {
        const required = (e.data as { required?: unknown } | undefined)?.required;
        if (Array.isArray(required) && required.length) {
            return {
                ...base, categoria: 'permiso', codigo: s, mensaje: texto || 'No tienes permisos para esta acción',
                permisos_faltantes: required.map(String).slice(0, 10),
            };
        }
        // Un 403 sin permiso que falte es una regla de la app («no puedes aprobar tu propia solicitud»).
        return { ...base, categoria: 'dato', codigo: s, mensaje: texto || 'La app no permite hacer esto' };
    }
    if (s >= 400) return { ...base, categoria: 'dato', codigo: s, mensaje: texto || `No se pudo (código ${s})` };
    return null;
}

/** Una respuesta que llegó bien pero tardó más de LENTO_MS → «lento». */
export function clasificarDemora(metodo: string | undefined, url: string | undefined, duracionMs: number): AvisoError | null {
    if (duracionMs < LENTO_MS) return null;
    if (url && NO_AVISAR.some(re => re.test(url))) return null;
    return {
        categoria: 'lento', accion: accionDe(metodo, url), duracion_ms: Math.round(duracionMs),
        mensaje: `Respondió, pero tardó ${Math.round(duracionMs / 1000)} s`,
    };
}

/** Errores de pantalla que NO son una falla del código: la app no alcanzó a bajar una parte (deploy nuevo, señal). */
const NO_ES_FALLA_DE_PANTALLA = /dynamically imported module|Loading chunk|Importing a module script failed|Failed to fetch|NetworkError/i;

/** La pantalla se rompió (ErrorBoundary) → su aviso. */
export function clasificarPantallaRota(error: unknown, componentStack?: string | null): AvisoError {
    const e = error instanceof Error ? error : new Error(String(error));
    const detalle = [`${e.name}: ${e.message}`, e.stack, componentStack].filter(Boolean).join('\n').slice(0, 4000);
    if (NO_ES_FALLA_DE_PANTALLA.test(`${e.name} ${e.message}`)) {
        return { categoria: 'lento', mensaje: 'No cargó una parte de la app (versión nueva o mala señal)', detalle_tecnico: detalle };
    }
    return { categoria: 'app', mensaje: `La pantalla se rompió: ${e.message}`.slice(0, 300), detalle_tecnico: detalle };
}

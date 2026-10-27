import api from './api';

/**
 * Avisos al celular (mig 143; docs/reglas/seguridad-rbac.md § Avisos al celular). Usa las notificaciones del navegador:
 * la persona toca «Activar avisos», el teléfono pregunta «¿Permitir notificaciones?» y el navegador da una dirección
 * para mandarle avisos (no el número de teléfono). El archivo `public/sw-avisos.js` los recibe y abre la pantalla.
 * Prueba piloto: solo el Super Administrador (el servidor lo exige).
 */

export const ARCHIVO_AVISOS = '/sw-avisos.js';

/** Lo que se puede hacer en este celular, para decidir qué mostrar. */
export type EstadoAvisos =
    | 'no_soportado'      // el navegador no sabe recibir avisos
    | 'iphone_instalar'   // iPhone/iPad: primero hay que agregar Bóveda a la pantalla de inicio
    | 'bloqueado'         // la persona dijo que no: se cambia en los ajustes del navegador
    | 'inactivo'          // se puede activar
    | 'activo';           // este celular ya recibe avisos

export interface Entorno {
    tieneServiceWorker: boolean;
    tienePush: boolean;
    tieneNotificaciones: boolean;
    permiso: 'default' | 'granted' | 'denied' | null;
    esIos: boolean;
    instalada: boolean;
    suscrito: boolean;
}

/** Qué mostrar (lógica pura, con test). */
export function estadoAvisos(e: Entorno): EstadoAvisos {
    if (e.esIos && !e.instalada) return 'iphone_instalar';
    if (!e.tieneServiceWorker || !e.tienePush || !e.tieneNotificaciones) return 'no_soportado';
    if (e.permiso === 'denied') return 'bloqueado';
    return e.suscrito && e.permiso === 'granted' ? 'activo' : 'inactivo';
}

/** La clave pública (base64url) como la pide `pushManager.subscribe`. */
export function claveABytes(base64url: string): Uint8Array<ArrayBuffer> {
    const relleno = '='.repeat((4 - (base64url.length % 4)) % 4);
    const b64 = (base64url + relleno).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

const esIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => window.matchMedia?.('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registro(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration(ARCHIVO_AVISOS)) ?? null;
}

/** El estado de ESTE celular (sin preguntar nada a la persona). */
export async function leerEstado(): Promise<EstadoAvisos> {
    const reg = await registro().catch(() => null);
    const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
    return estadoAvisos({
        tieneServiceWorker: 'serviceWorker' in navigator,
        tienePush: typeof window !== 'undefined' && 'PushManager' in window,
        tieneNotificaciones: typeof Notification !== 'undefined',
        permiso: typeof Notification !== 'undefined' ? Notification.permission : null,
        esIos: esIos(),
        instalada: !!instalada(),
        suscrito: !!sub,
    });
}

/** «Activar avisos»: registra el archivo, pide permiso, se suscribe y se lo cuenta al servidor. */
export async function activarAvisos(): Promise<EstadoAvisos> {
    const reg = await navigator.serviceWorker.register(ARCHIVO_AVISOS);
    await navigator.serviceWorker.ready;
    const permiso = await Notification.requestPermission();
    if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'inactivo';
    const { data } = await api.get<{ data: { clave: string } }>('/avisos-celular/clave');
    const sub = (await reg.pushManager.getSubscription())
        ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(data.data.clave) });
    await api.post('/avisos-celular/suscribir', sub.toJSON());
    return 'activo';
}

/** «Desactivar»: se desuscribe aquí y lo borra en el servidor. */
export async function desactivarAvisos(): Promise<EstadoAvisos> {
    const reg = await registro();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) {
        await api.delete('/avisos-celular/suscribir', { data: { endpoint: sub.endpoint } }).catch(() => { /* igual se desuscribe aquí */ });
        await sub.unsubscribe().catch(() => false);
    }
    return 'inactivo';
}

/** «Mandarme un aviso de prueba». */
export async function probarAviso(): Promise<void> {
    await api.post('/avisos-celular/probar');
}

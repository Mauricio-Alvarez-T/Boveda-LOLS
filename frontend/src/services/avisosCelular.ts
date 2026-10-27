import api from './api';

/**
 * Avisos al celular (mig 143; docs/reglas/seguridad-rbac.md § Avisos al celular). Usa las notificaciones del navegador:
 * la persona toca «Activar avisos», el teléfono pregunta «¿Permitir notificaciones?» y el navegador da una dirección
 * para mandarle avisos (no el número de teléfono). El archivo `public/sw-avisos.js` los recibe, abre la pantalla y
 * confirma solo si le llegó y si lo abrió (centro de avisos de Soporte, mig 145). Sirve igual en el computador.
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

/** Los pasos de «Activar avisos», para decir dónde se trabó. */
export type PasoActivar = 'permiso' | 'archivo' | 'clave' | 'suscripcion' | 'servidor';

/** Un paso de «Activar avisos» que falló o tardó demasiado. `message` = «paso: causa» (el «Detalle para soporte»). */
export class FalloActivar extends Error {
    readonly paso: PasoActivar;
    constructor(paso: PasoActivar, causa: string) {
        super(`${paso}: ${causa}`);
        this.name = 'FalloActivar';
        this.paso = paso;
    }
}

/** Tope para responder la pregunta «¿Permitir?» (la persona puede estar leyéndola). */
export const TOPE_PERMISO_MS = 45_000;
/** Tope para cada uno de los demás pasos: nunca deja el botón girando para siempre. */
export const TOPE_PASO_MS = 20_000;

async function paso<T>(nombre: PasoActivar, p: Promise<T>, ms = TOPE_PASO_MS): Promise<T> {
    let reloj: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            p,
            new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new FalloActivar(nombre, 'tardó demasiado')), ms); }),
        ]);
    } catch (e) {
        if (e instanceof FalloActivar) throw e;
        const err = e as { name?: string; message?: string } | null;
        throw new FalloActivar(nombre, [err?.name, err?.message].filter(Boolean).join(': ').slice(0, 200) || 'error');
    } finally {
        clearTimeout(reloj);
    }
}

/** La pregunta del navegador (los antiguos responden por callback y no con promesa). */
function pedirPermiso(): Promise<NotificationPermission> {
    return new Promise(resolve => {
        const r = Notification.requestPermission(resolve);
        if (r && typeof r.then === 'function') r.then(resolve);
    });
}

/**
 * «Activar avisos». PRIMERO la pregunta «¿Permitir?», en el mismo toque (27-10-2026: antes se registraba el archivo
 * primero; con esa espera algunos celulares ya no mostraban la pregunta y el botón «no hacía nada»). Después registra el
 * archivo, se suscribe y se lo cuenta al servidor. Cada paso tiene tope; si uno falla o tarda, lanza `FalloActivar`.
 */
export async function activarAvisos(): Promise<EstadoAvisos> {
    if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        throw new FalloActivar('permiso', 'este navegador no tiene avisos');
    }
    const permiso = Notification.permission === 'granted' ? 'granted' : await paso('permiso', pedirPermiso(), TOPE_PERMISO_MS);
    if (permiso !== 'granted') return permiso === 'denied' ? 'bloqueado' : 'inactivo';
    const reg = await paso('archivo', navigator.serviceWorker.register(ARCHIVO_AVISOS));
    await paso('archivo', navigator.serviceWorker.ready);
    const { data } = await paso('clave', api.get<{ data: { clave: string } }>('/avisos-celular/clave'));
    const sub = await paso('suscripcion', (async () => (await reg.pushManager.getSubscription())
        ?? reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveABytes(data.data.clave) }))());
    await paso('servidor', api.post('/avisos-celular/suscribir', sub.toJSON()));
    return 'activo';
}

/** Por qué no se activaron, en palabras (lógica pura, con test). */
export function motivoFalloActivar(p: PasoActivar, equipo: 'celular' | 'computador'): string {
    if (p === 'permiso') return 'la pregunta para permitir los avisos no respondió';
    if (p === 'archivo') return `este ${equipo} no pudo prepararse para recibir avisos`;
    if (p === 'suscripcion') return `el servicio de avisos de este ${equipo} no respondió`;
    return 'no hubo conexión con Bóveda (revise la señal o el internet)';
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

/**
 * Pide al navegador que revise si cambió `public/sw-avisos.js` (al abrir Bóveda): así quien ya activó los avisos recibe
 * la versión nueva sin hacer nada.
 */
export async function actualizarArchivoAvisos(): Promise<void> {
    const reg = await registro().catch(() => null);
    await reg?.update().catch(() => undefined);
}

/** «Mandarme un aviso de prueba». */
export async function probarAviso(): Promise<void> {
    await api.post('/avisos-celular/probar');
}

export type Equipo = 'celular' | 'computador';

export interface CelularServidor {
    id: string;
    equipo?: Equipo;
    dispositivo: string | null;
    ultimo_envio: string | null;
    ultimo_error: string | null;
    creado: string | null;
}

export interface EstadoServidor {
    /** Todos los equipos (celulares + computadores). */
    celulares: number;
    porEquipo: Record<Equipo, number>;
    lista: CelularServidor[];
    debeActivar: boolean;
    debeActivarComputador: boolean;
}

/** Lo que el servidor sabe de mis equipos (para ver dónde se pierde un aviso). */
export async function estadoServidor(): Promise<EstadoServidor> {
    const { data } = await api.get<{ data: {
        celulares: number; por_equipo?: Partial<Record<Equipo, number>>; lista?: CelularServidor[];
        debe_activar?: boolean; debe_activar_computador?: boolean;
    } }>('/avisos-celular/estado');
    const d = data.data;
    return {
        celulares: Number(d.celulares) || 0,
        porEquipo: { celular: Number(d.por_equipo?.celular) || 0, computador: Number(d.por_equipo?.computador) || 0 },
        lista: d.lista ?? [],
        debeActivar: !!d.debe_activar,
        debeActivarComputador: !!d.debe_activar_computador,
    };
}

/**
 * Qué pedirle a la persona al abrir Bóveda (lógica pura, con test). En el celular, a todo el horario de recordatorios;
 * en el computador, solo a quien trabaja casi siempre ahí (`debeActivarComputador`). Y como los recordatorios llegan
 * SIEMPRE al celular, en el computador se le recuerda activarlos en el celular si todavía no tiene ninguno.
 */
export type PedidoAvisos = 'nada' | 'activar' | 'bloqueado' | 'iphone' | 'resincronizar' | 'falta_celular';
export function pedidoAvisos(o: {
    debeActivar: boolean; debeActivarComputador?: boolean; esCelular: boolean; mirando: boolean; estado: EstadoAvisos;
    celularesServidor: number; computadoresServidor?: number;
}): PedidoAvisos {
    if (!o.debeActivar || o.mirando) return 'nada';
    if (o.esCelular || o.debeActivarComputador) {
        const aquiEnServidor = o.esCelular ? o.celularesServidor : (o.computadoresServidor ?? 0);
        if (o.estado === 'inactivo') return 'activar';
        if (o.estado === 'bloqueado') return 'bloqueado';
        if (o.estado === 'iphone_instalar') return 'iphone';
        if (o.estado === 'activo' && aquiEnServidor === 0) return 'resincronizar';
    }
    if (!o.esCelular && o.celularesServidor === 0) return 'falta_celular';
    return 'nada';
}

/**
 * «Probar solo este celular»: muestra un aviso desde el propio teléfono, sin pasar por internet. Si aparece, el
 * celular sí sabe mostrar avisos (permiso y ajustes bien) y lo que falla es la entrega.
 */
export async function avisoLocal(): Promise<void> {
    const reg = await registro();
    if (!reg) throw new Error('sin registro');
    await reg.showNotification('Bóveda LOLS', { body: 'Prueba de este celular: sí muestra avisos.', icon: '/icon-192.png', tag: 'prueba-local' });
}

export interface PersonaRecordatorios {
    id: number;
    nombre: string;
    celulares: number;
    computadores?: number;
    /** Trabaja casi siempre en el computador: también se le piden los avisos ahí. */
    usa_computador?: boolean;
    horas: number[];
    hoy: string | null;
}

/** (Super Administrador) Quién está en el horario de recordatorios, si tiene los avisos activos y qué se le mandó hoy. */
export async function resumenRecordatorios(): Promise<PersonaRecordatorios[]> {
    const { data } = await api.get<{ data: PersonaRecordatorios[] }>('/avisos-celular/resumen');
    return data.data ?? [];
}

/** Un aviso mandado a un equipo, con lo que el equipo confirmó (centro de avisos, mig 145). */
export interface AvisoEnviado {
    id: number;
    usuario_id: number;
    nombre: string;
    equipo: Equipo | null;
    tipo: string;
    titulo: string;
    cuerpo: string | null;
    url: string | null;
    estado_envio: 'enviando' | 'entregado' | 'fallo';
    error: string | null;
    enviado_en: string;
    mostrado_en: string | null;
    abierto_en: string | null;
    descartado_en: string | null;
    en_pantalla_en: string | null;
}

/** (Super Administrador) Los avisos de los últimos días, del más nuevo al más viejo. */
export async function avisosEnviados(dias = 7, usuarioId?: number): Promise<AvisoEnviado[]> {
    const { data } = await api.get<{ data: AvisoEnviado[] }>('/avisos-celular/mensajes', { params: { dias, usuario: usuarioId } });
    return data.data ?? [];
}

const horaDe = (raw: string | null): string => {
    const d = raw ? new Date(raw) : null;
    return d && !Number.isNaN(d.getTime()) ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '';
};

/**
 * Qué pasó con el aviso en ese equipo, en palabras (lógica pura, con test). `tono`: ok = le apareció o lo abrió;
 * espera = salió y el equipo aún no confirma; aviso = no se mostró porque ya estaba en Bóveda; error = no salió.
 * «Le llegó» = apareció en su equipo; no se puede saber si lo leyó sin abrirlo.
 */
export function estadoDelAviso(a: Pick<AvisoEnviado, 'estado_envio' | 'error' | 'mostrado_en' | 'abierto_en' | 'descartado_en' | 'en_pantalla_en'>):
    { texto: string; tono: 'ok' | 'espera' | 'aviso' | 'error' } {
    if (a.abierto_en) return { texto: `${a.mostrado_en ? `Le llegó ${horaDe(a.mostrado_en)} · ` : ''}lo abrió ${horaDe(a.abierto_en)}`, tono: 'ok' };
    if (a.en_pantalla_en) return { texto: `No se mostró: tenía Bóveda abierto en el computador (${horaDe(a.en_pantalla_en)})`, tono: 'aviso' };
    if (a.descartado_en) return { texto: `Le llegó ${horaDe(a.mostrado_en || a.descartado_en)} · lo cerró sin abrirlo`, tono: 'ok' };
    if (a.mostrado_en) return { texto: `Le llegó ${horaDe(a.mostrado_en)} · todavía no lo abre`, tono: 'ok' };
    if (a.estado_envio === 'fallo') return { texto: `No salió${a.error ? `: ${a.error}` : ''}`, tono: 'error' };
    if (a.estado_envio === 'entregado') return { texto: 'Salió · el equipo aún no confirma (apagado o sin internet)', tono: 'espera' };
    return { texto: 'Enviando…', tono: 'espera' };
}

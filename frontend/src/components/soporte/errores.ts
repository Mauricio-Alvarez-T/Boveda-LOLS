import type { CategoriaError } from '../../services/clasificarError';
import { normalizar } from '../../utils/busquedaTrabajadores';

/**
 * «Errores» de Soporte (mig 141): tipos y textos de la bandeja (lógica pura, con test). Qué es cada categoría lo
 * decide `services/clasificarError.ts` por el código de la respuesta; acá solo se explica para quien revisa.
 */

/** Los tonos de Chip (ui/Chip.tsx: se repiten acá porque las pruebas de lógica no compilan .tsx). */
export type TonoError = 'neutral' | 'warning' | 'danger' | 'info';

export interface PermisoFaltante {
    clave: string;
    nombre: string;
}

/** Una fila de GET /api/soporte/errores. */
export interface ErrorSoporte {
    id: number;
    usuario_id: number;
    usuario_nombre: string;
    usuario_email?: string | null;
    rol_nombre?: string | null;
    categoria: CategoriaError;
    mensaje: string;
    accion?: string | null;
    codigo?: number | null;
    permisos_faltantes: PermisoFaltante[];
    detalle_tecnico?: string | null;
    pantalla?: string | null;
    pantalla_nombre?: string | null;
    obra_id?: number | null;
    obra_nombre?: string | null;
    dispositivo?: 'movil' | 'escritorio' | null;
    navegador?: string | null;
    duracion_ms?: number | null;
    veces: number;
    primera_vez: string;
    ultima_vez: string;
    foto_bytes?: number | null;
    tiene_foto: boolean;
    foto_pedida: boolean;
    foto_borrada_en?: string | null;
    descripcion?: string | null;
    estado: 'pendiente' | 'revisado';
    nota?: string | null;
    revisado_en?: string | null;
    revisado_por_nombre?: string | null;
}

export type VistaErrores = 'revisar' | 'senal' | 'datos' | 'revisados' | 'todos';

export const VISTAS_ERRORES: readonly { key: VistaErrores; label: string }[] = [
    { key: 'revisar', label: 'Para revisar' },
    { key: 'senal', label: 'Señal y lentitud' },
    { key: 'datos', label: 'Datos mal ingresados' },
    { key: 'revisados', label: 'Revisados' },
    { key: 'todos', label: 'Todos' },
];

export const CATEGORIA_ERROR: Record<CategoriaError, { etiqueta: string; explicacion: string; tono: TonoError }> = {
    falla: {
        etiqueta: 'Falla del servidor', tono: 'danger',
        explicacion: 'El servidor falló al hacer lo que la persona pidió. Es un error de la app: hay que revisarlo.',
    },
    app: {
        etiqueta: 'Pantalla rota', tono: 'danger',
        explicacion: 'La pantalla se rompió mientras la usaba. Es un error de la app: hay que revisarlo.',
    },
    permiso: {
        etiqueta: 'Permiso', tono: 'warning',
        explicacion: 'Intentó hacer algo sin el permiso. Si debía poder, dáselo en Configuración; si no, está bien así.',
    },
    lento: {
        etiqueta: 'Lento', tono: 'info',
        explicacion: 'La respuesta tardó mucho, se cortó o el servidor no contestó (por ejemplo, mientras se reinicia en un deploy). Solo se cuenta.',
    },
    sin_senal: {
        etiqueta: 'Sin señal', tono: 'info',
        explicacion: 'El teléfono no tenía internet. No es una falla de la app. Solo se cuenta.',
    },
    dato: {
        etiqueta: 'Dato mal ingresado', tono: 'neutral',
        explicacion: 'Algo mal ingresado o una regla de la app; la app ya le dijo qué corregir. Solo se cuenta (sirve para ver qué pantallas confunden).',
    },
};

/** Si esta categoría lleva revisión (las que cuentan en el número de Soporte). */
export const pideRevision = (c: CategoriaError) => c === 'falla' || c === 'app' || c === 'permiso';

/** Buscar por persona, mensaje, pantalla u obra (sin tildes ni mayúsculas). */
export function filtrarErrores(lista: readonly ErrorSoporte[], texto: string): ErrorSoporte[] {
    const q = normalizar(texto.trim());
    if (!q) return [...lista];
    return lista.filter(e => normalizar([e.usuario_nombre, e.mensaje, e.pantalla_nombre, e.pantalla, e.obra_nombre, e.rol_nombre].filter(Boolean).join(' ')).includes(q));
}

/** «Chrome 118 · Android 10», «Safari · iPhone», «Edge 129 · Windows»; el texto entero si no se reconoce. */
export function navegadorCorto(ua?: string | null): string {
    if (!ua) return '';
    const nav = /Edg\/(\d+)/.exec(ua) ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
        : /SamsungBrowser\/(\d+)/.exec(ua) ? `Samsung Internet ${/SamsungBrowser\/(\d+)/.exec(ua)![1]}`
            : /(?:Chrome|CriOS)\/(\d+)/.exec(ua) ? `Chrome ${/(?:Chrome|CriOS)\/(\d+)/.exec(ua)![1]}`
                : /Firefox\/(\d+)/.exec(ua) ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
                    : /Safari\//.test(ua) ? 'Safari' : '';
    const so = /Android (\d+)/.exec(ua) ? `Android ${/Android (\d+)/.exec(ua)![1]}`
        : /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
            : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
    const corto = [nav, so].filter(Boolean).join(' · ');
    return corto || ua.slice(0, 80);
}

/** Por qué un aviso no tiene foto (para no dejar a quien revisa con la duda). '' si la tiene. */
export function porQueSinFoto(e: Pick<ErrorSoporte, 'categoria' | 'tiene_foto' | 'foto_pedida' | 'foto_borrada_en'>): string {
    if (e.tiene_foto) return '';
    if (e.foto_borrada_en) return 'La foto se borró (pasaron 30 días o la persona la quitó).';
    if (e.categoria !== 'falla' && e.categoria !== 'app') return 'Este tipo de aviso no lleva foto.';
    if (!e.foto_pedida) return 'Sin foto: ese día ya se habían guardado las fotos máximas (tope para no llenar el servidor).';
    return 'Sin foto: el teléfono no alcanzó a sacarla.';
}

/** «tardó 18 s» / «tardó 0,8 s»; '' si no se midió. */
export function textoDuracion(ms?: number | null): string {
    if (ms === null || ms === undefined) return '';
    const s = ms / 1000;
    return `tardó ${s < 10 ? s.toFixed(1).replace('.', ',') : Math.round(s)} s`;
}

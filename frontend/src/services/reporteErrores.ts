import { almacenSesion, tokenVerComoGuardado } from '../context/verComoSesion';
import { nombrePantalla } from '../components/ideas/ideasConfig';
import type { AvisoError, CategoriaError } from './clasificarError';

/**
 * Manda a Soporte los avisos que clasificó `clasificarError.ts` (mig 141; docs/reglas/seguridad-rbac.md § Errores).
 * No hay nada corriendo todo el tiempo: esto se llama solo cuando a alguien le sale un error.
 *
 *   · Con «ver como» o sin sesión propia, no se manda nada.
 *   · El mismo aviso en la misma pantalla, a lo más una vez por minuto (el servidor además los agrupa por 10 minutos).
 *   · La foto se saca SOLO si el servidor la pide (falla/app y con cupo), ~0,7 s después del error para que se vea el
 *     cartel; comprimida a ≤ 150 KB; sin campos de contraseña. Si falla o tarda más de 6 s, el aviso queda sin foto.
 *   · Falla, pantalla rota y permiso le avisan a la persona (`EVENTO_AVISO_SOPORTE` → AvisoSoporte.tsx); lento, sin
 *     señal y datos solo se cuentan, sin molestarla.
 */

export const EVENTO_AVISO_SOPORTE = 'boveda:aviso-soporte';

export interface DetalleAvisoSoporte {
    id: number;
    categoria: CategoriaError;
    /** La foto que se mandó (data URL), para mostrarla en «Contar qué pasó»; null si no hubo. */
    foto: string | null;
}

/** Las que le avisan a la persona («Le avisamos a soporte…»). */
export const AVISAN_A_LA_PERSONA: readonly CategoriaError[] = ['falla', 'app', 'permiso'];

const ESPERA_MISMO_AVISO_MS = 60_000;
const ESPERA_ANTES_DE_FOTO_MS = 700;
const TOPE_FOTO_MS = 6_000;
const FOTO_MAX_BYTES = 150 * 1024;
const FOTO_MAX_ANCHO = 1000;
/** Un pixel gris para las imágenes que no se pueden copiar en la foto. */
const PIXEL_GRIS = 'data:image/gif;base64,R0lGODlhAQABAIAAAMzMzAAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==';

const recientes = new Map<string, number>();

function hayCuentaPropia(): boolean {
    try {
        if (tokenVerComoGuardado(almacenSesion())) return false;
        return !!localStorage.getItem('sgdl_token');
    } catch {
        return false;
    }
}

function contexto() {
    const { pathname, search } = window.location;
    let obra: number | undefined;
    try {
        const v = Number(localStorage.getItem('sgdl_obra_id'));
        if (Number.isInteger(v) && v > 0) obra = v;
    } catch { /* sin almacenamiento */ }
    return {
        pantalla: `${pathname}${search}`.slice(0, 255),
        pantalla_nombre: nombrePantalla(pathname, search).slice(0, 120),
        obra_id: obra,
        dispositivo: (window.matchMedia?.('(max-width: 767px)').matches ? 'movil' : 'escritorio') as 'movil' | 'escritorio',
    };
}

/** Sin los campos vacíos (el servidor valida tipos: un null en un entero sería un 400). */
const sinVacios = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

const esperar = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function conTope<T>(p: Promise<T>, ms: number): Promise<T | null> {
    return Promise.race([p, esperar(ms).then(() => null)]);
}

function aDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const lector = new FileReader();
        lector.onload = () => resolve(String(lector.result));
        lector.onerror = () => reject(lector.error);
        lector.readAsDataURL(blob);
    });
}

const aBlob = (canvas: HTMLCanvasElement, tipo: string, calidad: number) =>
    new Promise<Blob | null>(r => canvas.toBlob(r, tipo, calidad));

/** Achica a 1000 px de ancho y busca la calidad que quepa en 150 KB (WebP; si el navegador no puede, JPEG). */
async function comprimir(origen: HTMLCanvasElement): Promise<string | null> {
    let canvas = origen;
    if (origen.width > FOTO_MAX_ANCHO) {
        canvas = document.createElement('canvas');
        canvas.width = FOTO_MAX_ANCHO;
        canvas.height = Math.round(origen.height * (FOTO_MAX_ANCHO / origen.width));
        canvas.getContext('2d')?.drawImage(origen, 0, 0, canvas.width, canvas.height);
    }
    for (const tipo of ['image/webp', 'image/jpeg']) {
        for (const calidad of [0.72, 0.55, 0.4]) {
            const b = await aBlob(canvas, tipo, calidad);
            if (b && b.type === tipo && b.size <= FOTO_MAX_BYTES) return aDataUrl(b);
        }
    }
    return null;
}

/** La foto de lo que la persona está viendo (con el desplazamiento en que estaba). null si no se pudo. */
export async function capturarPantalla(): Promise<string | null> {
    try {
        const { domToCanvas } = await import('modern-screenshot');
        const fondo = getComputedStyle(document.body).backgroundColor || '#ffffff';
        const canvas = await conTope(domToCanvas(document.body, {
            width: window.innerWidth,
            height: window.innerHeight,
            scale: 1,
            backgroundColor: fondo,
            font: false,
            timeout: 4000,
            filter: n => !(n instanceof HTMLInputElement && n.type === 'password')
                && !(n instanceof HTMLElement && n.dataset.sinFoto !== undefined),
            fetch: { placeholderImage: PIXEL_GRIS },
            features: { restoreScrollPosition: true },
        }), TOPE_FOTO_MS);
        return canvas ? await comprimir(canvas) : null;
    } catch {
        return null;
    }
}

async function enviar(aviso: AvisoError, ctx: ReturnType<typeof contexto>): Promise<void> {
    try {
        const { default: api } = await import('./api');
        const res = await api.post<{ data?: { id?: number; repetido?: boolean; pedir_foto?: boolean; ignorado?: boolean } }>(
            '/soporte/errores', sinVacios({ ...aviso, ...ctx }),
        );
        const r = res.data?.data;
        if (!r?.id || r.repetido || r.ignorado || !AVISAN_A_LA_PERSONA.includes(aviso.categoria)) return;
        let foto: string | null = null;
        if (r.pedir_foto) {
            await esperar(ESPERA_ANTES_DE_FOTO_MS);
            foto = await capturarPantalla();
            if (foto) {
                try { await api.post(`/soporte/errores/${r.id}/foto`, { foto }); } catch { foto = null; }
            }
        }
        window.dispatchEvent(new CustomEvent<DetalleAvisoSoporte>(EVENTO_AVISO_SOPORTE, { detail: { id: r.id, categoria: aviso.categoria, foto } }));
    } catch {
        /* Un aviso que no llega no molesta a la persona. */
    }
}

/** Manda el aviso (si hay algo que avisar). No espera ni lanza: nunca cambia lo que pasa en la pantalla. */
export function reportarError(aviso: AvisoError | null | undefined): void {
    if (!aviso || typeof window === 'undefined' || !hayCuentaPropia()) return;
    const ctx = contexto();
    const clave = [aviso.categoria, aviso.mensaje, aviso.accion ?? '', ctx.pantalla.split('?')[0]].join('|');
    const ahora = Date.now();
    if ((recientes.get(clave) ?? 0) > ahora - ESPERA_MISMO_AVISO_MS) return;
    recientes.set(clave, ahora);
    void enviar(aviso, ctx);
}

/** Para las pruebas. */
export function _olvidarAvisos(): void {
    recientes.clear();
}

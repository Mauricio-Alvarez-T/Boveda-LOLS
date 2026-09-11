/**
 * Descarga/abre un archivo protegido por token (plan Gestiones B2). Reemplaza los 5 sitios que
 * hacían `api.get(..., {responseType:'blob'})` a mano y perdían el 403: el interceptor de api.ts
 * no toastea GETs, y el cuerpo del error llega como Blob (había que leerlo).
 *
 *  - Word/ZIP → <a download> con su nombre (window.open descargaría un UUID sin extensión).
 *  - PDF/imagen/txt → pestaña nueva con el MIME correcto.
 *  - 403 con `required` → toast con el nombre del permiso que falta.
 *  - Header X-Documentos-Omitidos (ZIP de la ficha) → toast de aviso.
 */
import type { AxiosInstance, AxiosResponse } from 'axios';
import { toast } from 'sonner';
import { parseErrorBlob, mensajeDescargaDenegada, modoApertura, mimePorExtension, nombreDesdeDisposition } from './descargaErrores';

export interface DescargaOpts {
    /** Nombre con que se guarda; si falta se toma de Content-Disposition. */
    nombre?: string;
    /** Forzar modo; por defecto se decide por la extensión. */
    modo?: 'preview' | 'download';
    /** Mensaje del toast si falla y el backend no dio detalle. */
    fallbackError?: string;
}

async function leerErrorBlob(err: unknown, fallback: string) {
    const e = err as { response?: { data?: unknown; status?: number } };
    const data = e?.response?.data;
    if (data instanceof Blob) return parseErrorBlob(await data.text(), fallback);
    if (data && typeof data === 'object' && 'error' in (data as Record<string, unknown>)) {
        const d = data as { error: string; required?: string[]; code?: string };
        return { error: d.error, required: d.required, code: d.code };
    }
    return { error: fallback };
}

export function entregarBlob(blob: Blob, nombre: string, modo: 'preview' | 'download') {
    if (modo === 'preview') {
        const url = URL.createObjectURL(new Blob([blob], { type: mimePorExtension(nombre, blob.type || undefined) }));
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

/** @returns true si se entregó el archivo; false si falló (ya se mostró el toast). */
export async function descargarArchivo(api: AxiosInstance, url: string, opts: DescargaOpts = {}): Promise<boolean> {
    const fallback = opts.fallbackError || 'No se pudo descargar el archivo';
    let res: AxiosResponse<Blob>;
    try {
        res = await api.get<Blob>(url, { responseType: 'blob' });
    } catch (err) {
        const info = await leerErrorBlob(err, fallback);
        toast.error(info.error, { description: mensajeDescargaDenegada(info.required) });
        return false;
    }
    const nombre = opts.nombre || nombreDesdeDisposition(res.headers?.['content-disposition']) || 'archivo';
    const omitidos = Number(res.headers?.['x-documentos-omitidos'] || 0);
    if (omitidos > 0) {
        toast.warning(`${omitidos} documento(s) laboral(es) restringido(s) no van en el ZIP`, {
            description: 'Contratos, finiquitos y anexos se descargan uno a uno desde la ficha (solo oficina).',
        });
    }
    entregarBlob(res.data, nombre, opts.modo || modoApertura(nombre));
    return true;
}

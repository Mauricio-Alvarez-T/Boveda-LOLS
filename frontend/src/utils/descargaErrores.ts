/**
 * Lógica PURA de descargas de archivos (plan Gestiones B2) — testeable sin DOM.
 * La parte con navegador (blob → <a download> / window.open) vive en descargarArchivo.ts.
 */

export interface ErrorDescarga {
    error: string;
    required?: string[];
    code?: string;
}

/** Cuerpo JSON de un error que llegó como Blob (responseType:'blob'). Tolera texto no-JSON. */
export function parseErrorBlob(text: string, fallback = 'No se pudo descargar el archivo'): ErrorDescarga {
    try {
        const j = JSON.parse(text);
        if (j && typeof j === 'object') {
            // JSON sin `error` (o con otra forma): fallback — nunca mostrar el crudo al usuario.
            return typeof j.error === 'string'
                ? { error: j.error, required: Array.isArray(j.required) ? j.required : undefined, code: typeof j.code === 'string' ? j.code : undefined }
                : { error: fallback };
        }
    } catch { /* no era JSON */ }
    return { error: text && text.length < 200 ? text : fallback };
}

const NOMBRES_PERMISO: Record<string, string> = {
    'documentos.laborales.descargar': 'Descargar / Imprimir Documentos Laborales',
    'documentos.descargar': 'Descargar Documentos',
};

/** Descripción para el toast cuando el 403 trae `required`. */
export function mensajeDescargaDenegada(required?: string[]): string | undefined {
    if (!required || !required.length) return undefined;
    const nombres = required.map(k => NOMBRES_PERMISO[k] || k);
    return `Requiere el permiso "${nombres.join('" o "')}" (solo oficina). Pídelo a administración.`;
}

const EXT_PREVIEW = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp', 'gif', 'txt']);
const MIME_POR_EXT: Record<string, string> = {
    pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
    txt: 'text/plain', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zip: 'application/zip',
};

export function extensionDe(nombre: string | null | undefined): string {
    const m = String(nombre || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
}

/**
 * 'preview' = el navegador lo muestra (PDF/imagen/txt → window.open); 'download' = se guarda
 * con su nombre (Word, ZIP y todo lo demás: abrirlo en pestaña descargaría un UUID sin extensión).
 */
export function modoApertura(nombre: string | null | undefined): 'preview' | 'download' {
    return EXT_PREVIEW.has(extensionDe(nombre)) ? 'preview' : 'download';
}

export function mimePorExtension(nombre: string | null | undefined, fallback = 'application/octet-stream'): string {
    return MIME_POR_EXT[extensionDe(nombre)] || fallback;
}

/** Nombre de archivo desde `Content-Disposition: attachment; filename="x.doc"` (o filename*=UTF-8''). */
export function nombreDesdeDisposition(header: string | null | undefined): string | null {
    if (!header) return null;
    const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8) { try { return decodeURIComponent(utf8[1].trim()); } catch { /* sigue */ } }
    const simple = header.match(/filename="?([^";]+)"?/i);
    return simple ? simple[1].trim() : null;
}

/**
 * Comprime una imagen en el navegador antes de subirla: la redimensiona a un
 * lado máximo y la re-encodea a JPEG bajando la calidad hasta quedar bajo un
 * tamaño objetivo. Las fotos de celular (3–10 MB) suelen quedar < 1 MB sin
 * perder legibilidad de un documento.
 *
 * Archivos NO-imagen (PDF, etc.) se devuelven sin tocar — no se pueden comprimir
 * client-side sin librerías extra.
 */
const readAsDataURL = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(file);
    });

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, type, quality));

export async function compressImage(
    file: File,
    opts: { maxDim?: number; maxBytes?: number; minDim?: number } = {},
): Promise<File> {
    if (!file.type.startsWith('image/')) return file; // PDF u otros: sin cambios

    const maxDim = opts.maxDim ?? 1600;
    const maxBytes = opts.maxBytes ?? 500 * 1024; // objetivo 500 KB
    const minDim = opts.minDim ?? 800;            // no bajar de aquí (legibilidad)

    try {
        const dataUrl = await readAsDataURL(file);
        const img = await loadImage(dataUrl);

        let { width, height } = img;
        const longest = Math.max(width, height);
        if (longest > maxDim) {
            const scale = maxDim / longest;
            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;

        const render = (w: number, h: number) => {
            canvas.width = w;
            canvas.height = h;
            // Fondo blanco para PNG con transparencia (los documentos van sobre blanco)
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
        };

        const encodeUnderTarget = async () => {
            // Baja la calidad hasta el piso buscando quedar bajo el objetivo
            let quality = 0.8;
            let b = await toBlob(canvas, 'image/jpeg', quality);
            while (b && b.size > maxBytes && quality > 0.4) {
                quality -= 0.1;
                b = await toBlob(canvas, 'image/jpeg', quality);
            }
            return b;
        };

        render(width, height);
        let blob = await encodeUnderTarget();

        // Si la calidad sola no alcanzó, reduce dimensiones progresivamente
        let curW = width, curH = height;
        while (blob && blob.size > maxBytes && Math.max(curW, curH) > minDim) {
            curW = Math.max(minDim, Math.round(curW * 0.8));
            curH = Math.max(minDim, Math.round(curH * 0.8));
            render(curW, curH);
            blob = await encodeUnderTarget();
        }

        // Si por algún motivo la compresión no ayudó, conserva el original
        if (!blob || blob.size >= file.size) return file;

        const baseName = file.name.replace(/\.[^.]+$/, '');
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file; // ante cualquier fallo, sube el original
    }
}

export interface Miniatura {
    blob: Blob;
    /** data URL listo para mandar en un JSON. */
    dataUrl: string;
    ancho: number;
    alto: number;
}

const blobADataUrl = (b: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result as string);
        fr.onerror = reject;
        fr.readAsDataURL(b);
    });

/**
 * Miniatura MUY comprimida (Ideas para Bóveda, mig 121: "poca memoria", meta 4–5 KB).
 *
 * A diferencia de `compressImage` —que cuida que un documento se pueda LEER y no baja
 * de 800 px— esta busca el lado más grande que entre en `maxBytes` con una calidad
 * aceptable: sirve para mostrar qué pantalla o qué cosa es, no para leer letra chica.
 * Prueba WEBP (más liviano) y JPEG; Safari devuelve PNG cuando no sabe hacer WEBP, y
 * esa salida se descarta. Si nada entra en la meta, devuelve la más liviana lograda.
 */
export async function comprimirMiniatura(file: File, { maxBytes = 5 * 1024 }: { maxBytes?: number } = {}): Promise<Miniatura | null> {
    if (!file.type.startsWith('image/')) return null;
    try {
        const img = await loadImage(await readAsDataURL(file));
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        const dibujar = (lado: number) => {
            const escala = Math.min(1, lado / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * escala));
            const h = Math.max(1, Math.round(img.height * escala));
            canvas.width = w;
            canvas.height = h;
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return { w, h };
        };

        let mejor: { blob: Blob; w: number; h: number } | null = null;
        // Se prefiere más resolución con menos calidad antes que achicar: medido el 15-10
        // con una captura de celular (1080×2340), 5 KB alcanzan para ~185×400 px a calidad
        // 0,15; sin ese escalón la misma captura bajaba a 148×320. Una foto de cámara entra
        // en ~360×480.
        const pasadas: [number, number[]][] = [
            [720, [0.5, 0.35]],
            [600, [0.45, 0.3]],
            [480, [0.4, 0.28, 0.18]],
            [400, [0.35, 0.25, 0.15]],
            [320, [0.35, 0.22, 0.12]],
            [260, [0.3, 0.18, 0.1]],
            [200, [0.25, 0.12, 0.08]],
        ];
        for (const [lado, calidades] of pasadas) {
            const { w, h } = dibujar(lado);
            for (const q of calidades) {
                for (const tipo of ['image/webp', 'image/jpeg']) {
                    const b = await toBlob(canvas, tipo, q);
                    if (!b || b.type !== tipo) continue;
                    if (!mejor || b.size < mejor.blob.size) mejor = { blob: b, w, h };
                    if (b.size <= maxBytes) return { blob: b, dataUrl: await blobADataUrl(b), ancho: w, alto: h };
                }
            }
        }
        return mejor ? { blob: mejor.blob, dataUrl: await blobADataUrl(mejor.blob), ancho: mejor.w, alto: mejor.h } : null;
    } catch {
        return null;
    }
}

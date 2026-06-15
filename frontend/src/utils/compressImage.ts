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
    opts: { maxDim?: number; maxBytes?: number } = {},
): Promise<File> {
    if (!file.type.startsWith('image/')) return file; // PDF u otros: sin cambios

    const maxDim = opts.maxDim ?? 2000;
    const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;

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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return file;
        // Fondo blanco para PNG con transparencia (los documentos van sobre blanco)
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.8;
        let blob = await toBlob(canvas, 'image/jpeg', quality);
        while (blob && blob.size > maxBytes && quality > 0.4) {
            quality -= 0.15;
            blob = await toBlob(canvas, 'image/jpeg', quality);
        }
        // Si por algún motivo la compresión no ayudó, conserva el original
        if (!blob || blob.size >= file.size) return file;

        const baseName = file.name.replace(/\.[^.]+$/, '');
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    } catch {
        return file; // ante cualquier fallo, sube el original
    }
}

/**
 * Generación de documentos tipo Word a partir de HTML — SIN librerías, SIN API,
 * 100% en el navegador. Word abre HTML con cabecera MS Office como documento
 * editable. Mismo HTML sirve para descargar (.doc) y para imprimir (vista previa
 * del navegador).
 */

function wrapHtml(title: string, htmlBody: string): string {
    return (
        `<!DOCTYPE html>` +
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
        `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
        `xmlns="http://www.w3.org/TR/REC-html40">` +
        `<head><meta charset="utf-8"><title>${title}</title>` +
        `<style>` +
        `@page { size: A4; margin: 2.5cm; }` +
        `body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.5; }` +
        `h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin: 0 0 4pt; }` +
        `h2 { font-size: 12pt; text-align: center; font-weight: bold; margin: 0 0 16pt; }` +
        `p { margin: 0 0 10pt; text-align: justify; }` +
        `.firmas td { text-align: center; }` +
        `</style></head><body>${htmlBody}</body></html>`
    );
}

/** Descarga el documento como archivo Word (.doc) editable. */
export function downloadWord(filename: string, htmlBody: string) {
    const html = wrapHtml(filename, htmlBody);
    // El BOM (﻿) ayuda a que Word respete UTF-8 (acentos/ñ).
    const blob = new Blob(['﻿', html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.toLowerCase().endsWith('.doc') ? filename : `${filename}.doc`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Abre la vista previa de impresión del navegador con el documento ya armado
 * (idéntico al Word). El usuario puede imprimir directo o "Guardar como PDF".
 * Usa un iframe oculto para evitar bloqueadores de pop-ups.
 */
export function printDoc(htmlBody: string, title = 'Constancia') {
    const html = wrapHtml(title, htmlBody);
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) { document.body.removeChild(iframe); return; }
    doc.open();
    doc.write(html);
    doc.close();

    // Contenido 100% inline (sin recursos externos) → listo casi de inmediato.
    setTimeout(() => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } finally {
            setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 1500);
        }
    }, 300);
}

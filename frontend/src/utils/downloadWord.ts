/**
 * Descarga un documento Word (.doc) a partir de HTML — SIN librerías, SIN API,
 * 100% en el navegador. Word abre HTML con cabecera MS Office como un documento
 * editable normal. Ideal para cartas/actas autocompletadas con datos del trabajador.
 *
 * @param filename Nombre del archivo (se le agrega .doc si falta).
 * @param htmlBody Contenido HTML del cuerpo (párrafos, encabezados, etc.).
 */
export function downloadWord(filename: string, htmlBody: string) {
    const html =
        `<!DOCTYPE html>` +
        `<html xmlns:o="urn:schemas-microsoft-com:office:office" ` +
        `xmlns:w="urn:schemas-microsoft-com:office:word" ` +
        `xmlns="http://www.w3.org/TR/REC-html40">` +
        `<head><meta charset="utf-8"><title>${filename}</title>` +
        `<style>` +
        `@page { size: A4; margin: 2.5cm; }` +
        `body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; line-height: 1.5; }` +
        `h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin: 0 0 4pt; }` +
        `h2 { font-size: 12pt; text-align: center; font-weight: bold; margin: 0 0 16pt; }` +
        `p { margin: 0 0 10pt; text-align: justify; }` +
        `.datos { margin: 0 0 16pt; }` +
        `.datos td { padding: 1pt 8pt 1pt 0; font-size: 11pt; vertical-align: top; }` +
        `.firmas { margin-top: 70pt; }` +
        `.firmas td { text-align: center; font-size: 11pt; padding-top: 4pt; border-top: 1px solid #000; }` +
        `</style></head><body>${htmlBody}</body></html>`;

    // El BOM (﻿) ayuda a que Word respete el charset UTF-8 (acentos/ñ).
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

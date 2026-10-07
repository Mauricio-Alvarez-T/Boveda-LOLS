/**
 * Utilidades para mostrar archivos adjuntos (documentos de vehículos,
 * justificativos de ausencia…). Nacieron en VehiculoDocumentos y se
 * comparten para que todos los adjuntos se comporten igual.
 */

/**
 * ¿El navegador sabe pintar un PDF dentro de la página?
 *
 * Chrome en Android NO lo hace: ante un <iframe> con un PDF dibuja un recuadro
 * gris con el identificador interno del blob y un botón "Abrir" suyo, sin el
 * nombre del documento ni nada que ayude. Se detectó el 2026-09-15 revisando el
 * formato móvil: los documentos que son FOTO se veían y el único que era PDF no,
 * lo que parecía un problema del archivo y era del navegador.
 *
 * `navigator.pdfViewerEnabled` es el API estándar para preguntarlo y responde
 * false justamente en el móvil. Donde no exista (navegadores viejos) se cae al
 * ancho de ventana, que separa bien escritorio de teléfono.
 */
export const navegadorMuestraPdf = (): boolean => {
    const nav = navigator as Navigator & { pdfViewerEnabled?: boolean };
    if (typeof nav.pdfViewerEnabled === 'boolean') return nav.pdfViewerEnabled;
    return typeof window !== 'undefined' && window.innerWidth >= 768;
};

/** Tamaño legible para la ficha de un archivo (1 decimal desde 1 MB). */
export const formatearTamano = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

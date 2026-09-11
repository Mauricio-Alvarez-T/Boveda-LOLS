/**
 * Abre la vista previa de impresión del navegador con un documento HTML COMPLETO (ya envuelto por
 * el servidor: GET /documentos-laborales/:id/html). El usuario imprime o "Guarda como PDF".
 * Iframe oculto para evitar bloqueadores de pop-ups. Sucesor de utils/downloadWord.ts (la
 * generación pasó al backend en el plan Gestiones B2).
 */
export function printDoc(htmlCompleto: string) {
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
    doc.write(htmlCompleto);
    doc.close();

    // Contenido 100% inline (logo en data URI, sin recursos externos) → listo casi de inmediato.
    setTimeout(() => {
        try {
            iframe.contentWindow?.focus();
            iframe.contentWindow?.print();
        } finally {
            setTimeout(() => { if (iframe.parentNode) document.body.removeChild(iframe); }, 1500);
        }
    }, 300);
}

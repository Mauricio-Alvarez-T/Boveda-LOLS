/**
 * Helpers para compartir mensajes vía WhatsApp.
 * Centralizado para reuso entre asistencia, transferencias inventario y sábados extra.
 *
 * Estrategia robusta de compartir:
 * 1. Copia el mensaje al portapapeles (respaldo si el redirect URL corrompe emojis SMP).
 * 2. En móvil intenta navigator.share() nativo.
 * 3. Fallback: api.whatsapp.com/send?text=... (preserva emojis SMP mejor que wa.me).
 */

/**
 * Copia texto al portapapeles. Usa Clipboard API moderna y cae en execCommand
 * para navegadores antiguos. Devuelve true si funcionó, false si no.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fallback */ }

    try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textArea);
        return ok;
    } catch {
        return false;
    }
}

/**
 * Intenta compartir vía navigator.share (móvil) o api.whatsapp.com (desktop).
 * Retorna true si abrió WhatsApp, false si fue cancelado.
 */
export async function shareViaWhatsApp(text: string, title?: string): Promise<boolean> {
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (isMobile && (navigator as any).share) {
        try {
            await (navigator as any).share({ text, title });
            return true;
        } catch (e: any) {
            if (e?.name === 'AbortError') return false;
            // Cualquier otro error → fallback al URL
        }
    }
    const encoded = encodeURIComponent(text);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
    return true;
}

/**
 * Combo robusto: copia al portapapeles + comparte. Si el portapapeles falla
 * el usuario aún tiene WhatsApp abierto.
 */
export async function copyAndShare(text: string, title?: string): Promise<{ copied: boolean; opened: boolean }> {
    const copied = await copyToClipboard(text);
    const opened = await shareViaWhatsApp(text, title);
    return { copied, opened };
}

import { toast } from 'sonner';

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

interface PrepareAndShareOptions {
    text: string;
    title: string;
    toastId?: string;
    preparingMessage?: string;
    successMessage?: string;
    successDescription?: string;
    actionLabel?: string;
    duration?: number;
}

/**
 * Patrón robusto basado en useAttendanceExport.handleShareWhatsApp.
 *
 * Flujo:
 *   1. Toast "preparando" (breve, 2s).
 *   2. Copia al portapapeles asíncronamente.
 *   3. Toast success con botón de acción "ENVIAR AHORA" (15s default).
 *   4. La apertura efectiva de WhatsApp (window.open / navigator.share)
 *      ocurre DENTRO del user-gesture del click en el botón del toast.
 *      Esto evita bloqueos en navegadores que mata window.open() después
 *      de async operations (Safari mobile, navegadores lentos).
 *
 * Errores:
 *   - Si la copia falla, igual se muestra el toast con el botón de acción.
 *   - Si todo falla, fallback con setTimeout abre WhatsApp directo a los 2s.
 */
export async function prepareAndShareWithToast(opts: PrepareAndShareOptions): Promise<void> {
    const {
        text,
        title,
        toastId = 'whatsapp-share',
        preparingMessage = 'Preparando mensaje...',
        successMessage = '¡Mensaje listo!',
        successDescription = 'Pulsa el botón para enviar por WhatsApp.',
        actionLabel = 'ENVIAR AHORA',
        duration = 15000,
    } = opts;

    toast.info(preparingMessage, { id: toastId, duration: 2000 });

    try {
        await copyToClipboard(text);

        toast.success(successMessage, {
            id: toastId,
            description: successDescription,
            duration,
            action: {
                label: actionLabel,
                onClick: async () => {
                    // Click del usuario = user-gesture válido para window.open
                    await shareViaWhatsApp(text, title);
                },
            },
        });
    } catch (error: any) {
        // eslint-disable-next-line no-console
        console.error('Error preparando mensaje WhatsApp', error);
        toast.error('Error al preparar el mensaje', { id: toastId, duration: 8000 });
        // Fallback: abrir WhatsApp tras un breve delay para que el user vea el error
        setTimeout(() => {
            shareViaWhatsApp(text, title);
        }, 2000);
    }
}

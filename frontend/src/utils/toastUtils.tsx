import { toast } from 'sonner';

/**
 * Auditoría 4.3: helper centralizado para mostrar errores de API con detalle.
 *
 * - console.error siempre (no perdemos stack trace en DevTools).
 * - Toast con título corto (mensaje fallback) y descripción técnica del backend
 *   o del error si está disponible.
 * - Si el status es 403 NO mostramos toast acá: el interceptor en services/api.ts
 *   ya lo hace de forma global y throttleada.
 */
interface ApiErrorLike {
    response?: { status?: number; data?: { error?: string; message?: string } };
    message?: string;
}

export function showApiError(err: unknown, fallback = 'Ocurrió un error'): void {
    console.error(err);
    const e = err as ApiErrorLike;
    if (e?.response?.status === 403) return; // ya lo maneja el interceptor global
    const detail = e?.response?.data?.error
        || e?.response?.data?.message
        || e?.message
        || '';
    if (detail && detail !== fallback) {
        toast.error(fallback, { description: detail });
    } else {
        toast.error(detail || fallback);
    }
}

interface ConfirmToastOptions {
    onConfirm: () => Promise<void> | void;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    successMessage?: string;
    errorMessage?: string;
}

/**
 * Toast de confirmación genérico (patrón "toast-confirm" — el idioma de la app
 * para confirmar acciones sin abrir un modal). Muestra un mensaje + botones
 * cancelar/confirmar; ejecuta onConfirm al confirmar y reporta éxito/error.
 *
 * `showDeleteToast` es el caso particular de borrado (delega aquí). Para otras
 * acciones destructivas/irreversibles (ej. Cancelar transferencia) usar
 * `showConfirmToast` directamente con su propio copy.
 */
export const showConfirmToast = ({
    onConfirm,
    message = "¿Confirmar?",
    confirmLabel = "Sí",
    cancelLabel = "No",
    successMessage,
    errorMessage = "Error",
}: ConfirmToastOptions) => {
    toast.custom((t) => (
        <div className="bg-card px-4 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/40 flex items-center gap-4 w-auto min-w-[280px] animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="font-bold text-brand-dark text-[14px] whitespace-nowrap ml-1">{message}</span>
            <div className="flex gap-1.5 ml-auto">
                <button
                    onClick={() => toast.dismiss(t)}
                    className="py-1.5 px-4 rounded-full text-[12px] font-bold text-muted-foreground bg-background hover:bg-muted transition-all active:scale-95"
                >
                    {cancelLabel}
                </button>
                <button
                    onClick={async () => {
                        toast.dismiss(t);
                        try {
                            await onConfirm();
                            if (successMessage) toast.success(successMessage);
                        } catch (err) {
                            const axiosError = err as { response?: { data?: { error?: string; message?: string } } };
                            const serverError = axiosError.response?.data?.error || axiosError.response?.data?.message;
                            if (serverError) {
                                toast.error(serverError);
                            } else if (errorMessage) {
                                toast.error(errorMessage);
                            }
                        }
                    }}
                    className="py-1.5 px-4 rounded-full text-[12px] font-bold text-white bg-brand-primary hover:bg-[#027A3B] shadow-sm transition-all active:scale-95"
                >
                    {confirmLabel}
                </button>
            </div>
        </div>
    ), {
        unstyled: true,
        duration: 5000,
    });
};

interface DeleteToastOptions {
    onConfirm: () => Promise<void> | void;
    message?: string;
    successMessage?: string;
    errorMessage?: string;
}

export const showDeleteToast = ({
    onConfirm,
    message = "¿Eliminar?",
    successMessage = "Eliminado",
    errorMessage = "Error",
}: DeleteToastOptions) => showConfirmToast({
    onConfirm, message, successMessage, errorMessage, confirmLabel: "Sí", cancelLabel: "No",
});

import { toast } from 'sonner';

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
    errorMessage = "Error"
}: DeleteToastOptions) => {
    toast.custom((t) => (
        <div className="bg-white px-4 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-border/40 flex items-center gap-4 w-auto min-w-[280px] animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="font-bold text-brand-dark text-[14px] whitespace-nowrap ml-1">{message}</span>
            <div className="flex gap-1.5 ml-auto">
                <button
                    onClick={() => toast.dismiss(t)}
                    className="py-1.5 px-4 rounded-full text-[12px] font-bold text-muted-foreground bg-background hover:bg-[#E8E8ED] transition-all active:scale-95"
                >
                    No
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
                    Sí
                </button>
            </div>
        </div>
    ), {
        unstyled: true,
        duration: 5000,
    });
};

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
        <div className="bg-white px-4 py-2.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-[#D2D2D7]/40 flex items-center gap-4 w-auto min-w-[280px] animate-in fade-in slide-in-from-top-2 duration-300">
            <span className="font-bold text-[#1D1D1F] text-[14px] whitespace-nowrap ml-1">{message}</span>
            <div className="flex gap-1.5 ml-auto">
                <button
                    onClick={() => toast.dismiss(t)}
                    className="py-1.5 px-4 rounded-full text-[12px] font-bold text-[#6E6E73] bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-all active:scale-95"
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
                            if (errorMessage) toast.error(errorMessage);
                        }
                    }}
                    className="py-1.5 px-4 rounded-full text-[12px] font-bold text-white bg-[#0071E3] hover:bg-[#0077ED] shadow-sm transition-all active:scale-95"
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

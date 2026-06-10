import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, PackageCheck, XCircle, Ban, Send, Zap, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

interface Props {
    canAprobar: boolean;
    canRechazar: boolean;
    canRecibir: boolean;
    canRechazarRecepcion: boolean;
    canCancelar: boolean;
    canCompartirWhatsApp: boolean;
    actionLoading: boolean;
    onAprobar: () => void;
    onRechazar: () => void;
    onRecibir: () => void;
    onRechazarRecepcion: () => void;
    onCancelar: () => void;
    onWhatsApp: () => void;
    /** Si la TRF está en estado 'pendiente' — cambia el texto del WhatsApp. */
    isPendiente?: boolean;
}

/**
 * Menú único de acciones para el detalle de transferencia.
 * Reemplaza la columna lateral de botones por UN solo botón "Acciones ▾"
 * que abre un menú con todas las acciones disponibles según permisos/estado.
 * Libera el ancho del panel detalle al máximo.
 */
const TransferenciaActionsMenu: React.FC<Props> = ({
    canAprobar, canRechazar, canRecibir, canRechazarRecepcion, canCancelar, canCompartirWhatsApp,
    actionLoading, onAprobar, onRechazar, onRecibir, onRechazarRecepcion, onCancelar, onWhatsApp,
    isPendiente = false,
}) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent | TouchEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('touchstart', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, [open]);

    const hasActions = canAprobar || canRechazar || canRecibir || canRechazarRecepcion || canCancelar || canCompartirWhatsApp;
    if (!hasActions) return null;

    const handleClick = (fn: () => void) => () => { fn(); setOpen(false); };

    return (
        <div ref={wrapperRef} className="relative shrink-0">
            <button
                onClick={() => setOpen(v => !v)}
                disabled={actionLoading}
                className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl transition-all shadow-sm",
                    open
                        ? "bg-brand-primary text-white"
                        : "bg-brand-primary text-white hover:bg-brand-primary/90",
                    actionLoading && "opacity-50 cursor-not-allowed"
                )}
            >
                <Zap className="h-3.5 w-3.5 shrink-0" />
                <span>Acciones</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform shrink-0", open && "rotate-180")} />
            </button>

            {open && (
                <div className="absolute top-full right-0 mt-1.5 w-60 bg-card border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    {canAprobar && (
                        <button onClick={handleClick(onAprobar)} disabled={actionLoading}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                            <span>Revisar y aprobar</span>
                        </button>
                    )}
                    {canRecibir && (
                        <button onClick={handleClick(onRecibir)} disabled={actionLoading}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                            <PackageCheck className="h-3.5 w-3.5 shrink-0 text-brand-primary" />
                            <span>Registrar lo que llegó</span>
                        </button>
                    )}
                    {canRechazar && (
                        <button onClick={handleClick(onRechazar)} disabled={actionLoading}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            <span>Rechazar</span>
                        </button>
                    )}
                    {canRechazarRecepcion && (
                        <button onClick={handleClick(onRechazarRecepcion)} disabled={actionLoading}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                            <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                            <span>Rechazar Recepción</span>
                        </button>
                    )}
                    {canCancelar && (
                        <button onClick={handleClick(onCancelar)} disabled={actionLoading}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                            <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span>Cancelar</span>
                        </button>
                    )}
                    {canCompartirWhatsApp && (
                        <>
                            <div className="h-px bg-border my-1" />
                            <button onClick={handleClick(onWhatsApp)} disabled={actionLoading}
                                className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors">
                                <Send className="h-3.5 w-3.5 shrink-0 text-[#25D366]" />
                                <span>{isPendiente ? 'Notificar por WhatsApp' : 'Enviar por WhatsApp'}</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default TransferenciaActionsMenu;

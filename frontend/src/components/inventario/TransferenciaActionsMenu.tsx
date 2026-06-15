import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, PackageCheck, XCircle, Ban, Send, MoreHorizontal, ChevronDown } from 'lucide-react';
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
 * Acciones del detalle de transferencia.
 * Las acciones PRIMARIAS (Revisar y aprobar / Registrar lo que llegó /
 * Notificar por WhatsApp) van SIEMPRE visibles como botones. Las secundarias
 * (Rechazar / Rechazar Recepción / Cancelar) se agrupan en un menú "Acciones ▾".
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

    const hasSecondary = canRechazar || canRechazarRecepcion || canCancelar;
    const hasActions = canAprobar || canRecibir || canCompartirWhatsApp || hasSecondary;
    if (!hasActions) return null;

    const handleClick = (fn: () => void) => () => { fn(); setOpen(false); };

    // Estilos compartidos (botones crudos con tokens — Inventario aún no migrado al DS).
    const primaryBtn = "flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all bg-brand-primary text-white hover:bg-brand-primary/90 disabled:opacity-50 disabled:cursor-not-allowed";
    const secondaryBtn = "flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all bg-card border border-border text-brand-dark hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed";
    const menuItem = "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors";
    const whatsappLabel = isPendiente ? 'Notificar por WhatsApp' : 'Enviar por WhatsApp';

    return (
        <div className="flex items-center gap-2 shrink-0">
            {/* ── Acciones PRIMARIAS siempre visibles ── */}
            {canAprobar && (
                <button onClick={onAprobar} disabled={actionLoading} className={primaryBtn}>
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Revisar y aprobar</span>
                </button>
            )}
            {canRecibir && (
                <button onClick={onRecibir} disabled={actionLoading} className={primaryBtn}>
                    <PackageCheck className="h-3.5 w-3.5 shrink-0" />
                    <span>Registrar lo que llegó</span>
                </button>
            )}
            {canCompartirWhatsApp && (
                <button onClick={onWhatsApp} disabled={actionLoading} className={secondaryBtn}
                    title={whatsappLabel} aria-label={whatsappLabel}>
                    <Send className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline">{whatsappLabel}</span>
                </button>
            )}

            {/* ── Acciones SECUNDARIAS en menú ── */}
            {hasSecondary && (
                <div ref={wrapperRef} className="relative shrink-0">
                    <button
                        onClick={() => setOpen(v => !v)}
                        disabled={actionLoading}
                        className={cn(secondaryBtn, open && "bg-muted")}
                    >
                        <MoreHorizontal className="h-3.5 w-3.5 shrink-0" />
                        <span className="hidden sm:inline">Acciones</span>
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform shrink-0", open && "rotate-180")} />
                    </button>

                    {open && (
                        <div className="absolute top-full right-0 mt-1.5 w-56 bg-card border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                            {canRechazar && (
                                <button onClick={handleClick(onRechazar)} disabled={actionLoading} className={menuItem}>
                                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                                    <span>Rechazar</span>
                                </button>
                            )}
                            {canRechazarRecepcion && (
                                <button onClick={handleClick(onRechazarRecepcion)} disabled={actionLoading} className={menuItem}>
                                    <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
                                    <span>Rechazar Recepción</span>
                                </button>
                            )}
                            {canCancelar && (
                                <button onClick={handleClick(onCancelar)} disabled={actionLoading} className={menuItem}>
                                    <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                    <span>Cancelar</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TransferenciaActionsMenu;

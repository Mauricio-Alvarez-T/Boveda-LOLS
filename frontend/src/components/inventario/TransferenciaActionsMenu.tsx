import React, { useState, useRef, useEffect } from 'react';
import { CheckCircle2, PackageCheck, XCircle, Ban, MoreHorizontal, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import WhatsAppIcon from '../ui/WhatsAppIcon';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

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

    const handleClick = (fn: () => void) => () => { fn(); setOpen(false); };

    // Estilos compartidos (widgets que se mantienen crudos: toggle dropdown + filas de menú).
    const secondaryBtn = "flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl shadow-sm transition-all bg-card border border-border text-brand-dark hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed";
    const menuItem = "w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold text-brand-dark hover:bg-muted disabled:opacity-50 transition-colors";
    const whatsappLabel = isPendiente ? 'Notificar por WhatsApp' : 'Enviar por WhatsApp';

    // Acciones secundarias: 1 → botón directo; 2+ → menú "Acciones ▾".
    const secondaryActions = [
        canRechazar && { key: 'rechazar', label: 'Rechazar', icon: <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />, onClick: onRechazar },
        canRechazarRecepcion && { key: 'rechazar-recepcion', label: 'Rechazar Recepción', icon: <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />, onClick: onRechazarRecepcion },
        canCancelar && { key: 'cancelar', label: 'Cancelar', icon: <Ban className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />, onClick: onCancelar },
    ].filter(Boolean) as { key: string; label: string; icon: React.ReactNode; onClick: () => void }[];

    const hasActions = canAprobar || canRecibir || canCompartirWhatsApp || secondaryActions.length > 0;
    if (!hasActions) return null;

    return (
        <div className="flex items-center gap-2 shrink-0">
            {/* ── Acciones PRIMARIAS siempre visibles ── */}
            {canAprobar && (
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onAprobar}
                    disabled={actionLoading}
                    leftIcon={<CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                >
                    Revisar y aprobar
                </Button>
            )}
            {canRecibir && (
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onRecibir}
                    disabled={actionLoading}
                    leftIcon={<PackageCheck className="h-3.5 w-3.5 shrink-0" />}
                >
                    Registrar lo que llegó
                </Button>
            )}
            {canCompartirWhatsApp && (
                <IconButton
                    variant="ghost"
                    size="md"
                    onClick={onWhatsApp}
                    disabled={actionLoading}
                    title={whatsappLabel}
                    aria-label={whatsappLabel}
                    className="bg-green-100 text-green-700 hover:bg-green-200 hover:text-green-700 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25"
                    icon={<WhatsAppIcon className="h-4 w-4 shrink-0" />}
                />
            )}

            {/* ── Acciones SECUNDARIAS — 1 directa, 2+ en menú ── */}
            {secondaryActions.length === 1 && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={secondaryActions[0].onClick}
                    disabled={actionLoading}
                    leftIcon={secondaryActions[0].icon}
                >
                    {secondaryActions[0].label}
                </Button>
            )}
            {secondaryActions.length >= 2 && (
                <div ref={wrapperRef} className="relative shrink-0">
                    {/* eslint-disable-next-line no-restricted-syntax -- toggle dropdown (control compuesto, no encaja en primitiva) */}
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
                            {secondaryActions.map(a => (
                                // eslint-disable-next-line no-restricted-syntax -- fila de menú (dropdown option row)
                                <button key={a.key} onClick={handleClick(a.onClick)} disabled={actionLoading} className={menuItem}>
                                    {a.icon}
                                    <span>{a.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default TransferenciaActionsMenu;

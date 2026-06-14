import React, { useState, useRef, useEffect } from 'react';
import { Clock, CheckCircle2, PackageCheck, AlertTriangle, LayoutGrid, ChevronDown, Check } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Filtro de estado de Transferencias — DROPDOWN compacto.
 * Reemplaza los 5 chips horizontales por un solo botón "Filtro ▾" que abre
 * una lista con todos los estados. Más espacio horizontal disponible para
 * la lista y el detalle.
 */

const STATUS_CHIPS: { value: string; label: string; icon: React.ElementType; discrepancia?: boolean }[] = [
    { value: 'todas',         label: 'Todas',         icon: LayoutGrid },
    { value: 'pendiente',     label: 'Pendientes',    icon: Clock },
    { value: 'aprobada',      label: 'Aprobadas',     icon: CheckCircle2 },
    { value: 'recibida',      label: 'Recibidas',     icon: PackageCheck },
    { value: 'discrepancias', label: 'Discrepancias', icon: AlertTriangle, discrepancia: true },
];

interface Props {
    active: string;
    onChange: (value: string) => void;
    discrepanciasCount?: number;
    /** Si false, el chip "Discrepancias" se oculta. Default true para back-compat. */
    canVerDiscrepancias?: boolean;
    className?: string;
}

const StatusFilterBar: React.FC<Props> = ({
    active,
    onChange,
    discrepanciasCount = 0,
    canVerDiscrepancias = true,
    className,
}) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    const chips = STATUS_CHIPS.filter(c => c.value !== 'discrepancias' || canVerDiscrepancias);
    const activeChip = chips.find(c => c.value === active) || chips[0];
    const ActiveIcon = activeChip.icon;
    const isActiveDiscrep = !!activeChip.discrepancia;

    // Click fuera cierra el dropdown.
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

    const handleSelect = (value: string) => {
        onChange(value);
        setOpen(false);
    };

    return (
        <div ref={wrapperRef} className={cn("relative shrink-0", className)}>
            {/* Botón principal: muestra el filtro activo + chevron */}
            <button
                onClick={() => setOpen(v => !v)}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-label font-bold transition-all",
                    open
                        ? "bg-card border-brand-primary/40 shadow-sm"
                        : "bg-card border-border hover:border-brand-primary/30",
                    isActiveDiscrep ? "text-red-600 dark:text-red-400" : "text-brand-dark"
                )}
            >
                <ActiveIcon className="h-3.5 w-3.5 shrink-0" />
                <span>{activeChip.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform shrink-0", open && "rotate-180")} />
            </button>

            {/* Menú desplegable */}
            {open && (
                <div className="absolute top-full left-0 mt-1.5 w-56 bg-card border border-border rounded-xl shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                    {chips.map(chip => {
                        const isActive = active === chip.value;
                        const isDiscrep = !!chip.discrepancia;
                        const Icon = chip.icon;
                        return (
                            <button
                                key={chip.value}
                                onClick={() => handleSelect(chip.value)}
                                className={cn(
                                    "w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold transition-colors text-left",
                                    isActive
                                        ? isDiscrep
                                            ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-400"
                                            : "bg-brand-primary/10 text-green-700 dark:text-green-300"
                                        : isDiscrep
                                            ? "text-red-600 dark:text-red-400 hover:bg-muted"
                                            : "text-brand-dark hover:bg-muted"
                                )}
                            >
                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                <span className="flex-1 truncate">{chip.label}</span>
                                {isDiscrep && discrepanciasCount > 0 && (
                                    <span className="px-1.5 py-[1px] rounded-full text-micro font-black leading-none bg-red-500 text-white shrink-0">
                                        {discrepanciasCount}
                                    </span>
                                )}
                                {isActive && <Check className="h-3.5 w-3.5 shrink-0" />}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default StatusFilterBar;

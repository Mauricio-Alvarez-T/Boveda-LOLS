import React from 'react';
import { Clock, CheckCircle2, PackageCheck, AlertTriangle, LayoutGrid } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Filtro de estado de Transferencias — chips compactos SIEMPRE visibles.
 * Una fila de chips muy pequeños (Todas / Pendientes / Aprobadas / Recibidas /
 * Discrepancias), sin desplegable; el activo queda resaltado.
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
    const chips = STATUS_CHIPS.filter(c => c.value !== 'discrepancias' || canVerDiscrepancias);

    return (
        <div className={cn("flex flex-wrap items-center gap-1 shrink-0", className)}>
            {chips.map(chip => {
                const isActive = active === chip.value;
                const isDiscrep = !!chip.discrepancia;
                const Icon = chip.icon;
                return (
                    // eslint-disable-next-line no-restricted-syntax -- selector pill estado (color dinámico activo/discrepancia)
                    <button
                        key={chip.value}
                        onClick={() => onChange(chip.value)}
                        title={chip.label}
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded-lg text-label font-bold transition-colors",
                            isActive
                                ? isDiscrep
                                    ? "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                                    : "bg-brand-primary/10 text-green-700 dark:text-green-300"
                                : isDiscrep
                                    ? "text-red-700/80 hover:bg-muted hover:text-red-700 dark:text-red-300/80"
                                    : "text-muted-foreground hover:bg-muted hover:text-brand-dark"
                        )}
                    >
                        <Icon className="h-3 w-3 shrink-0" />
                        <span>{chip.label}</span>
                        {isDiscrep && discrepanciasCount > 0 && (
                            <span className="px-1.5 py-[1px] rounded-full text-micro font-black leading-none bg-red-500 text-white shrink-0">
                                {discrepanciasCount}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
};

export default StatusFilterBar;

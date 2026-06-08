import React from 'react';
import { Clock, CheckCircle2, PackageCheck, AlertTriangle, LayoutGrid } from 'lucide-react';
import { cn } from '../../utils/cn';

/**
 * Filtro de estado de Transferencias — control segmentado liviano (estilo
 * sub-tabs Maestro / look Vehículos). Reemplaza las antiguas barras de chips
 * rellenas que se duplicaban en TransferenciasList y TransferenciasPanel.
 *
 * Track sutil (bg-muted) + pestaña activa elevada (bg-card + shadow). Sin
 * backdrop-blur, sin bordes pesados, sin rellenos de color saturado: la
 * intención es una superficie limpia y clara.
 */

const STATUS_CHIPS: { value: string; label: string; shortLabel: string; icon: React.ElementType; discrepancia?: boolean }[] = [
    { value: 'todas',         label: 'Todas',         shortLabel: 'Todas',    icon: LayoutGrid },
    { value: 'pendiente',     label: 'Pendientes',    shortLabel: 'Pend.',    icon: Clock },
    { value: 'aprobada',      label: 'Aprobadas',     shortLabel: 'Aprob.',   icon: CheckCircle2 },
    { value: 'recibida',      label: 'Recibidas',     shortLabel: 'Recib.',   icon: PackageCheck },
    { value: 'discrepancias', label: 'Discrepancias', shortLabel: 'Discrep.', icon: AlertTriangle, discrepancia: true },
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
        <div className={cn(
            "flex items-center gap-1 p-1 bg-muted rounded-xl shrink-0",
            className
        )}>
            {chips.map(chip => {
                const isActive = active === chip.value;
                const isDiscrep = !!chip.discrepancia;
                const Icon = chip.icon;
                const flagged = isDiscrep && discrepanciasCount > 0;
                return (
                    <button
                        key={chip.value}
                        onClick={() => onChange(chip.value)}
                        title={chip.label}
                        className={cn(
                            "relative flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-[11px] font-bold transition-all shrink-0",
                            isActive
                                ? isDiscrep
                                    ? "bg-card text-red-600 dark:text-red-400 shadow-sm"
                                    : "bg-card text-brand-primary shadow-sm"
                                : flagged
                                    ? "text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                                    : "text-muted-foreground hover:text-brand-dark"
                        )}
                    >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{chip.shortLabel}</span>
                        {flagged && !isActive && (
                            <span className="ml-0.5 px-1 py-[1px] rounded-full text-[8px] font-black leading-none bg-red-500 text-white shrink-0">
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

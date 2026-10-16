import React from 'react';
import { Clock, CheckCircle2, PackageCheck, AlertTriangle, LayoutGrid, History } from 'lucide-react';
import { cn } from '../../utils/cn';
import { PestanasElasticas } from '../ui/PestanasElasticas';

/**
 * Filtro de estado de Transferencias — SIEMPRE visible, sin desplegable.
 * Formato único de menús (dueño 2026-10-16): `PestanasElasticas` en una sola fila
 * (con scroll horizontal si no cabe); «Diferencias» activo va en rojo.
 */

const STATUS_CHIPS: { value: string; label: string; icon: React.ElementType; discrepancia?: boolean }[] = [
    { value: 'todas',         label: 'Todas',         icon: LayoutGrid },
    { value: 'pendiente',     label: 'Pendientes',    icon: Clock },
    { value: 'aprobada',      label: 'Aprobadas',     icon: CheckCircle2 },
    { value: 'recibida',      label: 'Recibidas',     icon: PackageCheck },
    // Histórico general: tabla paginada con TODAS las solicitudes visibles para el
    // usuario (mismo scoping del backend). Sin gate de permiso: quien ve el tab, lo ve.
    { value: 'historico',     label: 'Histórico',     icon: History },
    { value: 'discrepancias', label: 'Diferencias', icon: AlertTriangle, discrepancia: true },
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
        <div className={cn('flex shrink-0 rounded-2xl bg-muted p-1', className)}>
            <PestanasElasticas
                opciones={chips.map(c => ({ ...c, key: c.value }))}
                activa={active}
                onCambiar={onChange}
                aria-label="Estado de las solicitudes de materiales"
                claseFila="gap-1"
                // `text-base`: 16 px es lo que siempre se vio (el `text-label` lo borraba `cn()` antes de
                // conocer los tamaños propios); el dueño eligió conservarlo (2026-10-16).
                claseOpcion="flex items-center gap-1 px-2.5 py-1 rounded-xl text-base font-bold whitespace-nowrap shrink-0"
                claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                // «Diferencias» se marca en rojo: el color es el significado (diseno.md §9.12).
                claseIndicador={active === 'discrepancias' ? 'bg-red-600 text-white' : undefined}
                titulo={c => c.label}
                render={(c, sobreIndicador) => {
                    const Icon = c.icon;
                    return (
                        <>
                            <Icon className="h-3 w-3 shrink-0" />
                            <span className={cn(!sobreIndicador && c.discrepancia && 'text-red-700/80 dark:text-red-300/80')}>{c.label}</span>
                            {c.discrepancia && discrepanciasCount > 0 && (
                                <span className={cn('px-1.5 py-[1px] rounded-full text-micro font-black leading-none shrink-0',
                                    sobreIndicador ? 'bg-white text-red-700' : 'bg-red-500 text-white')}>
                                    {discrepanciasCount}
                                </span>
                            )}
                        </>
                    );
                }}
            />
        </div>
    );
};

export default StatusFilterBar;

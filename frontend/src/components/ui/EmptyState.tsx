import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: React.ReactNode;
    /** Acción opcional (ej. un <Button>) bajo la descripción. */
    action?: React.ReactNode;
    className?: string;
}

/**
 * Estado vacío del design system (Fase 2). Centra icono + título + descripción
 * + acción opcional. Estandariza el patrón repetido inline (listados/grids sin
 * datos), p.ej. el de ObrasFinalizadas.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className }) => (
    <div className={cn('flex flex-col items-center justify-center gap-3 py-20 text-center', className)}>
        {Icon && (
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <Icon className="h-8 w-8 text-muted-foreground/40" />
            </div>
        )}
        <div>
            <p className="text-sm font-semibold text-brand-dark">{title}</p>
            {description && (
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
            )}
        </div>
        {action}
    </div>
);

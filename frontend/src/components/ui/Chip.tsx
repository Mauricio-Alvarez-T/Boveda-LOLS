import React from 'react';
import { cn } from '../../utils/cn';

export type ChipTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

interface ChipProps {
    label: React.ReactNode;
    icon?: React.ReactNode;
    tone?: ChipTone;
    className?: string;
}

/**
 * Pill estática del design system (Fase 2): etiqueta pequeña con tono.
 * Para estados de DOMINIO usar `<StatusBadge>` (lee statusConfig); este Chip
 * es para etiquetas genéricas (contadores, tags, marcas).
 *
 * Clases por tono = literales estáticos completos (requisito del JIT v4).
 */
const tones: Record<ChipTone, string> = {
    neutral: 'bg-muted text-muted-foreground border-border',
    brand: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
    success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60',
    warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60',
    danger: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60',
    info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60',
};

export const Chip: React.FC<ChipProps> = ({ label, icon, tone = 'neutral', className }) => (
    <span
        className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-label font-semibold uppercase tracking-wide',
            tones[tone],
            className,
        )}
    >
        {icon}
        {label}
    </span>
);

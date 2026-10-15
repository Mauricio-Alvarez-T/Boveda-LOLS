import React from 'react';
import type { ChipTone } from '../ui/Chip';

/**
 * Píldoras del módulo Ideas. Sin `cn()` a propósito: tailwind-merge no conoce los
 * tamaños propios (`text-micro`, `text-label`…) y los BORRA cuando hay un color
 * `text-*` al lado. Por eso mismo el `<Chip>` del design system sale más grande de
 * lo que pide (pendiente de arreglar en utils/cn.ts) y acá no se usa: en el celular
 * un "ACEPTADA" a tamaño de texto normal le comía media línea al título.
 */

/** Metadato (pantalla, obra, dispositivo, fecha, señales): neutro y en minúsculas — es dato, no estado. */
export const Meta: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; tono?: 'neutro' | 'peligro' }> = ({ icon, children, tono = 'neutro' }) => (
    <span className={`inline-flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-label font-medium ${tono === 'peligro' ? 'border-destructive/30 text-destructive' : 'border-border text-muted-foreground'}`}>
        {icon}
        {children}
    </span>
);

const TONOS: Record<ChipTone, string> = {
    neutral: 'bg-muted text-muted-foreground border-border',
    brand: 'bg-brand-primary/10 text-brand-primary border-brand-primary/20',
    success: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60',
    warning: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60',
    danger: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60',
    info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60',
};

/** Estado de una idea (Pendiente, Aceptada…): pequeño, en mayúsculas y con el color de su significado. */
export const EstadoPill: React.FC<{ tone: ChipTone; children: React.ReactNode }> = ({ tone, children }) => (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-micro font-bold uppercase tracking-wide whitespace-nowrap ${TONOS[tone]}`}>
        {children}
    </span>
);

export default Meta;

import React from 'react';
import { cn } from '../../utils/cn';

interface SectionProps {
    title: React.ReactNode;
    /** Acción opcional alineada a la derecha del título (botón, link, etc.). */
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    bodyClassName?: string;
}

/**
 * Sección con título del design system (Fase 2): card con cabecera (título +
 * acción opcional) y cuerpo. Estandariza el patrón de "tarjeta con encabezado"
 * repetido en varias páginas.
 */
export const Section: React.FC<SectionProps> = ({ title, action, children, className, bodyClassName }) => (
    <section className={cn('rounded-2xl border border-border bg-card', className)}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
            <h3 className="text-section font-semibold text-brand-primary">{title}</h3>
            {action}
        </div>
        <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
);

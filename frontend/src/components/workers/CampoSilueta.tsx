import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../utils/cn';

/**
 * Silueta de un campo mientras el formulario espera sus catálogos (fichas de Gestiones): el rótulo se dibuja de
 * verdad (no depende de datos) y la caja va en gris, del alto de Input / Select (h-11). Va dentro de un
 * `<Cargando>`, que es el que anuncia la carga al lector de pantalla.
 */
export const CampoSilueta: React.FC<{ label: string; className?: string }> = ({ label, className }) => (
    <div className={cn('w-full space-y-1.5', className)} aria-hidden="true">
        <span className="ml-0.5 block text-sm font-medium text-muted-foreground">{label}</span>
        {/* rounded-xl = el radio de Input/Select (tailwind-merge no reconoce rounded-control y dejaría el rounded-md base). */}
        <Skeleton className="h-11 w-full rounded-xl" />
    </div>
);

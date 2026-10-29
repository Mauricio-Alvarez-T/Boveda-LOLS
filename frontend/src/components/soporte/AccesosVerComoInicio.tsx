import React, { Suspense } from 'react';
import { useAuth } from '../../context/AuthContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { cn } from '../../utils/cn';
import { Cargando, Skeleton, SkeletonCirculo } from '../ui/Skeleton';

/**
 * Lo que el Inicio monta (Dashboard.tsx): el recuadro «Lo que puede usar…» SOLO con «ver como» activo. El recuadro
 * (con el mapa de permisos de la pantalla) se baja recién entonces, así el Inicio de todos los demás no carga nada de
 * más (celulares lentos, 2026-10-21).
 */
const AccesosVerComo = lazyWithRetry(() => import('./AccesosVerComo'));

export const AccesosVerComoInicio: React.FC<{ className?: string }> = ({ className }) => {
    const { verComo } = useAuth();
    if (!verComo) return null;
    return (
        <Suspense fallback={<RecuadroSilueta className={className} />}>
            <AccesosVerComo className={className} />
        </Suspense>
    );
};

/** Mientras baja el recuadro: su cabecera (el texto fijo de verdad; el nombre y los botones en gris). */
const RecuadroSilueta: React.FC<{ className?: string }> = ({ className }) => (
    <Cargando que="lo que puede usar" className={cn('rounded-3xl bg-card p-5 text-foreground shadow-[var(--shadow-md)] sm:p-6', className)}>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <SkeletonCirculo className="h-10 w-10" />
                <div className="min-w-0 space-y-2">
                    <Skeleton className="h-5 w-56 max-w-full" />
                    <p className="text-sm text-muted-foreground">Así es su menú y lo que puede hacer en cada parte. Es solo para revisar: no guarda nada.</p>
                </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2 max-md:pl-[3.25rem]" aria-hidden="true">
                <Skeleton className="h-9 w-40 rounded-full" />
                <Skeleton className="h-9 w-24 rounded-full" />
            </div>
        </div>
    </Cargando>
);

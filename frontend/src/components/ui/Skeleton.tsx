import React from 'react';
import { cn } from '../../utils/cn';

/**
 * Skeleton — placeholder de carga (Design System Bóveda LOLS).
 *
 * Bloque con `animate-pulse` sobre la superficie neutra `bg-muted`. Sustituye a
 * los textos "Cargando..." y spinners genéricos para que la carga comunique la
 * forma del contenido que va a llegar (reduce el salto de layout y la sensación
 * de "pegado").
 *
 * ⚠️ Tailwind v4 JIT: las clases base son literales completas. El `className`
 * de tamaño (h-9, w-full, etc.) lo pasa el consumidor, también como literal.
 *
 *   <Skeleton className="h-9 w-full" />
 *   <SkeletonText lines={3} />
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden="true" />
);

/** Varias líneas de texto simuladas (la última, más corta). */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
    <div className={cn('space-y-2', className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
            <div
                key={i}
                className={cn('animate-pulse rounded-md bg-muted h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
            />
        ))}
    </div>
);

Skeleton.displayName = 'Skeleton';

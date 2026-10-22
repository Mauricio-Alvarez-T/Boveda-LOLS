import React from 'react';
import { cn } from '../../utils/cn';

/**
 * Skeleton — placeholder de carga (Design System Bóveda LOLS).
 *
 * Bloque QUIETO sobre la superficie neutra `bg-muted`: el contorno de lo que va a llegar. Sin pulso desde
 * 2026-10-22 (dueño: «solo cargar el contorno de cada apartado primero y con un efecto rápido y de fade que
 * aparezcan los datos»): el parpadeo se leía como «la web está cargando, es lenta». Los datos que lo
 * reemplazan llevan `datos-aparecen` (index.css).
 * Sustituye a los textos "Cargando..." y spinners genéricos para que la carga
 * comunique la forma del contenido que va a llegar (reduce el salto de layout y
 * la sensación de "pegado").
 *
 * ⚠️ Tailwind v4 JIT: las clases base son literales completas. El `className`
 * de tamaño (h-9, w-full, etc.) lo pasa el consumidor, también como literal.
 *
 *   <Skeleton className="h-9 w-full" />
 *   <SkeletonText lines={3} />
 */
export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn('rounded-md bg-muted', className)} aria-hidden="true" />
);

/**
 * Contorno de una lista o tabla mientras llegan sus filas: reemplaza al círculo girando + «Cargando…» (2026-10-22).
 * Quieto; el lector de pantalla oye «Cargando…».
 */
export const SkeletonFilas: React.FC<{ filas?: number; className?: string }> = ({ filas = 6, className }) => (
    <div className={cn('flex flex-col gap-2 p-3', className)} role="status">
        <span className="sr-only">Cargando…</span>
        {Array.from({ length: filas }).map((_, i) => (
            <div key={i} className="h-11 rounded-xl border border-border/60 bg-muted/40" aria-hidden="true" />
        ))}
    </div>
);

/** Varias líneas de texto simuladas (la última, más corta). */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
    <div className={cn('space-y-2', className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
            <div
                key={i}
                className={cn('rounded-md bg-muted h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
            />
        ))}
    </div>
);

Skeleton.displayName = 'Skeleton';

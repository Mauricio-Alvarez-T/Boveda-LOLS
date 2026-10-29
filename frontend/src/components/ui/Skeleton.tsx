import React from 'react';
import { cn } from '../../utils/cn';

/**
 * Siluetas de carga (Design System Bóveda LOLS; diseno.md §9.17).
 *
 * Mientras un apartado espera sus datos se dibuja la FORMA de lo que va a llegar —lista, tarjetas, ficha,
 * formulario— en gris neutro con un brillo suave que la cruza (`.silueta`, index.css; Marcos 2026-10-29: «con brillo
 * suave que dé la sensación de carga de pantalla»; con «reducir movimiento» queda quieta). Nunca una rueda girando
 * ni un «Cargando…» suelto: las ruedas quedan SOLO dentro de botones (Guardar, Enviar…), que avisan que un clic se
 * está procesando. Lo que no depende de datos (títulos, pestañas, barras verdes de sección) se dibuja de verdad.
 * Cuando llegan los datos, su contenedor lleva el fundido de `hooks/useAparecer`.
 *
 * ⚠️ Tailwind v4 JIT: las clases base son literales completas. El `className` de tamaño (h-9, w-full, etc.) lo
 * pasa el consumidor, también como literal.
 *
 *   <Cargando que="las solicitudes"><SkeletonLista filas={6} /></Cargando>
 *   <Skeleton className="h-9 w-full" />
 */
export const Skeleton: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
    <div className={cn('silueta rounded-md', className)} style={style} aria-hidden="true" />
);

/** Un círculo (ícono de tarjeta, foto de persona). */
export const SkeletonCirculo: React.FC<{ className?: string }> = ({ className }) => (
    <Skeleton className={cn('shrink-0 rounded-full', className)} />
);

/**
 * Envoltura de una sección mientras carga: el lector de pantalla oye «Cargando <que>…» una vez y no lee los bloques.
 * Usarla alrededor de las siluetas que no traen su propio `role="status"` (Lista, Tarjetas, Ficha, Formulario sí lo traen).
 */
export const Cargando: React.FC<{ que?: string; className?: string; children: React.ReactNode }> = ({ que, className, children }) => (
    <div role="status" className={className}>
        <span className="sr-only">{que ? `Cargando ${que}…` : 'Cargando…'}</span>
        {children}
    </div>
);

/** Contorno de una lista o tabla mientras llegan sus filas (filas simples, sin estructura). */
export const SkeletonFilas: React.FC<{ filas?: number; className?: string }> = ({ filas = 6, className }) => (
    <div className={cn('flex flex-col gap-2 p-3', className)} role="status">
        <span className="sr-only">Cargando…</span>
        {Array.from({ length: filas }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
    </div>
);

/** Varias líneas de texto simuladas (la última, más corta). */
export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({ lines = 3, className }) => (
    <div className={cn('space-y-2', className)} aria-hidden="true">
        {Array.from({ length: lines }).map((_, i) => (
            <Skeleton key={i} className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')} />
        ))}
    </div>
);

/**
 * Una lista de filas con forma: ícono o foto a la izquierda, dos líneas de texto y una píldora a la derecha
 * (solicitudes, documentos, trabajadores, avisos…). `enTarjeta` la pone dentro de la tarjeta blanca con borde.
 */
export const SkeletonLista: React.FC<{ filas?: number; icono?: boolean; pildora?: boolean; enTarjeta?: boolean; que?: string; className?: string }> = ({
    filas = 6, icono = true, pildora = true, enTarjeta = true, que, className,
}) => (
    <Cargando que={que} className={cn(enTarjeta && 'rounded-card border border-border bg-card', className)}>
        <ul className="divide-y divide-border" aria-hidden="true">
            {Array.from({ length: filas }).map((_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-3.5">
                    {icono && <SkeletonCirculo className="h-10 w-10" />}
                    <div className="min-w-0 flex-1 space-y-2">
                        <Skeleton className={cn('h-4', i % 3 === 1 ? 'w-2/5' : 'w-1/2 sm:w-1/3')} />
                        <Skeleton className={cn('h-3', i % 2 ? 'w-3/5' : 'w-3/4 sm:w-1/2')} />
                    </div>
                    {pildora && <Skeleton className="h-7 w-20 shrink-0 rounded-full" />}
                </li>
            ))}
        </ul>
    </Cargando>
);

/** Una tarjeta como las del Inicio: círculo con ícono, título, cifra grande y tres filas. */
export const SkeletonTarjeta: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn('rounded-card border border-border bg-card p-5', className)} aria-hidden="true">
        <div className="mb-4 flex items-center gap-3">
            <SkeletonCirculo className="h-11 w-11" />
            <div className="flex-1 space-y-2"><Skeleton className="h-4 w-2/5" /><Skeleton className="h-3 w-1/4" /></div>
        </div>
        <Skeleton className="mb-4 h-12 w-24" />
        <div className="space-y-3">
            {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3"><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-6 w-14 rounded-full" /></div>
            ))}
        </div>
    </div>
);

/** Una grilla de tarjetas (Inicio, resúmenes). */
export const SkeletonTarjetas: React.FC<{ n?: number; que?: string; className?: string }> = ({ n = 6, que, className }) => (
    <Cargando que={que} className={cn('grid gap-4 sm:grid-cols-2 xl:grid-cols-3', className)}>
        {Array.from({ length: n }).map((_, i) => <SkeletonTarjeta key={i} />)}
    </Cargando>
);

/** La ficha de una persona o cosa: foto, nombre y etiquetas; abajo datos en dos columnas y una lista. */
export const SkeletonFicha: React.FC<{ que?: string; className?: string }> = ({ que, className }) => (
    <Cargando que={que} className={cn('flex flex-col gap-4', className)}>
        <div className="rounded-card border border-border bg-card p-5" aria-hidden="true">
            <div className="flex items-center gap-4">
                <SkeletonCirculo className="h-16 w-16" />
                <div className="flex-1 space-y-2.5">
                    <Skeleton className="h-6 w-48 max-w-full sm:w-64" />
                    <Skeleton className="h-3.5 w-32" />
                    <div className="flex gap-2"><Skeleton className="h-6 w-20 rounded-full" /><Skeleton className="h-6 w-24 rounded-full" /></div>
                </div>
            </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-2" aria-hidden="true">
            <div className="rounded-card border border-border bg-card p-5">
                <Skeleton className="mb-4 h-4 w-28" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                    {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="space-y-2"><Skeleton className="h-3 w-16" /><Skeleton className="h-4 w-28 max-w-full" /></div>)}
                </div>
            </div>
            <div className="rounded-card border border-border bg-card p-5">
                <Skeleton className="mb-4 h-4 w-32" />
                {[0, 1, 2, 3].map(i => (
                    <div key={i} className="flex items-center gap-3 py-2.5"><Skeleton className="h-8 w-8 rounded-lg" /><Skeleton className="h-3.5 flex-1" /><Skeleton className="h-6 w-16 rounded-full" /></div>
                ))}
            </div>
        </div>
    </Cargando>
);

/** Un formulario (ventanas, configuración): pares rótulo + campo; `columnas` = 2 los pone de a dos desde sm. */
export const SkeletonFormulario: React.FC<{ campos?: number; columnas?: 1 | 2; que?: string; className?: string }> = ({ campos = 4, columnas = 1, que, className }) => (
    <Cargando que={que} className={cn('grid gap-4', columnas === 2 && 'sm:grid-cols-2', className)}>
        {Array.from({ length: campos }).map((_, i) => (
            <div key={i} className="space-y-2" aria-hidden="true">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-11 w-full rounded-control" />
            </div>
        ))}
    </Cargando>
);

Skeleton.displayName = 'Skeleton';

import React from 'react';
import { Skeleton } from '../ui/Skeleton';
import { cn } from '../../utils/cn';

/**
 * Piezas de silueta de carga de Configuración (diseno.md §9.17): la forma de lo que va a llegar, con el rótulo de
 * verdad cuando no depende de los datos. Las usan los paneles de avisos, alertas, correo y sueldos.
 */

/** Un campo de formulario: el rótulo de verdad (como el de `Input`) y la caja en gris. */
export const CampoSilueta: React.FC<{ label?: string; className?: string }> = ({ label, className }) => (
    <div className={cn('w-full space-y-1.5', className)} aria-hidden="true">
        {label ? <p className="ml-0.5 text-sm font-medium text-muted-foreground">{label}</p> : <Skeleton className="h-3.5 w-28" />}
        <Skeleton className="h-11 w-full rounded-control" />
    </div>
);

/**
 * La tarjeta de una regla: nombre y explicación a la izquierda (en gris); a la derecha los campos con su rótulo de
 * verdad y el botón de encendido. `rotulos` = campos con el rótulo encima, como `Input` (Alertas: «Aviso», «Crítico»);
 * `enLinea` = un campo chico con el rótulo al lado (Avisos: «Umbral»). `boton` = el tamaño del botón real.
 */
export const TarjetaReglaSilueta: React.FC<{ rotulos?: string[]; enLinea?: string; boton?: string }> = ({
    rotulos, enLinea, boton = 'h-10 w-10 sm:h-9 sm:w-9',
}) => (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center" aria-hidden="true">
        <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-48 max-w-full" />
            <Skeleton className="h-3 w-4/5" />
        </div>
        {rotulos ? (
            <div className="flex shrink-0 items-end gap-2">
                {rotulos.map(r => (
                    <div key={r} className="w-24 space-y-1.5">
                        <p className="ml-0.5 text-sm font-medium text-muted-foreground">{r}</p>
                        <Skeleton className="h-11 w-full rounded-control" />
                    </div>
                ))}
                <Skeleton className={cn('shrink-0 rounded-full', boton)} />
            </div>
        ) : (
            <div className="flex shrink-0 items-center gap-3">
                {enLinea && (
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">{enLinea}</span>
                        <Skeleton className="h-9 w-16 rounded-lg" />
                    </div>
                )}
                <Skeleton className={cn('shrink-0 rounded-full', boton)} />
            </div>
        )}
    </div>
);

/** La tarjeta de un correo (suscriptor, destinatario, plantilla): nombre + píldora, una línea gris y los botones. */
export const TarjetaCorreoSilueta: React.FC<{ botones?: number; lineas?: number; className?: string }> = ({ botones = 4, lineas = 1, className }) => (
    <div className={cn('flex items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4', className)} aria-hidden="true">
        <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            {Array.from({ length: lineas }).map((_, i) => (
                <Skeleton key={i} className={cn('h-3', i === lineas - 1 ? 'w-1/2' : 'w-4/5')} />
            ))}
        </div>
        {botones > 0 && (
            <div className="flex shrink-0 items-center gap-1.5">
                {Array.from({ length: botones }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-10 rounded-full sm:h-9 sm:w-9" />
                ))}
            </div>
        )}
    </div>
);

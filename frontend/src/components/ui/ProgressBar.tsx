import React from 'react';
import { cn } from '../../utils/cn';

/**
 * Barra de progreso segmentada Recibido/Pendiente para recepción parcial (Fase 3).
 * El ancho del relleno va por `style` inline: Tailwind v4 JIT no admite anchos
 * dinámicos por clase (nunca `w-[..]` concatenado).
 */
export const ProgressBar: React.FC<{
    recibido: number;
    pendiente: number;
    /** % explícito; si se omite se calcula recibido/(recibido+pendiente). */
    porcentaje?: number;
    /** compact = barra fina sin texto (para celdas de tabla). */
    compact?: boolean;
    /** Muestra "n/total" (compact) o el % / "Completo" (normal). */
    showLabel?: boolean;
    className?: string;
}> = ({ recibido, pendiente, porcentaje, compact = false, showLabel = false, className }) => {
    const total = recibido + pendiente;
    const pct = porcentaje != null
        ? Math.max(0, Math.min(100, porcentaje))
        : total > 0 ? Math.round((recibido / total) * 100) : 0;
    const completo = pendiente <= 0 && total > 0;

    const track = (
        <div className={cn("w-full rounded-full bg-muted overflow-hidden", compact ? "h-1.5" : "h-2.5")}>
            <div
                className="h-full rounded-full bg-brand-primary transition-all"
                style={{ width: `${pct}%` }}
            />
        </div>
    );

    if (compact) {
        return (
            <div className={cn("flex flex-col gap-1", className)}>
                {track}
                {showLabel && (
                    <span className={cn(
                        "text-micro font-bold text-center tabular-nums",
                        completo ? "text-green-700 dark:text-green-300" : "text-muted-foreground"
                    )}>
                        {recibido}/{total}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className={cn("flex items-center gap-2", className)}>
            <div className="flex-1">{track}</div>
            {showLabel && (
                <span className={cn(
                    "text-caption font-bold tabular-nums shrink-0",
                    completo ? "text-green-700 dark:text-green-300" : "text-muted-foreground"
                )}>
                    {completo ? "Completo" : `${pct}%`}
                </span>
            )}
        </div>
    );
};

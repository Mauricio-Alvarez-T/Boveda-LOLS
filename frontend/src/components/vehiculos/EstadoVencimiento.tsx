import React from 'react';
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { diasHastaVencimiento, estadoVencimiento, textoVencimiento } from '../../utils/vencimientos';

interface Props {
    /** Fecha de vencimiento ('YYYY-MM-DD' o ISO). Sin fecha no se renderiza nada. */
    fecha?: string | null;
    /** Si es false, oculta el chip cuando está vigente (para listas largas). Default true. */
    mostrarVigente?: boolean;
    className?: string;
}

/**
 * Chip de estado de vencimiento. El color comunica ESTADO, no decora:
 * rojo = vencido (destructivo), ámbar = por vencer (precaución), verde = vigente.
 */
export const EstadoVencimiento: React.FC<Props> = ({ fecha, mostrarVigente = true, className }) => {
    const dias = diasHastaVencimiento(fecha);
    const estado = estadoVencimiento(dias);
    if (!estado) return null;
    if (estado === 'vigente' && !mostrarVigente) return null;

    const estilos: Record<string, { cls: string; Icon: React.ElementType }> = {
        vencido:    { cls: 'text-destructive bg-destructive/10 border-destructive/20', Icon: AlertTriangle },
        por_vencer: { cls: 'text-amber-700 bg-amber-100 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-800/60', Icon: Clock },
        vigente:    { cls: 'text-brand-primary bg-brand-primary/10 border-brand-primary/20', Icon: CheckCircle2 },
    };
    const { cls, Icon } = estilos[estado];

    return (
        <span className={cn('inline-flex items-center gap-1 text-micro font-bold px-1.5 py-0.5 rounded-md border w-fit mt-0.5', cls, className)}>
            <Icon className="h-2.5 w-2.5" /> {textoVencimiento(dias)}
        </span>
    );
};

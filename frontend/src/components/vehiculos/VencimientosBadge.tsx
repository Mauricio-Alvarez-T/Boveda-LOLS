import React from 'react';
import { cn } from '../../utils/cn';

interface Props {
    /** Cuántos vencimientos hay. 0 → no se renderiza nada. */
    total: number;
    /** Cuántos de esos ya vencieron: define el color (rojo vs ámbar). */
    vencidos: number;
    /** Si se pasa, el badge es un botón (ej. abrir el panel en el menú). */
    onClick?: (e: React.MouseEvent) => void;
    /** Texto del tooltip; por defecto un resumen de cuántos son. */
    title?: string;
    className?: string;
}

/**
 * Número de vencimientos. Se usa en los tres niveles con el MISMO criterio de
 * color, para que el 4 del menú y los 1 de cada empresa/vehículo se lean como
 * la misma cosa desglosada:
 *   rojo  = hay algo ya vencido,
 *   ámbar = solo cosas por vencer (≤30 días).
 */
export const VencimientosBadge: React.FC<Props> = ({ total, vencidos, onClick, title, className }) => {
    if (!total) return null;

    const label = title ?? (
        vencidos > 0
            ? `${vencidos} vencido${vencidos === 1 ? '' : 's'}${total > vencidos ? ` y ${total - vencidos} por vencer` : ''}`
            : `${total} por vencer`
    );
    const clases = cn(
        'shrink-0 min-w-[20px] h-[20px] px-1.5 rounded-full text-micro font-black text-white flex items-center justify-center',
        vencidos > 0 ? 'bg-destructive' : 'bg-amber-500',
        className,
    );

    if (!onClick) return <span className={clases} title={label} aria-label={label}>{total}</span>;

    return (
        /* eslint-disable-next-line no-restricted-syntax -- abre el panel sin navegar */
        <button type="button" onClick={onClick} title={`${label} — ver detalle`} aria-label={`Ver vencimientos: ${label}`}
            className={cn(clases, 'transition-transform hover:scale-110')}>
            {total}
        </button>
    );
};

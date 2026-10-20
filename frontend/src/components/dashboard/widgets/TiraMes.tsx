import React, { useMemo } from 'react';
import { cn } from '../../../utils/cn';
import { useTarjetaActiva } from './tarjetaActiva';
import { ariaTira, tiraDelMes, type DiaTira } from './resumenFaltasMes';

interface Props {
    /** 'YYYY-MM-DD' de cada falta del trabajador. */
    fechas?: string[];
    anio: number;
    /** 1-12. */
    mes: number;
    /** Día de hoy si es el mes en curso; null si el mes ya pasó. */
    hoyDia: number | null;
    /** sm = tarjeta; md = tabla del detalle. */
    tamano?: 'sm' | 'md';
    className?: string;
}

/** Clases literales completas por tipo de día (JIT de Tailwind): sobre blanco y sobre la tarjeta verde. */
const COLOR: Record<DiaTira['tipo'], string> = {
    falta: 'bg-red-600 dark:bg-red-500',
    habil: 'bg-zinc-300 dark:bg-zinc-600',
    finde: 'bg-zinc-200 dark:bg-zinc-700',
    futuro: 'bg-zinc-100 dark:bg-zinc-800',
};
const COLOR_SOBRE_VERDE: Record<DiaTira['tipo'], string> = {
    falta: 'bg-yellow-300',
    habil: 'bg-white/35',
    finde: 'bg-white/15',
    futuro: 'bg-white/10',
};

/**
 * Los días del mes de un trabajador en una tira (dueño 2026-10-20): cada barra es un día; las faltas en
 * rojo (amarillo sobre la tarjeta verde), los lunes con una rayita abajo y hoy con un anillo. Así «2 lunes»
 * o «2 días seguidos» se ven sin leer fechas. Decorativa para el lector de pantalla salvo su `aria-label`.
 */
export const TiraMes: React.FC<Props> = ({ fechas, anio, mes, hoyDia, tamano = 'sm', className }) => {
    const sobreVerde = useTarjetaActiva();
    const dias = useMemo(() => tiraDelMes(fechas, anio, mes, hoyDia), [fechas, anio, mes, hoyDia]);
    const color = sobreVerde ? COLOR_SOBRE_VERDE : COLOR;
    return (
        <span role="img" aria-label={ariaTira(fechas)} className={cn('flex w-full gap-px', className)}>
            {dias.map(d => (
                <span key={d.dia} className="flex min-w-0 flex-1 flex-col gap-0.5" aria-hidden>
                    <span className={cn(
                        'block rounded-[2px] transition-colors duration-200',
                        tamano === 'sm' ? 'h-3' : 'h-3.5',
                        color[d.tipo],
                        d.hoy && 'ring-[1.5px] ring-foreground ring-offset-0',
                    )} />
                    <span className={cn('block h-0.5 rounded-full', d.lunes ? 'bg-muted-foreground' : 'bg-transparent')} />
                </span>
            ))}
        </span>
    );
};

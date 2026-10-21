import React from 'react';
import { cn } from '../../utils/cn';
import { segmentosTenencia, textoTenencia, tonoTenencia, type TenenciaLote } from './documentosFisicos';

/**
 * Tenencia en terreno (jefatura 2026-10-21): barra de 4 tramos, uno por día hábil permitido, como la de
 * «Asistencia guardada» del Inicio. Verde dentro del plazo, ámbar el último día, rojo pasado el plazo.
 * La usan la tarjeta del lote (Documentos físicos) y «Tus documentos» del Inicio del portador.
 */
const TONO_TENENCIA = {
    ok: { relleno: 'bg-green-700 dark:bg-green-400', cifra: 'text-foreground', detalle: 'text-muted-foreground' },
    ultimo: { relleno: 'bg-amber-500', cifra: 'text-amber-800 dark:text-amber-300', detalle: 'text-amber-800 dark:text-amber-300' },
    atrasado: { relleno: 'bg-red-600 dark:bg-red-500', cifra: 'text-red-700 dark:text-red-300', detalle: 'text-red-700 dark:text-red-300' },
} as const;

export const BarraTenencia: React.FC<{ t: TenenciaLote; className?: string }> = ({ t, className }) => {
    const tono = TONO_TENENCIA[tonoTenencia(t)];
    const { cifra, detalle } = textoTenencia(t);
    return (
        <span className={cn('mt-2.5 block rounded-xl bg-muted/60 px-3 py-2.5', className)}>
            <span className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs text-muted-foreground">Tenencia en terreno</span>
                <span className={cn('text-sm font-semibold tabular-nums', tono.cifra)}>{cifra}</span>
            </span>
            <span className="flex gap-[3px]" aria-hidden>
                {segmentosTenencia(t).map((lleno, i) => (
                    <span key={i} className={cn('h-2 flex-1 rounded-[3px]', lleno ? tono.relleno : 'bg-border')} />
                ))}
            </span>
            <span className={cn('mt-1.5 block text-xs font-medium', tono.detalle)}>{detalle}</span>
        </span>
    );
};

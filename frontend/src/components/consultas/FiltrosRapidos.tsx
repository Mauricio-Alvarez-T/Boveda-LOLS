/**
 * Atajos de un clic sobre la grilla de Trabajadores (2026-09-15).
 *
 * La investigación de filtros de RRHH coincide en algo: los productos que funcionan no compiten por
 * "tener más filtros", sino por ofrecer SEGMENTOS que responden una pregunta de negocio ("en período
 * de prueba", "licencias que vencen en 90 días") en vez de exponer un campo de la base.
 *
 * Bóveda ya tenía dos sin saberlo —"cumplen 10 meses" y "ausentes hoy"—, pero enterrados: uno solo se
 * podía encender desde una alerta del Inicio y el otro vivía dentro del panel. Acá se vuelven visibles
 * y se agregan los que faltaban, incluidos los que la grilla ya PINTA como badge y no dejaba preguntar
 * ("No recontratar", "Prueba").
 *
 * Tres de los cinco no tocan el backend: reusan params que ya existían.
 */
import React from 'react';
import { X } from 'lucide-react';

import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

export interface FiltroRapido {
    id: string;
    label: string;
    icon: React.ElementType;
    activo: boolean;
    /** Enciende el atajo. Puede fijar más de un filtro a la vez. */
    encender: () => void;
    apagar: () => void;
    /** Qué más deja fijado, para que el usuario no vea resultados que no pidió. */
    nota?: string;
    tono?: 'brand' | 'aviso' | 'peligro';
}

const TONOS = {
    brand: 'border-brand-primary bg-brand-primary/10 text-brand-primary',
    aviso: 'border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700/70 dark:bg-amber-500/10 dark:text-amber-300',
    peligro: 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-500/10 dark:text-red-300',
} as const;

export const FiltrosRapidos: React.FC<{ filtros: FiltroRapido[] }> = ({ filtros }) => {
    if (!filtros.length) return null;
    return (
        // Viven DENTRO de la barra de la cabecera de la grilla (2026-09-16), donde antes había hueco
        // vacío: así no gastan una fila propia del alto de la lista. Por eso una sola línea siempre,
        // que se desliza cuando no caben, y sin rótulo "Atajos" (el contexto de la barra ya lo dice).
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-none">
            {filtros.map(f => {
                const Icon = f.icon;
                return (
                    <Button
                        key={f.id}
                        size="sm"
                        variant="ghost"
                        aria-pressed={f.activo}
                        title={f.activo && f.nota ? f.nota : undefined}
                        onClick={() => (f.activo ? f.apagar() : f.encender())}
                        leftIcon={<Icon className="h-3.5 w-3.5" />}
                        rightIcon={f.activo ? <X className="h-3.5 w-3.5" /> : undefined}
                        className={cn(
                            'h-8 shrink-0 rounded-full border px-3 text-caption font-semibold',
                            f.activo ? TONOS[f.tono ?? 'brand'] : 'border-border text-muted-foreground hover:text-brand-dark',
                        )}
                    >
                        {f.label}
                    </Button>
                );
            })}
        </div>
    );
};

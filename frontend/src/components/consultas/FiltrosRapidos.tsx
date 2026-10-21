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
import { BarraPaginada } from '../ui/BarraPaginada';
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

/** Atajo encendido: relleno, como la opción elegida de un menú (diseno.md §9.13). */
const TONOS = {
    brand: 'bg-brand-primary text-white',
    aviso: 'bg-warning text-warning-foreground',
    peligro: 'bg-red-600 text-white',
} as const;

export const FiltrosRapidos: React.FC<{ filtros: FiltroRapido[] }> = ({ filtros }) => {
    if (!filtros.length) return null;
    return (
        // Viven DENTRO de la barra de la cabecera de la grilla (2026-09-16), donde antes había hueco
        // vacío: así no gastan una fila propia del alto de la lista. Por eso una sola línea siempre,
        // que se desliza cuando no caben, y sin rótulo "Atajos" (el contexto de la barra ya lo dice).
        // Formato único de menús (dueño 2026-10-16): pista rectangular y opciones `rounded-xl`, no
        // pastillas ovaladas. Se pueden encender varios a la vez, así que no hay indicador elástico.
        // Si no caben (celular): de a páginas con flechas, sin atajos cortados (ui/BarraPaginada, Marcos 2026-10-21).
        <div className="flex w-fit min-w-0 max-w-full rounded-2xl bg-muted p-1">
        <BarraPaginada fondo="muted" selector="[data-atajo]" className="flex-1">{p => (
        <div className="flex shrink-0 flex-nowrap items-center gap-1">
            {filtros.map((f, i) => {
                const Icon = f.icon;
                return (
                    <Button
                        key={f.id}
                        data-atajo
                        style={p.estiloOpcion(i)}
                        size="sm"
                        variant="ghost"
                        aria-pressed={f.activo}
                        title={f.activo && f.nota ? f.nota : undefined}
                        onClick={() => (f.activo ? f.apagar() : f.encender())}
                        leftIcon={<Icon className="h-3.5 w-3.5" />}
                        rightIcon={f.activo ? <X className="h-3.5 w-3.5" /> : undefined}
                        className={cn(
                            'h-7 shrink-0 rounded-xl px-3 text-caption font-semibold',
                            f.activo ? TONOS[f.tono ?? 'brand'] : 'text-muted-foreground hover:bg-background hover:text-brand-dark',
                        )}
                    >
                        {f.label}
                    </Button>
                );
            })}
        </div>
        )}</BarraPaginada>
        </div>
    );
};

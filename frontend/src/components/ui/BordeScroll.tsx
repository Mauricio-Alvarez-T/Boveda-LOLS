// Idea: GradualBlur de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React from 'react';
import { cn } from '../../utils/cn';

interface BordeScrollProps {
    /** Borde que se marca: 'inicio' = izquierda, 'fin' = derecha. */
    lado: 'inicio' | 'fin';
    /** Hay contenido escondido de ese lado (`useBordesScroll`). */
    visible: boolean;
}

/**
 * Aviso de «hay más por este lado» en un scroll horizontal (diseno.md §9): un degradado de UNA
 * capa, del color de la superficie, que se apaga al llegar al extremo.
 *
 * - Va como hermano del contenedor con scroll, dentro de un padre `relative`.
 * - El degradado sale de `card`: usarlo solo sobre superficies `bg-card` (si no, se ve la franja).
 * - Sin `backdrop-blur` ni `mask-image`: varias capas de filtro se recomponen en cada frame de
 *   scroll y son el peor caso para un Android barato (§8.9).
 * - `pointer-events-none`: un toque sobre un chip a medio desvanecer igual llega al chip.
 * - Solo cambia la opacidad; con `prefers-reduced-motion` se prende y apaga en seco.
 */
export const BordeScroll: React.FC<BordeScrollProps> = ({ lado, visible }) => (
    <div
        aria-hidden
        className={cn(
            'pointer-events-none absolute inset-y-0 w-6 from-card to-transparent transition-opacity duration-200 ease-apple motion-reduce:transition-none',
            lado === 'inicio' ? 'left-0 bg-gradient-to-r' : 'right-0 bg-gradient-to-l',
            visible ? 'opacity-100' : 'opacity-0',
        )}
    />
);

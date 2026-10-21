import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../utils/cn';

interface FlechaScrollProps {
    /** Borde donde va: 'inicio' = izquierda, 'fin' = derecha. */
    lado: 'inicio' | 'fin';
    /** Hay contenido escondido de ese lado (`useBordesScroll`). */
    visible: boolean;
    /** Lo que hay que deslizar (el mismo contenedor que recibe el `ref` de `useBordesScroll`). */
    scrollRef: React.RefObject<HTMLElement | null>;
    /** Color de la barra, para que el degradado se funda con ella. */
    fondo?: 'card' | 'muted';
}

const DEGRADADO = {
    card: { inicio: 'bg-gradient-to-r from-card', fin: 'bg-gradient-to-l from-card' },
    muted: { inicio: 'bg-gradient-to-r from-muted', fin: 'bg-gradient-to-l from-muted' },
} as const;

/**
 * Flecha «hay más por este lado» sobre una barra de PESTAÑAS con scroll horizontal (Marcos 2026-10-21: en
 * el celular «SOLICIT…» cortada no decía que la barra se desliza). Es `BordeScroll` con un círculo y una
 * flecha encima: tocarla avanza la barra 60 % de su ancho. Se apaga al llegar al extremo.
 *
 * - Va como hermana del contenedor con scroll, dentro de un padre `relative` (como `BordeScroll`).
 * - Solo para el dedo y el mouse: con teclado las pestañas se recorren con las flechas del tablist, por eso
 *   no entra al orden de Tab ni al lector de pantalla.
 * - Para chips o listas sin pestañas basta `BordeScroll`.
 */
export const FlechaScroll: React.FC<FlechaScrollProps> = ({ lado, visible, scrollRef, fondo = 'card' }) => {
    const Icono = lado === 'fin' ? ChevronRight : ChevronLeft;
    const mover = () => {
        const el = scrollRef.current;
        if (!el) return;
        const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        el.scrollBy({ left: (lado === 'fin' ? 1 : -1) * el.clientWidth * 0.6, behavior: reducir ? 'auto' : 'smooth' });
    };
    return (
        // eslint-disable-next-line no-restricted-syntax -- flecha superpuesta al borde de la barra (no es una acción del DS)
        <button type="button" aria-hidden tabIndex={-1} onClick={mover}
            className={cn('absolute inset-y-px z-10 flex w-12 items-center from-50% to-transparent transition-opacity duration-200 ease-apple motion-reduce:transition-none',
                DEGRADADO[fondo][lado],
                lado === 'fin' ? 'right-px justify-end rounded-r-2xl pr-1' : 'left-px justify-start rounded-l-2xl pl-1',
                visible ? 'opacity-100' : 'pointer-events-none opacity-0')}>
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-full text-foreground shadow-sm',
                fondo === 'card' ? 'bg-muted' : 'bg-card')}>
                <Icono className="h-4 w-4" />
            </span>
        </button>
    );
};

export default FlechaScroll;

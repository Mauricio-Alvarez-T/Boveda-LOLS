// Idea: StatusMark de React Bits (reactbits.dev, MIT + Commons Clause). Reescrito; sin código copiado.
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export type EstadoMarca = 'cargando' | 'listo' | 'fallo';

interface MarcaEstadoProps {
    estado: EstadoMarca;
    /** 'sm' = glifo suelto (botón, banner, línea). 'md' = glifo dentro de un círculo de 48 px (pantalla de confirmación). */
    tamano?: 'sm' | 'md';
    className?: string;
}

/** Curva del trazo: arranca y termina suave, para que el check se lea "dibujado" y no "deslizado". */
const EASE_TRAZO = [0.65, 0, 0.35, 1] as const;
const EASE_APPLE = [0.25, 0.1, 0.25, 1] as const;

/** Trazos de cada glifo (viewBox 24×24) con su retardo relativo: la cruz dibuja su segunda línea 0,1 s después. */
const TRAZOS: Record<Exclude<EstadoMarca, 'cargando'>, { d: string; delay: number }[]> = {
    listo: [{ d: 'M4 12l5 5L20 6', delay: 0 }],
    fallo: [
        { d: 'M6 6l12 12', delay: 0 },
        { d: 'M18 6L6 18', delay: 0.1 },
    ],
};

/**
 * Resultado de una acción (diseno.md §9, Movimiento): `cargando` gira, `listo` dibuja un
 * check y `fallo` dibuja una cruz. Siempre `aria-hidden`: el texto lo anuncia quien
 * la usa (toast de sonner, `role="status"` + título, o el texto del banner).
 *
 * - El color sale SOLO de `currentColor` (en `sm`) o de tokens (círculo `md`): sin hex.
 * - Un trazo se dibuja al montarse, así que cargando → listo en un botón, o el
 *   montaje de una pantalla de confirmación, lo dibujan exactamente una vez.
 * - `MotionConfig reducedMotion="user"` NO cubre `pathLength`: por eso se chequea
 *   `useReducedMotion()` y, si pide reducir, el glifo aparece ya completo (`initial={false}`).
 * - Nunca por fila en listas (§8.13): es feedback puntual de UNA acción.
 */
export const MarcaEstado: React.FC<MarcaEstadoProps> = ({ estado, tamano = 'sm', className }) => {
    const reduce = useReducedMotion();
    const md = tamano === 'md';
    // En `md` el trazo espera a que el círculo empiece a aparecer.
    const retardoBase = md ? 0.1 : 0;
    // En `sm` el className va al glifo (color/tamaño); en `md` va al círculo.
    const claseGlifo = md ? 'h-7 w-7 shrink-0' : cn('h-4 w-4 shrink-0', className);

    const glifo = estado === 'cargando' ? (
        <Loader2 aria-hidden className={cn(claseGlifo, 'motion-safe:animate-spin')} />
    ) : (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={claseGlifo}
        >
            {TRAZOS[estado].map(({ d, delay }) => (
                <motion.path
                    key={`${estado}-${d}`}
                    d={d}
                    // opacity 0 hasta que arranca su trazo: con linecap redondo, un
                    // pathLength 0 igual pinta un punto mientras espera su retardo.
                    initial={reduce ? false : { pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{
                        pathLength: { duration: 0.24, ease: EASE_TRAZO, delay: delay + retardoBase },
                        opacity: { duration: 0.01, delay: delay + retardoBase },
                    }}
                />
            ))}
        </svg>
    );

    if (!md) return glifo;

    return (
        <motion.span
            aria-hidden
            className={cn(
                'flex h-12 w-12 items-center justify-center rounded-full',
                estado === 'fallo' ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success',
                className
            )}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: EASE_APPLE }}
        >
            {glifo}
        </motion.span>
    );
};

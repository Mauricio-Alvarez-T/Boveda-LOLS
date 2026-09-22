/**
 * Rail vertical de filtros de la grilla de Trabajadores (2026-09-16).
 *
 * El dueño lo pidió así: "el espacio utilizable es vertical para la visualización de los trabajadores,
 * pero el sistema actual de filtros lo usa de forma horizontal". Antes el panel era un acordeón encima de
 * la grilla dentro de un alto fijo, o sea que abrirlo le quitaba filas a la lista. Ahora es una columna
 * hermana: la lista pierde ancho, nunca alto.
 *
 * Dos modos (el tercero, la hoja de abajo en teléfono, lo sigue manejando Consultas.tsx):
 *  - `inline`  (≥1280px): columna en flujo que empuja la tabla. Sin backdrop, no bloquea la pantalla.
 *  - `overlay` (768-1279): el mismo rail flotando sobre el área del módulo. A ese ancho quitarle 320px a
 *    la tabla la dejaría ilegible, así que se superpone y se cierra al tocar fuera.
 */
import React, { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';

import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const ANCHO = 320;
/**
 * Curva corta en vez de resorte, y SOLO sobre transform/opacity (2026-09-16, tras ver el tirón en
 * staging): animar el `width` del rail obligaba al navegador a recalcular el layout de la tabla en CADA
 * frame, y como la tabla es de ancho automático eso significa volver a medir todas las celdas de las 40+
 * filas. Ahora el rail ocupa su ancho de una vez —la grilla se reajusta en un solo reflow— y lo único
 * que se anima es el desplazamiento, que no toca el layout.
 */
const CURVA = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };
const CURVA_SALIDA = { duration: 0.16, ease: [0.4, 0, 1, 1] as [number, number, number, number] };

interface Props {
    modo: 'inline' | 'overlay';
    /** id del panel: el botón que lo abre lo referencia con `aria-controls`. */
    id: string;
    /** Filtros puestos, incluidos los que no viven en el panel (búsqueda y atajos). */
    activeFilterCount: number;
    onLimpiar: () => void;
    onCerrar: () => void;
    children: React.ReactNode;
}

export const FiltrosRail: React.FC<Props> = ({ modo, id, activeFilterCount, onLimpiar, onCerrar, children }) => {
    // Sin movimiento: el panel aparece y desaparece con un fundido corto (mismo criterio que ui/Modal).
    const reduceMotion = useReducedMotion();
    const entrada = reduceMotion ? { duration: 0.12 } : CURVA;
    const salida = reduceMotion ? { duration: 0.1 } : CURVA_SALIDA;
    // Escape cierra en los dos modos. En `inline` no es un diálogo, pero cerrar con Escape es lo que
    // espera cualquiera que acabe de abrirlo con el teclado.
    useEffect(() => {
        const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
        document.addEventListener('keydown', tecla);
        return () => document.removeEventListener('keydown', tecla);
    }, [onCerrar]);

    const cuerpo = (
        <div
            style={{ width: ANCHO }}
            className="flex h-full shrink-0 flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-md)]"
        >
            <div className="h-14 shrink-0 border-b border-border px-3 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-brand-primary shrink-0" />
                <span className="shrink-0 text-ui font-bold text-brand-dark">Filtros</span>
                {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-micro font-bold text-white">
                        {activeFilterCount}
                    </span>
                )}
                <div className="ml-auto flex shrink-0 items-center gap-1">
                    {activeFilterCount > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onLimpiar}
                            className="h-8 rounded-xl px-2 text-caption font-semibold text-muted-foreground hover:text-brand-dark"
                        >
                            Limpiar
                        </Button>
                    )}
                    <IconButton
                        variant="ghost"
                        size="sm"
                        aria-label="Cerrar filtros"
                        title="Cerrar filtros"
                        onClick={onCerrar}
                        icon={<X className="h-4 w-4" />}
                    />
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 py-2">
                {children}
            </div>
        </div>
    );

    if (modo === 'overlay') {
        return (
            <>
                {/* Sin `backdrop-blur`: desenfocar una tabla entera se repinta en cada frame y era parte
                    del tirón. Oscurecer basta para separar el panel del fondo. */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={entrada}
                    onClick={onCerrar}
                    className="absolute inset-0 z-20 rounded-3xl bg-black/25"
                />
                <motion.aside
                    id={id}
                    aria-label="Filtros"
                    initial={reduceMotion ? { opacity: 0 } : { x: -ANCHO * 0.35, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={reduceMotion ? { opacity: 0, transition: salida } : { x: -ANCHO * 0.35, opacity: 0, transition: salida }}
                    transition={entrada}
                    className="absolute inset-y-0 left-0 z-30 flex"
                >
                    {cuerpo}
                </motion.aside>
            </>
        );
    }

    return (
        // El aside toma sus 320px de una vez: la grilla se angosta en UN solo reflow, no en sesenta por
        // segundo. Lo que se anima es el desplazamiento del panel hacia su sitio, que es puro transform.
        <motion.aside
            id={id}
            aria-label="Filtros"
            style={{ width: ANCHO }}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduceMotion ? { opacity: 0, transition: salida } : { opacity: 0, x: -28, transition: salida }}
            transition={entrada}
            className="relative shrink-0 flex justify-end"
        >
            {cuerpo}
        </motion.aside>
    );
};

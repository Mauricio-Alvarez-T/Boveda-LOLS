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
import { motion } from 'framer-motion';
import { SlidersHorizontal, X } from 'lucide-react';

import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

const ANCHO = 320;
const RESORTE = { type: 'spring' as const, damping: 26, stiffness: 220 };

interface Props {
    modo: 'inline' | 'overlay';
    /** Filtros puestos, incluidos los que no viven en el panel (búsqueda y atajos). */
    activeFilterCount: number;
    onLimpiar: () => void;
    onCerrar: () => void;
    children: React.ReactNode;
}

export const FiltrosRail: React.FC<Props> = ({ modo, activeFilterCount, onLimpiar, onCerrar, children }) => {
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
                <span className="text-ui font-bold text-brand-dark">Filtros</span>
                {activeFilterCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-primary px-1.5 text-micro font-bold text-white">
                        {activeFilterCount}
                    </span>
                )}
                <div className="ml-auto flex items-center gap-1">
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
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onCerrar}
                    className="absolute inset-0 z-20 rounded-3xl bg-black/25 backdrop-blur-[1px]"
                />
                <motion.aside
                    aria-label="Filtros"
                    initial={{ x: -ANCHO, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -ANCHO, opacity: 0 }}
                    transition={RESORTE}
                    className="absolute inset-y-0 left-0 z-30 flex"
                >
                    {cuerpo}
                </motion.aside>
            </>
        );
    }

    return (
        <motion.aside
            aria-label="Filtros"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: ANCHO, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={RESORTE}
            className="relative shrink-0 overflow-hidden flex"
        >
            {cuerpo}
        </motion.aside>
    );
};

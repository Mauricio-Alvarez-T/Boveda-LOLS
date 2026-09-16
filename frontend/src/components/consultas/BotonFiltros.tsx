/**
 * Botón que abre el panel de filtros de la grilla de Trabajadores (2026-09-16).
 *
 * Vive en el extremo IZQUIERDO de la barra de la grilla, que es el borde por el que aparece el panel:
 * antes estaba en el header global, a casi mil píxeles del sitio donde ocurría el efecto. Con el rail
 * abierto en modo `inline` la grilla se corre a la derecha y el botón viaja con ella, así que el propio
 * movimiento cuenta de dónde salió el panel.
 *
 * Tres señales, todas apuntando al mismo lado:
 *  1. **El glifo** dice de dónde viene el panel — `PanelLeftOpen`/`PanelLeftClose` cuando entra por el
 *     costado, `PanelBottomOpen`/`PanelBottomClose` en teléfono, donde la hoja sube desde abajo (y el
 *     chevron enseña de paso el gesto de arrastre que la hoja ya soporta).
 *  2. **El movimiento**: al pasar el mouse el botón se asoma 3px hacia el panel; al pulsarlo, una estela
 *     barre en esa dirección y el `overflow-hidden` de la card la recorta justo en el borde por donde
 *     entra el rail. Acá el recorte juega a favor: la estela se mete por la ranura y el panel toma la
 *     posta. (Por eso NO se usa un morph con `layoutId`: al cerrar, el elemento arrancaría con el tamaño
 *     del panel y esa misma card lo rebanaría durante casi toda la animación.)
 *  3. **El lomo** de 3px en ese borde marca hover, foco y abierto sin rellenar el botón de verde, que es
 *     lo que pide la regla de iconos de `docs/reglas/diseno.md`.
 *
 * ⚠️ La etiqueta, el `aria-label` y el `title` NO pueden contener "trabajador" ni "crear": el spotlight
 * de los tutoriales de Ayuda busca botones por substring (`useTutorialSpotlight.ts:44-49`) y le robaría
 * el pulso al botón que esos flujos resaltan.
 */
import React, { useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PanelLeftOpen, PanelLeftClose, PanelBottomOpen, PanelBottomClose } from 'lucide-react';

import { Button } from '../ui/Button';
import { cn } from '../../utils/cn';

const RESORTE = { type: 'spring' as const, damping: 26, stiffness: 220 };
const ESTELA = { duration: 0.45, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] };

interface Props {
    abierto: boolean;
    onToggle: () => void;
    /** Filtros puestos (incluye búsqueda y atajos): pinta el badge. */
    activos: number;
    /** De dónde entra el panel: al costado (≥768px) o desde abajo (teléfono). */
    modo: 'lateral' | 'hoja';
    /** id del panel que controla, para `aria-controls`. */
    controla: string;
}

export const BotonFiltros: React.FC<Props> = ({ abierto, onToggle, activos, modo, controla }) => {
    const reduce = useReducedMotion();
    const lateral = modo === 'lateral';
    // Cada apertura remonta la estela (el `key` la reinicia). No se dispara al cerrar: ahí el gesto lo
    // hace el panel replegándose hacia el botón.
    const [pulso, setPulso] = useState(0);

    const Icono = lateral
        ? (abierto ? PanelLeftClose : PanelLeftOpen)
        : (abierto ? PanelBottomClose : PanelBottomOpen);
    const haciaElPanel = lateral ? { x: -3 } : { y: 3 };

    return (
        <Button
            variant="ghost"
            size="sm"
            // El rótulo se oculta bajo `sm:` y sale del árbol de accesibilidad: el nombre va fijo acá.
            aria-label="Filtros"
            aria-expanded={abierto}
            aria-controls={controla}
            title={abierto ? 'Cerrar filtros' : lateral ? 'Abrir filtros (panel lateral)' : 'Abrir filtros'}
            onClick={() => {
                if (lateral && !abierto && !reduce) setPulso(p => p + 1);
                onToggle();
            }}
            variants={{ reposo: { x: 0, y: 0 }, apunta: reduce ? {} : haciaElPanel }}
            initial="reposo"
            animate="reposo"
            whileHover="apunta"
            whileTap={reduce ? undefined : { scale: 0.97, ...haciaElPanel }}
            transition={RESORTE}
            className={cn(
                'group relative isolate h-9 shrink-0 gap-2 rounded-xl border px-3 font-semibold shadow-sm',
                abierto
                    ? 'border-brand-primary text-brand-primary'
                    : 'border-border text-brand-dark hover:bg-brand-primary/5',
            )}
        >
            {/* Estela: barre hacia el panel y se corta en el borde de la card. Solo al abrir. */}
            {lateral && pulso > 0 && (
                <motion.span
                    key={pulso}
                    aria-hidden
                    initial={{ scaleX: 1, opacity: 0.4 }}
                    animate={{ scaleX: 7, opacity: 0 }}
                    transition={ESTELA}
                    style={{ originX: 1 }}
                    className="pointer-events-none absolute inset-0 -z-10 rounded-xl bg-brand-primary/25"
                />
            )}

            {/* Lomo: 3px del lado por donde sale el panel. Marca hover, foco y abierto sin rellenar. */}
            <span
                aria-hidden
                data-abierto={abierto}
                className={cn(
                    'pointer-events-none absolute rounded-full bg-brand-primary opacity-0',
                    'transition-[transform,opacity] duration-200 ease-apple motion-reduce:transition-none',
                    'group-hover:opacity-100 group-focus-visible:opacity-100 data-[abierto=true]:opacity-100',
                    lateral
                        ? 'inset-y-1.5 left-0 w-[3px] scale-y-0 group-hover:scale-y-100 group-focus-visible:scale-y-100 data-[abierto=true]:scale-y-100'
                        : 'inset-x-2 bottom-0 h-[3px] scale-x-0 group-hover:scale-x-100 group-focus-visible:scale-x-100 data-[abierto=true]:scale-x-100',
                )}
            />

            {/* El icono viejo SALE hacia el panel y el nuevo ENTRA del lado opuesto. */}
            <AnimatePresence mode="wait" initial={false}>
                <motion.span
                    key={`${lateral}-${abierto}`}
                    className="flex shrink-0"
                    initial={reduce ? { opacity: 0 } : { opacity: 0, ...(lateral ? { x: 7 } : { y: -7 }) }}
                    animate={{ opacity: 1, x: 0, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, ...(lateral ? { x: -7 } : { y: 7 }) }}
                    transition={{ duration: 0.16, ease: 'easeOut' }}
                >
                    <Icono className={cn(
                        'h-4 w-4 transition-colors',
                        abierto ? 'text-brand-primary' : 'text-muted-foreground group-hover:text-brand-primary',
                    )} />
                </motion.span>
            </AnimatePresence>

            {/* `data-rotulo`: la grilla lo esconde mientras hay selección, para que el botón no estorbe. */}
            <span data-rotulo className="hidden sm:inline">Filtros</span>

            <AnimatePresence initial={false}>
                {activos > 0 && (
                    <motion.span
                        key="badge"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 18, stiffness: 320 }}
                        className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-primary px-1 text-micro font-bold text-white tabular-nums"
                    >
                        {activos}
                    </motion.span>
                )}
            </AnimatePresence>
        </Button>
    );
};

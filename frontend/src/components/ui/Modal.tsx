import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';
import { getPointerOrigin } from '../../utils/pointerOrigin';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'dynamic';
    /**
     * Si `true`, elimina el padding interior del body y desactiva el overflow
     * automático — el contenido manda su propio scroll. Útil para modales con
     * layouts complejos (sidebar+main) que necesitan ocupar el ancho completo.
     */
    noBodyPadding?: boolean;
    /**
     * Acción opcional renderizada en la cabecera, justo a la izquierda del botón
     * de cerrar (ej. un botón de "Confirmar"). El consumidor controla su propia
     * visibilidad responsive si quiere mostrarlo solo en desktop/móvil.
     */
    headerAction?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'md',
    noBodyPadding = false,
    headerAction
}) => {
    // ⚠️ Render condicional móvil/desktop (NO ambos a la vez).
    // Antes se renderizaban los dos bloques y se ocultaba uno con `md:hidden` /
    // `hidden md:flex`. Eso montaba {children} y {headerAction} DOS veces en el
    // DOM. Si el contenido tenía un `id` (ej. <form id="worker-form">) quedaban
    // ids DUPLICADOS, y un botón con `form="worker-form"` apuntaba al PRIMER form
    // (el oculto, con valores sin editar) → los cambios "no se guardaban".
    // Renderizar un solo layout según el ancho elimina el id duplicado.
    const [isDesktop, setIsDesktop] = useState(
        () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
    );
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mq = window.matchMedia('(min-width: 768px)');
        const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
        mq.addEventListener('change', handler);
        setIsDesktop(mq.matches);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Desktop-only max-widths
    const desktopSizes: Record<string, string> = {
        sm: 'md:max-w-md',
        md: 'md:max-w-xl',
        lg: 'md:max-w-3xl',
        xl: 'md:max-w-5xl',
        '2xl': 'md:max-w-7xl',
        full: 'md:max-w-[95vw] md:h-[90dvh]',
        dynamic: 'md:max-w-4xl',
    };

    const handleClose = () => {
        // Anti-fugas de datos: Chequear si el formulario interno está sucio
        const isDirty = document.body.getAttribute('data-modal-dirty') === 'true';
        if (isDirty) {
            if (!window.confirm('Tienes cambios sin guardar. ¿Estás seguro de que deseas salir y perderlos?')) {
                return;
            }
        }
        onClose();
    };

    // Cierre con tecla Escape (accesibilidad). Reusa handleClose para respetar
    // el confirm de cambios sin guardar.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // ── Animación origin-aware (desktop): la card "emana" desde el punto donde
    // se hizo clic para abrir y aterriza centrada. El origen se captura UNA vez
    // al abrir (primer render con isOpen=true) y se reusa en enter + exit, para
    // que al cerrar encoja de vuelta hacia ese punto. Solo transform + opacity.
    const reduceMotion = useReducedMotion();
    const originRef = useRef<{ x: number; y: number } | null>(null);
    const prevOpenRef = useRef(false);
    if (isOpen && !prevOpenRef.current) originRef.current = getPointerOrigin();
    prevOpenRef.current = isOpen;

    const origin = originRef.current;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 0;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 0;
    // reduced-motion → solo fade. Sin origen (apertura programática) → fallback
    // centrado clásico. Con origen → translate+scale desde el punto del clic.
    const cardInitial = reduceMotion
        ? { opacity: 0 }
        : origin
            ? { opacity: 0, scale: 0.35, x: origin.x - vw / 2, y: origin.y - vh / 2 }
            : { opacity: 0, scale: 0.95, y: 20 };
    const cardAnimate = reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, x: 0, y: 0 };
    const cardTransition = reduceMotion
        ? { duration: 0.15 }
        : { duration: 0.32, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] };

    return createPortal(
        <AnimatePresence>
            {isOpen && (isDesktop ? (
                /* ─── DESKTOP: Classic centered card modal ─── */
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                    />
                    {/* Card */}
                    <motion.div
                        initial={cardInitial}
                        animate={cardAnimate}
                        exit={cardInitial}
                        transition={cardTransition}
                        style={{ transformOrigin: 'center' }}
                        className={cn(
                            "relative bg-card rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] w-full",
                            desktopSizes[size]
                        )}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-border gap-3">
                            <h3 className="text-lg font-semibold text-brand-dark truncate pr-2">{title}</h3>
                            <div className="flex items-center gap-3 shrink-0">
                                {headerAction}
                                <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full h-8 w-8 text-muted-foreground hover:text-brand-dark shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        {/* Body */}
                        <div className={cn(
                            "flex-1 relative min-h-0",
                            noBodyPadding ? "overflow-hidden" : "p-6 overflow-y-auto custom-scrollbar"
                        )}>
                            {children}
                        </div>
                        {/* Footer */}
                        {footer && (
                            <div className="px-6 py-4 border-t border-border bg-background flex justify-end gap-3">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            ) : (
                /* ─── MOBILE: Bottom Sheet ─── */
                <div className="fixed inset-0 z-[1000] flex items-end">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={handleClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                    />

                    {/* Sheet Container */}
                    <motion.div
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.1}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 150 || info.velocity.y > 500) {
                                handleClose();
                            }
                        }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className={cn(
                            "relative w-full bg-card rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden",
                            // size="full" (layouts con scroll interno: h-full + overflow-y-auto, ej. paneles de
                            // permisos) necesita ALTURA DEFINIDA para que el scroll interno resuelva en móvil.
                            // El resto se dimensiona por contenido (hasta el tope).
                            size === 'full' ? 'h-[92dvh]' : 'max-h-[92dvh]'
                        )}
                    >
                        {/* Handle & Header */}
                        <div className="shrink-0">
                            <div className="pt-3 pb-2 flex justify-center" onClick={handleClose}>
                                <div className="w-12 h-1.5 rounded-full bg-muted" />
                            </div>
                            <div className="flex items-center justify-between px-5 pb-4 pt-1">
                                <h3 className="text-lg font-bold text-brand-dark truncate pr-10">{title}</h3>
                                <div className="flex items-center gap-2 shrink-0">
                                    {headerAction}
                                    {/* eslint-disable-next-line no-restricted-syntax -- interno de primitiva: cierre sheet móvil */}
                                    <button
                                        onClick={handleClose}
                                        className="p-2 rounded-full bg-background text-muted-foreground active:scale-95 transition-all"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Body */}
                        <div className={cn(
                            "flex-1 relative min-h-0",
                            noBodyPadding ? "overflow-hidden" : "overflow-y-auto px-5 py-2 custom-scrollbar"
                        )}>
                            {children}
                        </div>

                        {/* Footer */}
                        {footer && (
                            <div className="px-5 py-4 border-t border-border bg-background flex justify-end gap-3 shrink-0 safe-area-bottom">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            ))}
        </AnimatePresence>,
        document.body
    );
};

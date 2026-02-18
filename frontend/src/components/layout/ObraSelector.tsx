import React, { useState, useRef, useEffect } from 'react';
import { HardHat, ChevronDown, Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useObra } from '../../context/ObraContext';

export const ObraSelector: React.FC = () => {
    const { obras, selectedObra, setSelectedObra, isLoading } = useObra();
    const [isOpen, setIsOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Cargando obras...</span>
            </div>
        );
    }

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2.5 px-3.5 py-2 rounded-xl border transition-all text-sm font-medium max-w-[240px] w-full",
                    isOpen
                        ? "bg-violet-500/10 border-violet-500/30 text-white"
                        : "bg-white/10 border-white/20 text-muted-foreground hover:text-white hover:border-white/30"
                )}
            >
                <HardHat className="h-4 w-4 shrink-0 text-brand-primary" />
                <span className="truncate flex-1 text-left">
                    {selectedObra?.nombre || 'Seleccionar Obra'}
                </span>
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 transition-transform", isOpen && "rotate-180")} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-1.5 left-0 w-full min-w-[220px] z-50 glass-morphism-dense rounded-xl border border-white/10 shadow-2xl shadow-black/40 overflow-hidden"
                    >
                        <div className="p-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                            {/* "All Obras" option */}
                            <button
                                onClick={() => { setSelectedObra(null); setIsOpen(false); }}
                                className={cn(
                                    "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors",
                                    !selectedObra
                                        ? "bg-violet-500/15 text-white font-semibold"
                                        : "text-muted-foreground hover:bg-white/5 hover:text-white"
                                )}
                            >
                                <HardHat className="h-3.5 w-3.5" />
                                <span className="flex-1 text-left">Todas las Obras</span>
                                {!selectedObra && <Check className="h-3.5 w-3.5 text-brand-primary" />}
                            </button>

                            {obras.length > 0 && (
                                <div className="h-px bg-white/10 my-1" />
                            )}

                            {obras.map(obra => (
                                <button
                                    key={obra.id}
                                    onClick={() => { setSelectedObra(obra); setIsOpen(false); }}
                                    className={cn(
                                        "flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs transition-colors",
                                        selectedObra?.id === obra.id
                                            ? "bg-violet-500/15 text-white font-semibold"
                                            : "text-muted-foreground hover:bg-white/5 hover:text-white"
                                    )}
                                >
                                    <div className="h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                                    <span className="flex-1 text-left truncate">{obra.nombre}</span>
                                    {selectedObra?.id === obra.id && <Check className="h-3.5 w-3.5 text-brand-primary" />}
                                </button>
                            ))}

                            {obras.length === 0 && (
                                <p className="text-[10px] text-muted-foreground text-center py-3">
                                    No hay obras registradas
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

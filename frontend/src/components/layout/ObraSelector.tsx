import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardHat, ChevronUp, Home, Check, Map } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useObra } from '../../context/ObraContext';

export const ObraSelector: React.FC = () => {
    const { obras, selectedObra, setSelectedObra, isLoading } = useObra();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent | TouchEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        document.addEventListener('touchstart', handler);
        return () => {
            document.removeEventListener('mousedown', handler);
            document.removeEventListener('touchstart', handler);
        };
    }, []);

    if (isLoading) {
        return (
            <div className="h-9 w-[200px] rounded-full bg-background animate-pulse" />
        );
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Mobile: Native Select with Map icon overlay */}
            <div className="md:hidden relative">
                <select
                    className="absolute inset-0 opacity-0 z-10 w-full h-full cursor-pointer"
                    value={selectedObra?.id || ''}
                    onChange={(e) => {
                        const id = e.target.value;
                        if (id === '') {
                            setSelectedObra(null);
                        } else {
                            const obra = obras.find(o => o.id === Number(id));
                            if (obra) setSelectedObra(obra);
                        }
                    }}
                >
                    <option value="">Todas las Obras</option>
                    {obras.map(o => (
                        <option key={o.id} value={o.id}>{o.nombre}</option>
                    ))}
                </select>
                <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-full text-[13px] font-medium text-brand-dark shadow-sm shrink min-w-[70px] max-w-[130px]">
                    <Map className="h-4 w-4 shrink-0 text-brand-primary" />
                    <span className="truncate flex-1 text-left">{selectedObra?.nombre || 'Obra'}</span>
                </div>
            </div>

            {/* Desktop: full styled button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "hidden md:flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium w-fit min-w-[140px] max-w-[220px]",
                    isOpen
                        ? "bg-brand-primary/5 border-brand-primary/30 text-brand-primary"
                        : "bg-white border-border text-brand-dark hover:border-[#B0B0B5] shadow-sm"
                )}
            >
                <HardHat className="h-4 w-4 shrink-0 text-brand-primary" />
                <span className="truncate flex-1 text-left text-sm">
                    {selectedObra?.nombre || 'Todas las Obras'}
                </span>
                <ChevronUp className={cn(
                    "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                    isOpen ? "rotate-0" : "rotate-180"
                )} />
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -4, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full mt-2 right-0 w-[240px] z-[110] bg-white rounded-xl border border-border shadow-lg overflow-hidden"
                    >
                        <div className="p-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                            {/* "All Obras" option */}
                            <button
                                onClick={() => { setSelectedObra(null); setIsOpen(false); }}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                                    !selectedObra
                                        ? "bg-brand-primary/8 text-brand-primary font-medium"
                                        : "text-brand-dark hover:bg-background"
                                )}
                            >
                                <Home className="h-4 w-4 shrink-0" />
                                <span className="truncate">Todas las Obras</span>
                                {!selectedObra && <Check className="h-3.5 w-3.5 ml-auto text-brand-primary" />}
                            </button>

                            {/* Obra options */}
                            {obras.map(obra => (
                                <button
                                    key={obra.id}
                                    onClick={() => { setSelectedObra(obra); setIsOpen(false); }}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                                        selectedObra?.id === obra.id
                                            ? "bg-brand-primary/8 text-brand-primary font-medium"
                                            : "text-brand-dark hover:bg-background"
                                    )}
                                >
                                    <div className={cn(
                                        "h-2 w-2 rounded-full shrink-0",
                                        selectedObra?.id === obra.id ? "bg-brand-primary" : "bg-brand-accent"
                                    )} />
                                    <span className="truncate">{obra.nombre}</span>
                                    {selectedObra?.id === obra.id && <Check className="h-3.5 w-3.5 ml-auto text-brand-primary" />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

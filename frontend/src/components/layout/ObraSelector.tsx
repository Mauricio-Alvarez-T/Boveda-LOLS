import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HardHat, ChevronUp, Home, Check } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useObra } from '../../context/ObraContext';

export const ObraSelector: React.FC = () => {
    const { obras, selectedObra, setSelectedObra, isLoading } = useObra();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    if (isLoading) {
        return (
            <div className="h-9 w-[200px] rounded-full bg-[#F5F5F7] animate-pulse" />
        );
    }

    return (
        <div ref={containerRef} className="relative">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm font-medium w-fit min-w-[140px] max-w-[220px]",
                    isOpen
                        ? "bg-[#0071E3]/5 border-[#0071E3]/30 text-[#0071E3]"
                        : "bg-white border-[#D2D2D7] text-[#1D1D1F] hover:border-[#B0B0B5] shadow-sm"
                )}
            >
                <HardHat className="h-4 w-4 shrink-0 text-[#0071E3]" />
                <span className="truncate flex-1 text-left text-sm">
                    {selectedObra?.nombre || 'Todas las Obras'}
                </span>
                <ChevronUp className={cn(
                    "h-3.5 w-3.5 shrink-0 text-[#6E6E73] transition-transform",
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
                        className="absolute top-full mt-2 right-0 w-[240px] z-50 bg-white rounded-xl border border-[#D2D2D7] shadow-lg overflow-hidden"
                    >
                        <div className="p-1.5 max-h-[260px] overflow-y-auto custom-scrollbar">
                            {/* "All Obras" option */}
                            <button
                                onClick={() => { setSelectedObra(null); setIsOpen(false); }}
                                className={cn(
                                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                                    !selectedObra
                                        ? "bg-[#0071E3]/8 text-[#0071E3] font-medium"
                                        : "text-[#1D1D1F] hover:bg-[#F5F5F7]"
                                )}
                            >
                                <Home className="h-4 w-4 shrink-0" />
                                <span className="truncate">Todas las Obras</span>
                                {!selectedObra && <Check className="h-3.5 w-3.5 ml-auto text-[#0071E3]" />}
                            </button>

                            {/* Obra options */}
                            {obras.map(obra => (
                                <button
                                    key={obra.id}
                                    onClick={() => { setSelectedObra(obra); setIsOpen(false); }}
                                    className={cn(
                                        "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                                        selectedObra?.id === obra.id
                                            ? "bg-[#0071E3]/8 text-[#0071E3] font-medium"
                                            : "text-[#1D1D1F] hover:bg-[#F5F5F7]"
                                    )}
                                >
                                    <div className={cn(
                                        "h-2 w-2 rounded-full shrink-0",
                                        selectedObra?.id === obra.id ? "bg-[#0071E3]" : "bg-[#34C759]"
                                    )} />
                                    <span className="truncate">{obra.nombre}</span>
                                    {selectedObra?.id === obra.id && <Check className="h-3.5 w-3.5 ml-auto text-[#0071E3]" />}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

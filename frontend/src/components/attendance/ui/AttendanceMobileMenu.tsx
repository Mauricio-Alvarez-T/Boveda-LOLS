import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Send, Save, MoreHorizontal, FileDown, CalendarRange, X, Search, Building2, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../../ui/Button';
import RequirePermission from '../../auth/RequirePermission';
import { cn } from '../../../utils/cn';

interface AttendanceMobileMenuProps {
    show: boolean;
    onClose: () => void;
    onExportExcel: () => void;
    onToggleFeriado: () => void;
    hasPermission: (p: string) => boolean;
    isFeriado: boolean;
}

export const AttendanceMobileMenu: React.FC<AttendanceMobileMenuProps> = ({
    show,
    onClose,
    onExportExcel,
    onToggleFeriado,
    hasPermission,
    isFeriado
}) => {
    if (typeof document === 'undefined') return null;

    return createPortal(
        <AnimatePresence>
            {show && (
                <motion.div
                    key="mobile-menu-overlay"
                    className="md:hidden fixed inset-0 z-[9999] flex items-end"
                    style={{ height: '100dvh' }}
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, pointerEvents: 'none' as const }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                    />

                    <motion.div
                        drag="y"
                        dragConstraints={{ top: 0 }}
                        dragElastic={0.05}
                        onDragEnd={(_, info) => {
                            if (info.offset.y > 200 || info.velocity.y > 600) onClose();
                        }}
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                        className="relative w-full bg-white rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden"
                    >
                        <div className="pt-3 pb-2 flex justify-center shrink-0 cursor-grab active:cursor-grabbing">
                            <div className="w-10 h-1 rounded-full bg-[#D1D1D6]" />
                        </div>

                        <div className="flex items-center justify-between px-5 pb-4 pt-1 shrink-0">
                            <h3 className="text-lg font-bold text-brand-dark">Opciones de Asistencia</h3>
                            <button 
                                onClick={onClose}
                                className="p-2 rounded-full bg-background text-muted-foreground active:scale-95 transition-all"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="px-4 pb-10 custom-scrollbar">
                            <div className="flex flex-col gap-1">
                                <button
                                    onClick={() => { onExportExcel(); onClose(); }}
                                    disabled={!hasPermission('asistencia.exportar_excel')}
                                    className={cn(
                                        "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all active:scale-95 text-left",
                                        hasPermission('asistencia.exportar_excel') ? "hover:bg-slate-50 text-slate-700" : "opacity-40 grayscale pointer-events-none"
                                    )}
                                >
                                    <div className="h-10 w-10 rounded-xl bg-orange-50 flex items-center justify-center text-orange-600 shrink-0">
                                        <FileDown className="h-5 w-5" />
                                    </div>
                                    <span className="text-sm font-bold uppercase tracking-tight">Exportar Excel</span>
                                </button>

                                <RequirePermission permiso="asistencia.feriado.gestionar">
                                    <button
                                        onClick={() => { onToggleFeriado(); onClose(); }}
                                        className={cn(
                                            "w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all active:scale-95 text-left",
                                            isFeriado ? "bg-destructive/5 text-destructive" : "hover:bg-slate-50 text-slate-700"
                                        )}
                                    >
                                        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", isFeriado ? "bg-destructive/10" : "bg-purple-50 text-purple-600")}>
                                            <CalendarRange className="h-5 w-5" />
                                        </div>
                                        <span className="text-sm font-bold uppercase tracking-tight">{isFeriado ? 'Quitar Feriado' : 'Marcar Feriado'}</span>
                                    </button>
                                </RequirePermission>
                            </div>

                            <div className="mt-6 pt-4 border-t border-[#F0F0F5] text-center pb-4">
                                <p className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">
                                    Bóveda LOLS v2.5 • Premium UX
                                </p>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
};

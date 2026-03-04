import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    footer?: React.ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full' | 'dynamic';
}

export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    children,
    footer,
    size = 'md'
}) => {
    // Desktop-only max-widths
    const desktopSizes: Record<string, string> = {
        sm: 'md:max-w-md',
        md: 'md:max-w-xl',
        lg: 'md:max-w-3xl',
        xl: 'md:max-w-5xl',
        '2xl': 'md:max-w-7xl',
        full: 'md:max-w-[95vw]',
        dynamic: 'md:max-w-4xl',
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* ─── MOBILE: Fullscreen page overlay ─── */}
                    <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white">
                        <motion.div
                            initial={{ opacity: 0, x: 60 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 60 }}
                            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                            className="flex flex-col h-full"
                        >
                            {/* Mobile header — iOS-style navigation bar */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E8ED] bg-white/80 backdrop-blur-xl shrink-0 safe-area-top">
                                <button
                                    onClick={onClose}
                                    className="flex items-center gap-1 text-[#0071E3] text-sm font-medium active:opacity-60 transition-opacity"
                                >
                                    <ChevronLeft className="h-5 w-5" />
                                    <span>Volver</span>
                                </button>
                                <h3 className="flex-1 text-center text-base font-semibold text-[#1D1D1F] truncate pr-12">{title}</h3>
                            </div>

                            {/* Mobile body */}
                            <div className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar">
                                {children}
                            </div>

                            {/* Mobile footer */}
                            {footer && (
                                <div className="px-4 py-3 border-t border-[#E8E8ED] bg-[#F5F5F7] flex justify-end gap-3 shrink-0 safe-area-bottom">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* ─── DESKTOP: Classic centered card modal ─── */}
                    <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                        />
                        {/* Card */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className={cn(
                                "relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] w-full",
                                desktopSizes[size]
                            )}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-[#D2D2D7]">
                                <h3 className="text-lg font-semibold text-[#1D1D1F] truncate pr-8">{title}</h3>
                                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 text-[#6E6E73] hover:text-[#1D1D1F] shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            {/* Body */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                                {children}
                            </div>
                            {/* Footer */}
                            {footer && (
                                <div className="px-6 py-4 border-t border-[#D2D2D7] bg-[#F5F5F7] flex justify-end gap-3">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    );
};

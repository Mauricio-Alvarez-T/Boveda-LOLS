import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
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
    // Desktop-only max-widths — on mobile the modal is always full-width
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
                <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center md:p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />

                    {/* Modal Content — mobile: bottom sheet, desktop: centered card */}
                    <motion.div
                        initial={{ opacity: 0, y: 60 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 60 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                        className={cn(
                            "relative bg-white w-full flex flex-col",
                            "rounded-t-3xl md:rounded-2xl",
                            "max-h-[92svh] md:max-h-[90vh]",
                            "md:shadow-2xl md:w-full",
                            desktopSizes[size]
                        )}
                    >
                        {/* Mobile drag handle indicator */}
                        <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
                            <div className="h-1 w-10 rounded-full bg-[#D2D2D7]" />
                        </div>

                        {/* Header */}
                        <div className="flex items-center justify-between px-5 md:px-6 py-3 md:py-5 border-b border-[#D2D2D7] shrink-0">
                            <h3 className="text-base md:text-lg font-semibold text-[#1D1D1F] truncate pr-8">{title}</h3>
                            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8 text-[#6E6E73] hover:text-[#1D1D1F] shrink-0">
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Body */}
                        <div className="px-5 md:px-6 py-4 md:py-6 overflow-y-auto flex-1 custom-scrollbar">
                            {children}
                        </div>

                        {/* Footer */}
                        {footer && (
                            <div className="px-5 md:px-6 py-3 md:py-4 border-t border-[#D2D2D7] bg-[#F5F5F7] flex justify-end gap-3 shrink-0">
                                {footer}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

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
    const sizes = {
        sm: 'w-full max-w-md',
        md: 'w-full max-w-xl',
        lg: 'w-full max-w-3xl',
        xl: 'w-full max-w-5xl',
        '2xl': 'w-full max-w-7xl',
        full: 'w-full max-w-[95vw]',
        dynamic: 'w-auto max-w-[95vw] min-w-[600px]', // Dynamic width based on content
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className={cn(
                            "relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]",
                            sizes[size]
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
                        <div className="p-6 overflow-y-auto custom-scrollbar">
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
            )}
        </AnimatePresence>
    );
};

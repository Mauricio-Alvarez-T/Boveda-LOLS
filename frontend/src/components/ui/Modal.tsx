import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Button } from './Button';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
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

    return createPortal(
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* ─── MOBILE: Bottom Sheet ─── */}
                    <div className="md:hidden fixed inset-0 z-[1000] flex items-end">
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
                            className="relative w-full max-h-[92vh] bg-white rounded-t-[32px] shadow-2xl flex flex-col overflow-hidden"
                        >
                            {/* Handle & Header */}
                            <div className="shrink-0">
                                <div className="pt-3 pb-2 flex justify-center" onClick={handleClose}>
                                    <div className="w-12 h-1.5 rounded-full bg-[#E8E8ED]" />
                                </div>
                                <div className="flex items-center justify-between px-5 pb-4 pt-1">
                                    <h3 className="text-lg font-bold text-brand-dark truncate pr-10">{title}</h3>
                                    <button 
                                        onClick={handleClose}
                                        className="p-2 rounded-full bg-background text-muted-foreground active:scale-95 transition-all"
                                    >
                                        <X className="h-5 w-5" />
                                    </button>
                                </div>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-5 py-2 custom-scrollbar relative min-h-0">
                                {children}
                            </div>

                            {/* Footer */}
                            {footer && (
                                <div className="px-5 py-4 border-t border-[#E8E8ED] bg-background flex justify-end gap-3 shrink-0 safe-area-bottom">
                                    {footer}
                                </div>
                            )}
                        </motion.div>
                    </div>

                    {/* ─── DESKTOP: Classic centered card modal ─── */}
                    <div className="hidden md:flex fixed inset-0 z-[1000] items-center justify-center p-4">
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
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className={cn(
                                "relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] w-full",
                                desktopSizes[size]
                            )}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-5 border-b border-border">
                                <h3 className="text-lg font-semibold text-brand-dark truncate pr-8">{title}</h3>
                                <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full h-8 w-8 text-muted-foreground hover:text-brand-dark shrink-0">
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                            {/* Body */}
                            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 relative">
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
                </>
            )}
        </AnimatePresence>,
        document.body
    );
};

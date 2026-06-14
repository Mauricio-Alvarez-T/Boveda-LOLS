import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ObraSelector } from './ObraSelector';
import { IconButton } from '../ui/IconButton';
import { Menu, Smartphone } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';
import { useAuth } from '../../context/AuthContext';

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { title, actions } = usePageHeader();
    const { user } = useAuth();
    const location = useLocation();

    return (
        <div className="flex min-h-[100dvh] bg-background">
            {/* Mobile Orientation Lock Overlay — superficie oscura constante (independiente del tema) */}
            <div className="fixed inset-0 z-[9999] bg-neutral-900 flex-col items-center justify-center p-8 text-center overflow-hidden hidden max-md:landscape:flex">
                <motion.div
                    initial={{ rotate: 0 }}
                    animate={{ rotate: 90 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    className="h-24 w-24 rounded-[2rem] bg-brand-primary/10 flex items-center justify-center mb-8 border border-brand-primary/20 backdrop-blur-sm"
                >
                    <Smartphone className="h-12 w-12 text-brand-primary" />
                </motion.div>
                <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-3">
                    Gira tu dispositivo
                </h2>
                <p className="text-white/70 text-sm font-medium leading-relaxed max-w-[260px]">
                    Bóveda LOLS está diseñada para una experiencia vertical óptima. Por favor, vuelve a la orientación vertical.
                </p>
                <div className="mt-12 flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
                    <div className="h-1.5 w-1.5 rounded-full bg-brand-primary animate-pulse" />
                    <span className="text-caption font-bold text-white/50 uppercase tracking-widest">Esperando rotación...</span>
                </div>
            </div>

            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0 h-[100dvh]">
                {/* Top Navbar — fixed above scroll area */}
                <header className="shrink-0 h-14 md:h-16 border-b border-border bg-card/80 backdrop-blur-xl flex items-center justify-between px-3 md:px-8 z-50 shadow-sm relative gap-2">
                    {/* Mobile Hamburger */}
                    <IconButton
                        variant="ghost"
                        aria-label="Abrir menú"
                        onClick={() => setMobileOpen(true)}
                        icon={<Menu className="h-5 w-5" />}
                        className="md:hidden shrink-0"
                    />

                    {/* Page Title — hidden on mobile */}
                    <div className="hidden md:flex flex-1 min-w-0 items-center">
                        {title}
                    </div>
                    {/* Spacer on mobile to push actions right */}
                    <div className="flex-1 md:hidden" />

                    <div className="flex items-center justify-end gap-1.5 md:gap-3 min-w-0">
                        {/* Page Actions Injected */}
                        {actions && (
                            <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2 shrink-0">
                                {actions}
                            </div>
                        )}

                        {/* Usuario (nombre en el header) */}
                        {user && (
                            <div className="hidden md:flex items-center gap-2 min-w-0">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground">
                                    {user.nombre?.charAt(0)?.toUpperCase() ?? 'U'}
                                </span>
                                <span className="text-sm font-medium text-foreground truncate max-w-[180px]">{user.nombre}</span>
                            </div>
                        )}

                        <div className="hidden md:block h-6 w-px bg-border mx-1" />
                        <ObraSelector />
                    </div>
                </header>

                {/* Page Content — actual scroll container */}
                <div className="flex-1 min-h-0 p-2 md:px-5 md:pt-2 pb-12 overflow-y-auto overflow-x-hidden relative flex flex-col">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-transparent flex-1 flex flex-col min-h-0"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

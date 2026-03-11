import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ObraSelector } from './ObraSelector';
import { NotificationBell } from './NotificationBell';
import { Menu } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const { title, actions } = usePageHeader();
    const location = useLocation();

    return (
        <div className="flex min-h-screen bg-[#F5F5F7]">
            {/* Sidebar */}
            <Sidebar
                isCollapsed={isCollapsed}
                setIsCollapsed={setIsCollapsed}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
            />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Navbar */}
                <header className="h-14 md:h-16 border-b border-[#D2D2D7] bg-white/80 backdrop-blur-xl flex items-center justify-between px-3 md:px-8 sticky top-0 z-30 shadow-sm relative gap-2">
                    {/* Mobile Hamburger */}
                    <button
                        onClick={() => setMobileOpen(true)}
                        className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl hover:bg-[#F5F5F7] text-[#6E6E73] shrink-0"
                    >
                        <Menu className="h-5 w-5" />
                    </button>

                    {/* Page Title — hidden on mobile */}
                    <div className="hidden md:flex flex-1 min-w-0 items-center">
                        {title}
                    </div>
                    {/* Spacer on mobile to push actions right */}
                    <div className="flex-1 md:hidden" />

                    <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
                        {/* Page Actions Injected */}
                        {actions && (
                            <div className="flex items-center gap-1 md:gap-2 mr-1 md:mr-2">
                                {actions}
                            </div>
                        )}

                        {/* Notifications Bell */}
                        <div className="hidden md:block">
                            <NotificationBell />
                        </div>

                        <div className="hidden md:block h-6 w-px bg-[#D2D2D7] mx-1" />
                        <ObraSelector />
                    </div>
                </header>

                {/* Page Content */}
                <div className="flex-1 p-3 md:p-5 pb-12 overflow-x-hidden relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.2 } }}
                            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                            className="bg-transparent"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

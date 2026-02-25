import React, { useState, useRef, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { ObraSelector } from './ObraSelector';
import { Bell, Menu } from 'lucide-react';
import { usePageHeader } from '../../context/PageHeaderContext';

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const { title, actions, notifications } = usePageHeader();
    const location = useLocation();
    const notifRef = useRef<HTMLDivElement>(null);

    // Close notifications popover on click outside or route change
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        setShowNotifications(false);
    }, [location.pathname]);

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

                        {/* Notifications Bell — hidden on mobile */}
                        <div className="hidden md:block relative" ref={notifRef}>
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[#F5F5F7] text-[#6E6E73] relative transition-colors focus:outline-none"
                            >
                                <Bell className="h-5 w-5" />
                                {notifications && notifications.count > 0 && (
                                    <div className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#FF3B30] rounded-full border-2 border-white" />
                                )}
                            </button>

                            {/* Notifications Popover */}
                            <AnimatePresence>
                                {showNotifications && notifications && notifications.content && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        transition={{ duration: 0.15 }}
                                        className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-[#D2D2D7] overflow-hidden z-50 origin-top-right"
                                    >
                                        <div className="p-4 border-b border-[#D2D2D7] flex items-center justify-between">
                                            <h3 className="font-semibold text-[#1D1D1F] text-sm">Notificaciones</h3>
                                            {notifications.count > 0 && (
                                                <span className="text-[10px] bg-[#FF3B30] text-white px-2 py-0.5 rounded-full font-bold">
                                                    {notifications.count} nuevas
                                                </span>
                                            )}
                                        </div>
                                        <div className="p-2 max-h-[60vh] overflow-y-auto">
                                            {notifications.content}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
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

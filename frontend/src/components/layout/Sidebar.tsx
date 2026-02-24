import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    FileText,
    CheckSquare,
    ShieldCheck,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Settings,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (v: boolean) => void;
    mobileOpen: boolean;
    setMobileOpen: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed, mobileOpen, setMobileOpen }) => {
    const { user, logout, checkPermission } = useAuth();
    const location = useLocation();

    // Auto-close mobile drawer on route change
    React.useEffect(() => {
        setMobileOpen(false);
    }, [location.pathname]);

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/', visible: true },
        {
            icon: Users,
            label: 'Trabajadores',
            path: '/trabajadores',
            visible: checkPermission('trabajadores', 'puede_ver')
        },
        {
            icon: CheckSquare,
            label: 'Asistencia',
            path: '/asistencia',
            visible: checkPermission('asistencia', 'puede_ver')
        },
        {
            icon: FileText,
            label: 'Nómina & Reportes',
            path: '/fiscalizacion',
            visible: checkPermission('documentos', 'puede_ver')
        },
        {
            icon: Settings,
            label: 'Configuración',
            path: '/configuracion',
            visible: checkPermission('usuarios', 'puede_ver')
        },
    ].filter(i => i.visible);

    const sidebarContent = (isMobile: boolean) => (
        <>
            {/* Logo Section */}
            <div className="px-5 py-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 bg-[#0071E3] rounded-xl flex items-center justify-center shadow-sm">
                        <ShieldCheck className="h-5 w-5 text-white" />
                    </div>
                    {(isMobile || !isCollapsed) && (
                        <motion.div
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex flex-col"
                        >
                            <span className="font-semibold text-base text-[#1D1D1F] leading-none">Bóveda</span>
                            <span className="text-xs text-[#0071E3] font-bold tracking-[0.2em] uppercase mt-0.5">LOLS</span>
                        </motion.div>
                    )}
                </div>
                {isMobile && (
                    <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl hover:bg-[#F5F5F7] text-[#6E6E73]">
                        <X className="h-5 w-5" />
                    </button>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 mt-4 space-y-1">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => cn(
                            "flex items-center gap-3 px-3 py-3 rounded-xl transition-all group relative text-base",
                            isActive
                                ? "bg-[#0071E3]/8 text-[#0071E3] font-semibold"
                                : "text-[#6E6E73] hover:bg-[#F5F5F7] hover:text-[#1D1D1F]"
                        )}
                        title={(!isMobile && isCollapsed) ? item.label : ''}
                    >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {(isMobile || !isCollapsed) && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="font-medium"
                            >
                                {item.label}
                            </motion.span>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* User Section */}
            <div className="p-3 border-t border-[#E8E8ED]">
                <div className={cn(
                    "flex items-center gap-3 p-2.5 rounded-xl bg-[#F5F5F7] transition-all",
                    (!isMobile && isCollapsed) ? "justify-center" : "justify-start"
                )}>
                    <div className="h-10 w-10 shrink-0 rounded-full bg-[#0071E3] flex items-center justify-center text-sm font-semibold text-white">
                        {user?.nombre?.[0]}
                    </div>
                    {(isMobile || !isCollapsed) && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1D1D1F] truncate">{user?.nombre}</p>
                            <p className="text-xs text-[#6E6E73] truncate">{user?.rol}</p>
                        </div>
                    )}
                    {(isMobile || !isCollapsed) && (
                        <button onClick={logout} className="p-1.5 hover:bg-[#E8E8ED] rounded-lg text-[#FF3B30] transition-colors">
                            <LogOut className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>
        </>
    );

    return (
        <>
            {/* Desktop Sidebar */}
            <motion.aside
                animate={{ width: isCollapsed ? '72px' : '260px' }}
                className="hidden md:flex h-screen sticky top-0 bg-white/80 backdrop-blur-xl border-r border-[#D2D2D7] flex-col z-40 transition-all duration-300"
            >
                {sidebarContent(false)}

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute right-[-14px] top-20 h-7 w-7 bg-white border border-[#D2D2D7] rounded-full flex items-center justify-center text-[#6E6E73] hover:text-[#1D1D1F] hover:border-[#B0B0B5] transition-colors z-50 shadow-sm"
                >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
            </motion.aside>

            {/* Mobile Drawer */}
            <AnimatePresence>
                {mobileOpen && (
                    <>
                        {/* Overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-50"
                            onClick={() => setMobileOpen(false)}
                        />
                        {/* Drawer */}
                        <motion.aside
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="md:hidden fixed inset-y-0 left-0 w-[280px] bg-white flex flex-col z-50 shadow-2xl"
                        >
                            {sidebarContent(true)}
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

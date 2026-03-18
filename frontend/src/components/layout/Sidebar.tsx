import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    FileText,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    LogOut,
    Settings,
    X,
    SearchCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../ui/Logo';

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
            icon: SearchCheck,
            label: 'Consultas',
            path: '/consultas',
            visible: checkPermission('trabajadores', 'puede_ver')
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
            <div className={cn("flex items-center justify-between transition-all duration-300 h-[84px]", (!isMobile && isCollapsed) ? "px-0 justify-center" : "pl-3 pr-5")}>
                <div className={cn("flex flex-1 items-center overflow-hidden transition-all duration-300", (!isMobile && isCollapsed) ? "justify-center" : "justify-start")}>
                    <Logo
                        variant="green"
                        iconOnly={!isMobile && isCollapsed}
                        className={cn(
                            "transition-all duration-300 transform-gpu shrink-0",
                            (!isMobile && isCollapsed) ? "h-10 w-auto" : "h-14 w-auto"
                        )}
                    />
                </div>
                {isMobile && (
                    <button onClick={() => setMobileOpen(false)} className="p-2 rounded-xl hover:bg-background text-muted-foreground shrink-0">
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
                            "flex items-center rounded-xl transition-all group relative text-base whitespace-nowrap overflow-hidden h-12",
                            (!isMobile && isCollapsed) ? "justify-center px-0 w-12 mx-auto" : "justify-start pl-[18px] pr-4 w-full gap-[14px]",
                            isActive
                                ? "bg-brand-primary/8 text-brand-primary font-semibold"
                                : "text-muted-foreground hover:bg-background hover:text-brand-dark font-medium"
                        )}
                        title={(!isMobile && isCollapsed) ? item.label : ''}
                    >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {(isMobile || !isCollapsed) && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
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
                    "flex items-center rounded-xl bg-background transition-all whitespace-nowrap overflow-hidden h-[52px]",
                    (!isMobile && isCollapsed) ? "justify-center px-0 w-12 mx-auto" : "justify-start pl-[10px] pr-3 w-full gap-[6px]"
                )}>
                    <div className="h-9 w-9 shrink-0 rounded-full bg-brand-primary flex items-center justify-center text-sm font-semibold text-white">
                        {user?.nombre?.[0]}
                    </div>
                    {(isMobile || !isCollapsed) && (
                        <div className="flex-1 min-w-0 pr-1">
                            <p className="text-sm font-bold text-brand-dark truncate leading-tight">{user?.nombre}</p>
                            <p className="text-[11px] font-medium text-[#86868B] truncate leading-tight tracking-wide">{user?.rol}</p>
                        </div>
                    )}
                    {(isMobile || !isCollapsed) && (
                        <button onClick={logout} className="p-1.5 hover:bg-[#E8E8ED] rounded-lg text-destructive transition-colors shrink-0">
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
                className="hidden md:flex h-screen sticky top-0 bg-white/80 backdrop-blur-xl border-r border-border flex-col z-40 transition-all duration-300"
            >
                {sidebarContent(false)}

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute right-[-14px] top-20 h-7 w-7 bg-white border border-border rounded-full flex items-center justify-center text-muted-foreground hover:text-brand-dark hover:border-[#B0B0B5] transition-colors z-50 shadow-sm"
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

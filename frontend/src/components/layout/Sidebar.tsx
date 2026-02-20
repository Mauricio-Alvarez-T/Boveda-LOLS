import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
    LayoutDashboard,
    Users,
    FileText,
    CheckSquare,
    ShieldCheck,
    ChevronLeft,
    ChevronRight,
    LogOut,
    ChevronDown,
    Settings
} from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/Button';

interface SidebarProps {
    isCollapsed: boolean;
    setIsCollapsed: (v: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isCollapsed, setIsCollapsed }) => {
    const { user, logout } = useAuth();

    const menuItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
        { icon: Users, label: 'Trabajadores', path: '/trabajadores' },
        { icon: CheckSquare, label: 'Asistencia', path: '/asistencia' },
        { icon: FileText, label: 'Nómina & Reportes', path: '/fiscalizacion' },
        { icon: Settings, label: 'Configuración', path: '/configuracion' },
    ];

    return (
        <motion.aside
            animate={{ width: isCollapsed ? '72px' : '260px' }}
            className="h-screen sticky top-0 bg-white/80 backdrop-blur-xl border-r border-[#D2D2D7] flex flex-col z-40 transition-all duration-300"
        >
            {/* Logo Section */}
            <div className="px-5 py-6 flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 bg-[#0071E3] rounded-xl flex items-center justify-center shadow-sm">
                    <ShieldCheck className="h-5 w-5 text-white" />
                </div>
                {!isCollapsed && (
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
                        title={isCollapsed ? item.label : ''}
                    >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {!isCollapsed && (
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
                    isCollapsed ? "justify-center" : "justify-start"
                )}>
                    <div className="h-10 w-10 shrink-0 rounded-full bg-[#0071E3] flex items-center justify-center text-sm font-semibold text-white">
                        {user?.nombre?.[0]}
                    </div>
                    {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1D1D1F] truncate">{user?.nombre}</p>
                            <p className="text-xs text-[#6E6E73] truncate">{user?.rol}</p>
                        </div>
                    )}
                    {!isCollapsed && (
                        <button onClick={logout} className="p-1.5 hover:bg-[#E8E8ED] rounded-lg text-[#FF3B30] transition-colors">
                            <LogOut className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute right-[-14px] top-20 h-7 w-7 bg-white border border-[#D2D2D7] rounded-full flex items-center justify-center text-[#6E6E73] hover:text-[#1D1D1F] hover:border-[#B0B0B5] transition-colors z-50 shadow-sm"
                >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                </button>
            </div>
        </motion.aside>
    );
};

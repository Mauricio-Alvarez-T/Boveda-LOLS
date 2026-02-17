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
    ChevronDown
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
        { icon: FileText, label: 'Fiscalización', path: '/fiscalizacion' },
    ];

    return (
        <motion.aside
            animate={{ width: isCollapsed ? '80px' : '280px' }}
            className="h-screen sticky top-0 bg-slate-950 border-r border-white/5 flex flex-col z-40 transition-all duration-300"
        >
            {/* Logo Section */}
            <div className="p-6 flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 premium-gradient rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <ShieldCheck className="h-6 w-6 text-white" />
                </div>
                {!isCollapsed && (
                    <motion.div
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex flex-col"
                    >
                        <span className="font-bold text-lg text-white leading-none">Bóveda</span>
                        <span className="text-xs text-brand-primary font-bold tracking-widest uppercase mt-0.5">LOLS</span>
                    </motion.div>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-4 mt-8 space-y-2">
                {menuItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) => cn(
                            "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative",
                            isActive
                                ? "bg-violet-500/10 text-brand-primary"
                                : "text-muted-foreground hover:bg-white/5 hover:text-white"
                        )}
                        title={isCollapsed ? item.label : ''}
                    >
                        <item.icon className="h-5 w-5 shrink-0" />
                        {!isCollapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-sm font-semibold"
                            >
                                {item.label}
                            </motion.span>
                        )}
                        {/* Active Indicator */}
                        <NavLink to={item.path}>
                            {({ isActive }) => isActive && (
                                <motion.div
                                    layoutId="active-nav"
                                    className="absolute left-[-16px] w-1.5 h-6 bg-brand-primary rounded-r-full"
                                />
                            )}
                        </NavLink>
                    </NavLink>
                ))}
            </nav>

            {/* User Section */}
            <div className="p-4 border-t border-white/5">
                <div className={cn(
                    "flex items-center gap-3 p-3 rounded-2xl bg-white/5 border border-white/10 transition-all",
                    isCollapsed ? "justify-center" : "justify-start"
                )}>
                    <div className="h-9 w-9 shrink-0 rounded-lg premium-gradient flex items-center justify-center text-xs font-bold text-white shadow-xl">
                        {user?.nombre?.[0]}
                    </div>
                    {!isCollapsed && (
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{user?.nombre}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{user?.rol}</p>
                        </div>
                    )}
                    {!isCollapsed && (
                        <button onClick={logout} className="p-1.5 hover:bg-white/10 rounded-lg text-rose-400">
                            <LogOut className="h-4 w-4" />
                        </button>
                    )}
                </div>

                {/* Collapse Toggle */}
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="absolute right-[-14px] top-24 h-7 w-7 bg-slate-900 border border-white/10 rounded-full flex items-center justify-center text-white hover:bg-slate-800 transition-colors z-50 shadow-xl"
                >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                </button>
            </div>
        </motion.aside>
    );
};

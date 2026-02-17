import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Bell, Search, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex min-h-screen bg-slate-950">
            {/* Sidebar */}
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Navbar */}
                <header className="h-20 border-b border-white/5 bg-slate-950/50 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-30">
                    <div className="flex-1 max-w-xl">
                        {/* Optional Global Search Placeholder */}
                    </div>

                    <div className="flex items-center gap-4">
                        <button className="h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/5 text-muted-foreground relative">
                            <Bell className="h-5 w-5" />
                            <div className="absolute top-2 right-2 h-2 w-2 bg-rose-500 rounded-full border-2 border-slate-950" />
                        </button>
                        <div className="h-8 w-px bg-white/10 mx-2" />
                        <div className="flex items-center gap-3">
                            <div className="text-right hidden sm:block">
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">Obra Seleccionada</p>
                                <div className="flex items-center gap-1 text-white font-semibold text-xs transition-colors hover:text-brand-primary cursor-pointer">
                                    Edificio Los Olmos
                                    <ChevronDown className="h-3 w-3" />
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                {/* Page Content */}
                <div className="p-8 pb-12 overflow-x-hidden">
                    <Outlet />
                </div>
            </main>
        </div>
    );
};

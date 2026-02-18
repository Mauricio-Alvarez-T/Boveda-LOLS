import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ObraSelector } from './ObraSelector';
import { Bell } from 'lucide-react';

export const MainLayout: React.FC = () => {
    const [isCollapsed, setIsCollapsed] = useState(false);

    return (
        <div className="flex min-h-screen bg-[#F5F5F7]">
            {/* Sidebar */}
            <Sidebar isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

            {/* Main Content Area */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Navbar */}
                <header className="h-16 border-b border-[#D2D2D7] bg-white/80 backdrop-blur-xl flex items-center justify-between px-8 sticky top-0 z-30">
                    <div className="flex-1 max-w-xl">
                        {/* Optional Global Search Placeholder */}
                    </div>

                    <div className="flex items-center gap-3">
                        <button className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-[#F5F5F7] text-[#6E6E73] relative transition-colors">
                            <Bell className="h-5 w-5" />
                            <div className="absolute top-1.5 right-1.5 h-2 w-2 bg-[#FF3B30] rounded-full border-2 border-white" />
                        </button>
                        <div className="h-6 w-px bg-[#D2D2D7] mx-1" />
                        <ObraSelector />
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

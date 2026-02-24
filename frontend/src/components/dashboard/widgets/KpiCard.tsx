import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface KpiCardProps {
    label: string;
    value: string | number;
    icon: React.ElementType;
    color: string;    // e.g. 'text-[#0071E3]'
    bg: string;       // e.g. 'bg-[#0071E3]/8'
    description: string;
    onClick?: () => void;
    index?: number;
}

const KpiCard: React.FC<KpiCardProps> = ({ label, value, icon: Icon, color, bg, description, onClick, index = 0 }) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.08 }}
            onClick={onClick}
            className="bg-white rounded-2xl border border-[#D2D2D7] p-5 relative overflow-hidden group hover:shadow-md hover:border-[#B0B0B5] transition-all cursor-pointer"
        >
            <div className="flex items-center gap-4 relative z-10">
                <div className={cn("p-3 rounded-2xl", bg, color)}>
                    <Icon className="h-5 w-5" />
                </div>
                <div>
                    <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest">{label}</p>
                    <p className="text-3xl font-bold text-[#1D1D1F] mt-0.5">{value}</p>
                </div>
            </div>
            <div className="mt-3 flex items-center gap-1 text-xs text-[#6E6E73] opacity-0 group-hover:opacity-100 transition-opacity">
                <ArrowRight className="h-3 w-3" />
                <span>{description}</span>
            </div>
            <div className={cn("absolute -right-4 -bottom-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity", color)}>
                <Icon className="h-28 w-28 rotate-12" />
            </div>
        </motion.div>
    );
};

export default KpiCard;

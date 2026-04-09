import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, Users, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../../ui/Button';
import type { EstadoAsistencia } from '../../../types/entities';

interface AttendanceSummaryRowProps {
    date: string;
    setDate: (d: string) => void;
    navigateDate: (offset: number) => void;
    summary: {
        total: number;
        presentes: number;
        porcentaje: number;
        desglose: { count: number; estado: EstadoAsistencia }[];
    };
    hasActiveContext: boolean;
}

export const AttendanceSummaryRow: React.FC<AttendanceSummaryRowProps> = ({
    date,
    setDate,
    navigateDate,
    summary,
    hasActiveContext
}) => {
    return (
        <>
            {/* Sub-header Móvil: Selector de Fecha y Estadísticas */}
            <div className="md:hidden flex flex-col gap-2 px-4 pt-4 pb-3 bg-white border-b border-[#E8E8ED] shrink-0">
                <div className="flex items-center justify-between bg-white rounded-2xl p-1 border border-[#E8E8ED] shadow-sm">
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-brand-primary active:bg-brand-primary/10 rounded-xl shrink-0" onClick={() => navigateDate(-1)}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-brand-primary/60" />
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="bg-transparent text-sm text-brand-dark font-black focus:outline-none text-center cursor-pointer uppercase tracking-tight"
                        />
                    </div>
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-brand-primary active:bg-brand-primary/10 rounded-xl shrink-0" onClick={() => navigateDate(1)}>
                        <ChevronRight className="h-5 w-5" />
                    </Button>
                </div>

                <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-0.5">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark/5 rounded-xl border border-brand-dark/10 shrink-0">
                        <span className="text-[12px] font-black text-brand-dark tabular-nums">{summary.total}</span>
                        <span className="text-[8px] font-bold text-brand-dark/40 uppercase tracking-tighter">Total</span>
                    </div>
                    {summary.desglose.map(({ count, estado }) => (
                        <div
                            key={estado.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all shrink-0"
                            style={{ 
                                backgroundColor: `color-mix(in srgb, ${estado.color}, transparent 92%)`, 
                                borderColor: `color-mix(in srgb, ${estado.color}, transparent 70%)`,
                                color: `color-mix(in srgb, ${estado.color}, black 40%)` 
                            }}
                        >
                            <span className="text-[9px] font-black opacity-60 uppercase">{estado.codigo}</span>
                            <span className="text-[12px] font-black tabular-nums">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Desktop */}
            <div className="h-[60px] border-b border-[#F0F0F5] bg-white/50 px-5 shrink-0 hidden md:flex items-center justify-between">
                <div className="flex items-center gap-4">
                     <div className="h-8 w-8 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                        <CheckSquare className="h-4 w-4 text-brand-primary" />
                    </div>
                    <h2 className="text-sm font-bold text-brand-dark">Registro Diario</h2>
                </div>

                {hasActiveContext && (
                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex items-center bg-white/50 backdrop-blur-sm border border-[#E8E8ED] rounded-xl p-0.5 shadow-sm">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-brand-primary shrink-0" onClick={() => navigateDate(-1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="relative group flex items-center px-1">
                                <input
                                    type="date"
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                    className="w-[115px] bg-transparent text-[11px] text-brand-dark font-black focus:outline-none text-center cursor-pointer"
                                />
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-brand-primary shrink-0" onClick={() => navigateDate(1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="flex items-center gap-2 ml-2 border-l border-[#E8E8ED] pl-4 overflow-x-auto scrollbar-none max-w-[300px] lg:max-w-none">
                            {/* Total Workers Badge */}
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-dark/5 rounded-xl border border-brand-dark/10 shrink-0">
                                <Users className="h-3.5 w-3.5 text-brand-dark/60" />
                                <span className="text-[13px] font-black text-brand-dark uppercase tabular-nums">{summary.total}</span>
                                <span className="text-[9px] font-bold text-brand-dark/40 uppercase tracking-tighter ml-0.5">Total</span>
                            </div>

                            {/* Dynamic Breakdown Badges */}
                            {summary.desglose.map(({ count, estado }) => (
                                <motion.div
                                    key={estado.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all shrink-0 shadow-sm"
                                    style={{ 
                                        backgroundColor: `color-mix(in srgb, ${estado.color}, transparent 90%)`, 
                                        borderColor: `color-mix(in srgb, ${estado.color}, transparent 60%)`,
                                        color: `color-mix(in srgb, ${estado.color}, black 45%)` 
                                    }}
                                >
                                    <span className="text-[10px] font-black opacity-70 uppercase tracking-widest">{estado.codigo}</span>
                                    <div className="h-4 w-px opacity-20" style={{ backgroundColor: `color-mix(in srgb, ${estado.color}, black 45%)` }} />
                                    <span className="text-[13px] font-black tabular-nums">{count}</span>
                                </motion.div>
                            ))}

                            {/* Attendance Percentage Badge */}
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-accent/5 rounded-xl border border-brand-accent/10 shrink-0 ml-1">
                                <BarChart3 className="h-3.5 w-3.5 text-brand-accent/60" />
                                <span className="text-[13px] font-black text-brand-accent uppercase tabular-nums">{summary.porcentaje}%</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

import React from 'react';
import { ChevronLeft, ChevronRight, Calendar, CheckSquare, Users, BarChart3, Search, X } from 'lucide-react';
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
    statusFilter: number | null;
    onStatusFilter: (estadoId: number | null) => void;
    searchQuery: string;
    setSearchQuery: (val: string) => void;
}

export const AttendanceSummaryRow: React.FC<AttendanceSummaryRowProps> = ({
    date,
    setDate,
    navigateDate,
    summary,
    hasActiveContext,
    statusFilter,
    onStatusFilter,
    searchQuery,
    setSearchQuery
}) => {
    // Tope: máximo 30 días futuros para selección de fecha (regla operativa).
    // Pasado no se limita. El navegador deshabilita días posteriores en el calendario.
    const maxFecha = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

    return (
        <>
            {/* Sub-header Móvil: Selector de Fecha y Estadísticas */}
            <div className="md:hidden flex flex-col gap-2 px-4 pt-4 pb-3 bg-card border-b border-border shrink-0">
                <div className="flex items-center justify-between bg-card rounded-2xl p-1 border border-border shadow-sm">
                    <Button variant="ghost" size="icon" className="h-10 w-10 text-brand-primary active:bg-brand-primary/10 rounded-xl shrink-0" onClick={() => navigateDate(-1)}>
                        <ChevronLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 flex items-center justify-center gap-2">
                        <Calendar className="h-3.5 w-3.5 text-brand-primary/60" />
                        <input
                            type="date"
                            value={date}
                            max={maxFecha}
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
                    {summary.desglose.map(({ count, estado }) => {
                        const isActive = statusFilter === estado.id;
                        return (
                            <div
                                key={estado.id}
                                onClick={() => onStatusFilter(isActive ? null : estado.id)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all shrink-0 cursor-pointer ${isActive ? 'ring-2 ring-offset-1 shadow-md' : ''}`}
                                style={{
                                    backgroundColor: `color-mix(in srgb, ${estado.color}, transparent ${isActive ? '80%' : '92%'})`,
                                    borderColor: `color-mix(in srgb, ${estado.color}, transparent ${isActive ? '30%' : '70%'})`,
                                    color: `color-mix(in srgb, ${estado.color}, black 40%)`,
                                    '--tw-ring-color': estado.color
                                } as React.CSSProperties}
                            >
                                <span className="text-[9px] font-black opacity-60 uppercase">{estado.codigo}</span>
                                <span className="text-[12px] font-black tabular-nums">{count}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Desktop:
                Izquierda (estática): icon + título + date picker + KPIs Total/Porcentaje.
                Derecha (dinámica):   chips clickeables de estados.
                Esto evita que la fecha cambie de posición según haya más o menos estados. */}
            <div className="min-h-[48px] border-b border-border bg-white/50 dark:bg-white/5 px-4 lg:px-5 py-2 shrink-0 hidden md:flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    <div className="flex items-center gap-3 shrink-0">
                        <div className="h-7 w-7 lg:h-8 lg:w-8 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                            <CheckSquare className="h-3.5 w-3.5 lg:h-4 lg:w-4 text-brand-primary" />
                        </div>
                        <h2 className="text-xs lg:text-sm font-bold text-brand-dark whitespace-nowrap">Registro Diario</h2>
                    </div>

                    {hasActiveContext && (
                        <>
                            {/* Date picker — siempre en posición fija junto al título */}
                            <div className="flex items-center bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-border rounded-xl p-0.5 shadow-sm shrink-0">
                                <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8 text-muted-foreground hover:text-brand-primary shrink-0" onClick={() => navigateDate(-1)}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div className="relative group flex items-center px-0.5">
                                    <input
                                        type="date"
                                        value={date}
                                        max={maxFecha}
                                        onChange={(e) => setDate(e.target.value)}
                                        className="w-[105px] lg:w-[115px] bg-transparent text-[10px] lg:text-[11px] text-brand-dark font-black focus:outline-none text-center cursor-pointer"
                                    />
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7 lg:h-8 lg:w-8 text-muted-foreground hover:text-brand-primary shrink-0" onClick={() => navigateDate(1)}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* KPIs estáticos: Total + Porcentaje */}
                            <div className="flex items-center gap-1.5 lg:gap-2 shrink-0">
                                <div className="flex items-center gap-1 px-2 lg:px-3 py-1 bg-brand-dark/5 rounded-lg lg:rounded-xl border border-brand-dark/10 shrink-0">
                                    <Users className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-brand-dark/60" />
                                    <span className="text-[11px] lg:text-[13px] font-black text-brand-dark uppercase tabular-nums">{summary.total}</span>
                                    <span className="text-[8px] lg:text-[9px] font-bold text-brand-dark/40 uppercase tracking-tighter hidden lg:inline">Total</span>
                                </div>
                                <div className="flex items-center gap-1 px-2 py-1 bg-brand-accent/5 rounded-lg lg:rounded-xl border border-brand-accent/10 shrink-0">
                                    <BarChart3 className="h-3 w-3 lg:h-3.5 lg:w-3.5 text-brand-accent/60" />
                                    <span className="text-[11px] lg:text-[13px] font-black text-brand-accent uppercase tabular-nums">{summary.porcentaje}%</span>
                                </div>
                            </div>

                            {/* Buscador — vive junto a la fecha y los KPIs */}
                            <div className="relative shrink-0 group">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-focus-within:text-brand-primary pointer-events-none" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-7 lg:h-8 pl-8 pr-7 bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-border rounded-lg lg:rounded-xl shadow-sm text-[10px] lg:text-[11px] font-medium focus:outline-none focus:border-brand-primary/40 focus:ring-2 focus:ring-brand-primary/5 transition-all w-[150px] lg:w-[200px]"
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-muted-foreground/10 text-muted-foreground hover:bg-muted-foreground/20 active:scale-90 transition-all"
                                        title="Limpiar búsqueda"
                                    >
                                        <X className="h-2.5 w-2.5" />
                                    </button>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Chips dinámicos de filtro por estado — al final, no afectan posición de la izq */}
                {hasActiveContext && summary.desglose.length > 0 && (
                    <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap min-w-0 justify-end">
                        {summary.desglose.map(({ count, estado }) => {
                            const isActive = statusFilter === estado.id;
                            return (
                                <motion.div
                                    key={estado.id}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    onClick={() => onStatusFilter(isActive ? null : estado.id)}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-lg lg:rounded-xl border transition-all shrink-0 shadow-sm cursor-pointer hover:brightness-90 hover:shadow-md ${isActive ? 'ring-2 ring-offset-1 shadow-md' : ''}`}
                                    style={{
                                        backgroundColor: `color-mix(in srgb, ${estado.color}, transparent ${isActive ? '80%' : '90%'})`,
                                        borderColor: `color-mix(in srgb, ${estado.color}, transparent ${isActive ? '30%' : '60%'})`,
                                        color: `color-mix(in srgb, ${estado.color}, black 45%)`,
                                        '--tw-ring-color': estado.color
                                    } as React.CSSProperties}
                                >
                                    <span className="text-[9px] lg:text-[10px] font-black opacity-70 uppercase tracking-widest">{estado.codigo}</span>
                                    <span className="text-[11px] lg:text-[13px] font-black tabular-nums">{count}</span>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
};

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Trabajador, EstadoAsistencia, Asistencia, PeriodoAusencia } from '../../types/entities';
import { CalendarRange } from 'lucide-react';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    estados: EstadoAsistencia[];
    obraId?: number;
    onAssignPeriod?: () => void;
}

export const WorkerCalendarModal: React.FC<Props> = ({ isOpen, onClose, worker, estados, obraId, onAssignPeriod }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<Asistencia[]>([]);
    const [periodos, setPeriodos] = useState<PeriodoAusencia[]>([]);

    useEffect(() => {
        if (!isOpen || !worker) return;

        const fetchMonthData = async () => {
            setLoading(true);
            try {
                const year = currentDate.getFullYear();
                const month = currentDate.getMonth() + 1;
                const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).getDate();
                const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;

                const [resAsist, resPer] = await Promise.all([
                    api.get(`/asistencias/reporte?trabajador_id=${worker.id}&fecha_inicio=${startDate}&fecha_fin=${endDate}${obraId ? `&obra_id=${obraId}` : ''}`),
                    api.get(`/asistencias/periodos?trabajador_id=${worker.id}&activo=true&fecha_inicio=${startDate}&fecha_fin=${endDate}`)
                ]);
                setRecords(resAsist.data || []);
                setPeriodos(resPer.data?.data || []);
            } catch (error) {
                console.error('Error fetching calendar data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMonthData();
    }, [isOpen, worker, currentDate, obraId]);

    if (!isOpen || !worker) return null;

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
    const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const navigateMonth = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const getRecordForDay = (day: number) => {
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return records.find(r => r.fecha.startsWith(dateStr));
    };

    const getPeriodForDay = (day: number) => {
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return periodos.find(p => p.fecha_inicio <= dateStr && p.fecha_fin >= dateStr);
    };

    const isPeriodStart = (day: number) => {
        const p = getPeriodForDay(day);
        if (!p) return false;
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return p.fecha_inicio === dateStr || day === 1; // Start of period or start of month
    };

    const isPeriodEnd = (day: number) => {
        const p = getPeriodForDay(day);
        if (!p) return false;
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return p.fecha_fin === dateStr || day === daysInMonth; // End of period or end of month
    };

    /* ── Shared calendar grid ── */
    const CalendarGrid = () => (
        <>
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold text-[#1D1D1F]">
                    {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
                </h3>
                <div className="flex gap-2">
                    <Button variant="glass" size="icon" onClick={() => navigateMonth(-1)}>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="glass" size="sm" onClick={() => setCurrentDate(new Date())}>
                        Hoy
                    </Button>
                    <Button variant="glass" size="icon" onClick={() => navigateMonth(1)}>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="h-64 flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#029E4D]" />
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-1 md:gap-1.5">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                        <div key={day} className="text-center text-[10px] font-bold text-[#86868B] uppercase tracking-widest mb-2">
                            {day}
                        </div>
                    ))}

                    {Array.from({ length: startingDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-10 md:h-14 bg-[#F5F5F7]/30 rounded-xl border border-[#E8E8ED]/30" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const record = getRecordForDay(day);
                        const periodo = getPeriodForDay(day);
                        const estado = record ? estados.find(e => e.id === record.estado_id) : null;
                        const isWeekend = (startingDay + i) % 7 >= 5;

                        // Clases para el bloque visual conectivo del período
                        let periodClasses = "";
                        if (periodo) {
                            if (isPeriodStart(day) && isPeriodEnd(day)) {
                                periodClasses = "rounded-xl";
                            } else if (isPeriodStart(day)) {
                                periodClasses = "rounded-l-xl -mr-1.5 md:-mr-2"; 
                            } else if (isPeriodEnd(day)) {
                                periodClasses = "rounded-r-xl -ml-1.5 md:-ml-2";
                            } else {
                                periodClasses = "-mx-1.5 md:-mx-2"; // Connecting through
                            }
                        }

                        return (
                            <div key={day} className="relative h-10 md:h-14 flex flex-col items-center">
                                {/* Bloque de período de fondo */}
                                {periodo && (
                                    <div 
                                        className={`absolute inset-y-0.5 md:inset-y-1 w-full z-0 pointer-events-none ${periodClasses}`}
                                        style={{ backgroundColor: `${periodo.estado_color}1A`, borderTop: `2px solid ${periodo.estado_color}30`, borderBottom: `2px solid ${periodo.estado_color}30` }}
                                    />
                                )}
                                
                                <div
                                    className={`absolute inset-0 p-1 md:p-1.5 flex flex-col items-center rounded-xl border z-10 hover:shadow-md hover:border-[#029E4D]/30 transition-all group ${!periodo ? 'border-[#E8E8ED]' : 'border-transparent bg-transparent'}`}
                                    style={!periodo ? { backgroundColor: estado ? `${estado.color}05` : (isWeekend ? '#F5F5F7/50' : '#FFFFFF') } : undefined}
                                    title={periodo ? `Período: ${periodo.estado_nombre}` : ''}
                                >
                                    <span className={`text-[10px] font-medium ${estado || periodo ? 'text-[#1D1D1F]' : 'text-[#86868B]'} mb-auto z-20`}>
                                        {day}
                                    </span>
                                    {estado && (
                                        <div
                                            className="px-1 py-0.5 rounded-lg text-[8px] md:text-[9px] font-bold w-full text-center truncate shadow-sm z-20"
                                            style={{ backgroundColor: `${estado.color}15`, color: estado.color }}
                                            title={estado.nombre}
                                        >
                                            {estado.codigo}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Legend */}
            <div className="mt-4 md:mt-6 flex flex-wrap gap-2 md:gap-3 justify-center">
                {estados.map(est => (
                    <div key={est.id} className="flex items-center gap-1.5 text-[11px] md:text-xs text-[#6E6E73]">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: est.color }} />
                        {est.nombre}
                    </div>
                ))}
            </div>
        </>
    );

    return (
        <AnimatePresence>
            {/* ── MOBILE: Fullscreen ── */}
            <div className="md:hidden fixed inset-0 z-50 flex flex-col bg-white">
                <motion.div
                    initial={{ opacity: 0, x: 60 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 60 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                    className="flex flex-col h-full"
                >
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E8E8ED] bg-white/80 backdrop-blur-xl shrink-0">
                        <button onClick={onClose} className="flex items-center gap-1 text-[#029E4D] text-sm font-medium">
                            <ChevronLeft className="h-5 w-5" />
                            <span>Volver</span>
                        </button>
                        <div className="flex-1 text-center pr-12">
                            <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center justify-center gap-2">
                                <CalendarIcon className="h-4 w-4 text-[#029E4D]" />
                                Calendario
                            </h3>
                        </div>
                    </div>

                    {/* Worker info */}
                    <div className="px-4 py-3 bg-[#F5F5F7] border-b border-[#E8E8ED] shrink-0 flex justify-between items-center">
                        <div>
                            <p className="text-sm font-semibold text-[#1D1D1F]">{worker.nombres} {worker.apellido_paterno}</p>
                            <p className="text-xs text-[#6E6E73]">{worker.rut}</p>
                        </div>
                        {onAssignPeriod && (
                            <Button variant="outline" size="sm" onClick={onAssignPeriod}>
                                Asignar Período
                            </Button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto px-4 py-4">
                        <CalendarGrid />
                    </div>
                </motion.div>
            </div>

            {/* ── DESKTOP: Centered card ── */}
            <div className="hidden md:flex fixed inset-0 z-50 items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between p-5 border-b border-[#E8E8ED]">
                        <div>
                            <h2 className="text-xl font-bold text-[#1D1D1F] flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-[#029E4D]" />
                                Calendario Mensual
                            </h2>
                            <p className="text-sm text-[#6E6E73] mt-1">
                                {worker.nombres} {worker.apellido_paterno} · {worker.rut}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {onAssignPeriod && (
                                <Button variant="outline" size="sm" onClick={onAssignPeriod} className="hidden sm:flex whitespace-nowrap" leftIcon={<CalendarRange className="h-4 w-4" />}>
                                    Asignar Período
                                </Button>
                            )}
                            <Button variant="ghost" size="icon" onClick={onClose}>
                                <X className="h-5 w-5" />
                            </Button>
                        </div>
                    </div>
                    <div className="p-6 overflow-y-auto">
                        <CalendarGrid />
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Trabajador, EstadoAsistencia, Asistencia, PeriodoAusencia, Feriado } from '../../types/entities';
import { CalendarRange } from 'lucide-react';

interface WorkerCalendarProps {
    worker: Trabajador;
    estados: EstadoAsistencia[];
    obraId?: number;
    onSelectRange?: (start: string, end: string) => void;
    readOnly?: boolean;
    showLegend?: boolean;
    showActivePeriods?: boolean;
}

const WorkerCalendar: React.FC<WorkerCalendarProps> = ({
    worker,
    estados,
    obraId,
    onSelectRange,
    readOnly = false,
    showLegend = true,
    showActivePeriods = true
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<Asistencia[]>([]);
    const [periodos, setPeriodos] = useState<PeriodoAusencia[]>([]);
    const [holidays, setHolidays] = useState<Feriado[]>([]);
    const [selectionStart, setSelectionStart] = useState<string | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null);

    useEffect(() => {
        if (!worker) return;

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
                const asistData = resAsist.data;
                setRecords(asistData.registros || []);
                setHolidays(asistData.feriados || []);
                setPeriodos(resPer.data?.data || []);
            } catch (error) {
                console.error('Error fetching calendar data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMonthData();
    }, [worker, currentDate, obraId]);

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

    const getHolidayForDay = (day: number) => {
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return holidays.find(h => h.fecha.startsWith(dateStr));
    };

    const isPeriodStart = (day: number) => {
        const p = getPeriodForDay(day);
        if (!p) return false;
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return p.fecha_inicio === dateStr || day === 1;
    };

    const isPeriodEnd = (day: number) => {
        const p = getPeriodForDay(day);
        if (!p) return false;
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return p.fecha_fin === dateStr || day === daysInMonth;
    };

    const handleDateClick = (dateStr: string) => {
        if (readOnly) return;
        if (!selectionStart || (selectionStart && selectionEnd)) {
            setSelectionStart(dateStr);
            setSelectionEnd(null);
        } else {
            if (dateStr < selectionStart) {
                setSelectionEnd(selectionStart);
                setSelectionStart(dateStr);
            } else {
                setSelectionEnd(dateStr);
            }
        }
    };

    const handleAssignRange = () => {
        if (selectionStart && selectionEnd && onSelectRange) {
            onSelectRange(selectionStart, selectionEnd);
            setSelectionStart(null);
            setSelectionEnd(null);
        }
    };

    return (
        <div className="flex flex-col">
            <div className="flex items-center justify-between mb-4 md:mb-6">
                <h3 className="text-base md:text-lg font-semibold text-brand-dark">
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
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                </div>
            ) : (
                <div className="grid grid-cols-7 gap-1 md:gap-1.5">
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                        <div key={day} className="text-center text-[10px] font-bold text-[#86868B] uppercase tracking-widest mb-2">
                            {day}
                        </div>
                    ))}

                    {Array.from({ length: startingDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-10 md:h-14 bg-background/30 rounded-xl border border-[#E8E8ED]/30" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                        const record = getRecordForDay(day);
                        const periodo = getPeriodForDay(day);
                        const estado = record ? estados.find(e => e.id === record.estado_id) : null;
                        const isWeekend = (startingDay + i) % 7 >= 5;
                        const holiday = getHolidayForDay(day);

                        const isSelected = (selectionStart && selectionEnd) && (dateStr >= selectionStart && dateStr <= selectionEnd);
                        const isStart = selectionStart === dateStr;
                        const isEnd = selectionEnd === dateStr;

                        const fIngreso = worker.fecha_ingreso ? String(worker.fecha_ingreso).split('T')[0] : null;
                        const fDesvinc = worker.fecha_desvinculacion ? String(worker.fecha_desvinculacion).split('T')[0] : null;
                        const isDesvinculado = fDesvinc ? dateStr > fDesvinc : false;
                        const isPreContrato = fIngreso ? dateStr < fIngreso : false;
                        const isOutOfRange = isDesvinculado || isPreContrato;

                        let periodClasses = "";
                        if (periodo) {
                            if (isPeriodStart(day) && isPeriodEnd(day)) {
                                periodClasses = "rounded-xl";
                            } else if (isPeriodStart(day)) {
                                periodClasses = "rounded-l-xl -mr-1.5 md:-mr-2"; 
                            } else if (isPeriodEnd(day)) {
                                periodClasses = "rounded-r-xl -ml-1.5 md:-ml-2";
                            } else {
                                periodClasses = "-mx-1.5 md:-mx-2"; 
                            }
                        }

                        let buttonClass = "absolute inset-0 p-1 md:p-1.5 flex flex-col items-center rounded-xl border z-10 transition-all group ";
                        if (isOutOfRange) {
                            buttonClass += "opacity-30 cursor-not-allowed bg-[repeating-linear-gradient(45deg,rgba(0,0,0,0.03),rgba(0,0,0,0.03)_5px,transparent_5px,transparent_10px)] border-border";
                        } else if (!periodo && !isSelected) {
                            buttonClass += "border-[#E8E8ED] hover:shadow-md hover:border-brand-primary/30";
                        } else if (isSelected) {
                            buttonClass += "border-transparent bg-transparent border-brand-primary/40 ring-2 ring-brand-primary/20";
                        } else {
                            buttonClass += "border-transparent bg-transparent hover:shadow-md hover:border-brand-primary/30";
                        }

                        const buttonTitle = isOutOfRange ? (isPreContrato ? 'Bloqueado: Aún no contratado' : 'Bloqueado por Finiquito') : (periodo ? `Período: ${periodo.estado_nombre}${periodo.observacion ? ' \n📝 ' + periodo.observacion : ''}` : (holiday ? `Feriado: ${holiday.nombre}` : (isSelected ? 'Seleccionado para nuevo trámite' : '')));

                        return (
                            <div key={`day-${day}`} className="relative aspect-square md:aspect-auto md:h-20">
                                {periodo && (
                                    <div 
                                        className={`absolute inset-y-0.5 md:inset-y-1 w-full z-0 pointer-events-none ${periodClasses}`}
                                        style={{ backgroundColor: `${periodo.estado_color}1A`, borderTop: `2px solid ${periodo.estado_color}30`, borderBottom: `2px solid ${periodo.estado_color}30` }}
                                    />
                                )}
                                {isSelected && (
                                    <div className={`absolute inset-y-1 w-full bg-brand-primary/10 border-y-2 border-brand-primary/20 z-0 pointer-events-none ${isStart ? 'rounded-l-xl' : ''} ${isEnd ? 'rounded-r-xl' : ''}`} />
                                )}
                                <button
                                    onClick={() => !isOutOfRange && handleDateClick(dateStr)}
                                    disabled={isOutOfRange || readOnly}
                                    className={buttonClass}
                                    style={!isOutOfRange && !periodo && !isSelected ? { 
                                        backgroundColor: estado ? `${estado.color}05` : (holiday ? '#FF3B3010' : (isWeekend ? '#E8ECEF' : '#FFFFFF')) 
                                    } : undefined}
                                    title={buttonTitle}
                                >
                                    <span className={`text-[10px] font-medium ${estado || periodo || holiday || isSelected ? 'text-brand-dark' : 'text-[#86868B]'} mb-auto z-20`}>
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
                                    {isSelected && !estado && !periodo && (
                                        <div className="h-1 w-1 bg-brand-primary rounded-full z-20" />
                                    )}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {!readOnly && selectionStart && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 bg-background rounded-2xl flex items-center justify-between border border-border"
                >
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase font-black text-[#86868B] tracking-widest">Rango Seleccionado</span>
                        <span className="text-xs font-bold text-brand-dark">
                            {selectionStart.split('-').reverse().join('/')} 
                            {selectionEnd && selectionEnd !== selectionStart && ` — ${selectionEnd.split('-').reverse().join('/')}`}
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="glass" size="sm" onClick={() => { setSelectionStart(null); setSelectionEnd(null); }}>
                            Anular
                        </Button>
                        <Button
                            variant="primary" 
                            size="sm" 
                            onClick={handleAssignRange}
                            disabled={!selectionEnd}
                            leftIcon={<CalendarRange className="h-4 w-4" />}
                        >
                            Asignar Ausencia
                        </Button>
                    </div>
                </motion.div>
            )}

            {showLegend && (
                <div className="mt-6 pt-6 border-t border-[#F1F1F4]">
                    <span className="text-[10px] uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-4 block text-center md:text-left">Nomenclaturas y Estados</span>
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {estados.map(est => {
                            // Limpiar el nombre si viene con el código entre paréntesis
                            const cleanName = est.nombre.split(' (')[0];
                            return (
                                <div 
                                    key={est.id} 
                                    className="flex flex-col gap-1 p-3 rounded-2xl bg-white border border-[#E8E8ED] shadow-sm hover:border-brand-primary/20 transition-all group"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shadow-inner shrink-0" style={{ backgroundColor: est.color }} />
                                        <span className="text-[13px] font-bold text-brand-dark truncate">
                                            {cleanName}
                                        </span>
                                    </div>
                                    <span className="text-[10px] font-bold text-muted-foreground uppercase pl-4.5">
                                        {est.codigo}
                                    </span>
                                </div>
                            );
                        })}
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-white border border-[#E8E8ED] shadow-sm hover:border-brand-primary/20 transition-all">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-destructive/20 border border-destructive/40 shadow-inner shrink-0" />
                                <span className="text-[13px] font-bold text-brand-dark">Feriado</span>
                            </div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase pl-4.5">
                                FER
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {showActivePeriods && periodos.length > 0 && (
                <div className="mt-6">
                    <span className="text-[10px] uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-3 block">Resumen de Períodos Activos</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {periodos.map(p => (
                            <div 
                                key={p.id} 
                                className="flex flex-col gap-2 p-3 rounded-2xl border border-brand-primary/10 bg-brand-primary/[0.02] hover:bg-brand-primary/[0.04] transition-all group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full shadow-inner" style={{ backgroundColor: p.estado_color || '#6E6E73' }} />
                                        <span className="text-xs font-bold text-brand-dark">{p.estado_nombre || p.estado_codigo}</span>
                                    </div>
                                    <div className="px-2 py-0.5 rounded-lg bg-white border border-brand-primary/10 text-[10px] font-black text-brand-dark tracking-tight">
                                        ACTIVO
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-[11px] font-semibold text-[#86868B]">
                                    <CalendarRange className="h-3 w-3" />
                                    <span>
                                        {p.fecha_inicio.split('T')[0].split('-').reverse().join('/')}
                                        <span className="mx-1.5 opacity-40">—</span>
                                        {p.fecha_fin.split('T')[0].split('-').reverse().join('/')}
                                    </span>
                                </div>

                                {p.observacion && (
                                    <div className="mt-1 p-2 rounded-xl bg-white/50 border border-border/50 text-[11px] text-muted-foreground italic flex items-start gap-1.5">
                                        <span className="shrink-0 leading-none mt-0.5 text-xs">📝</span>
                                        <p className="leading-relaxed">{p.observacion}</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WorkerCalendar;

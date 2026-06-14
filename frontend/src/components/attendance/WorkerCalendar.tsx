import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Loader2, Trash2, CalendarRange } from 'lucide-react';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import api from '../../services/api';
import type { Trabajador, EstadoAsistencia, Asistencia, PeriodoAusencia, Feriado } from '../../types/entities';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

interface WorkerCalendarProps {
    worker: Trabajador;
    estados: EstadoAsistencia[];
    obraId?: number;
    onSelectRange?: (start: string, end: string) => void;
    readOnly?: boolean;
    showLegend?: boolean;
    showActivePeriods?: boolean;
    onPeriodDeleted?: () => void;
}

const WorkerCalendar: React.FC<WorkerCalendarProps> = ({
    worker,
    estados,
    obraId,
    onSelectRange,
    readOnly = false,
    showLegend = true,
    showActivePeriods = true,
    onPeriodDeleted
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<Asistencia[]>([]);
    const [periodos, setPeriodos] = useState<PeriodoAusencia[]>([]);
    const [holidays, setHolidays] = useState<Feriado[]>([]);
    const [selectionStart, setSelectionStart] = useState<string | null>(null);
    const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
    // Día bajo el cursor mientras se está eligiendo el rango (preview al arrastrar)
    const [hoverDate, setHoverDate] = useState<string | null>(null);
    const [deletingPeriodId, setDeletingPeriodId] = useState<number | null>(null);
    const { hasPermission } = useAuth();
    const { resolvedTheme } = useTheme();
    const isDark = resolvedTheme === 'dark';

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
                    api.get(`/asistencias/reporte?trabajador_id=${worker.id}&fecha_inicio=${startDate}&fecha_fin=${endDate}`),
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

    // Rango a resaltar: si aún no hay fin definido, se usa el día bajo el cursor
    // (preview mientras el usuario mueve el mouse hacia el último día).
    const previewEnd = selectionEnd || (selectionStart && hoverDate ? hoverDate : null);
    let rangeLo = selectionStart;
    let rangeHi = previewEnd;
    if (rangeLo && rangeHi && rangeHi < rangeLo) { const t = rangeLo; rangeLo = rangeHi; rangeHi = t; }

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
            // Primer clic: inicia un nuevo rango
            setSelectionStart(dateStr);
            setSelectionEnd(null);
            setHoverDate(null);
        } else {
            // Segundo clic: cierra el rango (ordenándolo si se eligió hacia atrás)
            let lo = selectionStart;
            let hi = dateStr;
            if (hi < lo) { const tmp = lo; lo = hi; hi = tmp; }
            setSelectionStart(lo);
            setSelectionEnd(hi);
            setHoverDate(null);
            // Rellena automáticamente las fechas del formulario con el rango elegido
            if (onSelectRange) onSelectRange(lo, hi);
        }
    };

    const handleDeletePeriod = async (id: number) => {
        if (!hasPermission('asistencia.periodo.eliminar')) {
            toast.error('No tienes permiso para eliminar períodos de ausencia');
            return;
        }

        try {
            await api.delete(`/asistencias/periodos/${id}`);
            toast.success('Período eliminado');
            setDeletingPeriodId(null);
            
            // Refrescar datos locales
            const year = currentDate.getFullYear();
            const month = currentDate.getMonth() + 1;
            const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
            const lastDay = new Date(year, month, 0).getDate();
            const endDate = `${year}-${month.toString().padStart(2, '0')}-${lastDay}`;
            
            const [resAsist, resPer] = await Promise.all([
                api.get(`/asistencias/reporte?trabajador_id=${worker.id}&fecha_inicio=${startDate}&fecha_fin=${endDate}`),
                api.get(`/asistencias/periodos?trabajador_id=${worker.id}&activo=true&fecha_inicio=${startDate}&fecha_fin=${endDate}`)
            ]);
            
            const asistData = resAsist.data;
            setRecords(asistData.registros || []);
            setHolidays(asistData.feriados || []);
            setPeriodos(resPer.data?.data || []);

            if (onPeriodDeleted) onPeriodDeleted();
        } catch (error) {
            toast.error('Error al eliminar el período');
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
                <div className="grid grid-cols-7 gap-1 md:gap-1.5" onMouseLeave={() => setHoverDate(null)}>
                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                        <div key={day} className="text-center text-caption font-bold text-muted-foreground uppercase tracking-widest mb-2">
                            {day}
                        </div>
                    ))}

                    {Array.from({ length: startingDay }).map((_, i) => (
                        <div key={`empty-${i}`} className="h-10 md:h-14 bg-muted/30 rounded-xl border border-border/30" />
                    ))}

                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
                        const record = getRecordForDay(day);
                        const periodo = getPeriodForDay(day);
                        const estado = record ? estados.find(e => e.id === record.estado_id) : null;
                        const isWeekend = (startingDay + i) % 7 >= 5;
                        const holiday = getHolidayForDay(day);

                        const isStart = rangeLo === dateStr;
                        const isEnd = rangeHi === dateStr;
                        const isSelected = !!(rangeLo && rangeHi && dateStr >= rangeLo && dateStr <= rangeHi) || isStart;

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
                            buttonClass += "opacity-30 cursor-not-allowed bg-[repeating-linear-gradient(45deg,color-mix(in_srgb,var(--muted-foreground)_8%,transparent),color-mix(in_srgb,var(--muted-foreground)_8%,transparent)_5px,transparent_5px,transparent_10px)] border-border";
                        } else if (!periodo && !isSelected) {
                            buttonClass += "border-border hover:shadow-md hover:border-brand-primary/30";
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
                                {/* eslint-disable-next-line no-restricted-syntax -- celda del grid de calendario (color BD inline + buttonClass dinámico); no es un Button */}
                                <button
                                    onClick={() => !isOutOfRange && handleDateClick(dateStr)}
                                    onMouseEnter={() => { if (!isOutOfRange && selectionStart && !selectionEnd) setHoverDate(dateStr); }}
                                    disabled={isOutOfRange || readOnly}
                                    className={buttonClass}
                                    style={!isOutOfRange && !periodo && !isSelected ? {
                                        backgroundColor: estado
                                            ? (isDark ? `color-mix(in srgb, ${estado.color} 22%, var(--card))` : `${estado.color}05`)
                                            : (holiday
                                                ? (isDark ? 'color-mix(in srgb, var(--destructive) 20%, var(--card))' : 'color-mix(in srgb, var(--destructive) 8%, transparent)')
                                                : (isWeekend
                                                    ? 'var(--muted)'
                                                    : 'var(--card)'))
                                    } : undefined}
                                    title={buttonTitle}
                                >
                                    <span className={`text-caption font-medium ${estado || periodo || holiday || isSelected ? 'text-brand-dark' : 'text-muted-foreground'} mb-auto z-20`}>
                                        {day}
                                    </span>
                                    {estado && (
                                        <div
                                            className="px-1 py-0.5 rounded-lg text-micro md:text-micro font-bold w-full text-center truncate shadow-sm z-20"
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

            {/* Bloque inferior "Rango Seleccionado / Anular / Asignar Ausencia" eliminado.
                Ahora la asignación es automática al completar el 2º clic (useEffect abajo) y
                el rango seleccionado se muestra arriba junto al botón "Confirmar Período"
                del modal padre (vía las fechas del formulario). */}

            {showLegend && (
                <div className="mt-6 pt-6 border-t border-border">
                    <span className="text-caption uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-4 block text-center md:text-left">Nomenclaturas y Estados</span>
                    <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {estados.map(est => {
                            // Limpiar el nombre si viene con el código entre paréntesis
                            const cleanName = est.nombre.split(' (')[0];
                            return (
                                <div 
                                    key={est.id} 
                                    className="flex flex-col gap-1 p-3 rounded-2xl bg-card border border-border shadow-sm hover:border-brand-primary/20 transition-all group"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full shadow-inner shrink-0" style={{ backgroundColor: est.color }} />
                                        <span className="text-section font-bold text-brand-dark truncate">
                                            {cleanName}
                                        </span>
                                    </div>
                                    <span className="text-caption font-bold text-muted-foreground uppercase pl-4.5">
                                        {est.codigo}
                                    </span>
                                </div>
                            );
                        })}
                        <div className="flex flex-col gap-1 p-3 rounded-2xl bg-card border border-border shadow-sm hover:border-brand-primary/20 transition-all">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-destructive/20 border border-destructive/40 shadow-inner shrink-0" />
                                <span className="text-section font-bold text-brand-dark">Feriado</span>
                            </div>
                            <span className="text-caption font-bold text-muted-foreground uppercase pl-4.5">
                                FER
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {showActivePeriods && periodos.length > 0 && (
                <div className="mt-6">
                    <span className="text-caption uppercase font-black text-brand-dark/40 tracking-widest leading-none mb-3 block">Resumen de Períodos Activos</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {periodos.map(p => (
                            <div 
                                key={p.id} 
                                className="flex flex-col gap-2 p-3 rounded-2xl border border-border bg-card hover:bg-muted transition-all group"
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full shadow-inner" style={{ backgroundColor: p.estado_color || 'var(--muted-foreground)' }} />
                                        <span className="text-xs font-bold text-brand-dark">{p.estado_nombre || p.estado_codigo}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="px-2 py-0.5 rounded-lg bg-card border border-border text-caption font-black text-brand-dark tracking-tight">
                                            ACTIVO
                                        </div>
                                        {!readOnly && hasPermission('asistencia.periodo.eliminar') && (
                                            deletingPeriodId === p.id ? (
                                                <div className="flex items-center gap-1 shrink-0 animate-in fade-in slide-in-from-right-1 duration-200">
                                                    <Button
                                                        size="sm"
                                                        variant="ghost"
                                                        className="h-7 px-2 text-caption font-bold text-muted-foreground hover:bg-muted"
                                                        onClick={() => setDeletingPeriodId(null)}
                                                    >
                                                        No
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="destructive"
                                                        className="h-7 px-2 text-caption font-bold"
                                                        onClick={() => handleDeletePeriod(p.id)}
                                                    >
                                                        Sí, borrar
                                                    </Button>
                                                </div>
                                            ) : (
                                                <IconButton
                                                    size="sm"
                                                    onClick={() => setDeletingPeriodId(p.id)}
                                                    aria-label="Eliminar período"
                                                    title="Eliminar período"
                                                    className="rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                    icon={<Trash2 className="h-3.5 w-3.5" />}
                                                />
                                            )
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 text-label font-semibold text-muted-foreground">
                                    <CalendarRange className="h-3 w-3" />
                                    <span>
                                        {p.fecha_inicio.split('T')[0].split('-').reverse().join('/')}
                                        <span className="mx-1.5 opacity-40">—</span>
                                        {p.fecha_fin.split('T')[0].split('-').reverse().join('/')}
                                    </span>
                                </div>

                                {p.observacion && (
                                    <div className="mt-1 p-2 rounded-xl bg-card/60 border border-border/50 text-label text-muted-foreground italic flex items-start gap-1.5">
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

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Loader2, Calendar as CalendarIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import api from '../../services/api';
import type { Trabajador, EstadoAsistencia, Asistencia } from '../../types/entities';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    worker: Trabajador | null;
    estados: EstadoAsistencia[];
}

export const WorkerCalendarModal: React.FC<Props> = ({ isOpen, onClose, worker, estados }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [loading, setLoading] = useState(false);
    const [records, setRecords] = useState<Asistencia[]>([]);

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

                const res = await api.get(`/asistencias/reporte?trabajador_id=${worker.id}&fecha_inicio=${startDate}&fecha_fin=${endDate}`);
                setRecords(res.data || []);
            } catch (error) {
                console.error('Error fetching calendar data', error);
            } finally {
                setLoading(false);
            }
        };

        fetchMonthData();
    }, [isOpen, worker, currentDate]);

    if (!isOpen || !worker) return null;

    const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay(); // 0 is Sunday
    // Adjust so Monday is 0, Sunday is 6
    const startingDay = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    const navigateMonth = (offset: number) => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
    };

    const getRecordForDay = (day: number) => {
        const dateStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
        return records.find(r => r.fecha.startsWith(dateStr));
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-lg border border-white/20 overflow-hidden flex flex-col max-h-[90vh]"
                >
                    <div className="flex items-center justify-between p-5 border-b border-[#E8E8ED]">
                        <div>
                            <h2 className="text-xl font-bold text-[#1D1D1F] flex items-center gap-2">
                                <CalendarIcon className="h-5 w-5 text-[#0071E3]" />
                                Calendario Mensual
                            </h2>
                            <p className="text-sm text-[#6E6E73] mt-1">
                                {worker.nombres} {worker.apellido_paterno} · {worker.rut}
                            </p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={onClose}>
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    <div className="p-6 overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-[#1D1D1F]">
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
                                <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-7 gap-1.5">
                                {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(day => (
                                    <div key={day} className="text-center text-[10px] font-bold text-[#86868B] uppercase tracking-widest mb-2">
                                        {day}
                                    </div>
                                ))}

                                {Array.from({ length: startingDay }).map((_, i) => (
                                    <div key={`empty-${i}`} className="h-14 bg-[#F5F5F7]/30 rounded-xl border border-[#E8E8ED]/30" />
                                ))}

                                {Array.from({ length: daysInMonth }).map((_, i) => {
                                    const day = i + 1;
                                    const record = getRecordForDay(day);
                                    const estado = record ? estados.find(e => e.id === record.estado_id) : null;
                                    const isWeekend = (startingDay + i) % 7 >= 5;

                                    return (
                                        <div
                                            key={day}
                                            className="h-14 p-1.5 rounded-xl border border-[#E8E8ED] flex flex-col items-center relative hover:shadow-md hover:border-[#0071E3]/30 transition-all bg-white group"
                                            style={{ backgroundColor: estado ? `${estado.color}05` : (isWeekend ? '#F5F5F7/50' : '#FFFFFF') }}
                                        >
                                            <span className={`text-[10px] font-medium ${estado ? 'text-[#1D1D1F]' : 'text-[#86868B]'} mb-auto`}>
                                                {day}
                                            </span>
                                            {estado && (
                                                <div
                                                    className="px-1.5 py-0.5 rounded-lg text-[9px] font-bold w-full text-center truncate shadow-sm"
                                                    style={{ backgroundColor: `${estado.color}15`, color: estado.color }}
                                                    title={estado.nombre}
                                                >
                                                    {estado.codigo}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Legend */}
                        <div className="mt-6 flex flex-wrap gap-3 justify-center">
                            {estados.map(est => (
                                <div key={est.id} className="flex items-center gap-1.5 text-xs text-[#6E6E73]">
                                    <span
                                        className="w-2.5 h-2.5 rounded-full"
                                        style={{ backgroundColor: est.color }}
                                    />
                                    {est.nombre}
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

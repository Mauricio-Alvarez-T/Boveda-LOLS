import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    CheckSquare,
    Users,
    Save,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Search,
    Calendar,
    Clock,
    BarChart3,
    MessageCircle,
    CalendarDays,
    FileDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { TimeStepperInput } from '../components/ui/TimeStepperInput';
import { WorkerCalendarModal } from '../components/attendance/WorkerCalendarModal';
import api from '../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia, TipoAusencia, ConfiguracionHorario } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useObra } from '../context/ObraContext';
import { useSetPageHeader } from '../context/PageHeaderContext';

const AttendancePage: React.FC = () => {
    const { selectedObra } = useObra();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [horariosObra, setHorariosObra] = useState<ConfiguracionHorario[]>([]);
    const [absenceTypes, setAbsenceTypes] = useState<TipoAusencia[]>([]);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
    const [calendarWorker, setCalendarWorker] = useState<Trabajador | null>(null);

    // Get the default "Presente" state (es_presente flag)
    const defaultEstado = useMemo(() =>
        estados.find(e => e.codigo === 'P') || estados[0],
        [estados]
    );

    // Load absence types and attendance states on mount
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const [ausRes, estRes] = await Promise.all([
                    api.get<ApiResponse<TipoAusencia[]>>('/tipos-ausencia?activo=true'),
                    api.get<ApiResponse<EstadoAsistencia[]>>('/asistencias/estados')
                ]);
                setAbsenceTypes(ausRes.data.data);
                setEstados(estRes.data.data);
            } catch (err) {
                console.error('Error loading metadata');
            }
        };
        fetchMeta();
    }, []);

    const fetchAttendanceInfo = useCallback(async () => {
        if (!selectedObra || !defaultEstado) return;
        setLoading(true);
        try {
            const [workersRes, attendanceRes, schedulesRes] = await Promise.all([
                api.get<ApiResponse<Trabajador[]>>(`/trabajadores?obra_id=${selectedObra.id}&activo=true`),
                api.get<ApiResponse<Asistencia[]>>(`/asistencias/obra/${selectedObra.id}?fecha=${date}`),
                api.get<ApiResponse<ConfiguracionHorario[]>>(`/config-horarios/obra/${selectedObra.id}`)
            ]);

            const workerList = workersRes.data.data;
            setWorkers(workerList);
            const existing = attendanceRes.data.data;
            setHorariosObra(schedulesRes.data.data || []);

            const newAttendance: Record<number, Partial<Asistencia>> = {};
            const dowMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
            const dayIndex = new Date(date + 'T12:00:00').getDay();
            const dayStr = dowMap[dayIndex];
            const currentSchedule = schedulesRes.data.data.find(h => h.dia_semana === dayStr);

            workerList.forEach(w => {
                const record = existing.find(a => a.trabajador_id === w.id);
                if (record) {
                    newAttendance[w.id] = record;
                } else {
                    const newRecord: Partial<Asistencia> = {
                        trabajador_id: w.id,
                        obra_id: selectedObra.id,
                        fecha: date,
                        estado_id: defaultEstado.id,
                        tipo_ausencia_id: null,
                        observacion: '',
                        hora_entrada: null,
                        hora_salida: null,
                        hora_colacion_inicio: null,
                        hora_colacion_fin: null,
                        horas_extra: 0,
                        es_sabado: dayIndex === 6
                    };

                    // Auto-fill default times if default state is present
                    if (defaultEstado.es_presente && currentSchedule) {
                        newRecord.hora_entrada = currentSchedule.hora_entrada.substring(0, 5);
                        newRecord.hora_salida = currentSchedule.hora_salida.substring(0, 5);
                        newRecord.hora_colacion_inicio = currentSchedule.hora_colacion_inicio.substring(0, 5);
                        newRecord.hora_colacion_fin = currentSchedule.hora_colacion_fin.substring(0, 5);
                    }
                    newAttendance[w.id] = newRecord;
                }
            });
            setAttendance(newAttendance);
        } catch (err) {
            toast.error('Error al cargar datos de asistencia');
        } finally {
            setLoading(false);
        }
    }, [selectedObra, date, defaultEstado]);

    useEffect(() => {
        if (defaultEstado && selectedObra) {
            fetchAttendanceInfo();
        }
    }, [fetchAttendanceInfo, defaultEstado, selectedObra]);

    const updateAttendance = (workerId: number, data: Partial<Asistencia>) => {
        setAttendance(prev => ({
            ...prev,
            [workerId]: { ...prev[workerId], ...data }
        }));
    };

    const latestData = React.useRef({ selectedObra, date, workers, attendance, estados });
    React.useEffect(() => {
        latestData.current = { selectedObra, date, workers, attendance, estados };
    }, [selectedObra, date, workers, attendance, estados]);

    const handleSave = useCallback(async () => {
        const { selectedObra: currentObra, date: currentDate, workers: currentWorkers, attendance: currentAttendance } = latestData.current;
        if (!currentObra) return;
        setSaving(true);
        try {
            const payload = {
                obra_id: currentObra.id,
                registros: currentWorkers.map(w => ({
                    trabajador_id: w.id,
                    obra_id: currentObra.id,
                    fecha: currentDate,
                    estado_id: currentAttendance[w.id]?.estado_id || null,
                    observacion: currentAttendance[w.id]?.observacion || '',
                    hora_entrada: currentAttendance[w.id]?.hora_entrada || null,
                    hora_salida: currentAttendance[w.id]?.hora_salida || null,
                    hora_colacion_inicio: currentAttendance[w.id]?.hora_colacion_inicio || null,
                    hora_colacion_fin: currentAttendance[w.id]?.hora_colacion_fin || null,
                    horas_extra: currentAttendance[w.id]?.horas_extra || 0,
                    es_sabado: currentAttendance[w.id]?.es_sabado || false
                }))
            };

            await api.post(`/asistencias/bulk/${currentObra.id}`, payload);
            toast.success('Asistencia guardada correctamente');
            fetchAttendanceInfo();
        } catch (error) {
            console.error('Error saving attendance', error);
            toast.error('Error al guardar la asistencia');
        } finally {
            setSaving(false);
        }
    }, [fetchAttendanceInfo]);

    // Handle Excel Export
    const handleExportExcel = useCallback(async () => {
        const { selectedObra: currentObra, date: currentDate } = latestData.current;
        if (!currentObra) return;
        try {
            const [year, month] = currentDate.split('-');
            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

            toast.info('Generando reporte Excel...', { id: 'excel-export' });

            const response = await api.get(`/asistencias/exportar/excel?obra_id=${currentObra.id}&fecha_inicio=${firstDay}&fecha_fin=${lastDay}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Asistencia_${currentObra.nombre.replace(/\s+/g, '_')}_${year}_${month}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
        } catch (error) {
            console.error('Error exportando Excel', error);
            toast.error('Error al generar el reporte', { id: 'excel-export' });
        }
    }, []);

    // Handle WhatsApp Share
    const handleShareWhatsApp = useCallback(async () => {
        const { selectedObra: currentObra, date: currentDate, workers: currentWorkers, attendance: currentAttendance, estados: currentEstados } = latestData.current;
        if (!currentObra) return;

        await handleExportExcel();
        toast.success('Excel generado. Solo arrástralo o adjúntalo al chat de WhatsApp que se abrirá', {
            duration: 6000,
            id: 'whatsapp-instruction'
        });

        const dateStr = currentDate.split('-').reverse().join('-');
        let text = `Buenas tardes\n`;
        text += `Adjunto asistencia de ${currentObra.nombre} del día ${dateStr}.\n\n`;

        const total = currentWorkers.length;
        const presentes = Object.values(currentAttendance).filter(a => {
            const est = currentEstados.find(e => e.id === a.estado_id);
            return est?.es_presente;
        }).length;

        const counts: Record<string, number> = {
            'A': presentes,
            'F': 0,
            'V': 0,
            'LM': 0,
            '1/2': 0,
            'TO': 0
        };

        Object.values(currentAttendance).forEach(a => {
            const est = currentEstados.find(e => e.id === a.estado_id);
            if (!est) return;
            if (!est.es_presente) {
                if (est.codigo === 'A') counts['F']++;
                else if (['V', 'LM', '1/2', 'TO'].includes(est.codigo)) {
                    counts[est.codigo]++;
                }
            }
        });

        text += `Total: ${total}\n`;
        text += `A: ${counts['A'].toString().padStart(2, '0')}\n`;
        text += `F: ${counts['F'].toString().padStart(2, '0')}\n`;
        text += `V: ${counts['V'].toString().padStart(2, '0')}\n`;
        text += `LM: ${counts['LM'].toString().padStart(2, '0')}\n`;
        text += `1/2: ${counts['1/2'].toString().padStart(2, '0')}\n`;
        text += `TO: ${counts['TO'].toString().padStart(2, '0')}\n\n`;

        const categorias = [
            { key: 'obra', label: `Obra ${currentObra.nombre}:` },
            { key: 'operaciones', label: 'Operaciones:' },
            { key: 'rotativo', label: 'Personal rotativo:' }
        ];

        categorias.forEach(cat => {
            const workersInCat = currentWorkers.filter(w => (w.categoria_reporte || 'obra') === cat.key);
            if (workersInCat.length === 0) return;

            text += `${cat.label}\n`;
            const cargoCounts: Record<string, number> = {};
            workersInCat.forEach(w => {
                const cargo = w.cargo_nombre || 'Sin Cargo';
                cargoCounts[cargo] = (cargoCounts[cargo] || 0) + 1;
            });

            Object.keys(cargoCounts).sort().forEach(cargo => {
                text += `${cargoCounts[cargo].toString().padStart(2, '0')} ${cargo}\n`;
            });
            text += `\n`;
        });

        const excepciones = currentWorkers.filter(w => {
            const state = currentAttendance[w.id];
            if (!state || !state.estado_id) return false;
            const est = currentEstados.find(e => e.id === state.estado_id);
            return est && !est.es_presente;
        });

        if (excepciones.length > 0) {
            text += `A&M: ${excepciones.length.toString().padStart(2, '0')}\n\n`;
        }

        text += `Saludos cordiales\n\n`;
        text += `_Este mensaje se genero usando Bóveda lols_`;

        const encodedText = encodeURIComponent(text);
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
    }, [handleExportExcel]);

    // Navigate date
    const navigateDate = (offset: number) => {
        const d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + offset);
        setDate(d.toISOString().split('T')[0]);
    };

    // Format date for display
    const formattedDate = useMemo(() => {
        const d = new Date(date + 'T12:00:00');
        const options: Intl.DateTimeFormatOptions = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const formatted = d.toLocaleDateString('es-CL', options);
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }, [date]);

    const dayOfWeek = useMemo(() => {
        return new Date(date + 'T12:00:00').getDay();
    }, [date]);

    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    // Filtered workers
    const filteredWorkers = useMemo(() => {
        if (!searchQuery) return workers;
        const q = searchQuery.toLowerCase();
        return workers.filter(w =>
            `${w.nombres} ${w.apellido_paterno}`.toLowerCase().includes(q) ||
            w.rut.toLowerCase().includes(q)
        );
    }, [workers, searchQuery]);

    // Summary stats
    const summary = useMemo(() => {
        const counts: Record<string, { count: number; estado: EstadoAsistencia }> = {};
        estados.forEach(e => { counts[e.id] = { count: 0, estado: e }; });

        Object.values(attendance).forEach(a => {
            if (a.estado_id && counts[a.estado_id]) {
                counts[a.estado_id].count++;
            }
        });

        const total = Object.keys(attendance).length;
        const presentes = Object.values(counts)
            .filter(c => c.estado.es_presente)
            .reduce((sum, c) => sum + c.count, 0);

        return {
            total,
            presentes,
            porcentaje: total > 0 ? Math.round((presentes / total) * 100) : 0,
            desglose: Object.values(counts).filter(c => c.count > 0)
        };
    }, [attendance, estados]);

    const headerTitle = useMemo(() => (
        selectedObra ? (
            <div className="flex items-center gap-3">
                <CheckSquare className="h-6 w-6 text-[#0071E3]" />
                <div className="flex flex-col leading-tight">
                    <h1 className="text-lg font-bold text-[#1D1D1F]">Control de Asistencia</h1>
                    <p className="text-[#6E6E73] text-xs">
                        {selectedObra.nombre} <span className="mx-1.5">•</span> <span className="font-medium text-[#1D1D1F]">{formattedDate}</span>
                    </p>
                </div>
            </div>
        ) : (
            <div className="flex items-center gap-3">
                <CheckSquare className="h-6 w-6 text-[#A1A1A6]" />
                <h1 className="text-lg font-bold text-[#1D1D1F]">Control de Asistencia</h1>
            </div>
        )
    ), [selectedObra, formattedDate]);

    const headerActions = useMemo(() => (
        selectedObra ? (
            <div className="flex items-center gap-2">
                <Button
                    onClick={handleShareWhatsApp}
                    variant="glass"
                    className="text-[#6E6E73] hover:text-[#34C759]"
                    title="Compartir Resumen por WhatsApp"
                    leftIcon={<MessageCircle className="h-4 w-4" />}
                    size="sm"
                >
                    <span className="hidden sm:inline">WhatsApp</span>
                </Button>
                <Button
                    onClick={handleExportExcel}
                    variant="outline"
                    title="Exportar Asistencia del Mes actual"
                    leftIcon={<FileDown className="h-4 w-4" />}
                    size="sm"
                >
                    <span className="hidden sm:inline">Reporte Mensual</span>
                </Button>
                <Button
                    onClick={handleSave}
                    isLoading={saving}
                    disabled={loading || workers.length === 0}
                    leftIcon={<Save className="h-4 w-4" />}
                    size="sm"
                >
                    Guardar Asistencia
                </Button>
            </div>
        ) : null
    ), [selectedObra, handleShareWhatsApp, handleExportExcel, handleSave, saving, loading, workers.length]);

    useSetPageHeader(headerTitle, headerActions);

    if (!selectedObra) {
        return (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-14 w-14 bg-[#F5F5F7] rounded-full flex items-center justify-center mb-4">
                    <CheckSquare className="h-7 w-7 text-[#6E6E73]" />
                </div>
                <h2 className="text-lg font-semibold text-[#1D1D1F]">Selecciona una Obra</h2>
                <p className="text-[#6E6E73] mt-2 max-w-md text-sm">
                    Para gestionar la asistencia, primero debes seleccionar una obra en el menú superior.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="flex items-center gap-2">
                        <Button variant="glass" size="icon" className="h-9 w-9" onClick={() => navigateDate(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6E6E73]" />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="pl-9 pr-3 py-2 bg-[#F5F5F7] border border-[#D2D2D7] rounded-xl text-sm text-[#1D1D1F] font-medium focus:outline-none focus:border-[#0071E3] transition-colors"
                            />
                        </div>
                        <Button variant="glass" size="icon" className="h-9 w-9" onClick={() => navigateDate(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="glass"
                            size="sm"
                            className="text-xs"
                            onClick={() => setDate(new Date().toISOString().split('T')[0])}
                        >
                            Hoy
                        </Button>
                    </div>

                    <div className="hidden md:block h-8 w-px bg-[#D2D2D7]" />

                    <div className="flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F5F5F7] rounded-full">
                            <Users className="h-3.5 w-3.5 text-[#6E6E73]" />
                            <span className="text-xs font-bold text-[#1D1D1F]">{summary.total}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#34C759]/8 rounded-full">
                            <BarChart3 className="h-3.5 w-3.5 text-[#34C759]" />
                            <span className="text-xs font-bold text-[#34C759]">{summary.porcentaje}%</span>
                        </div>
                        {summary.desglose.map(({ estado, count }) => (
                            <span
                                key={estado.id}
                                className="text-[10px] font-bold px-2.5 py-1 rounded-full"
                                style={{
                                    backgroundColor: `${estado.color}14`,
                                    color: estado.color
                                }}
                            >
                                {estado.codigo}: {count}
                            </span>
                        ))}
                    </div>
                </div>

                {(isSaturday || isSunday) && (
                    <div className={cn(
                        "mt-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2",
                        isSunday ? "bg-[#FF3B30]/8 text-[#FF3B30]" : "bg-[#FF9F0A]/8 text-[#FF9F0A]"
                    )}>
                        <Clock className="h-3.5 w-3.5" />
                        {isSunday ? "Domingo — no se debe registrar asistencia" : "Sábado — las horas trabajadas se registran como extras"}
                    </div>
                )}
            </div>

            <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#A1A1A6]" />
                <input
                    type="text"
                    placeholder="Buscar trabajador por nombre o RUT..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-[#D2D2D7] rounded-xl text-sm text-[#1D1D1F] placeholder-[#A1A1A6] focus:outline-none focus:border-[#0071E3] transition-colors"
                />
            </div>

            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-[#0071E3]" />
                    <p className="text-[#6E6E73] mt-4 text-sm">Cargando nómina...</p>
                </div>
            ) : workers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#D2D2D7] py-20 text-center">
                    <Users className="h-10 w-10 text-[#A1A1A6] mx-auto mb-4 opacity-40" />
                    <p className="text-[#6E6E73] text-sm">No hay trabajadores asignados a esta obra.</p>
                </div>
            ) : (
                <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                    <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto] gap-4 px-5 py-3 bg-[#F5F5F7] border-b border-[#E8E8ED] text-xs font-semibold text-[#6E6E73] uppercase tracking-wider items-center">
                        <span>Trabajador</span>
                        <span className="w-[320px] text-center">Estado</span>
                        <span className="w-[180px] text-center">Detalle / Calendario</span>
                        <span className="w-[60px] text-center">H.E.</span>
                    </div>

                    <AnimatePresence>
                        {filteredWorkers.map((worker, idx) => {
                            const state = attendance[worker.id] || {};
                            const currentEstado = estados.find(e => e.id === state.estado_id);
                            const isExpanded = expandedWorkerId === worker.id;
                            const isNotPresent = currentEstado && !currentEstado.es_presente;

                            return (
                                <motion.div
                                    key={worker.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: idx * 0.01 }}
                                    className={cn(
                                        "border-b border-[#F0F0F0] last:border-b-0 transition-colors",
                                        isNotPresent && "bg-[#FEF8F8]"
                                    )}
                                >
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 md:gap-4 px-4 md:px-5 py-3 items-center">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div
                                                className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                                style={{ backgroundColor: currentEstado?.color || '#34C759' }}
                                            >
                                                {worker.nombres.charAt(0)}{worker.apellido_paterno.charAt(0)}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-[#1D1D1F] truncate">
                                                    {worker.apellido_paterno}, {worker.nombres}
                                                </p>
                                                <p className="text-[10px] text-[#6E6E73]">
                                                    {worker.rut}
                                                    {worker.cargo_nombre && <> · <span className="text-[#0071E3]">{worker.cargo_nombre}</span></>}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-1 w-full md:w-[320px] overflow-x-auto">
                                            {estados.map((est) => {
                                                const isActive = state.estado_id === est.id;
                                                return (
                                                    <button
                                                        key={est.id}
                                                        onClick={() => {
                                                            const updates: Partial<Asistencia> = {
                                                                estado_id: est.id,
                                                                tipo_ausencia_id: est.es_presente ? null : state.tipo_ausencia_id,
                                                                es_sabado: isSaturday
                                                            };
                                                            if (est.es_presente && (!state.hora_entrada || state.hora_entrada === '')) {
                                                                const dowMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
                                                                const dayIndex = new Date(date + 'T12:00:00').getDay();
                                                                const dayStr = dowMap[dayIndex];
                                                                const currentSchedule = horariosObra.find(h => h.dia_semana === dayStr);

                                                                if (currentSchedule) {
                                                                    updates.hora_entrada = currentSchedule.hora_entrada.substring(0, 5);
                                                                    updates.hora_salida = currentSchedule.hora_salida.substring(0, 5);
                                                                    updates.hora_colacion_inicio = currentSchedule.hora_colacion_inicio.substring(0, 5);
                                                                    updates.hora_colacion_fin = currentSchedule.hora_colacion_fin.substring(0, 5);
                                                                }
                                                            }
                                                            updateAttendance(worker.id, updates);
                                                            if (!est.es_presente && expandedWorkerId !== worker.id) {
                                                                setExpandedWorkerId(worker.id);
                                                            }
                                                        }}
                                                        className={cn(
                                                            "px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap border",
                                                            isActive ? "text-white border-transparent shadow-sm" : "bg-white border-[#E8E8ED] text-[#6E6E73] hover:bg-[#F5F5F7]"
                                                        )}
                                                        style={isActive ? { backgroundColor: est.color, borderColor: est.color } : undefined}
                                                    >
                                                        {est.codigo}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="w-full md:w-[180px] flex items-center justify-between gap-2">
                                            <div className="flex-1">
                                                {isNotPresent ? (
                                                    <select
                                                        className="w-full bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg px-2 py-1.5 text-[10px] text-[#1D1D1F] focus:outline-none focus:border-[#0071E3]"
                                                        value={state.tipo_ausencia_id || ''}
                                                        onChange={(e) => updateAttendance(worker.id, {
                                                            tipo_ausencia_id: e.target.value ? Number(e.target.value) : null
                                                        })}
                                                    >
                                                        <option value="">Causa...</option>
                                                        {absenceTypes.map(t => (
                                                            <option key={t.id} value={t.id}>{t.nombre}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <button
                                                        onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)}
                                                        className="text-[10px] text-[#0071E3] font-medium hover:underline w-full text-center"
                                                    >
                                                        {isExpanded ? 'Cerrar' : 'Detalle'}
                                                    </button>
                                                )}
                                            </div>
                                            <button
                                                onClick={() => setCalendarWorker(worker)}
                                                className="p-1.5 rounded-full text-[#6E6E73] border border-[#D2D2D7] hover:bg-[#F5F5F7] hover:text-[#0071E3] transition-colors flex-shrink-0"
                                            >
                                                <CalendarDays className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="w-full md:w-[60px]">
                                            <input
                                                type="number"
                                                min="0"
                                                max="24"
                                                step="0.5"
                                                placeholder="0"
                                                className="w-full bg-[#F5F5F7] border border-[#D2D2D7] rounded-lg px-2 py-1.5 text-[10px] text-center text-[#1D1D1F] focus:outline-none focus:border-[#0071E3]"
                                                value={state.horas_extra || ''}
                                                onChange={(e) => updateAttendance(worker.id, {
                                                    horas_extra: parseFloat(e.target.value) || 0
                                                })}
                                            />
                                        </div>
                                    </div>

                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden bg-[#FAFAFA]"
                                            >
                                                <div className="px-5 pb-4 pt-1 grid grid-cols-1 md:grid-cols-5 gap-3">
                                                    <TimeStepperInput label="Entrada" value={state.hora_entrada || ''} onChange={(val) => updateAttendance(worker.id, { hora_entrada: val || null })} />
                                                    <TimeStepperInput label="Salida" value={state.hora_salida || ''} onChange={(val) => updateAttendance(worker.id, { hora_salida: val || null })} />
                                                    <TimeStepperInput label="Colación Inicio" value={state.hora_colacion_inicio || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_inicio: val || null })} />
                                                    <TimeStepperInput label="Colación Fin" value={state.hora_colacion_fin || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_fin: val || null })} />
                                                    <div>
                                                        <label className="text-[9px] font-semibold text-[#6E6E73] uppercase block mb-1">Nota</label>
                                                        <input
                                                            type="text"
                                                            placeholder="..."
                                                            className="w-full bg-white border border-[#D2D2D7] rounded-lg px-2 py-1.5 text-xs text-[#1D1D1F] focus:outline-none focus:border-[#0071E3]"
                                                            value={state.observacion || ''}
                                                            onChange={(e) => updateAttendance(worker.id, { observacion: e.target.value })}
                                                        />
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            <WorkerCalendarModal
                isOpen={!!calendarWorker}
                onClose={() => setCalendarWorker(null)}
                worker={calendarWorker}
                estados={estados}
            />
        </div>
    );
};

export default AttendancePage;

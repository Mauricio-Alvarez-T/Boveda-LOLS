import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    CheckSquare,
    Users,
    Save,
    Loader2,
    ChevronLeft,
    ChevronRight,
    Calendar,
    Clock,
    BarChart3,
    Send,
    CalendarDays,
    CalendarRange,
    FileDown,
    ChevronDown,
    FilePlus,
    ArrowLeft
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { TimeStepperInput } from '../components/ui/TimeStepperInput';
import { WorkerCalendarModal } from '../components/attendance/WorkerCalendarModal';
import { PeriodAssignModal } from '../components/attendance/PeriodAssignModal';
import { Modal } from '../components/ui/Modal';
import { Select } from '../components/ui/Select';
import { WorkerForm } from '../components/workers/WorkerForm';
import { DocumentUploader } from '../components/documents/DocumentUploader';
import { DocumentList } from '../components/documents/DocumentList';
import WorkerLink from '../components/workers/WorkerLink';
import WorkerQuickView from '../components/workers/WorkerQuickView';
import api from '../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia, ConfiguracionHorario, Feriado } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useObra } from '../context/ObraContext';
import { useStandardHeader } from '../components/ui/PageHeader';
import { SearchBar } from '../components/ui/SearchBar';
import { useAuth } from '../context/AuthContext';
import { RequirePermission } from '../components/auth/RequirePermission';

const AttendancePage: React.FC = () => {
    const { selectedObra } = useObra();
    const { checkPermission } = useAuth();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [horariosObra, setHorariosObra] = useState<ConfiguracionHorario[]>([]);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [feriadoActual, setFeriadoActual] = useState<Feriado | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedWorkerId, setExpandedWorkerId] = useState<number | null>(null);
    const [calendarWorker, setCalendarWorker] = useState<Trabajador | null>(null);

    const [quickViewId, setQuickViewId] = useState<number | null>(null);

    // States for Global Report Month/Year selection
    const [reportMonth, setReportMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());

    // Modal states for QuickView actions
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [markedRows, setMarkedRows] = useState<Set<number>>(new Set());

    const [periodSelection, setPeriodSelection] = useState<{ start: string; end: string } | null>(null);
    const [periodModalWorker, setPeriodModalWorker] = useState<Trabajador | null>(null);

    const handleCalendarSelectRange = (start: string, end: string) => {
        setPeriodSelection({ start, end });
        setCalendarWorker(null); // Close calendar
        setPeriodModalWorker(calendarWorker); // Open period modal
    };
    const toggleMarkedRow = (index: number) => {
        setMarkedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // Get the default "Asiste" state (es_presente flag)
    const defaultEstado = useMemo(() =>
        estados.find(e => e.codigo === 'A') || estados.find(e => e.es_presente) || estados[0],
        [estados]
    );

    // Load absence types and attendance states on mount
    useEffect(() => {
        const fetchMeta = async () => {
            try {
                const estRes = await api.get<ApiResponse<EstadoAsistencia[]>>('/asistencias/estados');
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
                api.get<ApiResponse<{ registros: Asistencia[], feriado: Feriado }>>(`/asistencias/obra/${selectedObra.id}?fecha=${date}`),
                api.get<ApiResponse<ConfiguracionHorario[]>>(`/config-horarios/obra/${selectedObra.id}`)
            ]);

            // Filtrar explícitamente a los trabajadores finiquitados por precaución adicional
            const workerList = workersRes.data.data.filter(w => Boolean(w.activo) !== false);
            setWorkers(workerList);
            
            const attendanceData = attendanceRes.data.data;
            const existing = attendanceData.registros;
            setFeriadoActual(attendanceData.feriado || null);
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

    const toggleFeriado = async () => {
        if (!selectedObra || !checkPermission('asistencia', 'puede_editar')) return;
        
        if (feriadoActual) {
            if (window.confirm(`¿Seguro que deseas quitar el feriado "${feriadoActual.nombre}"?`)) {
                try {
                    await api.delete(`/feriados/${feriadoActual.id}`);
                    toast.success('Día habilitado (Feriado eliminado)');
                    fetchAttendanceInfo();
                } catch (err) {
                    toast.error('Error al quitar feriado');
                }
            }
        } else {
            const nombre = window.prompt('Ingrese el nombre del feriado:', 'Feriado Local');
            if (nombre) {
                try {
                    await api.post('/feriados', {
                        fecha: date,
                        nombre: nombre,
                        tipo: 'nacional',
                        irrenunciable: false
                    });
                    toast.success(`Día marcado como feriado: ${nombre}`);
                    fetchAttendanceInfo();
                } catch (err) {
                    toast.error('Error al marcar feriado');
                }
            }
        }
    };

    const updateAttendance = (workerId: number, data: Partial<Asistencia>) => {
        setAttendance(prev => ({
            ...prev,
            [workerId]: { ...prev[workerId], ...data }
        }));
    };

    const latestData = React.useRef({ selectedObra, date, workers, attendance, estados, reportMonth, reportYear });
    React.useEffect(() => {
        latestData.current = { selectedObra, date, workers, attendance, estados, reportMonth, reportYear };
    }, [selectedObra, date, workers, attendance, estados, reportMonth, reportYear]);

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
    const handleExportExcel = useCallback(async (returnFile = false) => {
        const { 
            selectedObra: currentObra, 
            date: currentDate, 
            reportMonth: currentMonth, 
            reportYear: currentYear 
        } = latestData.current;

        try {
            // Use specific report month/year if no obra is selected, otherwise use current date's month
            let year, month;
            if (!currentObra) {
                year = currentYear;
                month = currentMonth;
            } else {
                [year, month] = currentDate.split('-');
            }

            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

            if (!returnFile) toast.info('Generando reporte Excel...', { id: 'excel-export' });

            const obraIdParam = currentObra ? `obra_id=${currentObra.id}` : 'obra_id=';
            const response = await api.get(`/asistencias/exportar/excel?${obraIdParam}&fecha_inicio=${firstDay}&fecha_fin=${lastDay}`, {
                responseType: 'blob'
            });

            const fileName = currentObra ? `Asistencia_${currentObra.nombre.replace(/\s+/g, '_')}` : 'Asistencia_Todas_las_Obras';
            const finalFileName = `${fileName}_${year}_${month}.xlsx`;

            if (returnFile) {
                return new File([response.data as Blob], finalFileName, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            }

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', finalFileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
            return null;
        } catch (error) {
            console.error('Error exportando Excel', error);
            if (!returnFile) toast.error('Error al generar el reporte', { id: 'excel-export' });
            return null;
        }
    }, []);

    // Robust copy to clipboard utility for mobile browsers
    const copyToClipboard = useCallback(async (text: string) => {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (e) {}
        
        // Fallback for older mobile browsers or security restrictions
        try {
            const textArea = document.createElement("textarea");
            textArea.value = text;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            textArea.style.top = "0";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            return successful;
        } catch (err) {
            return false;
        }
    }, []);

    // Handle WhatsApp Share
    const handleShareWhatsApp = useCallback(async () => {
        const { selectedObra: currentObra, date: currentDate, workers: currentWorkers, attendance: currentAttendance, estados: currentEstados } = latestData.current;
        if (!currentObra) return;

        toast.info('Preparando reporte...', { id: 'whatsapp-share', duration: 2000 });

        const dateStr = currentDate.split('-').reverse().join('-');
        let text = `Buenas tardes\n`;
        text += `Adjunto asistencia de ${currentObra.nombre} del día ${dateStr}.\n\n`;

        const total = currentWorkers.length;
        const counts: Record<string, number> = { 'A': 0, 'F': 0, 'V': 0, 'LM': 0, 'JI': 0, 'TO': 0, 'AT': 0 };

        Object.values(currentAttendance).forEach(a => {
            const est = currentEstados.find(e => e.id === a.estado_id);
            if (!est) return;
            if (counts[est.codigo] !== undefined) counts[est.codigo]++;
        });

        text += `Total: ${total}\n`;
        text += `A: ${counts['A'].toString().padStart(2, '0')}\n`;
        text += `F: ${counts['F'].toString().padStart(2, '0')}\n`;
        text += `V: ${counts['V'].toString().padStart(2, '0')}\n`;
        text += `LM: ${counts['LM'].toString().padStart(2, '0')}\n`;
        text += `JI: ${counts['JI'].toString().padStart(2, '0')}\n`;
        text += `TO: ${counts['TO'].toString().padStart(2, '0')}\n`;
        if (counts['AT'] > 0) text += `AT: ${counts['AT'].toString().padStart(2, '0')}\n`;
        text += `\n`;

        const categorias = [
            { key: 'obra', label: `Obra ${currentObra.nombre}:` },
            { key: 'operaciones', label: 'Operaciones:' },
            { key: 'rotativo', label: 'Personal rotativo:' }
        ];

        categorias.forEach(cat => {
            const presentWorkersInCat = currentWorkers.filter(w => {
                const isCat = (w.categoria_reporte || 'obra') === cat.key;
                if (!isCat) return false;
                const state = currentAttendance[w.id];
                if (!state || !state.estado_id) return false;
                const est = currentEstados.find(e => e.id === state.estado_id);
                return est && est.es_presente;
            });
            if (presentWorkersInCat.length === 0) return;
            text += `${cat.label}\n`;
            const cargoCounts: Record<string, number> = {};
            presentWorkersInCat.forEach(w => {
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
            text += `A&M: ${excepciones.length.toString().padStart(2, '0')}\n`;
            excepciones.forEach(w => {
                 const state = currentAttendance[w.id];
                 const est = currentEstados.find(e => e.id === state?.estado_id);
                 text += `- ${w.apellido_paterno} (${est ? est.codigo : '?'})\n`;
            });
            text += `\n`;
        }

        text += `Saludos cordiales\n\n`;
        text += `_Este mensaje se genero usando Bóveda lols_`;

        try {
            // STEP 0: Immediate copy to clipboard
            await copyToClipboard(text);

            // 1. Generate the Excel file
            const excelFile = await handleExportExcel(true);
            
            if (!excelFile) {
                toast.error('Error: El servidor no pudo generar el archivo Excel.', { id: 'whatsapp-share' });
                return;
            }

            // 2. Mobile Logic (navigator.share)
            if (navigator.share) {
                // We show a toast WITH AN ACTION to ensure a "fresh user gesture"
                // This solves the "Permission Denied" error in Android/Safari
                toast.success('¡Reporte generado con éxito!', {
                    id: 'whatsapp-share',
                    description: 'Pulsa el botón para enviar a WhatsApp.',
                    duration: 15000,
                    action: {
                        label: 'COMPARTIR AHORA',
                        onClick: async () => {
                            try {
                                const canShareFile = navigator.canShare && navigator.canShare({ files: [excelFile] });
                                
                                await navigator.share({
                                    files: canShareFile ? [excelFile] : undefined,
                                    title: `Asistencia ${currentObra.nombre} - ${dateStr}`,
                                    // text: text // Note: We omit text here to avoid WhatsApp ignoring the file on Android
                                });
                                
                                toast.success('Enviado. Recuerda que el resumen está en tu portapapeles.');
                            } catch (shareError: any) {
                                if (shareError.name !== 'AbortError') {
                                    console.error('Share failed', shareError);
                                    // Final fallback if share fails even with fresh gesture
                                    const encodedText = encodeURIComponent(text);
                                    window.open(`https://wa.me/?text=${encodedText}`, '_blank');
                                }
                            }
                        }
                    }
                });
            } else {
                // 3. Fallback for Desktop (Win/Mac)
                const url = window.URL.createObjectURL(excelFile as Blob);
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', excelFile?.name || 'asistencia.xlsx');
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url);

                const encodedText = encodeURIComponent(text);
                window.open(`https://wa.me/?text=${encodedText}`, '_blank');
                
                toast.success('💻 1. Reporte descargado. 2. WhatsApp abierto. 3. Arrastra el archivo.', { 
                    id: 'whatsapp-share',
                    duration: 10000 
                });
            }
        } catch (error: any) {
            console.error('Error preparing WhatsApp share', error);
            const errorMsg = error?.message || 'Error desconocido';
            toast.error(`Error al preparar reporte: ${errorMsg}`, { id: 'whatsapp-share' });
        }
    }, [handleExportExcel, copyToClipboard]);

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

    // Short date for mobile
    const shortDate = useMemo(() => {
        const d = new Date(date + 'T12:00:00');
        const options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' };
        const formatted = d.toLocaleDateString('es-CL', options);
        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    }, [date]);

    const dayOfWeek = useMemo(() => {
        return new Date(date + 'T12:00:00').getDay();
    }, [date]);

    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    // Filtered and sorted workers
    const filteredWorkers = useMemo(() => {
        let result = workers;
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            const qCollapsed = q.replace(/[\s.-]/g, '');
            result = workers.filter(w => {
                const fullName = `${w.nombres} ${w.apellido_paterno}`.toLowerCase();
                const rutExact = w.rut.toLowerCase();
                const rutCollapsed = w.rut.toLowerCase().replace(/[\s.-]/g, '');
                
                return fullName.includes(q) || 
                       rutExact.includes(q) || 
                       (qCollapsed.length > 0 && rutCollapsed.includes(qCollapsed));
            });
        }
        return [...result].sort((a, b) => {
            const nameA = `${a.apellido_paterno || ''} ${a.nombres || ''}`.trim();
            const nameB = `${b.apellido_paterno || ''} ${b.nombres || ''}`.trim();
            return nameA.localeCompare(nameB);
        });
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
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
                <CheckSquare className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
                <div className="flex flex-col leading-tight min-w-0">
                    <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">Asistencia</h1>
                    <p className="text-muted-foreground text-[10px] md:text-xs truncate">
                        <span className="hidden md:inline">{selectedObra.nombre} <span className="mx-1.5">•</span></span>
                        <span className="font-medium text-brand-dark">
                            <span className="md:hidden">{shortDate}</span>
                            <span className="hidden md:inline">{formattedDate}</span>
                        </span>
                    </p>
                </div>
            </div>
        ) : (
            <div className="flex items-center gap-3">
                <CheckSquare className="h-6 w-6 text-muted" />
                <h1 className="text-lg font-bold text-brand-dark">Control de Asistencia</h1>
            </div>
        )
    ), [selectedObra, formattedDate, shortDate]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-1 md:gap-2">
            {selectedObra && (
                <>
                    {/* Mobile Worker Count Chip */}
                    <div className="md:hidden flex items-center gap-1.5 px-3 py-1.5 bg-[#E8E8ED] rounded-full text-[13px] font-bold text-brand-dark shrink-0">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{summary.total}</span>
                    </div>

                    {/* Mobile WhatsApp Button */}
                    <button
                        onClick={handleShareWhatsApp}
                        className="md:hidden flex items-center justify-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-full text-[13px] font-medium text-brand-dark hover:bg-background shadow-sm shrink-0"
                        title="Enviar por WhatsApp"
                    >
                        <Send className="h-4 w-4 text-[#25D366]" fill="#25D366" stroke="white" strokeWidth={1.5} />
                        <span>WhatsApp</span>
                    </button>

                    {/* Desktop WhatsApp Button */}
                    <Button
                        onClick={handleShareWhatsApp}
                        variant="glass"
                        className="hidden md:flex text-muted-foreground hover:text-brand-accent"
                        title="Compartir Resumen por WhatsApp"
                        leftIcon={<Send className="h-4 w-4" />}
                        size="sm"
                    >
                        <span className="hidden lg:inline">WhatsApp</span>
                    </Button>
                </>
            )}

            {/* Mobile Export Button */}
            <button
                onClick={() => handleExportExcel()}
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-full border border-border bg-white text-muted-foreground shadow-sm active:bg-background"
                title="Exportar Reporte Mensual"
            >
                <FileDown className="h-4 w-4" />
            </button>

            {/* Export Monthly Report — always available if user can view assistance */}
            <Button
                onClick={() => handleExportExcel()}
                variant="outline"
                title="Exportar Asistencia del Mes actual"
                leftIcon={<FileDown className="h-4 w-4" />}
                size="sm"
                className="hidden md:flex"
            >
                <span className="hidden lg:inline">Reporte Mensual</span>
            </Button>

            {selectedObra && (
                <>
                    {/* Manual Holiday Toggle */}
                    <RequirePermission modulo="asistencia" accion="puede_editar">
                        <Button
                            onClick={toggleFeriado}
                            variant={feriadoActual ? "outline" : "glass"}
                            size="sm"
                            title={feriadoActual ? "Quitar marcación de feriado" : "Marcar este día como feriado"}
                            className={cn(
                                "hidden md:flex",
                                feriadoActual ? "text-destructive border-destructive/20 hover:bg-destructive/5" : "text-muted-foreground hover:text-brand-primary"
                            )}
                            leftIcon={<CalendarRange className="h-4 w-4" />}
                        >
                            <span className="hidden lg:inline">{feriadoActual ? 'Quitar Feriado' : 'Marcar Feriado'}</span>
                        </Button>
                    </RequirePermission>

                    <Button
                        onClick={handleSave}
                        isLoading={saving}
                        disabled={loading || workers.length === 0 || !checkPermission('asistencia', 'puede_editar') || !!feriadoActual || isSunday}
                        leftIcon={<Save className="h-4 w-4" />}
                        size="sm"
                        className={cn(
                            "hidden md:flex",
                            (!checkPermission('asistencia', 'puede_editar') || !!feriadoActual || isSunday) && "opacity-40 grayscale-[100%] cursor-not-allowed"
                        )}
                        title={!checkPermission('asistencia', 'puede_editar') ? "No tienes permisos" : (feriadoActual || isSunday) ? "Día bloqueado" : "Guardar Asistencia"}
                    >
                        Guardar
                    </Button>
                </>
            )}
        </div>
    ), [selectedObra, handleShareWhatsApp, handleExportExcel, handleSave, saving, loading, workers.length, checkPermission]);
    useStandardHeader({
        title: headerTitle,
        icon: CheckSquare, // Is already inside headerTitle but we must pass something to adhere to TS signature
        actions: headerActions
    });

    if (!selectedObra) {
        return (
            <div className="h-[50vh] flex flex-col items-center justify-center text-center p-8">
                <div className="h-14 w-14 bg-background rounded-full flex items-center justify-center mb-4">
                    <CheckSquare className="h-7 w-7 text-muted-foreground" />
                </div>
                <h2 className="text-lg font-semibold text-brand-dark">Reporte Global de Asistencia</h2>
                <p className="text-muted-foreground mt-2 mb-8 max-w-md text-sm">
                    Selecciona el período para descargar el reporte consolidado de todas las obras y trabajadores.
                </p>
                
                <div className="w-full max-w-sm space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <Select
                            label="Mes"
                            value={reportMonth}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportMonth(e.target.value)}
                            options={[
                                { value: '01', label: 'Enero' },
                                { value: '02', label: 'Febrero' },
                                { value: '03', label: 'Marzo' },
                                { value: '04', label: 'Abril' },
                                { value: '05', label: 'Mayo' },
                                { value: '06', label: 'Junio' },
                                { value: '07', label: 'Julio' },
                                { value: '08', label: 'Agosto' },
                                { value: '09', label: 'Septiembre' },
                                { value: '10', label: 'Octubre' },
                                { value: '11', label: 'Noviembre' },
                                { value: '12', label: 'Diciembre' },
                            ]}
                        />
                        <Select
                            label="Año"
                            value={reportYear}
                            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setReportYear(e.target.value)}
                            options={[
                                { value: '2024', label: '2024' },
                                { value: '2025', label: '2025' },
                                { value: '2026', label: '2026' },
                            ]}
                        />
                    </div>

                    <Button
                        onClick={() => handleExportExcel()}
                        variant="primary"
                        className="w-full h-12 shadow-lg shadow-brand-primary/20"
                        leftIcon={<FileDown className="h-5 w-5" />}
                    >
                        Exportar Reporte Global
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3 md:space-y-4 pb-20 md:pb-4">
            {/* ── Date Navigation ── */}
            <div className="bg-white rounded-2xl border border-border p-3 md:p-4">
                <div className="flex flex-col gap-3 md:flex-row md:gap-4 md:items-center">
                    {/* Date Nav - Full width on mobile */}
                    <div className="flex items-center gap-2 justify-between w-full md:w-auto">
                        <Button variant="glass" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateDate(-1)}>
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="relative flex-1 md:flex-none">
                            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="date"
                                value={date}
                                onChange={(e) => setDate(e.target.value)}
                                className="w-full pl-9 pr-3 py-2 bg-background border border-border rounded-xl text-sm text-brand-dark font-medium focus:outline-none focus:border-brand-primary transition-colors"
                            />
                        </div>
                        <Button variant="glass" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigateDate(1)}>
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                        <Button
                            variant="glass"
                            size="sm"
                            className="text-xs shrink-0"
                            onClick={() => setDate(new Date().toISOString().split('T')[0])}
                        >
                            <span className="md:hidden">Hoy</span>
                            <span className="hidden md:inline">Hoy</span>
                        </Button>
                    </div>

                    <div className="hidden md:block h-8 w-px bg-border" />

                    {/* Stats Chips - Hidden on Mobile, Visible on Desktop */}
                    <div className="hidden md:flex items-center gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-background rounded-full">
                            <Users className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-xs font-bold text-brand-dark">{summary.total}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-accent/8 rounded-full">
                            <BarChart3 className="h-3.5 w-3.5 text-brand-accent" />
                            <span className="text-xs font-bold text-brand-accent">{summary.porcentaje}%</span>
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

                {(isSaturday || isSunday || feriadoActual) && (
                    <div className={cn(
                        "mt-3 px-3 py-2 rounded-xl text-xs font-medium flex items-center gap-2 border",
                        feriadoActual 
                            ? "bg-destructive/10 text-destructive border-destructive/20" 
                            : (isSunday ? "bg-destructive/8 text-destructive border-transparent" : "bg-warning/8 text-warning border-transparent")
                    )}>
                        {feriadoActual ? <CalendarDays className="h-4 w-4 shrink-0" /> : <Clock className="h-3.5 w-3.5 shrink-0" />}
                        {feriadoActual 
                            ? `Feriado ${feriadoActual.tipo === 'nacional' ? 'Nacional' : 'Obra'}: ${feriadoActual.nombre} ${feriadoActual.irrenunciable ? '(Irrenunciable)' : ''}`
                            : (isSunday ? "Domingo — no se debe registrar asistencia" : "Sábado — las horas trabajadas se registran como extras")}
                    </div>
                )}
            </div>

            {/* ── Search Bar (sticky on mobile) ── */}
            <div className="sticky top-14 md:top-16 z-20 -mx-3 px-3 md:mx-0 md:px-0 py-1 md:py-0 bg-background md:bg-transparent">
                <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Buscar por nombre o RUT..."
                />
            </div>

            {/* ── Worker List ── */}
            {loading ? (
                <div className="py-20 flex flex-col items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                    <p className="text-muted-foreground mt-4 text-sm">Cargando nómina...</p>
                </div>
            ) : workers.length === 0 ? (
                <div className="bg-white rounded-2xl border border-border py-20 text-center">
                    <Users className="h-10 w-10 text-muted mx-auto mb-4 opacity-40" />
                    <p className="text-muted-foreground text-sm">No hay trabajadores asignados a esta obra.</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2 p-2 md:p-0 md:gap-0 md:block bg-background md:bg-white md:rounded-2xl md:border md:border-border overflow-hidden">
                    {/* Desktop Header */}
                    <div className="hidden md:grid grid-cols-[48px_minmax(200px,280px)_1fr_180px_60px] gap-4 px-5 py-3 bg-background border-b border-[#E8E8ED] text-xs font-semibold text-muted-foreground uppercase tracking-wider items-center">
                        <span className="text-center">#</span>
                        <span>Trabajador</span>
                        <span className="text-center w-full">Estado</span>
                        <span className="w-[180px] text-center">Detalle / Calendario</span>
                        <span className="w-[60px] text-center">H.E.</span>
                    </div>

                    <AnimatePresence>
                        {filteredWorkers.map((worker, idx) => {
                            const state = attendance[worker.id] || {};
                            const currentEstado = estados.find(e => e.id === state.estado_id);
                            const isExpanded = expandedWorkerId === worker.id;
                            const isNotPresent = currentEstado && !currentEstado.es_presente;
                            const isDesvinculado = worker.fecha_desvinculacion ? date > worker.fecha_desvinculacion : false;

                            return (
                                <motion.div
                                    key={`${worker.id}-${date}`}
                                    initial={{ opacity: 0, y: 40, scale: 0.95 }}
                                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                    viewport={{ once: false, margin: "0px 0px -20px 0px" }}
                                    transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                    className={cn(
                                        "md:border-b md:border-[#F0F0F0] md:last:border-b-0 transition-colors rounded-2xl md:rounded-none overflow-hidden",
                                        idx % 2 === 0 ? "bg-white" : "bg-[#F0F0F5]",
                                        (isNotPresent || isDesvinculado) && "bg-[#FEF8F8]",
                                        (isSaturday || isSunday) && "bg-[#E8ECEF]",
                                        feriadoActual && "bg-destructive/5",
                                        isDesvinculado && "opacity-75 grayscale-[30%]"
                                    )}
                                >
                                    {/* ── MOBILE CARD ── */}
                                    <div className="md:hidden p-3">
                                        {/* Row 1: Avatar + Name + Calendar btn */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <button
                                                onClick={() => toggleMarkedRow(idx)}
                                                className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs transition-all border shrink-0",
                                                    markedRows.has(idx)
                                                        ? "bg-brand-dark text-white border-brand-dark shadow-lg scale-110"
                                                        : "bg-background text-muted border-border"
                                                )}
                                            >
                                                #{(idx + 1).toString().padStart(2, '0')}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-sm truncate block font-bold text-brand-dark">
                                                    {worker.apellido_paterno}, {worker.nombres}
                                                </WorkerLink>
                                                <p className="text-[11px] text-muted-foreground font-medium">
                                                    {worker.rut}
                                                    {worker.cargo_nombre && <> · <span className="text-brand-primary font-bold">{worker.cargo_nombre}</span></>}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setCalendarWorker(worker)}
                                                className="p-2 rounded-full text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors shrink-0"
                                                title="Ver Calendario"
                                            >
                                                <CalendarDays className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setPeriodModalWorker(worker)}
                                                className="p-2 rounded-full text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 hover:text-[#027A3B] transition-colors shrink-0"
                                                title="Asignar Período de Ausencia"
                                            >
                                                <CalendarRange className="h-4 w-4" />
                                            </button>
                                        </div>

                                        {/* Row 2: State Buttons — large touch targets */}
                                        <div className="flex gap-1.5">
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
                                                        disabled={isDesvinculado || !checkPermission('asistencia', 'puede_editar') || !!feriadoActual || isSunday}
                                                        title={isDesvinculado ? "Bloqueado por Finiquito" : (!checkPermission('asistencia', 'puede_editar') ? "No tienes permisos" : est.nombre)}
                                                        className={cn(
                                                            "flex-1 min-h-[44px] rounded-xl text-xs font-bold uppercase transition-all border",
                                                            isActive
                                                                ? "text-white border-transparent shadow-sm"
                                                                : "bg-white border-[#E8E8ED] text-muted-foreground active:scale-95",
                                                            (!!feriadoActual || isSunday || isDesvinculado) && "opacity-50 cursor-not-allowed"
                                                        )}
                                                        style={isActive ? { backgroundColor: est.color, borderColor: est.color } : undefined}
                                                    >
                                                        {est.codigo}
                                                    </button>
                                                );
                                            })}
                                        </div>                                        {/* Row 4: Expandable detail toggle */}
                                        <button
                                            onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)}
                                            disabled={isDesvinculado || !!feriadoActual || isSunday}
                                            className={cn(
                                                "mt-2 flex items-center justify-center gap-1 w-full py-1.5 text-[11px] text-brand-primary font-medium rounded-lg hover:bg-brand-primary/5 transition-colors",
                                                (!!feriadoActual || isSunday || isDesvinculado) && "opacity-50 cursor-not-allowed grayscale"
                                            )}
                                        >
                                            <span>{isExpanded ? 'Cerrar detalle' : 'Detalle y Horas Extra'}</span>
                                            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-180")} />
                                        </button>
                                    </div>

                                    {/* ── DESKTOP ROW ── */}
                                    <div className={cn(
                                        "hidden md:grid grid-cols-[48px_minmax(200px,280px)_1fr_180px_60px] gap-4 px-5 py-3 items-center",
                                        markedRows.has(idx) && "bg-brand-primary/5 italic"
                                    )}>
                                        <div className="flex justify-center">
                                            <button
                                                onClick={() => toggleMarkedRow(idx)}
                                                className={cn(
                                                    "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border",
                                                    markedRows.has(idx)
                                                        ? "bg-brand-dark text-white border-brand-dark shadow-md scale-110"
                                                        : "bg-transparent text-muted border-transparent hover:border-border hover:bg-white"
                                                )}
                                            >
                                                {(idx + 1).toString().padStart(2, '0')}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-0 border-l border-[#E8E8ED]/30 pl-3">
                                            <div className="min-w-0">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-sm truncate block font-bold text-brand-dark">
                                                    {worker.apellido_paterno}, {worker.nombres}
                                                </WorkerLink>
                                                <p className="text-[10px] text-muted-foreground font-medium">
                                                    {worker.rut}
                                                    {worker.cargo_nombre && <> · <span className="text-brand-primary font-bold">{worker.cargo_nombre}</span></>}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex gap-1.5 w-full overflow-x-auto pb-1 md:pb-0 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                            {estados.map((est) => {
                                                const isActive = state.estado_id === est.id;
                                                return (
                                                    <button
                                                        key={est.id}
                                                        onClick={() => {
                                                            const updates: Partial<Asistencia> = {
                                                                estado_id: est.id,
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
                                                        disabled={isDesvinculado || !checkPermission('asistencia', 'puede_editar') || !!feriadoActual || isSunday}
                                                        title={isDesvinculado ? "Bloqueado por Finiquito" : (!checkPermission('asistencia', 'puede_editar') ? "No tienes permisos" : est.nombre)}
                                                        className={cn(
                                                            "px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all whitespace-nowrap border",
                                                            isActive ? "text-white border-transparent shadow-sm" : "bg-white border-[#E8E8ED] text-muted-foreground hover:bg-background",
                                                            (!!feriadoActual || isSunday || isDesvinculado) && "opacity-40 grayscale-[100%] cursor-not-allowed"
                                                        )}
                                                        style={isActive ? { backgroundColor: est.color, borderColor: est.color } : undefined}
                                                    >
                                                        {est.codigo}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        <div className="w-[180px] flex items-center justify-between gap-2">
                                            <div className="flex-1">
                                                    <button
                                                        onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)}
                                                        disabled={isDesvinculado || !!feriadoActual || isSunday}
                                                        title={isDesvinculado ? "Bloqueado por Finiquito" : "Ver detalle"}
                                                        className={cn(
                                                            "text-[10px] text-brand-primary font-medium hover:underline w-full text-center",
                                                            (isDesvinculado || !!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed no-underline grayscale"
                                                        )}
                                                    >
                                                        {isExpanded ? 'Cerrar' : 'Detalle'}
                                                    </button>
                                            </div>
                                            <button
                                                onClick={() => setCalendarWorker(worker)}
                                                disabled={!!feriadoActual || isSunday}
                                                className={cn(
                                                    "p-1.5 rounded-full text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors flex-shrink-0",
                                                    (!!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed"
                                                )}
                                                title="Ver Calendario"
                                            >
                                                <CalendarDays className="h-4 w-4" />
                                            </button>
                                            <button
                                                onClick={() => setPeriodModalWorker(worker)}
                                                disabled={!!feriadoActual || isSunday}
                                                className={cn(
                                                    "p-1.5 rounded-full text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 hover:text-[#027A3B] transition-colors flex-shrink-0",
                                                    (!!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed"
                                                )}
                                                title="Asignar Período de Ausencia"
                                            >
                                                <CalendarRange className="h-4 w-4" />
                                            </button>
                                        </div>

                                        <div className="w-[60px]">
                                            <input
                                                type="number"
                                                min="0"
                                                max="24"
                                                step="0.5"
                                                placeholder="0"
                                                disabled={!!feriadoActual || isSunday}
                                                className={cn(
                                                    "w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[10px] text-center text-brand-dark focus:outline-none focus:border-brand-primary",
                                                    (!!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed"
                                                )}
                                                value={state.horas_extra || ''}
                                                onChange={(e) => updateAttendance(worker.id, {
                                                    horas_extra: parseFloat(e.target.value) || 0
                                                })}
                                            />
                                        </div>
                                    </div>

                                    {/* ── Expanded Detail (shared) ── */}
                                    <AnimatePresence>
                                        {isExpanded && (
                                            <motion.div
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: 'auto', opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                className="overflow-hidden bg-[#FAFAFA]"
                                            >
                                                <div className="px-3 md:px-5 pb-4 pt-2 grid grid-cols-2 md:grid-cols-5 gap-3">
                                                    <TimeStepperInput disabled={!!feriadoActual || isSunday} label="Entrada" value={state.hora_entrada || ''} onChange={(val) => updateAttendance(worker.id, { hora_entrada: val || null })} />
                                                    <TimeStepperInput disabled={!!feriadoActual || isSunday} label="Salida" value={state.hora_salida || ''} onChange={(val) => updateAttendance(worker.id, { hora_salida: val || null })} />
                                                    <TimeStepperInput disabled={!!feriadoActual || isSunday} label="Colación Ini." value={state.hora_colacion_inicio || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_inicio: val || null })} />
                                                    <TimeStepperInput disabled={!!feriadoActual || isSunday} label="Colación Fin" value={state.hora_colacion_fin || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_fin: val || null })} />
                                                    <div className="col-span-2 md:col-span-1 grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">H. Extra</label>
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                max="24"
                                                                step="0.5"
                                                                placeholder="0"
                                                                disabled={!!feriadoActual || isSunday}
                                                                className={cn(
                                                                    "w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-center text-brand-dark focus:outline-none focus:border-brand-primary",
                                                                    (!!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed bg-background"
                                                                )}
                                                                value={state.horas_extra || ''}
                                                                onChange={(e) => updateAttendance(worker.id, {
                                                                    horas_extra: parseFloat(e.target.value) || 0
                                                                })}
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">Nota</label>
                                                            <input
                                                                type="text"
                                                                placeholder="..."
                                                                disabled={!!feriadoActual || isSunday}
                                                                className={cn(
                                                                    "w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary",
                                                                    (!!feriadoActual || isSunday) && "opacity-50 cursor-not-allowed bg-background"
                                                                )}
                                                                value={state.observacion || ''}
                                                                onChange={(e) => updateAttendance(worker.id, { observacion: e.target.value })}
                                                            />
                                                        </div>
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

            {/* ── Mobile FAB Save Button ── */}
            {selectedObra && workers.length > 0 && (
                <motion.button
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className={cn(
                        "md:hidden fixed bottom-6 right-4 z-40 h-14 w-14 rounded-full bg-brand-primary text-white shadow-lg shadow-brand-primary/30 flex items-center justify-center active:scale-90 transition-transform",
                        (!checkPermission('asistencia', 'puede_editar') || saving) && "opacity-50 pointer-events-none"
                    )}
                    onClick={handleSave}
                    disabled={saving || !checkPermission('asistencia', 'puede_editar')}
                >
                    {saving ? (
                        <Loader2 className="h-6 w-6 animate-spin" />
                    ) : (
                        <Save className="h-6 w-6" />
                    )}
                </motion.button>
            )}

            <WorkerCalendarModal
                isOpen={!!calendarWorker}
                onClose={() => setCalendarWorker(null)}
                worker={calendarWorker}
                estados={estados}
                obraId={selectedObra?.id}
                onAssignPeriod={() => {
                    setCalendarWorker(null);
                    setPeriodModalWorker(calendarWorker);
                }}
                onSelectRange={handleCalendarSelectRange}
            />

            <PeriodAssignModal
                isOpen={!!periodModalWorker}
                onClose={() => {
                    setPeriodModalWorker(null);
                    setPeriodSelection(null);
                }}
                worker={periodModalWorker}
                obraId={selectedObra?.id || null}
                estados={estados}
                initialDates={periodSelection}
                onSuccess={() => {
                    fetchAttendanceInfo();
                }}
            />

            <WorkerQuickView
                workerId={quickViewId}
                onClose={() => setQuickViewId(null)}
                onEditWorker={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('form'); }
                }}
                onViewDocuments={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('docs'); }
                }}
            />

            {/* Unified Modal para edición y documentos de la ficha rápida */}
            <Modal
                isOpen={modalType !== null}
                onClose={() => {
                    setModalType(null);
                    setIsUploading(false);
                }}
                title={
                    modalType === 'form'
                        ? "Editar Trabajador"
                        : `Documentos: ${selectedWorker?.nombres} ${selectedWorker?.apellido_paterno}`
                }
                size={modalType === 'docs' ? 'dynamic' : 'md'}
            >
                {modalType === 'form' && selectedWorker && (
                    <WorkerForm
                        initialData={selectedWorker}
                        onSuccess={() => {
                            setModalType(null);
                            fetchAttendanceInfo(); // refetch workers
                        }}
                        onCancel={() => setModalType(null)}
                    />
                )}
                {modalType === 'docs' && selectedWorker && (
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-background p-3 md:p-4 rounded-xl">
                            <div className="hidden sm:block">
                                <h4 className="text-base font-semibold text-brand-dark">Bóveda de Documentos</h4>
                                <p className="text-sm text-muted-foreground">Sube y gestiona archivos para este trabajador.</p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {!isUploading && (
                                    <Button
                                        size="sm"
                                        variant="glass"
                                        onClick={async () => {
                                            try {
                                                const nid = toast.loading('Generando ZIP...');
                                                const response = await api.get(`/documentos/download-all/${selectedWorker.id}`, {
                                                    responseType: 'blob',
                                                });
                                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.setAttribute('download', `Documentos_${selectedWorker.nombres}_${selectedWorker.apellido_paterno}.zip`);
                                                document.body.appendChild(link);
                                                link.click();
                                                link.remove();
                                                toast.dismiss(nid);
                                                toast.success('Descarga iniciada');
                                            } catch (err) {
                                                toast.error('Error al descargar documentos');
                                            }
                                        }}
                                        className="text-brand-primary hover:text-[#027A3B] flex-1 sm:flex-initial"
                                        leftIcon={<FileDown className="h-4 w-4" />}
                                    >
                                        <span className="hidden sm:inline">Descargar (.zip)</span>
                                        <span className="sm:hidden">Descargar</span>
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant={isUploading ? 'glass' : 'primary'}
                                    disabled={!checkPermission('documentos', 'puede_crear') && !isUploading}
                                    onClick={() => setIsUploading(!isUploading)}
                                    leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                    className={`flex-1 sm:flex-initial ${(!checkPermission('documentos', 'puede_crear') && !isUploading) ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
                                    title={(!checkPermission('documentos', 'puede_crear') && !isUploading) ? "No tienes permisos" : (isUploading ? "Volver" : "Subir Documento")}
                                >
                                    <span className="hidden sm:inline">{isUploading ? 'Volver a la lista' : 'Subir Documento'}</span>
                                    <span className="sm:hidden">{isUploading ? 'Volver' : 'Subir'}</span>
                                </Button>
                            </div>
                        </div>

                        {isUploading ? (
                            <DocumentUploader
                                trabajadorId={selectedWorker.id}
                                onCancel={() => setIsUploading(false)}
                                onSuccess={() => {
                                    setIsUploading(false);
                                    fetchAttendanceInfo();
                                }}
                            />
                        ) : (
                            <DocumentList trabajadorId={selectedWorker.id} />
                        )}
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AttendancePage;

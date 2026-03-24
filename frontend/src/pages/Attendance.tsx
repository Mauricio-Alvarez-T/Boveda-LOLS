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
    ArrowLeft,
    Search,
    Building2,
    Filter,
    Plus,
    X,
    Trash2,
    MoreHorizontal
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
import { useSetPageHeader } from '../context/PageHeaderContext';
import { SearchBar } from '../components/ui/SearchBar';
import { useAuth } from '../context/AuthContext';
import RequirePermission from '../components/auth/RequirePermission';

const AttendancePage: React.FC = () => {
    const { selectedObra } = useObra();
    const { checkPermission, hasPermission } = useAuth();
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [horariosObra, setHorariosObra] = useState<ConfiguracionHorario[]>([]);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [feriadoActual, setFeriadoActual] = useState<Feriado | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
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

    const [showMobileMenu, setShowMobileMenu] = useState(false);

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
        if (!selectedObra || !hasPermission('asistencia.feriado.gestionar')) return;

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
            // Filtrar trabajadores que están fuera de rango laboral en esta fecha
            // para no enviarlos al servidor y evitar que aborte la transacción general.
            const validWorkers = currentWorkers.filter(w => {
                const fIngreso = w.fecha_ingreso ? String(w.fecha_ingreso).split('T')[0] : null;
                const fDesvinc = w.fecha_desvinculacion ? String(w.fecha_desvinculacion).split('T')[0] : null;
                const isDesvinculado = fDesvinc ? currentDate > fDesvinc : false;
                const isPreContrato = fIngreso ? currentDate < fIngreso : false;
                return !isDesvinculado && !isPreContrato;
            });

            const payload = {
                obra_id: currentObra.id,
                registros: validWorkers.map(w => ({
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
        } catch (e) { }

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
        const counts: Record<string, number> = { A: 0, F: 0, JI: 0, TO: 0, V: 0, LM: 0, PL: 0 };

        currentWorkers.forEach(w => {
            const state = currentAttendance[w.id];
            if (!state || !state.estado_id) return;
            const est = currentEstados.find(e => e.id === state.estado_id);
            if (!est) return;

            let code = est.codigo;
            // Consolidación dinâmica para el reporte
            if (['NAC', 'DEF', 'MAT'].includes(code)) code = 'PL';
            if (code === 'AT') code = 'JI';

            if (counts[code] !== undefined) counts[code]++;
            else if (!est.es_presente) counts.PL++; // Default a PL si no es presente y no mapeado
        });

        text += `Total: ${total}\n`;
        ['A', 'F', 'JI', 'TO', 'V', 'LM', 'PL'].forEach(c => {
            text += `${c}: ${counts[c].toString().padStart(2, '0')}\n`;
        });
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

            // 1. Get Public Download Token
            toast.loading('Preparando link de reporte...', { id: 'whatsapp-share' });

            const { selectedObra: currentObra, date: currentDate, reportMonth, reportYear } = latestData.current;
            let year, month;
            if (!currentObra) {
                year = reportYear;
                month = reportMonth;
            } else {
                [year, month] = currentDate.split('-');
            }

            const obraIdParam = currentObra ? currentObra.id : '';
            const firstDay = `${year}-${month}-01`;
            const lastDay = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

            // Use the NEW unique endpoint to avoid cache
            const tokenRes = await api.get<{ data: { token: string } }>(
                `asistencias/public-report-token?obra_id=${obraIdParam}&fecha_inicio=${firstDay}&fecha_fin=${lastDay}`
            );
            const token = tokenRes.data.data.token;

            // 2. Construct Public URL
            let baseUrl = api.defaults.baseURL || '';
            if (!baseUrl.startsWith('http')) {
                baseUrl = window.location.origin + (baseUrl.startsWith('/') ? baseUrl : '/' + baseUrl);
            }
            const publicUrl = `${baseUrl}/asistencias/d/${token}`;

            // 3. Construct Final Message (Link at the TOP + Summary)
            const finalMessage = `📊 *REPORTE DETALLADO (Excel):*\n${publicUrl}\n\n${text}`;

            // 4. SECOND STEP: User Confirmation (Fresh Gesture)
            toast.success('¡Reporte y link listos!', {
                id: 'whatsapp-share',
                description: 'Pulsa el botón para enviar por WhatsApp.',
                duration: 15000,
                action: {
                    label: 'ENVIAR AHORA',
                    onClick: async () => {
                        // DETECT PLATFORM for custom handling
                        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

                        if (isMobile && navigator.share) {
                            // Use Native Share (Best for Mobile)
                            try {
                                await navigator.share({
                                    text: finalMessage,
                                    title: `Asistencia ${currentObra?.nombre || 'Bóveda'}`
                                });
                            } catch (e: any) {
                                if (e.name !== 'AbortError') {
                                    window.open(`https://wa.me/?text=${encodeURIComponent(finalMessage)}`, '_blank');
                                }
                            }
                        } else {
                            // Use wa.me (Best for Desktop)
                            const encodedText = encodeURIComponent(finalMessage);
                            window.open(`https://wa.me/?text=${encodedText}`, '_blank');
                        }
                    }
                }
            });

        } catch (error: any) {
            console.error('Error preparing WhatsApp link', error);
            const serverMsg = error.response?.data?.error || error.response?.data?.message;
            const errorDetail = serverMsg ? `: ${serverMsg}` : ` (${error.message})`;

            toast.error(`Error al generar link${errorDetail}`, { id: 'whatsapp-share', duration: 8000 });

            // Final Fallback: Text only
            setTimeout(() => {
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
            }, 2000);
        }
    }, [copyToClipboard]);

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

    // Available Empresas in current worker list
    const availableEmpresas = useMemo(() => {
        const unique = new Map<number, string>();
        workers.forEach(w => {
            if (w.empresa_id && w.empresa_nombre) {
                unique.set(w.empresa_id, w.empresa_nombre);
            }
        });
        return Array.from(unique.entries())
            .map(([id, nombre]) => ({ id, nombre }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [workers]);

    // Filtered and sorted workers
    const filteredWorkers = useMemo(() => {
        let result = workers;

        if (selectedEmpresaId !== null) {
            result = result.filter(w => w.empresa_id === selectedEmpresaId);
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            const qCollapsed = q.replace(/[\s.-]/g, '');
            result = result.filter(w => {
                const fullName = `${w.apellido_paterno} ${w.apellido_materno || ''} ${w.nombres}`.toLowerCase();
                const rutExact = w.rut.toLowerCase();
                const rutCollapsed = w.rut.toLowerCase().replace(/[\s.-]/g, '');

                return fullName.includes(q) ||
                    rutExact.includes(q) ||
                    (qCollapsed.length > 0 && rutCollapsed.includes(qCollapsed));
            });
        }
        return [...result].sort((a, b) => {
            const getFullNameSort = (w: any) => {
                return `${w.apellido_paterno || ''} ${w.apellido_materno || ''} ${w.nombres || ''}`
                    .toLowerCase()
                    .trim()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, ""); // Remove accents for cleaner sorting
            };
            return getFullNameSort(a).localeCompare(getFullNameSort(b), 'es', { sensitivity: 'base' });
        });
    }, [workers, searchQuery, selectedEmpresaId]);

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
        <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary shadow-sm border border-brand-primary/20 shrink-0">
                <CheckSquare className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <h1 className="text-sm font-black text-brand-dark tracking-tighter leading-tight uppercase">
                    {selectedObra ? 'Asistencia' : 'Reporte Global'}
                </h1>
                <p className="text-[10px] text-muted-foreground font-bold truncate opacity-80">
                    {selectedObra ? selectedObra.nombre : 'Consolidado'}
                </p>
            </div>
        </div>
    ), [selectedObra]);

    const [showSearchBox, setShowSearchBox] = useState(false);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-2">
            {selectedObra && (
                <>
                    {/* Botones Móvil (3 principales) */}
                    <div className="flex md:hidden items-center gap-1.5 h-full">
                        <Button
                            onClick={handleShareWhatsApp}
                            className="h-9 px-3 rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5"
                        >
                            <span className="text-[10px] font-black uppercase">Enviar</span>
                            <Send className="h-3.5 w-3.5" fill="currentColor" />
                        </Button>

                        <Button
                            onClick={handleSave}
                            isLoading={saving}
                            disabled={loading || workers.length === 0 || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday}
                            className={cn(
                                "h-9 px-3 rounded-xl bg-brand-primary text-white shadow-md active:scale-95 transition-all flex items-center gap-1.5",
                                (!hasPermission('asistencia.guardar') || !!feriadoActual || isSunday) && "opacity-40 grayscale pointer-events-none"
                            )}
                        >
                            <span className="text-[10px] font-black uppercase">Guardar</span>
                            <Save className="h-3.5 w-3.5" />
                        </Button>

                        <div className="relative">
                            <button
                                onClick={() => setShowMobileMenu(!showMobileMenu)}
                                className={cn(
                                    "flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-90",
                                    showMobileMenu ? "bg-brand-primary text-white border-transparent shadow-lg" : "bg-white text-muted-foreground border-[#E8E8ED] shadow-sm"
                                )}
                            >
                                <MoreHorizontal className="h-5 w-5" />
                            </button>

                            <AnimatePresence>
                                {showMobileMenu && (
                                    <>
                                        <motion.div 
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            className="fixed inset-0 z-[60] bg-black/20 backdrop-blur-[2px]"
                                            onClick={() => setShowMobileMenu(false)}
                                        />
                                        <motion.div
                                            initial={{ opacity: 0, scale: 0.9, y: 10, x: 20 }}
                                            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                                            exit={{ opacity: 0, scale: 0.9, y: 10, x: 20 }}
                                            className="absolute right-0 top-12 w-56 bg-white rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-[#E8E8ED] p-2 z-[70] origin-top-right overflow-hidden"
                                        >
                                            <div className="text-[10px] font-black text-muted-foreground/50 px-3 py-2 uppercase tracking-widest border-b border-[#F0F0F5] mb-1">
                                                Opciones
                                            </div>
                                            
                                            <button
                                                onClick={() => { setShowSearchBox(!showSearchBox); setShowMobileMenu(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors"
                                            >
                                                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                                    <Search className="h-4 w-4" />
                                                </div>
                                                <span className="text-xs font-bold uppercase tracking-tight">{showSearchBox ? 'Cerrar Buscador' : 'Buscar Trabajador'}</span>
                                            </button>

                                            <button
                                                onClick={() => { handleExportExcel(); setShowMobileMenu(false); }}
                                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition-colors"
                                            >
                                                <div className="h-8 w-8 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600">
                                                    <FileDown className="h-4 w-4" />
                                                </div>
                                                <span className="text-xs font-bold uppercase tracking-tight">Exportar Excel</span>
                                            </button>

                                            <RequirePermission permiso="asistencia.feriado.gestionar">
                                                <button
                                                    onClick={() => { toggleFeriado(); setShowMobileMenu(false); }}
                                                    className={cn(
                                                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                                                        feriadoActual ? "bg-destructive/5 text-destructive" : "hover:bg-slate-50 text-slate-700"
                                                    )}
                                                >
                                                    <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center", feriadoActual ? "bg-destructive/10" : "bg-purple-50 text-purple-600")}>
                                                        <CalendarRange className="h-4 w-4" />
                                                    </div>
                                                    <span className="text-xs font-bold uppercase tracking-tight">{feriadoActual ? 'Quitar Feriado' : 'Marcar Feriado'}</span>
                                                </button>
                                            </RequirePermission>

                                            <div className="mt-1 pt-1 border-t border-[#F0F0F5]">
                                                <p className="px-3 py-1.5 text-[9px] font-bold text-muted-foreground/40 uppercase tracking-tighter">
                                                    Bóveda LOLS v2.4
                                                </p>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Search & Company Filter Group (Desktop) */}
                    <div className="hidden md:flex items-center gap-2 bg-white/50 backdrop-blur-sm border border-[#E8E8ED] rounded-xl p-0.5 shadow-sm overflow-hidden min-w-[300px] lg:min-w-[450px]">
                        <div className="relative flex-1 group">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60 transition-colors group-hover:text-brand-primary" />
                            <input
                                type="text"
                                placeholder="Buscar trabajador..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-8 pl-8 pr-3 bg-transparent text-xs font-medium focus:outline-none"
                            />
                        </div>
                        <div className="h-4 w-px bg-[#E8E8ED]" />
                        <select
                            value={selectedEmpresaId || ""}
                            onChange={(e) => setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null)}
                            className="h-8 bg-transparent text-[10px] font-black uppercase text-muted-foreground/80 px-3 pr-8 min-w-[140px] appearance-none cursor-pointer outline-none focus:text-brand-primary"
                            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundPosition: 'right 10px center', backgroundRepeat: 'no-repeat' }}
                        >
                            <option value="">Todas las Empresas</option>
                            {availableEmpresas.map(emp => (
                                <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-8 w-px bg-border/40 mx-1 hidden md:block" />

                    <div className="hidden md:flex items-center gap-1">
                        <Button
                            onClick={handleShareWhatsApp}
                            variant="glass"
                            className="h-9 w-9 p-0 flex items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-brand-primary hover:bg-brand-primary/5 shadow-sm"
                            title="Compartir por WhatsApp"
                        >
                            <Send className="h-4 w-4" fill="currentColor" />
                        </Button>
                        <Button
                            onClick={() => handleExportExcel()}
                            variant="glass"
                            className="h-9 w-9 p-0 flex items-center justify-center rounded-xl bg-white border border-[#E8E8ED] text-muted-foreground hover:bg-background shadow-sm"
                            title="Reporte Mensual"
                        >
                            <FileDown className="h-4 w-4" />
                        </Button>
                        <RequirePermission permiso="asistencia.feriado.gestionar">
                            <Button
                                onClick={toggleFeriado}
                                variant={feriadoActual ? "outline" : "glass"}
                                className={cn(
                                    "h-9 w-9 p-0 flex items-center justify-center rounded-xl transition-all shadow-sm border",
                                    feriadoActual 
                                        ? "bg-destructive text-white border-transparent" 
                                        : "bg-white border-[#E8E8ED] text-muted-foreground hover:text-brand-primary"
                                )}
                                title={feriadoActual ? "Quitar Feriado" : "Marcar Feriado"}
                            >
                                <CalendarRange className="h-4 w-4" />
                            </Button>
                        </RequirePermission>
                        <Button
                            onClick={handleSave}
                            isLoading={saving}
                            disabled={loading || workers.length === 0 || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday}
                            className={cn(
                                "h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-wider shadow-lg shadow-brand-primary/20",
                                (!hasPermission('asistencia.guardar') || !!feriadoActual || isSunday) && "opacity-40 grayscale pointer-events-none"
                            )}
                        >
                            <span className="hidden lg:inline mr-2 underline decoration-white/30 active:translate-y-px transition-all">Guardar</span>
                            <Save className="h-4 w-4" />
                        </Button>
                    </div>
                </>

            )}
        </div>
    ), [selectedObra, searchQuery, selectedEmpresaId, availableEmpresas, handleShareWhatsApp, handleExportExcel, handleSave, saving, loading, workers.length, hasPermission, feriadoActual, toggleFeriado, showSearchBox, summary]);
    useSetPageHeader(headerTitle, headerActions);

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
        <div className="h-[calc(100vh-116px)] md:h-[calc(100vh-132px)] flex flex-col gap-4 lg:gap-5 p-0 overflow-hidden w-full">
            {/* ── Search Bar & Filter (Mobile Expandable) ── */}
            <AnimatePresence>
                {showSearchBox && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="md:hidden space-y-2 overflow-hidden pb-2"
                    >
                        <div className="relative group">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                            <input
                                type="text"
                                placeholder="Buscar trabajador..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full h-11 pl-11 pr-4 bg-white border border-border rounded-xl text-sm font-medium focus:outline-none focus:border-brand-primary/40 focus:ring-4 focus:ring-brand-primary/5 shadow-sm transition-all"
                            />
                        </div>
                        <div className="relative">
                            <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-50" />
                            <select
                                value={selectedEmpresaId || ""}
                                onChange={(e) => setSelectedEmpresaId(e.target.value ? parseInt(e.target.value) : null)}
                                className="w-full h-11 pl-11 pr-10 bg-white border border-border rounded-xl text-sm font-semibold text-brand-dark appearance-none outline-none focus:border-brand-primary/40 shadow-sm"
                            >
                                <option value="">Todas las Empresas</option>
                                {availableEmpresas.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

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
                <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">
                {/* Sub-header Móvil: Selector de Fecha y Estadísticas */}
                <div className="md:hidden flex flex-col gap-2 px-4 pb-3 bg-white border-b border-[#E8E8ED] shrink-0">
                    <div className="flex items-center justify-between bg-slate-50 rounded-2xl p-1 border border-slate-200/60 shadow-inner">
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

                <div className="h-[60px] border-b border-[#F0F0F5] bg-white/50 px-5 flex items-center justify-between shrink-0 hidden md:flex">
                    <div className="flex items-center gap-4">
                         <div className="h-8 w-8 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                            <CheckSquare className="h-4 w-4 text-brand-primary" />
                        </div>
                        <h2 className="text-sm font-bold text-brand-dark">Registro Diario</h2>
                    </div>

                    {selectedObra && (
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
                
                {/* Grilla / Resultados */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F1F1F4]/80 p-2 md:p-4 flex flex-col gap-2">

                    <AnimatePresence>
                        {filteredWorkers.map((worker, idx) => {
                            const state = attendance[worker.id] || {};
                            const currentEstado = estados.find(e => e.id === state.estado_id);
                            const isExpanded = expandedWorkerId === worker.id;
                            const isNotPresent = currentEstado && !currentEstado.es_presente;
                            const fIngreso = worker.fecha_ingreso ? String(worker.fecha_ingreso).split('T')[0] : null;
                            const fDesvinc = worker.fecha_desvinculacion ? String(worker.fecha_desvinculacion).split('T')[0] : null;
                            const isDesvinculado = fDesvinc ? date > fDesvinc : false;
                            const isPreContrato = fIngreso ? date < fIngreso : false;
                            const isOutOfRange = isDesvinculado || isPreContrato;

                            return (
                                <motion.div
                                    key={`${worker.id}-${date}`}
                                    initial={{ opacity: 0, y: 10 }}
                                    whileInView={{ opacity: 1, y: 0 }}
                                    viewport={{ once: true }}
                                    className={cn(
                                        "transition-all duration-200 bg-white rounded-2xl border border-[#E8E8ED] shadow-[0_4px_12px_rgb(0,0,0,0.05)] hover:shadow-lg hover:border-brand-primary/30 group relative",
                                        markedRows.has(idx) && "ring-2 ring-brand-primary/20 border-brand-primary bg-brand-primary/[0.02]",
                                        (isNotPresent || isOutOfRange) && !markedRows.has(idx) && "bg-white/90",
                                        feriadoActual && "bg-destructive/[0.02]"
                                    )}
                                >
                                    {/* ── MOBILE CARD ── */}
                                    <div className="md:hidden p-3 pb-4">
                                        {/* Row 1: Index + Name + Calendar btn */}
                                        <div className="flex items-center gap-3 mb-3">
                                            <button
                                                onClick={() => toggleMarkedRow(idx)}
                                                className={cn(
                                                    "h-10 w-10 rounded-xl flex items-center justify-center font-black text-[10px] transition-all border shrink-0",
                                                    markedRows.has(idx)
                                                        ? "bg-brand-dark text-white border-brand-dark shadow-lg scale-110"
                                                        : "bg-slate-50 text-slate-500 border-slate-200"
                                                )}
                                            >
                                                #{(idx + 1).toString().padStart(2, '0')}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[13px] truncate block font-bold text-brand-dark leading-tight">
                                                    {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                                                </WorkerLink>
                                                <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                                    {worker.rut}
                                                    {worker.cargo_nombre && <> · <span className="text-brand-primary font-bold">{worker.cargo_nombre}</span></>}
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => setCalendarWorker(worker)}
                                                className="h-10 w-10 rounded-xl bg-white flex items-center justify-center text-brand-primary border border-brand-primary/20 shadow-sm active:scale-90 transition-all shrink-0"
                                                title="Ver Calendario y Períodos"
                                            >
                                                <CalendarDays className="h-5 w-5" />
                                            </button>
                                        </div>

                                        {/* Row 2: State Buttons — Favoritos y Dropdown */}
                                        <div className="flex gap-1.5 items-stretch h-12">
                                            {['A', 'F', 'JI', 'TO'].map(code => {
                                                const est = estados.find(e => e.codigo === code);
                                                if (!est) return null;
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
                                                                const dayIndex = new Date(date + 'T12:00:00').getDay();
                                                                const dayStr = (['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const)[dayIndex];
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
                                                        disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday}
                                                        className={cn(
                                                            "flex-1 rounded-xl text-xs font-black uppercase transition-all border shrink-0 active:scale-95",
                                                            isActive ? "text-white border-transparent shadow-md" : "bg-white border-[#E8E8ED] text-muted-foreground/60"
                                                        )}
                                                        style={isActive ? { backgroundColor: est.color } : undefined}
                                                    >
                                                        {est.codigo}
                                                    </button>
                                                );
                                            })}
                                            <div className="relative flex-1">
                                                {(() => {
                                                    const secondary = estados.filter(e => !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                    const activeSecondary = secondary.find(e => e.id === state.estado_id);
                                                    return (
                                                        <select
                                                            className={cn(
                                                                "w-full h-full rounded-xl text-[10px] font-black uppercase appearance-none text-center px-1 border transition-all truncate bg-white outline-none active:scale-95",
                                                                activeSecondary ? "text-white border-transparent shadow-md" : "bg-white border-[#E8E8ED] text-muted-foreground/60"
                                                            )}
                                                            style={activeSecondary ? { backgroundColor: activeSecondary.color } : undefined}
                                                            value={activeSecondary?.id || ""}
                                                            disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday}
                                                            onChange={(e) => {
                                                                const estId = parseInt(e.target.value);
                                                                updateAttendance(worker.id, { estado_id: estId, es_sabado: isSaturday });
                                                                if (expandedWorkerId !== worker.id) setExpandedWorkerId(worker.id);
                                                            }}
                                                        >
                                                            <option value="" disabled>{activeSecondary ? activeSecondary.nombre : 'MÁS'}</option>
                                                            {secondary.map(est => (
                                                                <option key={est.id} value={est.id}>{est.codigo} - {est.nombre}</option>
                                                            ))}
                                                        </select>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                        {/* Row 4: Expandable detail toggle */}
                                        <button
                                            onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)}
                                            disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday}
                                            className={cn(
                                                "mt-2 flex items-center justify-center gap-1.5 w-full py-2 text-[10px] text-brand-primary font-bold uppercase tracking-tight rounded-xl bg-slate-50/50 border border-slate-100 transition-all active:scale-98",
                                                (!!feriadoActual || isSunday || isSaturday || isOutOfRange) && "opacity-50 cursor-not-allowed grayscale"
                                            )}
                                        >
                                            <span>{isExpanded ? 'Cerrar' : 'Detalle'}</span>
                                            <ChevronDown className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-180")} />
                                        </button>
                                    </div>

                                    {/* ── DESKTOP ROW ── */}
                                    <div className={cn(
                                        "hidden md:grid grid-cols-[60px_minmax(200px,280px)_1fr_160px_60px] gap-4 px-6 py-4 items-center group",
                                        markedRows.has(idx) && "bg-brand-primary/5 rounded-2xl"
                                    )}>
                                        <div className="flex justify-center">
                                            <button
                                                onClick={() => toggleMarkedRow(idx)}
                                                className={cn(
                                                    "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border",
                                                    markedRows.has(idx)
                                                        ? "bg-brand-dark text-white border-brand-dark shadow-md scale-110"
                                                        : "bg-slate-50 text-slate-500 border-slate-200 hover:border-brand-primary/30 hover:bg-white hover:text-brand-primary active:scale-95"
                                                )}
                                            >
                                                {(idx + 1).toString().padStart(2, '0')}
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-3 min-w-0 border-l border-[#E8E8ED]/40 pl-4 group-hover:border-brand-primary/30 transition-colors">
                                            <div className="min-w-0">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[13px] truncate block font-bold text-slate-700 hover:text-brand-primary transition-colors">
                                                    {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                                                </WorkerLink>
                                                <p className="text-[10px] text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                                                    <span className="bg-slate-100 px-1 rounded uppercase tracking-tighter">{worker.rut}</span>
                                                    {worker.cargo_nombre && <span className="text-brand-primary/80 font-bold border-l border-slate-200 pl-1.5">{worker.cargo_nombre}</span>}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex justify-center">
                                            <div className="flex gap-1 p-1 bg-slate-100/50 rounded-2xl border border-slate-200/50 shadow-inner max-w-fit transition-all group-hover:bg-brand-primary/5 group-hover:border-brand-primary/20">
                                                {/* 1. Favoritos Escritorio */}
                                                {['A', 'F', 'JI', 'TO'].map(code => {
                                                    const est = estados.find(e => e.codigo === code);
                                                    if (!est) return null;
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
                                                                    const dayIndex = new Date(date + 'T12:00:00').getDay();
                                                                    const dayStr = (['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const)[dayIndex];
                                                                    const currentSchedule = horariosObra.find(h => h.dia_semana === dayStr);
                                                                    if (currentSchedule) {
                                                                        updates.hora_entrada = currentSchedule.hora_entrada.substring(0, 5);
                                                                        updates.hora_salida = currentSchedule.hora_salida.substring(0, 5);
                                                                        updates.hora_colacion_inicio = currentSchedule.hora_colacion_inicio.substring(0, 5);
                                                                        updates.hora_colacion_fin = currentSchedule.hora_colacion_fin.substring(0, 5);
                                                                    }
                                                                }
                                                                updateAttendance(worker.id, updates);
                                                            }}
                                                            disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday}
                                                            className={cn(
                                                                "h-8 px-3 rounded-xl text-[10px] font-black uppercase transition-all whitespace-nowrap border shrink-0 flex items-center justify-center min-w-[36px]",
                                                                isActive ? "text-white border-transparent shadow-md scale-105" : "bg-white border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600 active:scale-95"
                                                            )}
                                                            style={isActive ? { backgroundColor: est.color, borderColor: est.color } : undefined}
                                                        >
                                                            {est.codigo}
                                                        </button>
                                                    );
                                                })}

                                                {/* 2. Dropdown Escritorio */}
                                                <div className="relative min-w-[90px] flex-shrink-0">
                                                    {(() => {
                                                        const secondary = estados.filter(e => !['A', 'F', 'JI', 'TO', 'AT'].includes(e.codigo));
                                                        const activeSecondary = secondary.find(e => e.id === state.estado_id);
                                                        return (
                                                            <div className="relative h-8 group/select">
                                                                <select
                                                                    className={cn(
                                                                        "h-full w-full pl-3 pr-7 rounded-xl text-[10px] font-black uppercase appearance-none border transition-all truncate bg-white outline-none cursor-pointer",
                                                                        activeSecondary ? "text-white border-transparent shadow-md" : "border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-600"
                                                                    )}
                                                                    style={activeSecondary ? { backgroundColor: activeSecondary.color, borderColor: activeSecondary.color } : undefined}
                                                                    value={activeSecondary?.id || ""}
                                                                    disabled={isOutOfRange || !hasPermission('asistencia.guardar') || !!feriadoActual || isSunday || isSaturday}
                                                                    onChange={(e) => {
                                                                        const estId = parseInt(e.target.value);
                                                                        updateAttendance(worker.id, { estado_id: estId, es_sabado: isSaturday });
                                                                    }}
                                                                >
                                                                    <option value="" disabled>{activeSecondary ? activeSecondary.codigo : 'OTRO'}</option>
                                                                    {secondary.map(est => (
                                                                        <option key={est.id} value={est.id}>{est.codigo} - {est.nombre}</option>
                                                                    ))}
                                                                </select>
                                                                <div className={cn(
                                                                    "absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none transition-colors",
                                                                    activeSecondary ? "text-white/70" : "text-slate-300 group-hover/select:text-slate-400"
                                                                )}>
                                                                    <ChevronDown className="h-3 w-3" />
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-end gap-2">
                                                <div className="flex-1">
                                                    <button
                                                        onClick={() => setExpandedWorkerId(isExpanded ? null : worker.id)}
                                                        disabled={isOutOfRange || !!feriadoActual || isSunday || isSaturday}
                                                        title={isOutOfRange ? (isPreContrato ? "Bloqueado: Aún no contratado" : "Bloqueado por Finiquito") : "Ver detalle"}
                                                        className={cn(
                                                            "text-[10px] text-brand-primary font-medium hover:underline w-full text-center",
                                                            (isOutOfRange || !!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed no-underline grayscale"
                                                        )}
                                                    >
                                                        {isExpanded ? 'Cerrar' : 'Detalle'}
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => setCalendarWorker(worker)}
                                                    disabled={!!feriadoActual || isSunday || isSaturday}
                                                    className={cn(
                                                        "p-1.5 rounded-full text-muted-foreground border border-border hover:bg-background hover:text-brand-primary transition-colors flex-shrink-0",
                                                        (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed"
                                                    )}
                                                    title="Ver Calendario"
                                                >
                                                    <CalendarDays className="h-4 w-4" />
                                                </button>
                                                <button
                                                    onClick={() => setPeriodModalWorker(worker)}
                                                    disabled={!!feriadoActual || isSunday || isSaturday}
                                                    className={cn(
                                                        "p-1.5 rounded-full text-brand-primary border border-brand-primary/30 hover:bg-brand-primary/10 hover:text-[#027A3B] transition-colors flex-shrink-0",
                                                        (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed"
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
                                                    disabled={!!feriadoActual || isSunday || isSaturday}
                                                    className={cn(
                                                        "w-full bg-background border border-border rounded-lg px-2 py-1.5 text-[10px] text-center text-brand-dark focus:outline-none focus:border-brand-primary",
                                                        (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed"
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
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Entrada" value={state.hora_entrada || ''} onChange={(val) => updateAttendance(worker.id, { hora_entrada: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Salida" value={state.hora_salida || ''} onChange={(val) => updateAttendance(worker.id, { hora_salida: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Ini." value={state.hora_colacion_inicio || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_inicio: val || null })} />
                                                        <TimeStepperInput disabled={!!feriadoActual || isSunday || isSaturday} label="Colación Fin" value={state.hora_colacion_fin || ''} onChange={(val) => updateAttendance(worker.id, { hora_colacion_fin: val || null })} />
                                                        <div className="col-span-2 md:col-span-1 grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="text-[9px] font-semibold text-muted-foreground uppercase block mb-1">H. Extra</label>
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="24"
                                                                    step="0.5"
                                                                    placeholder="0"
                                                                    disabled={!!feriadoActual || isSunday || isSaturday}
                                                                    className={cn(
                                                                        "w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-center text-brand-dark focus:outline-none focus:border-brand-primary",
                                                                        (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background"
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
                                                                    disabled={!!feriadoActual || isSunday || isSaturday}
                                                                    className={cn(
                                                                        "w-full h-10 md:h-10 bg-white border border-border rounded-xl px-3 text-sm text-brand-dark focus:outline-none focus:border-brand-primary",
                                                                        (!!feriadoActual || isSunday || isSaturday) && "opacity-50 cursor-not-allowed bg-background"
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
                            )
                        })}
                    </AnimatePresence>
                </div>

                {/* Status Bar */}
                <div className="h-9 bg-[#F8F8FA] border-t border-[#E8E8ED] flex items-center justify-between px-5 text-[11px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-brand-primary/40" />
                        <span>{filteredWorkers.length} {filteredWorkers.length === 1 ? 'trabajador' : 'trabajadores'}</span>
                    </div>
                </div>
            </div>
            )}

            {/* ── Worker Calendar Modal ── */}

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
                onPeriodDeleted={fetchAttendanceInfo}
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
                        : `Documentos: ${selectedWorker?.apellido_paterno} ${selectedWorker?.apellido_materno || ''} ${selectedWorker?.nombres}`
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
                {modalType === 'docs' && selectedWorker && (() => {
                    const worker = selectedWorker; // Local constant for TS
                    return (
                        <div className="flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[#F9F9FB] p-5 rounded-2xl border border-[#E8E8ED]">
                                <div>
                                    <h4 className="text-base font-bold text-brand-dark tracking-tight">Bóveda de Documentos</h4>
                                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider opacity-70">
                                        Expediente digital de {worker.apellido_paterno} {worker.nombres}
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {!isUploading && (
                                        <Button
                                            size="sm"
                                            variant="glass"
                                            onClick={async () => {
                                                try {
                                                    const nid = toast.loading('Generando ZIP...');
                                                    const response = await api.get(`/documentos/download-all/${worker.id}`, {
                                                        responseType: 'blob',
                                                    });
                                                    const url = window.URL.createObjectURL(new Blob([response.data]));
                                                    const link = document.createElement('a');
                                                    link.href = url;
                                                    link.setAttribute('download', `Documentos_${worker.apellido_paterno}_${worker.nombres}.zip`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    link.remove();
                                                    toast.dismiss(nid);
                                                    toast.success('Descarga iniciada');
                                                } catch (err) {
                                                    toast.error('Error al descargar documentos');
                                                }
                                            }}
                                            className="text-brand-primary font-bold border-brand-primary/20 flex-1 sm:flex-initial"
                                            leftIcon={<FileDown className="h-4 w-4" />}
                                        >
                                            <span className="hidden sm:inline">Descargar (.zip)</span>
                                            <span className="sm:hidden">Descargar</span>
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant={isUploading ? 'glass' : 'primary'}
                                        disabled={!hasPermission('documentos.subir') && !isUploading}
                                        onClick={() => setIsUploading(!isUploading)}
                                        leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                        className={cn(
                                            "flex-1 sm:flex-initial font-bold shadow-sm",
                                            (!hasPermission('documentos.subir') && !isUploading) && "opacity-50 grayscale cursor-not-allowed"
                                        )}
                                        title={(!hasPermission('documentos.subir') && !isUploading) ? "No tienes permisos" : (isUploading ? "Volver" : "Subir Documento")}
                                    >
                                        <span className="hidden sm:inline">{isUploading ? 'Volver a la lista' : 'Subir Documento'}</span>
                                        <span className="sm:hidden">{isUploading ? 'Volver' : 'Subir'}</span>
                                    </Button>
                                </div>
                            </div>

                            {isUploading ? (
                                <DocumentUploader
                                    trabajadorId={worker.id}
                                    onCancel={() => setIsUploading(false)}
                                    onSuccess={() => {
                                        setIsUploading(false);
                                        fetchAttendanceInfo();
                                    }}
                                />
                            ) : (
                                <DocumentList trabajadorId={worker.id} />
                            )}
                        </div>
                    );
                })()}
            </Modal>
        </div>
    );
};

export default AttendancePage;

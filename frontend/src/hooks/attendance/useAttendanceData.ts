import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia, ConfiguracionHorario, Feriado } from '../../types/entities';
import type { ApiResponse } from '../../types';

export type AlertaFalta = { trabajador_id: number; total_faltas: number; alertas: { tipo: string; mensaje: string }[] };

export function useAttendanceData() {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [horariosObra, setHorariosObra] = useState<ConfiguracionHorario[]>([]);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [feriadoActual, setFeriadoActual] = useState<Feriado | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
    const [alertasFaltas, setAlertasFaltas] = useState<AlertaFalta[]>([]);
    const [reportMonth, setReportMonth] = useState((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [reportYear, setReportYear] = useState(new Date().getFullYear().toString());

    const defaultEstado = useMemo(() =>
        estados.find(e => e.codigo === 'A') || estados.find(e => e.es_presente) || estados[0],
        [estados]
    );

    // Initial load for estados
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
        if (!defaultEstado) return;
        const isGlobal = !selectedObra;
        if (isGlobal && !hasPermission('asistencia.tomar.global')) return;

        setLoading(true);
        try {
            const globalObraId = isGlobal ? 'ALL' : selectedObra.id;

            const [workersRes, attendanceRes, schedulesRes] = await Promise.all([
                api.get<ApiResponse<Trabajador[]>>(`/trabajadores?activo=true&limit=5000${isGlobal ? '' : `&obra_id=${selectedObra.id}`}`),
                api.get<ApiResponse<{ registros: Asistencia[], feriado: Feriado }>>(`/asistencias/obra/${globalObraId}?fecha=${date}`),
                api.get<ApiResponse<ConfiguracionHorario[]>>(`/config-horarios/obra/${globalObraId}`)
            ]);

            let workerList = workersRes.data.data.filter(w => Boolean(w.activo) !== false);

            const attendanceData = attendanceRes.data.data;
            const existing = attendanceData.registros;
            setFeriadoActual(attendanceData.feriado || null);
            setHorariosObra(schedulesRes.data.data || []);

            const newAttendance: Record<number, Partial<Asistencia>> = {};
            const dowMap = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'] as const;
            const dayIndex = new Date(date + 'T12:00:00').getDay();
            const dayStr = dowMap[dayIndex];

            workerList.forEach(w => {
                const currentSchedule = isGlobal 
                    ? schedulesRes.data.data.find(h => h.obra_id === w.obra_id && h.dia_semana === dayStr)
                    : schedulesRes.data.data.find(h => h.dia_semana === dayStr);

                const record = existing.find(a => a.trabajador_id === w.id);
                if (record) {
                    newAttendance[w.id] = record;
                } else {
                    const newRecord: Partial<Asistencia> = {
                        trabajador_id: w.id,
                        obra_id: (isGlobal ? w.obra_id : selectedObra.id) ?? undefined,
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

                    if (defaultEstado.es_presente && currentSchedule) {
                        newRecord.hora_entrada = currentSchedule.hora_entrada.substring(0, 5);
                        newRecord.hora_salida = currentSchedule.hora_salida.substring(0, 5);
                        newRecord.hora_colacion_inicio = currentSchedule.hora_colacion_inicio.substring(0, 5);
                        newRecord.hora_colacion_fin = currentSchedule.hora_colacion_fin.substring(0, 5);
                    }
                    newAttendance[w.id] = newRecord;
                }
            });

            // Trasladados
            const workerIds = new Set(workerList.map(w => w.id));
            const transferredRecords = existing.filter(a => !workerIds.has(a.trabajador_id));
            const transferredWorkers: Trabajador[] = transferredRecords.map(a => ({
                id: a.trabajador_id,
                rut: (a as any).rut || '',
                nombres: (a as any).nombres || '',
                apellido_paterno: (a as any).apellido_paterno || '',
                apellido_materno: '',
                cargo_id: (a as any).cargo_id || null,
                cargo_nombre: (a as any).cargo_nombre || '',
                obra_id: isGlobal ? ((a as any).obra_id ?? undefined) : selectedObra.id,
                empresa_id: 0,
                activo: true,
                categoria_reporte: 'obra',
            } as Trabajador));

            transferredWorkers.forEach(tw => {
                const record = existing.find(a => a.trabajador_id === tw.id);
                if (record) {
                    newAttendance[tw.id] = record;
                }
            });
            workerList = [...workerList, ...transferredWorkers];

            setWorkers(workerList);
            setAttendance(newAttendance);

            try {
                const dateObj = new Date(date + 'T12:00:00');
                const mes = dateObj.getMonth() + 1;
                const anio = dateObj.getFullYear();
                const alertasRes = await api.get(`/asistencias/alertas/${globalObraId}?mes=${mes}&anio=${anio}`);
                setAlertasFaltas(alertasRes.data?.data || []);
            } catch {
                setAlertasFaltas([]);
            }
        } catch (err) {
            toast.error('Error al cargar datos de asistencia');
        } finally {
            setLoading(false);
        }
    }, [selectedObra, date, defaultEstado, hasPermission]);

    useEffect(() => {
        if (defaultEstado && (selectedObra || hasPermission('asistencia.tomar.global'))) {
            fetchAttendanceInfo();
        }
    }, [fetchAttendanceInfo, defaultEstado, selectedObra, hasPermission]);

    const updateAttendance = (workerId: number, data: Partial<Asistencia>) => {
        setAttendance(prev => ({
            ...prev,
            [workerId]: { ...prev[workerId], ...data }
        }));
    };

    const navigateDate = (offset: number) => {
        const d = new Date(date + 'T12:00:00');
        d.setDate(d.getDate() + offset);
        setDate(d.toISOString().split('T')[0]);
    };

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

    const filteredWorkers = useMemo(() => {
        let result = workers.filter(w => {
            if (!w.activo) return false;
            const fIngreso = w.fecha_ingreso ? String(w.fecha_ingreso).split('T')[0] : null;
            const fDesvinc = w.fecha_desvinculacion ? String(w.fecha_desvinculacion).split('T')[0] : null;
            const isDesvinculado = fDesvinc ? date > fDesvinc : false;
            const isPreContrato = fIngreso ? date < fIngreso : false;
            return !isDesvinculado && !isPreContrato;
        });

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
                    .replace(/[\u0300-\u036f]/g, "");
            };
            return getFullNameSort(a).localeCompare(getFullNameSort(b), 'es', { sensitivity: 'base' });
        });
    }, [workers, searchQuery, selectedEmpresaId, date]);

    const summary = useMemo(() => {
        const counts: Record<string, { count: number; estado: EstadoAsistencia }> = {};
        estados.forEach(e => { counts[e.id] = { count: 0, estado: e }; });

        let total = 0;
        filteredWorkers.forEach(w => {
            const a = attendance[w.id];
            if (a && a.estado_id && counts[a.estado_id]) {
                counts[a.estado_id].count++;
                total++;
            }
        });

        const presentes = Object.values(counts)
            .filter(c => c.estado.es_presente)
            .reduce((sum, c) => sum + c.count, 0);

        return {
            total,
            presentes,
            porcentaje: total > 0 ? Math.round((presentes / total) * 100) : 0,
            desglose: Object.values(counts).filter(c => c.count > 0)
        };
    }, [attendance, estados, filteredWorkers]);

    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const isSaturday = dayOfWeek === 6;
    const isSunday = dayOfWeek === 0;

    return {
        date, setDate, navigateDate,
        loading,
        workers, filteredWorkers, availableEmpresas,
        attendance, updateAttendance,
        horariosObra, estados, feriadoActual, setFeriadoActual,
        searchQuery, setSearchQuery,
        selectedEmpresaId, setSelectedEmpresaId,
        alertasFaltas,
        reportMonth, setReportMonth,
        reportYear, setReportYear,
        fetchAttendanceInfo,
        summary,
        isSaturday, isSunday,
    };
}

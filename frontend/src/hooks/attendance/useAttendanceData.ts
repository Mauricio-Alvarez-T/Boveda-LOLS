import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia, ConfiguracionHorario, Feriado } from '../../types/entities';
import type { ApiResponse } from '../../types';

export type AlertaFalta = { trabajador_id: number; total_faltas: number; alertas: { tipo: string; mensaje: string }[] };

// Normaliza string para búsqueda: lowercase + quita tildes (NFD) + trim.
// Centralizar acá garantiza que todos los matches usen el mismo criterio.
const STRIP_DIACRITICS = /[̀-ͯ]/g;
const normalize = (s: string | null | undefined): string =>
    (s ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(STRIP_DIACRITICS, '')
        .trim();

export function useAttendanceData() {
    const { selectedObra } = useObra();
    const { hasPermission } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [attendance, setAttendance] = useState<Record<number, Partial<Asistencia>>>({});
    const [horariosObra, setHorariosObra] = useState<ConfiguracionHorario[]>([]);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [feriadoActual, setFeriadoActual] = useState<Feriado | null>(null);
    // Lee ?q=... de la URL al montar (usado desde el dashboard para saltar
    // directo al trabajador con alerta de inasistencia).
    const [searchQuery, setSearchQueryRaw] = useState(() => searchParams.get('q') || '');

    // Perf: con 183 trabajadores, cada keystroke recompute filteredWorkers +
    // re-render de filas + sync URL. En máquinas modestas el render bloquea el
    // input y se pierden chars ("mauricio" → "murico"). Dos optimizaciones:
    //   1) useDeferredValue: filter usa el valor "atrasado", el input usa el
    //      inmediato → typing siempre fluido aunque la lista se filtre con
    //      micro-retardo imperceptible.
    //   2) URL sync debounced 350 ms — evita push al history en cada tecla
    //      (también costoso; setSearchParams crea un nuevo objeto cada llamada).
    const deferredSearchQuery = useDeferredValue(searchQuery);
    const urlSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Wrapper que mantiene el query param sincronizado con el estado — así el
    // enlace compartido refleja el filtro y un refresh lo preserva.
    const setSearchQuery = useCallback((val: string) => {
        setSearchQueryRaw(val);
        if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
        urlSyncTimerRef.current = setTimeout(() => {
            setSearchParams(prev => {
                const next = new URLSearchParams(prev);
                if (val) next.set('q', val);
                else next.delete('q');
                return next;
            }, { replace: true });
        }, 350);
    }, [setSearchParams]);

    // Cleanup timer on unmount — evita warning "setSearchParams on unmounted".
    useEffect(() => () => {
        if (urlSyncTimerRef.current) clearTimeout(urlSyncTimerRef.current);
    }, []);

    // Si cambia el query param externamente (navegación desde otra página),
    // sincronizar el estado local.
    useEffect(() => {
        const q = searchParams.get('q') || '';
        setSearchQueryRaw(prev => (prev === q ? prev : q));
    }, [searchParams]);
    const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | null>(null);
    const [statusFilter, setStatusFilter] = useState<number | null>(null);
    const [alertasFaltas, setAlertasFaltas] = useState<AlertaFalta[]>([]);
    // reportMonth/reportYear inicializan desde la fecha del calendario diario
    // (no desde "hoy") para que el export en modo "Todas las Obras" respete
    // el período que el usuario está revisando. Se sincroniza vía useEffect
    // cuando `date` cambia (navegación de calendario).
    const initialYear = date.split('-')[0];
    const initialMonth = date.split('-')[1];
    const [reportMonth, setReportMonth] = useState(initialMonth);
    const [reportYear, setReportYear] = useState(initialYear);

    // Sync reportMonth/reportYear con la fecha activa del calendario.
    // Si el usuario navega a otro mes en pestaña Diaria, el selector del
    // Reporte Global se actualiza automáticamente — evita el bug de
    // descargar el mes en curso cuando se está revisando un mes pasado.
    useEffect(() => {
        const [y, m] = date.split('-');
        if (y && m) {
            setReportYear(y);
            setReportMonth(m);
        }
    }, [date]);

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
                        horas_extra: 0
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

    // Corpus pre-normalizado por worker: se calcula una sola vez cuando cambian
    // los workers (no por keystroke). Cada item contiene un "blob" con todos los
    // campos buscables concatenados ya en lowercase + sin tildes, lo que permite
    // que `filteredWorkers` haga solo `String.includes` baratos por keystroke.
    //
    // Campos incluidos: apellido_paterno, apellido_materno, nombres (con todos
    // los nombres separados por espacios), rut (formateado y colapsado),
    // empresa_nombre y cargo_nombre. Esto habilita buscar por cualquier combo
    // de nombres + apellidos + empresa + cargo + rut sin l\u00f3gica especial.
    const searchableWorkers = useMemo(() => {
        return workers.map(w => {
            const rut = w.rut || '';
            const rutCollapsed = rut.replace(/[\s.-]/g, '');
            const blob = normalize(
                `${w.apellido_paterno || ''} ${w.apellido_materno || ''} ${w.nombres || ''} ${rut} ${rutCollapsed} ${w.empresa_nombre || ''} ${w.cargo_nombre || ''}`
            );
            return { worker: w, blob, rutCollapsed };
        });
    }, [workers]);

    // Sort estable por nombre \u2014 independiente del query. Se recalcula solo
    // cuando cambia la lista de workers, no en cada tecla del input.
    const sortedSearchable = useMemo(() => {
        return [...searchableWorkers].sort((a, b) =>
            a.blob.localeCompare(b.blob, 'es', { sensitivity: 'base' })
        );
    }, [searchableWorkers]);

    const filteredWorkers = useMemo(() => {
        // Filtros estructurales: activo, rango contractual, empresa, estado de
        // asistencia. Estos no dependen del query.
        let result = sortedSearchable.filter(({ worker: w }) => {
            if (!w.activo) return false;
            const fIngreso = w.fecha_ingreso ? String(w.fecha_ingreso).split('T')[0] : null;
            const fDesvinc = w.fecha_desvinculacion ? String(w.fecha_desvinculacion).split('T')[0] : null;
            const isDesvinculado = fDesvinc ? date > fDesvinc : false;
            const isPreContrato = fIngreso ? date < fIngreso : false;
            if (isDesvinculado || isPreContrato) return false;
            if (selectedEmpresaId !== null && w.empresa_id !== selectedEmpresaId) return false;
            if (statusFilter !== null) {
                const a = attendance[w.id];
                if (!a || a.estado_id !== statusFilter) return false;
            }
            return true;
        });

        // B\u00fasqueda multi-token con AND: tipe\u00e1s "juan perez" y trae a quien tenga
        // AMBOS tokens en el corpus. Habilita cualquier combo nombre+apellido,
        // empresa+nombre, cargo+empresa, etc. Cada token es independiente y se
        // matchea por substring contra el blob ya normalizado.
        const q = deferredSearchQuery.trim();
        if (q) {
            const tokens = normalize(q).split(/\s+/).filter(Boolean);
            result = result.filter(({ blob, rutCollapsed }) => {
                return tokens.every(t => {
                    if (blob.includes(t)) return true;
                    // Match alternativo de RUT: tipe\u00e1s "123456789" y matchea
                    // "12.345.678-9". Solo aplicamos si el token parece RUT
                    // (>=3 chars tras colapsar) para no producir falsos
                    // positivos con tokens cortos.
                    const tCollapsed = t.replace(/[\s.-]/g, '');
                    return tCollapsed.length >= 3 && rutCollapsed.includes(tCollapsed);
                });
            });
        }

        return result.map(({ worker }) => worker);
    }, [sortedSearchable, deferredSearchQuery, selectedEmpresaId, statusFilter, attendance, date]);

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
        statusFilter, setStatusFilter,
        alertasFaltas,
        reportMonth, setReportMonth,
        reportYear, setReportYear,
        fetchAttendanceInfo,
        summary,
        isSaturday, isSunday,
    };
}

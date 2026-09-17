import { useState, useEffect, useCallback, useMemo, useDeferredValue, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useObra } from '../../context/ObraContext';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import type { Trabajador, Asistencia, EstadoAsistencia, ConfiguracionHorario, Feriado } from '../../types/entities';
import type { ApiResponse } from '../../types';
import { indexar, tokenizar, coincide } from '../../utils/busquedaTrabajadores';

export type AlertaFalta = { trabajador_id: number; total_faltas: number; alertas: { tipo: string; mensaje: string }[] };

// Qué significa que un texto «coincida» con un trabajador vive en utils/busquedaTrabajadores.ts
// (2026-09-17): estaba acá, privado y sin test, y Gestiones volvió a caer en el mismo bug de
// teclas perdidas por no tenerlo a mano. Ahora las dos pantallas responden igual y hay tests.

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
    // Períodos activos del día (V/LM/etc. asignados por calendario), keyed
    // `${trabajador_id}_${estado_id}` → rango. Para mostrar el rango en la fila.
    const [periodosMap, setPeriodosMap] = useState<Record<string, { fecha_inicio: string; fecha_fin: string }>>({});
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

    // Cancela la carga anterior cuando cambia fecha/obra (evita 4 requests apiladas → 429).
    const abortRef = useRef<AbortController | null>(null);

    const fetchAttendanceInfo = useCallback(async () => {
        if (!defaultEstado) return;
        const isGlobal = !selectedObra;
        if (isGlobal && !hasPermission('asistencia.tomar.global')) return;

        // Cancelar la carga anterior en vuelo y abrir una nueva.
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;

        setLoading(true);
        try {
            const globalObraId = isGlobal ? 'ALL' : selectedObra.id;

            const [workersRes, attendanceRes, schedulesRes] = await Promise.all([
                api.get<ApiResponse<Trabajador[]>>(`/trabajadores?activo=true&limit=5000${isGlobal ? '' : `&obra_id=${selectedObra.id}`}`, { signal: controller.signal }),
                api.get<ApiResponse<{ registros: Asistencia[], feriado: Feriado }>>(`/asistencias/obra/${globalObraId}?fecha=${date}`, { signal: controller.signal }),
                api.get<ApiResponse<ConfiguracionHorario[]>>(`/config-horarios/obra/${globalObraId}`, { signal: controller.signal })
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

            // Períodos del día (solo con obra seleccionada; el endpoint requiere obra_id).
            // Reusa el mismo endpoint que el export. Enriquece las filas con rango V/LM/etc.
            if (!isGlobal) {
                try {
                    const periodsRes = await api.get<{ data: Array<{ trabajador_id: number; estado_id: number; fecha_inicio: string; fecha_fin: string }> }>(
                        `/asistencias/periodos?obra_id=${selectedObra.id}&fecha_inicio=${date}&fecha_fin=${date}&activo=true`,
                        { signal: controller.signal }
                    );
                    const map: Record<string, { fecha_inicio: string; fecha_fin: string }> = {};
                    for (const p of (periodsRes.data?.data || [])) {
                        map[`${p.trabajador_id}_${p.estado_id}`] = { fecha_inicio: p.fecha_inicio, fecha_fin: p.fecha_fin };
                    }
                    setPeriodosMap(map);
                } catch (e) {
                    if ((e as { code?: string })?.code !== 'ERR_CANCELED') setPeriodosMap({});
                }
            } else {
                setPeriodosMap({});
            }

            try {
                const dateObj = new Date(date + 'T12:00:00');
                const mes = dateObj.getMonth() + 1;
                const anio = dateObj.getFullYear();
                const alertasRes = await api.get(`/asistencias/alertas/${globalObraId}?mes=${mes}&anio=${anio}`, { signal: controller.signal });
                setAlertasFaltas(alertasRes.data?.data || []);
            } catch (e) {
                // No pisar el estado si fue cancelada por un reemplazo.
                if ((e as { code?: string })?.code !== 'ERR_CANCELED') setAlertasFaltas([]);
            }
        } catch (err) {
            // Carga cancelada por un cambio de fecha/obra más nuevo → no es error.
            if ((err as { code?: string })?.code === 'ERR_CANCELED') return;
            toast.error('Error al cargar datos de asistencia');
        } finally {
            // Solo apagar el spinner si esta sigue siendo la carga vigente
            // (un request cancelado no debe apagar el de su reemplazo).
            if (abortRef.current === controller) setLoading(false);
        }
    }, [selectedObra, date, defaultEstado, hasPermission]);

    useEffect(() => {
        if (defaultEstado && (selectedObra || hasPermission('asistencia.tomar.global'))) {
            fetchAttendanceInfo();
        }
        // Abortar la carga en vuelo al cambiar fecha/obra o al desmontar.
        return () => abortRef.current?.abort();
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

    // Corpus pre-normalizado por worker: se calcula una sola vez cuando cambian los workers (no por
    // keystroke), para que el filtrado por tecla sea solo `String.includes` barato. Qu\u00e9 entra al corpus
    // y qu\u00e9 cuenta como coincidencia est\u00e1 en `utils/busquedaTrabajadores.ts`, compartido con Gestiones.
    const searchableWorkers = useMemo(
        // Sin `incluirObra`: acá la lista ya viene acotada a una obra, así que su nombre es el mismo
        // para todos y meterlo en el corpus haría que un token suyo devolviera la lista entera.
        () => workers.map(w => ({ worker: w, idx: indexar(w) })),
        [workers]
    );

    // Sort estable por nombre \u2014 independiente del query. Se recalcula solo
    // cuando cambia la lista de workers, no en cada tecla del input.
    const sortedSearchable = useMemo(() => {
        return [...searchableWorkers].sort((a, b) =>
            // Por `nombreNorm` («apellidos nombres») y no por el blob: el blob lleva RUT y cargo, así
            // que el orden dependería de qué campos sean buscables.
            a.idx.nombreNorm.localeCompare(b.idx.nombreNorm, 'es', { sensitivity: 'base' })
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

        // Búsqueda multi-token con AND: las reglas (blob, alias de empresa por prefijo, RUT
        // colapsado) viven en `utils/busquedaTrabajadores.ts`, compartidas con Gestiones.
        const tokens = tokenizar(deferredSearchQuery);
        if (tokens.length) result = result.filter(({ idx }) => coincide(idx, tokens));

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
        alertasFaltas, periodosMap,
        reportMonth, setReportMonth,
        reportYear, setReportYear,
        fetchAttendanceInfo,
        summary,
        isSaturday, isSunday,
    };
}

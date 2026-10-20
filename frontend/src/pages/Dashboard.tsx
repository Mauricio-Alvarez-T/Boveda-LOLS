import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';
import { CheckSquare, FileWarning, Package, RefreshCw, SearchCheck, Truck, UserX } from 'lucide-react';

// Widgets
import VehicleExpiries from '../components/dashboard/widgets/VehicleExpiries';
import BandejaDelDia, { type PendingTask, type BandejaItem } from '../components/dashboard/widgets/BandejaDelDia';
import { useVencimientosVehiculos } from '../hooks/useVencimientosVehiculos';
import { useSolicitudesIngreso } from '../hooks/useSolicitudesIngreso';
import { useLotesPendientes } from '../hooks/useLotesPendientes';
import { filasBandejaLotes } from '../components/documentos-fisicos/documentosFisicos';
import { useDocumentosAlertas } from '../hooks/useDocumentosAlertas';
import { filasBandejaAlertas } from '../components/documentos-fisicos/documentosAlertas';
import type { DashboardAlerta } from '../hooks/inventario/useDashboardEjecutivo';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import ObraRanking from '../components/dashboard/widgets/ObraRanking';
import ActividadesSemana from '../components/dashboard/widgets/ActividadesSemana';
import AsistenciaPendiente from '../components/dashboard/widgets/AsistenciaPendiente';
import DocumentosInicio from '../components/dashboard/widgets/DocumentosInicio';
import { resumenDocumentosInicio } from '../components/dashboard/widgets/resumenDocumentosInicio';
import FaltasMes, { FilaFalta } from '../components/dashboard/widgets/FaltasMes';
import InventarioInicio, { FilaInventarioInicio } from '../components/dashboard/widgets/InventarioInicio';
import { resumenInventarioInicio, type FilaInventario, type ResumenInventarioApi } from '../components/dashboard/widgets/resumenInventarioInicio';
import TarjetaPendientes from '../components/dashboard/widgets/TarjetaPendientes';
import DocumentosAtrasadosLista from '../components/dashboard/widgets/DocumentosAtrasadosLista';
import { DetalleModulo } from '../components/dashboard/widgets/DetalleModulo';
import { EncabezadoTarjeta, TarjetaActiva } from '../components/dashboard/widgets/EncabezadoTarjeta';
import { nombreMes, type FaltasMesData, type TrabajadorFaltas } from '../components/dashboard/widgets/resumenFaltasMes';
import { contarBandeja } from '../components/dashboard/widgets/bandejaConteo';
import { fechaDelDia, resumenDelDia } from '../utils/resumenInicio';
import { AvisoAtrasosPortador } from '../components/documentos-fisicos/AvisoAtrasosPortador';

// ─── Types ───
interface DocExpiryItem {
    fecha: string;
    tipo_documento: string;
    trabajador: string;
    trabajador_id: number;
    rut: string;
    obra: string;
}

interface ObraRankingItem {
    id: number;
    nombre: string;
    trabajadores: number;
    asistencia_tasa: number;
    docs_completos_pct: number;
    asistencia_guardada: boolean;
}

interface AttendanceStatusEntry {
    nombre: string;
    guardada: boolean;
}

interface DashboardData {
    counters: {
        trabajadores?: number;
        documentos?: number;
        vencidos?: number;
        porVencer7d?: number;
        trabajadoresSinDocs?: number;
        asistencia_hoy?: number;
        ausentes_hoy?: number;
    };
    deltas: {
        trabajadores_nuevos_semana?: number;
        docs_vencidos_hoy?: number;
        asistencia_delta?: number;
        ausentes_delta?: number;
    };
    recentActivity: any[];
    obraDistribution: any[];
    attendanceTrend: { fecha: string; tasa: number }[];
    ausentesDetalle?: { nombres: string; apellido_paterno: string; apellido_materno?: string | null; estado: string; obra: string }[];
    alerts: { tipo: 'critical' | 'warning' | 'info'; titulo: string; mensaje: string; count: number; ruta: string }[];
    pendingTasks: PendingTask[];
    docExpiryTimeline: DocExpiryItem[];
    obraRanking: ObraRankingItem[];
    attendanceStatus: Record<string, AttendanceStatusEntry>;
    // Faltas reiteradas del mes (Art. 160 N°3); incluye fechas[] (strip de evidencia).
    trabajadoresConAlertas: TrabajadorFaltas[];
    /** Reiterados del mes con su total real (tarjeta «Asistencia»); null si el backend no pudo calcularlo. */
    faltasMes?: FaltasMesData | null;
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Panel: tarjeta blanca del Inicio (2026-10-16): sin borde, sombra suave (en oscuro la sombra
// trae su anillo de 1 px), esquinas grandes. El color va en el círculo de cada encabezado
// (EncabezadoTarjeta), nunca en el fondo.
const Panel: React.FC<{ children: React.ReactNode; className?: string; onClick?: () => void; activa?: boolean }> = ({ children, className, onClick, activa = false }) => (
    <div
        className={cn('rounded-3xl bg-card text-foreground p-6 shadow-[var(--shadow-md)]',
            onClick && 'cursor-pointer transition-[background-color,box-shadow] duration-200 hover:ring-1 hover:ring-border',
            activa && 'tarjeta-activa', className)}
        // Tarjeta entera pinchable (atajo con mouse/dedo): los botones y enlaces de adentro mandan sobre ella.
        // Con teclado, el camino es su botón «Ver más».
        onClick={onClick ? (e) => {
            if ((e.target as HTMLElement).closest('button, a, input, select, textarea, [role="button"]')) return;
            onClick();
        } : undefined}
    >
        <TarjetaActiva.Provider value={activa}>{children}</TarjetaActiva.Provider>
    </div>
);

/** Columnas de la fila de tarjetas según cuántas ve el perfil: todas en una línea desde 1280 px. */
const COLUMNAS: Record<number, string> = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
};

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [invItems, setInvItems] = useState<BandejaItem[]>([]);

    // Vencimientos de vehículos: mismo store que el badge del menú (una sola
    // request compartida). Desde el Inicio H van en su propia tarjeta, no en la bandeja.
    const vencimientos = useVencimientosVehiculos();
    const vehiculosVencidos = useMemo(
        () => vencimientos.items.filter(v => Number(v.dias_restantes) < 0).length,
        [vencimientos.items],
    );

    const permisos = user?.permisos ?? [];
    const canInventario = permisos.includes('inventario.ver');
    // El WidgetRegistry solo expresa permisos de 2 niveles (modulo.accion), así que este
    // widget se gatea directo con la clave granular (mismo criterio que canInventario).
    const canActividades = permisos.includes('asistencia.actividades_sugeridas.ver');

    // Solicitudes de ingreso pendientes (ficha digital): mismo store que el badge de
    // Consultas. Una sola fila-resumen, solo para quien aprueba y solo si hay algo.
    const solicitudes = useSolicitudesIngreso();
    const canAprobarSolicitudes = permisos.includes('trabajadores.solicitud.aprobar');
    const solicitudItems = useMemo((): BandejaItem[] => {
        const n = solicitudes.pendientes;
        if (!canAprobarSolicitudes || n <= 0) return [];
        return [{
            severity: 'warning',
            title: `${n} solicitud${n === 1 ? '' : 'es'} de ingreso pendiente${n === 1 ? '' : 's'}`,
            description: 'Fichas de terreno por revisar: aprobar crea al trabajador',
            ruta: '/consultas?tab=solicitudes',
        }];
    }, [canAprobarSolicitudes, solicitudes.pendientes]);
    // Documentos físicos (B6): mismo store que el botón de Gestiones. El backend ya recorta el alcance
    // (portador: sus lotes; RRHH: todos); sin permiso el hook devuelve null y no hay filas.
    const lotes = useLotesPendientes();
    // B7: RRHH ve lo que superó su UMBRAL (por tipo + lotes atascados, con críticos); el portador, que no tiene
    // esas alertas, ve el contador simple de sus lotes por confirmar.
    const alertasDocs = useDocumentosAlertas();
    const canRegistrarEntregas = permisos.includes('documentos.entrega.registrar');
    const documentosFisicosItems = useMemo((): BandejaItem[] => (
        canRegistrarEntregas
            ? filasBandejaAlertas(alertasDocs.alertas)
            : filasBandejaLotes(lotes.pendientes).map(f => ({ ...f, ruta: '/consultas?tab=fisicos' }))
    ), [canRegistrarEntregas, alertasDocs.alertas, lotes.pendientes]);
    // Impresos que aún no van en ningún lote (la cifra de la cabecera de Documentos físicos). Solo RRHH.
    const [impresosSinAsignar, setImpresosSinAsignar] = useState<number | null>(null);
    const { visibleWidgets } = useDashboardLayout(user?.id ?? 0, permisos);

    // Widgets que el usuario puede ver (gating por permiso granular). El layout es
    // fijo; el permiso decide qué zonas se montan, no el orden.
    const shown = useMemo(() => new Set(visibleWidgets.map(w => w.id)), [visibleWidgets]);

    // ─── Fetch Data (reutilizable para el botón refrescar) ───
    const fetchSummary = useCallback(async () => {
        setLoading(true);
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<DashboardData>>(`/dashboard/summary${query}`);
            const raw = res.data.data;
            // Defensive defaults for new fields (backward compat with old backend)
            setData({
                ...raw,
                counters: raw.counters ?? {},
                deltas: raw.deltas ?? {},
                alerts: raw.alerts ?? [],
                pendingTasks: raw.pendingTasks ?? [],
                docExpiryTimeline: raw.docExpiryTimeline ?? [],
                obraRanking: raw.obraRanking ?? [],
                attendanceStatus: raw.attendanceStatus ?? {},
                attendanceTrend: raw.attendanceTrend ?? [],
                ausentesDetalle: raw.ausentesDetalle ?? [],
                trabajadoresConAlertas: raw.trabajadoresConAlertas ?? [],
                saludo: raw.saludo ?? { nombre: '', resumen: '', totalAlertas: 0 },
            });
            setLastUpdated(new Date());
        } catch {
            toast.error('Error al cargar resumen del dashboard');
        } finally {
            setLoading(false);
        }
    }, [selectedObra]);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);

    // Inventario: fetch DIFERIDO y gated por permiso (no bloquea la bandeja de
    // asistencia/docs; si falla o no hay permiso, simplemente no agrega filas).
    const fetchInventory = useCallback(async () => {
        if (!canInventario) { setInvItems([]); return; }
        try {
            const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
            const res = await api.get<ApiResponse<{ alertas: DashboardAlerta[] }>>(`/inventario/dashboard-ejecutivo${query}`);
            const alertas = res.data.data?.alertas ?? [];
            setInvItems(alertas.map((a): BandejaItem => ({
                severity: a.tipo === 'discrepancia'
                    ? 'critical'
                    : (a.estancada || a.tipo === 'faltante' || a.tipo === 'rechazo') ? 'warning' : 'info',
                title: a.titulo,
                description: a.detalle,
                ruta: '/inventario',
            })));
        } catch {
            setInvItems([]);
        }
    }, [canInventario, selectedObra]);

    useEffect(() => { fetchInventory(); }, [fetchInventory]);

    // Global, como la cabecera de Gestiones → Documentos físicos (no se recorta por la obra elegida).
    const fetchImpresos = useCallback(async () => {
        if (!canRegistrarEntregas) { setImpresosSinAsignar(null); return; }
        try {
            const res = await api.get<ApiResponse<unknown[]>>('/documentos-lotes/disponibles');
            setImpresosSinAsignar(res.data.data?.length ?? 0);
        } catch {
            setImpresosSinAsignar(null);
        }
    }, [canRegistrarEntregas]);

    useEffect(() => { fetchImpresos(); }, [fetchImpresos]);

    // Inventario: lo que le toca a quien mira según su perfil (tarjeta «Inventario», dueño 2026-10-20).
    const [resumenInv, setResumenInv] = useState<ResumenInventarioApi | null>(null);
    const fetchResumenInv = useCallback(async () => {
        if (!canInventario) { setResumenInv(null); return; }
        try {
            const res = await api.get<ApiResponse<ResumenInventarioApi>>('/transferencias/inicio');
            setResumenInv(res.data.data ?? null);
        } catch {
            setResumenInv(null);
        }
    }, [canInventario]);

    useEffect(() => { fetchResumenInv(); }, [fetchResumenInv]);

    const { refetch: refetchAlertasDocs } = alertasDocs;
    const { refetch: refetchLotes } = lotes;
    const refreshAll = useCallback(() => {
        fetchSummary(); fetchInventory(); fetchImpresos(); fetchResumenInv(); refetchAlertasDocs(); refetchLotes();
    }, [fetchSummary, fetchInventory, fetchImpresos, fetchResumenInv, refetchAlertasDocs, refetchLotes]);

    // ─── Encabezado: rótulo, fecha y «Actualizar» (antes vivían en la tarjeta verde, que se fue el 2026-10-20) ───
    const hora = lastUpdated ? lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : null;
    const headerTitle = useMemo(() => (
        <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-base font-semibold text-foreground">Inicio</h1>
            <span className="hidden truncate text-sm text-muted-foreground md:inline">{fechaDelDia(new Date())}</span>
            <Button variant="ghost" size="sm" onClick={refreshAll} isLoading={loading} aria-label="Actualizar"
                title={hora ? `Actualizado ${hora}` : undefined} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden />}>
                <span className="hidden sm:inline">Actualizar</span>
            </Button>
        </div>
    ), [refreshAll, loading, hora]);
    useSetPageHeader(headerTitle);

    // Skeletons por-widget. `ready` narrowea `data` a no-null en cada zona.
    const ready = !loading && !!data;
    const showFaltas = shown.has('absence_alerts');
    const showTrend = shown.has('chart_attendance_trend');
    const showAusentes = shown.has('list_absences_today');
    const showVencVehiculos = shown.has('vehiculo_vencimientos');
    const showRanking = shown.has('obra_ranking') && selectedObra == null; // solo ámbito "Todas"

    // Pendientes que no son asistencia (documentos por vencer, contratos de 10 meses): van al detalle de Gestiones.
    const otrasTareas = useMemo(
        () => (data?.pendingTasks ?? []).filter(t => t.category !== 'asistencia'),
        [data?.pendingTasks],
    );
    const otrosPendientes = useMemo(
        () => contarBandeja(otrasTareas, data?.counters.trabajadoresSinDocs ?? 0, [solicitudItems, documentosFisicosItems, invItems]).total,
        [otrasTareas, data?.counters.trabajadoresSinDocs, solicitudItems, documentosFisicosItems, invItems],
    );
    const hoy = new Date();
    const diaSemana = hoy.getDay();
    // Obras con y sin asistencia guardada hoy (detalle de Asistencia).
    const resumen = useMemo(
        () => resumenDelDia(data?.attendanceStatus ?? {}, {
            obraId: selectedObra?.id ?? null,
            vehiculosVencidos: showVencVehiculos ? vehiculosVencidos : 0,
            otrosPendientes,
            diaSemana,
        }),
        [data?.attendanceStatus, selectedObra?.id, showVencVehiculos, vehiculosVencidos, otrosPendientes, diaSemana],
    );
    // `asistencia_hoy` solo llega con permiso de asistencia (dashboard.service, bloque 3).
    const conAsistencia = typeof data?.counters.asistencia_hoy === 'number';
    const verObrasSinGuardar = ready && conAsistencia && resumen.total > 0 && !resumen.finDeSemana;

    // ─── Inicio por módulos (dueño 2026-10-20; diseno.md §9.14) ───
    // Una tarjeta por apartado —Asistencia, Gestiones, Inventario, Vehículos— con lo primero de cada uno y
    // «Ver más»; debajo se despliega el detalle del módulo elegido (parte abierto el primero visible).
    const resumenDocs = useMemo(
        () => resumenDocumentosInicio(alertasDocs.alertas, lotes.pendientes, impresosSinAsignar),
        [alertasDocs.alertas, lotes.pendientes, impresosSinAsignar],
    );
    const modeloInv = useMemo(() => resumenInventarioInicio(resumenInv), [resumenInv]);
    // Gestiones para quien NO registra entregas: sus pendientes de siempre (solicitudes, documentos por
    // vencer, contratos, trabajadores sin documentos, sus lotes de portador), los más graves primero.
    const gestionesItems = useMemo((): BandejaItem[] => {
        const orden = { critical: 0, warning: 1, info: 2 } as const;
        const sinDocs = data?.counters.trabajadoresSinDocs ?? 0;
        return [
            ...solicitudItems,
            ...(canRegistrarEntregas ? [] : documentosFisicosItems),
            ...otrasTareas.map(t => ({ severity: t.severity, title: t.title, description: t.description, ruta: t.action.ruta })),
            ...(sinDocs > 0 ? [{
                severity: 'warning' as const,
                title: `${sinDocs} trabajador${sinDocs === 1 ? '' : 'es'} sin documentos obligatorios`,
                description: 'Completar su carpeta en Gestiones',
                ruta: '/consultas?completitud=faltantes',
            }] : []),
        ].sort((a, b) => orden[a.severity] - orden[b.severity]);
    }, [solicitudItems, canRegistrarEntregas, documentosFisicosItems, otrasTareas, data?.counters.trabajadoresSinDocs]);
    const totalGestiones = useMemo(
        () => contarBandeja(otrasTareas, data?.counters.trabajadoresSinDocs ?? 0, [solicitudItems, canRegistrarEntregas ? [] : documentosFisicosItems]).total,
        [otrasTareas, data?.counters.trabajadoresSinDocs, solicitudItems, canRegistrarEntregas, documentosFisicosItems],
    );

    type Modulo = 'asistencia' | 'gestiones' | 'inventario' | 'vehiculos';
    const verGestiones = canRegistrarEntregas || permisos.includes('trabajadores.ver')
        || permisos.includes('trabajadores.solicitud.crear') || canAprobarSolicitudes
        || permisos.includes('documentos.entrega.portar');
    const visibles: Modulo[] = [
        ...(showFaltas ? ['asistencia' as const] : []),
        ...(verGestiones ? ['gestiones' as const] : []),
        ...(canInventario ? ['inventario' as const] : []),
        ...(showVencVehiculos ? ['vehiculos' as const] : []),
    ];
    const [elegido, setElegido] = useState<Modulo | null>(null);
    // Al entrar no hay detalle abierto (dueño 2026-10-20: «que abajo no haya nada»); pinchar una tarjeta lo
    // abre y pincharla de nuevo lo cierra.
    const activo: Modulo | null = elegido && visibles.includes(elegido) ? elegido : null;
    const detalleRef = useRef<HTMLElement>(null);
    const verMas = useCallback((m: Modulo) => {
        if (elegido === m) { setElegido(null); return; }
        setElegido(m);
        const reducir = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        window.requestAnimationFrame(() => detalleRef.current?.scrollIntoView({ behavior: reducir ? 'auto' : 'smooth', block: 'start' }));
    }, [elegido]);
    const irATrabajador = (rut: string) => navigate(`/asistencia?q=${encodeURIComponent(rut)}`);
    const irAFilaInventario = (f: FilaInventario) => navigate(`/inventario?tab=transferencias&estado=${f.estado}`);
    const mes = nombreMes(hoy);

    return (
        <div className="space-y-6">
            {/* Cartel de atrasos del supervisor que lleva documentos a firmar (pedido de RRHH, 2026-10-19). */}
            <AvisoAtrasosPortador />

            {/* Una tarjeta por apartado, todas en una línea desde 1280 px (2×2 en tablet, una bajo otra en celular). */}
            {visibles.length > 0 && (
                <div className={cn('grid gap-6 items-stretch', COLUMNAS[visibles.length])}>
                    {showFaltas && (
                        <Panel className="h-full" activa={activo === 'asistencia'} onClick={() => verMas('asistencia')}>
                            {ready && data?.faltasMes
                                ? <FaltasMes data={data.faltasMes} mes={mes} onTrabajador={irATrabajador}
                                    activo={activo === 'asistencia'} onVerMas={() => verMas('asistencia')} />
                                : <SkeletonText lines={5} />}
                        </Panel>
                    )}
                    {verGestiones && (
                        <Panel className="h-full" activa={activo === 'gestiones'} onClick={() => verMas('gestiones')}>
                            {canRegistrarEntregas
                                ? <DocumentosInicio resumen={resumenDocs} activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')} />
                                : ready
                                    ? <TarjetaPendientes icon={SearchCheck} titulo="Gestiones" subtitulo="Trabajadores, solicitudes y documentos"
                                        items={gestionesItems} total={totalGestiones} onNavigate={(r) => navigate(r)}
                                        activo={activo === 'gestiones'} onVerMas={() => verMas('gestiones')} modulo="Gestiones" />
                                    : <SkeletonText lines={5} />}
                        </Panel>
                    )}
                    {canInventario && (
                        <Panel className="h-full" activa={activo === 'inventario'} onClick={() => verMas('inventario')}>
                            <InventarioInicio modelo={modeloInv} onFila={irAFilaInventario}
                                activo={activo === 'inventario'} onVerMas={() => verMas('inventario')} />
                        </Panel>
                    )}
                    {showVencVehiculos && (
                        <Panel className="h-full" activa={activo === 'vehiculos'} onClick={() => verMas('vehiculos')}>
                            {vencimientos.loading && vencimientos.items.length === 0
                                ? <SkeletonText lines={5} />
                                : <VehicleExpiries data={vencimientos.items} onNavigate={() => navigate('/vehiculos')}
                                    activo={activo === 'vehiculos'} onVerMas={() => verMas('vehiculos')} />}
                        </Panel>
                    )}
                </div>
            )}

            {/* ─── Detalle del módulo elegido (se irá sumando más información y gráficos) ─── */}
            {activo === 'asistencia' && (
                <DetalleModulo ref={detalleRef} icon={CheckSquare} titulo="Asistencia"
                    descripcion={`Faltas reiteradas de ${mes}, el día de hoy y la tendencia`}
                    accion={{ texto: 'Ir a Asistencia', onClick: () => navigate('/asistencia') }}>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <Panel className="lg:col-span-2">
                            <EncabezadoTarjeta icon={UserX} tono={(data?.faltasMes?.reiterados ?? 0) > 0 ? 'rojo' : 'verde'}
                                titulo={`Faltas reiteradas de ${mes}`}
                                subtitulo="Art. 160 N°3: 2 lunes, 3 o más días o 2 días seguidos en el mes calendario"
                                extra={data?.faltasMes && <span className="text-sm font-semibold tabular-nums text-muted-foreground">{data.faltasMes.reiterados} en total</span>} />
                            {!ready || !data?.faltasMes
                                ? <SkeletonText lines={4} />
                                : data.faltasMes.lista.length === 0
                                    ? <p className="text-sm text-muted-foreground">Nadie tiene faltas reiteradas este mes.</p>
                                    : (
                                        <div className="grid grid-cols-1 gap-x-8 xl:grid-cols-2">
                                            {data.faltasMes.lista.map(t => <FilaFalta key={t.trabajador_id} t={t} conRut onClick={() => irATrabajador(t.rut)} />)}
                                        </div>
                                    )}
                            {data?.faltasMes && data.faltasMes.reiterados > data.faltasMes.lista.length && (
                                <p className="mt-3 text-caption text-muted-foreground">
                                    Mostrando {data.faltasMes.lista.length} de {data.faltasMes.reiterados}. El resto, en Asistencia.
                                </p>
                            )}
                        </Panel>
                        {verObrasSinGuardar && (
                            <Panel>
                                <AsistenciaPendiente sinGuardar={resumen.sinGuardar} total={resumen.total} onNavigate={() => navigate('/asistencia')} />
                            </Panel>
                        )}
                        {showAusentes && ready && data && (
                            <Panel>
                                <AbsencesToday data={data.ausentesDetalle ?? []} total={data.counters.ausentes_hoy} />
                            </Panel>
                        )}
                        {showTrend && (
                            <Panel className="lg:col-span-2">
                                {ready && data
                                    ? <AttendanceTrend data={data.attendanceTrend} onNavigate={() => navigate('/asistencia')} />
                                    : <Skeleton className="h-48 w-full" />}
                            </Panel>
                        )}
                        {/* Trae sus datos (tiene selector de semana), por eso no depende de `ready`. */}
                        {canActividades && (
                            <Panel>
                                <ActividadesSemana />
                            </Panel>
                        )}
                        {showRanking && (
                            <Panel className={canActividades ? undefined : 'lg:col-span-2'}>
                                {ready && data
                                    ? <ObraRanking data={data.obraRanking ?? []} onNavigate={(id) => navigate(`/consultas?obra_id=${id}`)} />
                                    : <SkeletonText lines={5} />}
                            </Panel>
                        )}
                    </div>
                </DetalleModulo>
            )}

            {activo === 'gestiones' && (
                <DetalleModulo ref={detalleRef} icon={SearchCheck} titulo="Gestiones"
                    descripcion={canRegistrarEntregas ? 'Documentos físicos fuera de plazo y el resto de los pendientes' : 'Pendientes de trabajadores, solicitudes y documentos'}
                    accion={{ texto: 'Ir a Gestiones', onClick: () => navigate('/consultas?tab=inicio') }}>
                    <div className={cn('grid grid-cols-1 gap-6', canRegistrarEntregas && 'lg:grid-cols-2')}>
                        {canRegistrarEntregas && (
                            <Panel>
                                <EncabezadoTarjeta icon={FileWarning} tono={resumenDocs.tono} titulo="Documentos físicos fuera de plazo"
                                    subtitulo="Por etapa, con quién los tiene y hace cuántos días" />
                                <DocumentosAtrasadosLista alertas={alertasDocs.alertas} onAbrir={() => navigate('/consultas?tab=fisicos')} />
                            </Panel>
                        )}
                        <Panel>
                            {ready && data
                                ? <BandejaDelDia
                                    titulo="Otros pendientes"
                                    vacio={{ titulo: 'Nada más por resolver', descripcion: 'Sin solicitudes, documentos por vencer, contratos ni trabajadores sin documentos.' }}
                                    tasks={otrasTareas}
                                    trabajadoresSinDocs={data.counters.trabajadoresSinDocs}
                                    solicitudItems={solicitudItems}
                                    documentosFisicosItems={canRegistrarEntregas ? [] : documentosFisicosItems}
                                    onNavigate={(route) => navigate(route)}
                                />
                                : <SkeletonText lines={6} />}
                        </Panel>
                    </div>
                </DetalleModulo>
            )}

            {activo === 'inventario' && (
                <DetalleModulo ref={detalleRef} icon={Package} titulo="Inventario"
                    descripcion="Solicitudes que te tocan y alertas de transferencias"
                    accion={{ texto: 'Ir a Inventario', onClick: () => navigate('/inventario?tab=transferencias') }}>
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <Panel>
                            <EncabezadoTarjeta icon={Package} tono={modeloInv.tono} titulo="Solicitudes" subtitulo="Según tu perfil: aprobar, despachar, recibir y las tuyas" />
                            {modeloInv.filas.length === 0
                                ? <p className="text-sm text-muted-foreground">{resumenInv ? 'Tu perfil no tiene solicitudes por revisar.' : 'Cargando…'}</p>
                                : <div>{modeloInv.filas.map(f => <FilaInventarioInicio key={f.clave} f={f} onClick={() => irAFilaInventario(f)} />)}</div>}
                        </Panel>
                        <Panel>
                            <BandejaDelDia
                                titulo="Alertas de inventario"
                                vacio={{ titulo: 'Sin alertas', descripcion: 'Ninguna transferencia atrasada, rechazada ni con diferencias.' }}
                                tasks={[]}
                                inventoryItems={invItems}
                                grupoAbierto="inventario"
                                onNavigate={(route) => navigate(route)}
                            />
                        </Panel>
                    </div>
                </DetalleModulo>
            )}

            {activo === 'vehiculos' && (
                <DetalleModulo ref={detalleRef} icon={Truck} titulo="Vehículos"
                    descripcion="Todos los vencimientos de los próximos 30 días"
                    accion={{ texto: 'Ir a Vehículos', onClick: () => navigate('/vehiculos') }}>
                    <Panel>
                        <VehicleExpiries data={vencimientos.items} onNavigate={() => navigate('/vehiculos')} maxFilas={Number.POSITIVE_INFINITY} />
                    </Panel>
                </DetalleModulo>
            )}
        </div>
    );
};

export default Dashboard;

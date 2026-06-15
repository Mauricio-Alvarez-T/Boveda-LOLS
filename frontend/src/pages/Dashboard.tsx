import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck, UserX, FileWarning, Users, RefreshCw, Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useDashboardLayout } from '../hooks/useDashboardLayout';
import { Skeleton, SkeletonText } from '../components/ui/Skeleton';
import { Button } from '../components/ui/Button';

// Widgets
import TodayHero from '../components/dashboard/widgets/TodayHero';
import KpiCard from '../components/dashboard/widgets/KpiCard';
import BandejaDelDia, { type PendingTask, type BandejaInvItem } from '../components/dashboard/widgets/BandejaDelDia';
import type { DashboardAlerta } from '../hooks/inventario/useDashboardEjecutivo';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import QuickActions from '../components/dashboard/widgets/QuickActions';
import AbsenceAlerts, { type TrabajadorConAlerta } from '../components/dashboard/widgets/AbsenceAlerts';
import ObraRanking from '../components/dashboard/widgets/ObraRanking';

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
    trabajadoresConAlertas: TrabajadorConAlerta[];
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Panel: superficie NEUTRA del design system (card blanca + borde, sin tinte).
// El verde queda solo para acciones. Cada widget trae su propio encabezado.
const Panel: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
    <div className={cn('rounded-card border border-border bg-card p-5', className)}>{children}</div>
);

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [invItems, setInvItems] = useState<BandejaInvItem[]>([]);

    const permisos = user?.permisos ?? [];
    const canInventario = permisos.includes('inventario.ver');
    const { visibleWidgets } = useDashboardLayout(user?.id ?? 0, permisos);

    // Widgets que el usuario puede ver (gating por permiso granular). El layout es
    // fijo; el permiso decide qué zonas se montan, no el orden.
    const shown = useMemo(() => new Set(visibleWidgets.map(w => w.id)), [visibleWidgets]);

    // ─── Page Header (solo el rótulo de sección) ───
    const headerTitle = useMemo(() => (
        <h1 className="text-base font-semibold text-foreground">Inicio</h1>
    ), []);
    useSetPageHeader(headerTitle);

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
            setInvItems(alertas.map((a): BandejaInvItem => ({
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

    const refreshAll = useCallback(() => { fetchSummary(); fetchInventory(); }, [fetchSummary, fetchInventory]);

    // Skeletons por-widget. `ready` narrowea `data` a no-null en cada zona.
    const ready = !loading && !!data;
    const showFaltas = shown.has('absence_alerts');
    const showTrend = shown.has('chart_attendance_trend');
    const showAusentes = shown.has('list_absences_today');
    const showRanking = shown.has('obra_ranking') && selectedObra == null; // solo ámbito "Todas"

    const kpiIds = (['kpi_attendance', 'kpi_absences', 'kpi_docs', 'kpi_workers'] as const).filter(id => shown.has(id));

    // KPIs reconectados (counters/deltas que el backend ya calcula). Icono neutro,
    // superficie bg-card, delta con micro-color (DS): verde sube bueno / rojo malo.
    const renderKpi = (id: string, idx: number) => {
        if (!data) return null;
        const c = data.counters;
        const d = data.deltas;
        switch (id) {
            case 'kpi_attendance':
                return <KpiCard index={idx} label="Asistencia hoy" value={`${c.asistencia_hoy ?? 0}%`} icon={ClipboardCheck}
                    color="text-muted-foreground" bg="bg-card" description="presentes hoy"
                    delta={d.asistencia_delta} deltaLabel="pts vs ayer" onClick={() => navigate('/asistencia')} />;
            case 'kpi_absences':
                return <KpiCard index={idx} label="Ausentes hoy" value={c.ausentes_hoy ?? 0} icon={UserX}
                    color="text-muted-foreground" bg="bg-card" description="sin faltas hoy"
                    delta={d.ausentes_delta} deltaLabel="vs ayer" deltaInverted onClick={() => navigate('/consultas?ausentes=true')} />;
            case 'kpi_docs':
                return <KpiCard index={idx} label="Docs por vencer 7d" value={c.porVencer7d ?? 0} icon={FileWarning}
                    color="text-muted-foreground" bg="bg-card" description="todo vigente"
                    delta={(c.vencidos ?? 0) > 0 ? c.vencidos : undefined} deltaLabel="vencidos" deltaInverted onClick={() => navigate('/consultas')} />;
            case 'kpi_workers':
                return <KpiCard index={idx} label="Trabajadores" value={c.trabajadores ?? 0} icon={Users}
                    color="text-muted-foreground" bg="bg-card" description="activos"
                    delta={d.trabajadores_nuevos_semana} deltaLabel="esta semana" onClick={() => navigate('/consultas')} />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6">
            {/* ScopeBadge: ámbito activo + frescura + refrescar */}
            <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    {selectedObra ? `Obra: ${selectedObra.nombre}` : 'Todas las obras'}
                </span>
                <div className="flex items-center gap-3">
                    {lastUpdated && (
                        <span className="text-caption text-muted-foreground tabular-nums">
                            Actualizado {lastUpdated.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={refreshAll}
                        leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />}
                        className="text-muted-foreground"
                    >
                        Actualizar
                    </Button>
                </div>
            </div>

            {/* Hero contextual (saludo + insights + CTA) */}
            {ready && data
                ? <TodayHero
                    userName={data.saludo?.nombre || ''}
                    counters={data.counters}
                    pendingTasksCount={data.pendingTasks?.length ?? 0}
                    attendanceStatus={data.attendanceStatus}
                    onNavigate={(route) => navigate(route)}
                />
                : <Skeleton className="h-40 w-full rounded-card" />}

            {/* Tira de KPIs (subordinada) */}
            {kpiIds.length > 0 && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {ready
                        ? kpiIds.map((id, i) => <React.Fragment key={id}>{renderKpi(id, i)}</React.Fragment>)
                        : kpiIds.map(id => <Skeleton key={id} className="h-32 w-full rounded-card" />)}
                </div>
            )}

            {/* Zona principal: Bandeja del Día (izq) + Faltas Art.160 (der, sticky) */}
            <div className={cn('grid grid-cols-1 gap-6 items-start', showFaltas && 'lg:grid-cols-[1.5fr_1fr]')}>
                <Panel>
                    {ready && data
                        ? <BandejaDelDia
                            tasks={data.pendingTasks ?? []}
                            trabajadoresSinDocs={data.counters.trabajadoresSinDocs}
                            inventoryItems={invItems}
                            onNavigate={(route) => navigate(route)}
                        />
                        : <SkeletonText lines={6} />}
                </Panel>

                {showFaltas && (
                    <Panel className="lg:sticky lg:top-6">
                        {ready && data
                            ? <AbsenceAlerts data={data.trabajadoresConAlertas ?? []} onNavigate={(rut) => navigate(`/asistencia?q=${rut}`)} />
                            : <SkeletonText lines={6} />}
                    </Panel>
                )}
            </div>

            {/* Contexto de asistencia: tendencia 7d + ausentes del día (secundario) */}
            {(showTrend || showAusentes) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    {showTrend && (
                        <Panel>
                            {ready && data
                                ? <AttendanceTrend data={data.attendanceTrend} onNavigate={() => navigate('/asistencia')} />
                                : <Skeleton className="h-48 w-full" />}
                        </Panel>
                    )}
                    {showAusentes && (
                        <Panel>
                            {ready && data
                                ? <AbsencesToday data={data.ausentesDetalle ?? []} />
                                : <SkeletonText lines={5} />}
                        </Panel>
                    )}
                </div>
            )}

            {/* Ranking de obras (comparativa multi-obra; solo en ámbito "Todas") */}
            {showRanking && (
                <Panel>
                    {ready && data
                        ? <ObraRanking data={data.obraRanking ?? []} onNavigate={(id) => navigate(`/consultas?obra_id=${id}`)} />
                        : <SkeletonText lines={5} />}
                </Panel>
            )}

            {/* Acciones rápidas (footer) */}
            {shown.has('quick_actions') && (
                <Panel>
                    {ready
                        ? <QuickActions permisos={permisos} onNavigate={(route) => navigate(route)} />
                        : <Skeleton className="h-10 w-full" />}
                </Panel>
            )}
        </div>
    );
};

export default Dashboard;

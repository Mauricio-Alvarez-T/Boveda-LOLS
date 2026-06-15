import React, { useState, useEffect, useMemo } from 'react';
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

// Widgets
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import CriticalAlerts from '../components/dashboard/widgets/CriticalAlerts';
import QuickActions from '../components/dashboard/widgets/QuickActions';
import PendingTasks from '../components/dashboard/widgets/PendingTasks';
import AbsenceAlerts, { type TrabajadorConAlerta } from '../components/dashboard/widgets/AbsenceAlerts';
import ObraRanking from '../components/dashboard/widgets/ObraRanking';

// ─── Types ───
interface PendingTask {
    severity: 'critical' | 'warning' | 'info';
    category: 'documentos' | 'asistencia' | 'contratos';
    title: string;
    description: string;
    action: { label: string; ruta: string };
    meta?: Record<string, any>;
}

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
    // Faltas reiteradas del mes (Art. 160 N°3). Antes entraba como (data as any);
    // ahora tipado y alimentado con default defensivo. El strip de fechas-evidencia
    // se suma en F5.2 (requiere exponer fechas[] de getAlertasFaltas).
    trabajadoresConAlertas: TrabajadorConAlerta[];
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Panel: superficie NEUTRA del design system (card blanca + borde, sin tinte).
// Reemplaza a WidgetWrapper sin el drag handle: el layout pasa a ser fijo y
// jerárquico (orden por criticidad), no reordenable. El verde queda solo para
// acciones. Cada widget trae su propio encabezado, así que el panel es bare.
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

    const permisos = user?.permisos ?? [];
    const { visibleWidgets } = useDashboardLayout(user?.id ?? 0, permisos);

    // Conjunto de widgets que el usuario puede ver (gating por permiso granular,
    // resuelto por el registry). El layout es fijo; el permiso decide qué zonas
    // se montan, no el orden.
    const shown = useMemo(() => new Set(visibleWidgets.map(w => w.id)), [visibleWidgets]);

    // ─── Page Header (solo el rótulo de sección) ───
    const headerTitle = useMemo(() => (
        <h1 className="text-base font-semibold text-foreground">Inicio</h1>
    ), []);

    useSetPageHeader(headerTitle);

    // ─── Fetch Data ───
    useEffect(() => {
        const fetchSummary = async () => {
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
            } catch {
                toast.error('Error al cargar resumen del dashboard');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, [selectedObra]);

    // Skeletons por-widget: cada panel muestra su forma de carga (no un spinner
    // único de página). `ready` narrowea `data` a no-null en cada zona.
    const ready = !loading && !!data;
    const showFaltas = shown.has('absence_alerts');
    const showTrend = shown.has('chart_attendance_trend');
    const showAusentes = shown.has('list_absences_today');

    return (
        <div className="space-y-6">
            {/* F5.1 — aquí van: HeroContextual + ScopeBadge + TiraKPIs (kpiWidgets) */}

            {/* Zona principal: Bandeja del Día (izq) + Faltas Art.160 (der, sticky) */}
            <div className={cn('grid grid-cols-1 gap-6 items-start', showFaltas && 'lg:grid-cols-[1.5fr_1fr]')}>
                <div className="space-y-6">
                    {/* Bandeja del Día — base actual: tareas pendientes priorizadas.
                        En F5.3 absorbe asistencia-sin-guardar + docs por vencer. */}
                    <Panel>
                        {ready && data
                            ? <PendingTasks tasks={data.pendingTasks ?? []} onNavigate={(route) => navigate(route)} />
                            : <SkeletonText lines={6} />}
                    </Panel>
                    <Panel>
                        {ready && data
                            ? <CriticalAlerts alerts={data.alerts ?? []} onNavigate={(route) => navigate(route)} />
                            : <SkeletonText lines={3} />}
                    </Panel>
                </div>

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

            {/* Ranking de obras (comparativa multi-obra) */}
            {shown.has('obra_ranking') && (
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

import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    FileText,
    CheckSquare,
    AlertTriangle,
    Calendar,
    ShieldCheck,
    Loader2,
    LayoutGrid,
} from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    rectSortingStrategy,
} from '@dnd-kit/sortable';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useDashboardLayout } from '../hooks/useDashboardLayout';

// Widgets
import WidgetWrapper from '../components/dashboard/WidgetWrapper';
import KpiCard from '../components/dashboard/widgets/KpiCard';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import CriticalAlerts from '../components/dashboard/widgets/CriticalAlerts';
import QuickActions from '../components/dashboard/widgets/QuickActions';
import TodayHero from '../components/dashboard/widgets/TodayHero';
import PendingTasks from '../components/dashboard/widgets/PendingTasks';
import DocExpiryTimeline from '../components/dashboard/widgets/DocExpiryTimeline';
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
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    const permisos = user?.permisos ?? [];
    const { kpiWidgets, gridWidgets, reorder, resetLayout } = useDashboardLayout(user?.id ?? 0, permisos);

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    // ─── Page Header ───
    const headerTitle = useMemo(() => (
        <div className="flex flex-col leading-tight">
            <h1 className="text-lg font-bold text-brand-dark">
                Bienvenido, <span className="text-brand-primary">{user?.nombre?.split(' ')[0] || ''}</span>
            </h1>
            <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-accent" />
                Sistema Activo
            </p>
        </div>
    ), [user?.nombre]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-2 md:gap-3">
            {/* Date Display — hidden on mobile to save space */}
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-transparent border-r border-border pr-4 mr-1">
                <Calendar className="h-4 w-4 text-[#86868B]" />
                <span className="text-[13px] font-medium text-brand-dark capitalize">
                    {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
                </span>
            </div>

            {/* Reset Button — hidden on mobile */}
            <button
                onClick={resetLayout}
                className="hidden md:flex px-4 py-1.5 rounded-full bg-white border border-border items-center gap-2 shadow-sm hover:bg-background hover:border-[#B0B0B5] transition-all text-xs font-semibold text-muted-foreground group"
                title="Vuelve a poner todos los cuadros en su posición original"
            >
                <LayoutGrid className="h-3.5 w-3.5 text-brand-primary group-hover:scale-110 transition-transform" />
                Restaurar Diseño
            </button>

            {/* Mobile: compact reset icon only */}
            <button
                onClick={resetLayout}
                className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm"
                title="Restaurar Diseño"
            >
                <LayoutGrid className="h-4 w-4 text-brand-primary" />
            </button>
        </div>
    ), [resetLayout]);

    const notifications = useMemo(() => {
        if (!data || !data.alerts || data.alerts.length === 0) return undefined;
        return {
            count: data.saludo.totalAlertas,
            content: (
                <div className="flex flex-col gap-2">
                    {data.alerts.map((alert, idx) => (
                        <div
                            key={idx}
                            onClick={() => navigate(alert.ruta)}
                            className="p-3 bg-background rounded-xl flex items-start gap-3 hover:bg-[#E8E8ED] transition-colors cursor-pointer"
                        >
                            <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${alert.tipo === 'critical' ? 'text-destructive' :
                                alert.tipo === 'warning' ? 'text-warning' : 'text-brand-primary'
                                }`} />
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-brand-dark">{alert.titulo}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{alert.mensaje}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )
        };
    }, [data, navigate]);

    useSetPageHeader(headerTitle, headerActions, notifications);

    // ─── Fetch Data ───
    useEffect(() => {
        const fetchSummary = async () => {
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

    // ─── Loading State ───
    if (loading || !data) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
                <p className="mt-4 text-muted-foreground text-sm animate-pulse">Analizando bóveda...</p>
            </div>
        );
    }

    // ─── KPI Config ───
    const kpiConfig: Record<string, { label: string; value: string | number; icon: React.ElementType; color: string; bg: string; route: string; description: string; delta?: number; deltaLabel?: string; deltaInverted?: boolean }> = {
        kpi_workers: {
            label: 'Trabajadores',
            value: data.counters.trabajadores ?? 0,
            icon: Users,
            color: 'text-brand-primary',
            bg: 'bg-brand-primary/8',
            route: '/consultas?activo=true',
            description: 'Gestión de personal',
            delta: data.deltas?.trabajadores_nuevos_semana ?? 0,
            deltaLabel: 'nuevos esta semana',
        },
        kpi_docs: {
            label: 'Documentos',
            value: data.counters.documentos ?? 0,
            icon: FileText,
            color: 'text-[#5856D6]',
            bg: 'bg-[#5856D6]/8',
            route: '/consultas?completitud=faltantes',
            description: 'Bóveda documental',
            delta: data.deltas?.docs_vencidos_hoy ? -(data.deltas.docs_vencidos_hoy) : 0,
            deltaLabel: data.deltas?.docs_vencidos_hoy ? `${data.deltas.docs_vencidos_hoy} vencido${data.deltas.docs_vencidos_hoy !== 1 ? 's' : ''} hoy` : undefined,
            deltaInverted: true,
        },
        kpi_attendance: {
            label: 'Asistencia Hoy',
            value: `${data.counters.asistencia_hoy ?? 0}%`,
            icon: CheckSquare,
            color: 'text-brand-accent',
            bg: 'bg-brand-accent/8',
            route: '/asistencia',
            description: 'Tasa de presencia hoy',
            delta: data.deltas?.asistencia_delta ?? 0,
            deltaLabel: 'vs ayer',
        },
        kpi_absences: {
            label: 'Ausencias Hoy',
            value: data.counters.ausentes_hoy ?? 0,
            icon: AlertTriangle,
            color: (data.counters.ausentes_hoy ?? 0) > 0 ? 'text-warning' : 'text-muted',
            bg: (data.counters.ausentes_hoy ?? 0) > 0 ? 'bg-warning/8' : 'bg-muted/8',
            route: '/consultas?ausentes=true',
            description: (data.counters.ausentes_hoy ?? 0) > 0 ? 'Excepciones de asistencia' : 'Asistencia perfecta',
            delta: data.deltas?.ausentes_delta ?? 0,
            deltaLabel: 'vs ayer',
            deltaInverted: true,
        },
    };

    // ─── Render Widget by ID ───
    const renderWidget = (widgetId: string) => {
        switch (widgetId) {
            case 'pending_tasks':
                return <PendingTasks tasks={data.pendingTasks ?? []} onNavigate={(route) => navigate(route)} />;
            case 'doc_expiry_timeline':
                return <DocExpiryTimeline data={data.docExpiryTimeline ?? []} onNavigate={(rut) => navigate(`/consultas?q=${rut}`)} />;
            case 'obra_ranking':
                return <ObraRanking data={data.obraRanking ?? []} onNavigate={(id) => navigate(`/consultas?obra_id=${id}`)} />;
            case 'chart_attendance_trend':
                return <AttendanceTrend data={data.attendanceTrend} onNavigate={() => navigate('/asistencia')} />;
            case 'list_absences_today':
                return <AbsencesToday data={data.ausentesDetalle ?? []} />;
            case 'alerts_critical':
                return <CriticalAlerts alerts={data.alerts ?? []} onNavigate={(route) => navigate(route)} />;
            case 'quick_actions':
                return <QuickActions permisos={permisos} onNavigate={(route) => navigate(route)} />;
            default:
                return null;
        }
    };

    // ─── Drag End Handler ───
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            reorder(active.id as string, over.id as string);
        }
    };

    return (
        <div className="space-y-8">
            {/* ── Today Hero (always on top, not draggable) ── */}
            {!loading && data && (
                <TodayHero
                    userName={user?.nombre || 'Operador'}
                    counters={data.counters}
                    pendingTasksCount={(data.pendingTasks ?? []).length}
                    attendanceStatus={data.attendanceStatus}
                    onNavigate={(route) => navigate(route)}
                />
            )}

            {/* ── KPI Cards (static top row, not draggable) ── */}
            {kpiWidgets.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                    {kpiWidgets.map((w, i) => {
                        const config = kpiConfig[w.id];
                        if (!config) return null;
                        return (
                            <KpiCard
                                key={w.id}
                                label={config.label}
                                value={config.value}
                                icon={config.icon}
                                color={config.color}
                                bg={config.bg}
                                description={config.description}
                                onClick={() => navigate(config.route)}
                                index={i}
                                delta={config.delta}
                                deltaLabel={config.deltaLabel}
                                deltaInverted={config.deltaInverted}
                            />
                        );
                    })}
                </div>
            )}

            {/* ── Draggable Widget Grid ── */}
            {gridWidgets.length > 0 && (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={gridWidgets.map(w => w.id)}
                        strategy={rectSortingStrategy}
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                            {gridWidgets.map(widget => {
                                const content = renderWidget(widget.id);
                                if (!content) return null;

                                return (
                                    <WidgetWrapper key={widget.id} widget={widget}>
                                        {content}
                                    </WidgetWrapper>
                                );
                            })}
                        </div>
                    </SortableContext>
                </DndContext>
            )}
        </div>
    );
};

export default Dashboard;

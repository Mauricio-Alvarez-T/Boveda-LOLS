import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
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
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useDashboardLayout } from '../hooks/useDashboardLayout';

// Widgets
import WidgetWrapper from '../components/dashboard/WidgetWrapper';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import CriticalAlerts from '../components/dashboard/widgets/CriticalAlerts';
import QuickActions from '../components/dashboard/widgets/QuickActions';
import PendingTasks from '../components/dashboard/widgets/PendingTasks';
import AbsenceAlerts from '../components/dashboard/widgets/AbsenceAlerts';
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

// Superficies NEUTRAS (sistema validado): paneles blancos; se separan por borde,
// no por tinte de color. El verde queda solo para acciones.
const PANEL_TINT = 'bg-card';

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    const permisos = user?.permisos ?? [];
    const { gridWidgets, reorder } = useDashboardLayout(user?.id ?? 0, permisos);

    // DnD sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor)
    );

    // ─── Page Header (solo el rótulo de sección) ───
    const headerTitle = useMemo(() => (
        <h1 className="text-base font-semibold text-foreground">Inicio</h1>
    ), []);

    useSetPageHeader(headerTitle);

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
            <div className="h-[80dvh] flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-brand-primary" />
                <p className="mt-4 text-muted-foreground text-sm animate-pulse">Analizando bóveda...</p>
            </div>
        );
    }

    // ─── Render Widget by ID ───
    const renderWidget = (widgetId: string) => {
        switch (widgetId) {
            case 'pending_tasks':
                return <PendingTasks tasks={data.pendingTasks ?? []} onNavigate={(route) => navigate(route)} />;
            case 'absence_alerts':
                return <AbsenceAlerts data={(data as any).trabajadoresConAlertas ?? []} onNavigate={(rut) => navigate(`/asistencia?q=${rut}`)} />;
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
        <div>
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
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {gridWidgets.map(widget => {
                                const content = renderWidget(widget.id);
                                if (!content) return null;

                                return (
                                    <WidgetWrapper key={widget.id} widget={widget} tint={PANEL_TINT}>
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

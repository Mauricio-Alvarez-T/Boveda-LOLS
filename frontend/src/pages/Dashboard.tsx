import React, { useState, useEffect, useMemo } from 'react';
import {
    Users,
    FileText,
    CheckSquare,
    AlertTriangle,
    Calendar,
    ShieldCheck,
    Loader2,
    RotateCcw,
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
import { Button } from '../components/ui/Button';

// Widgets
import WidgetWrapper from '../components/dashboard/WidgetWrapper';
import KpiCard from '../components/dashboard/widgets/KpiCard';
import ObraDistribution from '../components/dashboard/widgets/ObraDistribution';
import AttendanceTrend from '../components/dashboard/widgets/AttendanceTrend';
import ComplianceDonut from '../components/dashboard/widgets/ComplianceDonut';
import RecentActivity from '../components/dashboard/widgets/RecentActivity';
import AbsencesToday from '../components/dashboard/widgets/AbsencesToday';
import CriticalAlerts from '../components/dashboard/widgets/CriticalAlerts';
import SystemStatus from '../components/dashboard/widgets/SystemStatus';
import QuickActions from '../components/dashboard/widgets/QuickActions';

// ─── Types ───
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
    recentActivity: any[];
    obraDistribution: { nombre: string; count: number }[];
    attendanceTrend: { fecha: string; tasa: number }[];
    ausentesDetalle?: { nombres: string; apellido_paterno: string; estado: string; obra: string }[];
    alerts: { tipo: 'critical' | 'warning' | 'info'; titulo: string; mensaje: string; count: number; ruta: string }[];
    saludo: { nombre: string; resumen: string; totalAlertas: number };
}

// ─── Dashboard ───
const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [systemStatus, setSystemStatus] = useState({ dbActive: false, lastCheck: '' });

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
            <h1 className="text-lg font-bold text-[#1D1D1F]">
                Bienvenido, <span className="text-[#0071E3]">{user?.nombre?.split(' ')[0] || ''}</span>
            </h1>
            <p className="text-[#6E6E73] text-xs flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[#34C759]" />
                Sistema Activo
            </p>
        </div>
    ), [user?.nombre]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-2">
            <button
                onClick={resetLayout}
                className="px-3 py-1.5 rounded-full bg-white border border-[#D2D2D7] flex items-center gap-1.5 shadow-sm hover:bg-[#F5F5F7] transition-colors text-xs font-medium text-[#6E6E73]"
                title="Restablecer layout"
            >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
            </button>
            <div className="px-3 py-1.5 rounded-full bg-white border border-[#D2D2D7] flex items-center gap-2 shadow-sm">
                <Calendar className="h-4 w-4 text-[#0071E3]" />
                <span className="text-xs font-medium text-[#1D1D1F] capitalize">
                    {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
                </span>
            </div>
        </div>
    ), [resetLayout]);

    useSetPageHeader(headerTitle, headerActions);

    // ─── Fetch Data ───
    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const query = selectedObra ? `?obra_id=${selectedObra.id}` : '';
                const res = await api.get<ApiResponse<DashboardData>>(`/dashboard/summary${query}`);
                setData(res.data.data);

                const healthRes = await api.get('/health');
                setSystemStatus({
                    dbActive: healthRes.data.status === 'ok',
                    lastCheck: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
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
                <Loader2 className="h-10 w-10 animate-spin text-[#0071E3]" />
                <p className="mt-4 text-[#6E6E73] text-sm animate-pulse">Analizando bóveda...</p>
            </div>
        );
    }

    // ─── KPI Config ───
    const kpiConfig: Record<string, { label: string; value: string | number; icon: React.ElementType; color: string; bg: string; route: string; description: string }> = {
        kpi_workers: {
            label: 'Trabajadores',
            value: data.counters.trabajadores ?? 0,
            icon: Users,
            color: 'text-[#0071E3]',
            bg: 'bg-[#0071E3]/8',
            route: '/trabajadores',
            description: 'Gestión de personal'
        },
        kpi_docs: {
            label: 'Documentos',
            value: data.counters.documentos ?? 0,
            icon: FileText,
            color: 'text-[#5856D6]',
            bg: 'bg-[#5856D6]/8',
            route: '/trabajadores',
            description: 'Bóveda documental'
        },
        kpi_attendance: {
            label: 'Asistencia Hoy',
            value: `${data.counters.asistencia_hoy ?? 0}%`,
            icon: CheckSquare,
            color: 'text-[#34C759]',
            bg: 'bg-[#34C759]/8',
            route: '/asistencia',
            description: 'Tasa de presencia hoy'
        },
        kpi_absences: {
            label: 'Ausencias Hoy',
            value: data.counters.ausentes_hoy ?? 0,
            icon: AlertTriangle,
            color: (data.counters.ausentes_hoy ?? 0) > 0 ? 'text-[#FF9F0A]' : 'text-[#A1A1A6]',
            bg: (data.counters.ausentes_hoy ?? 0) > 0 ? 'bg-[#FF9F0A]/8' : 'bg-[#A1A1A6]/8',
            route: '/asistencia',
            description: (data.counters.ausentes_hoy ?? 0) > 0 ? 'Excepciones de asistencia' : 'Asistencia perfecta'
        },
    };

    // ─── Render Widget by ID ───
    const renderWidget = (widgetId: string) => {
        switch (widgetId) {
            case 'chart_obra_distribution':
                return <ObraDistribution data={data.obraDistribution} onNavigate={() => navigate('/trabajadores')} />;
            case 'chart_attendance_trend':
                return <AttendanceTrend data={data.attendanceTrend} onNavigate={() => navigate('/asistencia')} />;
            case 'chart_compliance':
                return <ComplianceDonut totalDocs={data.counters.documentos ?? 0} expiredDocs={data.counters.vencidos ?? 0} onClick={() => navigate('/trabajadores')} />;
            case 'list_recent_activity':
                return <RecentActivity data={data.recentActivity} onNavigate={() => navigate('/trabajadores')} />;
            case 'list_absences_today':
                return <AbsencesToday data={data.ausentesDetalle ?? []} />;
            case 'alerts_critical':
                return <CriticalAlerts alerts={data.alerts} onNavigate={(route) => navigate(route)} />;
            case 'system_status':
                return <SystemStatus dbActive={systemStatus.dbActive} lastCheck={systemStatus.lastCheck} onNavigate={() => navigate('/configuracion')} />;
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
            {/* ── Contextual Greeting ── */}
            <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gradient-to-r from-[#0071E3]/5 to-[#5856D6]/5 rounded-2xl border border-[#0071E3]/10 p-5"
            >
                <p className="text-sm text-[#1D1D1F] font-medium leading-relaxed">
                    {data.saludo.resumen}
                </p>
                {data.saludo.totalAlertas > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#FF9F0A] bg-[#FF9F0A]/10 px-2 py-0.5 rounded-full">
                            <AlertTriangle className="h-3 w-3" />
                            {data.saludo.totalAlertas} {data.saludo.totalAlertas === 1 ? 'alerta' : 'alertas'}
                        </span>
                    </div>
                )}
            </motion.div>

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

                                // SystemStatus has its own styling (blue bg), skip wrapper border
                                if (widget.id === 'system_status') {
                                    return (
                                        <WidgetWrapper key={widget.id} widget={widget}>
                                            <div className="-m-5">
                                                {content}
                                            </div>
                                        </WidgetWrapper>
                                    );
                                }

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

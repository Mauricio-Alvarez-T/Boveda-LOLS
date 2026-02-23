import React, { useState, useEffect } from 'react';
import {
    Users,
    FileText,
    CheckSquare,
    AlertTriangle,
    TrendingUp,
    Activity,
    Calendar,
    ArrowRight,
    ShieldCheck,
    Loader2,
    CheckCircle2,
    Settings,
    Database,
    HardDrive,
    Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell,
    PieChart,
    Pie,
    LineChart,
    Line
} from 'recharts';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useSetPageHeader } from '../context/PageHeaderContext';

interface DashboardData {
    counters: {
        trabajadores: number;
        documentos: number;
        vencidos: number;
        asistencia_hoy: number;
        ausentes_hoy: number;
    };
    recentActivity: any[];
    obraDistribution: { nombre: string; count: number }[];
    attendanceTrend: { fecha: string; tasa: number }[];
}

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const { selectedObra } = useObra();
    const navigate = useNavigate();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [systemStatus, setSystemStatus] = useState({
        dbActive: false,
        lastCheck: ''
    });

    const headerTitle = React.useMemo(() => (
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

    const headerActions = React.useMemo(() => (
        <div className="px-3 py-1.5 rounded-full bg-white border border-[#D2D2D7] flex items-center gap-2 shadow-sm">
            <Calendar className="h-4 w-4 text-[#0071E3]" />
            <span className="text-xs font-medium text-[#1D1D1F] capitalize">
                {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
        </div>
    ), []);

    // Global Header
    useSetPageHeader(headerTitle, headerActions);

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
            } catch (err) {
                toast.error('Error al cargar resumen del dashboard');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, [selectedObra]);

    if (loading || !data) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-[#0071E3]" />
                <p className="mt-4 text-[#6E6E73] text-sm animate-pulse">Analizando bóveda...</p>
            </div>
        );
    }

    const stats = [
        {
            label: 'Trabajadores',
            value: data.counters.trabajadores,
            icon: Users,
            color: 'text-[#0071E3]',
            bg: 'bg-[#0071E3]/8',
            route: '/trabajadores',
            description: 'Gestión de personal'
        },
        {
            label: 'Documentos',
            value: data.counters.documentos,
            icon: FileText,
            color: 'text-[#5856D6]',
            bg: 'bg-[#5856D6]/8',
            route: '/trabajadores',
            description: 'Bóveda documental'
        },
        {
            label: 'Asistencia Hoy',
            value: `${data.counters.asistencia_hoy}%`,
            icon: CheckSquare,
            color: 'text-[#34C759]',
            bg: 'bg-[#34C759]/8',
            route: '/asistencia',
            description: 'Tasa de presencia hoy'
        },
        {
            label: 'Ausencias Hoy',
            value: data.counters.ausentes_hoy || 0,
            icon: AlertTriangle,
            color: (data.counters.ausentes_hoy || 0) > 0 ? 'text-[#FF9F0A]' : 'text-[#A1A1A6]',
            bg: (data.counters.ausentes_hoy || 0) > 0 ? 'bg-[#FF9F0A]/8' : 'bg-[#A1A1A6]/8',
            route: '/asistencia',
            description: (data.counters.ausentes_hoy || 0) > 0 ? 'Excepciones de asistencia' : 'Asistencia perfecta'
        },
    ];

    const compliancePercent = data.counters.documentos > 0
        ? Math.round(((data.counters.documentos - data.counters.vencidos) / data.counters.documentos) * 100)
        : 100;

    return (
        <div className="space-y-8">
            {/* KPI Cards — CLICKABLE */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        onClick={() => navigate(stat.route)}
                        className="bg-white rounded-2xl border border-[#D2D2D7] p-5 relative overflow-hidden group hover:shadow-md hover:border-[#B0B0B5] transition-all cursor-pointer"
                    >
                        <div className="flex items-center gap-4 relative z-10">
                            <div className={cn("p-3 rounded-2xl", stat.bg, stat.color)}>
                                <stat.icon className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-[#6E6E73] uppercase tracking-widest">{stat.label}</p>
                                <p className="text-3xl font-bold text-[#1D1D1F] mt-0.5">{stat.value}</p>
                            </div>
                        </div>
                        {/* Hover hint */}
                        <div className="mt-3 flex items-center gap-1 text-xs text-[#6E6E73] opacity-0 group-hover:opacity-100 transition-opacity">
                            <ArrowRight className="h-3 w-3" />
                            <span>{stat.description}</span>
                        </div>
                        {/* Background Decoration */}
                        <div className={cn("absolute -right-4 -bottom-4 opacity-[0.04] group-hover:opacity-[0.08] transition-opacity", stat.color)}>
                            <stat.icon className="h-28 w-28 rotate-12" />
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Chart Area */}
                <div className="lg:col-span-2 space-y-6">
                    {/* Charts Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-base font-semibold text-[#1D1D1F]">Distribución por Obra</h3>
                                    <p className="text-xs text-[#6E6E73]">Capacidad operativa.</p>
                                </div>
                                <TrendingUp className="h-5 w-5 text-[#0071E3]" />
                            </div>

                            {data.obraDistribution.length > 0 ? (
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={data.obraDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8ED" />
                                            <XAxis
                                                dataKey="nombre"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#6E6E73', fontSize: 10 }}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#6E6E73', fontSize: 10 }}
                                            />
                                            <Tooltip
                                                cursor={{ fill: '#F5F5F7' }}
                                                contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                                            />
                                            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                                {data.obraDistribution.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#0071E3' : '#5856D6'} fillOpacity={0.85} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-[200px] flex flex-col items-center justify-center text-[#6E6E73]">
                                    <TrendingUp className="h-10 w-10 opacity-20 mb-4" />
                                    <p className="text-sm">No hay obras activas con trabajadores asignados.</p>
                                    <Button
                                        variant="ghost"
                                        className="mt-3 text-xs"
                                        onClick={() => navigate('/trabajadores')}
                                    >
                                        Ir a Trabajadores
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Attendance Trend Chart */}
                        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div>
                                    <h3 className="text-base font-semibold text-[#1D1D1F]">Tendencia de Asistencia</h3>
                                    <p className="text-xs text-[#6E6E73]">Últimos 7 días activos.</p>
                                </div>
                                <Activity className="h-5 w-5 text-[#34C759]" />
                            </div>

                            {data.attendanceTrend.length > 0 ? (
                                <div className="h-[200px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={data.attendanceTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8E8ED" />
                                            <XAxis
                                                dataKey="fecha"
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#6E6E73', fontSize: 10 }}
                                                tickFormatter={(v) => v.slice(8, 10) + '/' + v.slice(5, 7)}
                                            />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#6E6E73', fontSize: 10 }}
                                                domain={[0, 100]}
                                            />
                                            <Tooltip
                                                cursor={{ stroke: '#F5F5F7', strokeWidth: 2 }}
                                                contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                                                formatter={(value) => [`${value}%`, 'Tasa de Asistencia']}
                                                labelFormatter={(label) => `Fecha: ${label}`}
                                            />
                                            <Line
                                                type="monotone"
                                                dataKey="tasa"
                                                stroke="#34C759"
                                                strokeWidth={3}
                                                dot={{ r: 4, fill: '#FFFFFF', stroke: '#34C759', strokeWidth: 2 }}
                                                activeDot={{ r: 6, fill: '#34C759', stroke: '#FFFFFF', strokeWidth: 2 }}
                                            />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div className="h-[200px] flex flex-col items-center justify-center text-[#6E6E73]">
                                    <CheckSquare className="h-10 w-10 opacity-20 mb-4" />
                                    <p className="text-sm">No hay registros de asistencia en los últimos 7 días.</p>
                                    <Button
                                        variant="ghost"
                                        className="mt-3 text-xs"
                                        onClick={() => navigate('/asistencia')}
                                    >
                                        Ir a Asistencia
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {/* Recent Activity */}
                        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-[#0071E3]" />
                                    Actividad Reciente
                                </h3>
                                <span className="text-xs text-[#A1A1A6] uppercase font-semibold tracking-wider">Últimos 5</span>
                            </div>
                            <div className="space-y-3">
                                {data.recentActivity.length > 0 ? (
                                    data.recentActivity.map((act) => (
                                        <div
                                            key={act.id}
                                            className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#F5F5F7] transition-colors group cursor-pointer"
                                            onClick={() => navigate('/trabajadores')}
                                        >
                                            <div className="h-8 w-8 rounded-lg bg-[#0071E3]/8 flex items-center justify-center text-[#0071E3]">
                                                <FileText className="h-4 w-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-[#1D1D1F] truncate">{act.tipo_nombre}</p>
                                                <p className="text-xs text-[#6E6E73] truncate">{act.nombres} {act.apellido_paterno}</p>
                                            </div>
                                            <div className="text-xs text-[#A1A1A6] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                                {new Date(act.fecha_subida).toLocaleDateString()}
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="py-6 text-center text-[#6E6E73]">
                                        <FileText className="h-8 w-8 mx-auto opacity-20 mb-2" />
                                        <p className="text-xs italic">No hay documentos subidos aún.</p>
                                    </div>
                                )}
                            </div>
                            <Button
                                variant="ghost"
                                className="w-full mt-4 text-[10px] h-8"
                                rightIcon={<ArrowRight className="h-3 w-3" />}
                                onClick={() => navigate('/trabajadores')}
                            >
                                Ver registros
                            </Button>
                        </div>

                        {/* Compliance Circular Chart */}
                        <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6 flex flex-col items-center justify-center text-center">
                            <h3 className="text-sm font-semibold text-[#1D1D1F] mb-5 w-full text-left">Nivel de Cumplimiento</h3>
                            <div
                                className="relative h-36 w-36 cursor-pointer group"
                                onClick={() => navigate('/trabajadores')}
                                title="Ver documentos"
                            >
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Válidos', value: Math.max(data.counters.documentos - data.counters.vencidos, 0) },
                                                { name: 'Vencidos', value: data.counters.vencidos }
                                            ]}
                                            innerRadius={55}
                                            outerRadius={70}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell fill="#34C759" />
                                            <Cell fill="#FF3B30" />
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D2D2D7', borderRadius: '12px', fontSize: '12px', color: '#1D1D1F' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-bold text-[#1D1D1F] group-hover:text-[#0071E3] transition-colors">
                                        {compliancePercent}%
                                    </span>
                                    <span className="text-[8px] text-[#A1A1A6] uppercase font-semibold">Total</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-[#6E6E73] mt-5 leading-relaxed">
                                Tu bóveda está <span className={cn("font-bold", compliancePercent >= 80 ? "text-[#34C759]" : "text-[#FF9F0A]")}>
                                    {compliancePercent >= 80 ? 'operativa' : 'con alertas'}
                                </span>.
                                {data.counters.vencidos > 0 && ` Tienes ${data.counters.vencidos} documentos que requieren atención inmediata.`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right Sidebar */}
                <div className="space-y-5">
                    {/* System Status — LIVE DATA */}
                    <div className="p-6 rounded-2xl bg-[#0071E3] text-white space-y-4 shadow-md relative overflow-hidden">
                        <ShieldCheck className="h-10 w-10 opacity-10 absolute -right-1 -bottom-1 rotate-12" />
                        <h4 className="text-base font-semibold relative z-10">Estado del Sistema</h4>
                        <div className="space-y-2.5 relative z-10">
                            <div className="flex justify-between items-center text-xs">
                                <span className="flex items-center gap-1.5"><Database className="h-3 w-3" /> Base de Datos</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full font-semibold text-[10px]",
                                    systemStatus.dbActive ? "bg-white/20" : "bg-[#FF3B30]/60"
                                )}>
                                    {systemStatus.dbActive ? 'Activa' : 'Error'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="flex items-center gap-1.5"><HardDrive className="h-3 w-3" /> API Backend</span>
                                <span className="px-2 py-0.5 rounded-full bg-white/20 font-semibold text-[10px]">
                                    {systemStatus.dbActive ? 'Online' : 'Offline'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Última Revisión</span>
                                <span className="px-2 py-0.5 rounded-full bg-white/20 font-semibold text-[10px]">
                                    {systemStatus.lastCheck || '---'}
                                </span>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            className="w-full bg-white text-[#0071E3] hover:bg-[#F5F5F7] mt-2 font-semibold rounded-xl"
                            onClick={() => navigate('/configuracion')}
                        >
                            <Settings className="h-4 w-4 mr-2" />
                            Configuración
                        </Button>
                    </div>

                    {/* Critical Alerts — CLICKABLE */}
                    <div className={cn(
                        "bg-white rounded-2xl border p-6",
                        data.counters.vencidos > 0 ? "border-[#FF3B30]/30" : "border-[#D2D2D7]"
                    )}>
                        <h4 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2 mb-4">
                            <AlertTriangle className={cn("h-4 w-4", data.counters.vencidos > 0 ? "text-[#FF3B30]" : "text-[#A1A1A6]")} />
                            Alertas Críticas
                        </h4>
                        <div className="space-y-4">
                            {data.counters.vencidos > 0 ? (
                                <div className="p-3 rounded-xl bg-[#FF3B30]/5 border border-[#FF3B30]/15">
                                    <p className="text-[10px] font-semibold text-[#FF3B30] uppercase tracking-widest">Documentos Vencidos</p>
                                    <p className="text-xs text-[#1D1D1F] mt-1 leading-relaxed">
                                        Hay {data.counters.vencidos} trabajadores con documentos caducados detectados en la bóveda.
                                    </p>
                                    <Button
                                        variant="ghost"
                                        className="h-6 px-0 text-[#FF3B30] text-[10px] mt-2 hover:bg-transparent"
                                        onClick={() => navigate('/trabajadores')}
                                    >
                                        Ver trabajadores →
                                    </Button>
                                </div>
                            ) : (
                                <div className="p-4 text-center border border-dashed border-[#D2D2D7] rounded-xl">
                                    <CheckCircle2 className="h-7 w-7 text-[#34C759] mx-auto mb-2 opacity-50" />
                                    <p className="text-xs text-[#6E6E73] italic">No hay alertas críticas pendientes.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-6">
                        <h4 className="text-sm font-semibold text-[#1D1D1F] mb-4">Acciones Rápidas</h4>
                        <div className="space-y-2">
                            <Button
                                variant="glass"
                                className="w-full justify-start text-xs"
                                onClick={() => navigate('/trabajadores')}
                                leftIcon={<Users className="h-4 w-4" />}
                            >
                                Gestionar Trabajadores
                            </Button>
                            <Button
                                variant="glass"
                                className="w-full justify-start text-xs"
                                onClick={() => navigate('/asistencia')}
                                leftIcon={<CheckSquare className="h-4 w-4" />}
                            >
                                Registrar Asistencia
                            </Button>
                            <Button
                                variant="glass"
                                className="w-full justify-start text-xs"
                                onClick={() => navigate('/fiscalizacion')}
                                leftIcon={<FileText className="h-4 w-4" />}
                            >
                                Exportar Fiscalización
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

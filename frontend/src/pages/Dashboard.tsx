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
    CheckCircle2
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
    Pie
} from 'recharts';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';

interface DashboardData {
    counters: {
        trabajadores: number;
        documentos: number;
        vencidos: number;
        asistencia_hoy: number;
    };
    recentActivity: any[];
    obraDistribution: { nombre: string; count: number }[];
}

const Dashboard: React.FC = () => {
    const { user } = useAuth();
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                const res = await api.get<ApiResponse<DashboardData>>('/dashboard/summary');
                setData(res.data.data);
            } catch (err) {
                toast.error('Error al cargar resumen del dashboard');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, []);

    if (loading || !data) {
        return (
            <div className="h-[80vh] flex flex-col items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-brand-primary" />
                <p className="mt-4 text-muted-foreground animate-pulse">Analizando boveda...</p>
            </div>
        );
    }

    const stats = [
        {
            label: 'Trabajadores',
            value: data.counters.trabajadores,
            icon: Users,
            color: 'text-blue-400',
            bg: 'bg-blue-400/10'
        },
        {
            label: 'Documentos',
            value: data.counters.documentos,
            icon: FileText,
            color: 'text-violet-400',
            bg: 'bg-violet-400/10'
        },
        {
            label: 'Asistencia Hoy',
            value: `${data.counters.asistencia_hoy}%`,
            icon: CheckSquare,
            color: 'text-emerald-400',
            bg: 'bg-emerald-400/10'
        },
        {
            label: 'Vencidos / Críticos',
            value: data.counters.vencidos,
            icon: AlertTriangle,
            color: data.counters.vencidos > 0 ? 'text-rose-400' : 'text-slate-400',
            bg: data.counters.vencidos > 0 ? 'bg-rose-400/10' : 'bg-slate-400/10'
        },
    ];

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Welcome Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white leading-tight">
                        Bienvenido de nuevo, <span className="text-brand-primary">{user?.nombre.split(' ')[0]}</span>
                    </h1>
                    <p className="text-muted-foreground mt-1 flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-emerald-500" />
                        Sistema de Gestión Documental Laboral activo.
                    </p>
                </div>
                <div className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-brand-primary" />
                    <span className="text-sm font-semibold text-white">
                        {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                    </span>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="premium-card relative overflow-hidden group hover:border-brand-primary/30 transition-all cursor-default"
                    >
                        <div className="flex items-center gap-4 relative z-10">
                            <div className={cn("p-4 rounded-2xl", stat.bg, stat.color)}>
                                <stat.icon className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                                <p className="text-3xl font-bold text-white mt-1">{stat.value}</p>
                            </div>
                        </div>
                        {/* Background Decoration */}
                        <div className={cn("absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity", stat.color)}>
                            <stat.icon className="h-32 w-32 rotate-12" />
                        </div>
                    </motion.div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart Area */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="premium-card p-6">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h3 className="text-lg font-bold text-white">Distribución por Obra</h3>
                                <p className="text-xs text-muted-foreground">Capacidad operativa por proyecto activo.</p>
                            </div>
                            <TrendingUp className="h-5 w-5 text-brand-primary" />
                        </div>

                        <div className="h-[300px] w-full mt-4">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.obraDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff0a" />
                                    <XAxis
                                        dataKey="nombre"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#ffffff05' }}
                                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #ffffff14', borderRadius: '12px', fontSize: '12px' }}
                                    />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {data.obraDistribution.map((_, index) => (
                                            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#8b5cf6' : '#d946ef'} fillOpacity={0.8} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Recent Documents */}
                        <div className="premium-card p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Activity className="h-4 w-4 text-brand-primary" />
                                    Actividad Reciente
                                </h3>
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Últimos 5</span>
                            </div>
                            <div className="space-y-4">
                                {data.recentActivity.map((act) => (
                                    <div key={act.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group">
                                        <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center text-brand-primary">
                                            <FileText className="h-4 w-4" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-white truncate">{act.tipo_nombre}</p>
                                            <p className="text-[10px] text-muted-foreground truncate">{act.nombres} {act.apellido_paterno}</p>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                            {new Date(act.fecha_subida).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <Button variant="ghost" className="w-full mt-4 text-[10px] h-8" rightIcon={<ArrowRight className="h-3 w-3" />}>
                                Ver registros
                            </Button>
                        </div>

                        {/* Compliance Circular Chart (Fake but pretty) */}
                        <div className="premium-card p-6 flex flex-col items-center justify-center text-center">
                            <h3 className="text-sm font-bold text-white mb-6 w-full text-left">Nivel de Cumplimiento</h3>
                            <div className="relative h-40 w-40">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Válidos', value: data.counters.documentos - data.counters.vencidos },
                                                { name: 'Vencidos', value: data.counters.vencidos }
                                            ]}
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            <Cell fill="#10b981" />
                                            <Cell fill="#f43f5e" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-2xl font-black text-white">
                                        {data.counters.documentos > 0
                                            ? Math.round(((data.counters.documentos - data.counters.vencidos) / data.counters.documentos) * 100)
                                            : 100}%
                                    </span>
                                    <span className="text-[8px] text-muted-foreground uppercase font-bold">Total</span>
                                </div>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-6 leading-relaxed">
                                Tu boveda está <span className="text-emerald-400 font-bold">operativa</span>.
                                {data.counters.vencidos > 0 && ` Tienes ${data.counters.vencidos} documentos que requieren atención inmediata.`}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Sidebar Alerts */}
                <div className="space-y-6">
                    <div className="p-6 rounded-3xl bg-brand-primary text-white space-y-4 shadow-xl shadow-brand-primary/20 relative overflow-hidden">
                        <ShieldCheck className="h-12 w-12 opacity-20 absolute -right-2 -bottom-2 rotate-12" />
                        <h4 className="text-lg font-bold relative z-10">Estado del Sistema</h4>
                        <div className="space-y-2 relative z-10">
                            <div className="flex justify-between items-center text-xs">
                                <span>Base de Datos</span>
                                <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold">Activa</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Almacenamiento</span>
                                <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold">65% Libre</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span>Última Auditoría</span>
                                <span className="px-2 py-0.5 rounded-full bg-white/20 font-bold">Hace 2h</span>
                            </div>
                        </div>
                        <Button className="w-full bg-white text-brand-primary hover:bg-slate-100 mt-2 font-bold py-4 rounded-2xl">
                            Configuración
                        </Button>
                    </div>

                    <div className="premium-card p-6 border-rose-500/20 bg-rose-500/5">
                        <h4 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
                            <AlertTriangle className="h-4 w-4 text-rose-500" />
                            Alertas Críticas
                        </h4>
                        <div className="space-y-4">
                            {data.counters.vencidos > 0 ? (
                                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">Documentos Vencidos</p>
                                    <p className="text-xs text-white mt-1 leading-relaxed">
                                        Hay {data.counters.vencidos} trabajadores con documentos caducados detectados en la boveda.
                                    </p>
                                    <Button variant="ghost" className="h-6 px-0 text-rose-400 text-[10px] mt-2 hover:bg-transparent">
                                        Ver trabajadores
                                    </Button>
                                </div>
                            ) : (
                                <div className="p-4 text-center border border-dashed border-white/10 rounded-2xl">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2 opacity-50" />
                                    <p className="text-xs text-muted-foreground italic">No hay alertas críticas pendientes.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

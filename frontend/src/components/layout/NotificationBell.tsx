import React, { useState, useEffect, useRef } from 'react';
import { Bell, Users, CalendarClock, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '../../services/api';

interface Worker10m {
    id: number;
    rut: string;
    nombre: string;
    empresa: string;
    fecha_ingreso: string;
    fecha_10m: string;
}

interface AlertItem {
    tipo: 'critical' | 'warning' | 'info';
    titulo: string;
    mensaje: string;
    count: number;
    ruta?: string;
    detalle10meses?: Worker10m[];
}

export const NotificationBell: React.FC = () => {
    const [alerts, setAlerts] = useState<AlertItem[]>([]);
    const [open, setOpen] = useState(false);
    const [expanded10m, setExpanded10m] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchAlerts = async () => {
            try {
                const res = await api.get('/dashboard/summary');
                setAlerts(res.data?.data?.alerts || []);
            } catch (err) {
                console.error('Error fetching notifications', err);
            }
        };
        fetchAlerts();
        // Poll every 5 minutes
        const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // Close on outside click
    useEffect(() => {
        const handle = (e: MouseEvent | TouchEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
                setExpanded10m(false);
            }
        };
        document.addEventListener('mousedown', handle);
        document.addEventListener('touchstart', handle);
        return () => {
            document.removeEventListener('mousedown', handle);
            document.removeEventListener('touchstart', handle);
        };
    }, []);

    const totalCount = alerts.reduce((sum, a) => sum + a.count, 0);
    const alert10m = alerts.find(a => a.titulo === '10 Meses de Contrato');

    const alertColorMap: Record<string, string> = {
        critical: '#FF3B30',
        warning: '#FF9500',
        info: '#029E4D'
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    return (
        <div className="relative" ref={ref}>
            {/* Bell button */}
            <button
                onClick={() => { setOpen(!open); setExpanded10m(false); }}
                className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-background text-muted-foreground relative transition-colors focus:outline-none"
                title="Notificaciones"
            >
                <Bell className="h-5 w-5" />
                {totalCount > 0 && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 h-5 w-5 bg-destructive rounded-full flex items-center justify-center border-2 border-white"
                    >
                        <span className="text-[9px] font-bold text-white leading-none">
                            {totalCount > 99 ? '99+' : totalCount}
                        </span>
                    </motion.div>
                )}
            </button>

            {/* Popover */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.95 }}
                        transition={{ duration: 0.15 }}
                        className="absolute right-0 top-full mt-2 w-[340px] md:w-[380px] bg-white rounded-2xl shadow-2xl border border-[#E8E8ED] overflow-hidden z-50 origin-top-right"
                    >
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-[#E8E8ED] flex items-center justify-between bg-gradient-to-r from-white to-background">
                            <h3 className="font-bold text-brand-dark text-sm flex items-center gap-2">
                                <Bell className="h-4 w-4 text-brand-primary" />
                                Notificaciones
                            </h3>
                            <div className="flex items-center gap-2">
                                {totalCount > 0 && (
                                    <span className="text-[10px] bg-destructive text-white px-2 py-0.5 rounded-full font-bold">
                                        {totalCount}
                                    </span>
                                )}
                                <button onClick={() => { setOpen(false); setExpanded10m(false); }} className="text-[#86868B] hover:text-brand-dark">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Body */}
                        <div className="max-h-[70vh] overflow-y-auto">
                            {alerts.length === 0 ? (
                                <div className="p-6 text-center text-sm text-[#86868B]">
                                    No hay notificaciones pendientes 🎉
                                </div>
                            ) : (
                                <div className="divide-y divide-background">
                                    {alerts.map((alert, i) => (
                                        <div key={i} className="px-4 py-3 hover:bg-[#FAFAFA] transition-colors">
                                            {/* Alert header row */}
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className="mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                                                    style={{ backgroundColor: `${alertColorMap[alert.tipo]}15` }}
                                                >
                                                    {alert.titulo === '10 Meses de Contrato' ? (
                                                        <CalendarClock className="h-4 w-4" style={{ color: alertColorMap[alert.tipo] }} />
                                                    ) : (
                                                        <Users className="h-4 w-4" style={{ color: alertColorMap[alert.tipo] }} />
                                                    )}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-bold text-brand-dark">{alert.titulo}</span>
                                                        <span
                                                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                            style={{ backgroundColor: `${alertColorMap[alert.tipo]}15`, color: alertColorMap[alert.tipo] }}
                                                        >
                                                            {alert.count}
                                                        </span>
                                                    </div>
                                                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{alert.mensaje}</p>

                                                    {/* Expandable detail for 10-month alert */}
                                                    {alert.detalle10meses && alert.detalle10meses.length > 0 && (
                                                        <button
                                                            onClick={() => setExpanded10m(!expanded10m)}
                                                            className="mt-1.5 text-[10px] font-semibold text-brand-primary hover:text-[#027A3B] flex items-center gap-0.5 transition-colors"
                                                        >
                                                            {expanded10m ? 'Ocultar detalle' : 'Ver listado completo'}
                                                            <ChevronRight className={`h-3 w-3 transition-transform ${expanded10m ? 'rotate-90' : ''}`} />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Expanded 10-month detail table */}
                                            <AnimatePresence>
                                                {alert.detalle10meses && expanded10m && (
                                                    <motion.div
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden"
                                                    >
                                                        <div className="mt-2 ml-11 rounded-xl border border-[#E8E8ED] overflow-hidden">
                                                            <table className="w-full text-[10px]">
                                                                <thead>
                                                                    <tr className="bg-background text-muted-foreground">
                                                                        <th className="text-left px-2 py-1.5 font-semibold">Nombre</th>
                                                                        <th className="text-left px-2 py-1.5 font-semibold">RUT</th>
                                                                        <th className="text-left px-2 py-1.5 font-semibold">Empresa</th>
                                                                        <th className="text-left px-2 py-1.5 font-semibold">Cumple 10m</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-background">
                                                                    {alert.detalle10meses.map((w) => (
                                                                        <tr key={w.id} className="hover:bg-[#FAFAFA]">
                                                                            <td className="px-2 py-1.5 text-brand-dark font-medium truncate max-w-[100px]">{w.nombre}</td>
                                                                            <td className="px-2 py-1.5 text-muted-foreground whitespace-nowrap">{w.rut}</td>
                                                                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[80px]">{w.empresa}</td>
                                                                            <td className="px-2 py-1.5 text-brand-primary font-bold whitespace-nowrap">{formatDate(w.fecha_10m)}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

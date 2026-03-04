import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, FileText, Calendar, User, Building2, Briefcase, MapPin, Clock, Loader2, Phone, Mail } from 'lucide-react';
import api from '../../services/api';
import { cn } from '../../utils/cn';

interface AttendanceRecord {
    fecha: string;
    hora_entrada: string | null;
    hora_salida: string | null;
    horas_extra: number;
    observacion: string | null;
    estado_nombre: string;
    estado_codigo: string;
    estado_color: string;
    es_presente: boolean;
    tipo_ausencia_nombre: string | null;
}

interface QuickViewData {
    worker: {
        id: number;
        rut: string;
        nombres: string;
        apellido_paterno: string;
        apellido_materno: string | null;
        empresa_nombre: string | null;
        obra_nombre: string | null;
        cargo_nombre: string | null;
        email: string | null;
        telefono: string | null;
        fecha_ingreso: string | null;
        categoria_reporte: string;
        activo: boolean;
    };
    docs: {
        total: number;
        completed: number;
    };
    recentAttendance: AttendanceRecord[];
}

interface WorkerQuickViewProps {
    workerId: number | null;
    onClose: () => void;
    onEditWorker?: (id: number) => void;
    onViewDocuments?: (id: number) => void;
    onViewAttendance?: (id: number) => void;
}

const WorkerQuickView: React.FC<WorkerQuickViewProps> = ({
    workerId, onClose, onEditWorker, onViewDocuments, onViewAttendance
}) => {
    const [data, setData] = useState<QuickViewData | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (workerId) {
            setLoading(true);
            setData(null);
            api.get<QuickViewData>(`/trabajadores/${workerId}/quick-view`)
                .then(res => setData(res.data))
                .catch(() => { })
                .finally(() => setLoading(false));
        }
    }, [workerId]);

    const isOpen = workerId !== null;

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr + 'T12:00:00');
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        return `${days[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
    };

    const docPct = data ? (data.docs.total > 0 ? Math.round((data.docs.completed / data.docs.total) * 100) : 0) : 0;
    const initials = data ? `${data.worker.nombres[0]}${(data.worker.apellido_paterno || '')[0]}` : '';

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
                        onClick={onClose}
                    />

                    {/* Panel — fullscreen on mobile, right drawer on desktop */}
                    <motion.div
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
                        className={cn(
                            "fixed z-[61] bg-white shadow-2xl overflow-y-auto",
                            "inset-0 md:inset-y-0 md:right-0 md:left-auto md:w-[420px] md:rounded-l-3xl"
                        )}
                    >
                        {/* Header */}
                        <div className="sticky top-0 bg-white/80 backdrop-blur-xl z-10 px-5 py-4 border-b border-[#E8E8ED] flex items-center justify-between">
                            <h2 className="text-lg font-bold text-[#1D1D1F]">Ficha Rápida</h2>
                            <button onClick={onClose} className="p-2 rounded-full hover:bg-[#F5F5F7] transition-colors">
                                <X className="h-5 w-5 text-[#6E6E73]" />
                            </button>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20">
                                <Loader2 className="h-8 w-8 animate-spin text-[#0071E3] mb-3" />
                                <p className="text-sm text-[#6E6E73]">Cargando información...</p>
                            </div>
                        ) : data ? (
                            <div className="p-5 space-y-5">
                                {/* ── Worker Identity Card ── */}
                                <div className="bg-gradient-to-br from-[#0071E3]/5 to-[#5AC8FA]/5 rounded-2xl p-5 border border-[#0071E3]/10">
                                    <div className="flex items-center gap-4">
                                        <div className="h-16 w-16 rounded-2xl bg-[#0071E3] text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-[#0071E3]/20">
                                            {initials}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-bold text-[#1D1D1F] truncate">
                                                {data.worker.nombres} {data.worker.apellido_paterno}
                                            </h3>
                                            <p className="text-sm text-[#6E6E73]">{data.worker.rut}</p>
                                            {!data.worker.activo && (
                                                <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-bold uppercase">Inactivo</span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Info chips */}
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {data.worker.cargo_nombre && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                <Briefcase className="h-3.5 w-3.5 text-[#0071E3]" /> {data.worker.cargo_nombre}
                                            </span>
                                        )}
                                        {data.worker.empresa_nombre && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                <Building2 className="h-3.5 w-3.5 text-[#FF9F0A]" /> {data.worker.empresa_nombre}
                                            </span>
                                        )}
                                        {data.worker.obra_nombre && (
                                            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                <MapPin className="h-3.5 w-3.5 text-[#34C759]" /> {data.worker.obra_nombre}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ── Contact Info ── */}
                                {(data.worker.telefono || data.worker.email) && (
                                    <div className="space-y-2">
                                        {data.worker.telefono && (
                                            <a href={`tel:${data.worker.telefono}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors">
                                                <Phone className="h-4 w-4 text-[#34C759]" />
                                                <span className="text-sm text-[#1D1D1F]">{data.worker.telefono}</span>
                                            </a>
                                        )}
                                        {data.worker.email && (
                                            <a href={`mailto:${data.worker.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors">
                                                <Mail className="h-4 w-4 text-[#0071E3]" />
                                                <span className="text-sm text-[#1D1D1F] truncate">{data.worker.email}</span>
                                            </a>
                                        )}
                                    </div>
                                )}

                                {/* ── Document Compliance ── */}
                                <div className="bg-[#F5F5F7] rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-[#0071E3]" /> Documentación
                                        </span>
                                        <span className={cn(
                                            "text-xs font-bold px-2.5 py-1 rounded-lg",
                                            docPct === 100 ? "bg-[#34C759]/10 text-[#34C759]" :
                                                docPct > 50 ? "bg-[#FF9F0A]/10 text-[#FF9F0A]" :
                                                    "bg-[#FF3B30]/10 text-[#FF3B30]"
                                        )}>
                                            {data.docs.completed}/{data.docs.total}
                                        </span>
                                    </div>
                                    <div className="h-2.5 bg-white rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${docPct}%` }}
                                            transition={{ duration: 0.6, ease: 'easeOut' }}
                                            className={cn(
                                                "h-full rounded-full",
                                                docPct === 100 ? "bg-[#34C759]" :
                                                    docPct > 50 ? "bg-[#FF9F0A]" : "bg-[#FF3B30]"
                                            )}
                                        />
                                    </div>
                                    <p className="text-[11px] text-[#6E6E73] mt-2">
                                        {docPct === 100 ? 'Documentación completa ✓' : `Faltan ${data.docs.total - data.docs.completed} documento(s) obligatorio(s)`}
                                    </p>
                                </div>

                                {/* ── Recent Attendance ── */}
                                <div>
                                    <h4 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2 mb-3">
                                        <Calendar className="h-4 w-4 text-[#0071E3]" /> Asistencia Reciente
                                    </h4>
                                    {data.recentAttendance.length === 0 ? (
                                        <div className="text-center py-6 text-[#6E6E73] text-xs bg-[#F5F5F7] rounded-xl">
                                            Sin registros recientes
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {data.recentAttendance.map((att, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED]/70 transition-colors">
                                                    <div className="flex items-center gap-3">
                                                        <div
                                                            className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[10px] font-bold"
                                                            style={{ backgroundColor: att.estado_color || '#34C759' }}
                                                        >
                                                            {att.estado_codigo}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs font-semibold text-[#1D1D1F]">{formatDate(att.fecha)}</p>
                                                            <p className="text-[10px] text-[#6E6E73]">{att.estado_nombre}{att.tipo_ausencia_nombre ? ` · ${att.tipo_ausencia_nombre}` : ''}</p>
                                                        </div>
                                                    </div>
                                                    {att.hora_entrada && (
                                                        <div className="text-right">
                                                            <p className="text-[10px] text-[#6E6E73] flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {att.hora_entrada?.substring(0, 5)} - {att.hora_salida?.substring(0, 5) || '—'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* ── Quick Actions ── */}
                                <div className="grid grid-cols-3 gap-2 pt-2 pb-4">
                                    <button
                                        onClick={() => onEditWorker?.(data.worker.id)}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#0071E3]/5 hover:bg-[#0071E3]/10 border border-[#0071E3]/10 transition-colors group"
                                    >
                                        <Pencil className="h-5 w-5 text-[#0071E3] group-hover:scale-110 transition-transform" />
                                        <span className="text-[11px] font-semibold text-[#0071E3]">Editar</span>
                                    </button>
                                    <button
                                        onClick={() => onViewDocuments?.(data.worker.id)}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#FF9F0A]/5 hover:bg-[#FF9F0A]/10 border border-[#FF9F0A]/10 transition-colors group"
                                    >
                                        <FileText className="h-5 w-5 text-[#FF9F0A] group-hover:scale-110 transition-transform" />
                                        <span className="text-[11px] font-semibold text-[#FF9F0A]">Docs</span>
                                    </button>
                                    <button
                                        onClick={() => onViewAttendance?.(data.worker.id)}
                                        className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#34C759]/5 hover:bg-[#34C759]/10 border border-[#34C759]/10 transition-colors group"
                                    >
                                        <Calendar className="h-5 w-5 text-[#34C759] group-hover:scale-110 transition-transform" />
                                        <span className="text-[11px] font-semibold text-[#34C759]">Asistencia</span>
                                    </button>
                                </div>
                            </div>
                        ) : null}
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default WorkerQuickView;

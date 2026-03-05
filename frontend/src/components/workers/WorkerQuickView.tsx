import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, FileText, Calendar, Building2, Briefcase, MapPin, Clock, Loader2, Phone, Mail } from 'lucide-react';
import api from '../../services/api';
import { cn } from '../../utils/cn';
import { WorkerCalendarModal } from '../attendance/WorkerCalendarModal';
import type { EstadoAsistencia } from '../../types/entities';

interface WorkerData {
    id: number;
    rut: string;
    nombres: string;
    apellido_paterno: string;
    apellido_materno: string | null;
    empresa_id: number | null;
    obra_id: number | null;
    cargo_id: number | null;
    empresa_nombre: string | null;
    obra_nombre: string | null;
    cargo_nombre: string | null;
    email: string | null;
    telefono: string | null;
    fecha_ingreso: string | null;
    categoria_reporte: string;
    activo: boolean;
}

interface DocInfo {
    tipo_nombre: string;
    nombre_archivo: string;
    fecha_vencimiento: string | null;
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
    const [worker, setWorker] = useState<WorkerData | null>(null);
    const [docs, setDocs] = useState<DocInfo[]>([]);
    const [totalRequired, setTotalRequired] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);

    useEffect(() => {
        if (!workerId) return;

        setLoading(true);
        setWorker(null);
        setDocs([]);

        const p1 = api.get(`/trabajadores/${workerId}`)
            .then(res => {
                const d = (res.data as any).data || res.data;
                setWorker(d);
            })
            .catch(() => { });

        const p2 = api.get(`/documentos/trabajador/${workerId}`)
            .then(res => {
                const d = (res.data as any).data || res.data;
                setDocs(Array.isArray(d) ? d : []);
            })
            .catch(() => { });

        const p3 = api.get('/documentos/tipos')
            .then(res => {
                const tipos = (res.data as any).data || res.data;
                if (Array.isArray(tipos)) {
                    setTotalRequired(tipos.filter((t: any) => t.obligatorio && t.activo).length);
                }
            })
            .catch(() => { });

        // Fetch estados for the calendar modal
        const p4 = api.get('/asistencias/estados')
            .then(res => {
                const d = (res.data as any).data || res.data;
                if (Array.isArray(d)) setEstados(d);
            })
            .catch(() => { });

        Promise.all([p1, p2, p3, p4]).finally(() => setLoading(false));
    }, [workerId]);

    const isOpen = workerId !== null;

    const completedDocs = docs.filter((d: any) => d.activo !== false).length;
    const docPct = totalRequired > 0 ? Math.round((completedDocs / totalRequired) * 100) : 0;
    const initials = worker ? `${worker.nombres[0]}${(worker.apellido_paterno || '')[0]}` : '';

    return (
        <>
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

                        {/* Panel */}
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
                                    <Loader2 className="h-8 w-8 animate-spin text-[#029E4D] mb-3" />
                                    <p className="text-sm text-[#6E6E73]">Cargando información...</p>
                                </div>
                            ) : worker ? (
                                <div className="p-5 space-y-5">
                                    {/* ── Worker Identity Card ── */}
                                    <div className="bg-gradient-to-br from-[#029E4D]/5 to-[#5AC8FA]/5 rounded-2xl p-5 border border-[#029E4D]/10">
                                        <div className="flex items-center gap-4">
                                            <div className="h-16 w-16 rounded-2xl bg-[#029E4D] text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-[#029E4D]/20">
                                                {initials}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-bold text-[#1D1D1F]">
                                                    {worker.nombres} {worker.apellido_paterno}
                                                </h3>
                                                <p className="text-sm text-[#6E6E73]">{worker.rut}</p>
                                                {!worker.activo && (
                                                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-[#FF3B30]/10 text-[#FF3B30] text-[10px] font-bold uppercase">Inactivo</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info chips */}
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {worker.cargo_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                    <Briefcase className="h-3.5 w-3.5 text-[#029E4D]" /> {worker.cargo_nombre}
                                                </span>
                                            )}
                                            {worker.empresa_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                    <Building2 className="h-3.5 w-3.5 text-[#FF9F0A]" /> {worker.empresa_nombre}
                                                </span>
                                            )}
                                            {worker.obra_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-[#1D1D1F] border border-[#E8E8ED]">
                                                    <MapPin className="h-3.5 w-3.5 text-[#34C759]" /> {worker.obra_nombre}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Contact Info ── */}
                                    {(worker.telefono || worker.email) && (
                                        <div className="space-y-2">
                                            {worker.telefono && (
                                                <a href={`tel:${worker.telefono}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors">
                                                    <Phone className="h-4 w-4 text-[#34C759]" />
                                                    <span className="text-sm text-[#1D1D1F]">{worker.telefono}</span>
                                                </a>
                                            )}
                                            {worker.email && (
                                                <a href={`mailto:${worker.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED] transition-colors">
                                                    <Mail className="h-4 w-4 text-[#029E4D]" />
                                                    <span className="text-sm text-[#1D1D1F] truncate">{worker.email}</span>
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Document Compliance ── */}
                                    <div className="bg-[#F5F5F7] rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-[#029E4D]" /> Documentación
                                            </span>
                                            <span className={cn(
                                                "text-xs font-bold px-2.5 py-1 rounded-lg",
                                                docPct === 100 ? "bg-[#34C759]/10 text-[#34C759]" :
                                                    docPct > 50 ? "bg-[#FF9F0A]/10 text-[#FF9F0A]" :
                                                        "bg-[#FF3B30]/10 text-[#FF3B30]"
                                            )}>
                                                {completedDocs}/{totalRequired}
                                            </span>
                                        </div>
                                        <div className="h-2.5 bg-white rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.min(docPct, 100)}%` }}
                                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                                className={cn(
                                                    "h-full rounded-full",
                                                    docPct === 100 ? "bg-[#34C759]" :
                                                        docPct > 50 ? "bg-[#FF9F0A]" : "bg-[#FF3B30]"
                                                )}
                                            />
                                        </div>
                                        <p className="text-[11px] text-[#6E6E73] mt-2">
                                            {docPct >= 100 ? 'Documentación completa ✓' : `Faltan ${Math.max(totalRequired - completedDocs, 0)} documento(s) obligatorio(s)`}
                                        </p>
                                    </div>

                                    {/* ── Recent Documents List ── */}
                                    {docs.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2 mb-3">
                                                <FileText className="h-4 w-4 text-[#029E4D]" /> Documentos Subidos
                                            </h4>
                                            <div className="space-y-2">
                                                {docs.slice(0, 5).map((doc: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-[#F5F5F7] hover:bg-[#E8E8ED]/70 transition-colors">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-semibold text-[#1D1D1F] truncate">{doc.tipo_nombre || doc.nombre_archivo}</p>
                                                            {doc.fecha_vencimiento && (
                                                                <p className="text-[10px] text-[#6E6E73] flex items-center gap-1 mt-0.5">
                                                                    <Clock className="h-3 w-3" />
                                                                    Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString('es-CL')}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* ── Quick Actions ── */}
                                    <div className="grid grid-cols-3 gap-2 pt-2 pb-4">
                                        <button
                                            onClick={() => onEditWorker?.(worker.id)}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#029E4D]/5 hover:bg-[#029E4D]/10 border border-[#029E4D]/10 transition-colors group"
                                        >
                                            <Pencil className="h-5 w-5 text-[#029E4D] group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-semibold text-[#029E4D]">Editar</span>
                                        </button>
                                        <button
                                            onClick={() => onViewDocuments?.(worker.id)}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-[#FF9F0A]/5 hover:bg-[#FF9F0A]/10 border border-[#FF9F0A]/10 transition-colors group"
                                        >
                                            <FileText className="h-5 w-5 text-[#FF9F0A] group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-semibold text-[#FF9F0A]">Docs</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                onClose();
                                                setShowCalendar(true);
                                            }}
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

            {/* Calendar Modal — rendered outside the panel so it overlays everything */}
            <WorkerCalendarModal
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                worker={worker as any}
                estados={estados}
            />
        </>
    );
};

export default WorkerQuickView;

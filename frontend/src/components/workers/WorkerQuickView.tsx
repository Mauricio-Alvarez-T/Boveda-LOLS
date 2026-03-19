import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, FileText, Calendar, Building2, Briefcase, MapPin, Clock, Loader2, Phone, Mail, Download, ArrowLeft, FilePlus } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import { cn } from '../../utils/cn';
import { WorkerCalendarModal } from '../attendance/WorkerCalendarModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { WorkerForm } from './WorkerForm';
import { DocumentUploader } from '../documents/DocumentUploader';
import { DocumentList } from '../documents/DocumentList';
import { useAuth } from '../../context/AuthContext';
import type { Trabajador, EstadoAsistencia } from '../../types/entities';

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
    onUpdate?: () => void;
}

const WorkerQuickView: React.FC<WorkerQuickViewProps> = ({
    workerId, onClose, onEditWorker, onViewDocuments, onViewAttendance, onUpdate
}) => {
    const [worker, setWorker] = useState<WorkerData | null>(null);
    const [docs, setDocs] = useState<DocInfo[]>([]);
    const [totalRequired, setTotalRequired] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const { checkPermission } = useAuth();

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
    }, [workerId, refreshKey]);

    const isOpen = workerId !== null;

    const completedDocs = docs.filter((d: any) => d.activo !== false).length;
    const docPct = totalRequired > 0 ? Math.round((completedDocs / totalRequired) * 100) : 0;
    const initials = worker ? `${(worker.apellido_paterno || '')[0]}${worker.nombres[0]}` : '';

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
                                <h2 className="text-lg font-bold text-brand-dark">Ficha Rápida</h2>
                                <button onClick={onClose} className="p-2 rounded-full hover:bg-background transition-colors">
                                    <X className="h-5 w-5 text-muted-foreground" />
                                </button>
                            </div>

                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-3" />
                                    <p className="text-sm text-muted-foreground">Cargando información...</p>
                                </div>
                            ) : worker ? (
                                <div className="p-5 space-y-5">
                                    {/* ── Worker Identity Card ── */}
                                    <div className="bg-gradient-to-br from-brand-primary/5 to-[#5AC8FA]/5 rounded-2xl p-5 border border-brand-primary/10">
                                        <div className="flex items-center gap-4">
                                            <div className="h-16 w-16 rounded-2xl bg-brand-primary text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-brand-primary/20">
                                                {initials}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-lg font-bold text-brand-dark">
                                                    {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                                                </h3>
                                                <p className="text-sm text-muted-foreground">{worker.rut}</p>
                                                {!worker.activo && (
                                                    <span className="inline-block mt-1 px-2 py-0.5 rounded bg-destructive/10 text-destructive text-[10px] font-bold uppercase">Finiquitado</span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info chips */}
                                        <div className="mt-4 flex flex-wrap gap-2">
                                            {worker.cargo_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-brand-dark border border-[#E8E8ED]">
                                                    <Briefcase className="h-3.5 w-3.5 text-brand-primary" /> {worker.cargo_nombre}
                                                </span>
                                            )}
                                            {worker.empresa_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-brand-dark border border-[#E8E8ED]">
                                                    <Building2 className="h-3.5 w-3.5 text-warning" /> {worker.empresa_nombre}
                                                </span>
                                            )}
                                            {worker.obra_nombre && (
                                                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white rounded-xl text-xs font-medium text-brand-dark border border-[#E8E8ED]">
                                                    <MapPin className="h-3.5 w-3.5 text-brand-accent" /> {worker.obra_nombre}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* ── Contact Info ── */}
                                    {(worker.telefono || worker.email) && (
                                        <div className="space-y-2">
                                            {worker.telefono && (
                                                <a href={`tel:${worker.telefono}`} className="flex items-center gap-3 p-3 rounded-xl bg-background hover:bg-[#E8E8ED] transition-colors">
                                                    <Phone className="h-4 w-4 text-brand-accent" />
                                                    <span className="text-sm text-brand-dark">{worker.telefono}</span>
                                                </a>
                                            )}
                                            {worker.email && (
                                                <a href={`mailto:${worker.email}`} className="flex items-center gap-3 p-3 rounded-xl bg-background hover:bg-[#E8E8ED] transition-colors">
                                                    <Mail className="h-4 w-4 text-brand-primary" />
                                                    <span className="text-sm text-brand-dark truncate">{worker.email}</span>
                                                </a>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Document Compliance ── */}
                                    <div className="bg-background rounded-2xl p-4">
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-sm font-semibold text-brand-dark flex items-center gap-2">
                                                <FileText className="h-4 w-4 text-brand-primary" /> Documentación
                                            </span>
                                            <span className={cn(
                                                "text-xs font-bold px-2.5 py-1 rounded-lg",
                                                docPct === 100 ? "bg-brand-accent/10 text-brand-accent" :
                                                    docPct > 50 ? "bg-warning/10 text-warning" :
                                                        "bg-destructive/10 text-destructive"
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
                                                    docPct === 100 ? "bg-brand-accent" :
                                                        docPct > 50 ? "bg-warning" : "bg-destructive"
                                                )}
                                            />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-2">
                                            {docPct >= 100 ? 'Documentación completa ✓' : `Faltan ${Math.max(totalRequired - completedDocs, 0)} documento(s) obligatorio(s)`}
                                        </p>
                                    </div>

                                    {/* ── Recent Documents List ── */}
                                    {docs.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-brand-dark flex items-center gap-2 mb-3">
                                                <FileText className="h-4 w-4 text-brand-primary" /> Documentos Subidos
                                            </h4>
                                            <div className="space-y-2">
                                                {docs.slice(0, 5).map((doc: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-background hover:bg-[#E8E8ED]/70 transition-colors">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-semibold text-brand-dark truncate">{doc.tipo_nombre || doc.nombre_archivo}</p>
                                                            {doc.fecha_vencimiento && (
                                                                <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
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
                                            onClick={() => {
                                                if (onEditWorker) {
                                                    onEditWorker(worker.id);
                                                } else {
                                                    setModalType('form');
                                                }
                                            }}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/10 transition-colors group"
                                        >
                                            <Pencil className="h-5 w-5 text-brand-primary group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-semibold text-brand-primary">Editar</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                if (onViewDocuments) {
                                                    onViewDocuments(worker.id);
                                                } else {
                                                    setModalType('docs');
                                                }
                                            }}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-warning/5 hover:bg-warning/10 border border-warning/10 transition-colors group"
                                        >
                                            <FileText className="h-5 w-5 text-warning group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-semibold text-warning">Docs</span>
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCalendar(true);
                                            }}
                                            className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-brand-accent/5 hover:bg-brand-accent/10 border border-brand-accent/10 transition-colors group"
                                        >
                                            <Calendar className="h-5 w-5 text-brand-accent group-hover:scale-110 transition-transform" />
                                            <span className="text-[11px] font-semibold text-brand-accent">Asistencia</span>
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Calendar Modal */}
            <WorkerCalendarModal
                isOpen={showCalendar}
                onClose={() => setShowCalendar(false)}
                worker={worker as any}
                estados={estados}
            />

            {/* Action Modal (Edit/Docs) */}
            <Modal
                isOpen={modalType !== null}
                onClose={() => {
                    setModalType(null);
                    setIsUploading(false);
                }}
                title={
                    modalType === 'form'
                        ? "Editar Trabajador"
                        : `Documentos: ${worker?.apellido_paterno} ${worker?.apellido_materno || ''} ${worker?.nombres}`
                }
                size={modalType === 'docs' ? 'dynamic' : 'md'}
            >
                {modalType === 'form' && worker && (
                    <WorkerForm
                        initialData={worker as unknown as Trabajador}
                        onCancel={() => setModalType(null)}
                        onSuccess={() => {
                            setModalType(null);
                            onUpdate?.();
                            // Re-fetch data for the quick view itself
                            setRefreshKey(prev => prev + 1);
                        }}
                    />
                )}

                {modalType === 'docs' && worker && (
                    <div className="space-y-4 md:space-y-6">
                        <div className="bg-brand-primary/5 border border-brand-primary/10 p-3 md:p-4 rounded-2xl flex items-center gap-3 md:gap-4">
                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-brand-primary text-white flex items-center justify-center font-bold text-lg md:text-xl shrink-0">
                                {initials}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-brand-dark">{worker.rut}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-brand-primary/10 text-brand-primary text-[10px] font-black uppercase tracking-wider">
                                        {worker.obra_nombre || 'Sin Obra'}
                                    </span>
                                </div>
                                <p className="text-xs font-medium text-muted-foreground mt-1 truncate">
                                    {worker.empresa_nombre} • {worker.cargo_nombre || 'Sin Cargo'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-background p-3 md:p-4 rounded-xl">
                            <div className="hidden sm:block">
                                <h4 className="text-base font-semibold text-brand-dark">Bóveda de Documentos</h4>
                                <p className="text-sm text-muted-foreground">Sube y gestiona archivos para este trabajador.</p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {!isUploading && (
                                    <Button
                                        size="sm"
                                        variant="glass"
                                        onClick={async () => {
                                            try {
                                                const nid = toast.loading('Generando ZIP...');
                                                const response = await api.get(`/documentos/download-all/${worker.id}`, {
                                                    responseType: 'blob',
                                                });
                                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.setAttribute('download', `Documentos_${worker.apellido_paterno}_${worker.nombres}.zip`);
                                                document.body.appendChild(link);
                                                link.click();
                                                link.remove();
                                                toast.dismiss(nid);
                                                toast.success('Descarga iniciada');
                                            } catch (err) {
                                                toast.error('Error al descargar documentos');
                                            }
                                        }}
                                        className="text-brand-primary hover:text-[#027A3B] flex-1 sm:flex-initial"
                                        leftIcon={<Download className="h-4 w-4" />}
                                    >
                                        <span className="hidden sm:inline">Descargar Todo (.zip)</span>
                                        <span className="sm:hidden">Descargar</span>
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant={isUploading ? 'glass' : 'primary'}
                                    disabled={!checkPermission('documentos', 'puede_crear') && !isUploading}
                                    onClick={() => setIsUploading(!isUploading)}
                                    leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                    className={`flex-1 sm:flex-initial ${(!checkPermission('documentos', 'puede_crear') && !isUploading) ? "opacity-50 grayscale cursor-not-allowed" : ""}`}
                                    title={(!checkPermission('documentos', 'puede_crear') && !isUploading) ? "No tienes permisos" : (isUploading ? "Volver" : "Subir Documento")}
                                >
                                    <span className="hidden sm:inline">{isUploading ? 'Volver a la lista' : 'Subir Documento'}</span>
                                    <span className="sm:hidden">{isUploading ? 'Volver' : 'Subir'}</span>
                                </Button>
                            </div>
                        </div>

                        {isUploading ? (
                            <DocumentUploader
                                trabajadorId={worker.id}
                                onCancel={() => setIsUploading(false)}
                                onSuccess={() => {
                                    setIsUploading(false);
                                    onUpdate?.();
                                    // Refresh quick view document list
                                    setRefreshKey(prev => prev + 1);
                                }}
                            />
                        ) : (
                            <DocumentList trabajadorId={worker.id} />
                        )}
                    </div>
                )}
            </Modal>
        </>
    );
};

export default WorkerQuickView;

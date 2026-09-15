import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, FileText, Calendar, Building2, Briefcase, MapPin, Clock, Loader2, Phone, Mail, Download, ArrowLeft, FilePlus, Save, Eye, CalendarCheck, CalendarOff, AlertTriangle, IdCard, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import { fmtFecha } from '../../utils/format';
import { DesvinculacionInfo } from './DesvinculacionInfo';
import type { UltimaDesvinculacion } from './desvinculacionSchema';
import { listarDatosPersonales } from '../consultas/solicitudIngresoSchema';
import { IconButton } from '../ui/IconButton';
import { Chip } from '../ui/Chip';
import { cn } from '../../utils/cn';
import { WorkerCalendarModal } from '../attendance/WorkerCalendarModal';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { WorkerForm } from './WorkerForm';
import { DocumentUploader } from '../documents/DocumentUploader';
import { DocumentList } from '../documents/DocumentList';
import { DocumentosGeneradosList } from '../documents/DocumentosGeneradosList';
import { contarObligatorios, docsSubidos, faltanDatosContrato } from '../documents/documentosLaborales';
import { DATOS_PERSONALES_LABELS } from '../consultas/solicitudIngresoSchema';
import { descargarArchivo } from '../../utils/descargarArchivo';
import { antiguedad, porcentajeDocs } from './fichaTrabajador';
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
    fecha_desvinculacion: string | null;
    categoria_reporte: string;
    activo: boolean;
    // Datos personales (ficha de ingreso digital, mig 108) — opcionales, solo lectura acá.
    fecha_nacimiento?: string | null;
    estado_civil?: string | null;
    direccion?: string | null;
    comuna?: string | null;
    afp?: string | null;
    salud?: string | null;
    nacionalidad?: string | null;
    cargas_familiares?: number | null;
    talla_calzado?: number | null;
    talla_pantalon?: number | null;
    talla_polera?: string | null;
    cuenta_rut?: boolean | null;
    banco?: string | null;
    tipo_cuenta?: string | null;
    numero_cuenta?: string | null;
}

/** GET /trabajadores/:id/resumen — stats de contrato/asistencia para la ficha. */
interface ResumenData {
    fecha_ingreso: string | null;
    fecha_desvinculacion: string | null;
    activo: boolean;
    dias_trabajados: number;
    faltas: number;
    dias_presente: number;
    dias_vacaciones: number;
    dias_licencia: number;
    dias_registrados: number;
    /** Última desvinculación (resumida, sin detalle) — solo viene si el trabajador está inactivo (mig 112). */
    ultima_desvinculacion?: UltimaDesvinculacion | null;
}

interface DocInfo {
    id?: number;
    tipo_nombre: string;
    nombre_archivo: string;
    fecha_vencimiento: string | null;
    activo?: boolean;
    // Mig 110 (plan Gestiones B2): los generados van en su propia lista; los restringidos se bajan por /documentos-laborales.
    origen?: 'subido' | 'generado';
    restringido?: boolean | number;
    tipo_obligatorio?: boolean | number | null;
    tipo_documento_id?: number;
}

interface WorkerQuickViewProps {
    workerId: number | null;
    onClose: () => void;
    onEditWorker?: (id: number) => void;
    onViewDocuments?: (id: number) => void;
    onViewAttendance?: (id: number) => void;
    onUpdate?: () => void;
}

/**
 * Ficha rápida del trabajador (rediseño 2026-09-15). Antes era un scroll único de ~8 bloques con las
 * acciones al final: había que bajar toda la ficha para llegar a "Editar". Ahora:
 *  - Cabecera fija con la identidad (avatar, nombre, RUT, estado) y la línea cargo · empresa · obra.
 *  - Acciones arriba y siempre visibles (Editar / Asistencia).
 *  - Tres pestañas: Resumen (contrato, antigüedad, asistencia, contacto), Documentos (completitud,
 *    subidos y los generados por Bóveda) y Datos (ficha personal + lo que le falta al contrato).
 * La lógica de carga, permisos y modales no cambia.
 */
const WorkerQuickView: React.FC<WorkerQuickViewProps> = ({
    workerId, onClose, onEditWorker, onViewDocuments, onViewAttendance, onUpdate
}) => {
    const [worker, setWorker] = useState<WorkerData | null>(null);
    const [resumen, setResumen] = useState<ResumenData | null>(null);
    const [docs, setDocs] = useState<DocInfo[]>([]);
    const [totalRequired, setTotalRequired] = useState(0);
    const [loading, setLoading] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [estados, setEstados] = useState<EstadoAsistencia[]>([]);
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [viewingDocId, setViewingDocId] = useState<number | null>(null);
    const [tab, setTab] = useState<'resumen' | 'documentos' | 'datos'>('resumen');
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' ? window.innerWidth < 1024 : false
    );
    const { hasPermission } = useAuth();

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 1024);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    /**
     * Abre un documento del trabajador: PDF, imagen y TXT en una pestaña; Word y el resto se guardan
     * con su nombre (`modoApertura` decide). Un tipo restringido (contrato/finiquito/anexo, mig 110)
     * va por /documentos-laborales, que exige documentos.laborales.descargar y muestra el 403 con el
     * nombre del permiso que falta.
     */
    const handleViewDoc = async (doc: any) => {
        if (!doc?.id) return;
        setViewingDocId(doc.id);
        const url = doc.restringido ? `/documentos-laborales/${doc.id}/download` : `/documentos/download/${doc.id}`;
        try {
            await descargarArchivo(api, url, { nombre: doc.nombre_archivo, fallbackError: 'No se pudo abrir el documento' });
        } finally {
            setViewingDocId(null);
        }
    };

    useEffect(() => {
        if (!workerId) return;
        // ... (rest of search/data logic remains identical)

        setLoading(true);
        setWorker(null);
        setDocs([]);
        setResumen(null);
        setTab('resumen');   // cada trabajador abre en su resumen

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

        // Ficha-resumen: contrato + stats de asistencia (días trabajados, faltas…).
        const p5 = api.get(`/trabajadores/${workerId}/resumen`)
            .then(res => {
                const d = (res.data as any).data || res.data;
                if (d && typeof d === 'object') setResumen(d as ResumenData);
            })
            .catch(() => { });

        Promise.all([p1, p2, p3, p4, p5]).finally(() => setLoading(false));
    }, [workerId, refreshKey]);

    const isOpen = workerId !== null;

    // Solo tipos OBLIGATORIOS distintos: el kit generado (obligatorio=0) no infla la completitud (B2).
    const completedDocs = contarObligatorios(docs);
    const subidos = docsSubidos(docs);
    // Datos que el contrato imprime y la ficha no tiene: hoy los campos vacíos simplemente no se
    // muestran, así que nada distingue una ficha completa de una vacía (plan Gestiones B2b).
    const faltanContrato = worker && worker.activo !== false && hasPermission('trabajadores.editar')
        ? faltanDatosContrato(worker) : [];
    const docPct = porcentajeDocs(completedDocs, totalRequired);
    const initials = worker ? `${(worker.apellido_paterno || '')[0]}${worker.nombres[0]}` : '';
    // Solo los datos personales que existen (el teléfono ya se muestra en Contacto).
    const datosPersonales = listarDatosPersonales(worker).filter(d => d.key !== 'telefono');
    const anios = worker ? antiguedad(worker.fecha_ingreso, worker.activo ? null : worker.fecha_desvinculacion) : null;

    const TABS = [
        { id: 'resumen' as const, label: 'Resumen' },
        { id: 'documentos' as const, label: 'Documentos', badge: totalRequired > 0 && docPct < 100 ? totalRequired - completedDocs : 0 },
        { id: 'datos' as const, label: 'Datos', badge: faltanContrato.length },
    ];

    /** Dato con rótulo pequeño arriba y valor abajo (sin caja: la caja es la sección). */
    const dato = (label: string, valor: React.ReactNode, icon?: React.ReactNode) => (
        <div className="min-w-0">
            <p className="flex items-center gap-1 text-micro font-bold uppercase tracking-wide text-muted-foreground">{icon}{label}</p>
            <p className="mt-0.5 text-sm font-semibold text-brand-dark break-words">{valor}</p>
        </div>
    );

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
                            drag={isMobile ? "y" : false}
                            dragConstraints={{ top: 0 }}
                            dragElastic={0.1}
                            onDragEnd={(_, info) => {
                                if (isMobile && (info.offset.y > 150 || info.velocity.y > 500)) {
                                    onClose();
                                }
                            }}
                            initial={isMobile ? { y: '100%', x: 0 } : { x: '100%', y: 0 }}
                            animate={{ x: 0, y: 0 }}
                            exit={isMobile ? { y: '100%', x: 0 } : { x: '100%', y: 0 }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className={cn(
                                "fixed z-[61] bg-card shadow-2xl flex flex-col",
                                isMobile
                                    ? "bottom-0 left-0 right-0 w-full max-h-[92dvh] rounded-t-[32px]"
                                    : "inset-y-0 right-0 w-[440px] xl:w-[500px] rounded-l-3xl"
                            )}
                        >
                            {/* Mobile Drag Handle */}
                            {isMobile && (
                                <div className="pt-3 pb-1 flex justify-center shrink-0" onClick={onClose}>
                                    <div className="w-12 h-1.5 rounded-full bg-muted mb-1" />
                                </div>
                            )}

                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-brand-primary mb-3" />
                                    <p className="text-sm text-muted-foreground">Cargando información...</p>
                                </div>
                            ) : worker ? (<>
                                {/* ── Cabecera fija: identidad + acciones + pestañas ── */}
                                <div className={cn('shrink-0 border-b border-border px-5 pt-4', isMobile && 'rounded-t-[32px] pt-2')}>
                                    <div className="flex items-start gap-3">
                                        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-bold',
                                            worker.activo ? 'bg-brand-primary text-white' : 'bg-muted text-muted-foreground')}>
                                            {initials}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <h2 className="text-title-sm font-bold text-brand-dark leading-tight">
                                                {worker.apellido_paterno} {worker.apellido_materno || ''} {worker.nombres}
                                            </h2>
                                            <p className="text-caption text-muted-foreground tabular-nums">{worker.rut}</p>
                                        </div>
                                        <IconButton
                                            variant="ghost"
                                            aria-label="Cerrar ficha"
                                            onClick={onClose}
                                            className="-mr-1 -mt-1 shrink-0"
                                            icon={<X className="h-5 w-5" />}
                                        />
                                    </div>

                                    {!worker.activo && (
                                        <div className="mt-2">
                                            <Chip tone="danger" icon={<CalendarOff className="h-3 w-3" />}
                                                label={`Desvinculado${worker.fecha_desvinculacion ? ` · ${fmtFecha(worker.fecha_desvinculacion)}` : ''}`} />
                                        </div>
                                    )}

                                    <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted-foreground">
                                        <span className="flex items-center gap-1.5 min-w-0"><Briefcase className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{worker.cargo_nombre || 'Sin cargo'}</span></span>
                                        <span className="flex items-center gap-1.5 min-w-0"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{worker.obra_nombre || 'Sin obra'}</span></span>
                                        <span className="flex items-center gap-1.5 min-w-0"><Building2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{worker.empresa_nombre || 'Sin empresa'}</span></span>
                                    </p>

                                    {/* Acciones arriba: antes estaban al final de todo el scroll. */}
                                    <div className="mt-3 flex gap-2">
                                        <Button size="sm" variant="glass" className="flex-1" leftIcon={<Pencil className="h-4 w-4" />}
                                            disabled={!hasPermission('trabajadores.editar')}
                                            onClick={() => { if (onEditWorker) onEditWorker(worker.id); else setModalType('form'); }}>
                                            Editar
                                        </Button>
                                        <Button size="sm" variant="glass" className="flex-1" leftIcon={<Calendar className="h-4 w-4" />}
                                            onClick={() => setShowCalendar(true)}>
                                            Asistencia
                                        </Button>
                                    </div>

                                    <div role="tablist" aria-label="Secciones de la ficha" className="mt-3 flex gap-1">
                                        {TABS.map(t => (
                                            <Button key={t.id} role="tab" size="sm" variant="ghost" aria-selected={tab === t.id}
                                                onClick={() => setTab(t.id)}
                                                className={cn('h-10 flex-1 rounded-none rounded-t-lg border-b-2 gap-1.5 text-section font-semibold',
                                                    tab === t.id ? 'border-brand-primary text-brand-primary' : 'border-transparent text-muted-foreground hover:text-brand-dark')}>
                                                {t.label}
                                                {!!t.badge && t.badge > 0 && (
                                                    <span className="flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-amber-500 text-micro font-bold tabular-nums text-white">{t.badge}</span>
                                                )}
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Contenido ── */}
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
                                    {tab === 'resumen' && (<>
                                        <section className="rounded-2xl border border-border bg-background p-4">
                                            <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Contrato</p>
                                            <div className="mt-2.5 grid grid-cols-2 gap-3">
                                                {dato('Inicio', worker.fecha_ingreso ? fmtFecha(worker.fecha_ingreso) : '—', <CalendarCheck className="h-3 w-3 text-brand-primary" />)}
                                                {dato('Término', worker.fecha_desvinculacion ? fmtFecha(worker.fecha_desvinculacion) : (worker.activo ? 'Vigente' : '—'), <CalendarOff className="h-3 w-3 text-muted-foreground" />)}
                                                {anios && dato('Antigüedad', (
                                                    <span className={cn(anios.porCumplir10Meses && worker.activo && 'text-amber-600 dark:text-amber-400')}>
                                                        {anios.texto}{anios.porCumplir10Meses && worker.activo ? ' · renovación cerca' : ''}
                                                    </span>
                                                ), <Clock className="h-3 w-3 text-muted-foreground" />)}
                                            </div>
                                        </section>

                                        {/* Desvinculación (mig 112): causal, fecha, marca — solo con trabajadores.ver */}
                                        {!worker.activo && resumen?.ultima_desvinculacion && hasPermission('trabajadores.ver') && (
                                            <DesvinculacionInfo ultima={resumen.ultima_desvinculacion} />
                                        )}

                                        {resumen && (
                                            <section className="rounded-2xl border border-border bg-background p-4">
                                                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Asistencia registrada</p>
                                                <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-3">
                                                    <div>
                                                        <p className="text-title-sm font-bold tabular-nums leading-none text-brand-dark">{resumen.dias_trabajados}</p>
                                                        <p className="mt-1 text-micro font-bold uppercase tracking-wide text-muted-foreground">Días trabajados</p>
                                                    </div>
                                                    <div>
                                                        <p className={cn('text-title-sm font-bold tabular-nums leading-none', resumen.faltas > 0 ? 'text-red-600 dark:text-red-400' : 'text-brand-dark')}>{resumen.faltas}</p>
                                                        <p className="mt-1 text-micro font-bold uppercase tracking-wide text-muted-foreground">Faltas</p>
                                                    </div>
                                                    {resumen.dias_vacaciones > 0 && dato('Vacaciones', `${resumen.dias_vacaciones} días`)}
                                                    {resumen.dias_licencia > 0 && dato('Licencia médica', `${resumen.dias_licencia} días`)}
                                                </div>
                                            </section>
                                        )}

                                        {(worker.telefono || worker.email) && (
                                            <section className="rounded-2xl border border-border bg-background p-4">
                                                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Contacto</p>
                                                <div className="mt-2 flex flex-col gap-1">
                                                    {worker.telefono && (
                                                        <a href={`tel:${worker.telefono}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-brand-dark hover:bg-muted transition-colors">
                                                            <Phone className="h-4 w-4 shrink-0 text-brand-primary" />{worker.telefono}
                                                        </a>
                                                    )}
                                                    {worker.email && (
                                                        <a href={`mailto:${worker.email}`} className="flex items-center gap-2.5 rounded-xl px-2 py-2 text-sm text-brand-dark hover:bg-muted transition-colors">
                                                            <Mail className="h-4 w-4 shrink-0 text-brand-primary" /><span className="truncate">{worker.email}</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </section>
                                        )}
                                    </>)}

                                    {tab === 'documentos' && (<>
                                        <section className="rounded-2xl border border-border bg-background p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">Documentación obligatoria</p>
                                                <span className={cn('text-sm font-bold tabular-nums',
                                                    docPct === 100 ? 'text-brand-primary' : docPct > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400')}>
                                                    {completedDocs}/{totalRequired}
                                                </span>
                                            </div>
                                            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${docPct}%` }}
                                                    transition={{ duration: 0.6, ease: 'easeOut' }}
                                                    className={cn('h-full rounded-full', docPct === 100 ? 'bg-brand-primary' : docPct > 50 ? 'bg-amber-500' : 'bg-red-500')}
                                                />
                                            </div>
                                            <div className="mt-2.5 flex items-center justify-between gap-3">
                                                <p className="text-caption text-muted-foreground">
                                                    {docPct >= 100 ? 'Documentación completa' : `Faltan ${Math.max(totalRequired - completedDocs, 0)} documento${totalRequired - completedDocs === 1 ? '' : 's'}`}
                                                </p>
                                                <Button size="sm" variant="ghost" leftIcon={<FolderOpen className="h-4 w-4" />}
                                                    onClick={() => { if (onViewDocuments) onViewDocuments(worker.id); else setModalType('docs'); }}>
                                                    Abrir bóveda
                                                </Button>
                                            </div>
                                        </section>

                                        {subidos.length > 0 && (
                                            <section>
                                                <p className="mb-2 flex items-center gap-2 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                                                    <FileText className="h-3.5 w-3.5" /> Documentos subidos
                                                </p>
                                                <div className="space-y-1.5">
                                                    {subidos.slice(0, 5).map((doc: any, i: number) => (
                                                        <div key={i}
                                                            onClick={() => handleViewDoc(doc)}
                                                            className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 py-2.5 hover:border-brand-primary/30 transition-colors cursor-pointer"
                                                            title="Ver documento">
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-section font-semibold text-brand-dark truncate">{doc.tipo_nombre || doc.nombre_archivo}</p>
                                                                {doc.fecha_vencimiento && (
                                                                    <p className="mt-0.5 flex items-center gap-1 text-caption text-muted-foreground">
                                                                        <Clock className="h-3 w-3" />
                                                                        Vence: {new Date(doc.fecha_vencimiento).toLocaleDateString('es-CL')}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <IconButton size="sm" aria-label="Ver documento"
                                                                disabled={viewingDocId === doc.id}
                                                                onClick={(e) => { e.stopPropagation(); handleViewDoc(doc); }}
                                                                className="hover:bg-brand-primary/10 hover:text-brand-primary shrink-0"
                                                                icon={viewingDocId === doc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} />
                                                        </div>
                                                    ))}
                                                    {subidos.length > 5 && (
                                                        <Button variant="ghost" size="sm" className="w-full text-muted-foreground"
                                                            onClick={() => { if (onViewDocuments) onViewDocuments(worker.id); else setModalType('docs'); }}>
                                                            Ver los {subidos.length - 5} restantes
                                                        </Button>
                                                    )}
                                                </div>
                                            </section>
                                        )}

                                        {/* ── Documentos generados por Bóveda (plan Gestiones B2) ── */}
                                        {hasPermission('documentos.ver') && (
                                            <DocumentosGeneradosList
                                                trabajadorId={worker.id}
                                                worker={worker}
                                                refreshKey={refreshKey}
                                                onCambio={() => setRefreshKey(prev => prev + 1)}
                                                // undefined mientras el resumen carga: el modal de finiquito lo pide él mismo si hace falta.
                                                ultimaDesvinculacion={resumen ? (resumen.ultima_desvinculacion ?? null) : undefined}
                                            />
                                        )}
                                    </>)}

                                    {tab === 'datos' && (<>
                                        {faltanContrato.length > 0 && (
                                            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-caption text-amber-800 dark:border-amber-800/60 dark:bg-amber-500/10 dark:text-amber-300">
                                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                                <span>
                                                    <span className="font-bold">Faltan datos que el contrato necesita:</span>{' '}
                                                    {faltanContrato.map(c => DATOS_PERSONALES_LABELS[c]).join(', ')}. Complétalos en Editar, o al emitir el kit de ingreso.
                                                </span>
                                            </div>
                                        )}
                                        {datosPersonales.length > 0 ? (
                                            <section className="rounded-2xl border border-border bg-background p-4">
                                                <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                                                    <IdCard className="h-3.5 w-3.5" /> Datos personales
                                                </p>
                                                <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-3">
                                                    {datosPersonales.map(d => (
                                                        <div key={d.key} className={cn('min-w-0', d.key === 'direccion' && 'col-span-2')}>
                                                            <dt className="text-micro font-bold uppercase tracking-wide text-muted-foreground">{d.label}</dt>
                                                            <dd className="mt-0.5 text-sm font-semibold text-brand-dark break-words">{d.value}</dd>
                                                        </div>
                                                    ))}
                                                </dl>
                                            </section>
                                        ) : faltanContrato.length === 0 && (
                                            <p className="py-8 text-center text-sm text-muted-foreground">
                                                Esta ficha no tiene datos personales cargados. Se completan en <b>Editar</b> o al aprobar la ficha de ingreso.
                                            </p>
                                        )}
                                    </>)}
                                </div>
                            </>) : null}
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
                obraId={(worker as any)?.obra_id ?? undefined}
                onSuccess={() => {
                    setRefreshKey(prev => prev + 1);
                    if (onUpdate) onUpdate();
                }}
            />

            {/* Action Modal (Edit/Docs) */}
            <Modal
                isOpen={modalType !== null}
                onClose={() => {
                    setModalType(null);
                    setIsUploading(false);
                }}
                title={modalType === 'form' ? 'Editar trabajador' : 'Bóveda de documentos'}
                description={worker ? `${worker.apellido_paterno} ${worker.apellido_materno || ''} ${worker.nombres} · ${worker.rut}`.replace(/\s+/g, ' ') : undefined}
                icon={modalType === 'form' ? Pencil : FolderOpen}
                size={modalType === 'docs' ? 'dynamic' : 'md'}
                headerAction={
                    modalType === 'form' ? (
                        <Button type="submit" form="worker-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
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
                    <div className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 rounded-2xl border border-border bg-background p-3 md:p-4">
                            <div className="hidden sm:block">
                                <p className="text-section font-semibold text-brand-dark">{worker.obra_nombre || 'Sin obra'} · {worker.cargo_nombre || 'Sin cargo'}</p>
                                <p className="text-caption text-muted-foreground">Sube y gestiona los archivos de este trabajador.</p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {!isUploading && (
                                    <Button
                                        size="sm"
                                        variant="glass"
                                        onClick={async () => {
                                            // El ZIP omite los laborales restringidos (mig 110): el helper avisa
                                            // cuántos quedaron fuera y muestra el mensaje del backend si falla.
                                            const nid = toast.loading('Generando ZIP...');
                                            const ok = await descargarArchivo(api, `/documentos/download-all/${worker.id}`, {
                                                nombre: `Documentos_${worker.apellido_paterno}_${worker.nombres}.zip`,
                                                modo: 'download',
                                                fallbackError: 'No se pudo descargar la documentación',
                                            });
                                            toast.dismiss(nid);
                                            if (ok) toast.success('Descarga iniciada');
                                        }}
                                        className="flex-1 sm:flex-initial"
                                        leftIcon={<Download className="h-4 w-4" />}
                                    >
                                        <span className="hidden sm:inline">Descargar todo (.zip)</span>
                                        <span className="sm:hidden">Descargar</span>
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant={isUploading ? 'glass' : 'primary'}
                                    disabled={!hasPermission('documentos.subir') && !isUploading}
                                    onClick={() => setIsUploading(!isUploading)}
                                    leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                    className="flex-1 sm:flex-initial"
                                    title={(!hasPermission('documentos.subir') && !isUploading) ? "No tienes permisos" : (isUploading ? "Volver" : "Subir Documento")}
                                >
                                    <span className="hidden sm:inline">{isUploading ? 'Volver a la lista' : 'Subir documento'}</span>
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

import React, { useState, useEffect, useRef } from 'react';
import {
    Users,
    Search,
    UserPlus,
    Trash2,
    UserPen,
    Filter,
    ArrowUpDown,
    FilePlus,
    Loader2,
    FileText,
    X,
    Building2,
    Briefcase,
    Download,
    ArrowLeft,
    FileDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { showDeleteToast } from '../utils/toastUtils';
import { useInView } from 'react-intersection-observer';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WorkerForm } from '../components/workers/WorkerForm';
import { DocumentUploader } from '../components/documents/DocumentUploader';
import { DocumentList } from '../components/documents/DocumentList';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import { cn } from '../utils/cn';
import type { Trabajador, Empresa, Cargo } from '../types/entities';
import type { ApiResponse } from '../types';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useAuth } from '../context/AuthContext';
import WorkerLink from '../components/workers/WorkerLink';
import WorkerQuickView from '../components/workers/WorkerQuickView';

const WorkersPage: React.FC = () => {
    const { selectedObra } = useObra();
    const { checkPermission } = useAuth();
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);

    const [loading, setLoading] = useState(true);
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [markedRows, setMarkedRows] = useState<Set<number>>(new Set());

    const toggleMarkedRow = (index: number) => {
        setMarkedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };
    const [search, setSearch] = useState('');
    const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
    const [selectedCargo, setSelectedCargo] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [showInactive, setShowInactive] = useState(false);

    // Pagination states
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const { ref, inView } = useInView({
        threshold: 0,
        rootMargin: '100px',
    });
    const fetchingRef = useRef(false);

    // Document completion data: { [workerId]: { uploaded, total, percentage } }
    const [completion, setCompletion] = useState<Record<number, { uploaded: number, total: number, percentage: number }>>({});

    // Modal states
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Initial Fetch of Catalogs
    useEffect(() => {
        const fetchCatalogs = async () => {
            try {
                const [empRes, carRes] = await Promise.all([
                    api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                    api.get<ApiResponse<Cargo[]>>('/cargos?activo=true')
                ]);
                setEmpresas(empRes.data.data);
                setCargos(carRes.data.data);
            } catch (err) {
                console.error('Error fetching catalogs', err);
            }
        };
        fetchCatalogs();
    }, []);

    const fetchWorkers = async (pageNumber: number = 1) => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        if (pageNumber === 1) {
            setLoading(true);
        } else {
            setIsLoadingMore(true);
        }

        try {
            const obraQuery = selectedObra ? `&obra_id=${selectedObra.id}` : '';
            const empresaQuery = selectedEmpresa ? `&empresa_id=${selectedEmpresa}` : '';
            const cargoQuery = selectedCargo ? `&cargo_id=${selectedCargo}` : '';
            const activoQuery = showInactive ? '&activo=all' : '&activo=true';

            const response = await api.get<ApiResponse<Trabajador[]>>(`/trabajadores?q=${search}${obraQuery}${empresaQuery}${cargoQuery}${activoQuery}&page=${pageNumber}&limit=50`);
            const data = response.data?.data || [];

            setWorkers(prev => pageNumber === 1 ? data : [...prev, ...data]);
            setHasMore(data.length === 50); // Pagination info based on length

            // Fetch completion percentages for all workers
            if (data.length > 0) {
                const ids = data.map(w => w.id);
                try {
                    const compRes = await api.post<Record<number, { uploaded: number, total: number, percentage: number }>>('/documentos/kpi/completitud', { trabajador_ids: ids });
                    setCompletion(prev => pageNumber === 1 ? compRes.data : { ...prev, ...compRes.data });
                } catch {
                    // Silently fail — completion will show 0%
                }
            }
        } catch (error: any) {
            console.error('Error fetching workers:', error);
            const msg = error.response?.data?.error || error.response?.data?.message || error.message || '';
            toast.error(`Error al cargar trabajadores. ${msg}`);
            setHasMore(false); // Stop trying to fetch on error
        } finally {
            if (pageNumber === 1) {
                setLoading(false);
            }
            setIsLoadingMore(false);
            // Small delay to allow react-intersection-observer to update inView before next fetch
            setTimeout(() => {
                fetchingRef.current = false;
            }, 200);
        }
    };

    const handleDelete = (id: number) => {
        showDeleteToast({
            onConfirm: async () => {
                await api.delete(`/trabajadores/${id}`);
                fetchWorkers();
            },
            message: "¿Desactivar?",
            successMessage: "Trabajador desactivado",
            errorMessage: "Error al desactivar trabajador"
        });
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchWorkers(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [search, selectedObra, selectedEmpresa, selectedCargo, showInactive]);

    // Infinite Scroll trigger
    useEffect(() => {
        if (inView && hasMore && !loading && !isLoadingMore && !fetchingRef.current) {
            setPage(prev => {
                const next = prev + 1;
                fetchWorkers(next);
                return next;
            });
        }
    }, [inView, hasMore, loading, isLoadingMore]);

    // Helper function for completion color
    const getCompletionColor = (pct: number) => {
        if (pct >= 80) return { bar: 'bg-[#34C759]', text: 'text-[#34C759]' };
        if (pct >= 50) return { bar: 'bg-[#FF9F0A]', text: 'text-[#FF9F0A]' };
        return { bar: 'bg-[#FF3B30]', text: 'text-[#FF3B30]' };
    };

    // Filtered and sorted workers
    // Client-side sorting only
    const sortedWorkers = [...workers].sort((a, b) => {
        const nameA = `${a.nombres} ${a.apellido_paterno}`.toLowerCase();
        const nameB = `${b.nombres} ${b.apellido_paterno}`.toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    });

    const handleNewWorker = React.useCallback(() => {
        setSelectedWorker(null);
        setModalType('form');
    }, []);

    const handleExportExcel = async () => {
        try {
            toast.info('Generando nómina de trabajadores...', { id: 'worker-export' });

            const params = new URLSearchParams({
                q: search,
                name: 'Nómina de Trabajadores'
            });
            if (selectedObra) params.append('obra_id', String(selectedObra.id));
            if (selectedEmpresa) params.append('empresa_id', selectedEmpresa);
            if (selectedCargo) params.append('cargo_id', selectedCargo);
            if (!showInactive) params.append('activo', 'true');

            const response = await api.get(`/trabajadores/export?${params.toString()}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', 'Nomina_Trabajadores.xlsx');
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Nómina descargada', { id: 'worker-export' });
        } catch (error) {
            console.error('Error exportando Excel', error);
            toast.error('Error al generar la nómina', { id: 'worker-export' });
        }
    };

    const headerTitle = React.useMemo(() => (
        <div className="flex items-center gap-2 md:gap-3">
            <Users className="h-5 w-5 md:h-6 md:w-6 text-[#029E4D] shrink-0" />
            <div className="flex flex-col md:flex-row md:items-center gap-0.5 md:gap-2 min-w-0">
                <h1 className="text-sm md:text-lg font-bold text-[#1D1D1F] truncate">Trabajadores</h1>
                {workers.length > 0 && (
                    <span className="bg-[#E8E8ED] text-[#6E6E73] text-xs font-semibold px-2 py-0.5 rounded-full w-fit">
                        {workers.length}
                    </span>
                )}
            </div>
        </div>
    ), [workers.length]);

    const headerActions = React.useMemo(() => (
        <div className="flex gap-1.5 md:gap-2">
            {/* Export — icon only on mobile, text on desktop */}
            <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                leftIcon={<FileDown className="h-4 w-4" />}
                title="Exportar Excel"
                className="hidden md:flex"
            >
                Exportar Excel
            </Button>
            <Button
                variant="glass"
                size="icon"
                onClick={handleExportExcel}
                title="Exportar Excel"
                className="md:hidden h-9 w-9"
            >
                <FileDown className="h-4 w-4" />
            </Button>
            {/* New Worker — icon only on mobile */}
            <Button
                onClick={handleNewWorker}
                disabled={!checkPermission('trabajadores', 'puede_crear')}
                leftIcon={<UserPlus className="h-4 w-4" />}
                size="sm"
                className={cn(
                    "hidden md:flex",
                    !checkPermission('trabajadores', 'puede_crear') && "opacity-40 grayscale-[100%] cursor-not-allowed"
                )}
                title={!checkPermission('trabajadores', 'puede_crear') ? "No tienes permisos" : "Nuevo Trabajador"}
            >
                Nuevo Trabajador
            </Button>
            <Button
                onClick={handleNewWorker}
                disabled={!checkPermission('trabajadores', 'puede_crear')}
                size="icon"
                className={cn(
                    "md:hidden h-9 w-9",
                    !checkPermission('trabajadores', 'puede_crear') && "opacity-40 grayscale-[100%] cursor-not-allowed"
                )}
                title={!checkPermission('trabajadores', 'puede_crear') ? "No tienes permisos" : "Nuevo Trabajador"}
            >
                <UserPlus className="h-4 w-4" />
            </Button>
        </div>
    ), [handleNewWorker, handleExportExcel, checkPermission]);

    // Global Header
    useSetPageHeader(headerTitle, headerActions);

    return (
        <div className="space-y-4 md:space-y-6 pb-20 md:pb-4">
            {/* Filters & Search */}
            <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                    <Input
                        placeholder="Buscar por RUT o Nombre..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-10"
                    />
                    <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-[#A1A1A6]" />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={(selectedEmpresa || selectedCargo) ? 'primary' : (showFilters ? 'primary' : 'glass')}
                        leftIcon={(selectedEmpresa || selectedCargo) ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
                        onClick={() => {
                            if (selectedEmpresa || selectedCargo || showInactive) {
                                setSelectedEmpresa('');
                                setSelectedCargo('');
                                setShowInactive(false);
                            } else {
                                setShowFilters(!showFilters);
                            }
                        }}
                    >
                        {(selectedEmpresa || selectedCargo || showInactive) ? 'Limpiar Filtros' : 'Filtros'}
                    </Button>
                    <Button
                        variant="glass"
                        rightIcon={<ArrowUpDown className="h-4 w-4" />}
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                    >
                        {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                    </Button>
                </div>
            </div>

            {/* Expanded Filters Panel */}
            {
                showFilters && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="bg-white rounded-2xl border border-[#D2D2D7] p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
                    >
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#6E6E73] flex items-center gap-2">
                                <Building2 className="h-4 w-4" />
                                Empresa
                            </label>
                            <select
                                value={selectedEmpresa}
                                onChange={(e) => setSelectedEmpresa(e.target.value)}
                                className="w-full bg-white border border-[#D2D2D7] rounded-xl p-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#029E4D]/30 focus:border-[#029E4D] transition-all"
                            >
                                <option value="">Todas las Empresas</option>
                                {empresas.map(e => (
                                    <option key={e.id} value={e.id}>{e.razon_social}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-[#6E6E73] flex items-center gap-2">
                                <Briefcase className="h-4 w-4" />
                                Cargo
                            </label>
                            <select
                                value={selectedCargo}
                                onChange={(e) => setSelectedCargo(e.target.value)}
                                className="w-full bg-white border border-[#D2D2D7] rounded-xl p-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#029E4D]/30 focus:border-[#029E4D] transition-all"
                            >
                                <option value="">Todos los Cargos</option>
                                {cargos.map(c => (
                                    <option key={c.id} value={c.id}>{c.nombre}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-2 flex flex-col justify-end pb-1">
                            <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={() => setShowInactive(!showInactive)}
                            >
                                <div
                                    className={cn(
                                        "w-10 h-5 rounded-full transition-colors relative",
                                        showInactive ? "bg-[#029E4D]" : "bg-[#D2D2D7]"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform",
                                        showInactive ? "translate-x-5" : "translate-x-0"
                                    )} />
                                </div>
                                <span className="text-sm font-medium text-[#6E6E73] group-hover:text-[#1D1D1F] transition-colors">
                                    Mostrar trabajadores finiquitados
                                </span>
                            </div>
                        </div>
                    </motion.div>
                )
            }

            {/* ── MOBILE Card List (hidden on desktop) ── */}
            <div className="md:hidden">
                {loading ? (
                    <div className="py-20 flex flex-col items-center justify-center">
                        <Loader2 className="h-8 w-8 animate-spin text-[#029E4D]" />
                        <p className="text-[#6E6E73] mt-4 text-sm">Cargando trabajadores...</p>
                    </div>
                ) : sortedWorkers.length === 0 ? (
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] py-20 text-center">
                        <Users className="h-10 w-10 text-[#A1A1A6] mx-auto mb-4 opacity-40" />
                        <p className="text-[#6E6E73] text-sm">No se encontraron trabajadores.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {sortedWorkers.map((worker) => {
                            const stats = completion[worker.id] || { uploaded: 0, total: 0, percentage: 0 };
                            const pct = stats.percentage;
                            const colors = getCompletionColor(pct);
                            return (
                                <motion.div
                                    key={worker.id}
                                    initial={{ opacity: 0, y: 20, scale: 0.97 }}
                                    whileInView={{ opacity: 1, y: 0, scale: 1 }}
                                    viewport={{ once: true, margin: '0px 0px -20px 0px' }}
                                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                                    className="bg-white rounded-2xl border border-[#D2D2D7] p-3.5"
                                >
                                    {/* Row 1: Avatar + Name + RUT */}
                                    <div className="flex items-center gap-3 mb-3">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMarkedRow(sortedWorkers.indexOf(worker));
                                            }}
                                            className={cn(
                                                "h-10 w-10 rounded-xl flex items-center justify-center font-black text-xs transition-all border shrink-0",
                                                markedRows.has(sortedWorkers.indexOf(worker))
                                                    ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-lg scale-110"
                                                    : "bg-[#F5F5F7] text-[#A1A1A6] border-[#D2D2D7]"
                                            )}
                                        >
                                            #{(sortedWorkers.indexOf(worker) + 1).toString().padStart(2, '0')}
                                        </button>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-[#1D1D1F] truncate flex items-center gap-1.5">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-sm">
                                                    {worker.nombres} {worker.apellido_paterno}
                                                </WorkerLink>
                                                {!worker.activo && (
                                                    <span className="px-1.5 py-0.5 rounded bg-[#FF3B30]/10 text-[#FF3B30] text-[9px] font-bold uppercase tracking-wider border border-[#FF3B30]/20 shrink-0">
                                                        Finiquitado
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[11px] text-[#6E6E73] mt-0.5">
                                                {worker.rut}
                                                {worker.cargo_nombre && <> · <span className="text-[#029E4D] font-medium">{worker.cargo_nombre}</span></>}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Row 2: Company + Site chips */}
                                    <div className="flex gap-2 mb-3">
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F5F5F7] border border-[#E8E8ED] text-[11px] font-semibold text-[#1D1D1F] truncate max-w-[50%]">
                                            <Building2 className="h-3 w-3 text-[#6E6E73] shrink-0" />
                                            <span className="truncate">{worker.empresa_nombre || 'Sin Empresa'}</span>
                                        </span>
                                        <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#F5F5F7] border border-[#E8E8ED] text-[11px] font-semibold text-[#6E6E73] truncate max-w-[50%]">
                                            <span className="truncate">{worker.obra_nombre || 'Sin Obra'}</span>
                                        </span>
                                    </div>

                                    {/* Row 3: Doc progress */}
                                    {stats.total > 0 && (
                                        <div className="mb-3">
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-[11px] text-[#6E6E73] font-medium">Documentación</span>
                                                <span className={`text-[11px] font-bold ${colors.text}`}>{pct}%</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-[#E8E8ED] rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full ${colors.bar} transition-all duration-700 rounded-full`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Row 4: Action Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => { setSelectedWorker(worker); setModalType('docs'); }}
                                            className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-[#029E4D]/8 border border-[#029E4D]/20 text-[#029E4D] text-xs font-semibold active:scale-95 transition-all"
                                        >
                                            <FileText className="h-4 w-4" />
                                            Documentos
                                        </button>
                                        <button
                                            onClick={() => { setSelectedWorker(worker); setModalType('form'); }}
                                            disabled={!checkPermission('trabajadores', 'puede_editar')}
                                            className={cn(
                                                "flex-1 min-h-[44px] flex items-center justify-center gap-1.5 rounded-xl bg-[#34C759]/8 border border-[#34C759]/20 text-[#34C759] text-xs font-semibold active:scale-95 transition-all",
                                                !checkPermission('trabajadores', 'puede_editar') && "opacity-40 grayscale cursor-not-allowed"
                                            )}
                                            title={!checkPermission('trabajadores', 'puede_editar') ? 'Sin permisos' : 'Editar'}
                                        >
                                            <UserPen className="h-4 w-4" />
                                            Editar
                                        </button>
                                        <button
                                            onClick={() => handleDelete(worker.id)}
                                            disabled={!checkPermission('trabajadores', 'puede_eliminar')}
                                            className={cn(
                                                "w-11 min-h-[44px] flex items-center justify-center rounded-xl bg-[#FF3B30]/8 border border-[#FF3B30]/20 text-[#FF3B30] active:scale-95 transition-all shrink-0",
                                                !checkPermission('trabajadores', 'puede_eliminar') && "opacity-40 grayscale cursor-not-allowed"
                                            )}
                                            title={!checkPermission('trabajadores', 'puede_eliminar') ? 'Sin permisos' : 'Eliminar'}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── DESKTOP Table (hidden on mobile) ── */}
            <div className="hidden md:block bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7] uppercase text-xs tracking-widest text-[#6E6E73]">
                                <th className="px-6 py-4 font-semibold w-12 text-center">#</th>
                                <th className="px-6 py-4 font-semibold">Trabajador</th>
                                <th className="px-6 py-4 font-semibold">Empresa & Obra</th>
                                <th className="px-6 py-4 font-semibold">Cargo</th>
                                <th className="px-6 py-4 font-semibold">Documentación</th>
                                <th className="px-6 py-4 font-semibold text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E8ED]">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#029E4D] mb-2" />
                                        <p className="text-[#6E6E73] text-sm">Cargando trabajadores...</p>
                                    </td>
                                </tr>
                            ) : sortedWorkers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-[#6E6E73] text-sm">
                                        No se encontraron trabajadores con los filtros actuales.
                                    </td>
                                </tr>
                            ) : (
                                sortedWorkers.map((worker) => {
                                    const stats = completion[worker.id] || { uploaded: 0, total: 0, percentage: 0 };
                                    const pct = stats.percentage;
                                    const colors = getCompletionColor(pct);

                                    return (
                                        <motion.tr
                                            key={worker.id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className={cn(
                                                "hover:bg-[#F5F5F7]/80 transition-all duration-300 group border-l-4 border-l-transparent hover:border-l-[#029E4D]",
                                                markedRows.has(sortedWorkers.indexOf(worker)) && "bg-[#029E4D]/5 border-l-[#1D1D1F] italic"
                                            )}
                                        >
                                            <td className="px-6 py-6 text-center">
                                                <button
                                                    onClick={() => toggleMarkedRow(sortedWorkers.indexOf(worker))}
                                                    className={cn(
                                                        "w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-black transition-all border mx-auto",
                                                        markedRows.has(sortedWorkers.indexOf(worker))
                                                            ? "bg-[#1D1D1F] text-white border-[#1D1D1F] shadow-md scale-110"
                                                            : "bg-transparent text-[#A1A1A6] border-transparent hover:border-[#D2D2D7] hover:bg-white"
                                                    )}
                                                >
                                                    {(sortedWorkers.indexOf(worker) + 1).toString().padStart(2, '0')}
                                                </button>
                                            </td>
                                            <td className="px-6 py-6 border-l border-[#E8E8ED]/30">
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-[15px] leading-tight font-bold text-[#1D1D1F] group-hover:text-[#029E4D] transition-colors">
                                                            {worker.nombres} {worker.apellido_paterno}
                                                        </WorkerLink>
                                                        {!worker.activo && (
                                                            <span className="px-1.5 py-0.5 rounded bg-[#FF3B30]/10 text-[#FF3B30] text-[9px] font-bold uppercase tracking-wider border border-[#FF3B30]/20">
                                                                Finiquitado
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs font-semibold text-[#6E6E73] mt-1 tracking-tight">{worker.rut}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 border-l border-[#E8E8ED]/30">
                                                <div className="flex flex-col">
                                                    <p className="text-[15px] text-[#1D1D1F] font-bold leading-tight">{worker.empresa_nombre || 'Sin Empresa'}</p>
                                                    <p className="text-xs text-[#6E6E73] font-semibold mt-1 tracking-tight">{worker.obra_nombre || 'Sin Obra'}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-6">
                                                <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-[#F5F5F7] border border-[#D2D2D7] text-xs font-bold text-[#1D1D1F]">
                                                    {worker.cargo_nombre || 'No Asignado'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-6 border-l border-[#E8E8ED]/30">
                                                <div className="flex flex-col gap-2 w-fit">
                                                    <span className="text-xs font-bold leading-none whitespace-nowrap text-[#1D1D1F]">
                                                        {stats.total === 0
                                                            ? 'Sin requerimientos obligatorios'
                                                            : (pct === 100 ? 'Documentación obligatoria completada' : `${stats.uploaded} de ${stats.total} documentos obligatorios`)
                                                        }
                                                    </span>
                                                    {stats.total > 0 && (
                                                        <div className="h-1.5 w-full bg-[#E8E8ED] rounded-full overflow-hidden">
                                                            <div
                                                                className={`h-full ${colors.bar} transition-all duration-700 rounded-full`}
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-6 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className="h-10 w-10 text-[#029E4D] hover:scale-110 active:scale-95 transition-all shadow-sm"
                                                        onClick={() => {
                                                            setSelectedWorker(worker);
                                                            setModalType('docs');
                                                        }}
                                                    >
                                                        <FileText className="h-5 w-5" />
                                                    </Button>
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className={cn(
                                                            "h-10 w-10 text-[#34C759] hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                            !checkPermission('trabajadores', 'puede_editar') && "opacity-40 grayscale-[100%] cursor-not-allowed"
                                                        )}
                                                        disabled={!checkPermission('trabajadores', 'puede_editar')}
                                                        onClick={() => {
                                                            setSelectedWorker(worker);
                                                            setModalType('form');
                                                        }}
                                                        title={!checkPermission('trabajadores', 'puede_editar') ? "No tienes permisos" : "Editar"}
                                                    >
                                                        <UserPen className="h-5 w-5" />
                                                    </Button>
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className={cn(
                                                            "h-10 w-10 text-[#FF3B30] hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                            !checkPermission('trabajadores', 'puede_eliminar') && "opacity-40 grayscale-[100%] cursor-not-allowed"
                                                        )}
                                                        disabled={!checkPermission('trabajadores', 'puede_eliminar')}
                                                        onClick={() => handleDelete(worker.id)}
                                                        title={!checkPermission('trabajadores', 'puede_eliminar') ? "No tienes permisos" : "Eliminar"}
                                                    >
                                                        <Trash2 className="h-5 w-5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Unified Infinite Scroll Trigger (Visible in both Mobile and Desktop) */}
            {
                hasMore && (
                    <div ref={ref} className="py-8 flex justify-center items-center w-full">
                        {isLoadingMore && <Loader2 className="h-6 w-6 animate-spin text-[#029E4D]" />}
                    </div>
                )
            }

            {/* Unified Modal */}
            <Modal
                isOpen={modalType !== null}
                onClose={() => {
                    setModalType(null);
                    setIsUploading(false);
                }}
                title={
                    modalType === 'form'
                        ? (selectedWorker ? "Editar Trabajador" : "Registrar Nuevo Trabajador")
                        : `Documentos: ${selectedWorker?.nombres} ${selectedWorker?.apellido_paterno}`
                }
                size={modalType === 'docs' ? 'dynamic' : 'md'}
            >
                {modalType === 'form' && (
                    <WorkerForm
                        initialData={selectedWorker}
                        onCancel={() => setModalType(null)}
                        onSuccess={() => {
                            setModalType(null);
                            fetchWorkers();
                        }}
                    />
                )}

                {modalType === 'docs' && selectedWorker && (
                    <div className="space-y-4 md:space-y-6">
                        {/* Worker Details Summary in Modal */}
                        <div className="bg-[#029E4D]/5 border border-[#029E4D]/10 p-3 md:p-4 rounded-2xl flex items-center gap-3 md:gap-4">
                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-xl bg-[#029E4D] text-white flex items-center justify-center font-bold text-lg md:text-xl shrink-0">
                                {selectedWorker.nombres[0]}{(selectedWorker.apellido_paterno || '')[0]}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-bold text-[#1D1D1F]">{selectedWorker.rut}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-[#029E4D]/10 text-[#029E4D] text-[10px] font-black uppercase tracking-wider">
                                        {selectedWorker.obra_nombre || 'Sin Obra'}
                                    </span>
                                </div>
                                <p className="text-xs font-medium text-[#6E6E73] mt-1 truncate">
                                    {selectedWorker.empresa_nombre} • {selectedWorker.cargo_nombre || 'Sin Cargo'}
                                </p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 bg-[#F5F5F7] p-3 md:p-4 rounded-xl">
                            <div className="hidden sm:block">
                                <h4 className="text-base font-semibold text-[#1D1D1F]">Bóveda de Documentos</h4>
                                <p className="text-sm text-[#6E6E73]">Sube y gestiona archivos para este trabajador.</p>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto">
                                {!isUploading && (
                                    <Button
                                        size="sm"
                                        variant="glass"
                                        onClick={async () => {
                                            try {
                                                const nid = toast.loading('Generando ZIP...');
                                                const response = await api.get(`/documentos/download-all/${selectedWorker.id}`, {
                                                    responseType: 'blob',
                                                });
                                                const url = window.URL.createObjectURL(new Blob([response.data]));
                                                const link = document.createElement('a');
                                                link.href = url;
                                                link.setAttribute('download', `Documentos_${selectedWorker.nombres}_${selectedWorker.apellido_paterno}.zip`);
                                                document.body.appendChild(link);
                                                link.click();
                                                link.remove();
                                                toast.dismiss(nid);
                                                toast.success('Descarga iniciada');
                                            } catch (err) {
                                                toast.error('Error al descargar documentos');
                                            }
                                        }}
                                        className="text-[#029E4D] hover:text-[#027A3B] flex-1 sm:flex-initial"
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
                                trabajadorId={selectedWorker.id}
                                onCancel={() => setIsUploading(false)}
                                onSuccess={() => {
                                    setIsUploading(false);
                                    fetchWorkers(); // Refresh completion data
                                }}
                            />
                        ) : (
                            <DocumentList trabajadorId={selectedWorker.id} />
                        )}
                    </div>
                )}
            </Modal>

            <WorkerQuickView
                workerId={quickViewId}
                onClose={() => setQuickViewId(null)}
                onEditWorker={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('form'); }
                }}
                onViewDocuments={(id) => {
                    setQuickViewId(null);
                    const w = workers.find(w => w.id === id);
                    if (w) { setSelectedWorker(w); setModalType('docs'); }
                }}
            />
        </div >
    );
};

export default WorkersPage;

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    Search,
    Loader2,
    Filter,
    FileDown,
    Mail,
    SearchCheck,
    X,
    Building2,
    CheckSquare,
    Briefcase
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import type { SelectOption } from '../components/ui/Select';
import api from '../services/api';
import type { Trabajador, Empresa, Obra, Cargo } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useObra } from '../context/ObraContext';
import EnvioEmailModal from '../components/fiscalizacion/EnvioEmailModal';
import WorkerQuickView from '../components/workers/WorkerQuickView';
import { useSetPageHeader } from '../context/PageHeaderContext';

// Interface extendida para la búsqueda avanzada
interface TrabajadorAvanzado extends Trabajador {
    docs_porcentaje: number;
}

const ConsultasPage: React.FC = () => {
    const { selectedObra } = useObra();

    // Catálogos
    const [empresas, setEmpresas] = useState<SelectOption[]>([]);
    const [obras, setObras] = useState<SelectOption[]>([]);
    const [cargos, setCargos] = useState<SelectOption[]>([]);

    // Filtros
    const [search, setSearch] = useState('');
    const [filterObra, setFilterObra] = useState<string>('');
    const [filterEmpresa, setFilterEmpresa] = useState<string>('');
    const [filterCargo, setFilterCargo] = useState<string>('');
    const [filterCategoria, setFilterCategoria] = useState<string>('');
    const [filterActivo, setFilterActivo] = useState<string>('true');
    const [filterCompletitud, setFilterCompletitud] = useState<string>('');

    // Estado local
    const [loading, setLoading] = useState(false);
    const [workers, setWorkers] = useState<TrabajadorAvanzado[]>([]);
    const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    // Cargar catálogos
    useEffect(() => {
        const fetchCatalogs = async () => {
            try {
                const [empRes, obraRes, cargoRes] = await Promise.all([
                    api.get<ApiResponse<Empresa[]>>('/empresas?activo=true'),
                    api.get<ApiResponse<Obra[]>>('/obras?activo=true'),
                    api.get<ApiResponse<Cargo[]>>('/cargos?activo=true')
                ]);

                setEmpresas([{ value: '', label: 'Todas las Empresas' }, ...empRes.data.data.map(e => ({ value: e.id, label: e.razon_social }))]);
                setObras([{ value: '', label: 'Todas las Obras' }, ...obraRes.data.data.map(o => ({ value: o.id, label: o.nombre }))]);
                setCargos([{ value: '', label: 'Todos los Cargos' }, ...cargoRes.data.data.map(c => ({ value: c.id, label: c.nombre }))]);
            } catch (err) {
                console.error('Error fetching catalogs', err);
            }
        };
        fetchCatalogs();
    }, []);

    // Aplicar filtro de obra contextual
    useEffect(() => {
        if (selectedObra) {
            setFilterObra(selectedObra.id.toString());
        } else {
            setFilterObra('');
        }
    }, [selectedObra]);

    // Búsqueda en el servidor
    const performSearch = async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (search) params.append('q', search);
            if (filterObra) params.append('obra_id', filterObra);
            if (filterEmpresa) params.append('empresa_id', filterEmpresa);
            if (filterCargo) params.append('cargo_id', filterCargo);
            if (filterCategoria) params.append('categoria_reporte', filterCategoria);
            if (filterActivo) params.append('activo', filterActivo);
            if (filterCompletitud) params.append('completitud', filterCompletitud);

            const res = await api.get<{ data: TrabajadorAvanzado[] }>(`/fiscalizacion/trabajadores-avanzado?${params.toString()}`);
            setWorkers(res.data.data);

            // Reseleccionar los previamente seleccionados que siguen en la lista
            const currentIds = new Set(res.data.data.map(w => w.id));
            setSelectedWorkers(prev => {
                const next = new Set<number>();
                prev.forEach(id => {
                    if (currentIds.has(id)) next.add(id);
                });
                return next;
            });
        } catch (err) {
            toast.error('Error al realizar la búsqueda');
        } finally {
            setLoading(false);
        }
    };

    // Trigger de búsqueda (con debounce en el texto)
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            performSearch();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud]);

    // Checkboxes
    const handleSelectAll = () => {
        if (selectedWorkers.size === workers.length) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workers.map(w => w.id)));
        }
    };

    const handleSelectWorker = (id: number) => {
        setSelectedWorkers(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // Funciones útiles para memoización
    const latestData = useRef({ workers, selectedWorkers });
    useEffect(() => {
        latestData.current = { workers, selectedWorkers };
    }, [workers, selectedWorkers]);

    const handleClearFilters = () => {
        setSearch('');
        setFilterObra(selectedObra ? selectedObra.id.toString() : '');
        setFilterEmpresa('');
        setFilterCargo('');
        setFilterCategoria('');
        setFilterActivo('true');
        setFilterCompletitud('');
    };

    const activeFilterCount = [
        !!search,
        !!filterObra && filterObra !== (selectedObra?.id.toString() || ''),
        !!filterEmpresa,
        !!filterCargo,
        !!filterCategoria,
        filterActivo !== 'true',
        !!filterCompletitud
    ].filter(Boolean).length;

    // Exportación
    const handleExportExcel = async (exportAll: boolean) => {
        const { workers: currentWorkers, selectedWorkers: currentSelected } = latestData.current;
        const dataToExport = exportAll ? currentWorkers : currentWorkers.filter(w => currentSelected.has(w.id));
        
        if (dataToExport.length === 0) {
            toast.warning('No hay datos para exportar');
            return;
        }

        setExporting(true);
        toast.info('Generando reporte Excel...', { id: 'excel-export' });

        try {
            const response = await api.post('/fiscalizacion/exportar-excel', {
                trabajadores: dataToExport
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            const timeString = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            link.setAttribute('download', `Consultas_${new Date().toISOString().split('T')[0]}_${timeString}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
        } catch (err) {
            toast.error('Error al generar Excel', { id: 'excel-export' });
        } finally {
            setExporting(false);
        }
    };

    // Modificando Header Global
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-2 md:gap-3">
            <SearchCheck className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
            <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">Consultas</h1>
        </div>
    ), []);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-1.5 md:gap-2">
            <button
                onClick={() => setShowMobileFilters(prev => !prev)}
                className="lg:hidden flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-white text-brand-dark shadow-sm relative"
                title="Filtros"
            >
                <Filter className="h-4 w-4" />
                {activeFilterCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-primary text-[9px] font-bold text-white">
                        {activeFilterCount}
                    </span>
                )}
            </button>
            <Button
                variant="outline"
                size="sm"
                onClick={() => handleExportExcel(true)}
                isLoading={exporting}
                disabled={workers.length === 0}
                leftIcon={<FileDown className="h-4 w-4" />}
                className="hidden lg:flex"
            >
                Exportar Vista
            </Button>
            <button
                onClick={() => handleExportExcel(true)}
                disabled={workers.length === 0 || exporting}
                className="lg:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm disabled:opacity-40"
                title="Exportar Excel"
            >
                <FileDown className="h-4 w-4" />
            </button>
        </div>
    ), [workers.length, exporting, activeFilterCount]);

    useSetPageHeader(headerTitle, headerActions);

    const FilterPanel = () => (
        <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-[#E8E8ED]">
                <h3 className="text-sm font-bold text-brand-dark flex items-center gap-2">
                    <Filter className="h-4 w-4 text-brand-primary" />
                    Filtros de Búsqueda
                </h3>
                {activeFilterCount > 0 && (
                    <button 
                        onClick={handleClearFilters}
                        className="text-[11px] font-medium text-destructive hover:text-destructive/80 transition-colors bg-destructive/5 px-2 py-1 rounded-md"
                    >
                        Limpiar ({activeFilterCount})
                    </button>
                )}
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Nombre o RUT..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 bg-white"
                />
            </div>

            <div className="space-y-3">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Obra / Proyecto</label>
                    <Select options={obras} value={filterObra} onChange={(e) => setFilterObra(e.target.value)} className="bg-white" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Empresa</label>
                    <Select options={empresas} value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} className="bg-white" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Cargo</label>
                    <Select options={cargos} value={filterCargo} onChange={(e) => setFilterCargo(e.target.value)} className="bg-white" />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Categoría</label>
                    <Select
                        className="bg-white"
                        options={[
                            { value: '', label: 'Todas las Categorías' },
                            { value: 'obra', label: 'Personal de Obra' },
                            { value: 'operaciones', label: 'Operaciones' },
                            { value: 'rotativo', label: 'Personal Rotativo' }
                        ]}
                        value={filterCategoria}
                        onChange={(e) => setFilterCategoria(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Estado Contractual</label>
                    <Select
                        className="bg-white"
                        options={[
                            { value: '', label: 'Todos' },
                            { value: 'true', label: 'Solo Activos' },
                            { value: 'false', label: 'Solo Finiquitados' }
                        ]}
                        value={filterActivo}
                        onChange={(e) => setFilterActivo(e.target.value)}
                    />
                </div>
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider pl-1">Documentación</label>
                    <Select
                        className="bg-white"
                        options={[
                            { value: '', label: 'Cualquier estado' },
                            { value: '100', label: 'Al día (100%)' },
                            { value: 'faltantes', label: 'Con pendientes' }
                        ]}
                        value={filterCompletitud}
                        onChange={(e) => setFilterCompletitud(e.target.value)}
                    />
                </div>
            </div>
        </div>
    );

    return (
        <div className="h-[calc(100vh-64px)] md:h-[calc(100vh-100px)] flex flex-col lg:flex-row gap-4 lg:gap-6 p-4 md:p-6 overflow-hidden max-w-7xl mx-auto w-full">
            {/* Desktop Filters */}
            <div className="hidden lg:flex w-[260px] shrink-0 flex-col bg-white/60 backdrop-blur-xl border border-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] h-full overflow-y-auto custom-scrollbar">
                <FilterPanel />
            </div>

            {/* Mobile/Tablet Filters Drawer */}
            <AnimatePresence>
                {showMobileFilters && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
                            onClick={() => setShowMobileFilters(false)}
                        />
                        <motion.div
                            initial={{ x: '-100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '-100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="fixed inset-y-0 left-0 w-[280px] bg-white z-50 p-5 shadow-2xl overflow-y-auto lg:hidden"
                        >
                            <div className="flex justify-end mb-4">
                                <button onClick={() => setShowMobileFilters(false)} className="p-2 bg-background rounded-full hover:bg-muted">
                                    <X className="h-5 w-5 text-muted-foreground" />
                                </button>
                            </div>
                            <FilterPanel />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 bg-white/60 backdrop-blur-xl border border-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative">
                
                {/* Header Acciones Múltiples */}
                <div className="h-16 border-b border-[#F0F0F5] bg-white/50 px-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                    onChange={handleSelectAll}
                                    className="peer h-5 w-5 appearance-none rounded border-2 border-[#D1D1D6] bg-white checked:border-brand-primary checked:bg-brand-primary transition-all cursor-pointer disabled:opacity-50"
                                />
                                <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-sm font-semibold text-brand-dark group-hover:text-brand-primary transition-colors">
                                {selectedWorkers.size > 0 ? `${selectedWorkers.size} seleccionados` : 'Seleccionar Todo'}
                            </span>
                        </label>
                    </div>

                    <AnimatePresence>
                        {selectedWorkers.size > 0 && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="flex items-center gap-2"
                            >
                                <Button
                                    variant="glass"
                                    size="sm"
                                    onClick={() => setEmailModalOpen(true)}
                                    leftIcon={<Mail className="h-4 w-4" />}
                                    className="h-9 px-3 text-xs md:text-sm"
                                >
                                    Enviar
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleExportExcel(false)}
                                    leftIcon={<FileDown className="h-4 w-4" />}
                                    className="h-9 px-3 text-xs md:text-sm"
                                >
                                    Exportar Selección
                                </Button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Grilla / Resultados */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-background/30 p-2 md:p-4">
                    {loading ? (
                        <div className="h-full flex flex-col items-center justify-center text-brand-primary">
                            <Loader2 className="h-10 w-10 animate-spin mb-4" />
                            <p className="text-sm font-medium">Buscando trabajadores...</p>
                        </div>
                    ) : workers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4">
                                <Search className="h-8 w-8 text-[#A1A1AA]" />
                            </div>
                            <h3 className="text-base font-bold text-brand-dark mb-1">Sin resultados</h3>
                            <p className="text-sm max-w-[250px]">No se encontraron trabajadores que coincidan con los filtros aplicados.</p>
                            {activeFilterCount > 0 && (
                                <Button variant="outline" size="sm" onClick={handleClearFilters} className="mt-4">
                                    Limpiar Búsqueda
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {workers.map((worker, idx) => (
                                <motion.div
                                    key={worker.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.2) }}
                                    className={cn(
                                        "bg-white rounded-2xl border transition-all duration-200 shadow-[0_2px_10px_rgb(0,0,0,0.02)] p-3",
                                        selectedWorkers.has(worker.id) ? "border-brand-primary ring-1 ring-brand-primary/20" : "border-border hover:border-brand-primary/30",
                                        !worker.activo && "bg-background/50 border-dashed opacity-80"
                                    )}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                                        <div className="flex items-center gap-3 md:w-[60px] shrink-0">
                                            <div className="relative flex items-center h-full">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWorkers.has(worker.id)}
                                                    onChange={() => handleSelectWorker(worker.id)}
                                                    className="peer h-5 w-5 appearance-none rounded border-2 border-[#D1D1D6] bg-white checked:border-brand-primary checked:bg-brand-primary transition-all cursor-pointer"
                                                />
                                                <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                                            </div>
                                            <span className="text-xs font-bold text-muted-foreground tabular-nums">{(idx + 1).toString().padStart(2, '0')}</span>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col items-start cursor-pointer" onClick={() => setQuickViewId(worker.id)}>
                                            <button className="text-sm font-bold text-brand-dark hover:text-brand-primary transition-colors text-left truncate flexitems-center gap-2">
                                                {worker.apellido_paterno} {worker.apellido_materno} {worker.nombres}
                                            </button>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[11px] font-medium text-muted-foreground">{worker.rut}</span>
                                                {!worker.activo && (
                                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-destructive/10 text-destructive text-[9px] font-bold uppercase tracking-wider">
                                                        Finiquitado
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 items-center">
                                            {/* Empresa & Obra */}
                                            <div className="flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    <Building2 className="h-3 w-3 shrink-0" />
                                                    <span className="truncate">{worker.empresa_nombre || '—'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-dark">
                                                    <div className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0" />
                                                    <span className="truncate">{worker.obra_nombre || 'Sin Obra'}</span>
                                                </div>
                                            </div>

                                            {/* Cargo */}
                                            <div className="hidden md:flex flex-col gap-1 min-w-0">
                                                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                    <Briefcase className="h-3 w-3 shrink-0" />
                                                    <span className="truncate font-medium">{worker.cargo_nombre || '—'}</span>
                                                </div>
                                            </div>

                                            {/* Documentación */}
                                            <div className="flex flex-col gap-1.5 pt-1">
                                                <div className="flex items-center justify-between text-[10px] font-bold">
                                                    <span className="text-muted-foreground uppercase tracking-widest">Docs</span>
                                                    <span className={worker.docs_porcentaje === 100 ? "text-brand-primary" : "text-destructive"}>
                                                        {worker.docs_porcentaje}%
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full bg-[#E5E5EA] rounded-full overflow-hidden">
                                                    <div 
                                                        className={cn(
                                                            "h-full rounded-full transition-all duration-500",
                                                            worker.docs_porcentaje === 100 
                                                                ? "bg-gradient-to-r from-brand-primary to-[#34D399]" 
                                                                : "bg-gradient-to-r from-destructive to-[#F87171]"
                                                        )}
                                                        style={{ width: `${Math.max(0, Math.min(100, worker.docs_porcentaje))}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <div className="h-8 bg-background border-t border-[#E8E8ED] flex items-center justify-between px-4 text-[11px] font-medium text-muted-foreground shrink-0">
                    <span>{workers.length} {workers.length === 1 ? 'coincidencia' : 'coincidencias'}</span>
                    <span>Actualizado en tiempo real</span>
                </div>
            </div>

            {/* Modals */}
            <EnvioEmailModal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                destinatarioEmail=""
                trabajadores={workers.filter(w => selectedWorkers.has(w.id))}
            />

            {quickViewId && (
                <WorkerQuickView
                    workerId={quickViewId}
                    onClose={() => setQuickViewId(null)}
                />
            )}
        </div>
    );
};

export default ConsultasPage;

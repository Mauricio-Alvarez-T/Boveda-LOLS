import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
    Briefcase,
    Users,
    UserCheck,
    FileText,
    UserPlus,
    UserX,
    Trash2,
    UserPen,
    Plus,
    PlusCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WorkerForm } from '../components/workers/WorkerForm';
import { EmpresaForm } from '../components/settings/EmpresaForm';
import { ObraForm } from '../components/settings/ObraForm';
import { CargoForm } from '../components/settings/CargoForm';
import { TipoDocumentoForm } from '../components/settings/TipoDocumentoForm';
import { FilterSelect } from '../components/ui/Filters';
import api from '../services/api';
import type { Trabajador, Empresa, Obra, Cargo } from '../types/entities';
import type { ApiResponse } from '../types';
import { cn } from '../utils/cn';
import { useObra } from '../context/ObraContext';
import EnvioEmailModal from '../components/workers/EnvioEmailModal';
import WorkerQuickView from '../components/workers/WorkerQuickView';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useAuth } from '../context/AuthContext';

import {
    useConsultasFilters,
    useConsultasData,
    useConsultasSelection,
    useConsultasExport,
    useConsultasActions,
    TrabajadorAvanzado
} from '../hooks/consultas';

const ConsultasPage: React.FC = () => {
    const { selectedObra } = useObra();

    // --- Custom Hooks ---
    // 1. Filtros
    const {
        search, setSearch,
        filterObra, setFilterObra,
        filterEmpresa, setFilterEmpresa,
        filterCargo, setFilterCargo,
        filterCategoria, setFilterCategoria,
        filterActivo, setFilterActivo,
        filterCompletitud, setFilterCompletitud,
        filterAusentes, setFilterAusentes,
        handleClearFilters,
        activeFilterCount
    } = useConsultasFilters();

    // 2. Data & Paginación
    const {
        empresas, obras, cargos, fetchCatalogs,
        workers, loading, hasMore, isLoadingMore,
        loadMore, performSearch
    } = useConsultasData({
        search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, filterAusentes
    });

    // 3. Selección
    const {
        selectedWorkers,
        handleSelectAll,
        handleSelectWorker
    } = useConsultasSelection(workers.length, workers.map(w => w.id));

    // 4. Exportación
    const {
        exporting,
        handleExportExcel
    } = useConsultasExport(workers, selectedWorkers);

    // 5. Acciones CRUD (Eliminar/Reactivar)
    const {
        modalType, setModalType,
        selectedWorkerForAction, setSelectedWorkerForAction,
        handleDelete, confirmFiniquito, handleReactivate
    } = useConsultasActions(() => performSearch(true));

    // Estados Locales UI Varios
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [showCreatePanel, setShowCreatePanel] = useState(false);
    
    const { checkPermission } = useAuth();


    // Modificando Header Global
    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 md:gap-3 shrink-0">
                <SearchCheck className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
                <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">Consultas</h1>
            </div>

            {/* Desktop Search Bar - integrated into title area */}
            <div className="hidden md:block relative max-w-md w-full ml-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Nombre, RUT..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-10 bg-background/50 border-border focus:bg-white transition-all rounded-xl text-sm"
                />
            </div>
        </div>
    ), [search]);

    const headerActions = useMemo(() => (
        <div className="flex items-center gap-1.5 md:gap-2">
            {/* Desktop Desktop Actions */}
            <div className="hidden md:flex items-center gap-2">
                <Button 
                    variant={showCreatePanel ? 'primary' : 'outline'} 
                    size="sm" 
                    onClick={() => {
                        setShowCreatePanel(prev => !prev);
                        setShowMobileFilters(false);
                    }}
                    leftIcon={<Plus className="h-4 w-4" />}
                    className={cn(
                        "h-9 px-4 rounded-xl font-bold transition-all shadow-sm border-border",
                        showCreatePanel 
                            ? "bg-brand-primary text-white border-transparent" 
                            : "bg-white text-brand-dark hover:bg-background"
                    )}
                >
                    CREAR
                </Button>
                <Button
                    size="sm"
                    onClick={() => {
                        setShowMobileFilters(!showMobileFilters);
                        setShowCreatePanel(false);
                    }}
                    variant={showMobileFilters ? 'primary' : 'outline'}
                    className={cn(
                        "h-9 px-4 rounded-xl font-semibold gap-2 border-border shadow-sm",
                        showMobileFilters 
                            ? "bg-brand-primary text-white border-transparent" 
                            : "bg-white text-brand-dark hover:bg-background"
                    )}
                >
                    <Filter className="h-3.5 w-3.5" />
                    <span>Filtros</span>
                    {activeFilterCount > 0 && (
                        <span className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                            showMobileFilters ? "bg-white text-brand-primary" : "bg-brand-primary text-white"
                        )}>
                            {activeFilterCount}
                        </span>
                    )}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportExcel(true)}
                    isLoading={exporting}
                    disabled={workers.length === 0}
                    leftIcon={<FileDown className="h-3.5 w-3.5 text-brand-primary" />}
                    className="h-9 px-4 rounded-xl shadow-sm bg-white border-border hover:bg-background"
                >
                    <span>Exportar</span>
                </Button>

                {activeFilterCount > 0 && (
                    <Button
                        size="sm"
                        variant="glass"
                        onClick={handleClearFilters}
                        className="h-9 px-3 text-destructive hover:bg-destructive/10 border-border shadow-sm flex items-center justify-center p-0 w-9"
                        title="Limpiar Filtros"
                    >
                        <X className="h-4 w-4" />
                    </Button>
                )}
            </div>

            {/* Mobile Actions */}
            <div className="lg:hidden flex items-center gap-2">
                <button
                    onClick={() => {
                        setShowCreatePanel(prev => !prev);
                        setShowMobileFilters(false);
                    }}
                    className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm transition-all",
                        showCreatePanel ? "bg-brand-primary border-transparent text-white" : "bg-white border-border text-brand-dark"
                    )}
                    title="Crear"
                >
                    <Plus className="h-4 w-4" />
                </button>
                <button
                    onClick={() => {
                        setShowMobileFilters(prev => !prev);
                        setShowCreatePanel(false);
                    }}
                    className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm relative transition-all",
                        showMobileFilters ? "bg-brand-primary border-transparent text-white" : "bg-white border-border text-brand-dark"
                    )}
                    title="Filtros"
                >
                    <Filter className="h-4 w-4" />
                    {activeFilterCount > 0 && (
                        <span className={cn(
                            "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                            showMobileFilters ? "bg-white text-brand-primary" : "bg-brand-primary text-white"
                        )}>
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>
        </div>
    ), [workers.length, exporting, activeFilterCount, showMobileFilters, showCreatePanel]);

    useSetPageHeader(headerTitle, headerActions);

    const FilterPanel = () => (
        <div className="p-4 md:p-5 bg-white border border-[#E8E8ED] rounded-2xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <FilterSelect
                label={<><Building2 className="h-4 w-4" /> Obra / Proyecto</>}
                options={obras.map(o => ({ value: o.value, label: o.label }))}
                value={filterObra}
                onChange={(e) => setFilterObra(e.target.value)}
                placeholder="Todas las Obras"
            />
            <FilterSelect
                label={<><Building2 className="h-4 w-4" /> Empresa</>}
                options={empresas.map(e => ({ value: e.value, label: e.label }))}
                value={filterEmpresa}
                onChange={(e) => setFilterEmpresa(e.target.value)}
                placeholder="Todas las Empresas"
            />
            <FilterSelect
                label={<><Briefcase className="h-4 w-4" /> Cargo</>}
                options={cargos.map(c => ({ value: c.value, label: c.label }))}
                value={filterCargo}
                onChange={(e) => setFilterCargo(e.target.value)}
                placeholder="Todos los Cargos"
            />
            <FilterSelect
                label={<><Users className="h-4 w-4" /> Categoría</>}
                options={[
                    { value: 'obra', label: 'Personal de Obra' },
                    { value: 'operaciones', label: 'Operaciones' },
                    { value: 'rotativo', label: 'Personal Rotativo' }
                ]}
                value={filterCategoria}
                onChange={(e) => setFilterCategoria(e.target.value)}
                placeholder="Todas las Categorías"
            />
            <FilterSelect
                label={<><UserCheck className="h-4 w-4" /> Estado Contractual</>}
                options={[
                    { value: 'true', label: 'Solo Activos' },
                    { value: 'false', label: 'Solo Finiquitados' }
                ]}
                value={filterActivo}
                onChange={(e) => setFilterActivo(e.target.value)}
                placeholder="Todos los Estados"
            />
            <FilterSelect
                label={<><FileText className="h-4 w-4" /> Documentación</>}
                options={[
                    { value: '100', label: 'Al día (100%)' },
                    { value: 'faltantes', label: 'Con pendientes' }
                ]}
                value={filterCompletitud}
                onChange={(e) => setFilterCompletitud(e.target.value)}
                placeholder="Cualquier estado"
            />

            <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-brand-dark px-1 flex items-center gap-1.5 opacity-60 uppercase tracking-wider">
                    <UserX className="h-3.5 w-3.5" /> Asistencia
                </label>
                <div 
                    onClick={() => setFilterAusentes(!filterAusentes)}
                    className={cn(
                        "h-10 px-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all",
                        filterAusentes 
                            ? "bg-brand-primary/10 border-brand-primary/30 text-brand-primary font-bold shadow-sm" 
                            : "bg-white border-border text-brand-dark hover:bg-background"
                    )}
                >
                    <span className="text-sm">Ausentes Hoy</span>
                    <div className={cn(
                        "w-4 h-4 rounded-full border flex items-center justify-center transition-all",
                        filterAusentes ? "bg-brand-primary border-brand-primary text-white" : "border-border text-transparent"
                    )}>
                        {filterAusentes && <div className="w-1.5 h-1.5 rounded-full bg-white shadow-sm" />}
                    </div>
                </div>
            </div>
        </div>
    );

    const CreatePanel = () => (
        <div className="p-5 bg-white border border-[#E8E8ED] rounded-2xl shadow-sm grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
            {checkPermission('trabajadores', 'puede_crear') && (
                <button
                    onClick={() => {
                        setSelectedWorkerForAction(null);
                        setModalType('form');
                    }}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
                >
                    <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <UserPlus className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Trabajador</span>
                </button>
            )}

            {checkPermission('empresas', 'puede_crear') && (
                <button
                    onClick={() => setModalType('empresa')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
                >
                    <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <Building2 className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Empresa</span>
                </button>
            )}

            {checkPermission('obras', 'puede_crear') && (
                <button
                    onClick={() => setModalType('obra')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
                >
                    <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <PlusCircle className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Obra / Proyecto</span>
                </button>
            )}

            {checkPermission('cargos', 'puede_crear') && (
                <button
                    onClick={() => setModalType('cargo')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
                >
                    <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <Briefcase className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Cargo</span>
                </button>
            )}

            {checkPermission('documentos', 'puede_crear') && (
                <button
                    onClick={() => setModalType('tipodoc')}
                    className="flex flex-col items-center justify-center p-4 rounded-xl border border-border hover:border-brand-primary/50 hover:bg-brand-primary/5 transition-all group gap-2"
                >
                    <div className="h-10 w-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary group-hover:scale-110 transition-transform">
                        <FileText className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark uppercase tracking-tight">Tipo de Docto</span>
                </button>
            )}
        </div>
    );

    return (
        <div className="h-[calc(100vh-116px)] md:h-[calc(100vh-132px)] flex flex-col gap-4 lg:gap-5 p-0 overflow-hidden w-full">
            {/* Mobile Search - Only visible on small screens */}
            <div className="md:hidden relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Nombre, RUT..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 h-11 bg-white rounded-2xl border-border shadow-sm"
                />
            </div>

            <div className="flex flex-col gap-4 shrink-0">
                <AnimatePresence>
                    {showMobileFilters && (
                        <motion.div
                            initial={{ height: 0, opacity: 0, y: -10 }}
                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                            exit={{ height: 0, opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="relative"
                        >
                            <FilterPanel />
                            {/* Clear filters mobile */}
                            {activeFilterCount > 0 && (
                                <div className="mt-2 text-right sm:hidden">
                                     <button
                                        onClick={handleClearFilters}
                                        className="text-[12px] font-semibold text-destructive hover:underline"
                                    >
                                        Limpiar Filtros
                                    </button>
                                </div>
                            )}
                        </motion.div>
                    )}
                    {showCreatePanel && (
                        <motion.div
                            initial={{ height: 0, opacity: 0, y: -10 }}
                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                            exit={{ height: 0, opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="relative"
                        >
                            <CreatePanel />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex flex-col bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">
                
                {/* Header Acciones Múltiples */}
                <div className="h-[60px] border-b border-[#F0F0F5] bg-white/50 px-5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-4 hidden sm:flex">
                         <div className="h-8 w-8 rounded-xl bg-brand-primary/10 flex items-center justify-center">
                            <SearchCheck className="h-4 w-4 text-brand-primary" />
                        </div>
                        <h2 className="text-sm font-bold text-brand-dark">Resultados</h2>
                    </div>

                    <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                    onChange={handleSelectAll}
                                    className="peer h-[18px] w-[18px] appearance-none rounded border-2 border-[#D1D1D6] bg-white checked:border-brand-primary checked:bg-brand-primary transition-all cursor-pointer disabled:opacity-50"
                                />
                                <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-xs sm:text-sm font-semibold text-brand-dark group-hover:text-brand-primary transition-colors">
                                {selectedWorkers.size > 0 ? `${selectedWorkers.size} seleccionados` : 'Todos'}
                            </span>
                        </label>

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
                                        className="h-9 px-3 text-xs md:text-sm bg-white"
                                    >
                                        <span className="hidden sm:inline">Enviar</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportExcel(false)}
                                        leftIcon={<FileDown className="h-4 w-4" />}
                                        className="h-9 px-3 text-xs md:text-sm bg-white"
                                    >
                                        <span className="hidden sm:inline">Exportar</span>
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Grilla / Resultados */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#F1F1F4]/80 p-2 md:p-4">
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
                                        "bg-white rounded-2xl border transition-all duration-200 shadow-[0_4px_12px_rgb(0,0,0,0.05)] p-3 relative cursor-pointer",
                                        selectedWorkers.has(worker.id) ? "border-brand-primary ring-1 ring-brand-primary/20" : "border-border hover:border-brand-primary/30 hover:shadow-lg",
                                        !worker.activo && "bg-background/50 border-dashed opacity-80"
                                    )}
                                    onClick={() => setQuickViewId(worker.id)}
                                >
                                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                                        <div className="flex items-center gap-3 md:w-[60px] shrink-0" onClick={(e) => e.stopPropagation()}>
                                            <div className="relative flex items-center h-full">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWorkers.has(worker.id)}
                                                    onChange={() => handleSelectWorker(worker.id)}
                                                    className="peer h-5 w-5 appearance-none rounded border-2 border-[#D1D1D6] bg-white checked:border-brand-primary checked:bg-brand-primary transition-all cursor-pointer"
                                                />
                                                <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity cursor-pointer pointer-events-none" />
                                            </div>
                                            <span className="text-xs font-bold text-muted-foreground tabular-nums">{(idx + 1).toString().padStart(2, '0')}</span>
                                        </div>

                                        <div className="flex-1 min-w-0 flex flex-col items-start pr-4">
                                            <span className="text-sm font-bold text-brand-dark group-hover:text-brand-primary transition-colors text-left truncate flex items-center gap-2">
                                                {worker.apellido_paterno} {worker.apellido_materno} {worker.nombres}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-[11px] font-medium text-muted-foreground">{worker.rut}</span>
                                                {!worker.activo && (
                                                    <span className="px-1.5 py-0.5 rounded-[4px] bg-destructive/10 text-destructive text-[9px] font-bold uppercase tracking-wider">
                                                        Finiquitado
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex-[2] min-w-0 grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 items-center">
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
                                            <div className="hidden md:flex flex-col gap-1 min-w-0 justify-center h-full">
                                                <span className="inline-flex max-w-fit items-center rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-primary truncate border border-brand-primary/20">
                                                    {worker.cargo_nombre || '—'}
                                                </span>
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

                                            {/* Acciones Rápidas */}
                                            <div className="flex items-center gap-1 md:justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <Button
                                                    variant="glass"
                                                    size="icon"
                                                    className={cn(
                                                        "h-8 w-8 text-brand-primary hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                        !checkPermission('trabajadores', 'puede_editar') && "opacity-40 grayscale cursor-not-allowed"
                                                    )}
                                                    disabled={!checkPermission('trabajadores', 'puede_editar')}
                                                    onClick={() => {
                                                        setSelectedWorkerForAction(worker);
                                                        setModalType('form');
                                                    }}
                                                >
                                                    <UserPen className="h-4 w-4" />
                                                </Button>
                                                
                                                {worker.activo ? (
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className={cn(
                                                            "h-8 w-8 text-destructive hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                            !checkPermission('trabajadores', 'puede_eliminar') && "opacity-40 grayscale cursor-not-allowed"
                                                        )}
                                                        disabled={!checkPermission('trabajadores', 'puede_eliminar')}
                                                        onClick={() => handleDelete(worker)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className={cn(
                                                            "h-8 w-8 text-brand-primary hover:scale-110 active:scale-95 transition-all shadow-sm",
                                                            !checkPermission('trabajadores', 'puede_editar') && "opacity-40 grayscale cursor-not-allowed"
                                                        )}
                                                        disabled={!checkPermission('trabajadores', 'puede_editar')}
                                                        onClick={() => handleReactivate(worker.id)}
                                                    >
                                                        <UserCheck className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <div className="h-9 bg-[#F8F8FA] border-t border-[#E8E8ED] flex items-center justify-between px-5 text-[11px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
                    <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-brand-primary/40" />
                        <span>{workers.length} {workers.length === 1 ? 'coincidencia' : 'coincidencias'}</span>
                    </div>
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

            {/* Worker Form Modal (Create/Edit) */}
            <Modal
                isOpen={modalType === 'form'}
                onClose={() => setModalType(null)}
                title={selectedWorkerForAction ? "Editar Trabajador" : "Registrar Nuevo Trabajador"}
                size="md"
            >
                {modalType === 'form' && (
                    <WorkerForm
                        initialData={selectedWorkerForAction}
                        onCancel={() => setModalType(null)}
                        onSuccess={() => {
                            setModalType(null);
                            performSearch(true);
                        }}
                    />
                )}
            </Modal>

            {/* Finiquito Modal */}
            {modalType === 'finiquito' && selectedWorkerForAction && (
                <Modal isOpen={true} onClose={() => setModalType(null)} title="Desvincular Trabajador">
                    <div className="p-5">
                        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 mb-5">
                            <p className="text-sm font-semibold text-destructive">
                                Al desvincular a <strong>{selectedWorkerForAction.apellido_paterno} {selectedWorkerForAction.nombres}</strong>, no podrás ingresarle más asistencia a partir de la fecha seleccionada.
                            </p>
                        </div>
                        <div className="mb-6">
                            <label className="block text-xs font-bold text-muted-foreground mb-2 uppercase tracking-wider">Fecha Efectiva de Finiquito</label>
                            <Input
                                type="date"
                                id="fecha_finiquito_input_consultas"
                                defaultValue={new Date().toISOString().split('T')[0]}
                                className="w-full bg-background border-transparent hover:bg-[#E8E8ED] focus:bg-white focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all font-semibold"
                            />
                        </div>
                        <div className="flex justify-end gap-3 mt-8">
                            <Button variant="outline" onClick={() => setModalType(null)} className="flex-1">Cancelar</Button>
                            <Button className="bg-destructive text-white hover:bg-destructive/90 active:bg-destructive border-transparent flex-1" onClick={() => {
                                const dateInput = document.getElementById('fecha_finiquito_input_consultas') as HTMLInputElement;
                                if (!dateInput?.value) {
                                    toast.error("Debe especificar una fecha.");
                                    return;
                                }
                                confirmFiniquito(dateInput.value);
                            }}>
                                Confirmar Finiquito
                            </Button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* Other Create Modals */}
            <Modal
                isOpen={modalType === 'empresa'}
                onClose={() => setModalType(null)}
                title="Nueva Empresa"
                size="md"
            >
                <EmpresaForm
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            <Modal
                isOpen={modalType === 'obra'}
                onClose={() => setModalType(null)}
                title="Nueva Obra / Proyecto"
                size="md"
            >
                <ObraForm
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            <Modal
                isOpen={modalType === 'cargo'}
                onClose={() => setModalType(null)}
                title="Nuevo Cargo"
                size="md"
            >
                <CargoForm
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            <Modal
                isOpen={modalType === 'tipodoc'}
                onClose={() => setModalType(null)}
                title="Nuevo Tipo de Documento"
                size="md"
            >
                <TipoDocumentoForm
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                    }}
                />
            </Modal>

            {quickViewId && (
                <WorkerQuickView
                    workerId={quickViewId}
                    onClose={() => setQuickViewId(null)}
                    onUpdate={() => performSearch(true)}
                />
            )}
        </div>
    );
};

export default ConsultasPage;

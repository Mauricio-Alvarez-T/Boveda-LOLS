import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'; // Mobile UX Unified Commit 01
import {
    Search,
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
    Eraser,
    PlusCircle,
    CalendarClock,
    Save
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
import { ConstanciaModal } from '../components/workers/ConstanciaModal';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useAuth } from '../context/AuthContext';
import { FilterPanel } from '../components/consultas/FilterPanel';
import { CreatePanel } from '../components/consultas/CreatePanel';

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
        filterAniversario10m, clearAniversario10m,
        handleClearFilters,
        activeFilterCount
    } = useConsultasFilters();

    // 2. Data & Paginación
    const {
        empresas, obras, cargos, fetchCatalogs,
        workers, loading, performSearch
    } = useConsultasData({
        search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud, filterAusentes, filterAniversario10m
    });

    // Etiqueta legible (MM/AAAA) del filtro de aniversario, si está activo.
    const aniversario10mLabel = useMemo(() => {
        const m = /^(\d{4})-(\d{1,2})$/.exec(filterAniversario10m);
        return m ? `${m[2].padStart(2, '0')}/${m[1]}` : '';
    }, [filterAniversario10m]);

    // ids memoizados: evita recrear el array en cada render (dep del hook de selección).
    const workerIds = useMemo(() => workers.map(w => w.id), [workers]);

    // Opciones de filtros memoizadas: identidad estable hacia FilterPanel (react-select).
    const obraOptions = useMemo(() => obras.map(o => ({ value: o.value, label: o.label })), [obras]);
    const empresaOptions = useMemo(() => empresas.map(e => ({ value: e.value, label: e.label })), [empresas]);
    const cargoOptions = useMemo(() => cargos.map(c => ({ value: c.value, label: c.label })), [cargos]);

    // 3. Selección
    const {
        selectedWorkers,
        handleSelectAll,
        handleSelectWorker
    } = useConsultasSelection(workers.length, workerIds);

    // 4. Exportación
    const {
        exporting,
        handleExportExcel
    } = useConsultasExport({
        obra_id: filterObra,
        empresa_id: filterEmpresa,
        cargo_id: filterCargo,
        categoria_reporte: filterCategoria,
        activo: filterActivo,
        q: search
    });

    // 5. Acciones CRUD (Eliminar/Reactivar)
    const {
        modalType, setModalType,
        selectedWorkerForAction, setSelectedWorkerForAction,
        handleDelete, confirmFiniquito, handleReactivate,
        handleDepurar, confirmDepurar,
        depurarConfirmationRut, setDepurarConfirmationRut
    } = useConsultasActions(() => performSearch(true));

    // Estados Locales UI Varios
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [constanciaWorker, setConstanciaWorker] = useState<Trabajador | null>(null);
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [showCreatePanel, setShowCreatePanel] = useState(false);
    
    const { hasPermission } = useAuth();


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
                    className="pl-9 h-10 bg-background/50 border-border focus:bg-card transition-all rounded-xl text-sm"
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
                    leftIcon={<Plus className={cn("h-4 w-4 transition-transform duration-300 ease-out", showCreatePanel ? "rotate-45 scale-110" : "")} />}
                    className={cn(
                        "h-9 px-4 rounded-xl font-bold transition-all duration-300 shadow-sm border-border",
                        showCreatePanel 
                            ? "bg-brand-primary text-white border-transparent" 
                            : "bg-card text-brand-dark hover:bg-background"
                    )}
                >
                    {showCreatePanel ? 'CERRAR' : 'CREAR'}
                </Button>
                <Button
                    size="sm"
                    onClick={() => {
                        setShowMobileFilters(!showMobileFilters);
                        setShowCreatePanel(false);
                    }}
                    variant={showMobileFilters ? 'primary' : 'outline'}
                    className={cn(
                        "h-9 px-4 rounded-xl font-semibold gap-2 border-border shadow-sm transition-all duration-300",
                        showMobileFilters 
                            ? "bg-brand-primary text-white border-transparent" 
                            : "bg-card text-brand-dark hover:bg-background"
                    )}
                >
                    {showMobileFilters ? (
                        <X className="h-3.5 w-3.5 animate-in zoom-in spin-in-12 duration-300" />
                    ) : (
                        <Filter className="h-3.5 w-3.5 animate-in fade-in zoom-in duration-300" />
                    )}
                    <span>Filtros</span>
                    {activeFilterCount > 0 && (
                        <span className={cn(
                            "flex h-4 w-4 items-center justify-center rounded-full text-[9px] transition-colors duration-300",
                            showMobileFilters ? "bg-card text-brand-primary" : "bg-brand-primary text-white"
                        )}>
                            {activeFilterCount}
                        </span>
                    )}
                </Button>

                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleExportExcel()}
                    isLoading={exporting}
                    disabled={workers.length === 0 || !hasPermission('reportes.exportar')}
                    leftIcon={<FileDown className="h-3.5 w-3.5 text-brand-primary" />}
                    className={cn(
                        "h-9 px-4 rounded-xl shadow-sm border-border",
                        hasPermission('reportes.exportar') ? "bg-card hover:bg-background" : "opacity-40 grayscale pointer-events-none"
                    )}
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
                        "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm transition-all duration-300 ease-in-out",
                        showCreatePanel ? "bg-brand-primary border-transparent text-white" : "bg-card border-border text-brand-dark active:bg-background"
                    )}
                    title="Crear"
                >
                    <Plus className={cn("h-4 w-4 transition-transform duration-300 ease-out", showCreatePanel ? "rotate-45 scale-110" : "")} />
                </button>
                {/* Export Excel — paridad con desktop. Mismo gating de permiso/data. */}
                <button
                    onClick={() => handleExportExcel()}
                    disabled={workers.length === 0 || !hasPermission('reportes.exportar') || exporting}
                    className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm transition-all duration-300 ease-in-out",
                        "bg-card border-border text-brand-dark active:bg-background",
                        (workers.length === 0 || !hasPermission('reportes.exportar')) && "opacity-40 grayscale pointer-events-none",
                        exporting && "opacity-60"
                    )}
                    title="Exportar Excel"
                >
                    <FileDown className={cn("h-4 w-4 text-brand-primary", exporting && "animate-pulse")} />
                </button>
                <button
                    onClick={() => {
                        setShowMobileFilters(prev => !prev);
                        setShowCreatePanel(false);
                    }}
                    className={cn(
                        "flex items-center justify-center h-9 w-9 rounded-xl border shadow-sm relative transition-all duration-300 ease-in-out",
                        showMobileFilters ? "bg-brand-primary border-transparent text-white" : "bg-card border-border text-brand-dark active:bg-background"
                    )}
                    title="Filtros"
                >
                    {showMobileFilters ? (
                        <X className="h-4 w-4 animate-in zoom-in spin-in-12 duration-300" />
                    ) : (
                        <Filter className="h-4 w-4 animate-in fade-in zoom-in duration-300" />
                    )}
                    {activeFilterCount > 0 && (
                        <span className={cn(
                            "absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold transition-colors duration-300",
                            showMobileFilters ? "bg-card text-brand-primary shadow-sm" : "bg-brand-primary text-white shadow-sm"
                        )}>
                            {activeFilterCount}
                        </span>
                    )}
                </button>
            </div>
        </div>
    ), [workers.length, exporting, activeFilterCount, showMobileFilters, showCreatePanel]);

    useSetPageHeader(headerTitle, headerActions);

    // Componentes extraídos al directorio components/consultas/...

    return (
        <div className="h-[calc(100dvh-116px)] md:h-[calc(100dvh-120px)] flex flex-col gap-2 p-0 overflow-hidden w-full">
            {/* Mobile Search - Only visible on small screens */}
            <div className="md:hidden relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Nombre, RUT..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-10 h-11 bg-card rounded-2xl border-border shadow-sm"
                />
            </div>

            <div className="flex flex-col gap-4 shrink-0">
                <AnimatePresence mode="wait">
                    {showMobileFilters && (
                        <motion.div
                            key="filters"
                            initial={{ height: 0, opacity: 0, y: -10 }}
                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                            exit={{ height: 0, opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="relative z-40"
                        >
                            <FilterPanel 
                                obras={obraOptions}
                                empresas={empresaOptions}
                                cargos={cargoOptions}
                                filterObra={filterObra}
                                setFilterObra={setFilterObra}
                                filterEmpresa={filterEmpresa}
                                setFilterEmpresa={setFilterEmpresa}
                                filterCargo={filterCargo}
                                setFilterCargo={setFilterCargo}
                                filterCategoria={filterCategoria}
                                setFilterCategoria={setFilterCategoria}
                                filterActivo={filterActivo}
                                setFilterActivo={setFilterActivo}
                                filterCompletitud={filterCompletitud}
                                setFilterCompletitud={setFilterCompletitud}
                                filterAusentes={filterAusentes}
                                setFilterAusentes={setFilterAusentes}
                            />
                        </motion.div>
                    )}
                    {showCreatePanel && (
                        <motion.div
                            key="create"
                            initial={{ height: 0, opacity: 0, y: -10 }}
                            animate={{ height: 'auto', opacity: 1, y: 0 }}
                            exit={{ height: 0, opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="relative"
                        >
                            <CreatePanel 
                                hasPermission={hasPermission}
                                setModalType={setModalType as any}
                                setSelectedWorkerForAction={setSelectedWorkerForAction}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Chip de filtro activo "10 meses de contrato" (viene de la alerta del dashboard).
                No tiene control en el FilterPanel, así que se expone acá como banner removible. */}
            {filterAniversario10m && (
                <div className="shrink-0 flex items-center justify-between gap-3 px-3 sm:px-4 py-2.5 rounded-2xl border border-brand-primary/20 bg-brand-primary/5">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                            <CalendarClock className="h-4 w-4 text-brand-primary" />
                        </div>
                        <p className="text-xs sm:text-sm font-semibold text-brand-dark truncate">
                            Trabajadores que cumplen <span className="text-brand-primary">10 meses de contrato</span>
                            {aniversario10mLabel && <> en {aniversario10mLabel}</>}
                        </p>
                    </div>
                    <button
                        onClick={clearAniversario10m}
                        className="flex items-center gap-1 text-[11px] font-bold text-brand-primary hover:underline shrink-0"
                        title="Quitar filtro"
                    >
                        <X className="h-3.5 w-3.5" />
                        Quitar
                    </button>
                </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 flex flex-col bg-card border border-border rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] overflow-hidden relative">
                
                {/* Header Acciones Múltiples */}
                <div className="h-[60px] border-b border-border bg-white/50 px-3 flex items-center justify-between shrink-0 gap-3">
                    {/* Botón RESULTADOS — estilo igual que pestaña activa de Inventario */}
                    <div className="hidden sm:flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl shadow-lg shadow-brand-primary/25">
                        <SearchCheck className="h-4 w-4" />
                        <span className="text-xs font-black uppercase tracking-widest">Resultados</span>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                        {/* Botón TODOS — mismo estilo verde */}
                        <label className="flex items-center gap-2 cursor-pointer bg-brand-primary text-white px-4 py-2 rounded-xl shadow-lg shadow-brand-primary/25 select-none">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                    onChange={handleSelectAll}
                                    className="peer h-[16px] w-[16px] appearance-none rounded border-2 border-white/60 bg-white/20 checked:border-white checked:bg-white transition-all cursor-pointer"
                                />
                                <CheckSquare className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-3 w-3 text-brand-primary pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
                            </div>
                            <span className="text-xs font-black uppercase tracking-widest">
                                {selectedWorkers.size > 0 ? `${selectedWorkers.size} sel.` : 'Todos'}
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
                                        className="h-9 px-3 text-xs md:text-sm bg-card"
                                    >
                                        <span className="hidden sm:inline">Enviar</span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportExcel(Array.from(selectedWorkers))}
                                        leftIcon={<FileDown className="h-4 w-4" />}
                                        className="h-9 px-3 text-xs md:text-sm bg-card"
                                    >
                                        <span className="hidden sm:inline">Exportar</span>
                                    </Button>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Grilla / Resultados */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-muted/80 p-2 md:p-4">
                    {loading ? (
                        <div className="flex flex-col gap-3">
                            {[1, 2, 3, 4, 5, 6].map((i) => (
                                <div key={i} className="h-24 w-full bg-card rounded-2xl border border-border flex items-center p-4 gap-4 animate-pulse">
                                    <div className="h-10 w-10 rounded-xl bg-muted shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-1/3 bg-muted rounded" />
                                        <div className="h-3 w-1/4 bg-muted rounded" />
                                    </div>
                                    <div className="hidden sm:flex h-10 w-1/4 bg-muted rounded ml-auto" />
                                </div>
                            ))}
                        </div>
                    ) : workers.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6 text-center">
                            <div className="w-16 h-16 rounded-2xl bg-card shadow-sm flex items-center justify-center mb-4">
                                <Search className="h-8 w-8 text-muted-foreground" />
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
                        <motion.div
                            className="flex flex-col gap-2.5 pb-10 sm:pb-5"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.15 }}
                        >
                            {/* Filas como <div> normal: animar cada una (hasta 192) causaba jank.
                                La aparición de la lista se anima una sola vez en el contenedor. */}
                            {workers.map((worker, idx) => (
                                <div
                                    key={worker.id}
                                    className={cn(
                                        "bg-card rounded-2xl border transition-all duration-200 p-3 relative cursor-pointer group",
                                        selectedWorkers.has(worker.id) 
                                            ? "bg-brand-primary/[0.03] border-brand-primary ring-1 ring-brand-primary/20 shadow-md" 
                                            : "border-border hover:border-brand-primary/30 shadow-[0_4px_12px_rgb(0,0,0,0.05)] hover:shadow-lg",
                                        !worker.activo && "bg-background/50 border-dashed opacity-80"
                                    )}
                                    onClick={() => handleSelectWorker(worker.id)}
                                >
                                    <div className="flex gap-2.5 sm:gap-4 items-start sm:items-center">
                                        {/* 1. Número / Avatar */}
                                        <div className="flex flex-col items-center justify-center shrink-0">
                                            <div
                                                className={cn(
                                                    "w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl flex items-center justify-center font-black text-[10px] sm:text-xs transition-all border shrink-0",
                                                    selectedWorkers.has(worker.id)
                                                        ? "bg-brand-dark text-white border-brand-dark shadow-md"
                                                        : "bg-background text-muted-foreground opacity-70 border-border group-hover:border-brand-primary/30"
                                                )}
                                            >
                                                {(idx + 1).toString().padStart(2, '0')}
                                            </div>
                                            <div className="mt-2.5 sm:hidden">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedWorkers.has(worker.id)}
                                                    onChange={(e) => { e.stopPropagation(); handleSelectWorker(worker.id); }}
                                                    className="h-4 w-4 rounded border-gray-300 text-brand-primary focus:ring-brand-primary cursor-pointer"
                                                />
                                            </div>
                                        </div>

                                        {/* 2. Información Central */}
                                        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                            {/* Nombres y RUT */}
                                            <div className="flex-1 min-w-0 flex flex-col" onClick={(e) => { e.stopPropagation(); setQuickViewId(worker.id); }}>
                                                <span className="text-[13px] sm:text-sm font-bold text-brand-dark hover:text-brand-primary transition-colors truncate">
                                                    {worker.apellido_paterno} {worker.apellido_materno} {worker.nombres}
                                                </span>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className="text-[10px] sm:text-[11px] font-medium text-muted-foreground">{worker.rut}</span>
                                                    {!worker.activo && (
                                                        <span className="px-1 py-0.5 rounded-[4px] bg-destructive/10 text-destructive text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
                                                            Finiquitado
                                                        </span>
                                                    )}
                                                    {!!worker.es_prueba && (
                                                        <span className="px-1 py-0.5 rounded-[4px] bg-amber-500/15 text-amber-600 border border-amber-500/30 text-[8px] sm:text-[9px] font-bold uppercase tracking-wider">
                                                            Prueba
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Detalles (Empresa, Obra, Docs) */}
                                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 items-center" onClick={(e) => { e.stopPropagation(); setQuickViewId(worker.id); }}>
                                                {/* Empresa & Obra */}
                                                <div className="flex flex-col gap-0.5 min-w-0">
                                                    <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-muted-foreground">
                                                        <Building2 className="h-3 w-3 shrink-0" />
                                                        <span className="truncate">{worker.empresa_nombre || '—'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 text-[11px] sm:text-xs font-semibold text-brand-dark">
                                                        <div className="h-1.5 w-1.5 rounded-full bg-brand-primary shrink-0" />
                                                        <span className="truncate">{worker.obra_nombre || 'Sin Obra'}</span>
                                                    </div>
                                                </div>

                                                {/* Documentación */}
                                                <div className="flex flex-col gap-1 min-w-[80px]">
                                                    <div className="flex items-center justify-between text-[9px] sm:text-[10px] font-bold">
                                                        <span className="text-muted-foreground uppercase tracking-widest hidden sm:inline">Docs</span>
                                                        <span className={worker.docs_porcentaje === 100 ? "text-brand-primary" : "text-destructive"}>
                                                            {worker.docs_porcentaje}%
                                                        </span>
                                                    </div>
                                                    <div className="h-1.5 sm:h-2 w-full bg-muted rounded-full overflow-hidden">
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

                                        {/* 3. Acciones (Derecha) */}
                                        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                            {/* Constancia: genera Carta de Amonestación (Word). Solo ícono + tooltip. */}
                                            <Button
                                                variant="glass"
                                                size="icon"
                                                title="Constancia"
                                                onClick={() => setConstanciaWorker(worker)}
                                                className="h-7 w-7 sm:h-8 sm:w-8 text-brand-primary hover:scale-110 active:scale-95 transition-all"
                                            >
                                                <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            </Button>
                                            <Button
                                                variant="glass"
                                                size="icon"
                                                className={cn(
                                                    "h-7 w-7 sm:h-8 sm:w-8 text-brand-primary hover:scale-110 active:scale-95 transition-all",
                                                    !hasPermission('trabajadores.editar') && "opacity-40 grayscale cursor-not-allowed"
                                                )}
                                                disabled={!hasPermission('trabajadores.editar')}
                                                onClick={() => {
                                                    setSelectedWorkerForAction(worker);
                                                    setModalType('form');
                                                }}
                                            >
                                                <UserPen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                            </Button>
                                            
                                            {worker.activo ? (
                                                <Button
                                                    variant="glass"
                                                    size="icon"
                                                    className={cn(
                                                        "h-7 w-7 sm:h-8 sm:w-8 text-destructive hover:scale-110 active:scale-95 transition-all",
                                                        !hasPermission('trabajadores.eliminar') && "opacity-40 grayscale cursor-not-allowed"
                                                    )}
                                                    disabled={!hasPermission('trabajadores.eliminar')}
                                                    onClick={() => handleDelete(worker)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                </Button>
                                            ) : (
                                                <div className="flex flex-col sm:flex-row gap-1">
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className={cn(
                                                            "h-7 w-7 sm:h-8 sm:w-8 text-brand-primary hover:scale-110 active:scale-95 transition-all",
                                                            !hasPermission('trabajadores.reactivar') && "opacity-40 grayscale cursor-not-allowed"
                                                        )}
                                                        disabled={!hasPermission('trabajadores.reactivar')}
                                                        onClick={(e) => { e.stopPropagation(); handleReactivate(worker.id); }}
                                                    >
                                                        <UserCheck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                    </Button>
                                                    {hasPermission('trabajadores.depurar') && (
                                                        <Button
                                                            variant="glass"
                                                            size="icon"
                                                            className="h-7 w-7 sm:h-8 sm:w-8 text-red-700 bg-red-50 hover:bg-red-100 hover:text-red-900 border border-red-200"
                                                            onClick={(e) => { e.stopPropagation(); handleDepurar(worker); }}
                                                        >
                                                            <Eraser className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}
                </div>

                {/* Status Bar */}
                <div className="h-9 bg-muted border-t border-border flex items-center justify-between px-5 text-[11px] font-bold text-muted-foreground shrink-0 uppercase tracking-widest rounded-b-3xl">
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
                filters={{
                    obra_id: filterObra,
                    empresa_id: filterEmpresa,
                    cargo_id: filterCargo,
                    categoria_reporte: filterCategoria,
                    activo: filterActivo,
                    q: search
                }}
                trabajador_ids={selectedWorkers.size > 0 ? Array.from(selectedWorkers) : undefined}
            />

            {/* Worker Form Modal (Create/Edit) */}
            <Modal
                isOpen={modalType === 'form'}
                onClose={() => setModalType(null)}
                title={selectedWorkerForAction ? "Editar Trabajador" : "Registrar Nuevo Trabajador"}
                size="md"
                headerAction={
                    modalType === 'form' ? (
                        <Button
                            type="submit"
                            form="worker-form"
                            size="sm"
                            leftIcon={<Save className="h-3.5 w-3.5" />}
                        >
                            Guardar
                        </Button>
                    ) : undefined
                }
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
                                className="w-full bg-background border-transparent hover:bg-muted focus:bg-card focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all font-semibold"
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

            {/* Depurar Modal */}
            {modalType === 'depurar' && selectedWorkerForAction && (
                <Modal isOpen={true} onClose={() => setModalType(null)} title="Depurar Registro de Trabajador">
                    <div className="p-6">
                        <div className="bg-amber-50 text-amber-950 p-5 rounded-2xl border border-amber-200 mb-6 flex items-start gap-4">
                            <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                                <Eraser className="h-6 w-6" />
                            </div>
                            <div>
                                <h4 className="font-bold text-amber-900 mb-1">Confirmar Limpieza de Registro</h4>
                                <p className="text-sm text-amber-800 leading-relaxed">
                                    Estás a punto de eliminar definitivamente a <strong className="text-amber-950 font-black">{selectedWorkerForAction.nombres} {selectedWorkerForAction.apellido_paterno}</strong> de la base de datos.
                                    Esta acción es **irreversible** y borrará todos sus documentos y registros de asistencia.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <p className="text-sm text-brand-dark font-medium">
                                Para confirmar esta acción, escribe el RUT del trabajador: <strong className="select-none text-brand-primary">{selectedWorkerForAction.rut}</strong>
                            </p>
                            <Input
                                placeholder="Escribe el RUT para confirmar"
                                value={depurarConfirmationRut}
                                onChange={(e) => setDepurarConfirmationRut(e.target.value)}
                                className="h-12 text-lg font-mono text-center tracking-widest text-brand-dark font-black bg-background border-2 border-border focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all placeholder:font-sans placeholder:font-normal placeholder:tracking-normal"
                            />
                        </div>

                        <div className="flex gap-3 pt-6 mt-6 border-t border-border">
                            <Button variant="outline" onClick={() => setModalType(null)} className="flex-1">Cancelar</Button>
                            <Button 
                                className="flex-1 font-bold bg-destructive text-white hover:bg-red-700 border-none shadow-lg shadow-destructive/20"
                                disabled={depurarConfirmationRut !== selectedWorkerForAction.rut}
                                onClick={confirmDepurar}
                                leftIcon={<Trash2 className="h-4 w-4" />}
                            >
                                Depurar Definitivamente
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
                headerAction={
                    modalType === 'empresa' ? (
                        <Button type="submit" form="empresa-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <EmpresaForm
                    hideActions
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
                headerAction={
                    modalType === 'obra' ? (
                        <Button type="submit" form="obra-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <ObraForm
                    hideActions
                    onCancel={() => setModalType(null)}
                    onSuccess={() => {
                        setModalType(null);
                        fetchCatalogs();
                    }}
                />
            </Modal>

            {/* Mobile Filter Sheet */}
            <AnimatePresence>
                {showMobileFilters && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowMobileFilters(false)}
                            className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-[2px] z-[1000]"
                        />
                        
                        {/* Sheet */}
                        <motion.div
                            drag="y"
                            dragConstraints={{ top: 0 }}
                            dragElastic={0.1}
                            onDragEnd={(_, info) => {
                                if (info.offset.y > 150 || info.velocity.y > 500) {
                                    setShowMobileFilters(false);
                                }
                            }}
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className="lg:hidden fixed bottom-0 left-0 right-0 w-full max-h-[85dvh] bg-card rounded-t-[32px] shadow-2xl z-[1001] flex flex-col overflow-hidden"
                        >
                            {/* Drag Handle */}
                            <div className="pt-3 pb-2 flex justify-center shrink-0" onClick={() => setShowMobileFilters(false)}>
                                <div className="w-12 h-1.5 rounded-full bg-muted" />
                            </div>

                            {/* Header */}
                            <div className="flex items-center justify-between px-5 pb-4 pt-1 shrink-0">
                                <h3 className="text-lg font-bold text-brand-dark">Filtros de Búsqueda</h3>
                                <button 
                                    onClick={() => setShowMobileFilters(false)}
                                    className="p-2 rounded-full bg-background text-muted-foreground active:scale-95 transition-all"
                                >
                                    <X className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto px-5 pb-8 custom-scrollbar">
                                <FilterPanel 
                                    obras={obraOptions}
                                    empresas={empresaOptions}
                                    cargos={cargoOptions}
                                    filterObra={filterObra}
                                    setFilterObra={setFilterObra}
                                    filterEmpresa={filterEmpresa}
                                    setFilterEmpresa={setFilterEmpresa}
                                    filterCargo={filterCargo}
                                    setFilterCargo={setFilterCargo}
                                    filterCategoria={filterCategoria}
                                    setFilterCategoria={setFilterCategoria}
                                    filterActivo={filterActivo}
                                    setFilterActivo={setFilterActivo}
                                    filterCompletitud={filterCompletitud}
                                    setFilterCompletitud={setFilterCompletitud}
                                    filterAusentes={filterAusentes}
                                    setFilterAusentes={setFilterAusentes}
                                />
                                {activeFilterCount > 0 && (
                                    <Button 
                                        variant="glass" 
                                        onClick={handleClearFilters}
                                        className="w-full mt-6 text-destructive font-bold uppercase tracking-widest text-[11px] h-11 rounded-xl"
                                    >
                                        Limpiar Selecciones
                                    </Button>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            <Modal
                isOpen={modalType === 'cargo'}
                onClose={() => setModalType(null)}
                title="Nuevo Cargo"
                size="md"
                headerAction={
                    modalType === 'cargo' ? (
                        <Button type="submit" form="cargo-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Crear
                        </Button>
                    ) : undefined
                }
            >
                <CargoForm
                    hideActions
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
                headerAction={
                    modalType === 'tipodoc' ? (
                        <Button type="submit" form="tipodoc-form" size="sm" leftIcon={<Save className="h-3.5 w-3.5" />}>
                            Guardar
                        </Button>
                    ) : undefined
                }
            >
                <TipoDocumentoForm
                    hideActions
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

            <ConstanciaModal
                isOpen={!!constanciaWorker}
                onClose={() => setConstanciaWorker(null)}
                worker={constanciaWorker}
            />
        </div>
    );
};

export default ConsultasPage;

import React, { useState, useEffect } from 'react';
import {
    Mail,
    Search,
    Loader2,
    Archive,
    Filter,
    Users,
    FileDown,
    Building2,
    ChevronDown,
    X
} from 'lucide-react';
import { toast } from 'sonner';

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
import WorkerLink from '../components/workers/WorkerLink';
import WorkerQuickView from '../components/workers/WorkerQuickView';
import { useSetPageHeader } from '../context/PageHeaderContext';

// Extended type to include advanced search results
interface TrabajadorAvanzado extends Trabajador {
    docs_porcentaje: number;
}

const FiscalizacionPage: React.FC = () => {
    const { selectedObra } = useObra();

    // Catalogs
    const [empresas, setEmpresas] = useState<SelectOption[]>([]);
    const [obras, setObras] = useState<SelectOption[]>([]);
    const [cargos, setCargos] = useState<SelectOption[]>([]);

    // Filters
    const [search, setSearch] = useState('');
    const [filterObra, setFilterObra] = useState<string>('');
    const [filterEmpresa, setFilterEmpresa] = useState<string>('');
    const [filterCargo, setFilterCargo] = useState<string>('');
    const [filterCategoria, setFilterCategoria] = useState<string>('');
    const [filterActivo, setFilterActivo] = useState<string>('true');
    const [filterCompletitud, setFilterCompletitud] = useState<string>('');
    // State
    const [loading, setLoading] = useState(false);
    const [quickViewId, setQuickViewId] = useState<number | null>(null);
    const [exporting, setExporting] = useState(false);
    const [workers, setWorkers] = useState<TrabajadorAvanzado[]>([]);
    const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());
    const [emailModalOpen, setEmailModalOpen] = useState(false);
    const [showMobileFilters, setShowMobileFilters] = useState(false);
    const [markedRows, setMarkedRows] = useState<Set<number>>(new Set());

    const toggleMarkedRow = (index: number) => {
        setMarkedRows(prev => {
            const next = new Set(prev);
            if (next.has(index)) next.delete(index);
            else next.add(index);
            return next;
        });
    };

    // Fetch Catalogs
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

    // Set default obra if contextualized
    useEffect(() => {
        if (selectedObra) {
            setFilterObra(selectedObra.id.toString());
        } else {
            setFilterObra('');
        }
    }, [selectedObra]);

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

            // Auto-select all on new search
            const allIds = new Set(res.data.data.map(w => w.id));
            setSelectedWorkers(allIds);
        } catch (err) {
            toast.error('Error al realizar la búsqueda');
        } finally {
            setLoading(false);
        }
    };

    // Trigger search when filters change
    useEffect(() => {
        // Debounce text search
        const timeoutId = setTimeout(() => {
            performSearch();
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [search, filterObra, filterEmpresa, filterCargo, filterCategoria, filterActivo, filterCompletitud]);

    const handleSelectAll = () => {
        if (selectedWorkers.size === workers.length) {
            setSelectedWorkers(new Set());
        } else {
            setSelectedWorkers(new Set(workers.map(w => w.id)));
        }
    };

    const handleSelectWorker = (id: number) => {
        const newSet = new Set(selectedWorkers);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedWorkers(newSet);
    };

    const latestData = React.useRef({ workers, selectedWorkers });
    React.useEffect(() => {
        latestData.current = { workers, selectedWorkers };
    }, [workers, selectedWorkers]);

    const handleExportExcel = React.useCallback(async () => {
        const { workers: currentWorkers, selectedWorkers: currentSelected } = latestData.current;
        if (currentSelected.size === 0) return;
        setExporting(true);
        toast.info('Generando reporte Excel...', { id: 'excel-export' });

        try {
            const selectedData = currentWorkers.filter(w => currentSelected.has(w.id));
            const response = await api.post('/fiscalizacion/exportar-excel', {
                trabajadores: selectedData
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            const timeString = new Date().toTimeString().split(' ')[0].replace(/:/g, '');
            link.setAttribute('download', `Fiscalizacion_${new Date().toISOString().split('T')[0]}_${timeString}.xlsx`);
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
    }, []);


    // Configuración del Header Global
    const headerTitle = React.useMemo(() => (
        <div className="flex items-center gap-2 md:gap-3">
            <Archive className="h-5 w-5 md:h-6 md:w-6 text-brand-primary shrink-0" />
            <h1 className="text-sm md:text-lg font-bold text-brand-dark truncate">Nómina & Reportes</h1>
        </div>
    ), []);

    const headerActions = React.useMemo(() => (
        <div className="flex items-center gap-1.5 md:gap-2">
            {/* Mobile: filter toggle button */}
            <button
                onClick={() => setShowMobileFilters(prev => !prev)}
                className="md:hidden flex items-center justify-center h-9 w-9 rounded-xl border border-border bg-white text-muted-foreground shadow-sm"
                title="Filtros"
            >
                <Filter className="h-4 w-4" />
            </button>

            {/* Email send button */}
            <Button
                variant="glass"
                onClick={() => setEmailModalOpen(true)}
                disabled={selectedWorkers.size === 0}
                leftIcon={<Mail className="h-4 w-4" />}
                size="sm"
                className="hidden md:flex"
            >
                Enviar por Correo
            </Button>
            <button
                onClick={() => setEmailModalOpen(true)}
                disabled={selectedWorkers.size === 0}
                className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm disabled:opacity-40"
                title="Enviar por Correo"
            >
                <Mail className="h-4 w-4" />
            </button>

            {/* Export Excel */}
            <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                isLoading={exporting}
                disabled={selectedWorkers.size === 0}
                leftIcon={<FileDown className="h-4 w-4" />}
                className="hidden md:flex"
            >
                Exportar Excel
            </Button>
            <button
                onClick={handleExportExcel}
                disabled={selectedWorkers.size === 0 || exporting}
                className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl border border-border bg-white text-muted-foreground shadow-sm disabled:opacity-40"
                title="Exportar Excel"
            >
                <FileDown className="h-4 w-4" />
            </button>
        </div>
    ), [selectedWorkers.size, exporting, handleExportExcel, showMobileFilters]);

    // Configuración del Header Global
    useSetPageHeader(headerTitle, headerActions);

    // Shared filter panel content (used in both mobile and desktop layouts)
    const filterPanel = (
        <div className="space-y-3">
            <Input
                placeholder="Buscar por Nombre o RUT..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon={<Search className="h-4 w-4 text-muted-foreground" />}
            />
            <Select label="Obra / Proyecto" value={filterObra} onChange={(e) => setFilterObra(e.target.value)} options={obras} />
            <Select label="Empresa Empleadora" value={filterEmpresa} onChange={(e) => setFilterEmpresa(e.target.value)} options={empresas} />
            <Select label="Cargo" value={filterCargo} onChange={(e) => setFilterCargo(e.target.value)} options={cargos} />
            <Select label="Categoría" value={filterCategoria} onChange={(e) => setFilterCategoria(e.target.value)} options={[
                { value: '', label: 'Todas las Categorías' },
                { value: 'obra', label: 'En Obra' },
                { value: 'operaciones', label: 'Operaciones' },
                { value: 'rotativo', label: 'Personal rotativo' },
            ]} />
            <Select label="Estado Contractual" value={filterActivo} onChange={(e) => setFilterActivo(e.target.value)} options={[
                { value: 'true', label: 'Activos' },
                { value: 'false', label: 'Finiquitados' },
                { value: '', label: 'Todos' },
            ]} />
            <Select label="Completitud Documentos" value={filterCompletitud} onChange={(e) => setFilterCompletitud(e.target.value)} options={[
                { value: '', label: 'Cualquier Estado' },
                { value: '100', label: '100% al Día' },
                { value: 'faltantes', label: 'Documentos Faltantes' },
            ]} />
        </div>
    );

    return (
        <div className="space-y-4 md:space-y-6 pb-20 md:pb-4">

            {/* ── MOBILE: Collapsible Filter Panel ── */}
            {showMobileFilters && (
                <div className="md:hidden bg-white rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-brand-dark flex items-center gap-2 text-sm">
                            <Filter className="h-4 w-4 text-brand-primary" /> Filtros de Búsqueda
                        </h3>
                        <button onClick={() => setShowMobileFilters(false)} className="text-muted-foreground p-1">
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                    {filterPanel}
                </div>
            )}

            {/* ── DESKTOP: Sidebar Layout ── */}
            <div className="hidden md:grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
                {/* Filter sidebar */}
                <div className="xl:col-span-1">
                    <div className="bg-white rounded-2xl border border-border overflow-hidden sticky top-0">
                        <div className="px-6 py-4 border-b border-border bg-background">
                            <h3 className="text-brand-dark font-semibold flex items-center gap-2">
                                <Filter className="h-4 w-4 text-brand-primary" /> Filtros de Búsqueda
                            </h3>
                        </div>
                        <div className="p-5">{filterPanel}</div>
                    </div>
                </div>

                {/* Desktop: Results Table */}
                <div className="xl:col-span-3">
                    <div className="bg-white rounded-2xl border border-border overflow-hidden min-h-[500px]">
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-background">
                            <div className="flex items-center gap-4">
                                <h3 className="text-brand-dark font-semibold flex items-center gap-2">
                                    Resultados de Búsqueda
                                    {loading && <Loader2 className="h-4 w-4 animate-spin text-brand-primary ml-2" />}
                                </h3>
                                {workers.length > 0 && <div className="h-6 w-[1px] bg-border" />}
                                {workers.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <Users className="h-4 w-4 text-muted-foreground" />
                                        <p className="text-xs text-muted-foreground font-medium">
                                            <span className="font-bold text-brand-dark">{selectedWorkers.size}</span> seleccionados de {workers.length}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#E8E8ED] bg-white text-xs tracking-wider text-muted-foreground uppercase">
                                        <th className="px-4 py-4 font-semibold w-10 text-center">#</th>
                                        <th className="px-4 py-4 font-semibold w-12 text-center">
                                            <input type="checkbox" className="rounded border-border text-brand-primary focus:ring-brand-primary" checked={workers.length > 0 && selectedWorkers.size === workers.length} onChange={handleSelectAll} disabled={workers.length === 0} />
                                        </th>
                                        <th className="px-6 py-4 font-semibold">Trabajador</th>
                                        <th className="px-6 py-4 font-semibold">Ubicación / Rol</th>
                                        <th className="px-6 py-4 font-semibold">Documentación</th>
                                        <th className="px-6 py-4 font-semibold">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E8E8ED]">
                                    {workers.length === 0 ? (
                                        <tr><td colSpan={6} className="px-6 py-20 text-center text-muted-foreground italic">No se encontraron trabajadores con los filtros actuales.</td></tr>
                                    ) : (
                                        workers.map((worker, index) => (
                                            <tr key={worker.id} className={cn("hover:bg-background/50 transition-colors cursor-pointer", selectedWorkers.has(worker.id) && "bg-brand-primary/5", markedRows.has(index) && "!bg-brand-primary/10 border-l-4 border-l-brand-dark")} onClick={() => handleSelectWorker(worker.id)}>
                                                <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => toggleMarkedRow(index)}
                                                        className={cn(
                                                            "w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border mx-auto",
                                                            markedRows.has(index)
                                                                ? "bg-brand-dark text-white border-brand-dark shadow-md scale-110"
                                                                : "bg-transparent text-muted border-transparent hover:border-border hover:bg-white"
                                                        )}
                                                    >
                                                        {(index + 1).toString().padStart(2, '0')}
                                                    </button>
                                                </td>
                                                <td className="px-4 py-4 text-center"><input type="checkbox" className="rounded border-border text-brand-primary focus:ring-brand-primary" checked={selectedWorkers.has(worker.id)} readOnly /></td>
                                                <td className="px-6 py-4">
                                                    <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-sm font-bold text-brand-dark">
                                                        {worker.nombres} {worker.apellido_paterno}
                                                    </WorkerLink>
                                                    <p className="text-xs text-muted-foreground font-medium">{worker.rut}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-brand-dark font-bold">{worker.empresa_nombre || '-'}</p>
                                                    <p className="text-xs text-muted-foreground font-medium truncate max-w-[200px]">{worker.obra_nombre} • {worker.cargo_nombre}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-24 bg-[#E8E8ED] rounded-full overflow-hidden flex-shrink-0">
                                                            <div className={cn("h-full rounded-full", worker.docs_porcentaje === 100 ? "bg-brand-accent" : worker.docs_porcentaje > 50 ? "bg-warning" : "bg-destructive")} style={{ width: `${worker.docs_porcentaje}%` }} />
                                                        </div>
                                                        <span className="text-xs font-medium text-muted-foreground w-10">{worker.docs_porcentaje}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase", worker.activo ? "bg-brand-accent/10 text-brand-accent" : "bg-muted-foreground/10 text-muted-foreground")}>
                                                        {worker.activo ? 'Activo' : 'Finiquitado'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── MOBILE: Card Results ── */}
            <div className="md:hidden">
                {/* Mobile context bar */}
                <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3 mb-3">
                    <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground font-medium">
                            <span className="font-bold text-brand-dark">{selectedWorkers.size}</span> sel. de {workers.length}
                            {loading && <Loader2 className="h-3 w-3 animate-spin text-brand-primary inline ml-2" />}
                        </span>
                    </div>
                    <button
                        onClick={handleSelectAll}
                        disabled={workers.length === 0}
                        className="text-[11px] font-semibold text-brand-primary px-3 py-1.5 rounded-full border border-brand-primary/30 bg-brand-primary/5 disabled:opacity-40"
                    >
                        {selectedWorkers.size === workers.length && workers.length > 0 ? 'Deseleccionar todo' : 'Seleccionar todo'}
                    </button>
                </div>

                {workers.length === 0 && !loading ? (
                    <div className="bg-white rounded-2xl border border-border py-16 text-center">
                        <Archive className="h-10 w-10 text-muted mx-auto mb-3 opacity-40" />
                        <p className="text-muted-foreground text-sm">No se encontraron trabajadores.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {workers.map((worker, index) => {
                            const isSelected = selectedWorkers.has(worker.id);
                            const isMarked = markedRows.has(index);
                            const docColor = worker.docs_porcentaje === 100 ? '#34C759' : worker.docs_porcentaje > 50 ? '#FF9F0A' : '#FF3B30';
                            return (
                                <div
                                    key={worker.id}
                                    onClick={() => handleSelectWorker(worker.id)}
                                    className={cn(
                                        "bg-white rounded-2xl border p-3.5 cursor-pointer transition-all active:scale-[0.99]",
                                        isSelected ? "border-brand-primary ring-2 ring-brand-primary/10 bg-brand-primary/3" : "border-border",
                                        isMarked && "!border-brand-dark !ring-brand-dark/10"
                                    )}
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Row marker */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toggleMarkedRow(index);
                                            }}
                                            className={cn(
                                                "h-8 w-8 rounded-lg flex items-center justify-center font-black text-[10px] transition-all border shrink-0 mt-0.5",
                                                isMarked
                                                    ? "bg-brand-dark text-white border-brand-dark shadow-lg scale-110"
                                                    : "bg-background text-muted border-border"
                                            )}
                                        >
                                            #{(index + 1).toString().padStart(2, '0')}
                                        </button>

                                        {/* Checkbox */}
                                        <div className={cn(
                                            "h-6 w-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                                            isSelected ? "bg-brand-primary border-brand-primary" : "border-border"
                                        )}>
                                            {isSelected && <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            {/* Name + status */}
                                            <div className="flex items-center justify-between gap-2">
                                                <WorkerLink workerId={worker.id} onClick={setQuickViewId} className="text-sm truncate block font-bold text-brand-dark">
                                                    {worker.nombres} {worker.apellido_paterno}
                                                </WorkerLink>
                                                <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", worker.activo ? "bg-brand-accent/10 text-brand-accent" : "bg-muted-foreground/10 text-muted-foreground")}>
                                                    {worker.activo ? 'Activo' : 'Finiquitado'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{worker.rut}</p>

                                            {/* Company + cargo chips */}
                                            <div className="flex gap-1.5 mt-2 flex-wrap">
                                                {worker.empresa_nombre && (
                                                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-background border border-[#E8E8ED] text-[10px] font-semibold text-brand-dark">
                                                        <Building2 className="h-2.5 w-2.5 text-muted-foreground" />
                                                        {worker.empresa_nombre}
                                                    </span>
                                                )}
                                                {worker.cargo_nombre && (
                                                    <span className="px-2 py-0.5 rounded-full bg-background border border-[#E8E8ED] text-[10px] font-semibold text-muted-foreground">
                                                        {worker.cargo_nombre}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Doc progress */}
                                            <div className="flex items-center gap-2 mt-2">
                                                <div className="flex-1 h-1.5 bg-[#E8E8ED] rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all" style={{ width: `${worker.docs_porcentaje}%`, backgroundColor: docColor }} />
                                                </div>
                                                <span className="text-[10px] font-bold shrink-0" style={{ color: docColor }}>{worker.docs_porcentaje}%</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Email Modal */}
            <EnvioEmailModal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                destinatarioEmail=""
                trabajadores={workers.filter(w => selectedWorkers.has(w.id))}
            />

            <WorkerQuickView
                workerId={quickViewId}
                onClose={() => setQuickViewId(null)}
            />
        </div >
    );
};

export default FiscalizacionPage;

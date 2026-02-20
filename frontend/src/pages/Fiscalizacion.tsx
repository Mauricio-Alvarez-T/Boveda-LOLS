import React, { useState, useEffect } from 'react';
import {
    Mail,
    Search,
    Loader2,
    Archive,
    Filter,
    FileSpreadsheet,
    Users
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
    const [exporting, setExporting] = useState(false);
    const [workers, setWorkers] = useState<TrabajadorAvanzado[]>([]);
    const [selectedWorkers, setSelectedWorkers] = useState<Set<number>>(new Set());
    const [emailModalOpen, setEmailModalOpen] = useState(false);

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

    const handleExportExcel = async () => {
        if (selectedWorkers.size === 0) return;
        setExporting(true);
        toast.info('Generando reporte Excel...', { id: 'excel-export' });

        try {
            const selectedData = workers.filter(w => selectedWorkers.has(w.id));
            const response = await api.post('/fiscalizacion/exportar-excel', {
                trabajadores: selectedData
            }, { responseType: 'blob' });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Fiscalizacion_${new Date().toISOString().split('T')[0]}.xlsx`);
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


    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1D1D1F] flex items-center gap-3">
                        <Archive className="h-7 w-7 text-[#0071E3]" />
                        Nómina &amp; Reportes
                    </h1>
                    <p className="text-[#6E6E73] mt-1 text-base">
                        Busca, filtra y exporta reportes de nómina exactos para inspecciones.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">

                {/* MEGA FILTER PANEL */}
                <div className="xl:col-span-1 space-y-5">
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-5 space-y-4 sticky top-6">
                        <h3 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2 border-b border-[#E8E8ED] pb-3">
                            <Filter className="h-4 w-4 text-[#0071E3]" />
                            Filtros de Búsqueda
                        </h3>

                        <div className="space-y-3 pt-2">
                            <Input
                                placeholder="Buscar por Nombre o RUT..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                leftIcon={<Search className="h-4 w-4 text-muted-foreground" />}
                            />

                            <Select
                                value={filterObra}
                                onChange={(e) => setFilterObra(e.target.value)}
                                options={obras}
                            />

                            <Select
                                value={filterEmpresa}
                                onChange={(e) => setFilterEmpresa(e.target.value)}
                                options={empresas}
                            />

                            <Select
                                value={filterCargo}
                                onChange={(e) => setFilterCargo(e.target.value)}
                                options={cargos}
                            />

                            <Select
                                value={filterCategoria}
                                onChange={(e) => setFilterCategoria(e.target.value)}
                                options={[
                                    { value: '', label: 'Todas las Categorías' },
                                    { value: 'obra', label: 'En Obra' },
                                    { value: 'operaciones', label: 'Operaciones' },
                                    { value: 'rotativo', label: 'Personal rotativo' },
                                ]}
                            />

                            <Select
                                label="Estado Contractual"
                                value={filterActivo}
                                onChange={(e) => setFilterActivo(e.target.value)}
                                options={[
                                    { value: 'true', label: 'Activos' },
                                    { value: 'false', label: 'Inactivos' },
                                    { value: '', label: 'Todos' },
                                ]}
                            />

                            <Select
                                label="Completitud Documentos"
                                value={filterCompletitud}
                                onChange={(e) => setFilterCompletitud(e.target.value)}
                                options={[
                                    { value: '', label: 'Cualquier Estado' },
                                    { value: '100', label: '100% al Día' },
                                    { value: 'faltantes', label: 'Documentos Faltantes' },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                {/* RESULTS & EXPORT */}
                <div className="xl:col-span-3 space-y-6">

                    {/* Action Bar */}
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] p-4 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="flex items-center gap-3">
                            <div className="bg-[#0071E3]/10 text-[#0071E3] p-2 rounded-lg">
                                <Users className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="text-sm text-[#6E6E73]">Trabajadores Seleccionados</p>
                                <p className="text-lg font-bold text-[#1D1D1F]">{selectedWorkers.size} <span className="text-sm font-normal text-[#6E6E73]">de {workers.length}</span></p>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                            <Button
                                variant="secondary"
                                onClick={() => setEmailModalOpen(true)}
                                disabled={selectedWorkers.size === 0}
                                leftIcon={<Mail className="h-4 w-4" />}
                            >
                                Enviar por Correo
                            </Button>

                            <Button
                                onClick={handleExportExcel}
                                isLoading={exporting}
                                disabled={selectedWorkers.size === 0}
                                leftIcon={<FileSpreadsheet className="h-4 w-4" />}
                            >
                                Descargar Excel
                            </Button>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden min-h-[500px]">
                        <div className="px-6 py-4 border-b border-[#D2D2D7] flex items-center justify-between bg-[#F5F5F7]">
                            <h3 className="text-[#1D1D1F] font-semibold flex items-center gap-2">
                                Resultados de Búsqueda
                                {loading && <Loader2 className="h-4 w-4 animate-spin text-[#0071E3] ml-2" />}
                            </h3>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-[#E8E8ED] bg-white text-xs tracking-wider text-[#6E6E73] uppercase">
                                        <th className="px-6 py-4 font-semibold w-12 text-center">
                                            <input
                                                type="checkbox"
                                                className="rounded border-[#D2D2D7] text-[#0071E3] focus:ring-[#0071E3]"
                                                checked={workers.length > 0 && selectedWorkers.size === workers.length}
                                                onChange={handleSelectAll}
                                                disabled={workers.length === 0}
                                            />
                                        </th>
                                        <th className="px-6 py-4 font-semibold">Trabajador</th>
                                        <th className="px-6 py-4 font-semibold">Ubicación / Rol</th>
                                        <th className="px-6 py-4 font-semibold">Documentación</th>
                                        <th className="px-6 py-4 font-semibold">Estado</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#E8E8ED]">
                                    {workers.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center text-[#6E6E73] italic">
                                                No se encontraron trabajadores con los filtros actuales.
                                            </td>
                                        </tr>
                                    ) : (
                                        workers.map((worker) => (
                                            <tr
                                                key={worker.id}
                                                className={cn(
                                                    "hover:bg-[#F5F5F7]/50 transition-colors cursor-pointer",
                                                    selectedWorkers.has(worker.id) && "bg-[#0071E3]/5"
                                                )}
                                                onClick={() => handleSelectWorker(worker.id)}
                                            >
                                                <td className="px-6 py-4 text-center">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-[#D2D2D7] text-[#0071E3] focus:ring-[#0071E3]"
                                                        checked={selectedWorkers.has(worker.id)}
                                                        readOnly
                                                    />
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm font-semibold text-[#1D1D1F]">
                                                        {worker.nombres} {worker.apellido_paterno}
                                                    </p>
                                                    <p className="text-xs text-[#6E6E73]">{worker.rut}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="text-sm text-[#1D1D1F]">{worker.empresa_nombre || '-'}</p>
                                                    <p className="text-xs text-[#6E6E73] truncate max-w-[200px]">
                                                        {worker.obra_nombre} • {worker.cargo_nombre}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-2 w-24 bg-[#E8E8ED] rounded-full overflow-hidden flex-shrink-0">
                                                            <div
                                                                className={cn(
                                                                    "h-full rounded-full",
                                                                    worker.docs_porcentaje === 100 ? "bg-[#34C759]" :
                                                                        worker.docs_porcentaje > 50 ? "bg-[#FF9F0A]" : "bg-[#FF3B30]"
                                                                )}
                                                                style={{ width: `${worker.docs_porcentaje}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs font-medium text-[#6E6E73] w-10">
                                                            {worker.docs_porcentaje}%
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase",
                                                        worker.activo ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#6E6E73]/10 text-[#6E6E73]"
                                                    )}>
                                                        {worker.activo ? 'Activo' : 'Inactivo'}
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

            {/* Email Modal */}
            <EnvioEmailModal
                isOpen={emailModalOpen}
                onClose={() => setEmailModalOpen(false)}
                destinatarioEmail=""
                trabajadores={workers.filter(w => selectedWorkers.has(w.id))}
            />
        </div>
    );
};

export default FiscalizacionPage;

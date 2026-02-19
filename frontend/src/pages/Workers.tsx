import React, { useState, useEffect } from 'react';
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
    ArrowLeft
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { showDeleteToast } from '../utils/toastUtils';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WorkerForm } from '../components/workers/WorkerForm';
import { DocumentUploader } from '../components/documents/DocumentUploader';
import { DocumentList } from '../components/documents/DocumentList';
import { useObra } from '../context/ObraContext';
import api from '../services/api';
import type { Trabajador, Empresa, Cargo } from '../types/entities';
import type { ApiResponse } from '../types';

const WorkersPage: React.FC = () => {
    const { selectedObra } = useObra();
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [empresas, setEmpresas] = useState<Empresa[]>([]);
    const [cargos, setCargos] = useState<Cargo[]>([]);

    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
    const [selectedCargo, setSelectedCargo] = useState<string>('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

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

    const fetchWorkers = async () => {
        setLoading(true);
        try {
            const obraQuery = selectedObra ? `&obra_id=${selectedObra.id}` : '';
            const empresaQuery = selectedEmpresa ? `&empresa_id=${selectedEmpresa}` : '';
            const cargoQuery = selectedCargo ? `&cargo_id=${selectedCargo}` : '';

            const response = await api.get<ApiResponse<Trabajador[]>>(`/trabajadores?q=${search}${obraQuery}${empresaQuery}${cargoQuery}`);
            const data = response.data.data;
            setWorkers(data);

            // Fetch completion percentages for all workers
            if (data.length > 0) {
                const ids = data.map(w => w.id);
                try {
                    const compRes = await api.post<Record<number, { uploaded: number, total: number, percentage: number }>>('/documentos/kpi/completitud', { trabajador_ids: ids });
                    setCompletion(compRes.data);
                } catch {
                    // Silently fail — completion will show 0%
                }
            }
        } catch (error) {
            console.error('Error fetching workers:', error);
            toast.error('Error al cargar trabajadores');
        } finally {
            setLoading(false);
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
            fetchWorkers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search, selectedObra, selectedEmpresa, selectedCargo]);

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

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-[#1D1D1F] flex items-center gap-3">
                        <Users className="h-7 w-7 text-[#0071E3]" />
                        Gestión de Trabajadores
                    </h1>
                    <p className="text-[#6E6E73] mt-1 text-base">
                        Administra la información y documentación de tu personal.
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setSelectedWorker(null);
                        setModalType('form');
                    }}
                    leftIcon={<UserPlus className="h-4 w-4" />}
                >
                    Nuevo Trabajador
                </Button>
            </div>

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
                            if (selectedEmpresa || selectedCargo) {
                                setSelectedEmpresa('');
                                setSelectedCargo('');
                            } else {
                                setShowFilters(!showFilters);
                            }
                        }}
                        size="sm"
                    >
                        {(selectedEmpresa || selectedCargo) ? 'Limpiar Filtros' : 'Filtros'}
                    </Button>
                    <Button
                        variant="glass"
                        leftIcon={<ArrowUpDown className="h-4 w-4" />}
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        size="sm"
                    >
                        {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                    </Button>
                </div>
            </div>

            {/* Expanded Filters Panel */}
            {showFilters && (
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
                            className="w-full bg-white border border-[#D2D2D7] rounded-xl p-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30 focus:border-[#0071E3] transition-all"
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
                            className="w-full bg-white border border-[#D2D2D7] rounded-xl p-2.5 text-sm text-[#1D1D1F] focus:outline-none focus:ring-2 focus:ring-[#0071E3]/30 focus:border-[#0071E3] transition-all"
                        >
                            <option value="">Todos los Cargos</option>
                            {cargos.map(c => (
                                <option key={c.id} value={c.id}>{c.nombre}</option>
                            ))}
                        </select>
                    </div>
                </motion.div>
            )}

            {/* Table Section */}
            <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7] uppercase text-xs tracking-widest text-[#6E6E73]">
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
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-[#0071E3] mb-2" />
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
                                            className="hover:bg-[#F5F5F7]/80 transition-all duration-300 group border-l-4 border-l-transparent hover:border-l-[#0071E3]"
                                        >
                                            <td className="px-6 py-6">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 rounded-2xl bg-[#0071E3]/10 text-[#0071E3] flex items-center justify-center font-bold text-lg shadow-sm border border-[#0071E3]/20">
                                                        {worker.nombres[0]}{(worker.apellido_paterno || '')[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-[15px] font-bold text-[#1D1D1F] leading-tight group-hover:text-[#0071E3] transition-colors">{worker.nombres} {worker.apellido_paterno}</p>
                                                        <p className="text-xs font-semibold text-[#6E6E73] mt-1 tracking-tight">{worker.rut}</p>
                                                    </div>
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
                                                        className="h-10 w-10 rounded-2xl text-[#0071E3] hover:scale-110 active:scale-95 transition-all shadow-sm"
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
                                                        className="h-10 w-10 rounded-2xl text-[#34C759] hover:scale-110 active:scale-95 transition-all shadow-sm"
                                                        onClick={() => {
                                                            setSelectedWorker(worker);
                                                            setModalType('form');
                                                        }}
                                                    >
                                                        <UserPen className="h-5 w-5" />
                                                    </Button>
                                                    <Button
                                                        variant="glass"
                                                        size="icon"
                                                        className="h-10 w-10 rounded-2xl text-[#FF3B30] hover:scale-110 active:scale-95 transition-all shadow-sm"
                                                        onClick={() => handleDelete(worker.id)}
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
                    <div className="space-y-6">
                        {/* Worker Details Summary in Modal */}
                        <div className="bg-[#0071E3]/5 border border-[#0071E3]/10 p-4 rounded-2xl flex flex-wrap items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-[#0071E3] text-white flex items-center justify-center font-bold text-xl">
                                {selectedWorker.nombres[0]}{(selectedWorker.apellido_paterno || '')[0]}
                            </div>
                            <div className="flex-1 min-w-[200px]">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-[#1D1D1F]">{selectedWorker.rut}</span>
                                    <span className="px-2 py-0.5 rounded-lg bg-[#0071E3]/10 text-[#0071E3] text-[10px] font-black uppercase tracking-wider">
                                        {selectedWorker.obra_nombre || 'Sin Obra'}
                                    </span>
                                </div>
                                <p className="text-xs font-medium text-[#6E6E73] mt-1">
                                    {selectedWorker.empresa_nombre} • {selectedWorker.cargo_nombre || 'Sin Cargo'}
                                </p>
                            </div>
                        </div>

                        <div className="flex justify-between items-center bg-[#F5F5F7] p-4 rounded-xl">
                            <div>
                                <h4 className="text-base font-semibold text-[#1D1D1F]">Bóveda de Documentos</h4>
                                <p className="text-sm text-[#6E6E73]">Sube y gestiona archivos para este trabajador.</p>
                            </div>
                            <div className="flex gap-2">
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
                                        className="text-[#0071E3] hover:text-[#0077ED]"
                                        leftIcon={<Download className="h-4 w-4" />}
                                    >
                                        Descargar Todo (.zip)
                                    </Button>
                                )}
                                <Button
                                    size="sm"
                                    variant={isUploading ? 'glass' : 'primary'}
                                    onClick={() => setIsUploading(!isUploading)}
                                    leftIcon={isUploading ? <ArrowLeft className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                                >
                                    {isUploading ? 'Volver a la lista' : 'Subir Documento'}
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
        </div>
    );
};

export default WorkersPage;

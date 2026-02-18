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
    X
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { WorkerForm } from '../components/workers/WorkerForm';
import { DocumentUploader } from '../components/documents/DocumentUploader';
import { DocumentList } from '../components/documents/DocumentList';
import api from '../services/api';
import type { Trabajador } from '../types/entities';
import type { ApiResponse } from '../types';

const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    // Document completion data: { [workerId]: percentage }
    const [completion, setCompletion] = useState<Record<number, number>>({});

    // Modal states
    const [modalType, setModalType] = useState<'form' | 'docs' | null>(null);
    const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    // Sort & Filter states
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [showFilters, setShowFilters] = useState(false);
    const [filterStatus, setFilterStatus] = useState<'all' | 'complete' | 'incomplete'>('all');

    const fetchWorkers = async () => {
        setLoading(true);
        try {
            const response = await api.get<ApiResponse<Trabajador[]>>(`/trabajadores?q=${search}`);
            const data = response.data.data;
            setWorkers(data);

            // Fetch completion percentages for all workers
            if (data.length > 0) {
                const ids = data.map(w => w.id);
                try {
                    const compRes = await api.post('/documentos/kpi/completitud', { trabajador_ids: ids });
                    setCompletion(compRes.data);
                } catch {
                    // Silently fail — completion will show 0%
                }
            }
        } catch (err) {
            toast.error('Error al cargar trabajadores');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!window.confirm('¿Estás seguro de desactivar este trabajador?')) return;
        try {
            await api.delete(`/trabajadores/${id}`);
            toast.success('Trabajador desactivado');
            fetchWorkers();
        } catch (err) {
            toast.error('Error al eliminar trabajador');
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchWorkers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

    // Helper function for completion color
    const getCompletionColor = (pct: number) => {
        if (pct >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
        if (pct >= 50) return { bar: 'bg-amber-500', text: 'text-amber-400' };
        return { bar: 'bg-rose-500', text: 'text-rose-400' };
    };

    // Filtered and sorted workers
    const filteredWorkers = [...workers]
        .filter(worker => {
            if (filterStatus === 'all') return true;
            const pct = completion[worker.id] ?? 0;
            if (filterStatus === 'complete') return pct >= 80;
            if (filterStatus === 'incomplete') return pct < 80;
            return true;
        })
        .sort((a, b) => {
            const nameA = `${a.nombres} ${a.apellido_paterno}`.toLowerCase();
            const nameB = `${b.nombres} ${b.apellido_paterno}`.toLowerCase();
            return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
        });

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                        <Users className="h-8 w-8 text-brand-primary" />
                        Gestión de Trabajadores
                    </h1>
                    <p className="text-muted-foreground mt-1">
                        Administra la información y documentación de tu personal.
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setSelectedWorker(null);
                        setModalType('form');
                    }}
                    leftIcon={<UserPlus className="h-5 w-5" />}
                >
                    Nuevo Trabajador
                </Button>
            </div>

            {/* Filters & Search */}
            <div className="premium-card p-4 flex flex-col md:flex-row gap-4">
                <div className="relative flex-1">
                    <Input
                        placeholder="Buscar por RUT o Nombre..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-11"
                    />
                    <Search className="absolute left-4 top-3 h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex gap-2">
                    <Button
                        variant={showFilters ? 'primary' : 'glass'}
                        leftIcon={<Filter className="h-4 w-4" />}
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        {filterStatus !== 'all' ? 'Filtros (1)' : 'Filtros'}
                    </Button>
                    <Button
                        variant="glass"
                        leftIcon={<ArrowUpDown className="h-4 w-4" />}
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
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
                    className="premium-card p-4 grid grid-cols-1 md:grid-cols-3 gap-4"
                >
                    <div className="space-y-2">
                        <label className="text-xs text-muted-foreground">Estado Documental</label>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value as any)}
                            className="w-full bg-white/5 border border-white/10 rounded-lg p-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand-primary"
                        >
                            <option value="all" className="bg-slate-900">Todos</option>
                            <option value="complete" className="bg-slate-900">Completos (≥80%)</option>
                            <option value="incomplete" className="bg-slate-900">Incompletos (&lt;80%)</option>
                        </select>
                    </div>
                </motion.div>
            )}

            {/* Table Section */}
            <div className="premium-card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 uppercase text-[10px] tracking-widest text-muted-foreground">
                                <th className="px-6 py-4 font-semibold">Trabajador</th>
                                <th className="px-6 py-4 font-semibold">Empresa / Obra</th>
                                <th className="px-6 py-4 font-semibold">Cargo</th>
                                <th className="px-6 py-4 font-semibold">Estado Docs</th>
                                <th className="px-6 py-4 font-semibold text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <Loader2 className="h-8 w-8 animate-spin mx-auto text-brand-primary mb-2" />
                                        <p className="text-muted-foreground">Cargando trabajadores...</p>
                                    </td>
                                </tr>
                            ) : filteredWorkers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">
                                        No se encontraron trabajadores.
                                    </td>
                                </tr>
                            ) : (
                                filteredWorkers.map((worker) => {
                                    const pct = completion[worker.id] ?? 0;
                                    const colors = getCompletionColor(pct);

                                    return (
                                        <motion.tr
                                            key={worker.id}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="hover:bg-white/5 transition-colors group"
                                        >
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-10 w-10 rounded-full premium-gradient flex items-center justify-center text-white font-bold text-xs">
                                                        {worker.nombres[0]}{(worker.apellido_paterno || '')[0]}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">{worker.nombres} {worker.apellido_paterno}</p>
                                                        <p className="text-xs text-muted-foreground">{worker.rut}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs text-white font-medium">{worker.empresa_nombre || 'Sin Empresa'}</p>
                                                <p className="text-[10px] text-muted-foreground">{worker.obra_nombre || 'Sin Obra'}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="text-xs px-2 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20">
                                                    {worker.cargo_nombre || 'N/A'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-1.5 w-16 bg-white/10 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full ${colors.bar} transition-all duration-500`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                    <span className={`text-[10px] ${colors.text} font-bold`}>{pct}%</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                                        onClick={() => {
                                                            setSelectedWorker(worker);
                                                            setModalType('docs');
                                                        }}
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10"
                                                        onClick={() => {
                                                            setSelectedWorker(worker);
                                                            setModalType('form');
                                                        }}
                                                    >
                                                        <UserPen className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-400/10"
                                                        onClick={() => handleDelete(worker.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
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
                size={modalType === 'docs' ? 'lg' : 'md'}
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
                        <div className="flex justify-between items-center bg-white/5 p-4 rounded-2xl border border-white/10">
                            <div>
                                <h4 className="text-sm font-bold text-white">Bóveda de Documentos</h4>
                                <p className="text-xs text-muted-foreground">Sube y gestiona archivos para este trabajador.</p>
                            </div>
                            <Button
                                size="sm"
                                variant={isUploading ? 'glass' : 'primary'}
                                onClick={() => setIsUploading(!isUploading)}
                                leftIcon={isUploading ? <X className="h-4 w-4" /> : <FilePlus className="h-4 w-4" />}
                            >
                                {isUploading ? 'Volver a la lista' : 'Subir Documento'}
                            </Button>
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

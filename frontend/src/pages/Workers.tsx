import React, { useState, useEffect } from 'react';
import {
    Users,
    Search,
    UserPlus,
    FileText,
    MoreVertical,
    Trash2,
    UserPen,
    Filter,
    ArrowUpDown,
    FilePlus,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import api from '../services/api';
import { Trabajador } from '../types/entities';
import { ApiResponse } from '../types';
import { cn } from '../utils/cn';

const WorkersPage: React.FC = () => {
    const [workers, setWorkers] = useState<Trabajador[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<Trabajador | null>(null);

    const fetchWorkers = async () => {
        setLoading(true);
        try {
            const response = await api.get<ApiResponse<Trabajador[]>>(`/trabajadores?q=${search}`);
            setWorkers(response.data.data);
        } catch (err) {
            toast.error('Error al cargar trabajadores');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            fetchWorkers();
        }, 500);
        return () => clearTimeout(timer);
    }, [search]);

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
                        setIsModalOpen(true);
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
                    <Button variant="glass" leftIcon={<Filter className="h-4 w-4" />}>
                        Filtros
                    </Button>
                    <Button variant="glass" leftIcon={<ArrowUpDown className="h-4 w-4" />}>
                        Ordenar
                    </Button>
                </div>
            </div>

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
                            ) : workers.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-muted-foreground">
                                        No se encontraron trabajadores.
                                    </td>
                                </tr>
                            ) : (
                                workers.map((worker) => (
                                    <motion.tr
                                        key={worker.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-white/5 transition-colors group"
                                    >
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full premium-gradient flex items-center justify-center text-white font-bold text-xs">
                                                    {worker.nombres[0]}{worker.apellido_paterno[0]}
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
                                                <div className="h-1.5 w-12 bg-white/10 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500 w-[75%]" />
                                                </div>
                                                <span className="text-[10px] text-emerald-400 font-medium">8 / 10</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-400/10">
                                                    <FilePlus className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-400/10">
                                                    <UserPen className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-400/10">
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal Placeholder */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={selectedWorker ? "Editar Trabajador" : "Registrar Nuevo Trabajador"}
            >
                <div className="space-y-4">
                    <p className="text-muted-foreground text-sm italic">Formulario de registro (Próximamente)...</p>
                </div>
            </Modal>
        </div>
    );
};

export default WorkersPage;

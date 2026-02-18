import React, { useState, useEffect, useCallback } from 'react';
import {
    Search,
    Plus,
    Pencil,
    Trash2,
    Loader2,
    ChevronLeft,
    ChevronRight,
    AlertCircle
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

import { Button } from './Button';
import { Input } from './Input';
import { Modal } from './Modal';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';

export interface ColumnDef<T> {
    key: keyof T | string;
    label: string;
    render?: (value: any, row: T) => React.ReactNode;
    className?: string;
}

interface CrudTableProps<T extends { id: number }> {
    endpoint: string;
    columns: ColumnDef<T>[];
    entityName: string;
    entityNamePlural: string;
    FormComponent: React.FC<{
        initialData?: T | null;
        onSuccess: () => void;
        onCancel: () => void;
    }>;
    searchPlaceholder?: string;
    canCreate?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    queryParams?: Record<string, string | number | boolean>;
}

export function CrudTable<T extends { id: number; activo?: boolean }>({
    endpoint,
    columns,
    entityName,
    entityNamePlural,
    FormComponent,
    searchPlaceholder,
    canCreate = true,
    canEdit = true,
    canDelete = true,
    queryParams = {},
}: CrudTableProps<T>) {
    const [rows, setRows] = useState<T[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, pages: 1 });
    const [modalOpen, setModalOpen] = useState(false);
    const [editItem, setEditItem] = useState<T | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                q: search,
                page: page.toString(),
                limit: '15'
            });

            // Add extra params
            Object.entries(queryParams).forEach(([k, v]) => {
                if (v !== undefined) params.append(k, String(v));
            });

            const res = await api.get<ApiResponse<T[]>>(`${endpoint}?${params.toString()}`);
            setRows(res.data.data);
            if (res.data.pagination) {
                setPagination({ total: res.data.pagination.total, pages: res.data.pagination.pages });
            }
        } catch {
            toast.error(`Error al cargar ${entityNamePlural.toLowerCase()}`);
        } finally {
            setLoading(false);
        }
    }, [endpoint, search, page, entityNamePlural, JSON.stringify(queryParams)]);

    useEffect(() => {
        const timer = setTimeout(fetchData, 400);
        return () => clearTimeout(timer);
    }, [fetchData]);

    const handleDelete = async (id: number) => {
        if (!window.confirm(`¿Desactivar este registro de ${entityName.toLowerCase()}?`)) return;
        try {
            await api.delete(`${endpoint}/${id}`);
            toast.success(`${entityName} desactivado`);
            fetchData();
        } catch {
            toast.error(`Error al eliminar ${entityName.toLowerCase()}`);
        }
    };

    const openCreate = () => {
        setEditItem(null);
        setModalOpen(true);
    };

    const openEdit = (item: T) => {
        setEditItem(item);
        setModalOpen(true);
    };

    const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    };

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                <div className="relative flex-1 w-full sm:max-w-xs">
                    <Input
                        placeholder={searchPlaceholder || `Buscar ${entityNamePlural.toLowerCase()}...`}
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        className="pl-10 h-9 text-xs"
                    />
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                </div>
                {canCreate && (
                    <Button size="sm" onClick={openCreate} leftIcon={<Plus className="h-4 w-4" />}>
                        Nuevo {entityName}
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="premium-card p-0 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 uppercase text-[10px] tracking-widest text-muted-foreground">
                                {columns.map(col => (
                                    <th key={String(col.key)} className={cn("px-5 py-3 font-semibold", col.className)}>
                                        {col.label}
                                    </th>
                                ))}
                                {(canEdit || canDelete) && (
                                    <th className="px-5 py-3 font-semibold text-right">Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-brand-primary mb-2" />
                                        <p className="text-xs text-muted-foreground">Cargando...</p>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <AlertCircle className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                                        <p className="text-xs text-muted-foreground">No se encontraron registros.</p>
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-white/5 transition-colors"
                                    >
                                        {columns.map(col => (
                                            <td key={String(col.key)} className={cn("px-5 py-3 text-sm text-white", col.className)}>
                                                {col.render
                                                    ? col.render(getNestedValue(row, String(col.key)), row)
                                                    : String(getNestedValue(row, String(col.key)) ?? '—')
                                                }
                                            </td>
                                        ))}
                                        {(canEdit || canDelete) && (
                                            <td className="px-5 py-3 text-right">
                                                <div className="flex justify-end gap-1">
                                                    {canEdit && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-7 w-7 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-400/10"
                                                            onClick={() => openEdit(row)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                    {canDelete && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-7 w-7 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-400/10"
                                                            onClick={() => handleDelete(row.id)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        )}
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{pagination.total} registro{pagination.total !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-white font-medium">
                            {page} / {pagination.pages}
                        </span>
                        <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7"
                            disabled={page >= pagination.pages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            )}

            {/* Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                title={editItem ? `Editar ${entityName}` : `Nuevo ${entityName}`}
                size="md"
            >
                <FormComponent
                    initialData={editItem}
                    onCancel={() => setModalOpen(false)}
                    onSuccess={() => {
                        setModalOpen(false);
                        fetchData();
                    }}
                />
            </Modal>
        </div>
    );
}

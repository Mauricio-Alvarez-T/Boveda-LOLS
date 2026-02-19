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
import { showDeleteToast } from '../../utils/toastUtils';

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

    const handleDelete = (id: number) => {
        showDeleteToast({
            onConfirm: async () => {
                await api.delete(`${endpoint}/${id}`);
                fetchData();
            },
            message: `¿Desactivar ${entityName}?`,
            successMessage: `${entityName} desactivado`,
            errorMessage: `Error al desactivar ${entityName.toLowerCase()}`
        });
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
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-[#A1A1A6]" />
                </div>
                {canCreate && (
                    <Button size="default" onClick={openCreate} leftIcon={<Plus className="h-5 w-5" />}>
                        Nuevo {entityName}
                    </Button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-[#D2D2D7] overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F5F5F7] border-b border-[#D2D2D7] uppercase text-xs tracking-widest text-[#6E6E73]">
                                {columns.map(col => (
                                    <th key={String(col.key)} className={cn("px-5 py-4 font-semibold", col.className)}>
                                        {col.label}
                                    </th>
                                ))}
                                {(canEdit || canDelete) && (
                                    <th className="px-5 py-4 font-semibold text-right">Acciones</th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E8ED]">
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#0071E3] mb-2" />
                                        <p className="text-xs text-[#6E6E73]">Cargando...</p>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <AlertCircle className="h-5 w-5 mx-auto text-[#A1A1A6] mb-2" />
                                        <p className="text-xs text-[#6E6E73]">No se encontraron registros.</p>
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-[#F5F5F7]/50 transition-colors"
                                    >
                                        {columns.map(col => (
                                            <td key={String(col.key)} className={cn("px-5 py-4 text-base text-[#1D1D1F]", col.className)}>
                                                {col.render
                                                    ? col.render(getNestedValue(row, String(col.key)), row)
                                                    : String(getNestedValue(row, String(col.key)) ?? '—')
                                                }
                                            </td>
                                        ))}
                                        {(canEdit || canDelete) && (
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {canEdit && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-9 w-9 rounded-full text-[#0071E3] hover:bg-[#0071E3]/8"
                                                            onClick={() => openEdit(row)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {canDelete && (
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            className="h-9 w-9 rounded-full text-[#FF3B30] hover:bg-[#FF3B30]/8"
                                                            onClick={() => handleDelete(row.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
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
                <div className="flex items-center justify-between text-sm text-[#6E6E73]">
                    <span>{pagination.total} registro{pagination.total !== 1 ? 's' : ''}</span>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost" size="icon"
                            className="h-9 w-9 rounded-full"
                            disabled={page <= 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-[#1D1D1F] font-medium">
                            {page} / {pagination.pages}
                        </span>
                        <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 rounded-full"
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

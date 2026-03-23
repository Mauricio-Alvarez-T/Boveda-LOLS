import React, { useState, useEffect, useCallback } from 'react';
import {
    Search,
    Plus,
    Pencil,
    Trash2,
    Loader2,
    ChevronLeft,
    ChevronRight,
    AlertCircle,
    FileDown
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { showDeleteToast } from '../../utils/toastUtils';

import { Button } from './Button';
import { SearchBar } from './SearchBar';
import { Modal } from './Modal';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import { cn } from '../../utils/cn';

export interface ColumnDef<T> {
    key: keyof T | string;
    label: string;
    render?: (value: any, row: T) => React.ReactNode;
    className?: string;
    /** If true, this column is hidden on mobile cards (shown only in desktop table) */
    hideOnMobile?: boolean;
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
    canExport?: boolean;
    queryParams?: Record<string, string | number | boolean>;
    renderActions?: (row: T) => React.ReactNode;
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
    canExport = true,
    queryParams = {},
    renderActions,
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
            message: `¿Eliminar ${entityName}?`,
            successMessage: `${entityName} eliminado`,
            errorMessage: `Error al eliminar ${entityName.toLowerCase()}`
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

    const handleExport = async () => {
        try {
            toast.info(`Generando reporte de ${entityNamePlural.toLowerCase()}...`, { id: 'excel-export' });

            const params = new URLSearchParams({
                q: search,
                name: entityNamePlural
            });
            Object.entries(queryParams).forEach(([k, v]) => {
                if (v !== undefined) params.append(k, String(v));
            });

            const response = await api.get(`${endpoint}/export?${params.toString()}`, {
                responseType: 'blob'
            });

            const url = window.URL.createObjectURL(new Blob([response.data as any]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${entityNamePlural.replace(/\s+/g, '_')}_Export.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);

            toast.success('Reporte Excel descargado', { id: 'excel-export' });
        } catch (error) {
            console.error('Error exportando Excel', error);
            toast.error('Error al generar el reporte', { id: 'excel-export' });
        }
    };

    const getNestedValue = (obj: any, path: string) => {
        return path.split('.').reduce((acc, part) => acc?.[part], obj);
    };

    // Visible columns for mobile cards (skip hideOnMobile)
    const mobileColumns = columns.filter(c => !c.hideOnMobile);
    // First column is used as the "title" of the mobile card
    const titleCol = mobileColumns[0];
    const detailCols = mobileColumns.slice(1);

    return (
        <div className="space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
                <SearchBar
                    value={search}
                    onChange={(val) => { setSearch(val); setPage(1); }}
                    placeholder={searchPlaceholder || `Buscar ${entityNamePlural.toLowerCase()}...`}
                    className="sm:max-w-xs"
                />
                <div className="flex items-center gap-2 shrink-0">
                    {canExport && (
                        <Button variant="outline" size="sm" onClick={handleExport} leftIcon={<FileDown className="h-4 w-4" />} className="hidden sm:flex">
                            Exportar Excel
                        </Button>
                    )}
                    {/* Desktop: full label button */}
                    <Button
                        size="sm"
                        onClick={openCreate}
                        disabled={!canCreate}
                        leftIcon={<Plus className="h-4 w-4" />}
                        className={cn("hidden sm:flex", !canCreate && "opacity-50 cursor-not-allowed")}
                    >
                        Nuevo {entityName}
                    </Button>
                    {/* Mobile: icon-only button */}
                    <Button
                        size="icon"
                        onClick={openCreate}
                        disabled={!canCreate}
                        className={cn("sm:hidden h-9 w-9", !canCreate && "opacity-50 cursor-not-allowed")}
                        title={`Nuevo ${entityName}`}
                    >
                        <Plus className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* ─── MOBILE: Card list ─── */}
            <div className="md:hidden space-y-3">
                {loading ? (
                    <div className="py-16 text-center">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-primary mb-2" />
                        <p className="text-xs text-muted-foreground">Cargando...</p>
                    </div>
                ) : rows.length === 0 ? (
                    <div className="py-16 text-center">
                        <AlertCircle className="h-5 w-5 mx-auto text-muted mb-2" />
                        <p className="text-xs text-muted-foreground">No se encontraron registros.</p>
                    </div>
                ) : (
                    rows.map((row) => {
                        const titleValue = titleCol
                            ? (titleCol.render
                                ? titleCol.render(getNestedValue(row, String(titleCol.key)), row)
                                : String(getNestedValue(row, String(titleCol.key)) ?? '—'))
                            : '—';

                        return (
                            <motion.div
                                key={row.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-white rounded-2xl border border-border/60 p-5 shadow-sm hover:shadow-md transition-shadow"
                            >
                                {/* Card title */}
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="font-semibold text-sm text-brand-dark flex-1 min-w-0">
                                        {titleValue}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        {renderActions && renderActions(row)}
                                        <button
                                            onClick={() => canEdit && openEdit(row)}
                                            disabled={!canEdit}
                                            className={cn(
                                                "p-1.5 rounded-lg text-brand-primary hover:bg-brand-primary/8 transition-colors",
                                                !canEdit && "opacity-30 cursor-not-allowed"
                                            )}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </button>
                                        <button
                                            onClick={() => canDelete && handleDelete(row.id)}
                                            disabled={!canDelete}
                                            className={cn(
                                                "p-1.5 rounded-lg text-destructive hover:bg-destructive/8 transition-colors",
                                                !canDelete && "opacity-30 cursor-not-allowed"
                                            )}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                {/* Card detail rows */}
                                {detailCols.length > 0 && (
                                    <div className="space-y-1">
                                        {detailCols.map(col => {
                                            const value = getNestedValue(row, String(col.key));
                                            const rendered = col.render ? col.render(value, row) : String(value ?? '—');
                                            return (
                                                <div key={String(col.key)} className="flex items-center justify-between text-xs">
                                                    <span className="text-muted-foreground">{col.label}</span>
                                                    <span className="text-brand-dark font-medium text-right max-w-[60%] truncate">{rendered}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </motion.div>
                        );
                    })
                )}
            </div>

            {/* ─── DESKTOP: Table ─── */}
            <div className="hidden md:block bg-white rounded-2xl border border-[#E8E8ED] shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#F9F9FB] border-b border-[#E8E8ED] uppercase text-[10px] tracking-[0.1em] font-bold text-muted-foreground/70">
                                {columns.map(col => (
                                    <th key={String(col.key)} className={cn("px-6 py-4", col.className)}>
                                        {col.label}
                                    </th>
                                ))}
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E8E8ED]">
                            {loading ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <Loader2 className="h-5 w-5 animate-spin mx-auto text-brand-primary mb-2" />
                                        <p className="text-xs text-muted-foreground">Cargando...</p>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + 1} className="px-5 py-16 text-center">
                                        <AlertCircle className="h-5 w-5 mx-auto text-muted mb-2" />
                                        <p className="text-xs text-muted-foreground">No se encontraron registros.</p>
                                    </td>
                                </tr>
                            ) : (
                                rows.map((row) => (
                                    <motion.tr
                                        key={row.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="hover:bg-background/50 transition-colors"
                                    >
                                        {columns.map(col => (
                                            <td key={String(col.key)} className={cn("px-6 py-4 text-sm text-brand-dark font-medium", col.className)}>
                                                {col.render
                                                    ? col.render(getNestedValue(row, String(col.key)), row)
                                                    : String(getNestedValue(row, String(col.key)) ?? '—')
                                                }
                                            </td>
                                        ))}
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {renderActions && renderActions(row)}
                                                <Button
                                                    variant="ghost" size="icon"
                                                    className={cn(
                                                        "h-9 w-9 rounded-full text-brand-primary hover:bg-brand-primary/8",
                                                        !canEdit && "opacity-30 grayscale cursor-not-allowed"
                                                    )}
                                                    onClick={() => canEdit && openEdit(row)}
                                                    disabled={!canEdit}
                                                    title={!canEdit ? "No tienes permisos para editar" : "Editar"}
                                                >
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost" size="icon"
                                                    className={cn(
                                                        "h-9 w-9 rounded-full text-destructive hover:bg-destructive/8",
                                                        !canDelete && "opacity-30 grayscale cursor-not-allowed"
                                                    )}
                                                    onClick={() => canDelete && handleDelete(row.id)}
                                                    disabled={!canDelete}
                                                    title={!canDelete ? "No tienes permisos para eliminar" : "Eliminar"}
                                                >
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

            {/* Pagination */}
            {pagination.pages > 1 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
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
                        <span className="text-brand-dark font-medium">
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

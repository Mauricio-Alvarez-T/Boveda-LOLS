import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { Search, X, ChevronDown, EyeOff, Eye, RotateCcw, Download, Plus } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';
import { exportResumen } from '../../utils/exportExcel';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';
import { ItemInventarioForm } from '../settings/ItemInventarioForm';

interface ToolbarProps {
    data: ResumenData;
    search: string;
    setSearch: (val: string) => void;
    selectedCategoryId: number | null;
    setSelectedCategoryId: (val: number | null) => void;
    hideEmpty: boolean;
    setHideEmpty: React.Dispatch<React.SetStateAction<boolean>>;
    hiddenCount: number;
    restoreCols: () => void;
    isCustomOrder?: boolean;
    restoreColOrder?: () => void;
    canCreate?: boolean;
    onRefresh?: () => void;
}

export const ResumenToolbar: React.FC<ToolbarProps> = ({
    data,
    search, setSearch,
    selectedCategoryId, setSelectedCategoryId,
    hideEmpty, setHideEmpty,
    hiddenCount, restoreCols,
    isCustomOrder = false, restoreColOrder,
    canCreate = false, onRefresh,
}) => {
    const [showCreateModal, setShowCreateModal] = useState(false);

    const handleCreateSuccess = () => {
        setShowCreateModal(false);
        onRefresh?.();
    };

    return (
        <div className="hidden md:flex flex-wrap items-center gap-2 py-2 shrink-0">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar ítem..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                />
                {search && (
                    <IconButton
                        onClick={() => setSearch('')}
                        icon={<X className="h-3 w-3" />}
                        variant="ghost"
                        size="sm"
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6"
                    />
                )}
            </div>

            {/* Category Filter */}
            <div className="shrink-0 relative flex items-center border border-border bg-card rounded-xl focus-within:ring-2 focus-within:ring-brand-primary/20 transition-all">
                <select
                    value={selectedCategoryId ?? ''}
                    onChange={e => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className="pl-3 pr-8 py-1.5 text-label font-medium text-brand-dark bg-transparent focus:outline-none appearance-none cursor-pointer w-full min-w-[150px]"
                >
                    <option value="">Todas las categorías</option>
                    {data.categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Hide empty toggle */}
            {/* eslint-disable-next-line no-restricted-syntax -- toggle estado (ocultar vacías) */}
            <button
                onClick={() => setHideEmpty(v => !v)}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-label font-semibold rounded-xl border transition-all",
                    hideEmpty
                        ? "bg-brand-primary/10 border-brand-primary/30 text-green-700 dark:text-green-300"
                        : "bg-card border-border text-muted-foreground hover:border-brand-primary/30"
                )}
            >
                {hideEmpty ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Ocultar vacías
            </button>

            {/* Restore hidden columns */}
            {hiddenCount > 0 && (
                // eslint-disable-next-line no-restricted-syntax -- toggle estado (restaurar columnas ocultas)
                <button
                    onClick={restoreCols}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300 dark:hover:bg-amber-900/40 transition-all"
                >
                    <RotateCcw className="h-3 w-3" />
                    Mostrar {hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}
                </button>
            )}

            {/* Restore column order */}
            {isCustomOrder && restoreColOrder && (
                // eslint-disable-next-line no-restricted-syntax -- toggle estado (restaurar orden de columnas)
                <button
                    onClick={restoreColOrder}
                    title="Restablecer el orden de columnas (obras primero, bodegas al final)"
                    className="flex items-center gap-1.5 px-3 py-1.5 text-label font-semibold rounded-xl border border-border bg-card text-muted-foreground hover:border-brand-primary/30 hover:text-brand-primary transition-all"
                >
                    <RotateCcw className="h-3 w-3" />
                    Orden por defecto
                </button>
            )}

            {/* Agregar Ítem */}
            {canCreate && (
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateModal(true)}
                    leftIcon={<Plus className="h-3.5 w-3.5" />}
                    className="ml-auto"
                >
                    Agregar Ítem
                </Button>
            )}

            {/* Exportar Excel */}
            <Button
                variant="secondary"
                size="sm"
                onClick={() => exportResumen(data)}
                leftIcon={<Download className="h-3.5 w-3.5" />}
                className={cn(!canCreate && "ml-auto")}
            >
                Exportar Excel
            </Button>

            {/* Create Item Modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Agregar Nuevo Ítem"
                size="lg"
            >
                <ItemInventarioForm
                    onSuccess={handleCreateSuccess}
                    onCancel={() => setShowCreateModal(false)}
                />
            </Modal>
        </div>
    );
};

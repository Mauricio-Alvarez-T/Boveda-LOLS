import React from 'react';
import { cn } from '../../utils/cn';
import { Search, X, ChevronDown, EyeOff, Eye, RotateCcw, Download } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';
import { exportResumen } from '../../utils/exportExcel';

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
}

export const ResumenToolbar: React.FC<ToolbarProps> = ({
    data,
    search, setSearch,
    selectedCategoryId, setSelectedCategoryId,
    hideEmpty, setHideEmpty,
    hiddenCount, restoreCols
}) => {
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
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                        <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                )}
            </div>

            {/* Category Filter */}
            <div className="shrink-0 relative flex items-center border border-[#E8E8ED] bg-white rounded-xl focus-within:ring-2 focus-within:ring-brand-primary/20 transition-all">
                <select
                    value={selectedCategoryId ?? ''}
                    onChange={e => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
                    className="pl-3 pr-8 py-1.5 text-[11px] font-medium text-brand-dark bg-transparent focus:outline-none appearance-none cursor-pointer w-full min-w-[150px]"
                >
                    <option value="">Todas las categorías</option>
                    {data.categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            </div>

            {/* Hide empty toggle */}
            <button
                onClick={() => setHideEmpty(v => !v)}
                className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-xl border transition-all",
                    hideEmpty
                        ? "bg-brand-primary/10 border-brand-primary/30 text-brand-primary"
                        : "bg-white border-[#E8E8ED] text-muted-foreground hover:border-brand-primary/30"
                )}
            >
                {hideEmpty ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                Ocultar vacías
            </button>

            {/* Restore hidden columns */}
            {hiddenCount > 0 && (
                <button
                    onClick={restoreCols}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
                >
                    <RotateCcw className="h-3 w-3" />
                    Mostrar {hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}
                </button>
            )}

            {/* Exportar Excel */}
            <button
                onClick={() => exportResumen(data)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-sm ml-auto"
            >
                <Download className="h-3.5 w-3.5" />
                Exportar Excel
            </button>
        </div>
    );
};

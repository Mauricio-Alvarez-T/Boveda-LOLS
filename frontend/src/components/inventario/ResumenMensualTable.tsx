import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '../../utils/cn';
import { ChevronRight, ChevronDown, Search, Package, Download, X, ImageIcon, Check, MapPin, Warehouse } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import { useInlineEdit } from '../../hooks/inventario/useInlineEdit';
import { useResumenMensualFilters } from '../../hooks/inventario/useResumenMensualFilters';
import ItemDetailModal from './ItemDetailModal';
import { ResumenToolbar } from './ResumenToolbar';
import { exportResumen } from '../../utils/exportExcel';

interface Props {
    data: ResumenData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

const ResumenMensualTable: React.FC<Props> = ({ data, canEdit, onUpdateStock, onRefresh }) => {
    const { obras, bodegas, categorias } = data;

    // ── Item detail modal ──
    const itemDetail = useItemDetail();

    // ── Inline Edit Helpers ──
    const desktopEdit = useInlineEdit({ canEdit, onUpdateStock, onRefresh });
    const mobileEdit = useInlineEdit({ canEdit, onUpdateStock, onRefresh });

    // ── State ──
    // ── Filters & View State ──
    const filters = useResumenMensualFilters(data);
    const {
        collapsedCats, toggleCat,
        hiddenCols, toggleCol, restoreCols,
        hideEmpty, setHideEmpty,
        search, setSearch,
        selectedCategoryId, setSelectedCategoryId,
        showImages, setShowImages,
        colsWithStock,
        visibleObras,
        visibleBodegas,
        filteredCategorias,
        searchLower
    } = filters;

    // ── Category totals (for collapsed summary) ──
    const catTotals = useMemo(() => {
        const map: Record<number, { count: number; totalArriendo: number; totalCantidad: number }> = {};
        for (const cat of categorias) {
            map[cat.id] = {
                count: cat.items.length,
                totalArriendo: cat.items.reduce((s, i) => s + i.total_arriendo, 0),
                totalCantidad: cat.items.reduce((s, i) => s + i.total_cantidad, 0),
            };
        }
        return map;
    }, [categorias]);

    // ── Grand totals ──
    const grandTotals = useMemo(() => {
        let totalArriendo = 0;
        let totalCantidad = 0;
        let totalDescuento = 0;

        // 1. Calcular totales por ítem
        for (const cat of categorias) {
            for (const item of cat.items) {
                totalArriendo += item.total_arriendo;
                totalCantidad += item.total_cantidad;
            }
        }

        // 2. Calcular descuento total (por obra)
        obras.forEach(o => {
            const descPorcentaje = data.descuentos[o.id] || 0;
            if (descPorcentaje > 0) {
                // Calcular el total de arriendo de esta obra
                const obraArriendo = categorias.reduce((sum, cat) =>
                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.total || 0), 0), 0
                );
                totalDescuento += (obraArriendo * descPorcentaje) / 100;
            }
        });

        return { 
            totalArriendo, 
            totalCantidad, 
            totalDescuento,
            totalConDescuento: totalArriendo - totalDescuento
        };
    }, [categorias, obras, data.descuentos]);



    // Auditoría 3.9: memoizar renderEditableQty para evitar re-creación en cada render
    // (se invoca por celda — con N obras × M items la diferencia es notoria al tipear).
    const renderEditableQty = useCallback((
        cellKey: string, cantidad: number,
        itemId: number, obraId: number | null, bodegaId: number | null,
        hasValue: boolean
    ) => {
        if (desktopEdit.editingCell === cellKey) {
            return (
                <div className="flex items-center justify-center gap-0.5">
                    <input
                        type="number" value={desktopEdit.editValue}
                        onChange={e => desktopEdit.setEditValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') desktopEdit.saveEdit(itemId, obraId, bodegaId);
                            if (e.key === 'Escape') desktopEdit.cancelEdit();
                        }}
                        className="w-14 px-1 py-0.5 text-[11px] border rounded text-center focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus min={0}
                    />
                    <button onClick={() => desktopEdit.saveEdit(itemId, obraId, bodegaId)} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded"><Check className="h-3 w-3" /></button>
                    <button onClick={desktopEdit.cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><X className="h-3 w-3" /></button>
                </div>
            );
        }
        return (
            <span
                onClick={() => desktopEdit.startEdit(cellKey, cantidad)}
                className={cn(
                    hasValue ? "font-semibold text-brand-dark" : "text-muted-foreground/40",
                    canEdit && "cursor-pointer hover:bg-brand-primary/10 hover:ring-1 hover:ring-brand-primary/30 rounded px-1 py-0.5 transition-all"
                )}
                title={canEdit ? 'Click para editar' : undefined}
            >
                {hasValue ? cantidad : ''}
            </span>
        );
    }, [
        desktopEdit.editingCell,
        desktopEdit.editValue,
        desktopEdit.setEditValue,
        desktopEdit.saveEdit,
        desktopEdit.cancelEdit,
        desktopEdit.startEdit,
        canEdit,
    ]);

    const totalColSpan = 4 + visibleObras.length * 2 + visibleBodegas.length + 2;
    const hiddenCount = hiddenCols.size;

    // ── Mobile: expanded item state ──
    const [mobileExpandedItem, setMobileExpandedItem] = useState<number | null>(null);

    return (
        <div className="flex flex-col gap-3 flex-1 min-h-0">
            {/* ═══════════════════════════════════════════
                ── MOBILE VIEW ──
               ═══════════════════════════════════════════ */}
            <div className="md:hidden flex flex-col gap-3 flex-1 min-h-0">
                {/* Mobile Search */}
                <div className="relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar item..."
                        className="w-full pl-10 pr-10 py-3 text-sm border border-[#E8E8ED] rounded-2xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-muted rounded-full">
                            <X className="h-3.5 w-3.5 text-muted-foreground" />
                        </button>
                    )}
                </div>

                {/* Mobile Category Filter */}
                <div className="shrink-0 flex items-center bg-white border border-[#E8E8ED] rounded-2xl overflow-hidden pr-3">
                    <select
                        value={selectedCategoryId ?? ''}
                        onChange={e => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
                        className="w-full pl-4 py-3 text-sm text-brand-dark bg-transparent focus:outline-none appearance-none cursor-pointer"
                    >
                        <option value="">Todas las categorías</option>
                        {categorias.map(c => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                    </select>
                    <ChevronDown className="h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>

                {/* Mobile Grand Totals — summary card at top */}
                <div className="shrink-0 bg-gradient-to-r from-brand-primary to-brand-primary/80 rounded-2xl p-4 text-white">
                    <p className="text-[10px] font-medium uppercase tracking-wider opacity-80 mb-2">Resumen General</p>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <p className="text-lg font-black">{fmt(grandTotals.totalCantidad)}</p>
                            <p className="text-[10px] opacity-80">Unidades</p>
                        </div>
                        <div>
                            <p className="text-lg font-black">{fmtMoney(grandTotals.totalArriendo)}</p>
                            <p className="text-[10px] opacity-80">Arriendo</p>
                        </div>
                        {grandTotals.totalDescuento > 0 ? (
                            <div>
                                <p className="text-lg font-black">{fmtMoney(grandTotals.totalConDescuento)}</p>
                                <p className="text-[10px] opacity-80 text-brand-primary line-through whitespace-nowrap overflow-hidden text-ellipsis">{fmtMoney(grandTotals.totalArriendo)}</p>
                                <p className="text-[10px] opacity-80">Con Descuento</p>
                            </div>
                        ) : (
                            <div>
                                <p className="text-lg font-black">{filteredCategorias.reduce((s, c) => s + c.items.length, 0)}</p>
                                <p className="text-[10px] opacity-80">Items</p>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => exportResumen(data)}
                        className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 bg-white/20 hover:bg-white/30 rounded-xl text-xs font-bold text-white transition-all shadow-sm"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Exportar a Excel
                    </button>
                </div>

                {/* Mobile Categories & Items */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                    {filteredCategorias.map(cat => {
                        const collapsed = collapsedCats.has(cat.id);
                        const totals = catTotals[cat.id];
                        return (
                            <div key={cat.id} className="rounded-2xl border border-[#E8E8ED] overflow-hidden bg-white">
                                {/* Category Header */}
                                <button
                                    onClick={() => toggleCat(cat.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-brand-primary/5 active:bg-brand-primary/10 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <ChevronRight className={cn("h-4 w-4 text-brand-primary transition-transform duration-200", !collapsed && "rotate-90")} />
                                        <span className="font-black text-xs uppercase tracking-wider text-brand-primary">{cat.nombre}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                                        <span className="font-bold">{totals?.count} items</span>
                                        <span className="font-bold text-brand-dark">{fmt(totals?.totalCantidad || 0)} u.</span>
                                    </div>
                                </button>

                                {/* Items List */}
                                {!collapsed && (
                                    <div className="divide-y divide-[#F0F0F5]">
                                        {cat.items.map(item => {
                                            const isExpanded = mobileExpandedItem === item.id;
                                            // Gather all locations with stock for this item
                                            const obraLocs = obras.filter(o => {
                                                const ub = item.ubicaciones[`obra_${o.id}`];
                                                return ub && ub.cantidad > 0;
                                            });
                                            const bodegaLocs = bodegas.filter(b => {
                                                const ub = item.ubicaciones[`bodega_${b.id}`];
                                                return ub && ub.cantidad > 0;
                                            });
                                            const totalLocs = obraLocs.length + bodegaLocs.length;

                                            return (
                                                <div key={item.id}>
                                                    {/* Item Row — tap to expand */}
                                                    <button
                                                        onClick={() => setMobileExpandedItem(isExpanded ? null : item.id)}
                                                        className="w-full flex items-center gap-3 px-4 py-3 active:bg-blue-50/50 transition-colors text-left"
                                                    >
                                                        {/* Image or number */}
                                                        <div className="w-10 h-10 rounded-xl bg-[#F5F7FA] border border-[#E8E8ED] flex items-center justify-center shrink-0 overflow-hidden">
                                                            {item.imagen_url ? (
                                                                <img src={`${API_BASE}${item.imagen_url}`} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-[10px] font-bold text-muted-foreground">#{item.nro_item}</span>
                                                            )}
                                                        </div>

                                                        {/* Info */}
                                                        <div className="flex-1 min-w-0">
                                                            <p
                                                                className="text-xs font-bold text-brand-dark truncate hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                                                onClick={(e) => { e.stopPropagation(); itemDetail.openItem(item.id, item); }}
                                                            >{item.descripcion}</p>
                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                {totalLocs > 0 && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {totalLocs} ubicacion{totalLocs !== 1 ? 'es' : ''}
                                                                    </span>
                                                                )}
                                                                {item.valor_arriendo > 0 && (
                                                                    <span className="text-[10px] text-muted-foreground">
                                                                        {fmtMoney(item.valor_arriendo)}/mes
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right side: totals + chevron */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-brand-dark">{fmt(item.total_cantidad)}</p>
                                                                {item.total_arriendo > 0 && (
                                                                    <p className="text-[10px] font-semibold text-brand-primary">{fmtMoney(item.total_arriendo)}</p>
                                                                )}
                                                            </div>
                                                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 transition-transform duration-200", isExpanded && "rotate-180")} />
                                                        </div>
                                                    </button>

                                                    {/* Expanded Detail — stock per location */}
                                                    {isExpanded && (
                                                        <div className="px-4 pb-4 pt-1 bg-[#FAFBFC]">
                                                            {/* Obras */}
                                                            {obras.map(o => {
                                                                const ub = item.ubicaciones[`obra_${o.id}`];
                                                                const qty = ub?.cantidad || 0;
                                                                const total = ub?.total || 0;
                                                                const cellKey = `m_obra_${o.id}_item_${item.id}`;
                                                                if (!ub && qty === 0 && !canEdit) return null;
                                                                return (
                                                                    <div key={o.id} className="flex items-center justify-between py-2.5 border-b border-[#F0F0F5] last:border-0">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <div className="w-6 h-6 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center shrink-0">
                                                                                <MapPin className="h-3 w-3 text-blue-600" />
                                                                            </div>
                                                                            <span className="text-xs font-medium text-brand-dark truncate">{o.nombre}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            {/* Editable qty */}
                                                                            {mobileEdit.editingCell === cellKey ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    <input
                                                                                        type="number" min={0}
                                                                                        value={mobileEdit.editValue}
                                                                                        onChange={e => mobileEdit.setEditValue(e.target.value)}
                                                                                        onKeyDown={e => {
                                                                                            if (e.key === 'Enter') mobileEdit.saveEdit(item.id, o.id, null);
                                                                                            if (e.key === 'Escape') mobileEdit.cancelEdit();
                                                                                        }}
                                                                                        className="w-16 px-2 py-1.5 text-xs border-2 border-brand-primary rounded-xl text-center font-bold focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                                                                        autoFocus
                                                                                    />
                                                                                    <button onClick={() => mobileEdit.saveEdit(item.id, o.id, null)} className="p-1.5 bg-green-100 text-green-700 rounded-lg"><Check className="h-3.5 w-3.5" /></button>
                                                                                    <button onClick={mobileEdit.cancelEdit} className="p-1.5 bg-red-100 text-red-600 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => canEdit && mobileEdit.startEdit(cellKey, qty)}
                                                                                    className={cn(
                                                                                        "min-w-[3rem] px-3 py-1.5 rounded-xl text-xs font-bold text-center",
                                                                                        qty > 0 ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-400 border border-gray-200",
                                                                                        canEdit && "active:scale-95 transition-transform"
                                                                                    )}
                                                                                >
                                                                                    {qty}
                                                                                </button>
                                                                            )}
                                                                            {total > 0 && mobileEdit.editingCell !== cellKey && (
                                                                                <span className="text-[10px] font-semibold text-brand-primary w-20 text-right">{fmtMoney(total)}</span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}

                                                            {/* Bodegas */}
                                                            {bodegas.map(b => {
                                                                const ub = item.ubicaciones[`bodega_${b.id}`];
                                                                const qty = ub?.cantidad || 0;
                                                                const cellKey = `m_bodega_${b.id}_item_${item.id}`;
                                                                if (!ub && qty === 0 && !canEdit) return null;
                                                                return (
                                                                    <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-[#F0F0F5] last:border-0">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <div className="w-6 h-6 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
                                                                                <Warehouse className="h-3 w-3 text-amber-600" />
                                                                            </div>
                                                                            <span className="text-xs font-medium text-brand-dark truncate">{b.nombre}</span>
                                                                        </div>
                                                                        <div className="flex items-center gap-3 shrink-0">
                                                                            {mobileEdit.editingCell === cellKey ? (
                                                                                <div className="flex items-center gap-1">
                                                                                    <input
                                                                                        type="number" min={0}
                                                                                        value={mobileEdit.editValue}
                                                                                        onChange={e => mobileEdit.setEditValue(e.target.value)}
                                                                                        onKeyDown={e => {
                                                                                            if (e.key === 'Enter') mobileEdit.saveEdit(item.id, null, b.id);
                                                                                            if (e.key === 'Escape') mobileEdit.cancelEdit();
                                                                                        }}
                                                                                        className="w-16 px-2 py-1.5 text-xs border-2 border-brand-primary rounded-xl text-center font-bold focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                                                                        autoFocus
                                                                                    />
                                                                                    <button onClick={() => mobileEdit.saveEdit(item.id, null, b.id)} className="p-1.5 bg-green-100 text-green-700 rounded-lg"><Check className="h-3.5 w-3.5" /></button>
                                                                                    <button onClick={mobileEdit.cancelEdit} className="p-1.5 bg-red-100 text-red-600 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                                                                                </div>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={() => canEdit && mobileEdit.startEdit(cellKey, qty)}
                                                                                    className={cn(
                                                                                        "min-w-[3rem] px-3 py-1.5 rounded-xl text-xs font-bold text-center",
                                                                                        qty > 0 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-gray-50 text-gray-400 border border-gray-200",
                                                                                        canEdit && "active:scale-95 transition-transform"
                                                                                    )}
                                                                                >
                                                                                    {qty}
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}

                                                            {/* No locations at all */}
                                                            {obraLocs.length === 0 && bodegaLocs.length === 0 && !canEdit && (
                                                                <p className="text-xs text-muted-foreground text-center py-3">Sin stock en ninguna ubicacion</p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        );
                    })}

                    {filteredCategorias.length === 0 && (
                        <div className="py-12 text-center">
                            <Package className="h-10 w-10 mx-auto text-muted-foreground/20 mb-3" />
                            <p className="text-sm text-muted-foreground font-medium">No se encontraron items</p>
                        </div>
                    )}
                </div>
            </div>

            {/* ═══════════════════════════════════════════
                ── DESKTOP VIEW (unchanged) ──
               ═══════════════════════════════════════════ */}
            {/* ── Toolbar ── */}
            <ResumenToolbar
                data={data}
                search={search}
                setSearch={setSearch}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                hideEmpty={hideEmpty}
                setHideEmpty={setHideEmpty}
                hiddenCount={hiddenCount}
                restoreCols={restoreCols}
                canCreate={canEdit}
                onRefresh={onRefresh}
            />

            {/* ── Table — fills remaining space, scrolls both axes ── */}
            <div className="hidden md:block overflow-auto flex-1 min-h-0 rounded-xl border border-[#E8E8ED]">
                <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 z-20">
                        {/* Header row 1 — solid backgrounds for sticky */}
                        <tr>
                            <th className="sticky left-0 z-30 bg-[#F5F7FA] px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8">#</th>
                            <th
                                onClick={() => setShowImages(v => !v)}
                                className="bg-[#F5F7FA] px-1.5 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8 cursor-pointer hover:bg-[#E8ECF2] transition-colors"
                                title={showImages ? 'Ocultar imágenes' : 'Mostrar imágenes'}
                            >
                                <ImageIcon className={cn("h-3.5 w-3.5 mx-auto transition-colors", showImages ? "text-brand-primary" : "text-muted-foreground/40")} />
                            </th>
                            <th className={cn("sticky z-30 bg-[#F5F7FA] px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] min-w-[180px]", showImages ? "left-[68px]" : "left-8")}>Descripción</th>
                            <th className="bg-[#F5F7FA] px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-16">V. Arriendo</th>
                            {visibleObras.map((o, oIdx) => (
                                <th key={`obra_${o.id}`} colSpan={2} className={cn("px-1 py-2 text-center font-bold text-brand-dark border-b border-r-2 border-[#E8E8ED] border-r-[#BBBBCC] group/col", oIdx % 2 === 0 ? "bg-[#EBF0FB]" : "bg-[#DEE6F7]")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="truncate">{o.nombre}</span>
                                        <button
                                            onClick={() => toggleCol(`obra_${o.id}`)}
                                            className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-red-100 transition-all shrink-0"
                                            title={`Ocultar ${o.nombre}`}
                                        >
                                            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                        </button>
                                    </div>
                                </th>
                            ))}
                            {visibleBodegas.map((b, bIdx) => (
                                <th key={`bodega_${b.id}`} className={cn("px-1 py-2 text-center font-bold text-brand-dark border-b border-r-2 border-[#E8E8ED] border-r-[#BBBBCC] group/col", bIdx % 2 === 0 ? "bg-[#FDF6E8]" : "bg-[#F9EDD5]")}>
                                    <div className="flex items-center justify-center gap-1">
                                        <span className="truncate">{b.nombre}</span>
                                        <button
                                            onClick={() => toggleCol(`bodega_${b.id}`)}
                                            className="opacity-0 group-hover/col:opacity-100 p-0.5 rounded hover:bg-red-100 transition-all shrink-0"
                                            title={`Ocultar ${b.nombre}`}
                                        >
                                            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                        </button>
                                    </div>
                                </th>
                            ))}
                            <th className="bg-[#ECFAF0] px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED]">Total Arriendo</th>
                            <th className="bg-[#ECFAF0] px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED]">Total Unid.</th>
                        </tr>
                        {/* Header row 2 — sub-headers with solid bg */}
                        <tr>
                            <th className="sticky left-0 z-30 bg-[#EDEDF2] border-b border-r border-[#D8D8DD]" />
                            <th className="bg-[#EDEDF2] border-b border-r border-[#D8D8DD]" />
                            <th className={cn("sticky z-30 bg-[#EDEDF2] border-b border-r border-[#D8D8DD]", showImages ? "left-[68px]" : "left-8")} />
                            <th className="bg-[#EDEDF2] border-b border-r border-[#E8E8ED]" />
                            {visibleObras.map((o, oIdx) => (
                                <React.Fragment key={`sub_obra_${o.id}`}>
                                    <th className={cn("px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#D8D8DD] uppercase tracking-wider", oIdx % 2 === 0 ? "bg-[#E8EDF8]" : "bg-[#DDE4F4]")}>Cant</th>
                                    <th className={cn("px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r-2 border-[#D8D8DD] border-r-[#BBBBCC] uppercase tracking-wider", oIdx % 2 === 0 ? "bg-[#E8EDF8]" : "bg-[#DDE4F4]")}>Total</th>
                                </React.Fragment>
                            ))}
                            {visibleBodegas.map((b, bIdx) => (
                                <th key={`sub_bod_${b.id}`} className={cn("px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r-2 border-[#D8D8DD] border-r-[#BBBBCC] uppercase tracking-wider", bIdx % 2 === 0 ? "bg-[#F9F0DE]" : "bg-[#F4E8CF]")}>Cant</th>
                            ))}
                            <th className="bg-[#E5F5EB] border-b border-r border-[#E8E8ED]" />
                            <th className="bg-[#E5F5EB] border-b border-[#E8E8ED]" />
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCategorias.map(cat => {
                            const collapsed = collapsedCats.has(cat.id);
                            const totals = catTotals[cat.id];
                            return (
                                <React.Fragment key={cat.id}>
                                    {/* Category header — clickable, sticky text */}
                                    <tr
                                        className="bg-brand-primary/10 cursor-pointer select-none hover:bg-brand-primary/15 transition-colors"
                                        onClick={() => toggleCat(cat.id)}
                                    >
                                        <td colSpan={totalColSpan} className="px-0 py-0">
                                            <div className="sticky left-0 w-fit px-3 py-2 flex items-center gap-2">
                                                <ChevronRight className={cn("h-3.5 w-3.5 text-brand-primary transition-transform duration-200", !collapsed && "rotate-90")} />
                                                <span className="font-black text-[10px] uppercase tracking-widest text-brand-primary">
                                                    {cat.nombre}
                                                </span>
                                                {totals && (
                                                    <span className="ml-2 text-[10px] font-medium text-muted-foreground">
                                                        {totals.count} ítems · {fmt(totals.totalCantidad)} unid. · {fmtMoney(totals.totalArriendo)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Item rows — hidden when collapsed */}
                                    {!collapsed && cat.items.map((item, idx) => {
                                        const rowBg = idx % 2 === 0 ? 'bg-white' : 'bg-[#F5F5F8]';
                                        return (
                                        <tr key={item.id} className={cn("hover:bg-blue-50/40 transition-colors", rowBg)}>
                                            <td className={cn("sticky left-0 z-10 px-2 py-1.5 text-right text-muted-foreground border-r border-b border-[#D8D8DD]", rowBg)}>{item.nro_item}</td>
                                            <td className={cn("px-1 py-1.5 text-center border-r border-b border-[#D8D8DD]", rowBg)}>
                                                {showImages && (
                                                    item.imagen_url
                                                        ? <img src={`${API_BASE}${item.imagen_url}`} alt="" className="w-8 h-8 object-cover rounded mx-auto" />
                                                        : <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center mx-auto"><ImageIcon className="h-3 w-3 text-muted-foreground/30" /></div>
                                                )}
                                            </td>
                                            <td className={cn("sticky z-10 px-2 py-1.5 font-medium text-brand-dark border-r border-b border-[#D8D8DD] truncate max-w-[200px]", rowBg, showImages ? "left-[68px]" : "left-8")}>
                                                <button
                                                    type="button"
                                                    onClick={() => itemDetail.openItem(item.id, item)}
                                                    className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                                >
                                                    {item.descripcion}
                                                </button>
                                            </td>
                                            <td className={cn("px-2 py-1.5 text-right text-muted-foreground border-r-2 border-b border-[#D8D8DD] border-r-[#BBBBCC]")}>{fmtMoney(item.valor_arriendo)}</td>
                                            {visibleObras.map((o, oIdx) => {
                                                const ub = item.ubicaciones[`obra_${o.id}`];
                                                const cellKey = `obra_${o.id}_item_${item.id}`;
                                                const colBg = oIdx % 2 === 1 ? 'bg-blue-50/30' : '';
                                                return (
                                                    <React.Fragment key={cellKey}>
                                                        <td className={cn("px-2 py-1.5 text-center border-r border-b border-[#D8D8DD]", colBg)}>
                                                            {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, o.id, null, !!(ub && ub.cantidad > 0))}
                                                        </td>
                                                        <td className={cn("px-2 py-1.5 text-right border-r-2 border-b border-[#D8D8DD] border-r-[#BBBBCC]", colBg, ub && ub.total > 0 ? "text-brand-dark" : "text-muted-foreground/40")}>
                                                            {ub && ub.total > 0 ? fmtMoney(ub.total) : ''}
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })}
                                            {visibleBodegas.map((b, bIdx) => {
                                                const ub = item.ubicaciones[`bodega_${b.id}`];
                                                const cellKey = `bodega_${b.id}_item_${item.id}`;
                                                const colBg = bIdx % 2 === 1 ? 'bg-amber-50/30' : '';
                                                return (
                                                    <td key={cellKey} className={cn("px-2 py-1.5 text-center border-r-2 border-b border-[#D8D8DD] border-r-[#BBBBCC]", colBg)}>
                                                        {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, null, b.id, !!(ub && ub.cantidad > 0))}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-1.5 text-right font-semibold text-brand-accent border-r border-b border-[#D8D8DD]">
                                                {item.total_arriendo > 0 ? fmtMoney(item.total_arriendo) : ''}
                                            </td>
                                            <td className="px-2 py-1.5 text-right font-semibold text-brand-dark border-b border-[#D8D8DD]">
                                                {item.total_cantidad > 0 ? fmt(item.total_cantidad) : ''}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    {/* ── Sticky totals footer — solid bg, clear labels ── */}
                    <tfoot className="sticky bottom-0 z-10">
                        <tr className="border-t-2 border-brand-primary/30">
                            <td colSpan={4} className="bg-[#F0F2F8] px-2 py-2.5 text-right font-black text-xs text-brand-dark">
                                TOTAL GENERAL
                            </td>
                            {visibleObras.map(o => {
                                const obraTotal = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.total || 0), 0), 0);
                                const obraCant = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.cantidad || 0), 0), 0);
                                return (
                                    <React.Fragment key={`total_obra_${o.id}`}>
                                        <td className="bg-[#F0F2F8] px-2 py-2.5 text-center font-bold text-brand-dark text-[11px]">{obraCant > 0 ? fmt(obraCant) : ''}</td>
                                        <td className="bg-[#F0F2F8] px-2 py-2.5 text-right font-bold text-brand-dark text-[11px] border-r-2 border-r-[#BBBBCC]">{obraTotal > 0 ? fmtMoney(obraTotal) : ''}</td>
                                    </React.Fragment>
                                );
                            })}
                            {visibleBodegas.map(b => {
                                const bodCant = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`bodega_${b.id}`]?.cantidad || 0), 0), 0);
                                return (
                                    <td key={`total_bod_${b.id}`} className="bg-[#F0F2F8] px-2 py-2.5 text-center font-bold text-brand-dark text-[11px] border-r-2 border-r-[#BBBBCC]">
                                        {bodCant > 0 ? fmt(bodCant) : ''}
                                    </td>
                                );
                            })}
                            <td className="bg-[#E6F0EA] px-2 py-2.5 text-right font-black text-xs text-brand-primary border-r-2 border-[#BBBBCC]">
                                {fmtMoney(grandTotals.totalArriendo)}
                            </td>
                            <td className="bg-[#E6F0EA] px-2 py-2.5 text-right font-black text-xs text-brand-dark">
                                {fmt(grandTotals.totalCantidad)}
                            </td>
                        </tr>
                        {grandTotals.totalDescuento > 0 && (
                            <>
                                <tr className="border-t border-[#D8D8DD]">
                                    <td colSpan={totalColSpan - 2} className="bg-[#FEF9EE] px-2 py-1.5 text-right font-bold text-[10px] text-muted-foreground border-r-2 border-[#BBBBCC]">
                                        DESCUENTOS APLICADOS
                                    </td>
                                    <td className="bg-[#FEF9EE] px-2 py-1.5 text-right font-bold text-[11px] text-red-600 border-r-2 border-[#BBBBCC]">
                                        -{fmtMoney(grandTotals.totalDescuento)}
                                    </td>
                                    <td className="bg-[#FEF9EE]" />
                                </tr>
                                <tr className="border-t-2 border-brand-primary/20">
                                    <td colSpan={totalColSpan - 2} className="bg-[#E6F0EA] px-2 py-2.5 text-right font-black text-xs text-brand-dark border-r-2 border-[#BBBBCC]">
                                        TOTAL CON DESCUENTOS
                                    </td>
                                    <td className="bg-[#E6F0EA] px-2 py-2.5 text-right font-black text-[13px] text-brand-primary border-r-2 border-[#BBBBCC]">
                                        {fmtMoney(grandTotals.totalConDescuento)}
                                    </td>
                                    <td className="bg-[#E6F0EA]" />
                                </tr>
                            </>
                        )}
                    </tfoot>
                </table>
            </div>

            {/* Search results hint (desktop) */}
            {searchLower && (
                <p className="hidden md:block text-[10px] text-muted-foreground shrink-0">
                    Mostrando {filteredCategorias.reduce((s, c) => s + c.items.length, 0)} ítems en {filteredCategorias.length} categorías
                </p>
            )}
            {/* Item Detail Modal */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </div>
    );
};

// Auditoría 3.9: memoizar componente completo para evitar re-renders cuando
// el padre (Inventario.tsx) re-renderea por estado no relacionado (tabs, modales).
export default React.memo(ResumenMensualTable);

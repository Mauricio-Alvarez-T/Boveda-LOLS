import React, { useState, useMemo, useCallback } from 'react';
import { cn } from '../../utils/cn';
import { ChevronRight, ChevronDown, Search, Package, Download, X, ImageIcon, Check, MapPin, Warehouse, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import { useInlineEdit } from '../../hooks/inventario/useInlineEdit';
import { useResumenMensualFilters } from '../../hooks/inventario/useResumenMensualFilters';
import { useAuth } from '../../context/AuthContext';
import ItemDetailModal from './ItemDetailModal';
import { ResumenToolbar } from './ResumenToolbar';
import { exportResumen } from '../../utils/exportExcel';
import { formatBodegaConResponsable } from '../../utils/formatBodega';
import { Button } from '../ui/Button';
import { IconButton } from '../ui/IconButton';

interface Props {
    data: ResumenData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

/**
 * Encabezado de columna de ubicación (obra/bodega) arrastrable para reordenar.
 * El "grip" es el único elemento que inicia el drag; el botón X (ocultar) y el
 * texto no interfieren. Durante el arrastre solo se mueve el encabezado; al
 * soltar, toda la columna se reordena (la tabla mapea el orden actualizado).
 */
const SortableColHeader: React.FC<{
    id: string;
    colSpan: number;
    bgClass: string;
    label: string;
    title: string;
    onHide: () => void;
}> = ({ id, colSpan, bgClass, label, title, onHide }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.85 : undefined,
        zIndex: isDragging ? 40 : undefined,
        position: isDragging ? 'relative' : undefined,
    };
    return (
        <th
            ref={setNodeRef}
            style={style}
            colSpan={colSpan}
            className={cn(
                "px-1 py-2 text-center font-bold text-brand-dark border-b border-r-2 border-border group/col",
                bgClass,
                isDragging && "ring-2 ring-brand-primary/40"
            )}
        >
            <div className="flex items-center justify-center gap-1">
                <IconButton
                    {...attributes}
                    {...listeners}
                    icon={<GripVertical className="h-3 w-3" />}
                    variant="ghost"
                    size="sm"
                    className="cursor-grab active:cursor-grabbing shrink-0 touch-none"
                    title="Arrastrar para reordenar"
                    aria-label={`Reordenar ${label}`}
                />
                <span className="truncate" title={title}>{label}</span>
                <IconButton
                    onClick={onHide}
                    icon={<X className="h-3 w-3" />}
                    variant="danger"
                    size="sm"
                    className="opacity-0 group-hover/col:opacity-100 transition-all shrink-0"
                    title={`Ocultar ${label}`}
                    aria-label={`Ocultar ${label}`}
                />
            </div>
        </th>
    );
};

const ResumenMensualTable: React.FC<Props> = ({ data, canEdit, onUpdateStock, onRefresh }) => {
    const { obras, bodegas, categorias } = data;

    // Gate financiero: si no tiene `inventario.resumen.ver_valores`, ocultar
    // todas las columnas/filas $ del Resumen Mensual.
    const { hasPermission } = useAuth();
    const verValores = hasPermission('inventario.resumen.ver_valores');

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
        orderedLocations,
        moveCol,
        restoreColOrder,
        isCustomOrder,
        filteredCategorias,
        searchLower
    } = filters;

    // ── Drag & drop de columnas de ubicación ──
    const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
    const locationKeys = useMemo(() => orderedLocations.map(l => l.key), [orderedLocations]);
    const handleColDragEnd = useCallback((e: DragEndEvent) => {
        const { active, over } = e;
        if (over && active.id !== over.id) moveCol(String(active.id), String(over.id));
    }, [moveCol]);

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
    // Auditoría 6.1: priorizar totales pre-calculados por el backend para que coincidan
    // exactamente con los KPIs del dashboard (donut + valor obras). El cálculo JS se
    // mantiene como fallback por si el backend omite `data.totales` (rol sin permiso de
    // ver_valores o respuesta antigua).
    const grandTotals = useMemo(() => {
        if (data.totales) {
            return {
                totalArriendo: data.totales.valor_bruto,
                totalCantidad: data.totales.total_cantidad,
                totalDescuento: data.totales.valor_descuento,
                totalConDescuento: data.totales.valor_neto,
            };
        }

        // Fallback (sin permisos de valores o respuesta sin totales)
        let totalArriendo = 0;
        let totalCantidad = 0;
        let totalDescuento = 0;
        for (const cat of categorias) {
            for (const item of cat.items) {
                totalArriendo += item.total_arriendo;
                totalCantidad += item.total_cantidad;
            }
        }
        obras.forEach(o => {
            const descPorcentaje = data.descuentos?.[o.id] || 0;
            if (descPorcentaje > 0) {
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
            totalConDescuento: totalArriendo - totalDescuento,
        };
    }, [categorias, obras, data.descuentos, data.totales]);



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
                        className="w-14 px-1 py-0.5 text-label border rounded text-center focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus min={0}
                    />
                    <IconButton onClick={() => desktopEdit.saveEdit(itemId, obraId, bodegaId)} icon={<Check className="h-3 w-3" />} variant="ghost" size="sm" aria-label="Guardar cantidad" />
                    <IconButton onClick={desktopEdit.cancelEdit} icon={<X className="h-3 w-3" />} variant="danger" size="sm" aria-label="Cancelar edición" />
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

    // colSpan dinámico: cuando se ocultan columnas $ el total cambia.
    //   verValores=true:  # + Img + Desc + M² + V.Arriendo + V.Compra + (Cant+Total)*obras + Cant*bodegas + Total Arriendo + Total Unid
    //   verValores=false: # + Img + Desc + M²                          + Cant*obras         + Cant*bodegas                  + Total Unid
    const obraColCount = orderedLocations.filter(l => l.type === 'obra').length;
    const bodegaColCount = orderedLocations.filter(l => l.type === 'bodega').length;
    const totalColSpan = verValores
        ? 6 + obraColCount * 2 + bodegaColCount + 2
        : 4 + obraColCount + bodegaColCount + 1;
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
                        className="w-full pl-10 pr-10 py-3 text-sm border border-border rounded-2xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none"
                    />
                    {search && (
                        <IconButton
                            onClick={() => setSearch('')}
                            icon={<X className="h-3.5 w-3.5" />}
                            variant="ghost"
                            size="sm"
                            className="absolute right-3 top-1/2 -translate-y-1/2"
                            aria-label="Limpiar búsqueda"
                        />
                    )}
                </div>

                {/* Mobile Category Filter */}
                <div className="shrink-0 flex items-center bg-card border border-border rounded-2xl overflow-hidden pr-3">
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

                {/* Mobile: card verde + lista en un único scroll para que el card se
                    desplace hacia arriba al bajar y libere pantalla para los productos. */}
                <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                    {/* Grand Totals — card compacto.
                        En mobile (<sm) los valores se apilan en una columna con valor + label
                        inline para reducir altura. Gate financiero: si no verValores, mostrar
                        sólo el conteo de unidades y items (sin montos $). */}
                    <div className="bg-card border border-border rounded-2xl p-3 text-foreground">
                        <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground mb-1.5">Resumen General</p>
                        <div className={cn(
                            "grid",
                            verValores ? "grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-3" : "grid-cols-2 gap-3"
                        )}>
                            <div className="flex items-baseline gap-2 sm:block">
                                <p className="text-base sm:text-lg font-black">{fmt(grandTotals.totalCantidad)}</p>
                                <p className="text-caption text-muted-foreground">Unidades</p>
                            </div>
                            {verValores && (
                                <div className="flex items-baseline gap-2 sm:block">
                                    <p className="text-base sm:text-lg font-black">{fmtMoney(grandTotals.totalArriendo)}</p>
                                    <p className="text-caption text-muted-foreground">Arriendo</p>
                                </div>
                            )}
                            {verValores && grandTotals.totalDescuento > 0 ? (
                                <div className="flex items-baseline flex-wrap gap-x-2 sm:block">
                                    <p className="text-base sm:text-lg font-black">{fmtMoney(grandTotals.totalConDescuento)}</p>
                                    <p className="text-caption text-muted-foreground">
                                        Con Descuento
                                        <span className="ml-1.5 line-through opacity-70">{fmtMoney(grandTotals.totalArriendo)}</span>
                                    </p>
                                </div>
                            ) : (
                                <div className="flex items-baseline gap-2 sm:block">
                                    <p className="text-base sm:text-lg font-black">{filteredCategorias.reduce((s, c) => s + c.items.length, 0)}</p>
                                    <p className="text-caption text-muted-foreground">Items</p>
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={() => exportResumen(data)}
                            variant="secondary"
                            size="sm"
                            leftIcon={<Download className="h-3.5 w-3.5" />}
                            className="mt-2.5 w-full text-xs font-bold"
                        >
                            Exportar a Excel
                        </Button>
                    </div>

                    {/* Mobile Categories & Items */}
                    {filteredCategorias.map(cat => {
                        const collapsed = collapsedCats.has(cat.id);
                        const totals = catTotals[cat.id];
                        return (
                            <div key={cat.id} className="rounded-2xl border border-border overflow-hidden bg-card">
                                {/* Category Header */}
                                {/* eslint-disable-next-line no-restricted-syntax -- disclosure */}
                                <button
                                    onClick={() => toggleCat(cat.id)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-muted active:bg-muted/80 transition-colors"
                                >
                                    <div className="flex items-center gap-2">
                                        <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", !collapsed && "rotate-90")} />
                                        <span className="font-black text-xs uppercase tracking-wider text-foreground">{cat.nombre}</span>
                                    </div>
                                    <div className="flex items-center gap-3 text-caption text-muted-foreground">
                                        <span className="font-bold">{totals?.count} items</span>
                                        <span className="font-bold text-brand-dark">{fmt(totals?.totalCantidad || 0)} u.</span>
                                    </div>
                                </button>

                                {/* Items List */}
                                {!collapsed && (
                                    <div className="divide-y divide-border">
                                        {cat.items.map((item, idx) => {
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
                                                    {/* eslint-disable-next-line no-restricted-syntax -- disclosure */}
                                                    <button
                                                        onClick={() => setMobileExpandedItem(isExpanded ? null : item.id)}
                                                        className="w-full flex items-center gap-3 px-4 py-3 active:bg-blue-50/50 dark:active:bg-blue-950/30 transition-colors text-left"
                                                    >
                                                        {/* Image or number */}
                                                        <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden">
                                                            {item.imagen_url ? (
                                                                <img src={`${API_BASE}${item.imagen_url}`} alt="" className="w-full h-full object-cover" />
                                                            ) : (
                                                                <span className="text-caption font-bold text-muted-foreground">#{idx + 1}</span>
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
                                                                    <span className="text-caption text-muted-foreground">
                                                                        {totalLocs} ubicacion{totalLocs !== 1 ? 'es' : ''}
                                                                    </span>
                                                                )}
                                                                {verValores && item.valor_arriendo > 0 && (
                                                                    <span className="text-caption text-muted-foreground">
                                                                        {fmtMoney(item.valor_arriendo)}/mes
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {/* Right side: totals + chevron */}
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <div className="text-right">
                                                                <p className="text-sm font-black text-brand-dark">{fmt(item.total_cantidad)}</p>
                                                                {verValores && item.total_arriendo > 0 && (
                                                                    <p className="text-caption font-semibold text-foreground">{fmtMoney(item.total_arriendo)}</p>
                                                                )}
                                                            </div>
                                                            <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 transition-transform duration-200", isExpanded && "rotate-180")} />
                                                        </div>
                                                    </button>

                                                    {/* Expanded Detail — stock per location */}
                                                    {isExpanded && (
                                                        <div className="px-4 pb-4 pt-1 bg-muted">
                                                            {/* Obras */}
                                                            {obras.map(o => {
                                                                const ub = item.ubicaciones[`obra_${o.id}`];
                                                                const qty = ub?.cantidad || 0;
                                                                const total = ub?.total || 0;
                                                                const cellKey = `m_obra_${o.id}_item_${item.id}`;
                                                                if (!ub && qty === 0 && !canEdit) return null;
                                                                return (
                                                                    <div key={o.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <div className="w-6 h-6 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 flex items-center justify-center shrink-0">
                                                                                <MapPin className="h-3 w-3 text-blue-600 dark:text-blue-300" />
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
                                                                                    <IconButton onClick={() => mobileEdit.saveEdit(item.id, o.id, null)} icon={<Check className="h-3.5 w-3.5" />} variant="ghost" size="sm" aria-label="Guardar cantidad" />
                                                                                    <IconButton onClick={mobileEdit.cancelEdit} icon={<X className="h-3.5 w-3.5" />} variant="danger" size="sm" aria-label="Cancelar edición" />
                                                                                </div>
                                                                            ) : (
                                                                                // eslint-disable-next-line no-restricted-syntax -- control de cantidad
                                                                                <button
                                                                                    onClick={() => canEdit && mobileEdit.startEdit(cellKey, qty)}
                                                                                    className={cn(
                                                                                        "min-w-[3rem] px-3 py-1.5 rounded-xl text-xs font-bold text-center",
                                                                                        qty > 0 ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900" : "bg-muted text-muted-foreground border border-border",
                                                                                        canEdit && "active:scale-95 transition-transform"
                                                                                    )}
                                                                                >
                                                                                    {qty}
                                                                                </button>
                                                                            )}
                                                                            {verValores && total > 0 && mobileEdit.editingCell !== cellKey && (
                                                                                <span className="text-caption font-semibold text-foreground w-20 text-right">{fmtMoney(total)}</span>
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
                                                                    <div key={b.id} className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
                                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                            <div className="w-6 h-6 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 flex items-center justify-center shrink-0">
                                                                                <Warehouse className="h-3 w-3 text-amber-600 dark:text-amber-300" />
                                                                            </div>
                                                                            <span className="text-xs font-medium text-brand-dark truncate" title={formatBodegaConResponsable(b)}>{formatBodegaConResponsable(b)}</span>
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
                                                                                    <IconButton onClick={() => mobileEdit.saveEdit(item.id, null, b.id)} icon={<Check className="h-3.5 w-3.5" />} variant="ghost" size="sm" aria-label="Guardar cantidad" />
                                                                                    <IconButton onClick={mobileEdit.cancelEdit} icon={<X className="h-3.5 w-3.5" />} variant="danger" size="sm" aria-label="Cancelar edición" />
                                                                                </div>
                                                                            ) : (
                                                                                // eslint-disable-next-line no-restricted-syntax -- control de cantidad
                                                                                <button
                                                                                    onClick={() => canEdit && mobileEdit.startEdit(cellKey, qty)}
                                                                                    className={cn(
                                                                                        "min-w-[3rem] px-3 py-1.5 rounded-xl text-xs font-bold text-center",
                                                                                        qty > 0 ? "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900" : "bg-muted text-muted-foreground border border-border",
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
                isCustomOrder={isCustomOrder}
                restoreColOrder={restoreColOrder}
                canCreate={canEdit}
                onRefresh={onRefresh}
            />

            {/* ── Table — fills remaining space, scrolls both axes ──
                Columnas de ubicación reordenables por drag & drop (encabezados). */}
            <div className="hidden md:block overflow-auto flex-1 min-h-0 rounded-xl border border-border">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleColDragEnd}>
                <SortableContext items={locationKeys} strategy={horizontalListSortingStrategy}>
                <table className="w-full text-label border-collapse">
                    <thead className="sticky top-0 z-20">
                        {/* Header row 1 — solid backgrounds for sticky */}
                        <tr>
                            <th className="sticky left-0 z-30 bg-brand-primary px-2 py-2 text-left font-bold text-white border-b border-r border-border w-8">#</th>
                            <th
                                onClick={() => setShowImages(v => !v)}
                                className="bg-brand-primary px-1.5 py-2 text-center font-bold text-white border-b border-r border-border w-8 cursor-pointer hover:bg-brand-primary/90 transition-colors"
                                title={showImages ? 'Ocultar imágenes' : 'Mostrar imágenes'}
                            >
                                <ImageIcon className={cn("h-3.5 w-3.5 mx-auto transition-colors", showImages ? "text-white" : "text-white/50")} />
                            </th>
                            <th className={cn("sticky z-30 bg-brand-primary px-2 py-2 text-left font-bold text-white border-b border-r border-border min-w-[220px] max-w-[320px]", showImages ? "left-[68px]" : "left-8")}>Descripción</th>
                            <th className="bg-brand-primary px-2 py-2 text-center font-bold text-white border-b border-r border-border w-12">M²</th>
                            {verValores && (
                                <th className="bg-brand-primary px-2 py-2 text-right font-bold text-white border-b border-r border-border w-16">V. Arriendo</th>
                            )}
                            {verValores && (
                                <th className="bg-brand-primary px-2 py-2 text-right font-bold text-white border-b border-r border-border w-16">V. Compra</th>
                            )}
                            {orderedLocations.map(loc => {
                                const label = loc.type === 'bodega' ? formatBodegaConResponsable(loc.raw) : loc.nombre;
                                return (
                                    <SortableColHeader
                                        key={loc.key}
                                        id={loc.key}
                                        colSpan={loc.type === 'obra' ? (verValores ? 2 : 1) : 1}
                                        bgClass={loc.type === 'obra' ? "bg-blue-50 dark:bg-blue-950" : "bg-amber-50 dark:bg-amber-950"}
                                        label={label}
                                        title={label}
                                        onHide={() => toggleCol(loc.key)}
                                    />
                                );
                            })}
                            {verValores && (
                                <th className="bg-brand-primary px-2 py-2 text-right font-bold text-white border-b border-r border-border">Total Arriendo</th>
                            )}
                            <th className="bg-brand-primary px-2 py-2 text-right font-bold text-white border-b border-border">Total Unid.</th>
                        </tr>
                        {/* Header row 2 — sub-headers with solid bg */}
                        <tr>
                            <th className="sticky left-0 z-30 bg-muted border-b border-r border-border" />
                            <th className="bg-muted border-b border-r border-border" />
                            <th className={cn("sticky z-30 bg-muted border-b border-r border-border", showImages ? "left-[68px]" : "left-8")} />
                            <th className="bg-muted border-b border-r border-border" />
                            {verValores && <th className="bg-muted border-b border-r border-border" />}
                            {verValores && <th className="bg-muted border-b border-r border-border" />}
                            {orderedLocations.map(loc => (
                                loc.type === 'obra' ? (
                                    <React.Fragment key={`sub_${loc.key}`}>
                                        <th className="px-1 py-1 text-center text-micro text-muted-foreground font-semibold border-b border-r border-border uppercase tracking-wider bg-blue-50 dark:bg-blue-950">Cant</th>
                                        {verValores && (
                                            <th className="px-1 py-1 text-center text-micro text-muted-foreground font-semibold border-b border-r-2 border-border uppercase tracking-wider bg-blue-50 dark:bg-blue-950">Total</th>
                                        )}
                                    </React.Fragment>
                                ) : (
                                    <th key={`sub_${loc.key}`} className="px-1 py-1 text-center text-micro text-muted-foreground font-semibold border-b border-r-2 border-border uppercase tracking-wider bg-amber-50 dark:bg-amber-950">Cant</th>
                                )
                            ))}
                            {verValores && <th className="bg-muted border-b border-r border-border" />}
                            <th className="bg-muted border-b border-border" />
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
                                        className="bg-muted cursor-pointer select-none hover:bg-muted/80 transition-colors"
                                        onClick={() => toggleCat(cat.id)}
                                    >
                                        <td colSpan={totalColSpan} className="px-0 py-0">
                                            <div className="sticky left-0 w-fit px-3 py-2 flex items-center gap-2">
                                                <ChevronRight className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform duration-200", !collapsed && "rotate-90")} />
                                                <span className="font-black text-caption uppercase tracking-widest text-foreground">
                                                    {cat.nombre}
                                                </span>
                                                {totals && (
                                                    <span className="ml-2 text-caption font-medium text-muted-foreground">
                                                        {totals.count} ítems · {fmt(totals.totalCantidad)} unid.
                                                        {verValores && ` · ${fmtMoney(totals.totalArriendo)}`}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Item rows — hidden when collapsed */}
                                    {!collapsed && cat.items.map((item, idx) => {
                                        const rowBg = idx % 2 === 0 ? 'bg-card' : 'bg-muted';
                                        return (
                                        <tr key={item.id} className={cn("hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors", rowBg)}>
                                            <td className={cn("sticky left-0 z-10 px-2 py-1.5 text-right text-muted-foreground border-r border-b border-border", rowBg)}>{idx + 1}</td>
                                            <td className={cn("px-1 py-1.5 text-center border-r border-b border-border", rowBg)}>
                                                {showImages && (
                                                    item.imagen_url
                                                        ? <img src={`${API_BASE}${item.imagen_url}`} alt="" className="w-8 h-8 object-cover rounded mx-auto" />
                                                        : <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center mx-auto"><ImageIcon className="h-3 w-3 text-muted-foreground/30" /></div>
                                                )}
                                            </td>
                                            <td className={cn("sticky z-10 px-2 py-1.5 font-medium text-brand-dark border-r border-b border-border align-top min-w-[220px] max-w-[320px] whitespace-normal break-words", rowBg, showImages ? "left-[68px]" : "left-8")}>
                                                {/* eslint-disable-next-line no-restricted-syntax -- enlace de descripción en celda de tabla (texto neutro clicable, no CTA) */}
                                                <button
                                                    type="button"
                                                    title={item.descripcion}
                                                    onClick={() => itemDetail.openItem(item.id, item)}
                                                    className="text-left whitespace-normal break-words text-brand-dark hover:underline hover:text-brand-primary transition-colors"
                                                >
                                                    {item.descripcion}
                                                </button>
                                            </td>
                                            <td className={cn("px-2 py-1.5 text-center text-muted-foreground border-r border-b border-border", !verValores && "border-r-2")}>{item.m2 ? item.m2.toFixed(2) : ''}</td>
                                            {verValores && (
                                                <td className={cn("px-2 py-1.5 text-right text-muted-foreground border-r border-b border-border")}>{fmtMoney(item.valor_arriendo)}</td>
                                            )}
                                            {verValores && (
                                                <td className={cn("px-2 py-1.5 text-right text-muted-foreground border-r-2 border-b border-border")}>{item.valor_compra > 0 ? fmtMoney(item.valor_compra) : ''}</td>
                                            )}
                                            {orderedLocations.map((loc, locIdx) => {
                                                const ub = item.ubicaciones[loc.key];
                                                const cellKey = `${loc.key}_item_${item.id}`;
                                                if (loc.type === 'obra') {
                                                    const colBg = locIdx % 2 === 1 ? 'bg-blue-50/30 dark:bg-blue-950/20' : '';
                                                    return (
                                                        <React.Fragment key={cellKey}>
                                                            <td className={cn("px-2 py-1.5 text-center border-r border-b border-border", colBg)}>
                                                                {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, loc.id, null, !!(ub && ub.cantidad > 0))}
                                                            </td>
                                                            {verValores && (
                                                                <td className={cn("px-2 py-1.5 text-right border-r-2 border-b border-border", colBg, ub && ub.total > 0 ? "text-brand-dark" : "text-muted-foreground/40")}>
                                                                    {ub && ub.total > 0 ? fmtMoney(ub.total) : ''}
                                                                </td>
                                                            )}
                                                        </React.Fragment>
                                                    );
                                                }
                                                const colBg = locIdx % 2 === 1 ? 'bg-amber-50/30 dark:bg-amber-950/20' : '';
                                                return (
                                                    <td key={cellKey} className={cn("px-2 py-1.5 text-center border-r-2 border-b border-border", colBg)}>
                                                        {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, null, loc.id, !!(ub && ub.cantidad > 0))}
                                                    </td>
                                                );
                                            })}
                                            {verValores && (
                                                <td className="px-2 py-1.5 text-right font-semibold text-foreground border-r border-b border-border">
                                                    {item.total_arriendo > 0 ? fmtMoney(item.total_arriendo) : ''}
                                                </td>
                                            )}
                                            <td className="px-2 py-1.5 text-right font-semibold text-brand-dark border-b border-border">
                                                {item.total_cantidad > 0 ? fmt(item.total_cantidad) : ''}
                                            </td>
                                        </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    {/* ── Sticky totals footer — solid bg, clear labels ──
                        Sin permiso `inventario.resumen.ver_valores` se renderiza una versión
                        reducida sólo con conteos de unidades, sin montos $. */}
                    <tfoot className="sticky bottom-0 z-10">
                        <tr className="border-t-2 border-brand-primary/30">
                            <td colSpan={verValores ? 6 : 4} className="bg-muted px-2 py-2.5 text-right font-black text-xs text-brand-dark">
                                TOTAL GENERAL
                            </td>
                            {orderedLocations.map(loc => {
                                const locCant = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[loc.key]?.cantidad || 0), 0), 0);
                                if (loc.type === 'obra') {
                                    const obraTotal = categorias.reduce((sum, cat) =>
                                        sum + cat.items.reduce((s, item) => s + (item.ubicaciones[loc.key]?.total || 0), 0), 0);
                                    return (
                                        <React.Fragment key={`total_${loc.key}`}>
                                            <td className="bg-muted px-2 py-2.5 text-center font-bold text-brand-dark text-label">{locCant > 0 ? fmt(locCant) : ''}</td>
                                            {verValores && (
                                                <td className="bg-muted px-2 py-2.5 text-right font-bold text-brand-dark text-label border-r-2 border-border">{obraTotal > 0 ? fmtMoney(obraTotal) : ''}</td>
                                            )}
                                        </React.Fragment>
                                    );
                                }
                                return (
                                    <td key={`total_${loc.key}`} className="bg-muted px-2 py-2.5 text-center font-bold text-brand-dark text-label border-r-2 border-border">
                                        {locCant > 0 ? fmt(locCant) : ''}
                                    </td>
                                );
                            })}
                            {verValores && (
                                <td className="bg-muted px-2 py-2.5 text-right font-black text-xs text-foreground border-r-2 border-border">
                                    {fmtMoney(grandTotals.totalArriendo)}
                                </td>
                            )}
                            <td className="bg-muted px-2 py-2.5 text-right font-black text-xs text-foreground">
                                {fmt(grandTotals.totalCantidad)}
                            </td>
                        </tr>
                        {verValores && grandTotals.totalDescuento > 0 && (
                            <>
                                {/* ── Descuento por obra: muestra el monto individual en cada columna TOTAL ── */}
                                <tr className="border-t border-border/50">
                                    <td colSpan={verValores ? 6 : 4} className="bg-amber-100 dark:bg-amber-950 px-2 py-1.5 text-right font-bold text-caption text-muted-foreground">
                                        DESCUENTO POR OBRA
                                    </td>
                                    {orderedLocations.map(loc => {
                                        if (loc.type === 'bodega') {
                                            return <td key={`desc_${loc.key}`} className="bg-amber-100 dark:bg-amber-950 border-r-2 border-border" />;
                                        }
                                        const obraTotal = categorias.reduce((sum, cat) =>
                                            sum + cat.items.reduce((s, item) => s + (item.ubicaciones[loc.key]?.total || 0), 0), 0
                                        );
                                        const descPorcentaje = data.descuentos?.[loc.id] || 0;
                                        const obraDescuento = descPorcentaje > 0 ? Math.round(obraTotal * descPorcentaje) / 100 : 0;
                                        return (
                                            <React.Fragment key={`desc_${loc.key}`}>
                                                <td className="bg-amber-100 dark:bg-amber-950 px-2 py-1.5" />
                                                <td className="bg-amber-100 dark:bg-amber-950 px-2 py-1.5 text-right font-bold text-caption text-red-700 dark:text-red-300 border-r-2 border-border">
                                                    {obraDescuento > 0 ? `-${fmtMoney(obraDescuento)}` : ''}
                                                </td>
                                            </React.Fragment>
                                        );
                                    })}
                                    <td className="bg-amber-100 dark:bg-amber-950 px-2 py-1.5 text-right font-bold text-label text-red-700 dark:text-red-300 border-r-2 border-border">
                                        -{fmtMoney(grandTotals.totalDescuento)}
                                    </td>
                                    <td className="bg-amber-100 dark:bg-amber-950" />
                                </tr>
                                <tr className="border-t-2 border-brand-primary/20">
                                    <td colSpan={totalColSpan - 2} className="bg-muted px-2 py-2.5 text-right font-black text-xs text-brand-dark border-r-2 border-border">
                                        TOTAL CON DESCUENTOS
                                    </td>
                                    <td className="bg-muted px-2 py-2.5 text-right font-black text-section text-foreground border-r-2 border-border">
                                        {fmtMoney(grandTotals.totalConDescuento)}
                                    </td>
                                    <td className="bg-muted" />
                                </tr>
                            </>
                        )}
                    </tfoot>
                </table>
                </SortableContext>
              </DndContext>
            </div>

            {/* Search results hint (desktop) */}
            {searchLower && (
                <p className="hidden md:block text-caption text-muted-foreground shrink-0">
                    Mostrando {filteredCategorias.reduce((s, c) => s + c.items.length, 0)} ítems en {filteredCategorias.length} categorías
                </p>
            )}
            {/* Item Detail Modal — editable para perfiles con permiso (inventario.editar) */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
                canEdit={canEdit}
                onSaved={(patch) => { itemDetail.applyItemUpdate(patch); onRefresh(); }}
            />
        </div>
    );
};

// Auditoría 3.9: memoizar componente completo para evitar re-renders cuando
// el padre (Inventario.tsx) re-renderea por estado no relacionado (tabs, modales).
export default React.memo(ResumenMensualTable);

import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { Check, X, ChevronRight, Search, EyeOff, Eye, RotateCcw, ImageIcon } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';

interface Props {
    data: ResumenData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;
const API_BASE = import.meta.env.VITE_API_URL || '';

const STORAGE_KEY = 'inventario_resumen_hidden_cols';

function loadHiddenCols(): Set<string> {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
}

function saveHiddenCols(set: Set<string>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
}

const ResumenMensualTable: React.FC<Props> = ({ data, canEdit, onUpdateStock, onRefresh }) => {
    const { obras, bodegas, categorias } = data;

    // ── State ──
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const [collapsedCats, setCollapsedCats] = useState<Set<number>>(new Set());
    const [hiddenCols, setHiddenCols] = useState<Set<string>>(loadHiddenCols);
    const [hideEmpty, setHideEmpty] = useState(false);
    const [search, setSearch] = useState('');
    const [showImages, setShowImages] = useState(false);

    // Persist hidden cols
    useEffect(() => { saveHiddenCols(hiddenCols); }, [hiddenCols]);

    // ── Derived: which columns have any stock ──
    const colsWithStock = useMemo(() => {
        const set = new Set<string>();
        for (const cat of categorias) {
            for (const item of cat.items) {
                for (const [key, ub] of Object.entries(item.ubicaciones)) {
                    if (ub && ub.cantidad > 0) set.add(key);
                }
            }
        }
        return set;
    }, [categorias]);

    // ── Derived: visible obras/bodegas ──
    const visibleObras = useMemo(() =>
        obras.filter(o => {
            const key = `obra_${o.id}`;
            if (hiddenCols.has(key)) return false;
            if (hideEmpty && !colsWithStock.has(key)) return false;
            return true;
        }),
    [obras, hiddenCols, hideEmpty, colsWithStock]);

    const visibleBodegas = useMemo(() =>
        bodegas.filter(b => {
            const key = `bodega_${b.id}`;
            if (hiddenCols.has(key)) return false;
            if (hideEmpty && !colsWithStock.has(key)) return false;
            return true;
        }),
    [bodegas, hiddenCols, hideEmpty, colsWithStock]);

    // ── Derived: filtered categories by search ──
    const searchLower = search.toLowerCase().trim();
    const filteredCategorias = useMemo(() => {
        if (!searchLower) return categorias;
        return categorias
            .map(cat => ({
                ...cat,
                items: cat.items.filter(item =>
                    item.descripcion.toLowerCase().includes(searchLower) ||
                    String(item.nro_item).includes(searchLower)
                )
            }))
            .filter(cat => cat.items.length > 0);
    }, [categorias, searchLower]);

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
        for (const cat of categorias) {
            for (const item of cat.items) {
                totalArriendo += item.total_arriendo;
                totalCantidad += item.total_cantidad;
            }
        }
        return { totalArriendo, totalCantidad };
    }, [categorias]);

    // ── Toggle helpers ──
    const toggleCat = (catId: number) => {
        setCollapsedCats(prev => {
            const next = new Set(prev);
            next.has(catId) ? next.delete(catId) : next.add(catId);
            return next;
        });
    };

    const toggleCol = (key: string) => {
        setHiddenCols(prev => {
            const next = new Set(prev);
            next.has(key) ? next.delete(key) : next.add(key);
            return next;
        });
    };

    // ── Inline editing ──
    const startEdit = (key: string, currentValue: number) => {
        if (!canEdit) return;
        setEditingCell(key);
        setEditValue(String(currentValue || ''));
    };

    const cancelEdit = () => { setEditingCell(null); setEditValue(''); };

    const saveEdit = async (itemId: number, obraId: number | null, bodegaId: number | null) => {
        const num = parseInt(editValue, 10);
        if (isNaN(num) || num < 0) { cancelEdit(); return; }
        const ok = await onUpdateStock(itemId, obraId, bodegaId, { cantidad: num });
        if (ok) onRefresh();
        cancelEdit();
    };

    const renderEditableQty = (
        cellKey: string, cantidad: number,
        itemId: number, obraId: number | null, bodegaId: number | null,
        hasValue: boolean
    ) => {
        if (editingCell === cellKey) {
            return (
                <div className="flex items-center justify-center gap-0.5">
                    <input
                        type="number" value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') saveEdit(itemId, obraId, bodegaId);
                            if (e.key === 'Escape') cancelEdit();
                        }}
                        className="w-14 px-1 py-0.5 text-[11px] border rounded text-center focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus min={0}
                    />
                    <button onClick={() => saveEdit(itemId, obraId, bodegaId)} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded"><Check className="h-3 w-3" /></button>
                    <button onClick={cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><X className="h-3 w-3" /></button>
                </div>
            );
        }
        return (
            <span
                onClick={() => startEdit(cellKey, cantidad)}
                className={cn(
                    hasValue ? "font-semibold text-brand-dark" : "text-muted-foreground/40",
                    canEdit && "cursor-pointer hover:bg-brand-primary/10 hover:ring-1 hover:ring-brand-primary/30 rounded px-1 py-0.5 transition-all"
                )}
                title={canEdit ? 'Click para editar' : undefined}
            >
                {hasValue ? cantidad : ''}
            </span>
        );
    };

    const totalColSpan = 3 + (showImages ? 1 : 0) + visibleObras.length * 2 + visibleBodegas.length + 2;

    const hiddenCount = hiddenCols.size;

    return (
        <div className="space-y-3">
            {/* ── Toolbar ── */}
            <div className="flex flex-wrap items-center gap-2">
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
                        onClick={() => { setHiddenCols(new Set()); saveHiddenCols(new Set()); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-xl border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Mostrar {hiddenCount} oculta{hiddenCount > 1 ? 's' : ''}
                    </button>
                )}
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto rounded-xl border border-[#E8E8ED]">
                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        {/* Header row 1 */}
                        <tr className="bg-brand-primary/5">
                            <th className="sticky left-0 bg-white z-20 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8">#</th>
                            <th
                                onClick={() => setShowImages(v => !v)}
                                className="px-1.5 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8 cursor-pointer hover:bg-brand-primary/10 transition-colors"
                                title={showImages ? 'Ocultar imágenes' : 'Mostrar imágenes'}
                            >
                                <ImageIcon className={cn("h-3.5 w-3.5 mx-auto transition-colors", showImages ? "text-brand-primary" : "text-muted-foreground/40")} />
                            </th>
                            <th className={cn("sticky bg-white z-20 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] min-w-[180px]", showImages ? "left-[68px]" : "left-8")}>Descripción</th>
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-16">V. Arriendo</th>
                            {visibleObras.map(o => (
                                <th key={`obra_${o.id}`} colSpan={2} className="px-1 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-blue-50/50 group/col">
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
                            {visibleBodegas.map(b => (
                                <th key={`bodega_${b.id}`} className="px-1 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-amber-50/50 group/col">
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
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-green-50/50">Total Arriendo</th>
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] bg-green-50/50">Total Unid.</th>
                        </tr>
                        {/* Header row 2 */}
                        <tr className="bg-[#F9F9FB]">
                            <th className="sticky left-0 bg-[#F9F9FB] z-20 border-b border-r border-[#E8E8ED]" />
                            <th className="bg-[#F9F9FB] border-b border-r border-[#E8E8ED]" />
                            <th className={cn("sticky bg-[#F9F9FB] z-20 border-b border-r border-[#E8E8ED]", showImages ? "left-[68px]" : "left-8")} />
                            <th className="border-b border-r border-[#E8E8ED]" />
                            {visibleObras.map(o => (
                                <React.Fragment key={`sub_obra_${o.id}`}>
                                    <th className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Cant</th>
                                    <th className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Total</th>
                                </React.Fragment>
                            ))}
                            {visibleBodegas.map(b => (
                                <th key={`sub_bod_${b.id}`} className="px-1 py-1 text-center text-[9px] text-muted-foreground font-semibold border-b border-r border-[#E8E8ED] uppercase tracking-wider">Cant</th>
                            ))}
                            <th className="border-b border-r border-[#E8E8ED]" />
                            <th className="border-b border-[#E8E8ED]" />
                        </tr>
                    </thead>
                    <tbody>
                        {filteredCategorias.map(cat => {
                            const collapsed = collapsedCats.has(cat.id);
                            const totals = catTotals[cat.id];
                            return (
                                <React.Fragment key={cat.id}>
                                    {/* Category header — clickable */}
                                    <tr
                                        className="bg-brand-primary/10 cursor-pointer select-none hover:bg-brand-primary/15 transition-colors"
                                        onClick={() => toggleCat(cat.id)}
                                    >
                                        <td colSpan={totalColSpan} className="px-3 py-2">
                                            <div className="flex items-center gap-2">
                                                <ChevronRight className={cn("h-3.5 w-3.5 text-brand-primary transition-transform duration-200", !collapsed && "rotate-90")} />
                                                <span className="font-black text-[10px] uppercase tracking-widest text-brand-primary">
                                                    {cat.nombre}
                                                </span>
                                                {collapsed && totals && (
                                                    <span className="ml-2 text-[10px] font-medium text-muted-foreground">
                                                        {totals.count} ítems · {fmt(totals.totalCantidad)} unid. · {fmtMoney(totals.totalArriendo)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                    {/* Item rows — hidden when collapsed */}
                                    {!collapsed && cat.items.map((item, idx) => (
                                        <tr key={item.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-white" : "bg-[#FAFAFA]")}>
                                            <td className="sticky left-0 bg-inherit z-10 px-2 py-1 text-right text-muted-foreground border-r border-[#F0F0F5]">{item.nro_item}</td>
                                            <td className="bg-inherit px-1 py-1 text-center border-r border-[#F0F0F5]">
                                                {showImages && (
                                                    item.imagen_url
                                                        ? <img src={`${API_BASE}${item.imagen_url}`} alt="" className="w-8 h-8 object-cover rounded mx-auto" />
                                                        : <div className="w-8 h-8 rounded bg-muted/30 flex items-center justify-center mx-auto"><ImageIcon className="h-3 w-3 text-muted-foreground/30" /></div>
                                                )}
                                            </td>
                                            <td className={cn("sticky bg-inherit z-10 px-2 py-1 font-medium text-brand-dark border-r border-[#F0F0F5] truncate max-w-[200px]", showImages ? "left-[68px]" : "left-8")}>{item.descripcion}</td>
                                            <td className="px-2 py-1 text-right text-muted-foreground border-r border-[#F0F0F5]">{fmtMoney(item.valor_arriendo)}</td>
                                            {visibleObras.map(o => {
                                                const ub = item.ubicaciones[`obra_${o.id}`];
                                                const cellKey = `obra_${o.id}_item_${item.id}`;
                                                return (
                                                    <React.Fragment key={cellKey}>
                                                        <td className="px-2 py-1 text-center border-r border-[#F0F0F5]">
                                                            {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, o.id, null, !!(ub && ub.cantidad > 0))}
                                                        </td>
                                                        <td className={cn("px-2 py-1 text-right border-r border-[#F0F0F5]", ub && ub.total > 0 ? "text-brand-dark" : "text-muted-foreground/40")}>
                                                            {ub && ub.total > 0 ? fmtMoney(ub.total) : ''}
                                                        </td>
                                                    </React.Fragment>
                                                );
                                            })}
                                            {visibleBodegas.map(b => {
                                                const ub = item.ubicaciones[`bodega_${b.id}`];
                                                const cellKey = `bodega_${b.id}_item_${item.id}`;
                                                return (
                                                    <td key={cellKey} className="px-2 py-1 text-center border-r border-[#F0F0F5]">
                                                        {renderEditableQty(cellKey, ub?.cantidad || 0, item.id, null, b.id, !!(ub && ub.cantidad > 0))}
                                                    </td>
                                                );
                                            })}
                                            <td className="px-2 py-1 text-right font-semibold text-brand-accent border-r border-[#F0F0F5]">
                                                {item.total_arriendo > 0 ? fmtMoney(item.total_arriendo) : ''}
                                            </td>
                                            <td className="px-2 py-1 text-right font-semibold text-brand-dark">
                                                {item.total_cantidad > 0 ? fmt(item.total_cantidad) : ''}
                                            </td>
                                        </tr>
                                    ))}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    {/* ── Sticky totals footer ── */}
                    <tfoot className="sticky bottom-0 z-10">
                        <tr className="bg-brand-primary/5 border-t-2 border-brand-primary/30">
                            <td colSpan={showImages ? 4 : 3} className="px-2 py-2 text-right font-black text-xs text-brand-dark">
                                TOTAL GENERAL
                            </td>
                            {visibleObras.map(o => {
                                const obraTotal = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.total || 0), 0), 0);
                                const obraCant = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`obra_${o.id}`]?.cantidad || 0), 0), 0);
                                return (
                                    <React.Fragment key={`total_obra_${o.id}`}>
                                        <td className="px-2 py-2 text-center font-bold text-brand-dark text-[10px]">{obraCant > 0 ? fmt(obraCant) : ''}</td>
                                        <td className="px-2 py-2 text-right font-bold text-brand-dark text-[10px]">{obraTotal > 0 ? fmtMoney(obraTotal) : ''}</td>
                                    </React.Fragment>
                                );
                            })}
                            {visibleBodegas.map(b => {
                                const bodCant = categorias.reduce((sum, cat) =>
                                    sum + cat.items.reduce((s, item) => s + (item.ubicaciones[`bodega_${b.id}`]?.cantidad || 0), 0), 0);
                                return (
                                    <td key={`total_bod_${b.id}`} className="px-2 py-2 text-center font-bold text-brand-dark text-[10px]">
                                        {bodCant > 0 ? fmt(bodCant) : ''}
                                    </td>
                                );
                            })}
                            <td className="px-2 py-2 text-right font-black text-xs text-brand-primary">
                                {fmtMoney(grandTotals.totalArriendo)}
                            </td>
                            <td className="px-2 py-2 text-right font-black text-xs text-brand-dark">
                                {fmt(grandTotals.totalCantidad)}
                            </td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Search results hint */}
            {searchLower && (
                <p className="text-[10px] text-muted-foreground">
                    Mostrando {filteredCategorias.reduce((s, c) => s + c.items.length, 0)} ítems en {filteredCategorias.length} categorías
                </p>
            )}
        </div>
    );
};

export default ResumenMensualTable;

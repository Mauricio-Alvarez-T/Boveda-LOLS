import React, { useState, useMemo, useEffect } from 'react';
import { cn } from '../../utils/cn';
import { Check, X, ChevronRight, Search, EyeOff, Eye } from 'lucide-react';
import type { ResumenData } from '../../hooks/inventario/useInventarioData';

interface Props {
    data: ResumenData;
    canEdit: boolean;
    onUpdateStock: (itemId: number, obraId: number | null, bodegaId: number | null, data: { cantidad: number }) => Promise<boolean>;
    onRefresh: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-CL');
const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

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

    const totalColSpan = 3 + visibleObras.length * 2 + visibleBodegas.length + 2;

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
            </div>

            {/* ── Column visibility chips ── */}
            <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider self-center mr-1">Columnas:</span>
                {obras.map(o => {
                    const key = `obra_${o.id}`;
                    const hidden = hiddenCols.has(key);
                    const empty = !colsWithStock.has(key);
                    return (
                        <button
                            key={key}
                            onClick={() => toggleCol(key)}
                            className={cn(
                                "px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all",
                                hidden
                                    ? "bg-muted/50 border-transparent text-muted-foreground/50 line-through"
                                    : empty
                                        ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-blue-50 border-blue-200 text-blue-700"
                            )}
                        >
                            {o.nombre}
                        </button>
                    );
                })}
                {bodegas.map(b => {
                    const key = `bodega_${b.id}`;
                    const hidden = hiddenCols.has(key);
                    const empty = !colsWithStock.has(key);
                    return (
                        <button
                            key={key}
                            onClick={() => toggleCol(key)}
                            className={cn(
                                "px-2.5 py-1 text-[10px] font-semibold rounded-lg border transition-all",
                                hidden
                                    ? "bg-muted/50 border-transparent text-muted-foreground/50 line-through"
                                    : empty
                                        ? "bg-amber-50 border-amber-200 text-amber-700"
                                        : "bg-orange-50 border-orange-200 text-orange-700"
                            )}
                        >
                            {b.nombre}
                        </button>
                    );
                })}
            </div>

            {/* ── Table ── */}
            <div className="overflow-x-auto rounded-xl border border-[#E8E8ED]">
                <table className="w-full text-[11px] border-collapse">
                    <thead>
                        {/* Header row 1 */}
                        <tr className="bg-brand-primary/5">
                            <th className="sticky left-0 bg-white z-20 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-8">#</th>
                            <th className="sticky left-8 bg-white z-20 px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-[#E8E8ED] min-w-[180px]">Descripción</th>
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] w-16">V. Arriendo</th>
                            {visibleObras.map(o => (
                                <th key={`obra_${o.id}`} colSpan={2} className="px-2 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-blue-50/50">
                                    {o.nombre}
                                </th>
                            ))}
                            {visibleBodegas.map(b => (
                                <th key={`bodega_${b.id}`} className="px-2 py-2 text-center font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-amber-50/50">
                                    {b.nombre}
                                </th>
                            ))}
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-[#E8E8ED] bg-green-50/50">Total Arriendo</th>
                            <th className="px-2 py-2 text-right font-bold text-brand-dark border-b border-[#E8E8ED] bg-green-50/50">Total Unid.</th>
                        </tr>
                        {/* Header row 2 */}
                        <tr className="bg-[#F9F9FB]">
                            <th className="sticky left-0 bg-[#F9F9FB] z-20 border-b border-r border-[#E8E8ED]" />
                            <th className="sticky left-8 bg-[#F9F9FB] z-20 border-b border-r border-[#E8E8ED]" />
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
                                            <td className="sticky left-8 bg-inherit z-10 px-2 py-1 font-medium text-brand-dark border-r border-[#F0F0F5] truncate max-w-[200px]">{item.descripcion}</td>
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
                            <td className="sticky left-0 bg-brand-primary/5 z-20 px-2 py-2" />
                            <td className="sticky left-8 bg-brand-primary/5 z-20 px-2 py-2 text-right font-black text-xs text-brand-dark" colSpan={2}>
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

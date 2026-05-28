import React, { useState } from 'react';
import { cn } from '../../utils/cn';
import { Pencil, Check, X, ChevronDown, ChevronRight, MapPin, Package } from 'lucide-react';
import type { StockObraData } from '../../hooks/inventario/useInventarioData';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import { useAuth } from '../../context/AuthContext';
import ItemDetailModal from './ItemDetailModal';

interface Props {
    data: StockObraData;
    canEdit: boolean;
    isBodega?: boolean;
    onUpdateStock: (itemId: number, obraId: number, data: { cantidad?: number; valor_arriendo_override?: number | null }) => Promise<boolean>;
    onUpdateDescuento: (obraId: number, porcentaje: number) => Promise<boolean>;
    onRefresh: () => void;
}

const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

const StockUbicacionTable: React.FC<Props> = ({ data, canEdit, isBodega = false, onUpdateStock, onUpdateDescuento, onRefresh }) => {
    // Gate financiero: ocultar columnas/cards $ si no tiene `inventario.costos.ver`.
    // El backend ya sanitiza el JSON (`valor_arriendo`, `total`, `total_facturacion`,
    // `descuento_*`, `total_con_descuento` no llegan). Aquí ocultamos columnas para
    // no mostrar UI vacía.
    const { hasPermission } = useAuth();
    const verCostos = hasPermission('inventario.costos.ver');
    const editarDescuento = hasPermission('inventario.descuentos.gestionar');
    // ── Item detail modal ──
    const itemDetail = useItemDetail();

    // ── Desktop edit state (unchanged) ──
    const [editingCell, setEditingCell] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');

    // ── Desktop collapse state — default all expanded ──
    const [collapsedCatsDesktop, setCollapsedCatsDesktop] = useState<Set<number>>(new Set());
    const toggleCatDesktop = (id: number) => {
        setCollapsedCatsDesktop(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const startEdit = (key: string, currentValue: number) => {
        setEditingCell(key);
        setEditValue(String(currentValue));
    };

    const cancelEdit = () => {
        setEditingCell(null);
        setEditValue('');
    };

    const saveEdit = async (itemId: number, field: 'cantidad' | 'valor_arriendo') => {
        const num = parseFloat(editValue);
        if (isNaN(num) || num < 0) { cancelEdit(); return; }

        const payload = field === 'cantidad'
            ? { cantidad: Math.round(num) }
            : { valor_arriendo_override: num };

        const ok = await onUpdateStock(itemId, data.obra.id, payload);
        if (ok) onRefresh();
        cancelEdit();
    };

    const handleDescuentoSave = async () => {
        const num = parseFloat(editValue);
        if (isNaN(num) || num < 0 || num > 100) { cancelEdit(); return; }
        const ok = await onUpdateDescuento(data.obra.id, num);
        if (ok) onRefresh();
        cancelEdit();
    };

    const renderCell = (key: string, value: number, itemId: number, field: 'cantidad' | 'valor_arriendo') => {
        if (editingCell === key) {
            return (
                <div className="flex items-center gap-0.5">
                    <input
                        type="number"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(itemId, field); if (e.key === 'Escape') cancelEdit(); }}
                        className="w-16 px-1 py-0.5 text-[11px] border rounded text-right focus:ring-1 focus:ring-brand-primary outline-none"
                        autoFocus
                    />
                    <button type="button" aria-label="Guardar cambio" title="Guardar" onClick={() => saveEdit(itemId, field)} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded"><Check className="h-3 w-3" /></button>
                    <button type="button" aria-label="Cancelar edición" title="Cancelar" onClick={cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><X className="h-3 w-3" /></button>
                </div>
            );
        }

        return (
            <div className="flex items-center justify-end gap-1 group">
                <span>{field === 'valor_arriendo' ? fmtMoney(value) : value}</span>
                {canEdit && (
                    <button type="button" aria-label="Editar valor" title="Editar" onClick={() => startEdit(key, value)} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-brand-primary/10 rounded transition-opacity">
                        <Pencil className="h-2.5 w-2.5 text-brand-primary" />
                    </button>
                )}
            </div>
        );
    };

    // ── Mobile state ──
    const [expandedCats, setExpandedCats] = useState<Set<number>>(() => new Set(data.categorias.map(c => c.id)));
    const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
    const [mobileEditCell, setMobileEditCell] = useState<string | null>(null);
    const [mobileEditValue, setMobileEditValue] = useState('');

    const toggleCat = (id: number) => {
        setExpandedCats(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleItem = (id: number) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const mobileStartEdit = (key: string, current: number) => {
        if (!canEdit) return;
        setMobileEditCell(key);
        setMobileEditValue(String(current ?? ''));
    };
    const mobileCancelEdit = () => { setMobileEditCell(null); setMobileEditValue(''); };
    const mobileSaveEdit = async (itemId: number, field: 'cantidad' | 'valor_arriendo') => {
        const num = parseFloat(mobileEditValue);
        if (isNaN(num) || num < 0) { mobileCancelEdit(); return; }
        const payload = field === 'cantidad'
            ? { cantidad: Math.round(num) }
            : { valor_arriendo_override: num };
        const ok = await onUpdateStock(itemId, data.obra.id, payload);
        if (ok) onRefresh();
        mobileCancelEdit();
    };
    const mobileSaveDescuento = async () => {
        const num = parseFloat(mobileEditValue);
        if (isNaN(num) || num < 0 || num > 100) { mobileCancelEdit(); return; }
        const ok = await onUpdateDescuento(data.obra.id, num);
        if (ok) onRefresh();
        mobileCancelEdit();
    };

    const totalItems = data.categorias.reduce((s, c) => s + c.items.length, 0);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* ═══════════════════════════════════════════
                ── MOBILE VIEW (smartphones only) ──
               ═══════════════════════════════════════════ */}
            <div className="md:hidden flex flex-col gap-3 flex-1 min-h-0">
                {/* Summary Card */}
                <div className="shrink-0 bg-gradient-to-br from-brand-primary to-brand-primary/80 rounded-2xl p-4 text-white shadow-lg shadow-brand-primary/20">
                    <div className="flex items-center gap-2 mb-3">
                        <div className="w-8 h-8 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                            <MapPin className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[10px] opacity-70 uppercase tracking-wider">{isBodega ? 'Bodega' : 'Obra'}</p>
                            <p className="text-sm font-bold truncate">{data.obra.nombre}</p>
                        </div>
                    </div>

                    {!isBodega && verCostos && (
                    <div className="grid grid-cols-3 gap-2">
                        {/* Facturación */}
                        <div className="bg-white/10 rounded-xl p-2.5">
                            <p className="text-[9px] opacity-80 uppercase tracking-wider mb-0.5">Facturación</p>
                            <p className="text-sm font-black leading-tight">{fmtMoney(data.total_facturacion)}</p>
                        </div>

                        {/* Descuento (tappable) — edición requiere `inventario.descuentos.gestionar`. */}
                        <div className={cn(
                            "bg-white/10 rounded-xl p-2.5",
                            editarDescuento && "active:bg-white/20 transition-colors"
                        )}>
                            <p className="text-[9px] opacity-80 uppercase tracking-wider mb-0.5">Descuento</p>
                            {mobileEditCell === 'm_descuento' ? (
                                <div className="flex items-center gap-1">
                                    <input
                                        type="number" min={0} max={100}
                                        value={mobileEditValue}
                                        onChange={e => setMobileEditValue(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') mobileSaveDescuento();
                                            if (e.key === 'Escape') mobileCancelEdit();
                                        }}
                                        className="w-10 px-1 py-0.5 text-xs text-brand-dark border-2 border-white rounded text-center font-bold outline-none"
                                        autoFocus
                                    />
                                    <span className="text-xs font-bold">%</span>
                                    <button type="button" aria-label="Guardar descuento" title="Guardar" onClick={mobileSaveDescuento} className="p-1 bg-green-100 text-green-700 rounded-md"><Check className="h-3 w-3" /></button>
                                    <button type="button" aria-label="Cancelar edición" title="Cancelar" onClick={mobileCancelEdit} className="p-1 bg-red-100 text-red-600 rounded-md"><X className="h-3 w-3" /></button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => editarDescuento && mobileStartEdit('m_descuento', data.descuento_porcentaje)}
                                    disabled={!editarDescuento}
                                    className="text-left w-full disabled:cursor-default"
                                >
                                    <p className="text-sm font-black leading-tight">{data.descuento_porcentaje}%</p>
                                    {data.descuento_monto > 0 && (
                                        <p className="text-[9px] opacity-80 leading-tight">-{fmtMoney(data.descuento_monto)}</p>
                                    )}
                                </button>
                            )}
                        </div>

                        {/* Total final */}
                        <div className="bg-white/20 rounded-xl p-2.5 ring-1 ring-white/30">
                            <p className="text-[9px] opacity-80 uppercase tracking-wider mb-0.5">Total Final</p>
                            <p className="text-sm font-black leading-tight">
                                {fmtMoney(data.descuento_porcentaje > 0 ? data.total_con_descuento : data.total_facturacion)}
                            </p>
                        </div>
                    </div>
                    )}
                </div>

                {/* Categorías list */}
                {totalItems === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <p className="text-sm text-muted-foreground">Sin items en esta {isBodega ? 'bodega' : 'obra'}.</p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 overflow-y-auto space-y-3 pb-4">
                        {data.categorias.map(cat => {
                            const catExpanded = expandedCats.has(cat.id);
                            return (
                                <div key={cat.id} className="rounded-2xl border border-border overflow-hidden bg-card">
                                    {/* Category header */}
                                    <button
                                        onClick={() => toggleCat(cat.id)}
                                        className="w-full flex items-center justify-between px-4 py-3 bg-brand-primary/5 active:bg-brand-primary/10 transition-colors"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <ChevronDown className={cn("h-4 w-4 text-brand-primary transition-transform duration-200 shrink-0", !catExpanded && "-rotate-90")} />
                                            <span className="font-black text-xs uppercase tracking-wider text-brand-primary truncate">{cat.nombre}</span>
                                        </div>
                                        <div className="flex items-center gap-3 text-[10px] shrink-0">
                                            <span className="font-bold text-brand-dark">{cat.subtotal_cantidad} u.</span>
                                            {verCostos && (
                                                <span className="font-bold text-brand-accent">{fmtMoney(cat.subtotal_arriendo)}</span>
                                            )}
                                        </div>
                                    </button>

                                    {/* Items list */}
                                    {catExpanded && (
                                        <div className="divide-y divide-border">
                                            {cat.items.map(item => {
                                                const itemExpanded = expandedItems.has(item.id);
                                                const arrKey = `m_arr_${item.id}`;
                                                const cantKey = `m_cant_${item.id}`;
                                                return (
                                                    <div key={item.id}>
                                                        {/* Item row — tap to expand */}
                                                        <button
                                                            onClick={() => toggleItem(item.id)}
                                                            className="w-full flex items-center gap-3 px-4 py-3 active:bg-blue-50/50 transition-colors text-left"
                                                        >
                                                            <div className="w-10 h-10 rounded-xl bg-muted border border-border flex items-center justify-center shrink-0">
                                                                <span className="text-[10px] font-bold text-muted-foreground">#{item.nro_item}</span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p
                                                                    className="text-xs font-bold text-brand-dark line-clamp-2 leading-tight hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                                                    onClick={(e) => { e.stopPropagation(); itemDetail.openItem(item.id, item); }}
                                                                >{item.descripcion}</p>
                                                                <div className="flex items-center gap-2 mt-1">
                                                                    <span className="text-[10px] font-semibold text-brand-dark">{item.cantidad} {item.unidad}</span>
                                                                    {verCostos && item.valor_arriendo > 0 && (
                                                                        <span className="text-[10px] text-muted-foreground">· {fmtMoney(item.valor_arriendo)}/mes</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <div className="text-right">
                                                                    {verCostos && item.total > 0 && (
                                                                        <p className="text-xs font-black text-brand-primary">{fmtMoney(item.total)}</p>
                                                                    )}
                                                                </div>
                                                                <ChevronDown className={cn("h-4 w-4 text-muted-foreground/40 transition-transform duration-200", itemExpanded && "rotate-180")} />
                                                            </div>
                                                        </button>

                                                        {/* Expanded detail */}
                                                        {itemExpanded && (
                                                            <div className="px-4 pb-4 pt-1 bg-muted space-y-1">
                                                                {/* M2 */}
                                                                {item.m2 != null && (
                                                                    <div className="flex items-center justify-between py-2 border-b border-border">
                                                                        <span className="text-xs text-muted-foreground">M²</span>
                                                                        <span className="text-xs font-medium text-brand-dark">{item.m2.toFixed(2)}</span>
                                                                    </div>
                                                                )}

                                                                {/* Unidad */}
                                                                <div className="flex items-center justify-between py-2 border-b border-border">
                                                                    <span className="text-xs text-muted-foreground">Unidad</span>
                                                                    <span className="text-xs font-medium text-brand-dark">{item.unidad}</span>
                                                                </div>

                                                                {/* Valor arriendo (editable) — sólo si tiene `inventario.costos.ver` */}
                                                                {verCostos && (
                                                                <div className="flex items-center justify-between py-2 border-b border-border">
                                                                    <span className="text-xs text-muted-foreground">V. Arriendo</span>
                                                                    {mobileEditCell === arrKey ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number" min={0}
                                                                                value={mobileEditValue}
                                                                                onChange={e => setMobileEditValue(e.target.value)}
                                                                                onKeyDown={e => {
                                                                                    if (e.key === 'Enter') mobileSaveEdit(item.id, 'valor_arriendo');
                                                                                    if (e.key === 'Escape') mobileCancelEdit();
                                                                                }}
                                                                                className="w-24 px-2 py-1.5 text-xs border-2 border-brand-primary rounded-xl text-right font-bold focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                                                                autoFocus
                                                                            />
                                                                            <button type="button" aria-label="Guardar valor de arriendo" title="Guardar" onClick={() => mobileSaveEdit(item.id, 'valor_arriendo')} className="p-1.5 bg-green-100 text-green-700 rounded-lg"><Check className="h-3.5 w-3.5" /></button>
                                                                            <button type="button" aria-label="Cancelar edición" title="Cancelar" onClick={mobileCancelEdit} className="p-1.5 bg-red-100 text-red-600 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => canEdit && mobileStartEdit(arrKey, item.valor_arriendo)}
                                                                            disabled={!canEdit}
                                                                            className={cn(
                                                                                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold",
                                                                                "bg-brand-primary/5 text-brand-dark border border-brand-primary/10",
                                                                                canEdit && "active:scale-95 transition-transform"
                                                                            )}
                                                                        >
                                                                            <span>{fmtMoney(item.valor_arriendo)}</span>
                                                                            {canEdit && <Pencil className="h-3 w-3 text-brand-primary" />}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                )}

                                                                {/* Cantidad (editable) */}
                                                                <div className="flex items-center justify-between py-2 border-b border-border">
                                                                    <span className="text-xs text-muted-foreground">Cantidad</span>
                                                                    {mobileEditCell === cantKey ? (
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number" min={0}
                                                                                value={mobileEditValue}
                                                                                onChange={e => setMobileEditValue(e.target.value)}
                                                                                onKeyDown={e => {
                                                                                    if (e.key === 'Enter') mobileSaveEdit(item.id, 'cantidad');
                                                                                    if (e.key === 'Escape') mobileCancelEdit();
                                                                                }}
                                                                                className="w-20 px-2 py-1.5 text-xs border-2 border-brand-primary rounded-xl text-center font-bold focus:ring-2 focus:ring-brand-primary/20 outline-none"
                                                                                autoFocus
                                                                            />
                                                                            <button type="button" aria-label="Guardar cantidad" title="Guardar" onClick={() => mobileSaveEdit(item.id, 'cantidad')} className="p-1.5 bg-green-100 text-green-700 rounded-lg"><Check className="h-3.5 w-3.5" /></button>
                                                                            <button type="button" aria-label="Cancelar edición" title="Cancelar" onClick={mobileCancelEdit} className="p-1.5 bg-red-100 text-red-600 rounded-lg"><X className="h-3.5 w-3.5" /></button>
                                                                        </div>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => canEdit && mobileStartEdit(cantKey, item.cantidad)}
                                                                            disabled={!canEdit}
                                                                            className={cn(
                                                                                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold",
                                                                                item.cantidad > 0
                                                                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                                                                    : "bg-gray-50 text-gray-400 border border-gray-200",
                                                                                canEdit && "active:scale-95 transition-transform"
                                                                            )}
                                                                        >
                                                                            <span>{item.cantidad}</span>
                                                                            {canEdit && <Pencil className="h-3 w-3 text-brand-primary" />}
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Total — gateado por `inventario.costos.ver` */}
                                                                {verCostos && (
                                                                <div className="flex items-center justify-between py-2">
                                                                    <span className="text-xs font-bold text-brand-dark">Total</span>
                                                                    <span className="text-sm font-black text-brand-primary">
                                                                        {item.total > 0 ? fmtMoney(item.total) : '$0'}
                                                                    </span>
                                                                </div>
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
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════
                ── DESKTOP VIEW (unchanged — md and up) ──
               ═══════════════════════════════════════════ */}
            <div className="hidden md:block overflow-auto flex-1 min-h-0 rounded-xl border border-border">
                <table className="w-full text-[11px] border-collapse">
                    <thead className="sticky top-0 z-20">
                        <tr>
                            <th className="bg-muted px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-border w-8">#</th>
                            <th className="bg-muted px-2 py-2 text-left font-bold text-brand-dark border-b border-r border-border min-w-[200px]">Descripción</th>
                            <th className="bg-muted px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-border w-14">M2</th>
                            {verCostos && (
                                <th className="bg-muted px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-border w-24">V. Arriendo</th>
                            )}
                            <th className="bg-muted px-2 py-2 text-center font-bold text-brand-dark border-b border-r border-border w-10">UN</th>
                            <th className="bg-muted px-2 py-2 text-right font-bold text-brand-dark border-b border-r border-border w-16">Cantidad</th>
                            {verCostos && (
                                <th className="bg-muted px-2 py-2 text-right font-bold text-brand-dark border-b border-border w-24">Total</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {data.categorias.map(cat => {
                            const collapsed = collapsedCatsDesktop.has(cat.id);
                            return (
                            <React.Fragment key={cat.id}>
                                <tr
                                    className="bg-brand-primary/10 cursor-pointer select-none hover:bg-brand-primary/15 transition-colors"
                                    onClick={() => toggleCatDesktop(cat.id)}
                                >
                                    <td colSpan={verCostos ? 7 : 5} className="px-3 py-1.5 font-black text-[10px] uppercase tracking-widest text-brand-primary">
                                        <div className="flex items-center gap-2">
                                            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-200", !collapsed && "rotate-90")} />
                                            <span>{cat.nombre}</span>
                                        </div>
                                    </td>
                                </tr>
                                {!collapsed && cat.items.map((item, idx) => (
                                    <tr key={item.id} className={cn("hover:bg-blue-50/30 transition-colors", idx % 2 === 0 ? "bg-card" : "bg-muted")}>
                                        <td className="px-2 py-1 text-right text-muted-foreground border-r border-b border-border">{item.nro_item}</td>
                                        <td className="px-2 py-1 font-medium text-brand-dark truncate max-w-[250px] border-r border-b border-border">
                                            <button
                                                type="button"
                                                onClick={() => itemDetail.openItem(item.id, item)}
                                                className="text-left hover:underline hover:text-brand-primary transition-colors cursor-pointer"
                                            >
                                                {item.descripcion}
                                            </button>
                                        </td>
                                        <td className="px-2 py-1 text-right text-muted-foreground border-r border-b border-border">{item.m2 ? item.m2.toFixed(2) : ''}</td>
                                        {verCostos && (
                                            <td className="px-2 py-1 text-right border-r border-b border-border">
                                                {renderCell(`arr_${item.id}`, item.valor_arriendo, item.id, 'valor_arriendo')}
                                            </td>
                                        )}
                                        <td className="px-2 py-1 text-center text-muted-foreground border-r border-b border-border">{item.unidad}</td>
                                        <td className="px-2 py-1 text-right border-r border-b border-border">
                                            {renderCell(`cant_${item.id}`, item.cantidad, item.id, 'cantidad')}
                                        </td>
                                        {verCostos && (
                                            <td className="px-2 py-1 text-right font-semibold text-brand-dark border-b border-border">
                                                {item.total > 0 ? fmtMoney(item.total) : ''}
                                            </td>
                                        )}
                                    </tr>
                                ))}
                                {/* Subtotal row — always visible, so totals stay readable when category is collapsed.
                                    colSpan adjustment: con verCostos hay 7 cols (label hasta UN = 5 + cant + arriendo),
                                    sin verCostos hay 5 cols (label hasta UN = 4 + cant). */}
                                <tr className="bg-muted border-t border-border">
                                    <td colSpan={verCostos ? 5 : 4} className="px-3 py-1.5 text-right font-bold text-[10px] uppercase text-muted-foreground">
                                        Total {cat.nombre}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-bold text-brand-dark border-r border-border">{cat.subtotal_cantidad}</td>
                                    {verCostos && (
                                        <td className="px-2 py-1.5 text-right font-bold text-brand-accent">{fmtMoney(cat.subtotal_arriendo)}</td>
                                    )}
                                </tr>
                            </React.Fragment>
                            );
                        })}
                    </tbody>
                    {/* ── Sticky footer — totals, descuento.
                        Sólo se renderiza si el usuario tiene `inventario.costos.ver`
                        (sin permiso no hay valores que mostrar en el pie). ── */}
                    <tfoot className="sticky bottom-0 z-10">
                        {!isBodega && verCostos && (<>
                        {/* Grand total */}
                        <tr className="border-t-2 border-brand-primary/30">
                            <td colSpan={6} className="bg-muted px-3 py-2.5 text-right font-black text-xs text-brand-dark">TOTAL FACTURACIÓN</td>
                            <td className="bg-success/10 px-2 py-2.5 text-right font-black text-xs text-brand-primary">{fmtMoney(data.total_facturacion)}</td>
                        </tr>
                        {/* Discount row — always visible, editable */}
                        <tr>
                            <td colSpan={6} className="bg-warning/10 px-3 py-2 text-right font-bold text-xs text-muted-foreground">
                                {editingCell === 'descuento' ? (
                                    <div className="flex items-center justify-end gap-1">
                                        <span className="text-muted-foreground">Descuento</span>
                                        <input
                                            type="number"
                                            value={editValue}
                                            onChange={e => setEditValue(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleDescuentoSave(); if (e.key === 'Escape') cancelEdit(); }}
                                            className="w-16 px-1 py-0.5 text-[11px] border rounded text-right focus:ring-1 focus:ring-brand-primary outline-none"
                                            autoFocus
                                            min={0}
                                            max={100}
                                        />
                                        <span className="text-muted-foreground">%</span>
                                        <button type="button" aria-label="Guardar descuento" title="Guardar" onClick={handleDescuentoSave} className="p-0.5 text-brand-accent hover:bg-brand-accent/10 rounded"><Check className="h-3 w-3" /></button>
                                        <button type="button" aria-label="Cancelar edición" title="Cancelar" onClick={cancelEdit} className="p-0.5 text-destructive hover:bg-destructive/10 rounded"><X className="h-3 w-3" /></button>
                                    </div>
                                ) : (
                                    <span
                                        onClick={() => editarDescuento ? startEdit('descuento', data.descuento_porcentaje) : undefined}
                                        className={cn(
                                            editarDescuento && "cursor-pointer hover:bg-amber-100 hover:ring-1 hover:ring-amber-300 rounded px-2 py-0.5 transition-all"
                                        )}
                                        title={editarDescuento ? 'Click para editar descuento' : undefined}
                                    >
                                        Descuento {data.descuento_porcentaje > 0 ? `${data.descuento_porcentaje}%` : editarDescuento ? '(sin descuento — click para agregar)' : '(sin descuento)'}
                                    </span>
                                )}
                            </td>
                            <td className="bg-warning/10 px-2 py-2 text-right font-bold text-xs text-destructive">
                                {data.descuento_monto > 0 ? `-${fmtMoney(data.descuento_monto)}` : '$0'}
                            </td>
                        </tr>
                        {data.descuento_porcentaje > 0 && (
                            <tr className="border-t-2 border-brand-accent/30">
                                <td colSpan={6} className="bg-muted px-3 py-2.5 text-right font-black text-xs text-brand-dark">TOTAL CON DESCUENTO</td>
                                <td className="bg-success/10 px-2 py-2.5 text-right font-black text-xs text-brand-accent">{fmtMoney(data.total_con_descuento)}</td>
                            </tr>
                        )}
                        </>)}
                    </tfoot>
                </table>
            </div>

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

export default StockUbicacionTable;

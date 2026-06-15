import React, { useMemo, useState } from 'react';
import { Plus, Minus, Trash2, Search, Package, AlertCircle, ShoppingBag } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Skeleton } from '../../ui/Skeleton';
import type { ItemInventario } from '../../../types/entities';
import type { ItemInput, CustomItemInput } from '../../../utils/inferMovimiento';

/**
 * Catálogo + carrito + ítems "a comprar" (custom), controlado. Reúne el patrón de
 * MovimientoForm (catálogo filtrado por stock del origen) y el de SolicitudForm
 * (ítems custom). Lo usa el PasoItems del wizard "Nuevo movimiento" (Fase 4).
 * `conStockFiltro=false` (origen central / solicitud) → muestra todo el catálogo
 * sin validar stock; `true` (origen físico) → filtra por stock y marca excesos.
 */
export const CatalogoCarrito: React.FC<{
    catalogo: ItemInventario[];
    /** Stock disponible por ítem en el origen elegido (vacío si origen central). */
    stockEnOrigen: Record<number, number>;
    conStockFiltro: boolean;
    loading: boolean;
    cart: ItemInput[];
    setCart: React.Dispatch<React.SetStateAction<ItemInput[]>>;
    allowCustom: boolean;
    customItems: CustomItemInput[];
    setCustomItems: React.Dispatch<React.SetStateAction<CustomItemInput[]>>;
}> = ({ catalogo, stockEnOrigen, conStockFiltro, loading, cart, setCart, allowCustom, customItems, setCustomItems }) => {
    const [search, setSearch] = useState('');

    const cartMap = useMemo(() => {
        const m: Record<number, number> = {};
        cart.forEach(l => { m[l.item_id] = l.cantidad; });
        return m;
    }, [cart]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return catalogo
            .filter(item => {
                if (conStockFiltro && (stockEnOrigen[item.id] || 0) === 0 && !cartMap[item.id]) return false;
                if (q) { const hay = `${item.nro_item} ${item.descripcion}`.toLowerCase(); if (!hay.includes(q)) return false; }
                return true;
            })
            .sort((a, b) => (a.nro_item || 0) - (b.nro_item || 0));
    }, [catalogo, conStockFiltro, stockEnOrigen, search, cartMap]);

    const addToCart = (id: number) => setCart(prev => prev.some(l => l.item_id === id) ? prev : [...prev, { item_id: id, cantidad: 1 }]);
    const updateQty = (id: number, c: number) => {
        if (c < 1) { setCart(prev => prev.filter(l => l.item_id !== id)); return; }
        setCart(prev => prev.map(l => l.item_id === id ? { ...l, cantidad: c } : l));
    };

    const addCustom = () => setCustomItems(prev => [{ descripcion: '', cantidad: 1 }, ...prev]);
    const updCustom = (i: number, patch: Partial<CustomItemInput>) => setCustomItems(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const delCustom = (i: number) => setCustomItems(prev => prev.filter((_, idx) => idx !== i));

    const hayExceso = conStockFiltro && cart.some(l => (stockEnOrigen[l.item_id] || 0) < l.cantidad);

    return (
        <div className="space-y-4">
            <div>
                <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar ítem del catálogo..."
                        className="w-full h-10 pl-9 pr-3 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                    />
                </div>
                <div className="max-h-64 overflow-y-auto border border-border rounded-xl">
                    {loading ? (
                        <ul className="divide-y divide-border">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <li key={i} className="flex items-center gap-2 px-3 py-2">
                                    <div className="flex-1 space-y-1.5"><Skeleton className="h-2.5 w-24" /><Skeleton className="h-3 w-3/4" /></div>
                                    <Skeleton className="h-8 w-20" />
                                </li>
                            ))}
                        </ul>
                    ) : filtered.length === 0 ? (
                        <div className="h-32 flex flex-col items-center justify-center text-center p-4">
                            <Package className="h-8 w-8 text-muted-foreground/30 mb-1" />
                            <p className="text-xs text-muted-foreground">{conStockFiltro ? 'Sin stock en el origen elegido' : 'Sin resultados'}</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {filtered.map(item => {
                                const disponible = stockEnOrigen[item.id] || 0;
                                const enCarrito = cartMap[item.id];
                                const excede = conStockFiltro && enCarrito > disponible;
                                return (
                                    <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-caption font-bold text-muted-foreground">#{item.nro_item}{conStockFiltro ? ` · ${disponible} ${item.unidad}` : ''}</div>
                                            <div className="text-xs font-bold text-brand-dark truncate">{item.descripcion}</div>
                                        </div>
                                        {enCarrito === undefined ? (
                                            <button type="button" onClick={() => addToCart(item.id)} className="shrink-0 flex items-center gap-1 px-2.5 h-9 text-caption font-bold text-white bg-brand-primary rounded-lg">
                                                <Plus className="h-3.5 w-3.5" strokeWidth={3} /> Agregar
                                            </button>
                                        ) : (
                                            <div className="shrink-0 flex items-center gap-1">
                                                <button type="button" onClick={() => updateQty(item.id, enCarrito - 1)} className="h-9 w-9 rounded-md bg-muted flex items-center justify-center"><Minus className="h-3.5 w-3.5" /></button>
                                                <input type="number" inputMode="decimal" min={0} value={enCarrito} onChange={e => updateQty(item.id, parseInt(e.target.value) || 0)} className={cn('w-14 h-9 px-1 text-label font-bold text-center border rounded-md', excede ? 'border-red-400 text-red-700 dark:border-red-500/40 dark:text-red-300' : 'border-border')} />
                                                <button type="button" onClick={() => updateQty(item.id, enCarrito + 1)} className="h-9 w-9 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center"><Plus className="h-3.5 w-3.5" strokeWidth={3} /></button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                {hayExceso && (
                    <p className="mt-1.5 flex items-center gap-1 text-caption font-bold text-red-600 dark:text-red-400"><AlertCircle className="h-3.5 w-3.5" /> Hay ítems con cantidad mayor al stock disponible.</p>
                )}
            </div>

            {allowCustom && (
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-label font-black text-brand-dark/60 uppercase tracking-widest flex items-center gap-1.5">
                            <ShoppingBag className="h-3.5 w-3.5" /> Materiales a comprar (opcional)
                        </span>
                        <button type="button" onClick={addCustom} className="text-caption font-bold text-brand-primary hover:underline">+ Agregar</button>
                    </div>
                    {customItems.length === 0 ? (
                        <p className="text-caption text-muted-foreground italic px-1">Ítems fuera de catálogo que el aprobador tramitará como compra.</p>
                    ) : (
                        <ul className="space-y-2">
                            {customItems.map((c, i) => (
                                <li key={i} className="flex items-center gap-2">
                                    <input value={c.descripcion} onChange={e => updCustom(i, { descripcion: e.target.value })} placeholder="Descripción del material" className="flex-1 min-w-0 h-9 px-2.5 text-xs border border-border rounded-lg" />
                                    <input type="number" inputMode="decimal" min={1} value={c.cantidad} onChange={e => updCustom(i, { cantidad: parseInt(e.target.value) || 0 })} className="w-16 h-9 px-1 text-xs text-center border border-border rounded-lg" />
                                    <input value={c.unidad || ''} onChange={e => updCustom(i, { unidad: e.target.value })} placeholder="unidad" className="w-20 h-9 px-2 text-xs border border-border rounded-lg" />
                                    <button type="button" onClick={() => delCustom(i)} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

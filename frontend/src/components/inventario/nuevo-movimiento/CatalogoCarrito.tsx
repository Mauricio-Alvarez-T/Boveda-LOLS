import React, { useMemo, useState } from 'react';
import { Plus, Minus, Trash2, Search, Package, AlertCircle, ShoppingBag } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Skeleton } from '../../ui/Skeleton';
import { QtyStepper } from '../../ui/QtyStepper';
import type { ItemInventario, CategoriaInventario } from '../../../types/entities';
import type { ItemInput, CustomItemInput } from '../../../utils/inferMovimiento';

/**
 * Paso Ítems del wizard. En modo Pedir (`allowCustom`) son DOS pestañas: "Catálogo"
 * (buscador + chips de categoría + cantidad total en stock, discreta) y "Otros
 * materiales" (ítems fuera de catálogo, prominentes porque es lo más usado). En modo
 * Mover, solo el catálogo filtrado por stock del origen. La lista usa el máximo alto
 * posible (`max-h-[55vh]`) y hace scroll interno.
 */
export const CatalogoCarrito: React.FC<{
    catalogo: ItemInventario[];
    /** Stock disponible por ítem en el origen elegido (modo Mover). */
    stockEnOrigen: Record<number, number>;
    conStockFiltro: boolean;
    /** Modo Pedir: stock total del ítem (Σ de todas las ubicaciones, sin exponer cuál). */
    disponibleTotal?: Record<number, number>;
    categorias?: CategoriaInventario[];
    loading: boolean;
    cart: ItemInput[];
    setCart: React.Dispatch<React.SetStateAction<ItemInput[]>>;
    allowCustom: boolean;
    customItems: CustomItemInput[];
    setCustomItems: React.Dispatch<React.SetStateAction<CustomItemInput[]>>;
}> = ({ catalogo, stockEnOrigen, conStockFiltro, disponibleTotal, categorias, loading, cart, setCart, allowCustom, customItems, setCustomItems }) => {
    const [tab, setTab] = useState<'catalogo' | 'otros'>('catalogo');
    const [search, setSearch] = useState('');
    const [catFiltro, setCatFiltro] = useState<number | null>(null);

    const cartMap = useMemo(() => {
        const m: Record<number, number> = {};
        cart.forEach(l => { m[l.item_id] = l.cantidad; });
        return m;
    }, [cart]);

    const cats = useMemo(() => (categorias ? [...categorias].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) : []), [categorias]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return catalogo
            .filter(item => {
                if (conStockFiltro && (stockEnOrigen[item.id] || 0) === 0 && !cartMap[item.id]) return false;
                if (catFiltro != null && item.categoria_id !== catFiltro) return false;
                if (q) { const hay = `${item.nro_item} ${item.descripcion}`.toLowerCase(); if (!hay.includes(q)) return false; }
                return true;
            })
            .sort((a, b) => (a.nro_item || 0) - (b.nro_item || 0));
    }, [catalogo, conStockFiltro, stockEnOrigen, catFiltro, search, cartMap]);

    const addToCart = (id: number) => setCart(prev => prev.some(l => l.item_id === id) ? prev : [...prev, { item_id: id, cantidad: 1 }]);
    const updateQty = (id: number, c: number) => {
        if (c < 1) { setCart(prev => prev.filter(l => l.item_id !== id)); return; }
        setCart(prev => prev.map(l => l.item_id === id ? { ...l, cantidad: c } : l));
    };

    const addCustom = () => setCustomItems(prev => [{ descripcion: '', cantidad: 1 }, ...prev]);
    const updCustom = (i: number, patch: Partial<CustomItemInput>) => setCustomItems(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c));
    const delCustom = (i: number) => setCustomItems(prev => prev.filter((_, idx) => idx !== i));

    const hayExceso = conStockFiltro && cart.some(l => (stockEnOrigen[l.item_id] || 0) < l.cantidad);
    const otrosCount = customItems.filter(c => c.descripcion.trim()).length;

    const catalogoPanel = (
        <div className="flex flex-col min-h-0">
            <div className="relative mb-2 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar ítem del catálogo..." className="w-full h-10 pl-9 pr-3 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none" />
            </div>
            {cats.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto pb-2 shrink-0">
                    <button type="button" onClick={() => setCatFiltro(null)} className={cn('shrink-0 px-2.5 h-7 rounded-full text-caption font-bold border transition-colors', catFiltro === null ? 'bg-brand-primary text-white border-brand-primary' : 'bg-card text-muted-foreground border-border hover:border-brand-primary/40')}>Todas</button>
                    {cats.map(c => (
                        <button key={c.id} type="button" onClick={() => setCatFiltro(c.id)} className={cn('shrink-0 px-2.5 h-7 rounded-full text-caption font-bold border transition-colors whitespace-nowrap', catFiltro === c.id ? 'bg-brand-primary text-white border-brand-primary' : 'bg-card text-muted-foreground border-border hover:border-brand-primary/40')}>{c.nombre}</button>
                    ))}
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-xl max-h-[55vh]">
                {loading ? (
                    <ul className="divide-y divide-border">{Array.from({ length: 6 }).map((_, i) => (<li key={i} className="flex items-center gap-2 px-3 py-2"><div className="flex-1 space-y-1.5"><Skeleton className="h-3 w-3/4" /><Skeleton className="h-2.5 w-24" /></div><Skeleton className="h-8 w-20" /></li>))}</ul>
                ) : filtered.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center p-4"><Package className="h-8 w-8 text-muted-foreground/30 mb-1" /><p className="text-xs text-muted-foreground">{conStockFiltro ? 'Sin stock en el origen elegido' : 'Sin resultados'}</p></div>
                ) : (
                    <ul className="divide-y divide-border">
                        {filtered.map(item => {
                            const disponible = stockEnOrigen[item.id] || 0;
                            const total = disponibleTotal?.[item.id] ?? 0;
                            const enCarrito = cartMap[item.id];
                            const excede = conStockFiltro && enCarrito > disponible;
                            return (
                                <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-brand-dark truncate">{item.descripcion}</div>
                                        <div className="text-caption text-muted-foreground">
                                            #{item.nro_item}
                                            {conStockFiltro
                                                ? ` · ${disponible} ${item.unidad} en origen`
                                                : disponibleTotal ? (total > 0 ? ` · ${total} ${item.unidad} en stock` : ' · sin stock') : ''}
                                        </div>
                                    </div>
                                    {enCarrito === undefined ? (
                                        <button type="button" onClick={() => addToCart(item.id)} className="shrink-0 flex items-center gap-1 px-2.5 h-9 text-caption font-bold text-white bg-brand-primary rounded-lg"><Plus className="h-3.5 w-3.5" strokeWidth={3} /> Agregar</button>
                                    ) : (
                                        <QtyStepper value={enCarrito} onChange={c => updateQty(item.id, c)} size="md" warning={excede ? 'exceso' : null} ariaLabel={item.descripcion} />
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {hayExceso && (<p className="mt-1.5 flex items-center gap-1 text-caption font-bold text-red-600 dark:text-red-400 shrink-0"><AlertCircle className="h-3.5 w-3.5" /> Hay ítems con cantidad mayor al stock disponible.</p>)}
        </div>
    );

    const otrosPanel = (
        <div className="flex flex-col min-h-0">
            <button type="button" onClick={addCustom} className="shrink-0 mb-2 flex items-center justify-center gap-1.5 h-11 rounded-xl border-2 border-dashed border-brand-primary/40 text-brand-primary font-bold text-sm hover:bg-brand-primary/5 transition-colors">
                <Plus className="h-4 w-4" strokeWidth={3} /> Agregar material
            </button>
            <p className="text-caption text-muted-foreground mb-2 shrink-0">Materiales que no están en el catálogo. Quien aprueba define cómo conseguirlos.</p>
            <div className="flex-1 min-h-0 overflow-y-auto max-h-[55vh]">
                {customItems.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-center p-4"><ShoppingBag className="h-8 w-8 text-muted-foreground/30 mb-1" /><p className="text-xs text-muted-foreground">Aún no agregaste materiales.</p></div>
                ) : (
                    <ul className="space-y-2">
                        {customItems.map((c, i) => (
                            <li key={i} className="flex items-center gap-2">
                                <input value={c.descripcion} onChange={e => updCustom(i, { descripcion: e.target.value })} placeholder="Descripción del material" className="flex-1 min-w-0 h-10 px-2.5 text-xs border border-border rounded-lg" />
                                <input type="number" inputMode="decimal" min={1} value={c.cantidad} onChange={e => updCustom(i, { cantidad: parseInt(e.target.value) || 0 })} className="w-16 h-10 px-1 text-xs text-center border border-border rounded-lg" />
                                <input value={c.unidad || ''} onChange={e => updCustom(i, { unidad: e.target.value })} placeholder="unidad" className="w-20 h-10 px-2 text-xs border border-border rounded-lg" />
                                <button type="button" onClick={() => delCustom(i)} className="text-muted-foreground/50 hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );

    if (!allowCustom) return catalogoPanel;

    return (
        <div className="flex flex-col min-h-0">
            <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl mb-3 shrink-0">
                <button type="button" onClick={() => setTab('catalogo')} className={cn('h-9 rounded-lg text-sm font-bold transition-colors', tab === 'catalogo' ? 'bg-card text-brand-dark shadow-sm' : 'text-muted-foreground')}>Catálogo{cart.length ? ` · ${cart.length}` : ''}</button>
                <button type="button" onClick={() => setTab('otros')} className={cn('h-9 rounded-lg text-sm font-bold transition-colors', tab === 'otros' ? 'bg-card text-brand-dark shadow-sm' : 'text-muted-foreground')}>Otros materiales{otrosCount ? ` · ${otrosCount}` : ''}</button>
            </div>
            {tab === 'catalogo' ? catalogoPanel : otrosPanel}
        </div>
    );
};

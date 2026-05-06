import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, Trash2, Send, Search, Package, AlertCircle, ShoppingCart, ChevronRight, Check, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario, CategoriaInventario } from '../../types/entities';
import { SearchableSelect } from '../ui/SearchableSelect';
import { StockBadge, type StockUbicacion } from './StockBadge';
import ItemDetailModal from './ItemDetailModal';
import { useItemDetail } from '../../hooks/inventario/useItemDetail';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import { cn } from '../../utils/cn';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

// Resuelve la URL pública de una imagen de inventario sin importar si imagen_url
// viene como "/api/uploads/..." o "/uploads/..." (legacy).
const resolveImageUrl = (imagen_url: string | null | undefined): string | null => {
    if (!imagen_url) return null;
    if (/^https?:\/\//i.test(imagen_url)) return imagen_url;
    const withApi = imagen_url.startsWith('/api/') ? imagen_url : `/api${imagen_url.startsWith('/') ? '' : '/'}${imagen_url}`;
    return `${API_BASE}${withApi}`;
};

// Miniatura con fallback a <Package> si la imagen falla al cargar
const ItemThumb: React.FC<{ src: string | null; alt: string; size: 'sm' | 'md' }> = ({ src, alt, size }) => {
    const [errored, setErrored] = useState(false);
    const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6';
    if (!src || errored) {
        return <Package className={cn(iconSize, 'text-muted-foreground/40')} />;
    }
    return (
        <img
            src={src}
            alt={alt}
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
        />
    );
};

interface Props {
    obras: { id: number; nombre: string }[];
    onCrear: (data: any) => Promise<any>;
    onClose: () => void;
}

interface CartLine {
    item_id: number;
    cantidad: number;
}

interface CustomItem {
    // id local (timestamp) — solo para React keys, no se manda al backend
    _localId: number;
    descripcion: string;
    cantidad: number;
    unidad: string;
    observacion: string;
}

const SolicitudForm: React.FC<Props> = ({ obras, onCrear, onClose }) => {
    const { fetchStockPorItems } = useTransferencias();
    const itemDetail = useItemDetail();

    // Catálogo + stock
    const [catalogo, setCatalogo] = useState<ItemInventario[]>([]);
    const [categorias, setCategorias] = useState<CategoriaInventario[]>([]);
    const [stockMap, setStockMap] = useState<Record<number, StockUbicacion[]>>({});
    const [loadingCatalog, setLoadingCatalog] = useState(true);

    // Filtros
    const [search, setSearch] = useState('');
    const [categoriaFilter, setCategoriaFilter] = useState<number | 'todas'>('todas');
    const [mostrarSinStock, setMostrarSinStock] = useState(false);

    // Carrito + metadata solicitud
    const [cart, setCart] = useState<CartLine[]>([]);
    // Items personalizados — fuera del catálogo. El aprobador los lee
    // para tramitar compra o conseguirlos. Llegan al transportista en
    // el mensaje WhatsApp en sección separada.
    const [customItems, setCustomItems] = useState<CustomItem[]>([]);
    const [destinoObraId, setDestinoObraId] = useState<number | null>(null);
    const [observaciones, setObservaciones] = useState('');
    const [requierePionetas, setRequierePionetas] = useState(false);
    const [cantidadPionetas, setCantidadPionetas] = useState<number>(0);
    const [submitting, setSubmitting] = useState(false);

    // Tab activa en mobile ("cat" | "sol")
    const [mobileTab, setMobileTab] = useState<'cat' | 'sol'>('cat');

    // Load catálogo + categorías + stock al abrir
    useEffect(() => {
        Promise.all([
            api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500'),
            api.get<ApiResponse<CategoriaInventario[]>>('/categorias-inventario?activo=true&limit=50'),
        ]).then(async ([itemsRes, catRes]) => {
            const items = itemsRes.data.data;
            setCatalogo(items);
            setCategorias(catRes.data.data.sort((a, b) => (a.orden || 0) - (b.orden || 0)));
            if (items.length) {
                const stock = await fetchStockPorItems(items.map(i => i.id));
                setStockMap(stock);
            }
            setLoadingCatalog(false);
        }).catch(() => setLoadingCatalog(false));
    }, [fetchStockPorItems]);

    // Stock total por ítem
    const stockTotalById = useMemo(() => {
        const m: Record<number, number> = {};
        Object.entries(stockMap).forEach(([id, ubis]) => {
            m[Number(id)] = ubis.reduce((s, u) => s + Number(u.cantidad || 0), 0);
        });
        return m;
    }, [stockMap]);

    // Cantidad por ítem en el carrito (acceso rápido)
    const cartMap = useMemo(() => {
        const m: Record<number, number> = {};
        cart.forEach(l => { m[l.item_id] = l.cantidad; });
        return m;
    }, [cart]);

    // Conteo de ítems por categoría (tras filtro de stock)
    const countsByCategoria = useMemo(() => {
        const m: Record<string, number> = { todas: 0 };
        catalogo.forEach(c => {
            if (!mostrarSinStock && (stockTotalById[c.id] || 0) === 0) return;
            m.todas = (m.todas || 0) + 1;
            const key = String(c.categoria_id);
            m[key] = (m[key] || 0) + 1;
        });
        return m;
    }, [catalogo, stockTotalById, mostrarSinStock]);

    // Catálogo filtrado + ordenado
    const filteredCatalog = useMemo(() => {
        const q = search.trim().toLowerCase();
        return catalogo
            .filter(c => {
                const total = stockTotalById[c.id] || 0;
                if (!mostrarSinStock && total === 0) return false;
                if (categoriaFilter !== 'todas' && c.categoria_id !== categoriaFilter) return false;
                if (q) {
                    const hay = `${c.nro_item} ${c.descripcion}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            })
            .sort((a, b) => {
                const sa = stockTotalById[a.id] || 0;
                const sb = stockTotalById[b.id] || 0;
                // Con stock primero, luego por nro_item ASC
                if ((sa > 0) !== (sb > 0)) return sa > 0 ? -1 : 1;
                return (a.nro_item || 0) - (b.nro_item || 0);
            });
    }, [catalogo, stockTotalById, search, categoriaFilter, mostrarSinStock]);

    // Carrito: líneas enriquecidas
    const cartDetails = useMemo(() => cart.map(l => {
        const item = catalogo.find(c => c.id === l.item_id);
        const disponible = stockTotalById[l.item_id] || 0;
        return { ...l, item, disponible, excede: l.cantidad > disponible };
    }), [cart, catalogo, stockTotalById]);

    const totalItemsCart = cart.reduce((s, l) => s + l.cantidad, 0);
    const hayExceso = cartDetails.some(d => d.excede);

    // ── Carrito ops ──
    const addToCart = (itemId: number) => {
        setCart(prev => {
            if (prev.some(l => l.item_id === itemId)) return prev;
            return [...prev, { item_id: itemId, cantidad: 1 }];
        });
    };
    const updateCartQty = (itemId: number, cantidad: number) => {
        if (cantidad < 1) { removeFromCart(itemId); return; }
        setCart(prev => prev.map(l => l.item_id === itemId ? { ...l, cantidad } : l));
    };
    const removeFromCart = (itemId: number) => {
        setCart(prev => prev.filter(l => l.item_id !== itemId));
    };

    // ── Custom items ops ──
    const addCustomItem = () => {
        setCustomItems(prev => [...prev, {
            _localId: Date.now() + Math.random(),
            descripcion: '',
            cantidad: 1,
            unidad: '',
            observacion: '',
        }]);
    };
    const updateCustomItem = (localId: number, patch: Partial<Omit<CustomItem, '_localId'>>) => {
        setCustomItems(prev => prev.map(c => c._localId === localId ? { ...c, ...patch } : c));
    };
    const removeCustomItem = (localId: number) => {
        setCustomItems(prev => prev.filter(c => c._localId !== localId));
    };

    // Custom items válidos para envío: descripcion no vacía + cantidad >= 1
    const customItemsValidos = useMemo(() => customItems.filter(c =>
        c.descripcion.trim() && Number(c.cantidad) >= 1
    ), [customItems]);
    const hayCustomInvalidos = customItems.length > customItemsValidos.length;

    const handleSubmit = async () => {
        if (!destinoObraId) { toast.error('Selecciona un destino'); return; }
        if (!cart.length && !customItemsValidos.length) {
            toast.error('Agrega al menos un ítem (catálogo o personalizado)');
            return;
        }
        if (hayExceso) { toast.error('Hay ítems con cantidad mayor al stock disponible'); return; }
        if (hayCustomInvalidos) {
            toast.error('Hay ítems personalizados sin descripción o cantidad inválida');
            return;
        }

        setSubmitting(true);
        const result = await onCrear({
            destino_obra_id: destinoObraId,
            items: cart.map(l => ({ item_id: l.item_id, cantidad: l.cantidad })),
            items_custom: customItemsValidos.map(c => ({
                descripcion: c.descripcion.trim(),
                cantidad: Number(c.cantidad),
                unidad: c.unidad.trim() || undefined,
                observacion: c.observacion.trim() || undefined,
            })),
            observaciones: observaciones || undefined,
            requiere_pionetas: requierePionetas,
            cantidad_pionetas: requierePionetas ? cantidadPionetas : undefined,
        });
        setSubmitting(false);
        if (result) onClose();
    };

    const puedeCrear = !!destinoObraId
        && (cart.length > 0 || customItemsValidos.length > 0)
        && !hayExceso
        && !hayCustomInvalidos
        && !submitting;

    // ── Subcomponentes inline ──

    const CategoriaChips = () => (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
            <button
                type="button"
                onClick={() => setCategoriaFilter('todas')}
                className={cn(
                    'shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors',
                    categoriaFilter === 'todas'
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-brand-dark border-[#E8E8ED] hover:border-brand-primary/40'
                )}
            >
                Todas <span className="opacity-70 font-semibold">{countsByCategoria.todas || 0}</span>
            </button>
            {categorias.map(cat => {
                const count = countsByCategoria[String(cat.id)] || 0;
                const active = categoriaFilter === cat.id;
                return (
                    <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoriaFilter(cat.id)}
                        className={cn(
                            'shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full border transition-colors',
                            active
                                ? 'bg-brand-primary text-white border-brand-primary'
                                : 'bg-white text-brand-dark border-[#E8E8ED] hover:border-brand-primary/40'
                        )}
                    >
                        {cat.nombre} <span className="opacity-70 font-semibold">{count}</span>
                    </button>
                );
            })}
        </div>
    );

    const CatalogCard: React.FC<{ item: ItemInventario }> = ({ item }) => {
        const disponible = stockTotalById[item.id] || 0;
        const enCarrito = cartMap[item.id];
        const sinStock = disponible === 0;
        const excede = enCarrito !== undefined && enCarrito > disponible;

        return (
            <div
                className={cn(
                    'rounded-xl border bg-white p-3 flex gap-3 transition-all',
                    enCarrito
                        ? excede
                            ? 'border-red-300 ring-1 ring-red-200'
                            : 'border-brand-primary ring-1 ring-brand-primary/30 shadow-sm'
                        : 'border-[#E8E8ED] hover:border-[#D0D0D5]',
                    sinStock && 'opacity-60'
                )}
            >
                {/* Miniatura */}
                <button
                    type="button"
                    onClick={() => itemDetail.openItem(item.id, item)}
                    className="shrink-0 w-[60px] h-[60px] rounded-lg overflow-hidden bg-[#F5F5F7] flex items-center justify-center hover:ring-2 hover:ring-brand-primary/30 transition-all"
                    title="Ver detalle"
                >
                    <ItemThumb
                        src={resolveImageUrl(item.imagen_url)}
                        alt={item.descripcion}
                        size="md"
                    />
                </button>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <div className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                                #{item.nro_item} · {item.unidad}
                            </div>
                            <button
                                type="button"
                                onClick={() => itemDetail.openItem(item.id, item)}
                                className="text-xs font-bold text-brand-dark leading-tight line-clamp-2 text-left hover:text-brand-primary hover:underline transition-colors"
                                title="Ver ficha del ítem"
                            >
                                {item.descripcion}
                            </button>
                        </div>
                        {enCarrito !== undefined && (
                            <div className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-brand-primary text-white">
                                <Check className="h-3 w-3" strokeWidth={3} />
                            </div>
                        )}
                    </div>

                    <div className="mt-1.5 flex items-center justify-between gap-2">
                        <StockBadge
                            disponible={disponible}
                            solicitado={enCarrito}
                            ubicaciones={stockMap[item.id] || []}
                            unidad={item.unidad}
                        />
                        {enCarrito === undefined ? (
                            <button
                                type="button"
                                onClick={() => addToCart(item.id)}
                                disabled={sinStock}
                                className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-brand-primary rounded-lg hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <Plus className="h-3 w-3" strokeWidth={3} />
                                Agregar
                            </button>
                        ) : (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateCartQty(item.id, enCarrito - 1)}
                                    className="w-6 h-6 rounded-md bg-[#F0F0F5] hover:bg-[#E5E5EA] flex items-center justify-center transition-colors"
                                >
                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <input
                                    type="number"
                                    min={0}
                                    value={enCarrito}
                                    onChange={e => updateCartQty(item.id, parseInt(e.target.value) || 0)}
                                    className={cn(
                                        'w-10 h-6 px-1 text-[11px] font-bold text-center border rounded-md',
                                        excede ? 'border-red-400 text-red-700' : 'border-[#E8E8ED]'
                                    )}
                                />
                                <button
                                    type="button"
                                    onClick={() => updateCartQty(item.id, enCarrito + 1)}
                                    className="w-6 h-6 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary flex items-center justify-center transition-colors"
                                >
                                    <Plus className="h-3 w-3" strokeWidth={3} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // ── Columna: Catálogo ──
    const CatalogColumn = (
        <div className="flex flex-col min-h-0 flex-1">
            {/* Sticky search + filters */}
            <div className="shrink-0 space-y-2 pb-3 sticky top-0 bg-white z-10">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o número..."
                        className="w-full h-10 pl-9 pr-3 text-sm border border-[#E8E8ED] rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                    />
                </div>
                <CategoriaChips />
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={mostrarSinStock}
                            onChange={e => setMostrarSinStock(e.target.checked)}
                            className="rounded border-[#E8E8ED] h-3.5 w-3.5"
                        />
                        Mostrar ítems sin stock
                    </label>
                    <span className="text-[10px] text-muted-foreground font-medium">
                        {filteredCatalog.length} {filteredCatalog.length === 1 ? 'resultado' : 'resultados'}
                    </span>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto -mr-1 pr-1">
                {loadingCatalog ? (
                    <div className="text-center py-12 text-sm text-muted-foreground">Cargando catálogo...</div>
                ) : filteredCatalog.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">No hay ítems que coincidan con tu búsqueda</p>
                        <button
                            type="button"
                            onClick={() => { setSearch(''); setCategoriaFilter('todas'); }}
                            className="text-xs font-bold text-brand-primary hover:underline"
                        >
                            Limpiar filtros
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {filteredCatalog.map(item => (
                            <CatalogCard key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>

            {/* Mobile: floating CTA hacia Mi solicitud */}
            {(cart.length > 0 || customItems.length > 0) && (
                <button
                    type="button"
                    onClick={() => setMobileTab('sol')}
                    className="md:hidden sticky bottom-0 w-full mt-2 flex items-center justify-between gap-2 px-4 py-3 bg-brand-primary text-white rounded-xl font-bold text-sm shadow-lg"
                >
                    <span className="flex items-center gap-2">
                        <ShoppingCart className="h-4 w-4" />
                        Ver mi solicitud ({cart.length + customItems.length})
                    </span>
                    <ChevronRight className="h-4 w-4" />
                </button>
            )}
        </div>
    );

    // ── Columna: Solicitud / Carrito ──
    const CartColumn = (
        <div className="flex flex-col min-h-0 gap-3">
            {/* Destino */}
            <div className="shrink-0">
                <SearchableSelect
                    label="Destino"
                    options={obras.map(o => ({ value: o.id, label: o.nombre }))}
                    value={destinoObraId}
                    onChange={(val) => setDestinoObraId(val as number | null)}
                    placeholder="Seleccionar obra destino..."
                />
            </div>

            {/* Cart header */}
            <div className="shrink-0 flex items-center justify-between">
                <div className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    Tu solicitud
                    <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-brand-primary/10 text-brand-primary">
                        {cart.length + customItems.length}
                    </span>
                </div>
                {(totalItemsCart > 0 || customItems.length > 0) && (
                    <span className="text-[10px] text-muted-foreground font-medium">
                        {cart.length} catálogo · {customItems.length} personalizado(s)
                    </span>
                )}
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto min-h-[80px] -mr-1 pr-1">
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 border-2 border-dashed border-[#E8E8ED] rounded-xl">
                        <ShoppingCart className="h-8 w-8 text-muted-foreground/30 mb-2" />
                        <p className="text-xs text-muted-foreground">
                            Agrega ítems del catálogo para armar tu solicitud
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-1.5">
                        {cartDetails.map(d => (
                            <li
                                key={d.item_id}
                                className={cn(
                                    'bg-white border rounded-xl p-2 flex gap-2 items-start',
                                    d.excede ? 'border-red-300 bg-red-50/30' : 'border-[#E8E8ED]'
                                )}
                            >
                                {/* Thumbnail */}
                                <div className="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-[#F5F5F7] flex items-center justify-center">
                                    <ItemThumb
                                        src={resolveImageUrl(d.item?.imagen_url)}
                                        alt={d.item?.descripcion || ''}
                                        size="sm"
                                    />
                                </div>

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                    <button
                                        type="button"
                                        onClick={() => d.item && itemDetail.openItem(d.item.id, d.item)}
                                        disabled={!d.item}
                                        className="text-[11px] font-bold text-brand-dark leading-tight line-clamp-2 text-left hover:text-brand-primary hover:underline transition-colors disabled:hover:no-underline disabled:hover:text-brand-dark"
                                        title="Ver ficha del ítem"
                                    >
                                        {d.item?.descripcion || `Ítem #${d.item_id}`}
                                    </button>
                                    <div className="mt-1 flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => updateCartQty(d.item_id, d.cantidad - 1)}
                                            className="w-5 h-5 rounded-md bg-[#F0F0F5] hover:bg-[#E5E5EA] flex items-center justify-center"
                                        >
                                            <Minus className="h-2.5 w-2.5 text-muted-foreground" />
                                        </button>
                                        <input
                                            type="number"
                                            min={0}
                                            value={d.cantidad}
                                            onChange={e => updateCartQty(d.item_id, parseInt(e.target.value) || 0)}
                                            className={cn(
                                                'w-10 h-5 px-1 text-[11px] font-bold text-center border rounded-md',
                                                d.excede ? 'border-red-400 text-red-700' : 'border-[#E8E8ED]'
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateCartQty(d.item_id, d.cantidad + 1)}
                                            className="w-5 h-5 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary flex items-center justify-center"
                                        >
                                            <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                                        </button>
                                        <span className="text-[10px] text-muted-foreground ml-1">{d.item?.unidad || 'U'}</span>
                                    </div>
                                    {d.excede && (
                                        <div className="mt-1 flex items-center gap-1 text-[10px] text-red-700 font-medium">
                                            <AlertCircle className="h-2.5 w-2.5" />
                                            Solo hay {d.disponible} disponibles
                                        </div>
                                    )}
                                </div>

                                {/* Remove */}
                                <button
                                    type="button"
                                    onClick={() => removeFromCart(d.item_id)}
                                    className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* Items personalizados (no en catálogo) */}
            <div className="shrink-0 border-t border-[#E8E8ED] pt-2">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="text-[10px] font-bold text-brand-dark flex items-center gap-1">
                        <ShoppingBag className="h-3 w-3" />
                        Personalizados (a comprar)
                        {customItems.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[9px]">
                                {customItems.length}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={addCustomItem}
                        className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors"
                    >
                        <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                        Agregar
                    </button>
                </div>
                {customItems.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground italic px-1">
                        Items que no están en el catálogo (ej. cosas a comprar). El aprobador los verá.
                    </p>
                ) : (
                    <ul className="space-y-1.5 max-h-[180px] overflow-y-auto -mr-1 pr-1">
                        {customItems.map(c => {
                            const invalido = !c.descripcion.trim() || Number(c.cantidad) < 1;
                            return (
                                <li
                                    key={c._localId}
                                    className={cn(
                                        'rounded-lg border p-1.5 bg-amber-50/40',
                                        invalido ? 'border-red-300' : 'border-amber-200'
                                    )}
                                >
                                    <div className="flex gap-1.5 items-start">
                                        <input
                                            type="text"
                                            value={c.descripcion}
                                            onChange={e => updateCustomItem(c._localId, { descripcion: e.target.value })}
                                            placeholder="Descripción del ítem*"
                                            maxLength={500}
                                            className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-[#E8E8ED] rounded-md bg-white focus:ring-1 focus:ring-brand-primary outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeCustomItem(c._localId)}
                                            className="shrink-0 p-1 text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                            aria-label="Eliminar item personalizado"
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    </div>
                                    <div className="mt-1 flex gap-1.5 items-center">
                                        <input
                                            type="number"
                                            min={1}
                                            value={c.cantidad}
                                            onChange={e => updateCustomItem(c._localId, { cantidad: parseInt(e.target.value) || 0 })}
                                            placeholder="Cant."
                                            className="w-14 px-2 py-1 text-[11px] font-bold text-center border border-[#E8E8ED] rounded-md bg-white"
                                        />
                                        <input
                                            type="text"
                                            value={c.unidad}
                                            onChange={e => updateCustomItem(c._localId, { unidad: e.target.value })}
                                            placeholder="Unidad (kg, m, U...)"
                                            maxLength={50}
                                            className="flex-1 min-w-0 px-2 py-1 text-[11px] border border-[#E8E8ED] rounded-md bg-white"
                                        />
                                    </div>
                                    <input
                                        type="text"
                                        value={c.observacion}
                                        onChange={e => updateCustomItem(c._localId, { observacion: e.target.value })}
                                        placeholder="Observación opcional (marca, especificación...)"
                                        className="mt-1 w-full px-2 py-1 text-[10px] border border-[#E8E8ED] rounded-md bg-white"
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Observaciones + Pionetas */}
            <div className="shrink-0 space-y-2">
                <div>
                    <label className="text-[10px] font-bold text-brand-dark block mb-1">Observaciones</label>
                    <textarea
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Opcional..."
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E8E8ED] rounded-lg resize-none h-14 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-brand-dark cursor-pointer">
                        <input
                            type="checkbox"
                            checked={requierePionetas}
                            onChange={e => setRequierePionetas(e.target.checked)}
                            className="rounded border-[#E8E8ED]"
                        />
                        Requiere pionetas
                    </label>
                    {requierePionetas && (
                        <input
                            type="number"
                            min={1}
                            value={cantidadPionetas}
                            onChange={e => setCantidadPionetas(parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 text-xs border border-[#E8E8ED] rounded-lg text-center"
                            placeholder="Cant."
                        />
                    )}
                </div>
            </div>

            {/* CTA */}
            <div className="shrink-0 pt-2 border-t border-[#E8E8ED] flex gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!puedeCrear}
                    title={
                        !destinoObraId ? 'Selecciona un destino'
                        : (cart.length === 0 && customItemsValidos.length === 0) ? 'Agrega al menos un ítem (catálogo o personalizado)'
                        : hayExceso ? 'Hay ítems con cantidad mayor al stock'
                        : hayCustomInvalidos ? 'Hay ítems personalizados sin descripción o cantidad inválida'
                        : undefined
                    }
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm shadow-brand-primary/20"
                >
                    <Send className="h-3.5 w-3.5" />
                    {submitting ? 'Enviando...' : 'Crear Solicitud'}
                </button>
            </div>
        </div>
    );

    return (
        <>
            {/* Mobile tabs */}
            <div className="md:hidden mb-3 flex gap-1.5 p-1 bg-[#F5F5F7] rounded-xl">
                <button
                    type="button"
                    onClick={() => setMobileTab('cat')}
                    className={cn(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                        mobileTab === 'cat' ? 'bg-white text-brand-dark shadow-sm' : 'text-muted-foreground'
                    )}
                >
                    Catálogo
                </button>
                <button
                    type="button"
                    onClick={() => setMobileTab('sol')}
                    className={cn(
                        'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                        mobileTab === 'sol' ? 'bg-white text-brand-dark shadow-sm' : 'text-muted-foreground'
                    )}
                >
                    Mi solicitud {(cart.length + customItems.length) > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-brand-primary text-white">{cart.length + customItems.length}</span>}
                </button>
            </div>

            {/* Layout: desktop two columns, mobile tabs */}
            <div className="flex flex-col md:flex-row gap-4 min-h-0 md:h-[calc(85vh-120px)]">
                <div className={cn('flex flex-col min-h-0 flex-1', mobileTab === 'cat' ? 'flex' : 'hidden md:flex')}>
                    {CatalogColumn}
                </div>
                <div className={cn(
                    'flex flex-col min-h-0 md:w-[360px] md:shrink-0 md:border-l md:border-[#E8E8ED] md:pl-4',
                    mobileTab === 'sol' ? 'flex' : 'hidden md:flex'
                )}>
                    {CartColumn}
                </div>
            </div>

            {/* Detail modal (shared) */}
            <ItemDetailModal
                isOpen={!!itemDetail.selectedItemId}
                onClose={itemDetail.closeItem}
                itemData={itemDetail.itemData}
                stockLocations={itemDetail.stockLocations}
                loading={itemDetail.loading}
                stockLoading={itemDetail.stockLoading}
            />
        </>
    );
};

export default SolicitudForm;

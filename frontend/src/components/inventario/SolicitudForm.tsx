import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, Trash2, Send, Search, Package, AlertCircle, ShoppingCart, ChevronRight, Check, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario, CategoriaInventario, Obra } from '../../types/entities';
import { SearchableSelect } from '../ui/SearchableSelect';
import { FieldError } from '../ui/FieldError';
import { Skeleton } from '../ui/Skeleton';
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
    /** Ya no se usa: el form fetchea sus obras filtradas por participa_transferencias. */
    obras?: { id: number; nombre: string }[];
    onCrear: (data: any) => Promise<any>;
    onClose: () => void;
    /**
     * Si true: oculta la columna de catálogo y muestra solo el panel de la solicitud
     * (destino, items personalizados, observaciones, pionetas, CTA). Usado para el
     * flujo "Solicitud de Materiales" donde el aprobador compra los items.
     */
    hideCatalog?: boolean;
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

const SolicitudForm: React.FC<Props> = ({ onCrear, onClose, hideCatalog = false }) => {
    const { fetchStockPorItems } = useTransferencias();
    const itemDetail = useItemDetail();

    // Obras destino filtradas por participa_transferencias (no el prop inventario-scoped).
    const [obras, setObras] = useState<{ id: number; nombre: string }[]>([]);

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
            api.get<ApiResponse<Obra[]>>('/obras?activo=true&participa_transferencias=1&limit=500'),
        ]).then(async ([itemsRes, catRes, obrasRes]) => {
            const items = itemsRes.data.data;
            setCatalogo(items);
            setObras((obrasRes.data.data || []).map(o => ({ id: o.id, nombre: o.nombre })));
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
    // Prepend: el nuevo item vacío aparece arriba y los ya completados bajan.
    // Esto permite "agregar uno a uno" sin tener que hacer scroll buscando el
    // input vacío al final de la lista. UX optimizado para jefes de obra.
    const addCustomItem = () => {
        setCustomItems(prev => [{
            _localId: Date.now() + Math.random(),
            descripcion: '',
            cantidad: 1,
            unidad: '',
            observacion: '',
        }, ...prev]);
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
    // Solo BLOQUEAN las filas EMPEZADAS pero incompletas (algo escrito + falta
    // descripción o cantidad). Las filas totalmente vacías se IGNORAN al crear
    // (no bloquean): el jefe de obra puede dejar una en cola sin quedar trabado.
    const hayCustomInvalidos = useMemo(() => customItems.some(c => {
        const tieneAlgo = c.descripcion.trim() || c.unidad.trim() || c.observacion.trim();
        return tieneAlgo && (!c.descripcion.trim() || Number(c.cantidad) < 1);
    }), [customItems]);

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
                    'shrink-0 text-label font-bold px-3 py-1.5 rounded-full border transition-colors',
                    categoriaFilter === 'todas'
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-card text-brand-dark border-border hover:border-brand-primary/40'
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
                            'shrink-0 text-label font-bold px-3 py-1.5 rounded-full border transition-colors',
                            active
                                ? 'bg-brand-primary text-white border-brand-primary'
                                : 'bg-card text-brand-dark border-border hover:border-brand-primary/40'
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
                    'rounded-xl border bg-card p-3 flex gap-3 transition-all',
                    enCarrito
                        ? excede
                            ? 'border-red-300 ring-1 ring-red-200 dark:border-red-800/60 dark:ring-red-900/40'
                            : 'border-brand-primary ring-1 ring-brand-primary/30 shadow-sm'
                        : 'border-border hover:border-[var(--border-hover)]',
                    sinStock && 'opacity-60'
                )}
            >
                {/* Miniatura */}
                <button
                    type="button"
                    onClick={() => itemDetail.openItem(item.id, item)}
                    className="shrink-0 w-[60px] h-[60px] rounded-lg overflow-hidden bg-muted flex items-center justify-center hover:ring-2 hover:ring-brand-primary/30 transition-all"
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
                            <div className="text-micro font-bold text-muted-foreground uppercase tracking-wider">
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
                                className="flex items-center gap-1 px-2.5 py-1 text-caption font-bold text-white bg-brand-primary rounded-lg hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                            >
                                <Plus className="h-3 w-3" strokeWidth={3} />
                                Agregar
                            </button>
                        ) : (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => updateCartQty(item.id, enCarrito - 1)}
                                    className="w-6 h-6 rounded-md bg-muted hover:bg-muted flex items-center justify-center transition-colors"
                                >
                                    <Minus className="h-3 w-3 text-muted-foreground" />
                                </button>
                                <input
                                    type="number"
                                    min={0}
                                    value={enCarrito}
                                    onChange={e => updateCartQty(item.id, parseInt(e.target.value) || 0)}
                                    className={cn(
                                        'w-10 h-6 px-1 text-label font-bold text-center border rounded-md',
                                        excede ? 'border-red-400 text-red-700 dark:border-red-500/40 dark:text-red-300' : 'border-border'
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
            <div className="shrink-0 space-y-2 pb-3 sticky top-0 bg-card z-10">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre o número..."
                        className="w-full h-10 pl-9 pr-3 text-sm border border-border rounded-xl focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all"
                    />
                </div>
                <CategoriaChips />
                <div className="flex items-center justify-between">
                    <label className="flex items-center gap-1.5 text-label text-muted-foreground cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={mostrarSinStock}
                            onChange={e => setMostrarSinStock(e.target.checked)}
                            className="rounded border-border h-3.5 w-3.5"
                        />
                        Mostrar ítems sin stock
                    </label>
                    <span className="text-caption text-muted-foreground font-medium">
                        {filteredCatalog.length} {filteredCatalog.length === 1 ? 'resultado' : 'resultados'}
                    </span>
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto -mr-1 pr-1">
                {loadingCatalog ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-20 w-full rounded-xl" />
                        ))}
                    </div>
                ) : filteredCatalog.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="h-10 w-10 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground mb-3">No hay ítems que coincidan con tu búsqueda</p>
                        <button
                            type="button"
                            onClick={() => { setSearch(''); setCategoriaFilter('todas'); }}
                            className="text-xs font-bold text-green-700 dark:text-green-300 hover:underline"
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
            {/* Destino arriba — solo cuando hay catálogo. En hideCatalog se renderiza al final. */}
            {!hideCatalog && (
                <div className="shrink-0">
                    <SearchableSelect
                        label="Destino"
                        options={obras.map(o => ({ value: o.id, label: o.nombre }))}
                        value={destinoObraId}
                        onChange={(val) => setDestinoObraId(val as number | null)}
                        placeholder="Seleccionar obra destino..."
                    />
                </div>
            )}

            {/* Cart header — solo cuando hay catálogo */}
            {!hideCatalog && (
                <div className="shrink-0 flex items-center justify-between">
                    <div className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                        <ShoppingCart className="h-3.5 w-3.5" />
                        Tu solicitud
                        <span className="ml-1 px-1.5 py-0.5 text-caption rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300">
                            {cart.length + customItems.length}
                        </span>
                    </div>
                    {(totalItemsCart > 0 || customItems.length > 0) && (
                        <span className="text-caption text-muted-foreground font-medium">
                            {cart.length} catálogo · {customItems.length} personalizado(s)
                        </span>
                    )}
                </div>
            )}

            {/* Cart items — hideCatalog oculta esto, ya que no hay catálogo del que armar carrito */}
            <div className={cn(
                "overflow-y-auto -mr-1 pr-1",
                hideCatalog ? "hidden" : "flex-1 min-h-[80px]"
            )}>
                {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center px-4 py-6 border-2 border-dashed border-border rounded-xl">
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
                                    'bg-card border rounded-xl p-2 flex gap-2 items-start',
                                    d.excede ? 'border-red-300 bg-red-50/30 dark:border-red-800/60 dark:bg-red-950/20' : 'border-border'
                                )}
                            >
                                {/* Thumbnail */}
                                <div className="shrink-0 w-8 h-8 rounded-md overflow-hidden bg-muted flex items-center justify-center">
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
                                        className="text-label font-bold text-brand-dark leading-tight line-clamp-2 text-left hover:text-brand-primary hover:underline transition-colors disabled:hover:no-underline disabled:hover:text-brand-dark"
                                        title="Ver ficha del ítem"
                                    >
                                        {d.item?.descripcion || `Ítem #${d.item_id}`}
                                    </button>
                                    <div className="mt-1 flex items-center gap-1">
                                        <button
                                            type="button"
                                            onClick={() => updateCartQty(d.item_id, d.cantidad - 1)}
                                            className="w-5 h-5 rounded-md bg-muted hover:bg-muted flex items-center justify-center"
                                        >
                                            <Minus className="h-2.5 w-2.5 text-muted-foreground" />
                                        </button>
                                        <input
                                            type="number"
                                            min={0}
                                            value={d.cantidad}
                                            onChange={e => updateCartQty(d.item_id, parseInt(e.target.value) || 0)}
                                            className={cn(
                                                'w-10 h-5 px-1 text-label font-bold text-center border rounded-md',
                                                d.excede ? 'border-red-400 text-red-700 dark:border-red-500/40 dark:text-red-300' : 'border-border'
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => updateCartQty(d.item_id, d.cantidad + 1)}
                                            className="w-5 h-5 rounded-md bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary flex items-center justify-center"
                                        >
                                            <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                                        </button>
                                        <span className="text-caption text-muted-foreground ml-1">{d.item?.unidad || 'U'}</span>
                                    </div>
                                    {d.excede && (
                                        <FieldError
                                            className="mt-1"
                                            icon={<AlertCircle className="h-2.5 w-2.5" />}
                                            message={`Solo hay ${d.disponible} disponibles`}
                                        />
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

            {/* Items personalizados (no en catálogo).
                En hideCatalog ocupa el alto disponible (flex-1) — antes quedaba capado
                a 180px desperdiciando el modal. Cards grandes y legibles, inválidos en rojo. */}
            <div className={cn(
                "border-t border-border pt-3",
                hideCatalog ? "flex-1 min-h-0 flex flex-col" : "shrink-0"
            )}>
                <div className="flex items-center justify-between mb-2 shrink-0">
                    <div className="text-xs md:text-sm font-bold text-brand-dark flex items-center gap-1.5">
                        <ShoppingBag className="h-4 w-4 text-amber-600" />
                        Personalizados (a comprar)
                        {customItems.length > 0 && (
                            <span className="ml-0.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-caption font-black">
                                {customItems.length}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={addCustomItem}
                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold text-white bg-brand-primary hover:bg-brand-primary/90 border border-brand-primary rounded-lg shadow-sm transition-colors md:px-3 md:py-1.5 md:text-xs md:text-amber-800 dark:md:text-amber-300 md:bg-amber-50 dark:md:bg-amber-950/30 md:hover:bg-amber-100 md:border-amber-200 dark:md:border-amber-800/60 md:shadow-none"
                    >
                        <Plus className="h-4 w-4 md:h-3.5 md:w-3.5" strokeWidth={3} />
                        Agregar ítem
                    </button>
                </div>
                {customItems.length === 0 ? (
                    <div className={cn(
                        "flex flex-col items-center justify-center text-center px-4 border-2 border-dashed border-amber-200 rounded-xl bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/20",
                        hideCatalog ? "flex-1 py-10" : "py-6"
                    )}>
                        <ShoppingBag className="h-8 w-8 text-amber-400/70 mb-2" />
                        <p className="text-xs text-muted-foreground max-w-[280px]">
                            Ítems que no están en el catálogo (ej. cosas a comprar). Toca <span className="font-bold text-amber-700 dark:text-amber-300">Agregar ítem</span> para empezar.
                        </p>
                    </div>
                ) : (
                    <ul className={cn(
                        "space-y-2",
                        hideCatalog ? "flex-1 overflow-y-auto -mr-1 pr-1" : "md:max-h-[180px] md:overflow-y-auto md:-mr-1 md:pr-1"
                    )}>
                        {customItems.map((c, idx) => {
                            const desc = c.descripcion.trim();
                            const tieneAlgo = !!(desc || c.unidad.trim() || c.observacion.trim());
                            const esVacio = !tieneAlgo;                                   // fila en blanco → se ignora al crear (no bloquea)
                            const error = tieneAlgo && (!desc || Number(c.cantidad) < 1); // empezada pero incompleta → bloquea
                            // El primer item es el más reciente (prepend). Autofocus en su
                            // descripción facilita "agregar uno a uno" sin buscar el input nuevo.
                            const esNuevo = idx === 0 && esVacio;
                            return (
                                <li
                                    key={c._localId}
                                    className={cn(
                                        'rounded-xl border p-3 transition-all',
                                        error
                                            ? 'border-red-300 ring-1 ring-red-200/50 bg-red-50/20 dark:border-red-800/60 dark:ring-red-900/40 dark:bg-red-950/20'
                                            : esVacio
                                                ? 'border-dashed border-amber-200 bg-amber-50/20 dark:border-amber-800/60 dark:bg-amber-950/20'
                                                : 'border-amber-200 bg-amber-50/30 dark:border-amber-800/60 dark:bg-amber-950/20'
                                    )}
                                >
                                    {/* Descripción + eliminar */}
                                    <div className="flex gap-2 items-center">
                                        <span className="shrink-0 w-6 h-6 rounded-lg bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300 text-label font-black flex items-center justify-center">
                                            {idx + 1}
                                        </span>
                                        <input
                                            type="text"
                                            value={c.descripcion}
                                            onChange={e => updateCustomItem(c._localId, { descripcion: e.target.value })}
                                            placeholder="Descripción del ítem *"
                                            maxLength={500}
                                            autoFocus={esNuevo}
                                            className={cn(
                                                "flex-1 min-w-0 h-9 px-3 text-sm font-medium rounded-lg bg-card outline-none focus:ring-2 focus:ring-brand-primary/30 border",
                                                error && !desc ? "border-red-300" : "border-border"
                                            )}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeCustomItem(c._localId)}
                                            className="shrink-0 p-2 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                            aria-label="Eliminar item personalizado"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    </div>
                                    {/* Cantidad + unidad (alineadas bajo la descripción) */}
                                    <div className="mt-2 pl-8 grid grid-cols-[96px_1fr] gap-2">
                                        <input
                                            type="number"
                                            min={1}
                                            value={c.cantidad}
                                            onChange={e => updateCustomItem(c._localId, { cantidad: parseInt(e.target.value) || 0 })}
                                            placeholder="Cant."
                                            className="h-9 px-2 text-sm font-bold text-center border border-border rounded-lg bg-card outline-none focus:ring-2 focus:ring-brand-primary/30"
                                        />
                                        <input
                                            type="text"
                                            value={c.unidad}
                                            onChange={e => updateCustomItem(c._localId, { unidad: e.target.value })}
                                            placeholder="Unidad (kg, m, U, sacos...)"
                                            maxLength={50}
                                            className="h-9 min-w-0 px-3 text-sm border border-border rounded-lg bg-card outline-none focus:ring-2 focus:ring-brand-primary/30"
                                        />
                                    </div>
                                    {/* Observación */}
                                    <div className="mt-2 pl-8">
                                        <input
                                            type="text"
                                            value={c.observacion}
                                            onChange={e => updateCustomItem(c._localId, { observacion: e.target.value })}
                                            placeholder="Observación opcional (marca, especificación...)"
                                            className="w-full h-8 px-3 text-xs border border-border rounded-lg bg-card outline-none focus:ring-2 focus:ring-brand-primary/30"
                                        />
                                    </div>
                                    {error ? (
                                        <FieldError
                                            className="mt-2 pl-8"
                                            icon={<AlertCircle className="h-3 w-3 shrink-0" />}
                                            message={!desc ? 'Falta la descripción del ítem' : 'La cantidad debe ser 1 o más'}
                                        />
                                    ) : esVacio ? (
                                        <p className="mt-2 pl-8 flex items-center gap-1 text-label text-muted-foreground/70">
                                            <AlertCircle className="h-3 w-3 shrink-0" />
                                            Vacío — se ignora al crear. Complétalo o bórralo.
                                        </p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Observaciones + Pionetas */}
            <div className="shrink-0 space-y-2">
                <div>
                    <label className="text-caption font-bold text-brand-dark block mb-1">Observaciones</label>
                    <textarea
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Opcional..."
                        className="w-full px-2.5 py-1.5 text-xs border border-border rounded-lg resize-none h-14 focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-brand-dark cursor-pointer">
                        <input
                            type="checkbox"
                            checked={requierePionetas}
                            onChange={e => setRequierePionetas(e.target.checked)}
                            className="rounded border-border"
                        />
                        Requiere pionetas
                    </label>
                    {requierePionetas && (
                        <input
                            type="number"
                            min={1}
                            value={cantidadPionetas}
                            onChange={e => setCantidadPionetas(parseInt(e.target.value) || 0)}
                            className="w-14 px-2 py-1 text-xs border border-border rounded-lg text-center"
                            placeholder="Cant."
                        />
                    )}
                </div>
            </div>

            {/* Destino abajo — solo en hideCatalog (debajo de pionetas, antes del CTA) */}
            {hideCatalog && (
                <div className="shrink-0">
                    <SearchableSelect
                        label="Destino"
                        options={obras.map(o => ({ value: o.id, label: o.nombre }))}
                        value={destinoObraId}
                        onChange={(val) => setDestinoObraId(val as number | null)}
                        placeholder="Seleccionar obra destino..."
                    />
                </div>
            )}

            {/* Aviso de qué falta para crear (guía de flujo, resalta lo que necesita atención) */}
            {!puedeCrear && !submitting && (
                <div className="shrink-0 flex items-start gap-1.5 text-label font-medium text-amber-800 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800/60 rounded-lg px-3 py-2">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>{
                        !destinoObraId ? 'Selecciona la obra destino para continuar.'
                            : (cart.length === 0 && customItemsValidos.length === 0) ? 'Agrega al menos un ítem a la solicitud.'
                                : hayExceso ? 'Hay ítems con cantidad mayor al stock disponible.'
                                    : hayCustomInvalidos ? 'Completa la descripción y cantidad de los ítems marcados en rojo.'
                                        : 'Completa los campos requeridos.'
                    }</span>
                </div>
            )}

            {/* CTA */}
            <div className="shrink-0 pt-2 border-t border-border flex gap-2">
                {/* Cancelar oculto en mobile — la X del modal cumple esa función */}
                <button
                    type="button"
                    onClick={onClose}
                    className="hidden md:inline-flex px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark transition-colors"
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
            {/* Mobile tabs — solo cuando hay catálogo */}
            {!hideCatalog && (
                <div className="md:hidden mb-3 flex gap-1.5 p-1 bg-muted rounded-xl">
                    <button
                        type="button"
                        onClick={() => setMobileTab('cat')}
                        className={cn(
                            'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                            mobileTab === 'cat' ? 'bg-card text-brand-dark shadow-sm' : 'text-muted-foreground'
                        )}
                    >
                        Catálogo
                    </button>
                    <button
                        type="button"
                        onClick={() => setMobileTab('sol')}
                        className={cn(
                            'flex-1 py-1.5 text-xs font-bold rounded-lg transition-all',
                            mobileTab === 'sol' ? 'bg-card text-brand-dark shadow-sm' : 'text-muted-foreground'
                        )}
                    >
                        Mi solicitud {(cart.length + customItems.length) > 0 && <span className="ml-1 px-1.5 py-0.5 text-caption rounded-full bg-brand-primary text-white">{cart.length + customItems.length}</span>}
                    </button>
                </div>
            )}

            {/* Layout: desktop two columns, mobile tabs. En hideCatalog: solo sidebar centrado. */}
            <div className={cn(
                "flex flex-col md:flex-row gap-4 min-h-0 md:h-[calc(85vh-120px)]",
                hideCatalog && "md:justify-center"
            )}>
                {!hideCatalog && (
                    <div className={cn('flex flex-col min-h-0 flex-1', mobileTab === 'cat' ? 'flex' : 'hidden md:flex')}>
                        {CatalogColumn}
                    </div>
                )}
                <div className={cn(
                    'flex flex-col min-h-0',
                    hideCatalog
                        ? 'flex w-full md:max-w-[560px]'
                        : 'md:w-[360px] md:shrink-0 md:border-l md:border-border md:pl-4',
                    !hideCatalog && (mobileTab === 'sol' ? 'flex' : 'hidden md:flex')
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

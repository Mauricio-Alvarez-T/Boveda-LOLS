import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Minus, Trash2, Send, Search, Package, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../../services/api';
import type { ApiResponse } from '../../types';
import type { ItemInventario, Bodega } from '../../types/entities';
import { SearchableSelect } from '../ui/SearchableSelect';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import type { StockUbicacion } from './StockBadge';
import { cn } from '../../utils/cn';

type Flujo = 'push_directo' | 'intra_bodega' | 'devolucion';

interface Props {
    flujo: Flujo;
    obras: { id: number; nombre: string }[];
    onSubmit: (data: any) => Promise<any>;
    onClose: () => void;
}

interface CartLine {
    item_id: number;
    cantidad: number;
}

const FLUJO_LABELS: Record<Flujo, { title: string; origenLabel: string; destinoLabel: string; cta: string }> = {
    push_directo: {
        title: 'Push directo (Bodega → Obra)',
        origenLabel: 'Bodega origen',
        destinoLabel: 'Obra destino',
        cta: 'Registrar despacho',
    },
    intra_bodega: {
        title: 'Movimiento intra-bodega (Bodega → Bodega)',
        origenLabel: 'Bodega origen',
        destinoLabel: 'Bodega destino',
        cta: 'Registrar movimiento',
    },
    devolucion: {
        title: 'Devolución (Obra → Bodega)',
        origenLabel: 'Obra origen',
        destinoLabel: 'Bodega destino',
        cta: 'Crear devolución',
    },
};

const MovimientoForm: React.FC<Props> = ({ flujo, obras, onSubmit, onClose }) => {
    const labels = FLUJO_LABELS[flujo];
    const { fetchStockPorItems } = useTransferencias();

    const [catalogo, setCatalogo] = useState<ItemInventario[]>([]);
    const [bodegas, setBodegas] = useState<Bodega[]>([]);
    const [stockMap, setStockMap] = useState<Record<number, StockUbicacion[]>>({});
    const [loading, setLoading] = useState(true);

    const [origenId, setOrigenId] = useState<number | null>(null);
    const [destinoId, setDestinoId] = useState<number | null>(null);
    const [cart, setCart] = useState<CartLine[]>([]);
    const [search, setSearch] = useState('');
    const [motivo, setMotivo] = useState('');
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // ── Load catalog + stock + bodegas ──
    useEffect(() => {
        Promise.all([
            api.get<ApiResponse<ItemInventario[]>>('/items-inventario?activo=true&limit=500'),
            api.get<ApiResponse<Bodega[]>>('/bodegas?activa=true&limit=50'),
        ]).then(async ([itemsRes, bodRes]) => {
            const items = itemsRes.data.data;
            setCatalogo(items);
            setBodegas(bodRes.data.data || []);
            if (items.length) {
                const stock = await fetchStockPorItems(items.map(i => i.id));
                setStockMap(stock);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [fetchStockPorItems]);

    // Available origin options depending on flow
    const origenOptions = useMemo(() => {
        if (flujo === 'devolucion') {
            return obras.map(o => ({ value: o.id, label: o.nombre }));
        }
        return bodegas.map(b => ({ value: b.id, label: b.nombre }));
    }, [flujo, obras, bodegas]);

    const destinoOptions = useMemo(() => {
        if (flujo === 'push_directo') {
            return obras.map(o => ({ value: o.id, label: o.nombre }));
        }
        // intra_bodega, devolucion → destino es bodega
        return bodegas
            .filter(b => !(flujo === 'intra_bodega' && b.id === origenId))
            .map(b => ({ value: b.id, label: b.nombre }));
    }, [flujo, obras, bodegas, origenId]);

    // Stock disponible por ítem en la ubicación origen
    const stockEnOrigen = useMemo(() => {
        const m: Record<number, number> = {};
        if (origenId == null) return m;
        const tipoBuscado = flujo === 'devolucion' ? 'obra' : 'bodega';
        Object.entries(stockMap).forEach(([itemId, ubis]) => {
            const found = ubis.find(u => u.type === tipoBuscado && u.id === origenId);
            if (found) m[Number(itemId)] = Number(found.cantidad) || 0;
        });
        return m;
    }, [stockMap, origenId, flujo]);

    const cartMap = useMemo(() => {
        const m: Record<number, number> = {};
        cart.forEach(l => { m[l.item_id] = l.cantidad; });
        return m;
    }, [cart]);

    const filteredCatalog = useMemo(() => {
        const q = search.trim().toLowerCase();
        return catalogo
            .filter(item => {
                if (origenId == null) return false;
                if ((stockEnOrigen[item.id] || 0) === 0 && !cartMap[item.id]) return false;
                if (q) {
                    const hay = `${item.nro_item} ${item.descripcion}`.toLowerCase();
                    if (!hay.includes(q)) return false;
                }
                return true;
            })
            .sort((a, b) => (a.nro_item || 0) - (b.nro_item || 0));
    }, [catalogo, origenId, stockEnOrigen, search, cartMap]);

    const cartDetails = useMemo(() => cart.map(l => {
        const item = catalogo.find(c => c.id === l.item_id);
        const disponible = stockEnOrigen[l.item_id] || 0;
        return { ...l, item, disponible, excede: l.cantidad > disponible };
    }), [cart, catalogo, stockEnOrigen]);

    const hayExceso = cartDetails.some(d => d.excede);

    // Cart ops
    const addToCart = (itemId: number) => {
        setCart(prev => prev.some(l => l.item_id === itemId) ? prev : [...prev, { item_id: itemId, cantidad: 1 }]);
    };
    const updateQty = (itemId: number, cantidad: number) => {
        if (cantidad < 1) { removeFromCart(itemId); return; }
        setCart(prev => prev.map(l => l.item_id === itemId ? { ...l, cantidad } : l));
    };
    const removeFromCart = (itemId: number) => {
        setCart(prev => prev.filter(l => l.item_id !== itemId));
    };

    // Clear cart when origen cambia (stock disponible cambia)
    useEffect(() => { setCart([]); }, [origenId]);

    const handleSubmit = async () => {
        if (!origenId) { toast.error('Selecciona origen'); return; }
        if (!destinoId) { toast.error('Selecciona destino'); return; }
        if (flujo === 'intra_bodega' && origenId === destinoId) {
            toast.error('Origen y destino deben ser bodegas distintas'); return;
        }
        if (!cart.length) { toast.error('Agrega al menos un ítem'); return; }
        if (hayExceso) { toast.error('Hay ítems con cantidad mayor al stock disponible'); return; }

        setSubmitting(true);
        let payload: any;
        if (flujo === 'push_directo') {
            payload = { origen_bodega_id: origenId, destino_obra_id: destinoId };
        } else if (flujo === 'intra_bodega') {
            payload = { origen_bodega_id: origenId, destino_bodega_id: destinoId };
        } else {
            payload = { origen_obra_id: origenId, destino_bodega_id: destinoId };
        }
        payload.items = cart.map(l => ({ item_id: l.item_id, cantidad: l.cantidad }));
        if (motivo.trim()) payload.motivo = motivo.trim();
        if (observaciones.trim()) payload.observaciones = observaciones.trim();

        const result = await onSubmit(payload);
        setSubmitting(false);
        if (result) onClose();
    };

    const puedeEnviar = !!origenId && !!destinoId && cart.length > 0 && !hayExceso && !submitting;

    return (
        <div className="flex flex-col gap-3 min-h-0" style={{ maxHeight: 'calc(85vh - 120px)' }}>
            <div className="shrink-0">
                <h4 className="text-sm font-bold text-brand-dark">{labels.title}</h4>
            </div>

            {/* Origen / Destino */}
            <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-3">
                <SearchableSelect
                    label={labels.origenLabel}
                    options={origenOptions}
                    value={origenId}
                    onChange={v => setOrigenId(v as number | null)}
                    placeholder="Seleccionar..."
                />
                <SearchableSelect
                    label={labels.destinoLabel}
                    options={destinoOptions}
                    value={destinoId}
                    onChange={v => setDestinoId(v as number | null)}
                    placeholder="Seleccionar..."
                />
            </div>

            {/* Items picker */}
            <div className="flex flex-col flex-1 min-h-0 gap-2">
                <div className="shrink-0 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={origenId ? 'Buscar ítem...' : 'Selecciona origen primero'}
                        disabled={!origenId}
                        className="w-full h-9 pl-9 pr-3 text-sm border border-[#E8E8ED] rounded-lg focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary outline-none transition-all disabled:bg-[#F5F5F7]"
                    />
                </div>
                <div className="flex-1 min-h-[140px] overflow-y-auto border border-[#E8E8ED] rounded-xl">
                    {!origenId ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground px-4 text-center">
                            Selecciona el {labels.origenLabel.toLowerCase()} para ver su stock disponible.
                        </div>
                    ) : loading ? (
                        <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                            Cargando...
                        </div>
                    ) : filteredCatalog.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-4">
                            <Package className="h-8 w-8 text-muted-foreground/30 mb-1" />
                            <p className="text-xs text-muted-foreground">Sin stock en esta ubicación</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-[#E8E8ED]">
                            {filteredCatalog.map(item => {
                                const disponible = stockEnOrigen[item.id] || 0;
                                const enCarrito = cartMap[item.id];
                                return (
                                    <li key={item.id} className="flex items-center gap-2 px-3 py-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-bold text-muted-foreground">
                                                #{item.nro_item} · {disponible} {item.unidad}
                                            </div>
                                            <div className="text-xs font-bold text-brand-dark truncate">{item.descripcion}</div>
                                        </div>
                                        {enCarrito === undefined ? (
                                            <button
                                                type="button"
                                                onClick={() => addToCart(item.id)}
                                                className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-white bg-brand-primary rounded-lg"
                                            >
                                                <Plus className="h-3 w-3" strokeWidth={3} /> Agregar
                                            </button>
                                        ) : (
                                            <div className="shrink-0 flex items-center gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => updateQty(item.id, enCarrito - 1)}
                                                    className="w-5 h-5 rounded-md bg-[#F0F0F5] flex items-center justify-center"
                                                >
                                                    <Minus className="h-2.5 w-2.5" />
                                                </button>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    value={enCarrito}
                                                    onChange={e => updateQty(item.id, parseInt(e.target.value) || 0)}
                                                    className={cn(
                                                        'w-10 h-5 px-1 text-[11px] font-bold text-center border rounded-md',
                                                        enCarrito > disponible ? 'border-red-400 text-red-700' : 'border-[#E8E8ED]'
                                                    )}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => updateQty(item.id, enCarrito + 1)}
                                                    className="w-5 h-5 rounded-md bg-brand-primary/10 text-brand-primary flex items-center justify-center"
                                                >
                                                    <Plus className="h-2.5 w-2.5" strokeWidth={3} />
                                                </button>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>

            {/* Cart summary */}
            {cart.length > 0 && (
                <div className="shrink-0 border border-[#E8E8ED] rounded-xl bg-[#F9F9FB] p-2 max-h-40 overflow-y-auto">
                    <ul className="space-y-1">
                        {cartDetails.map(d => (
                            <li
                                key={d.item_id}
                                className={cn(
                                    'flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-md',
                                    d.excede && 'bg-red-50 text-red-700'
                                )}
                            >
                                <span className="truncate font-medium">{d.item?.descripcion}</span>
                                <div className="shrink-0 flex items-center gap-2">
                                    <span>{d.cantidad} {d.item?.unidad || 'u'}</span>
                                    {d.excede && (
                                        <span className="flex items-center gap-0.5 text-[10px]">
                                            <AlertCircle className="h-3 w-3" /> solo {d.disponible}
                                        </span>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => removeFromCart(d.item_id)}
                                        className="text-muted-foreground/50 hover:text-destructive"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Motivo + observaciones */}
            <div className="shrink-0 grid grid-cols-1 md:grid-cols-2 gap-2">
                <div>
                    <label className="text-[10px] font-bold text-brand-dark block mb-1">Motivo (opcional)</label>
                    <input
                        type="text"
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="Ej: cierre de obra, reubicación..."
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E8E8ED] rounded-lg"
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-brand-dark block mb-1">Observaciones</label>
                    <input
                        type="text"
                        value={observaciones}
                        onChange={e => setObservaciones(e.target.value)}
                        placeholder="Opcional..."
                        className="w-full px-2.5 py-1.5 text-xs border border-[#E8E8ED] rounded-lg"
                    />
                </div>
            </div>

            {/* CTAs */}
            <div className="shrink-0 pt-2 border-t border-[#E8E8ED] flex gap-2">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-bold text-muted-foreground hover:text-brand-dark"
                >
                    Cancelar
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!puedeEnviar}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                    <Send className="h-3.5 w-3.5" />
                    {submitting ? 'Enviando...' : labels.cta}
                </button>
            </div>
        </div>
    );
};

export default MovimientoForm;

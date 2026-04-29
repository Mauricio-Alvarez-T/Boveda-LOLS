import React, { useState, useEffect } from 'react';
import { Package, MapPin, Warehouse, Copy, Check, X, ImageOff } from 'lucide-react';
import { cn } from '../../utils/cn';
import { Modal } from '../ui/Modal';
import { copyToClipboard } from '../../utils/whatsappShare';
import type { ItemInventario } from '../../types/entities';
import type { StockLocation } from '../../hooks/inventario/useItemDetail';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

// Resuelve URL pública de imagen de inventario, tolerando paths con o sin prefijo /api/.
const resolveImageUrl = (imagen_url: string | null | undefined): string | null => {
    if (!imagen_url) return null;
    if (/^https?:\/\//i.test(imagen_url)) return imagen_url;
    const withApi = imagen_url.startsWith('/api/') ? imagen_url : `/api${imagen_url.startsWith('/') ? '' : '/'}${imagen_url}`;
    return `${API_BASE}${withApi}`;
};

const fmtMoney = (n: number) => `$${n.toLocaleString('es-CL')}`;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    itemData: ItemInventario | null;
    stockLocations: StockLocation[];
    loading: boolean;
    stockLoading: boolean;
}

const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
    <div className={cn("animate-pulse bg-muted/40 rounded-lg", className)} />
);

const ItemDetailModal: React.FC<Props> = ({
    isOpen, onClose, itemData, stockLocations, loading, stockLoading,
}) => {
    const [imageZoom, setImageZoom] = useState(false);
    const [copied, setCopied] = useState(false);

    const item = itemData;
    const imageUrl = resolveImageUrl(item?.imagen_url);

    const obras = stockLocations.filter(l => l.type === 'obra');
    const bodegas = stockLocations.filter(l => l.type === 'bodega');
    const totalStock = stockLocations.reduce((s, l) => s + l.cantidad, 0);

    const copyNroItem = async () => {
        if (!item) return;
        // Usa helper con fallback execCommand para navegadores sin Clipboard API
        // o contextos no-HTTPS donde navigator.clipboard.writeText falla.
        const ok = await copyToClipboard(String(item.nro_item));
        if (ok) setCopied(true);
    };

    // Cleanup del timeout para evitar memory leak si el modal cierra mientras
    // el badge "copied" está visible.
    useEffect(() => {
        if (!copied) return;
        const id = setTimeout(() => setCopied(false), 1500);
        return () => clearTimeout(id);
    }, [copied]);

    const qtyColor = (n: number) =>
        n > 10 ? 'text-green-700 bg-green-50' :
        n > 0  ? 'text-amber-700 bg-amber-50' :
                  'text-muted-foreground bg-muted/30';

    return (
        <>
            <Modal
                isOpen={isOpen}
                onClose={() => { onClose(); setImageZoom(false); }}
                title={
                    loading ? (
                        <Skeleton className="h-5 w-48" />
                    ) : (
                        <div className="flex items-center gap-2 min-w-0">
                            <Package className="h-4 w-4 text-brand-primary shrink-0" />
                            <span className="truncate">{item?.descripcion || 'Cargando...'}</span>
                        </div>
                    )
                }
                size="md"
            >
                {loading ? (
                    /* ── Loading skeleton ── */
                    <div className="space-y-4 p-1">
                        <Skeleton className="w-full h-48 rounded-xl" />
                        <div className="grid grid-cols-3 gap-2">
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                            <Skeleton className="h-16" />
                        </div>
                        <Skeleton className="h-32" />
                    </div>
                ) : item ? (
                    <div className="space-y-4 p-1">
                        {/* ═══ IMAGEN ═══ */}
                        {imageUrl ? (
                            <button
                                type="button"
                                aria-label="Ampliar imagen del ítem"
                                title="Ampliar imagen"
                                onClick={() => setImageZoom(true)}
                                className="w-full h-64 sm:h-72 flex items-center justify-center overflow-hidden rounded-xl border border-[#E8E8ED] bg-[#F9F9FB] hover:border-brand-primary/30 transition-all group"
                            >
                                <img
                                    src={imageUrl}
                                    alt={item.descripcion}
                                    className="max-w-full max-h-full w-auto h-auto object-contain group-hover:scale-[1.02] transition-transform duration-300"
                                />
                            </button>
                        ) : (
                            <div className="w-full h-64 sm:h-72 rounded-xl border border-[#E8E8ED] bg-[#F9F9FB] flex flex-col items-center justify-center gap-2">
                                <ImageOff className="h-10 w-10 text-muted-foreground/20" />
                                <p className="text-[10px] text-muted-foreground/50">Sin imagen</p>
                            </div>
                        )}

                        {/* ═══ INFO GRID ═══ */}
                        <div className="space-y-2">
                            {/* Categoría + nro_item */}
                            <div className="flex items-center gap-2 flex-wrap">
                                {(item as any).categoria_nombre && (
                                    <span className="px-2.5 py-1 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold">
                                        {(item as any).categoria_nombre}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    aria-label={`Copiar número de ítem ${item.nro_item}`}
                                    onClick={copyNroItem}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#F5F7FA] border border-[#E8E8ED] hover:border-brand-primary/30 text-[10px] font-bold text-muted-foreground transition-all"
                                    title="Copiar número de ítem"
                                >
                                    #{item.nro_item}
                                    {copied
                                        ? <Check className="h-3 w-3 text-green-600" />
                                        : <Copy className="h-3 w-3" />
                                    }
                                </button>
                            </div>

                            {/* Métricas */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                <div className="rounded-xl border border-[#E8E8ED] bg-white px-3 py-2">
                                    <p className="text-[8px] text-muted-foreground uppercase font-bold mb-0.5">V. Arriendo</p>
                                    <p className="text-sm font-black text-brand-dark">{fmtMoney(item.valor_arriendo)}</p>
                                </div>
                                {item.valor_compra > 0 && (
                                    <div className="rounded-xl border border-[#E8E8ED] bg-white px-3 py-2">
                                        <p className="text-[8px] text-muted-foreground uppercase font-bold mb-0.5">V. Compra</p>
                                        <p className="text-sm font-black text-brand-dark">{fmtMoney(item.valor_compra)}</p>
                                    </div>
                                )}
                                <div className="rounded-xl border border-[#E8E8ED] bg-white px-3 py-2">
                                    <p className="text-[8px] text-muted-foreground uppercase font-bold mb-0.5">Unidad</p>
                                    <p className="text-sm font-black text-brand-dark">{item.unidad}</p>
                                </div>
                                {item.m2 && item.m2 > 0 && (
                                    <div className="rounded-xl border border-[#E8E8ED] bg-white px-3 py-2">
                                        <p className="text-[8px] text-muted-foreground uppercase font-bold mb-0.5">M²</p>
                                        <p className="text-sm font-black text-brand-dark">{item.m2.toFixed(2)}</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ═══ STOCK POR UBICACIÓN ═══ */}
                        <div className="rounded-xl border border-[#E8E8ED] overflow-hidden">
                            <div className="px-3 py-2 bg-[#F5F7FA] border-b border-[#E8E8ED] flex items-center justify-between">
                                <span className="text-[10px] font-black uppercase tracking-wider text-brand-dark">
                                    Ubicaciones
                                </span>
                                {!stockLoading && (
                                    <span className="text-[10px] font-bold text-muted-foreground">
                                        Total: <span className="text-brand-primary font-black">{totalStock}</span> {item.unidad}
                                    </span>
                                )}
                            </div>

                            {stockLoading ? (
                                <div className="p-3 space-y-2">
                                    <Skeleton className="h-8 w-full" />
                                    <Skeleton className="h-8 w-full" />
                                    <Skeleton className="h-8 w-3/4" />
                                </div>
                            ) : stockLocations.length === 0 ? (
                                <div className="py-6 text-center">
                                    <Package className="h-8 w-8 text-muted-foreground/15 mx-auto mb-2" />
                                    <p className="text-xs text-muted-foreground">Sin stock registrado</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-[#F0F0F5]">
                                    {/* Obras */}
                                    {obras.map(loc => (
                                        <div key={`obra_${loc.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-blue-50/30 transition-colors">
                                            <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                <MapPin className="h-3 w-3" />
                                            </div>
                                            <span className="flex-1 text-xs font-medium text-brand-dark truncate">{loc.nombre}</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[11px] font-black",
                                                qtyColor(loc.cantidad)
                                            )}>
                                                {loc.cantidad}
                                            </span>
                                        </div>
                                    ))}
                                    {/* Bodegas */}
                                    {bodegas.map(loc => (
                                        <div key={`bod_${loc.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-amber-50/30 transition-colors">
                                            <div className="w-6 h-6 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                                <Warehouse className="h-3 w-3" />
                                            </div>
                                            <span className="flex-1 text-xs font-medium text-brand-dark truncate">{loc.nombre}</span>
                                            <span className={cn(
                                                "px-2 py-0.5 rounded-full text-[11px] font-black",
                                                qtyColor(loc.cantidad)
                                            )}>
                                                {loc.cantidad}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* ═══ IMAGE ZOOM OVERLAY ═══ */}
            {imageZoom && imageUrl && (
                <div
                    className="fixed inset-0 z-[1100] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out"
                    onClick={() => setImageZoom(false)}
                >
                    <button
                        type="button"
                        aria-label="Cerrar imagen ampliada"
                        title="Cerrar"
                        onClick={() => setImageZoom(false)}
                        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <img
                        src={imageUrl}
                        alt={item?.descripcion}
                        className="max-w-full max-h-[90vh] object-contain rounded-lg"
                    />
                </div>
            )}
        </>
    );
};

export default ItemDetailModal;

import React, { useState } from 'react';
import { Pencil, ImageOff, ChevronDown, MapPin, Warehouse, Package } from 'lucide-react';
import { cn } from '../../utils/cn';
import { motion } from 'framer-motion';
import type { ItemInventario } from '../../types/entities';
import type { StockLocation } from '../../hooks/inventario/useInventarioMaestro';
import { useAuth } from '../../context/AuthContext';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');

// Map categoría nombre → color palette
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    ALZAPRIMAS:     { bg: 'bg-sky-50 dark:bg-sky-500/15',       text: 'text-sky-700 dark:text-sky-300',       border: 'border-sky-200 dark:border-sky-800/60' },
    ANDAMIOS:       { bg: 'bg-blue-50 dark:bg-blue-500/15',     text: 'text-blue-700 dark:text-blue-300',     border: 'border-blue-200 dark:border-blue-800/60' },
    MOLDAJES:       { bg: 'bg-violet-50 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800/60' },
    MAQUINARIA:     { bg: 'bg-orange-50 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-200 dark:border-orange-800/60' },
    VIGAS:          { bg: 'bg-emerald-50 dark:bg-emerald-500/15',text: 'text-emerald-700 dark:text-emerald-300',border: 'border-emerald-200 dark:border-emerald-800/60' },
    INSTALACIONES:  { bg: 'bg-rose-50 dark:bg-rose-500/15',     text: 'text-rose-700 dark:text-rose-300',     border: 'border-rose-200 dark:border-rose-800/60' },
};
const DEFAULT_CAT_COLOR = { bg: 'bg-gray-50 dark:bg-muted', text: 'text-gray-700 dark:text-muted-foreground', border: 'border-gray-200 dark:border-border' };

const getCatColor = (catName?: string) => {
    if (!catName) return DEFAULT_CAT_COLOR;
    const key = catName.toUpperCase().split(' ')[0];
    return CATEGORY_COLORS[key] || DEFAULT_CAT_COLOR;
};

const PROPIETARIO_BADGE: Record<string, { bg: string; text: string }> = {
    lols:     { bg: 'bg-brand-primary/10', text: 'text-brand-primary' },
    dedalius: { bg: 'bg-blue-100 dark:bg-blue-500/15',          text: 'text-blue-700 dark:text-blue-300' },
};

interface CategoriaMinimal { id: number; nombre: string; }

type EditableField =
    | 'descripcion'
    | 'categoria_id'
    | 'unidad'
    | 'valor_compra'
    | 'valor_arriendo'
    | 'es_consumible'
    | 'propietario'
    | 'activo';

interface Props {
    item: ItemInventario;
    categorias: CategoriaMinimal[];
    stockLocations: StockLocation[];
    isDirty: boolean;
    isFieldDirty: (field: EditableField) => boolean;
    getVal: <K extends EditableField>(key: K) => ItemInventario[K];
    setField: <K extends EditableField>(key: K, value: ItemInventario[K]) => void;
    onEditFull: () => void;
    index: number;
}

const qtyColor = (n: number) =>
    n > 10 ? 'text-green-700 bg-green-50 border-green-200 dark:text-green-300 dark:bg-green-500/15 dark:border-green-800/60'
    : n > 0  ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-500/15 dark:border-amber-800/60'
    :          'text-muted-foreground bg-muted/30 border-border';

/** Fila de ubicación reutilizable */
const LocationRow: React.FC<{ loc: StockLocation }> = ({ loc }) => (
    <div className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-muted transition-colors">
        <div className={cn(
            "w-5 h-5 rounded-md flex items-center justify-center shrink-0",
            loc.type === 'bodega' ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300" : "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300"
        )}>
            {loc.type === 'bodega'
                ? <Warehouse className="h-2.5 w-2.5" />
                : <MapPin className="h-2.5 w-2.5" />
            }
        </div>
        <span className="flex-1 text-[10px] font-medium text-brand-dark truncate">
            {loc.type === 'bodega'
                ? formatBodegaNombreResponsable(loc.nombre, loc.responsable_nombre)
                : loc.nombre}
        </span>
        <span className={cn(
            "px-1.5 py-0.5 rounded-full text-[10px] font-black border",
            qtyColor(Number(loc.cantidad))
        )}>
            {Number(loc.cantidad)}
        </span>
    </div>
);

const InventarioItemCard: React.FC<Props> = ({
    item, categorias, stockLocations, isDirty, isFieldDirty, getVal, setField, onEditFull, index,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [showAllLocations, setShowAllLocations] = useState(false);
    const catColor = getCatColor(item.categoria_nombre);
    const propBadge = PROPIETARIO_BADGE[String(getVal('propietario'))] || PROPIETARIO_BADGE.lols;
    const activo = !!getVal('activo');

    // Gate financiero: oculta V.Compra/V.Arriendo si no tiene `inventario.costos.ver`;
    // los renderiza como disabled si tiene ver pero no `inventario.costos.editar`.
    const { hasPermission } = useAuth();
    const verCostos = hasPermission('inventario.costos.ver');
    const editarCostos = hasPermission('inventario.costos.editar');

    const totalStock = stockLocations.reduce((s, l) => s + Number(l.cantidad), 0);
    // Bodegas siempre primero, luego obras — solo con stock > 0
    const allLocations = [
        ...stockLocations.filter(l => l.type === 'bodega' && Number(l.cantidad) > 0),
        ...stockLocations.filter(l => l.type === 'obra' && Number(l.cantidad) > 0),
    ];
    const ubicacionesConStock = allLocations.length;

    const imageUrl = item.imagen_url
        ? `${API_BASE}${item.imagen_url.startsWith('/api/') ? item.imagen_url : `/api${item.imagen_url.startsWith('/') ? '' : '/'}${item.imagen_url}`}`
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.5) }}
            className={cn(
                "group relative flex flex-col rounded-2xl border bg-card overflow-hidden transition-all duration-300",
                "hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-[var(--border-hover)]",
                isDirty
                    ? "border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.3)] ring-1 ring-amber-200 dark:border-amber-500/50 dark:ring-amber-500/20"
                    : "border-border shadow-sm",
                !activo && "opacity-60"
            )}
        >
            {/* Dirty indicator dot */}
            {isDirty && (
                <div className="absolute top-2.5 right-2.5 z-10 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white dark:ring-card animate-pulse" />
            )}

            {/* ══════ IMAGE AREA ══════ */}
            <div className="relative h-36 bg-muted flex items-center justify-center overflow-hidden">
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={item.descripcion}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        loading="lazy"
                    />
                ) : (
                    <div className="flex flex-col items-center gap-1.5">
                        <ImageOff className="h-8 w-8 text-muted-foreground/15" />
                        <span className="text-[9px] font-bold text-muted-foreground/25 uppercase tracking-wider">Sin imagen</span>
                    </div>
                )}

                {/* Nro item badge */}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold">
                    #{item.nro_item}
                </span>

                {/* Activo toggle */}
                <button
                    onClick={() => setField('activo', !activo)}
                    className={cn(
                        "absolute top-2 right-2 px-2 py-0.5 rounded-lg text-[10px] font-bold backdrop-blur-sm transition-all",
                        activo
                            ? "bg-green-500/80 text-white"
                            : "bg-red-500/80 text-white"
                    )}
                >
                    {activo ? 'Activo' : 'Inactivo'}
                </button>

                {/* Total stock overlay — bottom right of image */}
                <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-sm flex items-center gap-1.5">
                    <Package className="h-3 w-3 text-white/70" />
                    <span className="text-white text-xs font-black">{totalStock}</span>
                    <span className="text-white/60 text-[9px]">{item.unidad}</span>
                </div>
            </div>

            {/* ══════ CONTENT ══════ */}
            <div className="flex flex-col flex-1 p-3.5 gap-2">
                {/* Categoría + propietario badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        catColor.bg, catColor.text, catColor.border
                    )}>
                        {item.categoria_nombre || 'Sin cat.'}
                    </span>
                    <span className={cn(
                        "px-1.5 py-0.5 rounded-full text-[9px] font-bold",
                        propBadge.bg, propBadge.text,
                    )}>
                        {String(getVal('propietario'))}
                    </span>
                </div>

                {/* Descripción */}
                <h3 className="text-[13px] font-bold text-brand-dark leading-tight line-clamp-2 min-h-[2.5em]">
                    {String(getVal('descripcion'))}
                </h3>

                {/* ══════ STOCK POR UBICACIÓN ══════ */}
                <div className="flex-1">
                    {ubicacionesConStock === 0 ? (
                        <div className="flex items-center gap-2 py-2 px-2.5 rounded-xl bg-muted border border-border">
                            <Package className="h-3.5 w-3.5 text-muted-foreground/30" />
                            <span className="text-[10px] text-muted-foreground">Sin stock registrado</span>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {/* Siempre bodegas primero, luego obras */}
                            {allLocations.slice(0, 3).map(loc => (
                                <LocationRow key={`${loc.type}_${loc.id}`} loc={loc} />
                            ))}
                            {/* Ubicaciones extra (expandibles) */}
                            {allLocations.length > 3 && (
                                <>
                                    {showAllLocations && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            transition={{ duration: 0.2 }}
                                            className="space-y-1"
                                        >
                                            {allLocations.slice(3).map(loc => (
                                                <LocationRow key={`${loc.type}_${loc.id}`} loc={loc} />
                                            ))}
                                        </motion.div>
                                    )}
                                    <button
                                        onClick={() => setShowAllLocations(!showAllLocations)}
                                        className="w-full flex items-center justify-center gap-1 py-1 rounded-lg text-[10px] font-bold text-brand-primary bg-brand-primary/5 hover:bg-brand-primary/10 transition-all"
                                    >
                                        <MapPin className="h-2.5 w-2.5" />
                                        {showAllLocations
                                            ? 'Ocultar ubicaciones'
                                            : `+${allLocations.length - 3} ubicación${allLocations.length - 3 !== 1 ? 'es' : ''}`
                                        }
                                        <ChevronDown className={cn("h-2.5 w-2.5 transition-transform duration-200", showAllLocations && "rotate-180")} />
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Expandable Quick Edit ── */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={cn(
                        "flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                        isExpanded
                            ? "bg-brand-primary/10 text-brand-primary"
                            : "bg-muted text-muted-foreground hover:bg-muted hover:text-brand-dark"
                    )}
                >
                    <Pencil className="h-3 w-3" />
                    {isExpanded ? 'Cerrar edición' : 'Edición rápida'}
                    <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", isExpanded && "rotate-180")} />
                </button>

                {isExpanded && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col gap-2 pt-1 border-t border-border"
                    >
                        {/* Descripción editable */}
                        <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Descripción</label>
                            <input
                                type="text"
                                value={String(getVal('descripcion'))}
                                onChange={e => setField('descripcion', e.target.value)}
                                className={cn(
                                    "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all",
                                    isFieldDirty('descripcion') ? "border-amber-300" : "border-border"
                                )}
                            />
                        </div>

                        {/* Categoría + Unidad */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">Categoría</label>
                                <select
                                    value={getVal('categoria_id')}
                                    onChange={e => setField('categoria_id', Number(e.target.value))}
                                    className={cn(
                                        "w-full px-2 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('categoria_id') ? "border-amber-300" : "border-border"
                                    )}
                                >
                                    {categorias.map(c => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">Unidad</label>
                                <input
                                    type="text"
                                    value={String(getVal('unidad') ?? '')}
                                    onChange={e => setField('unidad', e.target.value)}
                                    className={cn(
                                        "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('unidad') ? "border-amber-300" : "border-border"
                                    )}
                                />
                            </div>
                        </div>

                        {/* Valores — sólo si tiene `inventario.costos.ver`. Si tiene
                            ver pero no `inventario.costos.editar`, inputs disabled. */}
                        {verCostos && (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="text-[9px] font-bold text-muted-foreground uppercase">V. Compra</label>
                                    <input
                                        type="number"
                                        value={Number(getVal('valor_compra') ?? 0)}
                                        onChange={e => setField('valor_compra', Number(e.target.value))}
                                        disabled={!editarCostos}
                                        className={cn(
                                            "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none text-right",
                                            isFieldDirty('valor_compra') ? "border-amber-300" : "border-border",
                                            !editarCostos && "bg-gray-100 text-gray-500 cursor-not-allowed dark:bg-muted dark:text-muted-foreground"
                                        )}
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-bold text-muted-foreground uppercase">V. Arriendo</label>
                                    <input
                                        type="number"
                                        value={Number(getVal('valor_arriendo') ?? 0)}
                                        onChange={e => setField('valor_arriendo', Number(e.target.value))}
                                        disabled={!editarCostos}
                                        className={cn(
                                            "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none text-right",
                                            isFieldDirty('valor_arriendo') ? "border-amber-300" : "border-border",
                                            !editarCostos && "bg-gray-100 text-gray-500 cursor-not-allowed dark:bg-muted dark:text-muted-foreground"
                                        )}
                                    />
                                </div>
                            </div>
                        )}

                        {/* Propietario + Toggles */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">Propietario</label>
                                <select
                                    value={String(getVal('propietario'))}
                                    onChange={e => setField('propietario', e.target.value as ItemInventario['propietario'])}
                                    className={cn(
                                        "w-full px-2 py-1.5 text-xs border rounded-lg bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('propietario') ? "border-amber-300" : "border-border"
                                    )}
                                >
                                    <option value="lols">lols</option>
                                    <option value="dedalius">dedalius</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer mt-3">
                                <input
                                    type="checkbox"
                                    checked={!!getVal('es_consumible')}
                                    onChange={e => setField('es_consumible', e.target.checked)}
                                    className="rounded"
                                />
                                <span className="text-[10px] font-medium text-muted-foreground">Consumible</span>
                            </label>
                        </div>

                        {/* Full edit button */}
                        <button
                            onClick={onEditFull}
                            className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold text-white bg-brand-primary hover:bg-brand-primary/90 transition-all shadow-sm"
                        >
                            <Pencil className="h-3.5 w-3.5" />
                            Edición completa
                        </button>
                    </motion.div>
                )}
            </div>
        </motion.div>
    );
};

export default InventarioItemCard;

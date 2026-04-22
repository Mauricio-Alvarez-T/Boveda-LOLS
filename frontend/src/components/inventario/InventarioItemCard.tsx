import React, { useState } from 'react';
import { Package, Pencil, ImageOff, Check, X, ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';
import { motion } from 'framer-motion';
import type { ItemInventario } from '../../types/entities';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '');
const fmtCLP = (v: number) =>
    v.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });

// Map categoría nombre → color palette
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
    ANDAMIOS:       { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
    MOLDAJES:       { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
    MAQUINARIA:     { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
    VIGAS:          { bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200' },
    INSTALACIONES:  { bg: 'bg-rose-50',   text: 'text-rose-700',   border: 'border-rose-200' },
};
const DEFAULT_CAT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };

const getCatColor = (catName?: string) => {
    if (!catName) return DEFAULT_CAT_COLOR;
    const key = catName.toUpperCase().split(' ')[0];
    return CATEGORY_COLORS[key] || DEFAULT_CAT_COLOR;
};

const PROPIETARIO_BADGE: Record<string, { bg: string; text: string }> = {
    lols:     { bg: 'bg-brand-primary/10', text: 'text-brand-primary' },
    dedalius: { bg: 'bg-blue-100',          text: 'text-blue-700' },
    cedalius: { bg: 'bg-blue-100',          text: 'text-blue-700' },
};

interface CategoriaMinimal { id: number; nombre: string; }

interface EditableField {
    field: 'descripcion' | 'categoria_id' | 'unidad' | 'valor_compra' | 'valor_arriendo' | 'es_consumible' | 'propietario' | 'activo';
}

interface Props {
    item: ItemInventario;
    categorias: CategoriaMinimal[];
    isDirty: boolean;
    isFieldDirty: (field: EditableField['field']) => boolean;
    getVal: <K extends EditableField['field']>(key: K) => ItemInventario[K];
    setField: <K extends EditableField['field']>(key: K, value: ItemInventario[K]) => void;
    onEditFull: () => void;
    index: number;
}

const InventarioItemCard: React.FC<Props> = ({
    item, categorias, isDirty, isFieldDirty, getVal, setField, onEditFull, index,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const catColor = getCatColor(item.categoria_nombre);
    const propBadge = PROPIETARIO_BADGE[String(getVal('propietario'))] || PROPIETARIO_BADGE.lols;
    const activo = !!getVal('activo');
    const esConsumible = !!getVal('es_consumible');

    const imageUrl = item.imagen_url
        ? `${API_BASE}${item.imagen_url.startsWith('/api/') ? item.imagen_url : `/api${item.imagen_url.startsWith('/') ? '' : '/'}${item.imagen_url}`}`
        : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.3, delay: Math.min(index * 0.03, 0.5) }}
            className={cn(
                "group relative flex flex-col rounded-2xl border bg-white overflow-hidden transition-all duration-300",
                "hover:shadow-[0_8px_30px_rgba(0,0,0,0.08)] hover:border-[#C0C0C8]",
                isDirty
                    ? "border-amber-300 shadow-[0_0_0_1px_rgba(245,158,11,0.3)] ring-1 ring-amber-200"
                    : "border-[#E8E8ED] shadow-sm",
                !activo && "opacity-60"
            )}
        >
            {/* ── Dirty indicator dot ── */}
            {isDirty && (
                <div className="absolute top-2.5 right-2.5 z-10 w-2.5 h-2.5 rounded-full bg-amber-400 ring-2 ring-white animate-pulse" />
            )}

            {/* ══════ IMAGE AREA ══════ */}
            <div className="relative h-36 bg-gradient-to-br from-[#F8F9FC] to-[#F0F1F5] flex items-center justify-center overflow-hidden">
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

                {/* Nro item badge — floats over image */}
                <span className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/50 backdrop-blur-sm text-white text-[10px] font-bold">
                    #{item.nro_item}
                </span>

                {/* Activo toggle — floats over image */}
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
            </div>

            {/* ══════ CONTENT ══════ */}
            <div className="flex flex-col flex-1 p-3.5 gap-2.5">
                {/* Categoría badge */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        catColor.bg, catColor.text, catColor.border
                    )}>
                        {item.categoria_nombre || 'Sin cat.'}
                    </span>
                    {esConsumible && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold">
                            Consumible
                        </span>
                    )}
                </div>

                {/* Descripción */}
                <h3 className="text-[13px] font-bold text-brand-dark leading-tight line-clamp-2 min-h-[2.5em]">
                    {String(getVal('descripcion'))}
                </h3>

                {/* Valores */}
                <div className="grid grid-cols-2 gap-2">
                    <div className={cn(
                        "rounded-xl px-2.5 py-2 border transition-all",
                        isFieldDirty('valor_arriendo') ? "border-amber-300 bg-amber-50/50" : "border-[#F0F0F5] bg-[#FAFBFC]"
                    )}>
                        <p className="text-[8px] text-muted-foreground font-bold uppercase mb-0.5">Arriendo</p>
                        <p className="text-sm font-black text-brand-primary">
                            {fmtCLP(Number(getVal('valor_arriendo')))}
                        </p>
                    </div>
                    <div className={cn(
                        "rounded-xl px-2.5 py-2 border transition-all",
                        isFieldDirty('valor_compra') ? "border-amber-300 bg-amber-50/50" : "border-[#F0F0F5] bg-[#FAFBFC]"
                    )}>
                        <p className="text-[8px] text-muted-foreground font-bold uppercase mb-0.5">Compra</p>
                        <p className="text-sm font-black text-brand-dark">
                            {fmtCLP(Number(getVal('valor_compra')))}
                        </p>
                    </div>
                </div>

                {/* Footer: Propietario + Unidad */}
                <div className="flex items-center justify-between pt-1">
                    <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-bold",
                        propBadge.bg, propBadge.text,
                        isFieldDirty('propietario') && "ring-1 ring-amber-300"
                    )}>
                        {String(getVal('propietario'))}
                    </span>
                    <span className={cn(
                        "text-[10px] font-bold text-muted-foreground bg-[#F5F7FA] px-2 py-0.5 rounded-lg",
                        isFieldDirty('unidad') && "ring-1 ring-amber-300"
                    )}>
                        {String(getVal('unidad'))}
                    </span>
                </div>

                {/* ── Expandable Quick Edit ── */}
                <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className={cn(
                        "flex items-center justify-center gap-1 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                        isExpanded
                            ? "bg-brand-primary/10 text-brand-primary"
                            : "bg-[#F5F7FA] text-muted-foreground hover:bg-[#EDEEF2] hover:text-brand-dark"
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
                        className="flex flex-col gap-2 pt-1 border-t border-[#F0F0F5]"
                    >
                        {/* Descripción editable */}
                        <div>
                            <label className="text-[9px] font-bold text-muted-foreground uppercase">Descripción</label>
                            <input
                                type="text"
                                value={String(getVal('descripcion'))}
                                onChange={e => setField('descripcion', e.target.value)}
                                className={cn(
                                    "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all",
                                    isFieldDirty('descripcion') ? "border-amber-300" : "border-[#E8E8ED]"
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
                                        "w-full px-2 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('categoria_id') ? "border-amber-300" : "border-[#E8E8ED]"
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
                                        "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('unidad') ? "border-amber-300" : "border-[#E8E8ED]"
                                    )}
                                />
                            </div>
                        </div>

                        {/* Valores */}
                        <div className="grid grid-cols-2 gap-2">
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">V. Compra</label>
                                <input
                                    type="number"
                                    value={Number(getVal('valor_compra') ?? 0)}
                                    onChange={e => setField('valor_compra', Number(e.target.value))}
                                    className={cn(
                                        "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none text-right",
                                        isFieldDirty('valor_compra') ? "border-amber-300" : "border-[#E8E8ED]"
                                    )}
                                />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">V. Arriendo</label>
                                <input
                                    type="number"
                                    value={Number(getVal('valor_arriendo') ?? 0)}
                                    onChange={e => setField('valor_arriendo', Number(e.target.value))}
                                    className={cn(
                                        "w-full px-2.5 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none text-right",
                                        isFieldDirty('valor_arriendo') ? "border-amber-300" : "border-[#E8E8ED]"
                                    )}
                                />
                            </div>
                        </div>

                        {/* Propietario + Toggles */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <div>
                                <label className="text-[9px] font-bold text-muted-foreground uppercase">Propietario</label>
                                <select
                                    value={String(getVal('propietario'))}
                                    onChange={e => setField('propietario', e.target.value as ItemInventario['propietario'])}
                                    className={cn(
                                        "w-full px-2 py-1.5 text-xs border rounded-lg bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none",
                                        isFieldDirty('propietario') ? "border-amber-300" : "border-[#E8E8ED]"
                                    )}
                                >
                                    <option value="lols">lols</option>
                                    <option value="dedalius">dedalius</option>
                                </select>
                            </div>
                            <label className="flex items-center gap-1.5 cursor-pointer mt-3">
                                <input
                                    type="checkbox"
                                    checked={esConsumible}
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

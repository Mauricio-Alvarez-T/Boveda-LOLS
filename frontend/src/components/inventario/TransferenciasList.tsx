import React from 'react';
import { ArrowRight, Clock, CheckCircle2, Truck, PackageCheck, XCircle, Ban, Search, X, AlertTriangle, PackageOpen, LayoutGrid } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import type { Transferencia } from '../../types/entities';

interface Props {
    transferencias: Transferencia[];
    loading: boolean;
    selectedId: number | null;
    onSelect: (id: number) => void;
    statusFilter: string;
    onStatusFilterChange: (status: string) => void;
    searchQuery: string;
    onSearchChange: (q: string) => void;
    discrepanciasCount?: number;
    /** Si false, el chip "Discrepancias" se oculta. Default true para back-compat. */
    canVerDiscrepancias?: boolean;
}

export const estadoConfig: Record<string, { label: string; color: string; bgSolid: string; icon: React.ElementType }> = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 border-amber-200', bgSolid: 'bg-amber-500', icon: Clock },
    aprobada: { label: 'Aprobada', color: 'bg-blue-100 text-blue-700 border-blue-200', bgSolid: 'bg-blue-500', icon: CheckCircle2 },
    en_transito: { label: 'En Tránsito', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', bgSolid: 'bg-indigo-500', icon: Truck },
    recepcion_parcial: { label: 'Entrega en curso', color: 'bg-purple-100 text-purple-700 border-purple-200', bgSolid: 'bg-purple-500', icon: PackageOpen },
    recibida: { label: 'Recibida', color: 'bg-green-100 text-green-700 border-green-200', bgSolid: 'bg-green-500', icon: PackageCheck },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200', bgSolid: 'bg-red-500', icon: XCircle },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500 border-gray-200', bgSolid: 'bg-gray-400', icon: Ban },
};

export const tipoFlujoConfig: Record<string, { label: string; color: string }> = {
    solicitud: { label: 'Solicitud', color: 'bg-slate-100 text-slate-700 border-slate-200' },
    push_directo: { label: 'Push directo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    intra_bodega: { label: 'Intra-bodega', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    intra_obra: { label: 'Intra-obra', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    orden_gerencia: { label: 'Orden gerencia', color: 'bg-purple-100 text-purple-700 border-purple-200' },
    devolucion: { label: 'Devolución', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

/** Color sólido del borde izquierdo por estado */
const BORDER_LEFT_COLOR: Record<string, string> = {
    pendiente: 'border-l-amber-500',
    aprobada: 'border-l-blue-500',
    en_transito: 'border-l-indigo-500',
    recepcion_parcial: 'border-l-purple-500',
    recibida: 'border-l-green-500',
    rechazada: 'border-l-red-500',
    cancelada: 'border-l-gray-400',
};

const STATUS_CHIPS: { value: string; label: string; shortLabel: string; icon: React.ElementType; discrepancia?: boolean }[] = [
    { value: 'todas',          label: 'Todas',          shortLabel: 'Todas',    icon: LayoutGrid },
    { value: 'pendiente',      label: 'Pendientes',     shortLabel: 'Pend.',    icon: Clock },
    { value: 'aprobada',       label: 'Aprobadas',      shortLabel: 'Aprob.',   icon: CheckCircle2 },
    { value: 'recibida',       label: 'Recibidas',      shortLabel: 'Recib.',   icon: PackageCheck },
    { value: 'discrepancias',  label: 'Discrepancias',  shortLabel: 'Discrep.', icon: AlertTriangle, discrepancia: true },
];

const TransferenciasList: React.FC<Props> = ({
    transferencias, loading, selectedId, onSelect,
    statusFilter, onStatusFilterChange, searchQuery, onSearchChange,
    discrepanciasCount = 0,
    canVerDiscrepancias = true,
}) => {
    const filtered = transferencias.filter(t =>
        !searchQuery || t.codigo.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Discrepancias requiere permiso aprobador. Si no lo tiene, oculta el chip.
    const visibleChips = STATUS_CHIPS.filter(c => c.value !== 'discrepancias' || canVerDiscrepancias);

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Search */}
            <div className="relative shrink-0 mb-2">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => onSearchChange(e.target.value)}
                    placeholder="Buscar por código..."
                    className="w-full pl-8 pr-8 py-2 text-xs border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                />
                {searchQuery && (
                    <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                        <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                )}
            </div>

            {/* Status filter — Mobile: icon + short label stacked */}
            <div className="flex md:hidden items-center gap-0.5 p-1 bg-white/95 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] shrink-0 mb-3 shadow-sm">
                {visibleChips.map(chip => {
                    const isActive = statusFilter === chip.value;
                    const isDiscrep = !!chip.discrepancia;
                    const ChipIcon = chip.icon;
                    return (
                        <button
                            key={chip.value}
                            onClick={() => onStatusFilterChange(chip.value)}
                            className={cn(
                                "relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-1 flex-1 min-w-0 transition-all",
                                isActive
                                    ? "text-white"
                                    : isDiscrep && discrepanciasCount > 0
                                        ? "text-red-600"
                                        : "text-muted-foreground"
                            )}
                        >
                            {isActive && (
                                <motion.div
                                    layoutId="activeStatusChipMobile"
                                    className={cn(
                                        "absolute inset-0 rounded-xl shadow-sm",
                                        isDiscrep ? "bg-red-500" : "bg-brand-primary"
                                    )}
                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                />
                            )}
                            <div className="relative z-10 flex items-center">
                                <ChipIcon className="h-[15px] w-[15px]" />
                                {isDiscrep && discrepanciasCount > 0 && !isActive && (
                                    <span className="absolute -top-1 -right-2 px-1 py-[1px] rounded-full text-[7px] font-black leading-none bg-red-500 text-white">
                                        {discrepanciasCount}
                                    </span>
                                )}
                            </div>
                            <span className="text-[7px] font-black uppercase tracking-tight relative z-10 leading-none truncate w-full text-center">
                                {chip.shortLabel}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Status filter — Desktop: pill chips */}
            <div className="hidden md:flex gap-1.5 overflow-x-auto scrollbar-none shrink-0 mb-3 pb-1">
                {visibleChips.map(chip => {
                    const isActive = statusFilter === chip.value;
                    const isDiscrep = !!chip.discrepancia;
                    const ChipIcon = chip.icon;
                    return (
                        <button
                            key={chip.value}
                            onClick={() => onStatusFilterChange(chip.value)}
                            className={cn(
                                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all shrink-0",
                                isActive
                                    ? isDiscrep
                                        ? "bg-red-500 text-white border-red-500 shadow-sm"
                                        : "bg-brand-primary text-white border-brand-primary shadow-sm"
                                    : isDiscrep && discrepanciasCount > 0
                                        ? "bg-red-50 text-red-700 border-red-200 hover:border-red-300"
                                        : "bg-white text-muted-foreground border-[#E8E8ED] hover:border-brand-primary/30"
                            )}
                        >
                            <ChipIcon className="h-3 w-3" />
                            <span>{chip.label}</span>
                            {isDiscrep && discrepanciasCount > 0 && (
                                <span className={cn(
                                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none",
                                    isActive ? "bg-white/25 text-white" : "bg-red-500 text-white"
                                )}>
                                    {discrepanciasCount}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Lista compacta estilo master — borde izquierdo coloreado por estado */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-0.5">
                {loading ? (
                    <div className="py-8 text-center text-muted-foreground text-xs">Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className="py-12 text-center text-muted-foreground">
                        <Truck className="h-8 w-8 mx-auto opacity-20 mb-2" />
                        <p className="text-xs">No hay transferencias</p>
                    </div>
                ) : (
                    filtered.map(t => {
                        const cfg = estadoConfig[t.estado] || estadoConfig.pendiente;
                        const Icon = cfg.icon;
                        const origen = (t as any).origen_obra_nombre || (t as any).origen_bodega_nombre || '—';
                        const destino = (t as any).destino_obra_nombre || (t as any).destino_bodega_nombre || '—';
                        const isSelected = t.id === selectedId;
                        const fechaStr = new Date(t.fecha_solicitud).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
                        const borderLeft = BORDER_LEFT_COLOR[t.estado] || 'border-l-gray-300';
                        const flujo = t.tipo_flujo && t.tipo_flujo !== 'solicitud'
                            ? tipoFlujoConfig[t.tipo_flujo] || null
                            : null;

                        return (
                            <div
                                key={t.id}
                                onClick={() => onSelect(t.id)}
                                className={cn(
                                    "flex gap-3 pl-3 pr-3 py-2.5 rounded-lg border-l-[3px] cursor-pointer transition-all",
                                    borderLeft,
                                    isSelected
                                        ? "bg-brand-primary/[0.06] shadow-sm ring-1 ring-brand-primary/20"
                                        : "bg-white hover:bg-[#F8F9FC]"
                                )}
                            >
                                {/* Icono estado */}
                                <div className={cn(
                                    "w-7 h-7 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                                    cfg.color
                                )}>
                                    <Icon className="h-3 w-3" />
                                </div>

                                {/* Contenido */}
                                <div className="flex-1 min-w-0">
                                    {/* Fila 1: Código + fecha */}
                                    <div className="flex items-center justify-between gap-2">
                                        <span className={cn(
                                            "text-[11px] font-bold truncate",
                                            isSelected ? "text-brand-primary" : "text-brand-dark"
                                        )}>
                                            {t.codigo}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground/60 tabular-nums shrink-0">
                                            {fechaStr}
                                        </span>
                                    </div>

                                    {/* Fila 2: Estado badge + flujo */}
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className={cn("text-[8px] font-bold px-1.5 py-[1px] rounded-full border leading-none", cfg.color)}>
                                            {cfg.label}
                                        </span>
                                        {flujo && (
                                            <span className={cn("text-[8px] font-bold px-1.5 py-[1px] rounded-full border leading-none", flujo.color)}>
                                                {flujo.label}
                                            </span>
                                        )}
                                    </div>

                                    {/* Fila 3: Origen → Destino */}
                                    <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                        <span className="truncate max-w-[40%]">{origen}</span>
                                        <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                        <span className="truncate max-w-[40%]">{destino}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default TransferenciasList;

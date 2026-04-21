import React from 'react';
import { ArrowRight, Clock, CheckCircle2, Truck, PackageCheck, XCircle, Ban, Search, X, AlertTriangle } from 'lucide-react';
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
}

export const estadoConfig: Record<string, { label: string; color: string; bgSolid: string; icon: React.ElementType }> = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 border-amber-200', bgSolid: 'bg-amber-500', icon: Clock },
    aprobada: { label: 'Aprobada', color: 'bg-blue-100 text-blue-700 border-blue-200', bgSolid: 'bg-blue-500', icon: CheckCircle2 },
    en_transito: { label: 'En Tránsito', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', bgSolid: 'bg-indigo-500', icon: Truck },
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

const STATUS_CHIPS: { value: string; label: string; discrepancia?: boolean }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'aprobada', label: 'Aprobadas' },
    { value: 'recibida', label: 'Recibidas' },
    { value: 'discrepancias', label: 'Discrepancias', discrepancia: true },
];

const TransferenciasList: React.FC<Props> = ({
    transferencias, loading, selectedId, onSelect,
    statusFilter, onStatusFilterChange, searchQuery, onSearchChange,
    discrepanciasCount = 0,
}) => {
    const filtered = transferencias.filter(t =>
        !searchQuery || t.codigo.toLowerCase().includes(searchQuery.toLowerCase())
    );

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

            {/* Status filter chips */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-none shrink-0 mb-3 pb-1">
                {STATUS_CHIPS.map(chip => {
                    const isActive = statusFilter === chip.value;
                    const isDiscrep = !!chip.discrepancia;
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
                            {isDiscrep && <AlertTriangle className="h-2.5 w-2.5" />}
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

            {/* Card list */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
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
                        return (
                            <div
                                key={t.id}
                                onClick={() => onSelect(t.id)}
                                className={cn(
                                    "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer",
                                    isSelected
                                        ? "border-brand-primary bg-brand-primary/5 shadow-sm"
                                        : "border-[#E8E8ED] hover:border-brand-primary/30 hover:bg-brand-primary/[0.02]"
                                )}
                            >
                                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", cfg.color)}>
                                    <Icon className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[11px] font-bold text-brand-dark">{t.codigo}</span>
                                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", cfg.color)}>
                                            {cfg.label}
                                        </span>
                                        {t.tipo_flujo && t.tipo_flujo !== 'solicitud' && (
                                            <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-full border", (tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).color)}>
                                                {(tipoFlujoConfig[t.tipo_flujo] || tipoFlujoConfig.solicitud).label}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground truncate">
                                        <span className="truncate">{origen}</span>
                                        <ArrowRight className="h-2.5 w-2.5 shrink-0" />
                                        <span className="truncate">{destino}</span>
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[9px] text-muted-foreground">
                                        {new Date(t.fecha_solicitud).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                    </p>
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

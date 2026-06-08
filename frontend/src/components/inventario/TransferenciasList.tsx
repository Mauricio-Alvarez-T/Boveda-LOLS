import React from 'react';
import { ArrowRight, Clock, CheckCircle2, Truck, PackageCheck, XCircle, Ban, Search, X, PackageOpen } from 'lucide-react';
import { cn } from '../../utils/cn';
import type { Transferencia } from '../../types/entities';
import { formatBodegaNombreResponsable } from '../../utils/formatBodega';
import StatusFilterBar from './StatusFilterBar';

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

export const estadoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pendiente: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60', icon: Clock },
    aprobada: { label: 'Aprobada', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60', icon: CheckCircle2 },
    en_transito: { label: 'En Tránsito', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-800/60', icon: Truck },
    recepcion_parcial: { label: 'Entrega en curso', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-800/60', icon: PackageOpen },
    recibida: { label: 'Recibida', color: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60', icon: PackageCheck },
    rechazada: { label: 'Rechazada', color: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60', icon: XCircle },
    cancelada: { label: 'Cancelada', color: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border', icon: Ban },
};

export const tipoFlujoConfig: Record<string, { label: string; color: string }> = {
    solicitud: { label: 'Solicitud', color: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-700/60' },
    solicitud_materiales: { label: 'Mat. construcción', color: 'bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-500/15 dark:text-teal-300 dark:border-teal-800/60' },
    push_directo: { label: 'Push directo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-800/60' },
    intra_bodega: { label: 'Intra-bodega', color: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-800/60' },
    intra_obra: { label: 'Intra-obra', color: 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-800/60' },
    orden_gerencia: { label: 'Orden gerencia', color: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-500/15 dark:text-purple-300 dark:border-purple-800/60' },
    devolucion: { label: 'Devolución', color: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-800/60' },
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

const TransferenciasList: React.FC<Props> = ({
    transferencias, loading, selectedId, onSelect,
    statusFilter, onStatusFilterChange, searchQuery, onSearchChange,
    discrepanciasCount = 0,
    canVerDiscrepancias = true,
}) => {
    const filtered = transferencias.filter(t =>
        !searchQuery || t.codigo.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Buscador + filtros en UNA sola fila — ocupa el ancho completo */}
            <div className="flex items-center gap-2 shrink-0 mb-3 mx-4 md:mx-6">
                {/* Buscador: ancho fijo para no aplastar los filtros */}
                <div className="relative w-44 shrink-0">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Buscar código..."
                        className="w-full pl-8 pr-7 py-1.5 text-xs border border-border rounded-xl bg-card focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all"
                    />
                    {searchQuery && (
                        <button onClick={() => onSearchChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded">
                            <X className="h-3 w-3 text-muted-foreground" />
                        </button>
                    )}
                </div>

                {/* Filtros: ocupan el resto del espacio disponible */}
                <StatusFilterBar
                    active={statusFilter}
                    onChange={onStatusFilterChange}
                    discrepanciasCount={discrepanciasCount}
                    canVerDiscrepancias={canVerDiscrepancias}
                    className="flex-1 min-w-0"
                />
            </div>

            {/* Lista estilo master (Vehículos) — borde izquierdo coloreado por estado + separadores */}
            <div className="flex-1 min-h-0 overflow-y-auto">
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
                        const origenBodega = (t as any).origen_bodega_nombre as string | null | undefined;
                        const destinoBodega = (t as any).destino_bodega_nombre as string | null | undefined;
                        const origen = (t as any).origen_obra_nombre
                            || (origenBodega ? formatBodegaNombreResponsable(origenBodega, (t as any).origen_bodega_responsable_nombre) : null)
                            || '—';
                        const destino = (t as any).destino_obra_nombre
                            || (destinoBodega ? formatBodegaNombreResponsable(destinoBodega, (t as any).destino_bodega_responsable_nombre) : null)
                            || '—';
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
                                    "cursor-pointer transition-all px-4 md:px-6 py-2 border-l-[3px] border-b border-b-border/50 last:border-b-0",
                                    borderLeft,
                                    isSelected
                                        ? "bg-brand-primary/[0.06]"
                                        : "hover:bg-brand-primary/[0.03]"
                                )}
                            >
                                {/* Fila 1: Código + badges + fecha — todo en una línea */}
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn(
                                        "text-sm font-bold shrink-0",
                                        isSelected ? "text-brand-primary" : "text-brand-dark"
                                    )}>
                                        {t.codigo}
                                    </span>
                                    <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md border leading-none shrink-0", cfg.color)}>
                                        {cfg.label}
                                    </span>
                                    {flujo && (
                                        <span className={cn("text-[9px] font-bold px-1.5 py-0.5 rounded-md border leading-none shrink-0", flujo.color)}>
                                            {flujo.label}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-muted-foreground/70 tabular-nums ml-auto shrink-0">
                                        {fechaStr}
                                    </span>
                                </div>

                                {/* Fila 2: Origen → Destino */}
                                <div className="flex items-center gap-1 mt-1 text-[10px] text-muted-foreground">
                                    <span className="truncate flex-1 min-w-0">{origen}</span>
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                    <span className="truncate flex-1 min-w-0">{destino}</span>
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

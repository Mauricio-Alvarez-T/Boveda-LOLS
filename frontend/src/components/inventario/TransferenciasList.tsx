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

// Paleta simplificada: verde (aprobada/recibida), rojo (pendiente/rechazada), gris para el resto.
const NEUTRAL = 'bg-muted text-muted-foreground border-border dark:bg-muted dark:text-muted-foreground dark:border-border';
const GREEN   = 'bg-green-100 text-green-700 border-green-200 dark:bg-green-500/15 dark:text-green-300 dark:border-green-800/60';
const RED     = 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-800/60';

export const estadoConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
    pendiente:         { label: 'Pendiente',       color: RED,     icon: Clock },
    aprobada:          { label: 'Aprobada',         color: GREEN,   icon: CheckCircle2 },
    en_transito:       { label: 'En Tránsito',      color: NEUTRAL, icon: Truck },
    recepcion_parcial: { label: 'Entrega en curso', color: NEUTRAL, icon: PackageOpen },
    recibida:          { label: 'Recibida',         color: GREEN,   icon: PackageCheck },
    rechazada:         { label: 'Rechazada',        color: RED,     icon: XCircle },
    cancelada:         { label: 'Cancelada',        color: NEUTRAL, icon: Ban },
};

// Tipo de flujo: todos en gris neutro (la info secundaria no necesita color).
const FLUJO_NEUTRAL = 'bg-muted text-muted-foreground border-border';
export const tipoFlujoConfig: Record<string, { label: string; color: string }> = {
    solicitud:            { label: 'Solicitud',        color: FLUJO_NEUTRAL },
    solicitud_materiales: { label: 'Mat. construcción', color: FLUJO_NEUTRAL },
    push_directo:         { label: 'Push directo',     color: FLUJO_NEUTRAL },
    intra_bodega:         { label: 'Intra-bodega',     color: FLUJO_NEUTRAL },
    intra_obra:           { label: 'Intra-obra',       color: FLUJO_NEUTRAL },
    orden_gerencia:       { label: 'Orden gerencia',   color: FLUJO_NEUTRAL },
    devolucion:           { label: 'Devolución',       color: FLUJO_NEUTRAL },
};

/** Color del borde izquierdo: verde/rojo/gris — alineado con la paleta simplificada */
const BORDER_LEFT_COLOR: Record<string, string> = {
    pendiente:         'border-l-red-400',
    aprobada:          'border-l-green-500',
    en_transito:       'border-l-border',
    recepcion_parcial: 'border-l-border',
    recibida:          'border-l-green-500',
    rechazada:         'border-l-red-400',
    cancelada:         'border-l-border',
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
                        const solicitante = (t as any).solicitante_nombre as string | undefined;

                        return (
                            <div
                                key={t.id}
                                onClick={() => onSelect(t.id)}
                                className={cn(
                                    "cursor-pointer transition-all px-3 md:px-4 py-1.5 border-l-[3px] border-b border-b-border/50 last:border-b-0",
                                    borderLeft,
                                    isSelected
                                        ? "bg-brand-primary/[0.06]"
                                        : "hover:bg-brand-primary/[0.03]"
                                )}
                            >
                                {/* Fila 1: Código + estado + fecha */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={cn(
                                        "text-xs font-bold shrink-0",
                                        isSelected ? "text-green-700 dark:text-green-300" : "text-brand-dark"
                                    )}>
                                        {t.codigo}
                                    </span>
                                    <span className={cn("text-caption font-bold px-1.5 py-0.5 rounded border leading-none shrink-0", cfg.color)}>
                                        {cfg.label}
                                    </span>
                                    <span className="text-label text-muted-foreground/60 tabular-nums ml-auto shrink-0">
                                        {fechaStr}
                                    </span>
                                </div>

                                {/* Fila 2: Destino · tipo de flujo */}
                                <div className="flex items-center gap-1 mt-0.5 text-label text-muted-foreground min-w-0">
                                    <ArrowRight className="h-2.5 w-2.5 shrink-0 text-muted-foreground/40" />
                                    <span className="truncate font-medium">{destino}</span>
                                    {flujo && (
                                        <>
                                            <span className="text-muted-foreground/30 shrink-0">·</span>
                                            <span className="truncate shrink-0 text-muted-foreground/70">{flujo.label}</span>
                                        </>
                                    )}
                                    {solicitante && (
                                        <>
                                            <span className="text-muted-foreground/30 shrink-0">·</span>
                                            <span className="truncate shrink-0 text-muted-foreground/70">{solicitante}</span>
                                        </>
                                    )}
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

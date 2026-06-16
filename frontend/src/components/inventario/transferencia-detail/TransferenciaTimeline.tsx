import React from 'react';
import { FileText, CheckCircle2, Truck, PackageOpen, PackageCheck, XCircle, Ban } from 'lucide-react';
import { cn } from '../../../utils/cn';

// ── Nodos posibles del timeline (rank = orden global del ciclo de vida) ──
type TimelineNode = { key: string; label: string; icon: React.ComponentType<{ className?: string }>; rank: number };

const NODE: Record<string, TimelineNode> = {
    solicitada: { key: 'solicitada', label: 'Solicitada', icon: FileText, rank: 0 },
    aprobada: { key: 'aprobada', label: 'Aprobada', icon: CheckCircle2, rank: 1 },
    en_transito: { key: 'en_transito', label: 'En tránsito', icon: Truck, rank: 2 },
    recibida: { key: 'recibida', label: 'Recibida', icon: PackageCheck, rank: 3 },
};

// Qué nodos se muestran según el tipo de flujo (algunos saltan etapas):
// - push_directo / orden_gerencia: nacen en tránsito (sin solicitud ni aprobación)
// - solicitud_materiales: no tiene despacho físico (sin "En tránsito")
// - resto (solicitud, intra_bodega, intra_obra, devolucion): ciclo completo
function getTimelineNodes(tipo_flujo?: string): TimelineNode[] {
    switch (tipo_flujo) {
        case 'push_directo':
        case 'orden_gerencia':
            return [NODE.en_transito, NODE.recibida];
        case 'solicitud_materiales':
            return [NODE.solicitada, NODE.aprobada, NODE.recibida];
        default:
            return [NODE.solicitada, NODE.aprobada, NODE.en_transito, NODE.recibida];
    }
}

// estado → rank del ciclo. recepcion_parcial vive DENTRO de "En tránsito".
const ESTADO_RANK: Record<string, number> = {
    pendiente: 0, aprobada: 1, en_transito: 2, recepcion_parcial: 2, recibida: 3,
    rechazada: -1, cancelada: -1,
};

/**
 * Stepper de estado del detalle de transferencia (o banner si rechazada/cancelada).
 * Los nodos se arman dinámicamente según `tipo_flujo` (Fase 3): push_directo/
 * orden_gerencia saltan Solicitada/Aprobada; solicitud_materiales no tiene
 * "En tránsito". En `recepcion_parcial` el nodo "En tránsito" muestra el sub-estado
 * "Entrega en curso · viaje N". `noun` cambia el texto del banner; `compact` el tamaño.
 */
export const TransferenciaTimeline: React.FC<{
    estado: string;
    observacionesRechazo?: string | null;
    /** Sustantivo del banner de terminada: "Transferencia" (catálogo) | "Solicitud" (materiales). */
    noun?: string;
    /** Variante compacta (layout de materiales): círculos w-9, padding px-2. */
    compact?: boolean;
    /** Tipo de flujo para variar los nodos (fallback: ciclo completo de "solicitud"). */
    tipo_flujo?: string;
    /** Nº de entregas ya recibidas (para el sub-estado "Entrega en curso · viaje N"). */
    viajesRecibidos?: number;
}> = ({ estado, observacionesRechazo, noun = 'Transferencia', compact = false, tipo_flujo, viajesRecibidos }) => {
    const isTerminated = estado === 'rechazada' || estado === 'cancelada';

    if (isTerminated) {
        return (
            <div className={cn("flex items-center gap-2 px-4 py-3 rounded-xl border", estado === 'rechazada' ? "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-900" : "bg-muted border-border")}>
                {estado === 'rechazada' ? <XCircle className="h-4 w-4 text-red-500" /> : <Ban className="h-4 w-4 text-muted-foreground" />}
                <div>
                    <p className={cn("text-xs font-bold", estado === 'rechazada' ? "text-red-700 dark:text-red-300" : "text-muted-foreground")}>
                        {estado === 'rechazada' ? `${noun} Rechazada` : `${noun} Cancelada`}
                    </p>
                    {observacionesRechazo && (
                        <p className="text-caption text-muted-foreground mt-0.5">{observacionesRechazo}</p>
                    )}
                </div>
            </div>
        );
    }

    const nodes = getTimelineNodes(tipo_flujo);
    const activeRank = ESTADO_RANK[estado] ?? -1;
    // currentRank = el rank más alto entre los nodos ya alcanzados (el "actual").
    const reachedRanks = nodes.map(n => n.rank).filter(r => r <= activeRank);
    const currentRank = reachedRanks.length ? Math.max(...reachedRanks) : -1;
    const enCurso = estado === 'recepcion_parcial';

    return (
        <div className={cn("flex items-center justify-between", compact ? "px-2" : "px-1 md:px-4")}>
            {nodes.map((node, idx) => {
                const completed = node.rank <= activeRank;
                const isCurrent = node.rank === currentRank;
                const StepIcon = node.icon;
                const showSub = enCurso && node.key === 'en_transito' && isCurrent;
                return (
                    <React.Fragment key={node.key}>
                        {idx > 0 && (
                            <div className={cn("flex-1 h-0.5 mx-1 md:mx-2", node.rank <= activeRank ? "bg-brand-primary" : "bg-muted")} />
                        )}
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={cn(
                                "rounded-full flex items-center justify-center border-2 transition-all",
                                compact ? "w-9 h-9" : "w-8 h-8 md:w-10 md:h-10",
                                completed
                                    ? "bg-brand-primary border-brand-primary text-white"
                                    : "bg-card border-border text-muted-foreground/40",
                                isCurrent && "ring-4 ring-brand-primary/20 scale-110"
                            )}>
                                <StepIcon className={compact ? "h-4 w-4" : "h-4 w-4 md:h-4.5 md:w-4.5"} />
                            </div>
                            <span className={cn(
                                "text-micro md:text-caption font-bold whitespace-nowrap",
                                completed ? "text-green-700 dark:text-green-300" : "text-muted-foreground/40"
                            )}>
                                {node.label}
                            </span>
                            {showSub && (
                                <span className="inline-flex items-center gap-1 text-micro font-bold text-brand-primary text-center leading-tight max-w-[84px] md:max-w-none md:whitespace-nowrap">
                                    <PackageOpen className="h-3 w-3 shrink-0" />
                                    Entrega en curso{viajesRecibidos ? ` · viaje ${viajesRecibidos + 1}` : ''}
                                </span>
                            )}
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

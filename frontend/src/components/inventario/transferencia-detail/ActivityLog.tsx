import React, { useState } from 'react';
import { Activity, ChevronDown, ChevronUp, FileText, CheckCircle2, Truck, PackageCheck, XCircle, Ban } from 'lucide-react';
import type { Transferencia } from '../../../types/entities';
import { fmtFechaHora } from '../../../utils/fechas';
import { cn } from '../../../utils/cn';

type ActivityEvent = {
    key: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    actor?: string | null;
    fecha?: string | null;
    nota?: string | null;
    tone: 'default' | 'danger' | 'muted';
};

/**
 * Bitácora de actividad de la transferencia (patrón "activity log" de Cin7,
 * Fase 2). Deriva los eventos del ciclo de vida (solicitud → aprobación →
 * despacho → recepción, + rechazo/cancelación) desde datos YA presentes en la
 * transferencia — SIN endpoint nuevo. Sección colapsable idéntica en ambos
 * layouts (catálogo y materiales). El historial de recepciones por-viaje vive
 * aparte (lo complementa, no lo duplica).
 */
export const ActivityLog: React.FC<{ t: Transferencia }> = ({ t }) => {
    const [open, setOpen] = useState(false);

    // "Aprobada" solo si el estado indica que SÍ se aprobó (no rechazada): la
    // columna fecha_aprobacion se reutiliza al rechazar, así que la desambiguamos
    // por estado para no rotular un rechazo como aprobación.
    const fueAprobada = ['aprobada', 'en_transito', 'recepcion_parcial', 'recibida'].includes(t.estado);

    const events: ActivityEvent[] = [
        {
            key: 'solicitada',
            label: 'Solicitada',
            icon: FileText,
            actor: t.solicitante_nombre,
            fecha: t.fecha_solicitud,
            tone: 'default',
        },
    ];

    if (fueAprobada && t.fecha_aprobacion) {
        events.push({ key: 'aprobada', label: 'Aprobada', icon: CheckCircle2, actor: t.aprobador_nombre, fecha: t.fecha_aprobacion, tone: 'default' });
    }
    if (t.fecha_despacho) {
        events.push({ key: 'despachada', label: 'Despachada', icon: Truck, actor: t.transportista_nombre, fecha: t.fecha_despacho, tone: 'default' });
    }
    if (t.estado === 'recibida' && t.fecha_recepcion) {
        events.push({ key: 'recibida', label: 'Recibida', icon: PackageCheck, actor: t.receptor_nombre, fecha: t.fecha_recepcion, tone: 'default' });
    }
    if (t.estado === 'rechazada') {
        events.push({ key: 'rechazada', label: 'Rechazada', icon: XCircle, actor: t.aprobador_nombre, fecha: t.fecha_aprobacion, nota: t.observaciones_rechazo, tone: 'danger' });
    }
    if (t.estado === 'cancelada') {
        events.push({ key: 'cancelada', label: 'Cancelada', icon: Ban, tone: 'muted' });
    }

    return (
        <div className="shrink-0 mb-5">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-brand-primary hover:bg-brand-primary/90 border border-border rounded-xl transition-all"
            >
                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5" />
                    Actividad ({events.length})
                </h4>
                {open ? <ChevronUp className="h-4 w-4 text-white" /> : <ChevronDown className="h-4 w-4 text-white" />}
            </button>
            {open && (
                <ol className="mt-2">
                    {events.map((ev, idx) => {
                        const EvIcon = ev.icon;
                        const last = idx === events.length - 1;
                        return (
                            <li key={ev.key} className="flex gap-3">
                                {/* Riel vertical + nodo del evento */}
                                <div className="flex flex-col items-center">
                                    <div className={cn(
                                        "w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0",
                                        ev.tone === 'danger'
                                            ? "bg-red-50 border-red-200 text-red-500 dark:bg-red-950/40 dark:border-red-900"
                                            : ev.tone === 'muted'
                                                ? "bg-muted border-border text-muted-foreground"
                                                : "bg-brand-primary/10 border-brand-primary/30 text-green-700 dark:text-green-300"
                                    )}>
                                        <EvIcon className="h-3.5 w-3.5" />
                                    </div>
                                    {!last && <div className="w-0.5 flex-1 min-h-3 bg-border my-1" />}
                                </div>
                                {/* Contenido del evento */}
                                <div className="flex-1 min-w-0 pb-3">
                                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                        <span className={cn(
                                            "text-xs font-bold",
                                            ev.tone === 'danger' ? "text-red-700 dark:text-red-300" : "text-brand-dark"
                                        )}>{ev.label}</span>
                                        {ev.fecha && <span className="text-caption text-muted-foreground">{fmtFechaHora(ev.fecha)}</span>}
                                    </div>
                                    {ev.actor && (
                                        <p className="text-caption text-muted-foreground">
                                            por <strong className="text-brand-dark">{ev.actor}</strong>
                                        </p>
                                    )}
                                    {ev.nota && <p className="text-caption text-muted-foreground/80 italic mt-0.5">{ev.nota}</p>}
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
        </div>
    );
};

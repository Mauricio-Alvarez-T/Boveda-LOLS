import React from 'react';
import { MapPin, ShoppingBag, MessageSquare } from 'lucide-react';
import { cn } from '../../../utils/cn';

/**
 * Helpers de SOLO LECTURA del detalle de transferencia (columna "Lo que se pide"
 * del flujo Solicitud de Materiales + secciones del detalle). No editan nada ni
 * participan en el payload. Extraídos de TransferenciaDetail.tsx (refactor Fase 1).
 */

export const MatEmpty: React.FC<{ children: string }> = ({ children }) => (
    <p className="text-xs text-muted-foreground py-1 pl-1 italic">{children}</p>
);

export const MatRequestRow: React.FC<{
    it: {
        descripcion: string; cantidad: number; cantidad_aprobada?: number | null;
        unidad: string | null; aprobado?: boolean; fuente?: 'comprar' | 'obra';
        origen_obra_nombre?: string | null; observacion?: string | null;
        nota_aprobador?: string | null; agregado_por_aprobador?: boolean;
    };
    estado: string;
}> = ({ it, estado }) => {
    const rechazado = it.aprobado === false;
    const ajustada = it.cantidad_aprobada != null && Number(it.cantidad_aprobada) !== Number(it.cantidad);
    const cant = it.cantidad_aprobada != null ? Number(it.cantidad_aprobada) : Number(it.cantidad);
    return (
        <div className={cn(
            "flex items-start justify-between gap-2 p-3 rounded-xl bg-muted/40 border border-border",
            rechazado && "opacity-60"
        )}>
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("text-xs font-bold text-brand-dark", rechazado && "line-through")}>{it.descripcion}</span>
                    {it.agregado_por_aprobador && (
                        <span className="px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold uppercase">+ aprobador</span>
                    )}
                    {rechazado && (
                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-red-700 dark:text-red-300 text-micro font-bold uppercase">No se compra</span>
                    )}
                    {/* La fuente la decide el aprobador → chip solo cuando ya está decidida. */}
                    {estado !== 'pendiente' && !rechazado && it.fuente === 'obra' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-green-700 dark:text-green-300 text-micro font-bold">
                            <MapPin className="h-2.5 w-2.5" /> Traer de {it.origen_obra_nombre || 'otra obra'}
                        </span>
                    )}
                    {estado !== 'pendiente' && !rechazado && it.fuente !== 'obra' && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border text-micro font-bold">
                            <ShoppingBag className="h-2.5 w-2.5" /> Comprar
                        </span>
                    )}
                </div>
                <p className="text-label text-muted-foreground">
                    {ajustada ? (
                        <><span className="line-through text-muted-foreground/60 mr-1">{Number(it.cantidad)}</span><span className="text-foreground font-bold">{cant}</span></>
                    ) : (
                        <span className="font-semibold">{cant}</span>
                    )}
                    {it.unidad ? ` ${it.unidad}` : ''}
                </p>
                {it.observacion && <p className="text-caption text-muted-foreground/70 italic">{it.observacion}</p>}
                {it.nota_aprobador && (
                    <p className="text-caption text-muted-foreground inline-flex items-center gap-1">
                        <MessageSquare className="h-2.5 w-2.5 shrink-0" /> {it.nota_aprobador}
                    </p>
                )}
            </div>
        </div>
    );
};

// Sección de detalle estilo Vehículos (etiqueta uppercase + contenido). Solo lectura.
export const DetailSection: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
    <section>
        <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-black text-brand-dark/50 uppercase tracking-widest flex items-center gap-1.5">
                {icon} {title}
            </span>
        </div>
        <div className="space-y-1.5">{children}</div>
    </section>
);

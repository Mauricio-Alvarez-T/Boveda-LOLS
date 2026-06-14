import React from 'react';
import { FileText, CheckCircle2, PackageCheck, XCircle, Ban } from 'lucide-react';
import { cn } from '../../../utils/cn';

// ── Timeline: 3 pasos (sin "Despachada") ──
const STEPS = [
    { key: 'pendiente', label: 'Solicitada', icon: FileText },
    { key: 'aprobada', label: 'Aprobada', icon: CheckCircle2 },
    { key: 'recibida', label: 'Recibida', icon: PackageCheck },
];

// recepcion_parcial entra como step 1 (junto con aprobada/en_transito) porque
// aún no termina el flujo — la TRF sigue abierta hasta el cierre total.
const STEP_INDEX: Record<string, number> = {
    pendiente: 0, aprobada: 1, en_transito: 1, recepcion_parcial: 1, recibida: 2,
    rechazada: -1, cancelada: -1,
};

/**
 * Stepper de estado del detalle de transferencia (o banner si está rechazada/
 * cancelada). Extraído de TransferenciaDetail.tsx (Fase 1) para de-duplicar los
 * 2 layouts. `noun` cambia el texto del banner ("Transferencia" vs "Solicitud")
 * y `compact` aplica el tamaño reducido del layout de materiales.
 */
export const TransferenciaTimeline: React.FC<{
    estado: string;
    observacionesRechazo?: string | null;
    /** Sustantivo del banner de terminada: "Transferencia" (catálogo) | "Solicitud" (materiales). */
    noun?: string;
    /** Variante compacta (layout de materiales): círculos w-9, padding px-2. */
    compact?: boolean;
}> = ({ estado, observacionesRechazo, noun = 'Transferencia', compact = false }) => {
    const activeStep = STEP_INDEX[estado] ?? -1;
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

    return (
        <div className={cn("flex items-center justify-between", compact ? "px-2" : "px-4")}>
            {STEPS.map((step, idx) => {
                const completed = idx <= activeStep;
                const isCurrent = idx === activeStep;
                const StepIcon = step.icon;
                return (
                    <React.Fragment key={step.key}>
                        {idx > 0 && (
                            <div className={cn("flex-1 h-0.5 mx-2", idx <= activeStep ? "bg-brand-primary" : "bg-muted")} />
                        )}
                        <div className="flex flex-col items-center gap-1.5">
                            <div className={cn(
                                "rounded-full flex items-center justify-center border-2 transition-all",
                                compact ? "w-9 h-9" : "w-10 h-10",
                                completed
                                    ? "bg-brand-primary border-brand-primary text-white"
                                    : "bg-card border-border text-muted-foreground/40",
                                isCurrent && "ring-4 ring-brand-primary/20 scale-110"
                            )}>
                                <StepIcon className={compact ? "h-4 w-4" : "h-4.5 w-4.5"} />
                            </div>
                            <span className={cn(
                                "text-caption font-bold whitespace-nowrap",
                                completed ? "text-green-700 dark:text-green-300" : "text-muted-foreground/40"
                            )}>
                                {step.label}
                            </span>
                        </div>
                    </React.Fragment>
                );
            })}
        </div>
    );
};

import React from 'react';
import { ClipboardCheck, ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EmptyState } from '../../ui/EmptyState';

interface ObraRankingItem {
    id: number;
    nombre: string;
    trabajadores: number;
    asistencia_tasa: number;
    docs_completos_pct: number;
    asistencia_guardada: boolean;
}

interface Props {
    data: ObraRankingItem[];
    onNavigate: (obraId: number) => void;
}

const UMBRAL = 80;

const cumpleAsistencia = (obra: ObraRankingItem): boolean =>
    obra.asistencia_guardada && obra.asistencia_tasa >= UMBRAL;

const ObraRanking: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <EmptyState
                className="py-8"
                icon={ClipboardCheck}
                title="Sin obras activas"
                description="Aún no hay obras con trabajadores asignados."
            />
        );
    }

    const cumple = data.filter(cumpleAsistencia);
    const noCumple = data.filter(o => !cumpleAsistencia(o));

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-brand-primary" />
                    <h4 className="text-sm font-semibold text-brand-dark">Asistencia por Obra</h4>
                </div>
                <span className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Hoy</span>
            </div>

            <div className="space-y-1.5">
                {[...cumple, ...noCumple].map((obra) => {
                    const ok = cumpleAsistencia(obra);
                    return (
                        <div
                            key={obra.id}
                            onClick={() => onNavigate(obra.id)}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all cursor-pointer group",
                                ok
                                    ? "bg-brand-accent/[0.06] border-brand-accent/20 hover:bg-brand-accent/10 hover:border-brand-accent/30"
                                    : "bg-destructive/[0.05] border-destructive/15 hover:bg-destructive/10 hover:border-destructive/25"
                            )}
                        >
                            {/* Estado icon */}
                            <div className="shrink-0">
                                {ok ? (
                                    <CheckCircle2 className="h-4 w-4 text-brand-accent" />
                                ) : (
                                    <XCircle className="h-4 w-4 text-destructive/70" />
                                )}
                            </div>

                            {/* Obra info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-brand-dark truncate">{obra.nombre}</p>
                                <p className="text-caption text-muted-foreground mt-0.5">
                                    {obra.trabajadores} trabajador{obra.trabajadores !== 1 ? 'es' : ''}
                                    {!obra.asistencia_guardada && (
                                        <span className="ml-1.5 text-destructive/70 font-semibold">· Sin registro</span>
                                    )}
                                </p>
                            </div>

                            {/* Tasa */}
                            <div className="shrink-0 text-right">
                                <span className={cn(
                                    "text-sm font-black tabular-nums",
                                    ok ? "text-brand-accent" : "text-destructive/70"
                                )}>
                                    {obra.asistencia_guardada ? `${obra.asistencia_tasa}%` : '—'}
                                </span>
                                <p className="text-micro text-muted-foreground uppercase tracking-wider">asist</p>
                            </div>

                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ObraRanking;

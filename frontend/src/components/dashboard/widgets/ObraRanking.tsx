import React from 'react';
import { ClipboardCheck, ArrowRight, CheckCircle2, Circle } from 'lucide-react';
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
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 dark:bg-teal-500/10">
                        <ClipboardCheck className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                    </span>
                    <h4 className="text-sm font-semibold text-foreground">Asistencia por Obra</h4>
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
                            className="flex items-center gap-3 px-2.5 py-2 rounded-xl transition-colors duration-200 cursor-pointer group hover:bg-background"
                        >
                            {/* Tile de estado — teal si cumple; gris neutro si sin registro (no crítico) */}
                            <span className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                                ok ? "bg-teal-50 dark:bg-teal-500/10" : "bg-muted"
                            )}>
                                {ok ? (
                                    <CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                                ) : (
                                    <Circle className="h-5 w-5 text-muted-foreground" />
                                )}
                            </span>

                            {/* Obra info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{obra.nombre}</p>
                                <p className="text-caption text-muted-foreground mt-0.5">
                                    {obra.trabajadores} trabajador{obra.trabajadores !== 1 ? 'es' : ''}
                                    {!obra.asistencia_guardada && (
                                        <span className="ml-1.5 text-destructive font-semibold">· Sin registro</span>
                                    )}
                                </p>
                            </div>

                            {/* Tasa */}
                            <div className="shrink-0 text-right">
                                <span className={cn(
                                    "text-sm font-bold tabular-nums",
                                    ok ? "text-teal-600 dark:text-teal-400" : "text-destructive"
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

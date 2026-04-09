import React from 'react';
import { Trophy, ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';

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

const getMedalColor = (index: number): string => {
    if (index === 0) return 'text-amber-500';
    if (index === 1) return 'text-slate-400';
    if (index === 2) return 'text-amber-700';
    return 'text-muted-foreground';
};

const getStatusColor = (value: number): string => {
    if (value >= 90) return 'bg-brand-accent';
    if (value >= 70) return 'bg-warning';
    return 'bg-destructive';
};

const getStatusEmoji = (asistencia: number, docs: number): string => {
    const avg = (asistencia + docs) / 2;
    if (avg >= 90) return '🟢';
    if (avg >= 70) return '🟡';
    return '🔴';
};

const ObraRanking: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center mb-3">
                    <Trophy className="h-6 w-6 text-brand-primary" />
                </div>
                <h4 className="text-sm font-bold text-brand-dark mb-1">Sin obras activas</h4>
                <p className="text-xs text-muted-foreground max-w-[200px]">Aún no hay obras con trabajadores asignados.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-brand-primary" />
                    <h4 className="text-sm font-semibold text-brand-dark">Ranking de Obras</h4>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Hoy</span>
            </div>

            {/* Table */}
            <div className="space-y-2">
                {data.map((obra, idx) => (
                    <div
                        key={obra.id}
                        onClick={() => onNavigate(obra.id)}
                        className={cn(
                            "flex items-center gap-3 p-2.5 rounded-xl border border-transparent transition-all cursor-pointer group",
                            "hover:bg-background hover:border-border hover:shadow-sm",
                            idx === 0 && "bg-amber-500/[0.03]"
                        )}
                    >
                        {/* Position */}
                        <div className="w-6 text-center shrink-0">
                            <span className={cn("text-sm font-black", getMedalColor(idx))}>
                                {idx < 3 ? ['🥇', '🥈', '🥉'][idx] : `#${idx + 1}`}
                            </span>
                        </div>

                        {/* Obra info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px]">{getStatusEmoji(obra.asistencia_tasa, obra.docs_completos_pct)}</span>
                                <p className="text-xs font-bold text-brand-dark truncate">{obra.nombre}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                {obra.trabajadores} trabajador{obra.trabajadores !== 1 ? 'es' : ''}
                                {!obra.asistencia_guardada && (
                                    <span className="ml-1.5 text-warning font-semibold">· Sin asistencia</span>
                                )}
                            </p>
                        </div>

                        {/* Metrics bars */}
                        <div className="flex flex-col gap-1.5 w-24 shrink-0">
                            {/* Attendance bar */}
                            <div>
                                <div className="flex items-center justify-between text-[8px] font-bold mb-0.5">
                                    <span className="text-muted-foreground uppercase tracking-widest">Asist</span>
                                    <span className={cn(
                                        obra.asistencia_tasa >= 80 ? "text-brand-accent" : "text-destructive"
                                    )}>
                                        {obra.asistencia_tasa}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-[#E5E5EA] rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-700", getStatusColor(obra.asistencia_tasa))}
                                        style={{ width: `${Math.max(2, obra.asistencia_tasa)}%` }}
                                    />
                                </div>
                            </div>

                            {/* Docs bar */}
                            <div>
                                <div className="flex items-center justify-between text-[8px] font-bold mb-0.5">
                                    <span className="text-muted-foreground uppercase tracking-widest">Docs</span>
                                    <span className={cn(
                                        obra.docs_completos_pct >= 80 ? "text-brand-accent" : "text-destructive"
                                    )}>
                                        {obra.docs_completos_pct}%
                                    </span>
                                </div>
                                <div className="h-1.5 w-full bg-[#E5E5EA] rounded-full overflow-hidden">
                                    <div
                                        className={cn("h-full rounded-full transition-all duration-700", getStatusColor(obra.docs_completos_pct))}
                                        style={{ width: `${Math.max(2, obra.docs_completos_pct)}%` }}
                                    />
                                </div>
                            </div>
                        </div>

                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ObraRanking;

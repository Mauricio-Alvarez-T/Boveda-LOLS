import React from 'react';
import { ClipboardCheck } from 'lucide-react';
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
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <ClipboardCheck className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-sm font-semibold text-brand-primary">Asistencia por Obra</h3>
                </div>
                <span className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Hoy</span>
            </div>

            <div>
                {[...cumple, ...noCumple].map((obra) => {
                    const ok = cumpleAsistencia(obra);
                    return (
                        <div
                            key={obra.id}
                            onClick={() => onNavigate(obra.id)}
                            className="flex items-center justify-between gap-3 py-2.5 border-t border-border cursor-pointer transition-colors hover:bg-background -mx-2 px-2 rounded-md"
                        >
                            {/* Nombre + Nº trabajadores (contenido neutro) */}
                            <p className="min-w-0 truncate text-sm text-foreground">
                                <span className="font-medium">{obra.nombre}</span>
                                <span className="text-muted-foreground"> · {obra.trabajadores} trabajador{obra.trabajadores !== 1 ? 'es' : ''}</span>
                            </p>

                            {/* Badge de estado (color = significado, paleta accesible WCAG AA):
                                al día = verde · pendiente/bajo = ámbar */}
                            {ok ? (
                                <span className="shrink-0 rounded-full bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300 px-2.5 py-0.5 text-xs font-medium">
                                    Al día · {obra.asistencia_tasa}%
                                </span>
                            ) : obra.asistencia_guardada ? (
                                <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 px-2.5 py-0.5 text-xs font-medium">
                                    {obra.asistencia_tasa}%
                                </span>
                            ) : (
                                <span className="shrink-0 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 px-2.5 py-0.5 text-xs font-medium">
                                    Sin registro
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default ObraRanking;

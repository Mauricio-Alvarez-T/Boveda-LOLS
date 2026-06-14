import React from 'react';
import { UserX } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';

interface Ausente {
    nombres: string;
    apellido_paterno: string;
    apellido_materno?: string | null;
    estado: string;
    obra: string;
}

interface Props {
    data: Ausente[];
}

const AbsencesToday: React.FC<Props> = ({ data }) => {
    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <UserX className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Ausentes del Día</h3>
                </div>
                <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">
                    {data.length} total
                </span>
            </div>
            <div className="space-y-2">
                {data.length > 0 ? (
                    data.slice(0, 8).map((a, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-background transition-colors">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                                <UserX className="h-5 w-5 text-muted-foreground" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                    {a.apellido_paterno} {a.apellido_materno || ''} {a.nombres}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{a.obra || 'Sin obra'}</p>
                            </div>
                            <Chip tone="neutral" label={a.estado} className="shrink-0" />
                        </div>
                    ))
                ) : (
                    <EmptyState className="py-8" icon={UserX} title="Asistencia perfecta hoy. 🎉" />
                )}
                {data.length > 8 && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                        + {data.length - 8} más
                    </p>
                )}
            </div>
        </div>
    );
};

export default AbsencesToday;

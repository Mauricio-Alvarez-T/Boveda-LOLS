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
    /**
     * Total real de ausentes (`counters.ausentes_hoy`). `data` viene recortada a 20 filas desde
     * el backend (dashboard.service, LIMIT 20): contar con `data.length` mostraba "20 total"
     * aunque fueran 35. Sin `total`, se cae a `data.length`.
     */
    total?: number;
}

const MAX_FILAS = 8;

const AbsencesToday: React.FC<Props> = ({ data, total }) => {
    const totalReal = total ?? data.length;
    const mostradas = Math.min(data.length, MAX_FILAS);
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
                    {totalReal} total
                </span>
            </div>
            <div className="space-y-2">
                {data.length > 0 ? (
                    data.slice(0, MAX_FILAS).map((a, i) => (
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
                    // Lista vacía = nadie con estado de ausencia guardado hoy. NO prueba "asistencia
                    // perfecta": también está vacía si aún no se guarda la asistencia del día.
                    // Por eso ni emoji ni ícono de "todo bien": el mismo ícono neutro del encabezado
                    // (diseno.md §7.3: color/ícono con significado, no decoración).
                    <EmptyState className="py-8" icon={UserX} title="Sin ausencias registradas hoy" />
                )}
                {totalReal > mostradas && (
                    <p className="text-xs text-muted-foreground text-center pt-1">
                        + {totalReal - mostradas} más
                    </p>
                )}
            </div>
        </div>
    );
};

export default AbsencesToday;

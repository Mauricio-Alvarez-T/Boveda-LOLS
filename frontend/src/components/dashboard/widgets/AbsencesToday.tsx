import React from 'react';
import { UserX } from 'lucide-react';

interface Ausente {
    nombres: string;
    apellido_paterno: string;
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
                <h3 className="text-base font-semibold text-brand-dark flex items-center gap-2">
                    <UserX className="h-4 w-4 text-warning" />
                    Ausentes del Día
                </h3>
                <span className="text-xs text-muted uppercase font-semibold tracking-wider">
                    {data.length} total
                </span>
            </div>
            <div className="space-y-2">
                {data.length > 0 ? (
                    data.slice(0, 8).map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-xl hover:bg-background transition-colors">
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-brand-dark truncate">
                                    {a.nombres} {a.apellido_paterno}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">{a.obra || 'Sin obra'}</p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/10 text-warning uppercase tracking-wider shrink-0">
                                {a.estado}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="py-6 text-center text-muted-foreground">
                        <UserX className="h-8 w-8 mx-auto opacity-20 mb-2" />
                        <p className="text-xs italic">Asistencia perfecta hoy. 🎉</p>
                    </div>
                )}
                {data.length > 8 && (
                    <p className="text-xs text-muted text-center pt-1">
                        + {data.length - 8} más
                    </p>
                )}
            </div>
        </div>
    );
};

export default AbsencesToday;

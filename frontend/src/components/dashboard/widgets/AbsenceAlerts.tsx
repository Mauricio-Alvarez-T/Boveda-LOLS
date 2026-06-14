import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EmptyState } from '../../ui/EmptyState';

interface Alerta {
    tipo: 'consecutivas' | 'lunes' | 'acumuladas';
    mensaje: string;
}

interface TrabajadorConAlerta {
    trabajador_id: number;
    nombres: string;
    apellido_paterno: string;
    rut: string;
    total_faltas: number;
    alertas: Alerta[];
}

interface Props {
    data: TrabajadorConAlerta[];
    onNavigate: (rut: string) => void;
}

// Color = significado (paleta accesible WCAG AA): faltas consecutivas = rojo
// (más grave), acumuladas = ámbar (precaución), lunes = neutro. El tipo también
// se nombra en el mensaje, así que el color no es el único portador del estado.
const tipoColor = (tipo: Alerta['tipo']) => {
    if (tipo === 'consecutivas') return 'text-red-700 dark:text-red-300';
    if (tipo === 'acumuladas')   return 'text-amber-700 dark:text-amber-300';
    return 'text-muted-foreground';
};

const AbsenceAlerts: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <EmptyState
                className="py-8"
                icon={ShieldAlert}
                title="Sin alertas este mes"
                description="Ningún trabajador presenta faltas acumuladas o consecutivas."
            />
        );
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/[0.08]">
                        <AlertTriangle className="h-5 w-5 text-red-700 dark:text-red-300" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Alertas de Inasistencia</h3>
                </div>
                <span className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Este mes</span>
            </div>

            <div className="space-y-2">
                {data.map((t) => (
                    <div
                        key={t.trabajador_id}
                        onClick={() => onNavigate(t.rut)}
                        className="flex items-start gap-3 px-2.5 py-2 rounded-xl hover:bg-background transition-colors duration-200 cursor-pointer group"
                    >
                        {/* Tile crítico (faltas) — rojo solo aquí, que es crítico */}
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/[0.08]">
                            <AlertTriangle className="h-5 w-5 text-red-700 dark:text-red-300" />
                        </span>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-foreground truncate">
                                {t.apellido_paterno} {t.nombres}
                            </p>
                            <p className="text-caption text-muted-foreground mb-1">{t.rut}</p>
                            <div className="flex flex-col gap-0.5">
                                {t.alertas.map((a, i) => (
                                    <p key={i} className={cn("text-caption font-semibold", tipoColor(a.tipo))}>
                                        · {a.mensaje}
                                    </p>
                                ))}
                            </div>
                        </div>

                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AbsenceAlerts;

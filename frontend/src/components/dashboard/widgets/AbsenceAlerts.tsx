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

const tipoColor = (tipo: Alerta['tipo']) => {
    if (tipo === 'consecutivas') return 'text-destructive';
    if (tipo === 'acumuladas')   return 'text-destructive/80';
    return 'text-warning';
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
                <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <h4 className="text-sm font-semibold text-brand-dark">Alertas de Inasistencia</h4>
                </div>
                <span className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Este mes</span>
            </div>

            <div className="space-y-2">
                {data.map((t) => (
                    <div
                        key={t.trabajador_id}
                        onClick={() => onNavigate(t.rut)}
                        className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-destructive/15 bg-destructive/[0.04] hover:bg-destructive/[0.08] hover:border-destructive/25 transition-all cursor-pointer group"
                    >
                        {/* Icono */}
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive/60 mt-0.5 shrink-0" />

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-brand-dark truncate">
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

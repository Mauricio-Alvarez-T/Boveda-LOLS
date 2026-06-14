import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';

interface Alert {
    tipo: 'critical' | 'warning' | 'info';
    titulo: string;
    mensaje: string;
    count: number;
    ruta: string;
}

interface Props {
    alerts: Alert[];
    onNavigate: (route: string) => void;
}

// Paleta estricta: fondo neutro siempre. Solo el texto/ícono de "critical" usa
// rojo (discreto); warning/info en gris.
const alertStyles = {
    critical: {
        border: 'border-border',
        bg: 'bg-background',
        text: 'text-destructive',
        icon: AlertTriangle,
    },
    warning: {
        border: 'border-border',
        bg: 'bg-background',
        text: 'text-muted-foreground',
        icon: AlertTriangle,
    },
    info: {
        border: 'border-border',
        bg: 'bg-background',
        text: 'text-muted-foreground',
        icon: Info,
    },
};

const CriticalAlerts: React.FC<Props> = ({ alerts, onNavigate }) => {
    return (
        <div>
            <div className="flex items-center gap-2.5 mb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/[0.08]">
                    <AlertTriangle className={cn("h-5 w-5", alerts.length > 0 ? "text-destructive" : "text-muted-foreground")} />
                </span>
                <h4 className="text-sm font-semibold text-foreground">Alertas</h4>
            </div>
            <div className="space-y-3">
                {alerts.length > 0 ? (
                    alerts.map((alert, i) => {
                        const style = alertStyles[alert.tipo];
                        const Icon = style.icon;
                        return (
                            <div key={i} className={cn("p-3 rounded-xl border", style.bg, style.border)}>
                                <div className="flex items-start gap-2">
                                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", style.text)} />
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-caption font-semibold uppercase tracking-widest", style.text)}>
                                            {alert.titulo}
                                        </p>
                                        <p className="text-xs text-brand-dark mt-1 leading-relaxed">
                                            {alert.mensaje}
                                        </p>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => onNavigate(alert.ruta)}
                                            leftIcon={<ArrowRight className="h-3 w-3" />}
                                            className={cn("mt-2", style.text)}
                                        >
                                            Ver detalle
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <EmptyState className="py-8" icon={CheckCircle2} title="No hay alertas pendientes." />
                )}
            </div>
        </div>
    );
};

export default CriticalAlerts;

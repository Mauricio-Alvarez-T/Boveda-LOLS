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

// Color = significado (paleta accesible WCAG AA): superficie interna neutra
// (bg-muted, que en oscuro queda MÁS clara que la card), y el texto/ícono usa el
// tono del rol con contraste suficiente: crítico=rojo, precaución=ámbar, info=azul.
const alertStyles = {
    critical: {
        bg: 'bg-muted',
        text: 'text-red-700 dark:text-red-300',
        icon: AlertTriangle,
    },
    warning: {
        bg: 'bg-muted',
        text: 'text-amber-800 dark:text-amber-300',
        icon: AlertTriangle,
    },
    info: {
        bg: 'bg-muted',
        text: 'text-blue-700 dark:text-blue-300',
        icon: Info,
    },
};

const CriticalAlerts: React.FC<Props> = ({ alerts, onNavigate }) => {
    return (
        <div>
            <div className="flex items-center gap-2.5 mb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/[0.08]">
                    <AlertTriangle className={cn("h-5 w-5", alerts.length > 0 ? "text-red-700 dark:text-red-300" : "text-muted-foreground")} />
                </span>
                <h3 className="text-sm font-semibold text-foreground">Alertas</h3>
            </div>
            <div className="space-y-3">
                {alerts.length > 0 ? (
                    alerts.map((alert, i) => {
                        const style = alertStyles[alert.tipo];
                        const Icon = style.icon;
                        return (
                            <div key={i} className={cn("p-3 rounded-xl border border-border", style.bg)}>
                                <div className="flex items-start gap-2">
                                    <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", style.text)} />
                                    <div className="flex-1 min-w-0">
                                        <p className={cn("text-caption font-semibold uppercase tracking-widest", style.text)}>
                                            {alert.titulo}
                                        </p>
                                        <p className="text-xs text-foreground mt-1 leading-relaxed">
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

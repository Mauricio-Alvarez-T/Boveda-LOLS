import React from 'react';
import { AlertTriangle, CheckCircle2, Info, ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';

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

const alertStyles = {
    critical: {
        border: 'border-[#FF3B30]/30',
        bg: 'bg-[#FF3B30]/5',
        text: 'text-[#FF3B30]',
        icon: AlertTriangle,
    },
    warning: {
        border: 'border-[#FF9F0A]/30',
        bg: 'bg-[#FF9F0A]/5',
        text: 'text-[#FF9F0A]',
        icon: AlertTriangle,
    },
    info: {
        border: 'border-[#0071E3]/20',
        bg: 'bg-[#0071E3]/5',
        text: 'text-[#0071E3]',
        icon: Info,
    },
};

const CriticalAlerts: React.FC<Props> = ({ alerts, onNavigate }) => {
    return (
        <div>
            <h4 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2 mb-4">
                <AlertTriangle className={cn("h-4 w-4", alerts.length > 0 ? "text-[#FF3B30]" : "text-[#A1A1A6]")} />
                Alertas
            </h4>
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
                                        <p className={cn("text-[10px] font-semibold uppercase tracking-widest", style.text)}>
                                            {alert.titulo}
                                        </p>
                                        <p className="text-xs text-[#1D1D1F] mt-1 leading-relaxed">
                                            {alert.mensaje}
                                        </p>
                                        <button
                                            onClick={() => onNavigate(alert.ruta)}
                                            className={cn("text-[10px] font-bold mt-2 flex items-center gap-1 hover:underline", style.text)}
                                        >
                                            <ArrowRight className="h-3 w-3" />
                                            Ver detalle
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="p-4 text-center border border-dashed border-[#D2D2D7] rounded-xl">
                        <CheckCircle2 className="h-7 w-7 text-[#34C759] mx-auto mb-2 opacity-50" />
                        <p className="text-xs text-[#6E6E73] italic">No hay alertas pendientes.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CriticalAlerts;

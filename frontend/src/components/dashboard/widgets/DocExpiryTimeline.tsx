import React from 'react';
import { CalendarClock, FileWarning, ArrowRight } from 'lucide-react';
import { cn } from '../../../utils/cn';

interface ExpiryItem {
    fecha: string;
    tipo_documento: string;
    trabajador: string;
    trabajador_id: number;
    rut: string;
    obra: string;
}

interface Props {
    data: ExpiryItem[];
    onNavigate: (rut: string) => void;
}

const DocExpiryTimeline: React.FC<Props> = ({ data, onNavigate }) => {
    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-3">
                    <CalendarClock className="h-6 w-6 text-brand-accent" />
                </div>
                <h4 className="text-sm font-bold text-brand-dark mb-1">Sin vencimientos próximos</h4>
                <p className="text-xs text-muted-foreground max-w-[200px]">No hay documentos por vencer en los próximos 14 días.</p>
            </div>
        );
    }

    // Group by date
    const grouped = data.reduce<Record<string, ExpiryItem[]>>((acc, item) => {
        if (!acc[item.fecha]) acc[item.fecha] = [];
        acc[item.fecha].push(item);
        return acc;
    }, {});

    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    const getSeverity = (fecha: string): 'critical' | 'warning' | 'ok' => {
        if (fecha === today || fecha === tomorrow) return 'critical';
        const daysLeft = Math.ceil((new Date(fecha).getTime() - new Date(today).getTime()) / 86400000);
        if (daysLeft <= 3) return 'warning';
        return 'ok';
    };

    const getDateLabel = (fecha: string): string => {
        if (fecha === today) return 'Hoy';
        if (fecha === tomorrow) return 'Mañana';
        const d = new Date(fecha + 'T12:00:00');
        const daysLeft = Math.ceil((d.getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000);
        const dayName = d.toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' });
        return `${dayName} (${daysLeft}d)`;
    };

    const severityStyles = {
        critical: { dot: 'bg-destructive', bg: 'bg-destructive/5', line: 'bg-destructive/20' },
        warning: { dot: 'bg-warning', bg: 'bg-warning/5', line: 'bg-warning/20' },
        ok: { dot: 'bg-brand-primary', bg: 'bg-brand-primary/5', line: 'bg-brand-primary/10' }
    };

    const sortedDates = Object.keys(grouped).sort();

    return (
        <div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4 text-brand-primary" />
                    <h4 className="text-sm font-semibold text-brand-dark">Vencimientos Próximos</h4>
                </div>
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">14 días</span>
            </div>

            {/* Timeline */}
            <div className="relative pl-4">
                {/* Vertical line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-[2px] bg-border rounded-full" />

                <div className="space-y-4">
                    {sortedDates.slice(0, 6).map(fecha => {
                        const items = grouped[fecha];
                        const severity = getSeverity(fecha);
                        const styles = severityStyles[severity];
                        const label = getDateLabel(fecha);

                        return (
                            <div key={fecha} className="relative">
                                {/* Timeline dot */}
                                <div className={cn(
                                    "absolute -left-4 top-1 h-3.5 w-3.5 rounded-full border-[3px] border-white shadow-sm z-10",
                                    styles.dot
                                )} />

                                {/* Content */}
                                <div className="ml-2">
                                    <p className={cn(
                                        "text-[10px] font-bold uppercase tracking-wider mb-1.5",
                                        severity === 'critical' ? 'text-destructive'
                                            : severity === 'warning' ? 'text-warning'
                                                : 'text-muted-foreground'
                                    )}>
                                        {label}
                                    </p>

                                    <div className="space-y-1.5">
                                        {items.slice(0, 3).map((item, idx) => (
                                            <div
                                                key={`${item.rut}-${idx}`}
                                                onClick={() => onNavigate(item.rut)}
                                                className={cn(
                                                    "flex items-center gap-2.5 p-2 rounded-lg border cursor-pointer group transition-all",
                                                    styles.bg, "border-transparent hover:border-border hover:shadow-sm"
                                                )}
                                            >
                                                <FileWarning className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-[11px] font-semibold text-brand-dark truncate">{item.tipo_documento}</p>
                                                    <p className="text-[10px] text-muted-foreground truncate">{item.trabajador} · {item.obra}</p>
                                                </div>
                                                <ArrowRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                                            </div>
                                        ))}
                                        {items.length > 3 && (
                                            <p className="text-[10px] text-muted-foreground pl-2 italic">
                                                + {items.length - 3} más ese día
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {sortedDates.length > 6 && (
                    <p className="text-[10px] text-muted-foreground text-center mt-3 italic">
                        + {sortedDates.length - 6} días más con vencimientos
                    </p>
                )}
            </div>
        </div>
    );
};

export default DocExpiryTimeline;

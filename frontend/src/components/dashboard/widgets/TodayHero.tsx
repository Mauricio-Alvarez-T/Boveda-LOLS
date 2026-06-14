import React, { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
    Sun, Moon, Sunset, Zap, CheckCircle2, AlertTriangle,
    ArrowRight, ClipboardCheck, FileWarning
} from 'lucide-react';
import { Button } from '../../ui/Button';

interface AttendanceStatusEntry {
    nombre: string;
    guardada: boolean;
}

interface Props {
    userName: string;
    counters: {
        vencidos?: number;
        porVencer7d?: number;
        ausentes_hoy?: number;
        trabajadoresSinDocs?: number;
    };
    pendingTasksCount: number;
    attendanceStatus: Record<string, AttendanceStatusEntry>;
    onNavigate: (route: string) => void;
    tint?: string;
}

const TodayHero: React.FC<Props> = ({ userName, counters, pendingTasksCount, attendanceStatus, onNavigate, tint = 'bg-card' }) => {
    const hour = new Date().getHours();
    const reduceMotion = useReducedMotion();

    const timeConfig = useMemo(() => {
        if (hour < 12) return { greeting: 'Buenos días', icon: Sun };
        if (hour < 19) return { greeting: 'Buenas tardes', icon: Sunset };
        return { greeting: 'Buenas noches', icon: Moon };
    }, [hour]);

    const TimeIcon = timeConfig.icon;

    const obrasSinAsistencia = useMemo(() => {
        return Object.entries(attendanceStatus)
            .filter(([, v]) => !v.guardada)
            .map(([, v]) => v.nombre);
    }, [attendanceStatus]);

    const hasCriticalDocs = (counters.vencidos ?? 0) > 0;
    const hasExpiringSoon = (counters.porVencer7d ?? 0) > 0;

    const insights: { text: string; severity: 'ok' | 'warn' | 'critical' }[] = [];
    if (obrasSinAsistencia.length > 0) {
        insights.push({
            text: obrasSinAsistencia.length === 1
                ? `No se ha guardado asistencia hoy en ${obrasSinAsistencia[0]}.`
                : `${obrasSinAsistencia.length} obras sin asistencia guardada hoy.`,
            severity: 'warn'
        });
    }
    if (hasCriticalDocs) {
        insights.push({ text: `${counters.vencidos} documento${counters.vencidos !== 1 ? 's' : ''} vencido${counters.vencidos !== 1 ? 's' : ''} requieren atención.`, severity: 'critical' });
    }
    if (hasExpiringSoon) {
        insights.push({ text: `${counters.porVencer7d} documento${counters.porVencer7d !== 1 ? 's' : ''} vence${counters.porVencer7d !== 1 ? 'n' : ''} esta semana.`, severity: 'warn' });
    }
    if (insights.length === 0) {
        insights.push({ text: 'Todo está al día. ¡Excelente trabajo!', severity: 'ok' });
    }

    const primaryCTA = obrasSinAsistencia.length > 0
        ? { label: 'Ir a Asistencia', route: '/asistencia', icon: ClipboardCheck }
        : hasCriticalDocs
            ? { label: 'Ver Documentos', route: '/consultas?completitud=faltantes', icon: FileWarning }
            : null;

    const reveal = reduceMotion ? {} : {
        initial: { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] as const },
    };

    return (
        <motion.div
            {...reveal}
            className={`relative overflow-hidden rounded-card border border-border ${tint} p-8 md:p-10`}
        >
            <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                            <TimeIcon className="h-5 w-5 text-muted-foreground" />
                        </span>
                        <span className="text-sm font-medium text-muted-foreground">{timeConfig.greeting}</span>
                    </div>
                    <h2 className="mt-2 text-title font-semibold tracking-title text-foreground md:text-headline md:tracking-headline">
                        {userName?.split(' ')[0] || 'Operador'}
                    </h2>

                    {/* Insights */}
                    <div className="mt-5 space-y-2">
                        {insights.map((insight, idx) => {
                            // Semántica: al día = verde · pendiente/precaución = ámbar · crítico = rojo.
                            const isOk = insight.severity === 'ok';
                            const Icon = isOk ? CheckCircle2 : AlertTriangle;
                            const tone = isOk ? 'text-brand-primary' : insight.severity === 'critical' ? 'text-destructive' : 'text-warning';
                            return (
                                <div key={idx} className="flex items-start gap-2.5">
                                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                                    <p className={`text-base leading-relaxed ${tone}`}>{insight.text}</p>
                                </div>
                            );
                        })}
                    </div>

                    {pendingTasksCount > 0 && (
                        <div className="mt-4 flex items-center gap-1.5">
                            <Zap className="h-3.5 w-3.5 text-warning" />
                            <span className="text-sm font-medium text-warning">
                                {pendingTasksCount} tarea{pendingTasksCount !== 1 ? 's' : ''} pendiente{pendingTasksCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>

                {primaryCTA && (
                    <div className="shrink-0">
                        <Button
                            variant="primary"
                            size="lg"
                            onClick={() => onNavigate(primaryCTA.route)}
                            leftIcon={<primaryCTA.icon className="h-4 w-4" />}
                            rightIcon={<ArrowRight className="h-4 w-4" />}
                        >
                            {primaryCTA.label}
                        </Button>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default TodayHero;

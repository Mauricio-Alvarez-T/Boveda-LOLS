import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Sun, Moon, Sunset, Zap, CheckCircle2, AlertTriangle,
    ArrowRight, ClipboardCheck, FileWarning
} from 'lucide-react';
import { cn } from '../../../utils/cn';
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
}

const TodayHero: React.FC<Props> = ({ userName, counters, pendingTasksCount, attendanceStatus, onNavigate }) => {
    const hour = new Date().getHours();

    // Paleta neutra del DS: icono y lavado en verde marca, sin colores cálidos por franja
    const timeConfig = useMemo(() => {
        if (hour < 12) return { greeting: 'Buenos días', icon: Sun };
        if (hour < 19) return { greeting: 'Buenas tardes', icon: Sunset };
        return { greeting: 'Buenas noches', icon: Moon };
    }, [hour]);

    const TimeIcon = timeConfig.icon;

    // Determine primary CTA
    const obrasSinAsistencia = useMemo(() => {
        return Object.entries(attendanceStatus)
            .filter(([, v]) => !v.guardada)
            .map(([, v]) => v.nombre);
    }, [attendanceStatus]);

    const hasCriticalDocs = (counters.vencidos ?? 0) > 0;
    const hasExpiringSoon = (counters.porVencer7d ?? 0) > 0;

    // Build insight phrases
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

    // Primary CTA
    const primaryCTA = obrasSinAsistencia.length > 0
        ? { label: 'Ir a Asistencia', route: '/asistencia', icon: ClipboardCheck }
        : hasCriticalDocs
            ? { label: 'Ver Documentos', route: '/consultas?completitud=faltantes', icon: FileWarning }
            : null;

    return (
        <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={cn(
                "relative overflow-hidden rounded-2xl border border-border bg-card p-5 md:p-6",
                "shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            )}
        >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-brand-primary/5 to-transparent pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-4">
                {/* Left: Greeting */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2.5 mb-2">
                        <div className="p-2 rounded-xl bg-card shadow-sm border border-border/50 text-brand-primary">
                            <TimeIcon className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-base md:text-lg font-bold text-brand-dark leading-tight">
                                {timeConfig.greeting}, <span className="text-brand-primary">{userName?.split(' ')[0] || 'Operador'}</span>
                            </h2>
                        </div>
                    </div>

                    {/* Insights */}
                    <div className="space-y-1.5 mt-3">
                        {insights.map((insight, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                                {insight.severity === 'ok' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-brand-accent shrink-0" />
                                ) : insight.severity === 'critical' ? (
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
                                ) : (
                                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 text-warning shrink-0" />
                                )}
                                <p className="text-xs md:text-sm text-brand-dark/80 leading-relaxed">{insight.text}</p>
                            </div>
                        ))}
                    </div>

                    {pendingTasksCount > 0 && (
                        <div className="mt-3 flex items-center gap-1.5">
                            <Zap className="h-3 w-3 text-brand-primary" />
                            <span className="text-label font-semibold text-brand-primary">
                                {pendingTasksCount} tarea{pendingTasksCount !== 1 ? 's' : ''} pendiente{pendingTasksCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                    )}
                </div>

                {/* Right: CTA */}
                {primaryCTA && (
                    <div className="shrink-0">
                        <Button
                            variant="primary"
                            onClick={() => onNavigate(primaryCTA.route)}
                            leftIcon={<primaryCTA.icon className="h-4 w-4" />}
                            rightIcon={<ArrowRight className="h-3.5 w-3.5" />}
                            className="shadow-md hover:shadow-lg"
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

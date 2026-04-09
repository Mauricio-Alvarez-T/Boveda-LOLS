import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, FileText, ClipboardCheck, Users,
    ArrowRight, ChevronDown, ChevronUp,
    AlertTriangle, AlertCircle, Info
} from 'lucide-react';
import { cn } from '../../../utils/cn';

interface PendingTask {
    severity: 'critical' | 'warning' | 'info';
    category: 'documentos' | 'asistencia' | 'contratos';
    title: string;
    description: string;
    action: { label: string; ruta: string };
    meta?: Record<string, any>;
}

interface Props {
    tasks: PendingTask[];
    onNavigate: (route: string) => void;
}

const severityConfig = {
    critical: {
        icon: AlertTriangle,
        dot: 'bg-destructive',
        bg: 'bg-destructive/5',
        border: 'border-destructive/15',
        text: 'text-destructive',
        label: 'Crítico'
    },
    warning: {
        icon: AlertCircle,
        dot: 'bg-warning',
        bg: 'bg-warning/5',
        border: 'border-warning/15',
        text: 'text-warning',
        label: 'Importante'
    },
    info: {
        icon: Info,
        dot: 'bg-brand-primary',
        bg: 'bg-brand-primary/5',
        border: 'border-brand-primary/15',
        text: 'text-brand-primary',
        label: 'Informativo'
    }
};

const categoryIcons = {
    documentos: FileText,
    asistencia: ClipboardCheck,
    contratos: Users
};

const PendingTasks: React.FC<Props> = ({ tasks, onNavigate }) => {
    const [expanded, setExpanded] = useState(false);
    const visibleCount = expanded ? tasks.length : 4;
    const visibleTasks = tasks.slice(0, visibleCount);
    const hasMore = tasks.length > 4;

    const criticalCount = tasks.filter(t => t.severity === 'critical').length;
    const warningCount = tasks.filter(t => t.severity === 'warning').length;

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="h-12 w-12 rounded-2xl bg-brand-accent/10 flex items-center justify-center mb-3">
                    <Zap className="h-6 w-6 text-brand-accent" />
                </div>
                <h4 className="text-sm font-bold text-brand-dark mb-1">¡Todo al día!</h4>
                <p className="text-xs text-muted-foreground max-w-[200px]">No hay tareas pendientes. Buen trabajo.</p>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-brand-primary" />
                    <h4 className="text-sm font-semibold text-brand-dark">Tareas Pendientes</h4>
                </div>
                <div className="flex items-center gap-1.5">
                    {criticalCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive text-[9px] font-bold">
                            {criticalCount} 🔴
                        </span>
                    )}
                    {warningCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-warning/10 text-warning text-[9px] font-bold">
                            {warningCount} 🟡
                        </span>
                    )}
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-2">
                <AnimatePresence initial={false}>
                    {visibleTasks.map((task, idx) => {
                        const config = severityConfig[task.severity];
                        const CategoryIcon = categoryIcons[task.category] || FileText;

                        return (
                            <motion.div
                                key={`${task.category}-${idx}`}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => onNavigate(task.action.ruta)}
                                className={cn(
                                    "p-3 rounded-xl border cursor-pointer group transition-all hover:shadow-sm",
                                    config.bg, config.border,
                                    "hover:scale-[1.01] active:scale-[0.99]"
                                )}
                            >
                                <div className="flex items-start gap-2.5">
                                    {/* Severity dot + Category icon */}
                                    <div className="relative shrink-0 mt-0.5">
                                        <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                                        <div className={cn("absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white", config.dot)} />
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-brand-dark leading-snug truncate">
                                            {task.title}
                                        </p>
                                        <p className={cn("text-[10px] font-medium mt-0.5", config.text)}>
                                            {task.description}
                                        </p>
                                    </div>

                                    {/* Action arrow */}
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>

            {/* Show more/less */}
            {hasMore && (
                <button
                    onClick={() => setExpanded(prev => !prev)}
                    className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-muted-foreground hover:text-brand-primary transition-colors rounded-lg hover:bg-background"
                >
                    {expanded ? (
                        <>
                            <ChevronUp className="h-3 w-3" />
                            Mostrar menos
                        </>
                    ) : (
                        <>
                            <ChevronDown className="h-3 w-3" />
                            Ver {tasks.length - 4} más
                        </>
                    )}
                </button>
            )}
        </div>
    );
};

export default PendingTasks;

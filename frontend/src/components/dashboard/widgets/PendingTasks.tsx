import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, FileText, ClipboardCheck, Users,
    ArrowRight, ChevronDown, ChevronUp,
    AlertTriangle, AlertCircle, Info
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';

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
            <EmptyState
                className="py-8"
                icon={Zap}
                title="¡Todo al día!"
                description="No hay tareas pendientes. Buen trabajo."
            />
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
                        <Chip tone="danger" label={`${criticalCount} 🔴`} />
                    )}
                    {warningCount > 0 && (
                        <Chip tone="warning" label={`${warningCount} 🟡`} />
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
                                        <p className={cn("text-caption font-medium mt-0.5", config.text)}>
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
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(prev => !prev)}
                    leftIcon={expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    className="w-full mt-3 text-muted-foreground"
                >
                    {expanded ? 'Mostrar menos' : `Ver ${tasks.length - 4} más`}
                </Button>
            )}
        </div>
    );
};

export default PendingTasks;

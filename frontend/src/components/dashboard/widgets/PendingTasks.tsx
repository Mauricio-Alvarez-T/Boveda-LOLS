import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Zap, FileText, ClipboardCheck, Users,
    ArrowRight, ChevronDown, ChevronUp
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { Button } from '../../ui/Button';
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

// Color = significado (paleta accesible WCAG AA): el rol de cada tarea se comunica
// en el texto de la descripción — crítico=rojo, precaución=ámbar, info=azul — con
// tonos -700/-300 que cumplen contraste. El estado nunca depende solo del color:
// va acompañado de texto y, en crítico, de un punto rojo.
const severityConfig = {
    critical: { dot: 'bg-destructive', text: 'text-red-700 dark:text-red-300' },
    warning: { dot: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-300' },
    info: { dot: 'bg-blue-500', text: 'text-blue-700 dark:text-blue-300' },
};

const categoryIcons = {
    documentos: FileText,
    asistencia: ClipboardCheck,
    contratos: Users
};

// Tile de categoría neutro (la señal de rol va en el texto, no en el tile).
const categoryStyle: Record<string, { tile: string; icon: string }> = {
    asistencia: { tile: 'bg-muted', icon: 'text-muted-foreground' },
    contratos: { tile: 'bg-muted', icon: 'text-muted-foreground' },
    documentos: { tile: 'bg-muted', icon: 'text-muted-foreground' },
};

const PendingTasks: React.FC<Props> = ({ tasks, onNavigate }) => {
    const [expanded, setExpanded] = useState(false);
    const visibleCount = expanded ? tasks.length : 4;
    const visibleTasks = tasks.slice(0, visibleCount);
    const hasMore = tasks.length > 4;

    const criticalCount = tasks.filter(t => t.severity === 'critical').length;

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
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Zap className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Tareas Pendientes</h3>
                </div>
                <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
                    <span>{tasks.length}</span>
                    {criticalCount > 0 && (
                        <span className="font-medium text-red-700 dark:text-red-300">· {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}</span>
                    )}
                </div>
            </div>

            {/* Task List */}
            <div className="space-y-2">
                <AnimatePresence initial={false}>
                    {visibleTasks.map((task, idx) => {
                        const config = severityConfig[task.severity];
                        const CategoryIcon = categoryIcons[task.category] || FileText;
                        const catStyle = categoryStyle[task.category] || categoryStyle.documentos;

                        return (
                            <motion.div
                                key={`${task.category}-${idx}`}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.2 }}
                                onClick={() => onNavigate(task.action.ruta)}
                                className="p-3 rounded-xl border border-border bg-card cursor-pointer group transition-all duration-200 hover:bg-background"
                            >
                                <div className="flex items-start gap-2.5">
                                    {/* Tile de categoría + punto rojo SOLO si crítico */}
                                    <span className={cn("relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", catStyle.tile)}>
                                        <CategoryIcon className={cn("h-5 w-5", catStyle.icon)} />
                                        {task.severity === 'critical' && (
                                            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
                                        )}
                                    </span>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-foreground leading-snug truncate">
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

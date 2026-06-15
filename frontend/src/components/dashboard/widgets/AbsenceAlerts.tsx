import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EmptyState } from '../../ui/EmptyState';
import { Chip } from '../../ui/Chip';
import { Button } from '../../ui/Button';

export interface Alerta {
    tipo: 'consecutivas' | 'lunes' | 'acumuladas';
    mensaje: string;
}

export interface TrabajadorConAlerta {
    trabajador_id: number;
    nombres: string;
    apellido_paterno: string;
    rut: string;
    total_faltas: number;
    // Lista 'YYYY-MM-DD' de las faltas del mes — llega de getAlertasFaltas vía
    // /dashboard/summary. La UI la usa como strip de fechas-evidencia (F5.2).
    fechas?: string[];
    alertas: Alerta[];
}

interface Props {
    data: TrabajadorConAlerta[];
    onNavigate: (rut: string) => void;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// 'YYYY-MM-DD' → 'DD mmm' (sin Date para evitar corrimiento de zona horaria).
const fmtDia = (iso: string): string => {
    const [, m, d] = iso.split('-');
    return `${parseInt(d, 10)} ${MESES[parseInt(m, 10) - 1] ?? ''}`;
};

// Color = significado (WCAG AA): consecutivas = rojo (lo más grave, Art.160),
// lunes/acumuladas = ámbar (precaución). El tipo también se nombra en el badge.
const tipoLabel: Record<Alerta['tipo'], string> = {
    consecutivas: 'consecutiva',
    lunes: 'lunes',
    acumuladas: 'acumuladas',
};
const tipoTone = (tipo: Alerta['tipo']): 'danger' | 'warning' =>
    tipo === 'consecutivas' ? 'danger' : 'warning';

const AbsenceAlerts: React.FC<Props> = ({ data, onNavigate }) => {
    const [expanded, setExpanded] = useState(false);

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

    // Resumen por regla (cuántos trabajadores gatillan cada una).
    const counts = { consecutivas: 0, lunes: 0, acumuladas: 0 };
    data.forEach(t => t.alertas.forEach(a => { counts[a.tipo] += 1; }));

    const visible = expanded ? data : data.slice(0, 5);
    const hasMore = data.length > 5;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/[0.08]">
                        <AlertTriangle className="h-5 w-5 text-red-700 dark:text-red-300" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Faltas reiteradas</h3>
                </div>
                <span className="text-caption text-muted-foreground font-semibold uppercase tracking-wider">Este mes</span>
            </div>
            <p className="text-caption text-muted-foreground mb-3">
                Art. 160 N°3 · umbrales: 2 consecutivas · 2 lunes · 3 acumuladas
            </p>

            {/* Resumen por regla */}
            <div className="flex flex-wrap gap-1.5 mb-4">
                {counts.consecutivas > 0 && <Chip tone="danger" label={`${counts.consecutivas} consecutivas`} />}
                {counts.lunes > 0 && <Chip tone="warning" label={`${counts.lunes} con lunes`} />}
                {counts.acumuladas > 0 && <Chip tone="warning" label={`${counts.acumuladas} acumuladas`} />}
            </div>

            {/* Lista por trabajador */}
            <div className="space-y-2">
                {visible.map((t) => {
                    const isDanger = t.alertas.some(a => a.tipo === 'consecutivas');
                    const dateChip = isDanger
                        ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
                    return (
                        <div
                            key={t.trabajador_id}
                            onClick={() => onNavigate(t.rut)}
                            className="px-2.5 py-2 rounded-xl hover:bg-background transition-colors duration-200 cursor-pointer group"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-foreground truncate">
                                        {t.apellido_paterno} {t.nombres}
                                    </p>
                                    <p className="text-caption text-muted-foreground">
                                        {t.rut} · {t.total_faltas} falta{t.total_faltas !== 1 ? 's' : ''} este mes
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    {t.alertas.map(a => (
                                        <Chip key={a.tipo} tone={tipoTone(a.tipo)} label={tipoLabel[a.tipo]} />
                                    ))}
                                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            </div>

                            {/* Strip de fechas-evidencia (listo para el descargo / aviso) */}
                            {t.fechas && t.fechas.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                    {t.fechas.map((f) => (
                                        <span
                                            key={f}
                                            className={cn('rounded px-1.5 py-0.5 text-caption font-medium tabular-nums', dateChip)}
                                        >
                                            {fmtDia(f)}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {hasMore && (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setExpanded(prev => !prev)}
                    leftIcon={expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    className="w-full mt-3 text-muted-foreground"
                >
                    {expanded ? 'Mostrar menos' : `Ver ${data.length - 5} más`}
                </Button>
            )}
        </div>
    );
};

export default AbsenceAlerts;

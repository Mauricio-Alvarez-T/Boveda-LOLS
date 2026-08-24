import React, { useState } from 'react';
import {
    Inbox, ClipboardCheck, FileText, Users, FileX, Boxes, ArrowLeftRight,
    ArrowRight, ChevronDown, ChevronRight, Truck
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EmptyState } from '../../ui/EmptyState';

export interface PendingTask {
    severity: 'critical' | 'warning' | 'info';
    category: 'documentos' | 'asistencia' | 'contratos';
    title: string;
    description: string;
    action: { label: string; ruta: string };
    meta?: Record<string, any>;
}

/**
 * Fila que NO viene de `pendingTasks`: la arma la página desde otra fuente
 * (inventario, vencimientos de vehículos), con fetch diferido y gateada por
 * permiso. Si no hay permiso o falla, simplemente no se agregan filas.
 */
export interface BandejaItem {
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    ruta: string;
}


interface Props {
    tasks: PendingTask[];
    /** Trabajadores activos sin ningún documento (de counters) — fila sintética en Documentos. */
    trabajadoresSinDocs?: number;
    /** Filas de inventario (diferidas, gated por inventario.ver). */
    inventoryItems?: BandejaItem[];
    /** Vencimientos de vehículos (diferidos, gated por vehiculos.ver). Van bajo Asistencia. */
    vehiculoItems?: BandejaItem[];
    onNavigate: (route: string) => void;
}

// Color = significado (WCAG AA): crítico = rojo · pendiente/por vencer = ámbar ·
// informativo = azul. El icono de cada fila lleva el color del rol; el contenido
// (título) va neutro.
const severityColor: Record<PendingTask['severity'], string> = {
    critical: 'text-red-700 dark:text-red-300',
    warning: 'text-amber-700 dark:text-amber-300',
    info: 'text-blue-700 dark:text-blue-300',
};

const GROUPS: { key: PendingTask['category']; label: string; icon: React.ElementType }[] = [
    { key: 'asistencia', label: 'Asistencia', icon: ClipboardCheck },
    { key: 'documentos', label: 'Documentos', icon: FileText },
    { key: 'contratos', label: 'Contratos', icon: Users },
];

const Row: React.FC<{ icon: React.ElementType; color: string; title: string; description: string; onClick: () => void }> =
    ({ icon: Icon, color, title, description, onClick }) => (
        <div
            onClick={onClick}
            className="flex items-center gap-3 py-2.5 border-t border-border cursor-pointer transition-colors hover:bg-background -mx-2 px-2 rounded-md group"
        >
            <Icon className={cn('h-4 w-4 shrink-0', color)} />
            <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug truncate">{title}</p>
                {description && <p className="text-caption text-muted-foreground truncate">{description}</p>}
            </div>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </div>
    );

const GroupHeader: React.FC<{ collapsed: boolean; icon: React.ElementType; label: string; count: number; onClick: () => void }> =
    ({ collapsed, icon: Icon, label, count, onClick }) => {
        const Chevron = collapsed ? ChevronRight : ChevronDown;
        return (
            // eslint-disable-next-line no-restricted-syntax -- disclosure (header colapsable full-width)
            <button
                type="button"
                onClick={onClick}
                className="flex items-center gap-2 w-full py-1.5 text-caption font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
                <Chevron className="h-3.5 w-3.5" />
                <Icon className="h-3.5 w-3.5" />
                <span>{label}</span>
                <span className="tabular-nums">· {count}</span>
            </button>
        );
    };

const BandejaDelDia: React.FC<Props> = ({ tasks, trabajadoresSinDocs = 0, inventoryItems = [], vehiculoItems = [], onNavigate }) => {
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

    const total = tasks.length + (trabajadoresSinDocs > 0 ? 1 : 0) + inventoryItems.length + vehiculoItems.length;
    const criticalCount =
        tasks.filter(t => t.severity === 'critical').length +
        inventoryItems.filter(i => i.severity === 'critical').length +
        vehiculoItems.filter(i => i.severity === 'critical').length;

    if (total === 0) {
        return (
            <EmptyState
                className="py-8"
                icon={Inbox}
                title="Bandeja vacía"
                description="No hay pendientes por resolver hoy. Buen trabajo."
            />
        );
    }

    const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

    /** Grupo de tareas del backend (asistencia / documentos / contratos). */
    const renderGrupoTareas = (group: typeof GROUPS[number]) => {
        const groupTasks = tasks.filter(t => t.category === group.key);
        const syntheticDocs = group.key === 'documentos' && trabajadoresSinDocs > 0;
        const count = groupTasks.length + (syntheticDocs ? 1 : 0);
        if (count === 0) return null;

        const isCollapsed = !!collapsed[group.key];

        return (
            <div key={group.key} className="mt-1">
                <GroupHeader collapsed={isCollapsed} icon={group.icon} label={group.label} count={count} onClick={() => toggle(group.key)} />
                {!isCollapsed && (
                    <div>
                        {groupTasks.map((task, idx) => (
                            <Row
                                key={`${group.key}-${idx}`}
                                icon={group.icon}
                                color={severityColor[task.severity]}
                                title={task.title}
                                description={task.description}
                                onClick={() => onNavigate(task.action.ruta)}
                            />
                        ))}
                        {syntheticDocs && (
                            <Row
                                icon={FileX}
                                color={severityColor.warning}
                                title={`${trabajadoresSinDocs} trabajadores sin documentos`}
                                description="Sin ningún documento registrado"
                                onClick={() => onNavigate('/consultas?completitud=faltantes')}
                            />
                        )}
                    </div>
                )}
            </div>
        );
    };

    /** Grupo armado desde una fuente externa (inventario, vehículos). */
    const renderGrupoExterno = (key: string, label: string, icon: React.ElementType, items: BandejaItem[], rowIcon: React.ElementType = icon) => {
        if (items.length === 0) return null;
        return (
            <div key={key} className="mt-1">
                <GroupHeader collapsed={!!collapsed[key]} icon={icon} label={label} count={items.length} onClick={() => toggle(key)} />
                {!collapsed[key] && (
                    <div>
                        {items.map((it, idx) => (
                            <Row
                                key={`${key}-${idx}`}
                                icon={rowIcon}
                                color={severityColor[it.severity]}
                                title={it.title}
                                description={it.description}
                                onClick={() => onNavigate(it.ruta)}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-muted">
                        <Inbox className="h-5 w-5 text-muted-foreground" />
                    </span>
                    <h3 className="text-sm font-semibold text-foreground">Bandeja del día</h3>
                </div>
                <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
                    <span>{total} pendiente{total !== 1 ? 's' : ''}</span>
                    {criticalCount > 0 && (
                        <span className="font-medium text-red-700 dark:text-red-300">· {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}</span>
                    )}
                </div>
            </div>

            {/* Asistencia primero, después Vehículos (pedido de obra: el aviso de
                vencimientos se mira junto con lo del día), y luego el resto. */}
            {GROUPS.filter(g => g.key === 'asistencia').map(renderGrupoTareas)}
            {renderGrupoExterno('vehiculos', 'Vehículos', Truck, vehiculoItems)}
            {GROUPS.filter(g => g.key !== 'asistencia').map(renderGrupoTareas)}

            {/* Grupo Inventario (diferido, gated por permiso) */}
            {renderGrupoExterno('inventario', 'Inventario', Boxes, inventoryItems, ArrowLeftRight)}
        </div>
    );
};

export default BandejaDelDia;

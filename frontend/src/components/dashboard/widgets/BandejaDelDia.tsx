import React, { useState } from 'react';
import {
    Inbox, ClipboardCheck, FileText, Users, FileX, Boxes, ArrowLeftRight,
    ArrowRight, ChevronDown, ChevronRight, Truck, UserPlus
} from 'lucide-react';
import { cn } from '../../../utils/cn';
import { EmptyState } from '../../ui/EmptyState';
import { contarBandeja } from './bandejaConteo';
import { EncabezadoTarjeta } from './EncabezadoTarjeta';

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
    /** Solicitudes de ingreso pendientes (ficha digital; gated por trabajadores.solicitud.aprobar). */
    solicitudItems?: BandejaItem[];
    /** Lotes de documentos físicos por confirmar / en terreno (B6; gated por documentos.entrega.*). */
    documentosFisicosItems?: BandejaItem[];
    onNavigate: (route: string) => void;
    /** Título de la tarjeta. En el Inicio H es «Otros pendientes»: asistencia y vehículos van en sus tarjetas. */
    titulo?: string;
    /** Texto cuando no queda nada (por defecto «Bandeja vacía»). */
    vacio?: { titulo: string; descripcion: string };
    /** Grupo que arranca desplegado (por defecto Vehículos). En el detalle de Inventario del Inicio, «inventario». */
    grupoAbierto?: string;
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

/** Grupo de filas que no vienen de `tasks` (vehículos, solicitudes, documentos físicos, inventario). */
interface GrupoExterno {
    key: string;
    label: string;
    icon: React.ElementType;
    /** Ícono de cada fila si difiere del del grupo (Inventario usa flechas). */
    rowIcon?: React.ElementType;
    items: BandejaItem[];
    /** Se pinta después de los grupos de tareas (Inventario). */
    despuesDeTareas?: boolean;
}

/** Único grupo desplegado al entrar; los demás arrancan cerrados. */
const GRUPO_ABIERTO_POR_DEFECTO = 'vehiculos';

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

const BandejaDelDia: React.FC<Props> = ({ tasks, trabajadoresSinDocs = 0, inventoryItems = [], vehiculoItems = [], solicitudItems = [], documentosFisicosItems = [], onNavigate, titulo = 'Bandeja del día', vacio, grupoAbierto = GRUPO_ABIERTO_POR_DEFECTO }) => {
    // Solo Vehículos arranca abierto (pedido de obra 2026-08-24): es el aviso que
    // se mira primero. El resto se abre al hacer clic. La clave ausente significa
    // "usar el default", así que un grupo nuevo nace cerrado sin tocar nada más.
    const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
    const estaColapsado = (key: string) => collapsed[key] ?? key !== grupoAbierto;

    // Grupos externos declarados UNA vez: de esta lista salen el conteo del encabezado, el
    // "Bandeja vacía" y el render. Antes se listaban por separado y los documentos físicos
    // quedaron pintados pero sin contar. Orden pedido por obra: Vehículos (desplegado) →
    // Solicitudes → Documentos físicos → tareas (Asistencia primero) → Inventario al final.
    const externos: GrupoExterno[] = [
        { key: 'vehiculos', label: 'Vehículos', icon: Truck, items: vehiculoItems },
        // Solicitudes de ingreso (ficha digital): fichas de terreno esperando a la oficina.
        { key: 'solicitudes', label: 'Solicitudes de ingreso', icon: UserPlus, items: solicitudItems },
        // Documentos físicos (B6): al portador, sus lotes por confirmar; a RRHH, lo que está en terreno.
        { key: 'documentos_fisicos', label: 'Documentos físicos', icon: Truck, items: documentosFisicosItems },
        // Inventario (diferido, gated por permiso): va después de las tareas.
        { key: 'inventario', label: 'Inventario', icon: Boxes, rowIcon: ArrowLeftRight, items: inventoryItems, despuesDeTareas: true },
    ];
    const { total, criticas: criticalCount } = contarBandeja(tasks, trabajadoresSinDocs, externos.map(g => g.items));

    if (total === 0) {
        return (
            <div>
                <EncabezadoTarjeta icon={Inbox} titulo={titulo} />
                <EmptyState
                    className="py-6"
                    icon={Inbox}
                    title={vacio?.titulo ?? 'Bandeja vacía'}
                    description={vacio?.descripcion ?? 'No hay pendientes por resolver hoy.'}
                />
            </div>
        );
    }

    const toggle = (key: string) => setCollapsed(prev => ({ ...prev, [key]: !(prev[key] ?? key !== grupoAbierto) }));

    /** Grupo de tareas del backend (asistencia / documentos / contratos). */
    const renderGrupoTareas = (group: typeof GROUPS[number]) => {
        const groupTasks = tasks.filter(t => t.category === group.key);
        const syntheticDocs = group.key === 'documentos' && trabajadoresSinDocs > 0;
        const count = groupTasks.length + (syntheticDocs ? 1 : 0);
        if (count === 0) return null;

        const isCollapsed = estaColapsado(group.key);

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

    /** Grupo armado desde una fuente externa (inventario, vehículos, …). */
    const renderGrupoExterno = ({ key, label, icon, items, rowIcon = icon }: GrupoExterno) => {
        if (items.length === 0) return null;
        return (
            <div key={key} className="mt-1">
                <GroupHeader collapsed={estaColapsado(key)} icon={icon} label={label} count={items.length} onClick={() => toggle(key)} />
                {!estaColapsado(key) && (
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
            <EncabezadoTarjeta
                icon={Inbox}
                titulo={titulo}
                extra={
                    <div className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
                        <span>{total} pendiente{total !== 1 ? 's' : ''}</span>
                        {criticalCount > 0 && (
                            <span className="font-medium text-red-700 dark:text-red-300">· {criticalCount} crítica{criticalCount !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                }
            />

            {/* Orden pedido por obra: Vehículos (desplegado) → Asistencia → el resto (ver `externos`). */}
            {externos.filter(g => !g.despuesDeTareas).map(renderGrupoExterno)}
            {GROUPS.filter(g => g.key === 'asistencia').map(renderGrupoTareas)}
            {GROUPS.filter(g => g.key !== 'asistencia').map(renderGrupoTareas)}
            {externos.filter(g => g.despuesDeTareas).map(renderGrupoExterno)}
        </div>
    );
};

export default BandejaDelDia;

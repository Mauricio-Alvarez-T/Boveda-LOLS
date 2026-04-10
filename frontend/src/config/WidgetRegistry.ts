// ─── Widget Registry: defines all available dashboard widgets and their permissions ───

export type WidgetSize = 'sm' | 'md' | 'lg';
export type WidgetCategory = 'kpi' | 'chart' | 'list' | 'action';

export interface WidgetConfig {
    id: string;
    title: string;
    requiredPermission: {
        modulo: string;
        accion: 'puede_ver' | 'puede_crear' | 'puede_editar' | 'puede_eliminar';
    } | null; // null = always visible
    size: WidgetSize;
    category: WidgetCategory;
    defaultOrder: number;
}

export const WIDGET_REGISTRY: WidgetConfig[] = [
    // ── KPIs ──
    {
        id: 'kpi_workers',
        title: 'Trabajadores',
        requiredPermission: { modulo: 'trabajadores', accion: 'puede_ver' },
        size: 'sm',
        category: 'kpi',
        defaultOrder: 0,
    },
    {
        id: 'kpi_docs',
        title: 'Documentos',
        requiredPermission: { modulo: 'documentos', accion: 'puede_ver' },
        size: 'sm',
        category: 'kpi',
        defaultOrder: 1,
    },
    {
        id: 'kpi_attendance',
        title: 'Asistencia Hoy',
        requiredPermission: { modulo: 'asistencia', accion: 'puede_ver' },
        size: 'sm',
        category: 'kpi',
        defaultOrder: 2,
    },
    {
        id: 'kpi_absences',
        title: 'Ausencias Hoy',
        requiredPermission: { modulo: 'asistencia', accion: 'puede_ver' },
        size: 'sm',
        category: 'kpi',
        defaultOrder: 3,
    },

    // ── Actionable Widgets ──
    {
        id: 'pending_tasks',
        title: 'Tareas Pendientes',
        requiredPermission: null, // always visible, content is dynamic
        size: 'md',
        category: 'list',
        defaultOrder: 4,
    },
    {
        id: 'absence_alerts',
        title: 'Alertas de Inasistencia',
        requiredPermission: { modulo: 'asistencia', accion: 'puede_ver' },
        size: 'md',
        category: 'list',
        defaultOrder: 5,
    },
    {
        id: 'obra_ranking',
        title: 'Ranking de Obras',
        requiredPermission: { modulo: 'trabajadores', accion: 'puede_ver' },
        size: 'md',
        category: 'chart',
        defaultOrder: 6,
    },

    // ── Charts ──
    {
        id: 'chart_attendance_trend',
        title: 'Tendencia de Asistencia',
        requiredPermission: { modulo: 'asistencia', accion: 'puede_ver' },
        size: 'md',
        category: 'chart',
        defaultOrder: 7,
    },

    // ── Lists ──
    {
        id: 'list_absences_today',
        title: 'Ausentes del Día',
        requiredPermission: { modulo: 'asistencia', accion: 'puede_ver' },
        size: 'md',
        category: 'list',
        defaultOrder: 8,
    },
    {
        id: 'alerts_critical',
        title: 'Alertas',
        requiredPermission: null, // always visible
        size: 'md',
        category: 'list',
        defaultOrder: 9,
    },

    // ── Actions ──
    {
        id: 'quick_actions',
        title: 'Acciones Rápidas',
        requiredPermission: null, // always visible, content is dynamic
        size: 'md',
        category: 'action',
        defaultOrder: 10,
    },
];

export const getWidgetById = (id: string): WidgetConfig | undefined =>
    WIDGET_REGISTRY.find(w => w.id === id);

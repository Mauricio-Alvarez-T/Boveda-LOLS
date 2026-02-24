import { useState, useCallback, useMemo } from 'react';
import { WIDGET_REGISTRY, type WidgetConfig } from '../config/WidgetRegistry';
import type { Permission } from '../types';

const STORAGE_KEY_PREFIX = 'dashboard_layout_';

/**
 * Filters widgets by user permissions and manages drag-and-drop order.
 * Layout is persisted per-user in localStorage.
 */
export function useDashboardLayout(userId: number, permisos: Permission[]) {
    // Filter widgets the user can see
    const allowedWidgets = useMemo(() => {
        return WIDGET_REGISTRY.filter(w => {
            if (!w.requiredPermission) return true;
            const perm = permisos.find(p => p.modulo === w.requiredPermission!.modulo);
            if (!perm) return false;
            return !!(perm as any)[w.requiredPermission!.accion];
        });
    }, [permisos]);

    // Load saved order from localStorage, or use default
    const getSavedOrder = useCallback((): string[] => {
        try {
            const saved = localStorage.getItem(`${STORAGE_KEY_PREFIX}${userId}`);
            if (saved) {
                const parsed: string[] = JSON.parse(saved);
                // Only keep IDs that are still allowed
                const allowedIds = new Set(allowedWidgets.map(w => w.id));
                const validSaved = parsed.filter(id => allowedIds.has(id));
                // Add any new widgets that weren't in the saved layout
                const savedSet = new Set(validSaved);
                const newWidgets = allowedWidgets
                    .filter(w => !savedSet.has(w.id))
                    .map(w => w.id);
                return [...validSaved, ...newWidgets];
            }
        } catch {
            // ignore parse errors
        }
        return allowedWidgets
            .sort((a, b) => a.defaultOrder - b.defaultOrder)
            .map(w => w.id);
    }, [userId, allowedWidgets]);

    const [widgetOrder, setWidgetOrder] = useState<string[]>(getSavedOrder);

    // Ordered widget configs
    const visibleWidgets: WidgetConfig[] = useMemo(() => {
        const allowedMap = new Map(allowedWidgets.map(w => [w.id, w]));
        return widgetOrder
            .map(id => allowedMap.get(id))
            .filter((w): w is WidgetConfig => !!w);
    }, [widgetOrder, allowedWidgets]);

    // Separate KPIs from other widgets (KPIs always on top, not draggable between sections)
    const kpiWidgets = useMemo(() => visibleWidgets.filter(w => w.category === 'kpi'), [visibleWidgets]);
    const gridWidgets = useMemo(() => visibleWidgets.filter(w => w.category !== 'kpi'), [visibleWidgets]);

    // Reorder after drag
    const reorder = useCallback((activeId: string, overId: string) => {
        setWidgetOrder(prev => {
            const oldIndex = prev.indexOf(activeId);
            const newIndex = prev.indexOf(overId);
            if (oldIndex === -1 || newIndex === -1) return prev;

            const updated = [...prev];
            updated.splice(oldIndex, 1);
            updated.splice(newIndex, 0, activeId);

            // Persist
            try {
                localStorage.setItem(`${STORAGE_KEY_PREFIX}${userId}`, JSON.stringify(updated));
            } catch { /* quota exceeded */ }
            return updated;
        });
    }, [userId]);

    // Reset to defaults
    const resetLayout = useCallback(() => {
        const defaultOrder = allowedWidgets
            .sort((a, b) => a.defaultOrder - b.defaultOrder)
            .map(w => w.id);
        setWidgetOrder(defaultOrder);
        try {
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}${userId}`);
        } catch { /* ignore */ }
    }, [userId, allowedWidgets]);

    return { kpiWidgets, gridWidgets, visibleWidgets, reorder, resetLayout };
}

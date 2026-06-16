import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, CalendarDays } from 'lucide-react';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import AttendanceDailyTab from '../components/attendance/AttendanceDailyTab';
import SabadosExtraTab from '../components/attendance/sabados/SabadosExtraTab';
import SabadosErrorBoundary from '../components/attendance/sabados/SabadosErrorBoundary';

type TabKey = 'diaria' | 'sabados';

interface TabDef {
    key: TabKey;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    show: boolean;
}

/**
 * Página Asistencia con sistema de tabs.
 *
 * Tabs:
 *   - "Asistencia"  → toda la funcionalidad original (AttendanceDailyTab).
 *                     El Reporte Mensual vive en un botón compacto del header
 *                     (AttendanceHeaderActions), junto al filtro de empresa.
 *   - "Sábado"      → trabajo extraordinario en sábado (requiere permiso
 *                     asistencia.sabados_extra.ver y obra seleccionada para
 *                     crear/editar).
 *
 * La pestaña activa se persiste en query param `?tab=` para permitir
 * deep-link y recargar manteniendo el contexto.
 */
const AttendancePage: React.FC = () => {
    const { hasPermission } = useAuth();
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab') as TabKey | null;
    const activeTab: TabKey = rawTab === 'sabados' ? rawTab : 'diaria';

    const setActiveTab = (t: TabKey) => {
        // sabadoId solo aplica a tab sabados
        if (t !== 'sabados') searchParams.delete('sabadoId');
        searchParams.set('tab', t);
        setSearchParams(searchParams, { replace: false });
    };

    const tabs: TabDef[] = [
        { key: 'diaria', label: 'Asistencia', shortLabel: 'Asistencia', icon: CheckSquare, show: true },
        {
            key: 'sabados',
            label: 'Sábado',
            shortLabel: 'Sábado',
            icon: CalendarDays,
            show: hasPermission('asistencia.sabados_extra.ver') && !!selectedObra,
        },
    ];
    const visibleTabs = tabs.filter(t => t.show);

    // Si la tab activa no es visible (ej: sabados sin permiso), forzar diaria
    const effectiveTab: TabKey = visibleTabs.find(t => t.key === activeTab)
        ? activeTab
        : 'diaria';

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-2">
            {/* Tab bar — solo en MÓVIL (en desktop el ícono de Sábados vive en AttendanceSummaryRow) */}
            {visibleTabs.length > 1 && (
                <div className="md:hidden flex items-center gap-0.5 p-1 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shrink-0 overflow-x-auto scrollbar-none">
                    {visibleTabs.map(tab => {
                        const TabIcon = tab.icon;
                        const isActive = effectiveTab === tab.key;
                        return (
                            // eslint-disable-next-line no-restricted-syntax -- control de tab segmentado (flex-1 + estado activo full-bleed); el primitivo Button (pill rounded-full, scale) rompe el layout
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center justify-center gap-1.5 rounded-xl font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                                    'flex-1 px-3 py-2 text-label',
                                    isActive
                                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                                        : 'text-muted-foreground hover:bg-background hover:text-brand-dark'
                                )}
                            >
                                <TabIcon className="h-4 w-4 shrink-0" />
                                <span>{tab.shortLabel}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Tab content con remount al cambiar tab */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={effectiveTab}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.15 }}
                    className="flex-1 min-h-0 flex flex-col"
                >
                    {effectiveTab === 'diaria' && (
                        <AttendanceDailyTab
                            onGoSabados={
                                visibleTabs.some(t => t.key === 'sabados')
                                    ? () => setActiveTab('sabados')
                                    : undefined
                            }
                        />
                    )}
                    {effectiveTab === 'sabados' && (
                        <SabadosErrorBoundary>
                            <SabadosExtraTab />
                        </SabadosErrorBoundary>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AttendancePage;

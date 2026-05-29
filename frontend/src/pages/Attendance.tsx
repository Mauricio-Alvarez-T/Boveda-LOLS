import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, CalendarDays, MoreHorizontal } from 'lucide-react';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import AttendanceDailyTab from '../components/attendance/AttendanceDailyTab';
import AttendanceExtrasMobileTab from '../components/attendance/AttendanceExtrasMobileTab';
import SabadosExtraTab from '../components/attendance/sabados/SabadosExtraTab';
import SabadosErrorBoundary from '../components/attendance/sabados/SabadosErrorBoundary';

type TabKey = 'diaria' | 'sabados' | 'extras';

interface TabDef {
    key: TabKey;
    label: string;
    shortLabel: string;
    icon: React.ElementType;
    show: boolean;
    mobileOnly?: boolean;
}

/**
 * Página Asistencia con sistema de tabs.
 *
 * Tabs:
 *   - "Asistencia Diaria"  → toda la funcionalidad original (AttendanceDailyTab)
 *   - "Sábados Extra"      → trabajo extraordinario en sábado (requiere
 *                            permiso asistencia.sabados_extra.ver y obra
 *                            seleccionada para crear/editar).
 *
 * La pestaña activa se persiste en query param `?tab=` para permitir
 * deep-link y recargar manteniendo el contexto.
 */
const AttendancePage: React.FC = () => {
    const { hasPermission } = useAuth();
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab') as TabKey | null;
    const activeTab: TabKey = rawTab === 'sabados' || rawTab === 'extras' ? rawTab : 'diaria';

    const setActiveTab = (t: TabKey) => {
        // sabadoId solo aplica a tab sabados
        if (t !== 'sabados') searchParams.delete('sabadoId');
        searchParams.set('tab', t);
        setSearchParams(searchParams, { replace: false });
    };

    const tabs: TabDef[] = [
        { key: 'diaria', label: 'Asistencia Diaria', shortLabel: 'Diaria', icon: CheckSquare, show: true },
        {
            key: 'sabados',
            label: 'Sábados Extra',
            shortLabel: 'Sábados',
            icon: CalendarDays,
            show: hasPermission('asistencia.sabados_extra.ver') && !!selectedObra,
        },
        {
            // Tab "Más" agrupa acciones secundarias (Excel, Feriado, Repetir,
            // filtro Empresa) que en mobile no caben en el header. En desktop
            // estas acciones viven inline en el header → se oculta el tab.
            key: 'extras',
            label: 'Más',
            shortLabel: 'Más',
            icon: MoreHorizontal,
            show: !!selectedObra,
            mobileOnly: true,
        },
    ];
    const visibleTabs = tabs.filter(t => t.show);

    // Si la tab activa no es visible (ej: sabados sin permiso), forzar diaria
    const effectiveTab: TabKey = visibleTabs.find(t => t.key === activeTab)
        ? activeTab
        : 'diaria';

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-3">
            {/* Tab bar — solo si hay más de 1 tab visible */}
            {visibleTabs.length > 1 && (
                <div className="flex items-center gap-0.5 md:gap-1 p-1 md:p-1.5 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shrink-0 overflow-x-auto scrollbar-none">
                    {visibleTabs.map(tab => {
                        const TabIcon = tab.icon;
                        const isActive = effectiveTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={cn(
                                    'flex items-center justify-center gap-1.5 rounded-xl font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                                    'flex-1 md:flex-none px-3 py-2 text-[11px] md:px-5 md:py-2.5 md:text-xs',
                                    tab.mobileOnly && 'md:hidden',
                                    isActive
                                        ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                                        : 'text-muted-foreground hover:bg-background hover:text-brand-dark'
                                )}
                            >
                                <TabIcon className="h-4 w-4 shrink-0" />
                                <span className="md:hidden">{tab.shortLabel}</span>
                                <span className="hidden md:inline">{tab.label}</span>
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
                    {effectiveTab === 'diaria' && <AttendanceDailyTab />}
                    {effectiveTab === 'sabados' && (
                        <SabadosErrorBoundary>
                            <SabadosExtraTab />
                        </SabadosErrorBoundary>
                    )}
                    {effectiveTab === 'extras' && <AttendanceExtrasMobileTab onBack={() => setActiveTab('diaria')} />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AttendancePage;

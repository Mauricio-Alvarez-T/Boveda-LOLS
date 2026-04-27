import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import AttendanceDailyTab from '../components/attendance/AttendanceDailyTab';
import SabadosExtraTab from '../components/attendance/sabados/SabadosExtraTab';

type TabKey = 'diaria' | 'sabados';

interface TabDef {
    key: TabKey;
    label: string;
    show: boolean;
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
    const activeTab: TabKey = (searchParams.get('tab') as TabKey) === 'sabados' ? 'sabados' : 'diaria';

    const setActiveTab = (t: TabKey) => {
        // sabadoId solo aplica a tab sabados
        if (t === 'diaria') searchParams.delete('sabadoId');
        searchParams.set('tab', t);
        setSearchParams(searchParams, { replace: false });
    };

    const tabs: TabDef[] = [
        { key: 'diaria', label: 'Asistencia Diaria', show: true },
        {
            key: 'sabados',
            label: 'Sábados Extra',
            show: hasPermission('asistencia.sabados_extra.ver') && !!selectedObra,
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
                <div className="flex items-center gap-1 p-1.5 bg-white/95 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] shrink-0 overflow-x-auto scrollbar-none">
                    {visibleTabs.map(tab => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={cn(
                                'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all whitespace-nowrap',
                                effectiveTab === tab.key
                                    ? 'bg-brand-primary text-white shadow-lg shadow-brand-primary/25'
                                    : 'text-muted-foreground hover:bg-background hover:text-brand-dark'
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
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
                    {effectiveTab === 'sabados' && <SabadosExtraTab />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AttendancePage;

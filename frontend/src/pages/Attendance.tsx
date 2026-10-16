import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, ClipboardList } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import AttendanceDailyTab from '../components/attendance/AttendanceDailyTab';
import ActividadesSugeridasTab from '../components/attendance/actividades/ActividadesSugeridasTab';
import ActividadesErrorBoundary from '../components/attendance/actividades/ActividadesErrorBoundary';
import { PestanasElasticas } from '../components/ui/PestanasElasticas';

type TabKey = 'diaria' | 'actividades';

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
 *   - "Actividades" → lista de trabajadores en actividades sugeridas, por obra y
 *                     semana (requiere permiso asistencia.actividades_sugeridas.ver
 *                     y obra seleccionada para crear/editar).
 *
 * La pestaña activa se persiste en query param `?tab=` para permitir
 * deep-link y recargar manteniendo el contexto.
 */
const AttendancePage: React.FC = () => {
    const { hasPermission } = useAuth();
    const { selectedObra } = useObra();
    const [searchParams, setSearchParams] = useSearchParams();
    const rawTab = searchParams.get('tab') as TabKey | null;
    const activeTab: TabKey = rawTab === 'actividades' ? rawTab : 'diaria';

    const setActiveTab = (t: TabKey) => {
        // actividadId solo aplica a la pestaña de actividades
        if (t !== 'actividades') searchParams.delete('actividadId');
        searchParams.set('tab', t);
        setSearchParams(searchParams, { replace: false });
    };

    const tabs: TabDef[] = [
        { key: 'diaria', label: 'Asistencia', shortLabel: 'Asistencia', icon: CheckSquare, show: true },
        {
            key: 'actividades',
            label: 'Actividades sugeridas',
            shortLabel: 'Actividades',
            icon: ClipboardList,
            show: hasPermission('asistencia.actividades_sugeridas.ver') && !!selectedObra,
        },
    ];
    const visibleTabs = tabs.filter(t => t.show);

    // Si la tab activa no es visible (ej: actividades sin permiso), forzar diaria
    const effectiveTab: TabKey = visibleTabs.find(t => t.key === activeTab)
        ? activeTab
        : 'diaria';

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-2">
            {/* Tab bar — solo en MÓVIL (en desktop el ícono de Actividades vive en AttendanceSummaryRow) */}
            {visibleTabs.length > 1 && (
                <div className="md:hidden flex items-center p-1 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shrink-0 overflow-x-auto scrollbar-none">
                    <PestanasElasticas
                        opciones={visibleTabs}
                        activa={effectiveTab}
                        onCambiar={setActiveTab}
                        aria-label="Secciones de asistencia"
                        claseFila="gap-0.5 w-full"
                        // `text-base`: el tamaño que siempre se vio (el `text-label` lo borraba `cn()` antes de
                        // conocer los tamaños propios); igual que las pestañas de Inventario.
                        claseOpcion="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-base font-bold uppercase tracking-wider whitespace-nowrap"
                        claseInactiva="text-muted-foreground hover:bg-background hover:text-brand-dark"
                        render={(tab) => {
                            const TabIcon = tab.icon;
                            return (
                                <>
                                    <TabIcon className="h-4 w-4 shrink-0" />
                                    <span>{tab.shortLabel}</span>
                                </>
                            );
                        }}
                    />
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
                            onGoActividades={
                                visibleTabs.some(t => t.key === 'actividades')
                                    ? () => setActiveTab('actividades')
                                    : undefined
                            }
                        />
                    )}
                    {effectiveTab === 'actividades' && (
                        <ActividadesErrorBoundary>
                            <ActividadesSugeridasTab />
                        </ActividadesErrorBoundary>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default AttendancePage;

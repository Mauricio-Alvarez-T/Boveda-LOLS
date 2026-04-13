import React, { useState, useMemo } from 'react';
import { Package, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useSetPageHeader } from '../context/PageHeaderContext';

type TabKey = 'resumen' | 'por_ubicacion' | 'transferencias' | 'facturas' | 'bombas';

const tabs: { key: TabKey; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'por_ubicacion', label: 'Por Obra/Bodega' },
    { key: 'transferencias', label: 'Transferencias' },
    { key: 'facturas', label: 'Facturas' },
    { key: 'bombas', label: 'Bombas Hormigón' },
];

const InventarioPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const [activeTab, setActiveTab] = useState<TabKey>('resumen');

    const headerTitle = useMemo(() => (
        <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-brand-primary" />
            <div className="flex flex-col leading-tight">
                <h1 className="text-lg font-bold text-brand-dark">Inventario</h1>
                <p className="text-muted-foreground text-xs">Herramientas, Maquinaria y Moldajes</p>
            </div>
        </div>
    ), []);

    useSetPageHeader(headerTitle);

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 p-1.5 bg-white/80 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] overflow-x-auto scrollbar-none shadow-sm">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={cn(
                            "flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0",
                            activeTab === tab.key
                                ? "bg-brand-primary text-white shadow-lg shadow-brand-primary/25"
                                : "text-muted-foreground hover:bg-background hover:text-brand-dark"
                        )}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] p-6"
            >
                {activeTab === 'resumen' && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <h3 className="text-base font-bold text-brand-dark mb-2">Resumen Mensual</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Vista consolidada del inventario por ubicación. Próximamente.
                        </p>
                    </div>
                )}
                {activeTab === 'por_ubicacion' && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <h3 className="text-base font-bold text-brand-dark mb-2">Stock por Obra / Bodega</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Detalle de ítems por ubicación con edición inline. Próximamente.
                        </p>
                    </div>
                )}
                {activeTab === 'transferencias' && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <h3 className="text-base font-bold text-brand-dark mb-2">Transferencias</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Solicitudes, aprobaciones y recepciones de materiales. Próximamente.
                        </p>
                    </div>
                )}
                {activeTab === 'facturas' && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <h3 className="text-base font-bold text-brand-dark mb-2">Facturas</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Ingreso de facturas y actualización de stock. Próximamente.
                        </p>
                    </div>
                )}
                {activeTab === 'bombas' && (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                        <h3 className="text-base font-bold text-brand-dark mb-2">Bombas de Hormigón</h3>
                        <p className="text-sm text-muted-foreground max-w-md">
                            Registro de uso de bombas por obra. Próximamente.
                        </p>
                    </div>
                )}
            </motion.div>
        </div>
    );
};

export default InventarioPage;

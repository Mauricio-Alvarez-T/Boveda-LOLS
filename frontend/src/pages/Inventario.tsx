import React, { useState, useMemo, useEffect } from 'react';
import { Package, Loader2, Plus } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useInventarioData } from '../hooks/inventario/useInventarioData';
import { useInventarioActions } from '../hooks/inventario/useInventarioActions';
import { useTransferencias } from '../hooks/inventario/useTransferencias';
import ResumenMensualTable from '../components/inventario/ResumenMensualTable';
import StockUbicacionTable from '../components/inventario/StockUbicacionTable';
import TransferenciasList from '../components/inventario/TransferenciasList';
import SolicitudForm from '../components/inventario/SolicitudForm';
import FacturasTab from '../components/inventario/FacturasTab';
import BombasHormigonTab from '../components/inventario/BombasHormigonTab';
import { Modal } from '../components/ui/Modal';

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
    const { obras, selectedObra } = useObra();
    const { resumen, stockObra, loading, fetchResumen, fetchStockObra } = useInventarioData();
    const { updateStock, updateDescuento } = useInventarioActions();
    const trfHook = useTransferencias();
    const [activeTab, setActiveTab] = useState<TabKey>('resumen');
    const [selectedUbicacionId, setSelectedUbicacionId] = useState<number | null>(null);
    const [showSolicitudForm, setShowSolicitudForm] = useState(false);

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

    // Load resumen on mount
    useEffect(() => {
        if (activeTab === 'resumen') fetchResumen();
    }, [activeTab, fetchResumen]);

    // Load stock when obra is selected in the por_ubicacion tab
    useEffect(() => {
        if (activeTab === 'por_ubicacion' && selectedUbicacionId) {
            fetchStockObra(selectedUbicacionId);
        }
    }, [activeTab, selectedUbicacionId, fetchStockObra]);

    // Default selectedUbicacionId to first obra
    useEffect(() => {
        if (!selectedUbicacionId && obras.length > 0) {
            setSelectedUbicacionId(selectedObra?.id || obras[0].id);
        }
    }, [obras, selectedObra, selectedUbicacionId]);

    const allObras = resumen?.obras || obras.map(o => ({ id: o.id, nombre: o.nombre }));

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
                className="bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] p-4 md:p-6"
            >
                {/* ── RESUMEN ── */}
                {activeTab === 'resumen' && (
                    loading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                            <p className="mt-3 text-sm text-muted-foreground">Cargando resumen...</p>
                        </div>
                    ) : resumen && resumen.categorias.length > 0 ? (
                        <ResumenMensualTable data={resumen} />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                            <h3 className="text-base font-bold text-brand-dark mb-2">Sin datos de inventario</h3>
                            <p className="text-sm text-muted-foreground max-w-md">
                                Agrega categorías e ítems desde Configuración para comenzar.
                            </p>
                        </div>
                    )
                )}

                {/* ── POR OBRA/BODEGA ── */}
                {activeTab === 'por_ubicacion' && (
                    <div className="space-y-4">
                        {/* Obra selector */}
                        <div className="flex items-center gap-3">
                            <label className="text-xs font-bold text-brand-dark">Obra:</label>
                            <select
                                value={selectedUbicacionId || ''}
                                onChange={e => setSelectedUbicacionId(Number(e.target.value))}
                                className="px-3 py-2 text-sm border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                {allObras.map(o => (
                                    <option key={o.id} value={o.id}>{o.nombre}</option>
                                ))}
                            </select>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                                <p className="mt-3 text-sm text-muted-foreground">Cargando stock...</p>
                            </div>
                        ) : stockObra ? (
                            <StockUbicacionTable
                                data={stockObra}
                                canEdit={hasPermission('inventario.editar')}
                                onUpdateStock={updateStock}
                                onUpdateDescuento={updateDescuento}
                                onRefresh={() => selectedUbicacionId && fetchStockObra(selectedUbicacionId)}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                                <p className="text-sm text-muted-foreground">Selecciona una obra para ver su stock.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TRANSFERENCIAS ── */}
                {activeTab === 'transferencias' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-brand-dark">Transferencias</h3>
                            {hasPermission('inventario.crear') && (
                                <button
                                    onClick={() => setShowSolicitudForm(true)}
                                    className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all"
                                >
                                    <Plus className="h-3.5 w-3.5" /> Nueva Solicitud
                                </button>
                            )}
                        </div>
                        <TransferenciasList
                            transferencias={trfHook.transferencias}
                            loading={trfHook.loading}
                            onSelect={(t) => trfHook.fetchById(t.id)}
                            onRefresh={() => trfHook.fetchAll()}
                        />
                        <Modal
                            isOpen={showSolicitudForm}
                            onClose={() => setShowSolicitudForm(false)}
                            title="Nueva Solicitud de Transferencia"
                        >
                            <SolicitudForm
                                obras={allObras as any}
                                onCrear={async (data) => {
                                    const result = await trfHook.crear(data);
                                    if (result) trfHook.fetchAll();
                                    return result;
                                }}
                                onClose={() => setShowSolicitudForm(false)}
                            />
                        </Modal>
                    </div>
                )}
                {activeTab === 'facturas' && (
                    <FacturasTab
                        canCreate={hasPermission('inventario.crear')}
                        canDelete={hasPermission('inventario.eliminar')}
                    />
                )}
                {activeTab === 'bombas' && (
                    <BombasHormigonTab
                        obras={allObras as any}
                        canCreate={hasPermission('inventario.crear')}
                    />
                )}
            </motion.div>
        </div>
    );
};

export default InventarioPage;

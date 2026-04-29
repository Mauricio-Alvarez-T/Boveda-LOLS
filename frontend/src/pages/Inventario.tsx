import React, { useState, useMemo, useEffect } from 'react';
import { Package, Loader2, Download, Warehouse, MapPin } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../utils/cn';
import { useAuth } from '../context/AuthContext';
import { useObra } from '../context/ObraContext';
import { useSetPageHeader } from '../context/PageHeaderContext';
import { useInventarioData } from '../hooks/inventario/useInventarioData';
import { useInventarioActions } from '../hooks/inventario/useInventarioActions';
import ResumenMensualTable from '../components/inventario/ResumenMensualTable';
import StockUbicacionTable from '../components/inventario/StockUbicacionTable';
import TransferenciasPanel from '../components/inventario/TransferenciasPanel';
import ResumenEjecutivoPanel from '../components/inventario/ResumenEjecutivoPanel';

import BombasHormigonTab from '../components/inventario/BombasHormigonTab';
import InventarioMaestroGrid from '../components/inventario/InventarioMaestroGrid';
import StockMaestroGrid from '../components/inventario/StockMaestroGrid';
import { exportStockObra } from '../utils/exportExcel';
import type { StockObraData } from '../hooks/inventario/useInventarioData';

type TabKey = 'resumen_ejecutivo' | 'resumen' | 'por_ubicacion' | 'transferencias' | 'maestro' | 'bombas';

const tabs: { key: TabKey; label: string; requiresPerm?: string }[] = [
    { key: 'resumen_ejecutivo', label: 'Resumen Ejecutivo' },
    { key: 'resumen', label: 'Resumen' },
    { key: 'por_ubicacion', label: 'Por Obra/Bodega' },
    { key: 'transferencias', label: 'Transferencias' },
    { key: 'maestro', label: 'Maestro', requiresPerm: 'inventario.editar' },
    { key: 'bombas', label: 'Bombas Hormigón' },
];

type UbicacionOption = { id: number; nombre: string; type: 'obra' | 'bodega'; key: string };

const InventarioPage: React.FC = () => {
    const { hasPermission } = useAuth();
    const { obras, selectedObra } = useObra();
    const { resumen, stockObra, stockBodega, loading, fetchResumen, fetchStockObra, fetchStockBodega } = useInventarioData();
    const { updateStock, updateDescuento } = useInventarioActions();
    const [activeTab, setActiveTab] = useState<TabKey>('resumen_ejecutivo');
    const [maestroSubTab, setMaestroSubTab] = useState<'items' | 'stock'>('items');
    const [selectedUbicacionKey, setSelectedUbicacionKey] = useState<string>('');
    // Intent de navegación desde el Resumen Ejecutivo hacia Transferencias.
    // Se consume como props iniciales del Panel; cambia de valor fuerza remount via `key`.
    const [trfNavIntent, setTrfNavIntent] = useState<{ estado?: string; id?: number | null; nonce: number }>({ nonce: 0 });

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

    // ── Ubicaciones: bodegas first, then obras ──
    // Solo obras que participan del módulo inventario.
    // Si resumen ya llegó usa esa lista (filtrada server-side); durante la carga inicial
    // cae al contexto global de obras filtrado client-side.
    const allObras = resumen?.obras || obras
        .filter(o => o.participa_inventario !== false)
        .map(o => ({ id: o.id, nombre: o.nombre }));
    const allBodegas = resumen?.bodegas || [];

    const allUbicaciones = useMemo<UbicacionOption[]>(() => {
        const bods = allBodegas.map(b => ({ ...b, type: 'bodega' as const, key: `bodega_${b.id}` }));
        const obs = allObras.map(o => ({ ...o, type: 'obra' as const, key: `obra_${o.id}` }));
        return [...bods, ...obs];
    }, [allObras, allBodegas]);

    const selectedUbicacion = allUbicaciones.find(u => u.key === selectedUbicacionKey) || null;

    // ── Default selection: user's obra context, or first available ──
    useEffect(() => {
        if (!selectedUbicacionKey && allUbicaciones.length > 0) {
            const obraKey = selectedObra ? `obra_${selectedObra.id}` : null;
            const match = obraKey && allUbicaciones.find(u => u.key === obraKey);
            setSelectedUbicacionKey(match ? match.key : allUbicaciones[0].key);
        }
    }, [allUbicaciones, selectedObra, selectedUbicacionKey]);

    // ── Load resumen: también necesario para 'por_ubicacion' (bodegas vienen de resumen.bodegas) ──
    useEffect(() => {
        if (activeTab === 'resumen' || activeTab === 'por_ubicacion') fetchResumen();
    }, [activeTab, fetchResumen]);

    // ── Load stock when ubicacion selected ──
    useEffect(() => {
        if (activeTab === 'por_ubicacion' && selectedUbicacion) {
            if (selectedUbicacion.type === 'bodega') {
                fetchStockBodega(selectedUbicacion.id);
            } else {
                fetchStockObra(selectedUbicacion.id);
            }
        }
    }, [activeTab, selectedUbicacionKey, fetchStockObra, fetchStockBodega]);

    // ── Normalize stock data for StockUbicacionTable ──
    const isBodega = selectedUbicacion?.type === 'bodega';
    const currentStockData: StockObraData | null = useMemo(() => {
        if (isBodega && stockBodega) {
            return {
                obra: stockBodega.bodega,
                categorias: stockBodega.categorias,
                total_facturacion: 0,
                descuento_porcentaje: 0,
                descuento_monto: 0,
                total_con_descuento: 0,
            };
        }
        return stockObra;
    }, [isBodega, stockBodega, stockObra]);

    return (
        <div className="flex flex-col flex-1 min-h-0 gap-4">
            {/* Tab Navigation */}
            <div className="sticky top-0 z-30 -mx-3 md:-mx-5 px-3 md:px-5 py-2 bg-background shrink-0">
                <div className="flex items-center gap-1 p-1.5 bg-white/95 backdrop-blur-xl rounded-2xl border border-[#E8E8ED] overflow-x-auto scrollbar-none shadow-sm">
                {tabs.filter(t => !t.requiresPerm || hasPermission(t.requiresPerm)).map(tab => (
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
            </div>

            {/* Tab Content */}
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="bg-white border border-[#E2E2E7] rounded-3xl shadow-[0_10px_40px_rgb(0,0,0,0.08)] p-4 md:p-6 flex-1 min-h-0 flex flex-col"
            >
                {/* ── RESUMEN EJECUTIVO ── */}
                {activeTab === 'resumen_ejecutivo' && (
                    <ResumenEjecutivoPanel
                        onNavigateTransferencias={({ estado, transferenciaId }) => {
                            setTrfNavIntent({ estado, id: transferenciaId ?? null, nonce: Date.now() });
                            setActiveTab('transferencias');
                        }}
                        onNavigateObra={(obraId) => {
                            setSelectedUbicacionKey(`obra_${obraId}`);
                            setActiveTab('por_ubicacion');
                        }}
                    />
                )}

                {/* ── RESUMEN ── */}
                {activeTab === 'resumen' && (
                    loading ? (
                        <div className="flex flex-col items-center justify-center py-16">
                            <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                            <p className="mt-3 text-sm text-muted-foreground">Cargando resumen...</p>
                        </div>
                    ) : resumen && resumen.categorias.length > 0 ? (
                        <ResumenMensualTable
                            data={resumen}
                            canEdit={hasPermission('inventario.editar')}
                            onUpdateStock={updateStock}
                            onRefresh={fetchResumen}
                        />
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
                    <div className="flex flex-col gap-4 flex-1 min-h-0">
                        {/* Ubicacion selector + Export */}
                        <div className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 shrink-0">
                            <label className="text-xs font-bold text-brand-dark flex items-center gap-1.5">
                                {isBodega ? <Warehouse className="h-3.5 w-3.5 text-amber-600" /> : <MapPin className="h-3.5 w-3.5 text-blue-600" />}
                                Ubicación:
                            </label>
                            <select
                                value={selectedUbicacionKey}
                                onChange={e => setSelectedUbicacionKey(e.target.value)}
                                className="w-full md:w-auto px-3 py-2.5 md:py-2 text-sm border border-[#E8E8ED] rounded-xl bg-white focus:ring-2 focus:ring-brand-primary/20 outline-none"
                            >
                                {allBodegas.length > 0 && (
                                    <optgroup label="🏢 Bodegas">
                                        {allBodegas.map(b => (
                                            <option key={`bodega_${b.id}`} value={`bodega_${b.id}`}>
                                                🏢 {b.nombre}
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                <optgroup label="🏗️ Obras">
                                    {allObras.map(o => (
                                        <option key={`obra_${o.id}`} value={`obra_${o.id}`}>
                                            🏗️ {o.nombre}
                                        </option>
                                    ))}
                                </optgroup>
                            </select>
                            {currentStockData && !isBodega && (
                                <button
                                    onClick={() => { exportStockObra(currentStockData); }}
                                    className="flex items-center gap-1.5 px-4 py-2.5 md:py-2 text-xs font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 transition-all shadow-sm"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                    Exportar Excel
                                </button>
                            )}
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-16">
                                <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
                                <p className="mt-3 text-sm text-muted-foreground">Cargando stock...</p>
                            </div>
                        ) : currentStockData ? (
                            <StockUbicacionTable
                                data={currentStockData}
                                canEdit={hasPermission('inventario.editar')}
                                isBodega={isBodega}
                                onUpdateStock={(itemId, ubicId, data) => updateStock(itemId, isBodega ? null : ubicId, isBodega ? ubicId : null, data)}
                                onUpdateDescuento={updateDescuento}
                                onRefresh={() => {
                                    if (selectedUbicacion?.type === 'bodega') fetchStockBodega(selectedUbicacion.id);
                                    else if (selectedUbicacion) fetchStockObra(selectedUbicacion.id);
                                }}
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-center">
                                <Package className="h-12 w-12 text-brand-primary/20 mb-4" />
                                <p className="text-sm text-muted-foreground">Selecciona una ubicación para ver su stock.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* ── TRANSFERENCIAS ── */}
                {activeTab === 'transferencias' && (
                    <TransferenciasPanel
                        // key dependiente del nonce: remonta sólo cuando el dashboard navega con intent nuevo
                        key={`trf-${trfNavIntent.nonce}`}
                        obras={allObras as any}
                        hasPermission={hasPermission}
                        initialStatusFilter={trfNavIntent.estado}
                        initialSelectedId={trfNavIntent.id ?? null}
                    />
                )}

                {activeTab === 'maestro' && (
                    <div className="flex-1 min-h-0 flex flex-col gap-3">
                        {/* Sub-tabs Ítems / Stock */}
                        <div className="flex items-center gap-1 p-1 bg-[#F5F7FA] rounded-xl w-fit shrink-0">
                            {([
                                { key: 'items', label: 'Ítems' },
                                { key: 'stock', label: 'Stock por ubicación' },
                            ] as const).map(st => (
                                <button
                                    key={st.key}
                                    onClick={() => setMaestroSubTab(st.key)}
                                    className={cn(
                                        "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                                        maestroSubTab === st.key
                                            ? "bg-white text-brand-primary shadow-sm"
                                            : "text-muted-foreground hover:text-brand-dark"
                                    )}
                                >
                                    {st.label}
                                </button>
                            ))}
                        </div>
                        {maestroSubTab === 'items' ? (
                            <InventarioMaestroGrid hasEditPermission={hasPermission('inventario.editar')} />
                        ) : (
                            <StockMaestroGrid
                                obras={allObras as any}
                                bodegas={allBodegas as any}
                                hasEditPermission={hasPermission('inventario.editar')}
                            />
                        )}
                    </div>
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

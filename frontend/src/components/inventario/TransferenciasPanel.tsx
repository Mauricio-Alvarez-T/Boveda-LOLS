import React, { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowLeftRight, AlertTriangle, LayoutGrid, Clock, CheckCircle2, PackageCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../utils/cn';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import TransferenciasList from './TransferenciasList';
import TransferenciaDetail from './TransferenciaDetail';
import SolicitudForm from './SolicitudForm';
import MovimientoForm from './MovimientoForm';
import NewMovimientoModal, { type TipoMovimiento } from './NewMovimientoModal';
import DiscrepanciasList from './DiscrepanciasList';
import DiscrepanciaDetail from './DiscrepanciaDetail';

interface Props {
    obras: { id: number; nombre: string }[];
    hasPermission: (p: string) => boolean;
    /**
     * Filtro inicial (solo se aplica al montar). Usado cuando se navega desde el
     * Resumen Ejecutivo. Si cambia el valor, el parent debe forzar remount con `key`.
     */
    initialStatusFilter?: string;
    /**
     * Transferencia que debe abrirse automáticamente al montar. Mismo caveat que
     * initialStatusFilter: solo se aplica al montar.
     */
    initialSelectedId?: number | null;
}

// Mirror of STATUS_CHIPS inside TransferenciasList — kept here so the panel
// can render the same row in discrepancias mode (where the nested list is skipped).
const MAIN_STATUS_CHIPS: { value: string; label: string; shortLabel: string; icon: React.ElementType }[] = [
    { value: 'todas',         label: 'Todas',         shortLabel: 'Todas',    icon: LayoutGrid },
    { value: 'pendiente',     label: 'Pendientes',    shortLabel: 'Pend.',    icon: Clock },
    { value: 'aprobada',      label: 'Aprobadas',     shortLabel: 'Aprob.',   icon: CheckCircle2 },
    { value: 'recibida',      label: 'Recibidas',     shortLabel: 'Recib.',   icon: PackageCheck },
    { value: 'discrepancias', label: 'Discrepancias', shortLabel: 'Discrep.', icon: AlertTriangle },
];

const TransferenciasPanel: React.FC<Props> = ({ obras, hasPermission, initialStatusFilter, initialSelectedId }) => {
    const { user } = useAuth();
    const trfHook = useTransferencias();

    const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'todas');
    const [searchQuery, setSearchQuery] = useState('');
    const [showSelectorModal, setShowSelectorModal] = useState(false);
    const [activeFlow, setActiveFlow] = useState<TipoMovimiento | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    // Discrepancias mode
    const isDiscrepanciasMode = statusFilter === 'discrepancias';
    const [discSubFilter, setDiscSubFilter] = useState<'pendiente' | 'resuelta' | 'descartada'>('pendiente');
    const [discSearchQuery, setDiscSearchQuery] = useState('');
    // Counter for badge (always reflects PENDING discrepancies regardless of subfilter)
    const [pendientesCount, setPendientesCount] = useState(0);

    // Load pending count on mount so the badge shows immediately
    useEffect(() => {
        (async () => {
            const list = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(list.length);
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-open a transferencia if navigated with initialSelectedId (from dashboard)
    useEffect(() => {
        if (initialSelectedId && !isDiscrepanciasMode) {
            trfHook.fetchById(initialSelectedId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fetch list when filter changes
    useEffect(() => {
        if (isDiscrepanciasMode) {
            trfHook.fetchDiscrepancias(discSubFilter).then(list => {
                if (discSubFilter === 'pendiente') setPendientesCount(list.length);
            });
            // Clear regular selection when entering discrepancias mode
            if (selectedId) {
                setSelectedId(null);
                trfHook.setSelected(null);
            }
        } else {
            trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
            // Clear discrepancia selection when leaving
            if (trfHook.selectedDiscrepancia) trfHook.setSelectedDiscrepancia(null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [statusFilter, discSubFilter]);

    // ── Regular transferencia handlers ──
    const handleSelect = useCallback(async (id: number) => {
        setSelectedId(id);
        await trfHook.fetchById(id);
    }, [trfHook.fetchById]);

    const refreshAll = useCallback(async () => {
        await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        if (selectedId) await trfHook.fetchById(selectedId);
    }, [statusFilter, selectedId, trfHook.fetchAll, trfHook.fetchById]);

    const handleAprobar = useCallback(async (data: any) => {
        setActionLoading(true);
        const ok = await trfHook.aprobar(selectedId!, data);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.aprobar, refreshAll]);

    const handleRecibir = useCallback(async (
        items: { item_id: number; cantidad_recibida: number; observacion?: string }[],
        tipo: 'parcial' | 'total' = 'total'
    ) => {
        setActionLoading(true);
        const ok = await trfHook.recibir(selectedId!, items, tipo);
        if (ok) {
            await refreshAll();
            // Refresh pending discrepancies count — recibir() may have created new ones.
            // En modo parcial no se crea discrepancia, pero el refetch es barato.
            const list = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(list.length);
        }
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.recibir, trfHook.fetchDiscrepancias, refreshAll]);

    const handleRechazar = useCallback(async (motivo: string) => {
        setActionLoading(true);
        const ok = await trfHook.rechazar(selectedId!, motivo);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.rechazar, refreshAll]);

    const handleCancelar = useCallback(async () => {
        setActionLoading(true);
        const ok = await trfHook.cancelar(selectedId!);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.cancelar, refreshAll]);

    const handleCrear = useCallback(async (data: any) => {
        const result = await trfHook.crear(data);
        if (result) {
            await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
            // Aterriza en el detail de la solicitud recién creada — UX fluida:
            // el solicitante puede pulsar "Notificar por WhatsApp" sin tener
            // que buscar el código en la lista. Requerimiento jefatura mayo-26.
            setSelectedId(result.id);
            await trfHook.fetchById(result.id);
        }
        return result;
    }, [trfHook.crear, trfHook.fetchAll, trfHook.fetchById, statusFilter]);

    const handleSolicitudMateriales = useCallback(async (data: any) => {
        const result = await trfHook.solicitudMateriales(data);
        if (result) {
            await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
            setSelectedId(result.id);
            await trfHook.fetchById(result.id);
        }
        return result;
    }, [trfHook.solicitudMateriales, trfHook.fetchAll, trfHook.fetchById, statusFilter]);

    const handlePushDirecto = useCallback(async (data: any) => {
        const result = await trfHook.pushDirecto(data);
        if (result) await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        return result;
    }, [trfHook.pushDirecto, trfHook.fetchAll, statusFilter]);

    const handleIntraBodega = useCallback(async (data: any) => {
        const result = await trfHook.intraBodega(data);
        if (result) await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        return result;
    }, [trfHook.intraBodega, trfHook.fetchAll, statusFilter]);

    const handleDevolucion = useCallback(async (data: any) => {
        const result = await trfHook.devolucion(data);
        if (result) await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        return result;
    }, [trfHook.devolucion, trfHook.fetchAll, statusFilter]);

    const handleIntraObra = useCallback(async (data: any) => {
        const result = await trfHook.intraObra(data);
        if (result) await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        return result;
    }, [trfHook.intraObra, trfHook.fetchAll, statusFilter]);

    const handleOrdenGerencia = useCallback(async (data: any) => {
        const result = await trfHook.ordenGerencia(data);
        if (result) await trfHook.fetchAll({ estado: statusFilter === 'todas' ? undefined : statusFilter });
        return result;
    }, [trfHook.ordenGerencia, trfHook.fetchAll, statusFilter]);

    const handleRechazarRecepcion = useCallback(async (motivo: string) => {
        setActionLoading(true);
        const ok = await trfHook.rechazarRecepcion(selectedId!, motivo);
        if (ok) await refreshAll();
        setActionLoading(false);
        return ok;
    }, [selectedId, trfHook.rechazarRecepcion, refreshAll]);

    const handleSelectFlow = useCallback((tipo: TipoMovimiento) => {
        setShowSelectorModal(false);
        setActiveFlow(tipo);
    }, []);

    const closeActiveFlow = useCallback(() => setActiveFlow(null), []);

    // ── Discrepancias handlers ──
    const handleSelectDiscrepancia = useCallback((trf: any) => {
        trfHook.setSelectedDiscrepancia(trf);
    }, [trfHook.setSelectedDiscrepancia]);

    const handleResolverDiscrepancia = useCallback(async (
        id: number, estado: 'resuelta' | 'descartada', resolucion: string
    ) => {
        return await trfHook.resolverDiscrepancia(id, estado, resolucion);
    }, [trfHook.resolverDiscrepancia]);

    const refreshDiscrepancias = useCallback(async () => {
        // Re-fetch current subfilter list
        const list = await trfHook.fetchDiscrepancias(discSubFilter);
        // Re-fetch pending count for the badge
        if (discSubFilter !== 'pendiente') {
            const pend = await trfHook.fetchDiscrepancias('pendiente');
            setPendientesCount(pend.length);
            // re-fetch current again to restore list state
            await trfHook.fetchDiscrepancias(discSubFilter);
        } else {
            setPendientesCount(list.length);
        }
        // Refresh selectedDiscrepancia with fresh data, or clear if it's no longer in the list
        if (trfHook.selectedDiscrepancia) {
            const fresh = list.find((d: any) => d.id === trfHook.selectedDiscrepancia!.id);
            trfHook.setSelectedDiscrepancia(fresh || null);
        }
    }, [discSubFilter, trfHook.fetchDiscrepancias, trfHook.selectedDiscrepancia, trfHook.setSelectedDiscrepancia]);

    // Decide what to render in the detail pane
    const detailPaneActive = isDiscrepanciasMode
        ? !!trfHook.selectedDiscrepancia
        : !!selectedId;

    return (
        <div className="flex flex-col flex-1 min-h-0">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0 mb-3">
                <h3 className="text-sm font-bold text-brand-dark flex items-center gap-2">
                    {isDiscrepanciasMode ? (
                        <>
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                            Discrepancias
                        </>
                    ) : (
                        'Transferencias'
                    )}
                </h3>
                {/* "Nuevo movimiento" visible si tiene AL MENOS UN flujo. El modal
                    interno filtra qué flujos específicos puede ejecutar. */}
                {!isDiscrepanciasMode && (
                    hasPermission('inventario.transferencias.solicitar') ||
                    hasPermission('inventario.transferencias.push_directo') ||
                    hasPermission('inventario.transferencias.intra_bodega') ||
                    hasPermission('inventario.transferencias.orden_gerencia')
                ) && (
                    <button
                        onClick={() => setShowSelectorModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nuevo movimiento
                    </button>
                )}
            </div>

            {/* Master-Detail body — siempre split en desktop (lista sidebar + detail);
                en mobile alterna entre lista y detalle */}
            <div className="flex flex-1 min-h-0 gap-4">
                {/* LEFT: List sidebar — siempre visible en desktop, oculta en mobile cuando hay detalle */}
                <div className={cn(
                    "flex flex-col min-h-0 md:w-[340px] lg:w-[380px] md:shrink-0",
                    detailPaneActive ? "hidden md:flex" : "flex"
                )}>
                    {isDiscrepanciasMode ? (
                        <>
                            {/* Top row: status chips — mobile icon+label / desktop pills */}
                            {/* Mobile */}
                            <div className="flex md:hidden items-center gap-0.5 p-1 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shrink-0 mb-3 shadow-sm">
                                {MAIN_STATUS_CHIPS
                                    .filter(c => c.value !== 'discrepancias' || hasPermission('inventario.transferencias.aprobar'))
                                    .map(chip => {
                                    const isActive = statusFilter === chip.value;
                                    const isDisc = chip.value === 'discrepancias';
                                    const ChipIcon = chip.icon;
                                    return (
                                        <button
                                            key={chip.value}
                                            onClick={() => setStatusFilter(chip.value)}
                                            className={cn(
                                                "relative flex flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 px-1 flex-1 min-w-0 transition-all",
                                                isActive ? "text-white"
                                                    : isDisc && pendientesCount > 0 ? "text-red-600 dark:text-red-400"
                                                    : "text-muted-foreground"
                                            )}
                                        >
                                            {isActive && (
                                                <motion.div
                                                    layoutId="activeDiscChipMobile"
                                                    className={cn("absolute inset-0 rounded-xl shadow-sm", isDisc ? "bg-red-500" : "bg-brand-primary")}
                                                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                                />
                                            )}
                                            <div className="relative z-10 flex items-center">
                                                <ChipIcon className="h-[15px] w-[15px]" />
                                                {isDisc && pendientesCount > 0 && !isActive && (
                                                    <span className="absolute -top-1 -right-2 px-1 py-[1px] rounded-full text-[7px] font-black leading-none bg-red-500 text-white">
                                                        {pendientesCount}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[7px] font-black uppercase tracking-tight relative z-10 leading-none truncate w-full text-center">
                                                {chip.shortLabel}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Desktop: icon + short label stacked (mismo formato que mobile) */}
                            <div className="hidden md:flex items-center gap-1 p-1 bg-card/95 backdrop-blur-xl rounded-2xl border border-border shrink-0 mb-3 shadow-sm">
                                {MAIN_STATUS_CHIPS
                                    .filter(c => c.value !== 'discrepancias' || hasPermission('inventario.transferencias.aprobar'))
                                    .map(chip => {
                                    const isActive = statusFilter === chip.value;
                                    const isDisc = chip.value === 'discrepancias';
                                    const ChipIcon = chip.icon;
                                    return (
                                        <button
                                            key={chip.value}
                                            onClick={() => setStatusFilter(chip.value)}
                                            title={chip.label}
                                            className={cn(
                                                "relative flex flex-col items-center justify-center gap-1 rounded-xl py-2 px-2 flex-1 min-w-0 transition-all",
                                                isActive
                                                    ? isDisc
                                                        ? "bg-red-500 text-white shadow-sm"
                                                        : "bg-brand-primary text-white shadow-sm"
                                                    : isDisc && pendientesCount > 0
                                                        ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
                                                        : "text-muted-foreground hover:bg-background hover:text-brand-dark"
                                            )}
                                        >
                                            <div className="relative flex items-center">
                                                <ChipIcon className="h-[18px] w-[18px]" />
                                                {isDisc && pendientesCount > 0 && !isActive && (
                                                    <span className="absolute -top-1.5 -right-2.5 px-1 py-[1px] rounded-full text-[8px] font-black leading-none bg-red-500 text-white">
                                                        {pendientesCount}
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-tight leading-none truncate w-full text-center">
                                                {chip.shortLabel}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                            {/* Discrepancias list (with its own sub-filter and search) */}
                            <DiscrepanciasList
                                discrepancias={trfHook.discrepancias}
                                loading={trfHook.loading}
                                selectedId={trfHook.selectedDiscrepancia?.id || null}
                                onSelect={handleSelectDiscrepancia}
                                subFilter={discSubFilter}
                                onSubFilterChange={setDiscSubFilter}
                                searchQuery={discSearchQuery}
                                onSearchChange={setDiscSearchQuery}
                            />
                        </>
                    ) : (
                        <TransferenciasList
                            transferencias={trfHook.transferencias}
                            loading={trfHook.loading}
                            selectedId={selectedId}
                            onSelect={handleSelect}
                            statusFilter={statusFilter}
                            onStatusFilterChange={setStatusFilter}
                            searchQuery={searchQuery}
                            onSearchChange={setSearchQuery}
                            discrepanciasCount={pendientesCount}
                            canVerDiscrepancias={hasPermission('inventario.transferencias.aprobar')}
                        />
                    )}
                </div>

                {/* RIGHT: Detail — siempre visible en desktop, en mobile solo con selección */}
                <div className={cn(
                    "flex-1 min-h-0",
                    detailPaneActive ? "flex flex-col" : "hidden md:flex md:flex-col"
                )}>
                    {isDiscrepanciasMode ? (
                        trfHook.selectedDiscrepancia ? (
                            <DiscrepanciaDetail
                                discrepancia={trfHook.selectedDiscrepancia}
                                canEdit={hasPermission('inventario.editar')}
                                onBack={() => trfHook.setSelectedDiscrepancia(null)}
                                onResolver={handleResolverDiscrepancia}
                                onRefresh={refreshDiscrepancias}
                            />
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <AlertTriangle className="h-10 w-10 text-red-500/15 mb-3" />
                                <p className="text-sm font-medium text-muted-foreground">Selecciona una discrepancia</p>
                                <p className="text-xs text-muted-foreground/60 mt-1">para ver los ítems afectados</p>
                            </div>
                        )
                    ) : trfHook.selected ? (
                        <TransferenciaDetail
                            transferencia={trfHook.selected}
                            obras={obras}
                            actionLoading={actionLoading}
                            hasPermission={hasPermission}
                            userId={user?.id || 0}
                            onBack={() => { setSelectedId(null); trfHook.setSelected(null); }}
                            onFetchStock={trfHook.fetchStockPorItems}
                            onAprobar={handleAprobar}
                            onCrearFaltante={trfHook.crearFaltante}
                            onRecibir={handleRecibir}
                            onFetchRecepciones={trfHook.fetchRecepciones}
                            onRechazar={handleRechazar}
                            onRechazarRecepcion={handleRechazarRecepcion}
                            onCancelar={handleCancelar}
                        />
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center">
                            <ArrowLeftRight className="h-10 w-10 text-brand-primary/15 mb-3" />
                            <p className="text-sm font-medium text-muted-foreground">Selecciona una transferencia</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">para ver su detalle y acciones</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Selector de tipo de movimiento */}
            <NewMovimientoModal
                isOpen={showSelectorModal}
                onClose={() => setShowSelectorModal(false)}
                onSelect={handleSelectFlow}
                hasPermission={hasPermission}
            />

            {/* Solicitud estándar (existente) */}
            <Modal
                isOpen={activeFlow === 'solicitud'}
                onClose={closeActiveFlow}
                title="Nueva Solicitud de Transferencia"
                size="full"
            >
                <SolicitudForm
                    obras={obras}
                    onCrear={handleCrear}
                    onClose={closeActiveFlow}
                />
            </Modal>

            {/* Solicitud de materiales (reusa SolicitudForm sin catálogo) */}
            <Modal
                isOpen={activeFlow === 'solicitud_materiales'}
                onClose={closeActiveFlow}
                title="Solicitud de Materiales de Construcción"
                size="lg"
            >
                <SolicitudForm
                    obras={obras}
                    onCrear={handleSolicitudMateriales}
                    onClose={closeActiveFlow}
                    hideCatalog
                />
            </Modal>

            {/* Push directo */}
            <Modal
                isOpen={activeFlow === 'push_directo'}
                onClose={closeActiveFlow}
                title="Push directo"
                size="lg"
            >
                <MovimientoForm
                    flujo="push_directo"
                    obras={obras}
                    onSubmit={handlePushDirecto}
                    onClose={closeActiveFlow}
                />
            </Modal>

            {/* Intra-bodega */}
            <Modal
                isOpen={activeFlow === 'intra_bodega'}
                onClose={closeActiveFlow}
                title="Movimiento intra-bodega"
                size="lg"
            >
                <MovimientoForm
                    flujo="intra_bodega"
                    obras={obras}
                    onSubmit={handleIntraBodega}
                    onClose={closeActiveFlow}
                />
            </Modal>

            {/* Devolución */}
            <Modal
                isOpen={activeFlow === 'devolucion'}
                onClose={closeActiveFlow}
                title="Devolución de obra a bodega"
                size="lg"
            >
                <MovimientoForm
                    flujo="devolucion"
                    obras={obras}
                    onSubmit={handleDevolucion}
                    onClose={closeActiveFlow}
                />
            </Modal>

            {/* Intra-obra */}
            <Modal
                isOpen={activeFlow === 'intra_obra'}
                onClose={closeActiveFlow}
                title="Traslado intra-obra"
                size="lg"
            >
                <MovimientoForm
                    flujo="intra_obra"
                    obras={obras}
                    onSubmit={handleIntraObra}
                    onClose={closeActiveFlow}
                />
            </Modal>

            {/* Orden de gerencia */}
            <Modal
                isOpen={activeFlow === 'orden_gerencia'}
                onClose={closeActiveFlow}
                title="Orden de gerencia"
                size="lg"
            >
                <MovimientoForm
                    flujo="orden_gerencia"
                    obras={obras}
                    onSubmit={handleOrdenGerencia}
                    onClose={closeActiveFlow}
                />
            </Modal>
        </div>
    );
};

export default TransferenciasPanel;

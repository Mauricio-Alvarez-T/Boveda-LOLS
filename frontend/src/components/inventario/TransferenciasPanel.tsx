import React, { useState, useCallback, useEffect } from 'react';
import { Plus, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useTransferencias } from '../../hooks/inventario/useTransferencias';
import { useAuth } from '../../context/AuthContext';
import { Modal } from '../ui/Modal';
import TransferenciasList from './TransferenciasList';
import TransferenciaDetail from './TransferenciaDetail';
import SolicitudForm from './SolicitudForm';
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
const MAIN_STATUS_CHIPS: { value: string; label: string }[] = [
    { value: 'todas', label: 'Todas' },
    { value: 'pendiente', label: 'Pendientes' },
    { value: 'aprobada', label: 'Aprobadas' },
    { value: 'recibida', label: 'Recibidas' },
    { value: 'discrepancias', label: 'Discrepancias' },
];

const TransferenciasPanel: React.FC<Props> = ({ obras, hasPermission, initialStatusFilter, initialSelectedId }) => {
    const { user } = useAuth();
    const trfHook = useTransferencias();

    const [selectedId, setSelectedId] = useState<number | null>(initialSelectedId ?? null);
    const [statusFilter, setStatusFilter] = useState(initialStatusFilter || 'todas');
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
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

    const handleRecibir = useCallback(async (items: { item_id: number; cantidad_recibida: number; observacion?: string }[]) => {
        setActionLoading(true);
        const ok = await trfHook.recibir(selectedId!, items);
        if (ok) {
            await refreshAll();
            // Refresh pending discrepancies count — recibir() may have created new ones
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
        }
        return result;
    }, [trfHook.crear, trfHook.fetchAll, statusFilter]);

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
                {!isDiscrepanciasMode && hasPermission('inventario.crear') && (
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-brand-primary rounded-xl hover:bg-brand-primary/90 transition-all shadow-lg shadow-brand-primary/20"
                    >
                        <Plus className="h-3.5 w-3.5" /> Nueva Solicitud
                    </button>
                )}
            </div>

            {/* Master-Detail body */}
            <div className="flex flex-1 min-h-0 gap-4">
                {/* LEFT: List */}
                <div className={cn(
                    "flex flex-col min-h-0",
                    detailPaneActive ? "hidden md:flex" : "flex",
                    "w-full md:w-[360px] md:shrink-0"
                )}>
                    {isDiscrepanciasMode ? (
                        <>
                            {/* Top row: status chips (same as regular list, so user can switch back) */}
                            <div className="flex gap-1.5 overflow-x-auto scrollbar-none shrink-0 mb-3 pb-1">
                                {MAIN_STATUS_CHIPS.map(chip => {
                                    const isActive = statusFilter === chip.value;
                                    const isDisc = chip.value === 'discrepancias';
                                    return (
                                        <button
                                            key={chip.value}
                                            onClick={() => setStatusFilter(chip.value)}
                                            className={cn(
                                                "flex items-center gap-1 px-3 py-1.5 rounded-full text-[10px] font-bold whitespace-nowrap border transition-all shrink-0",
                                                isActive
                                                    ? isDisc
                                                        ? "bg-red-500 text-white border-red-500 shadow-sm"
                                                        : "bg-brand-primary text-white border-brand-primary shadow-sm"
                                                    : isDisc && pendientesCount > 0
                                                        ? "bg-red-50 text-red-700 border-red-200 hover:border-red-300"
                                                        : "bg-white text-muted-foreground border-[#E8E8ED] hover:border-brand-primary/30"
                                            )}
                                        >
                                            {isDisc && <AlertTriangle className="h-2.5 w-2.5" />}
                                            <span>{chip.label}</span>
                                            {isDisc && pendientesCount > 0 && (
                                                <span className={cn(
                                                    "ml-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black leading-none",
                                                    isActive ? "bg-white/25 text-white" : "bg-red-500 text-white"
                                                )}>
                                                    {pendientesCount}
                                                </span>
                                            )}
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
                        />
                    )}
                </div>

                {/* RIGHT: Detail */}
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
                            onRecibir={handleRecibir}
                            onRechazar={handleRechazar}
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

            {/* Creation modal */}
            <Modal
                isOpen={showCreateModal}
                onClose={() => setShowCreateModal(false)}
                title="Nueva Solicitud de Transferencia"
                size="full"
            >
                <SolicitudForm
                    obras={obras}
                    onCrear={handleCrear}
                    onClose={() => setShowCreateModal(false)}
                />
            </Modal>
        </div>
    );
};

export default TransferenciasPanel;
